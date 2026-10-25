import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { hashPassword, verifyPassword } from './passwordService.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendAccountVerificationEmail, sendRegistrationConfirmationEmail } from './emailService.js';
import { logger } from '../config/logger.js';


/**
 * Sanitizes a user object to guarantee passwordHash and internal credentials are never exposed
 * @param {object} user 
 * @returns {object}
 */
export const sanitizeUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    city: user.city,
    role: user.role,
    emailVerified: user.emailVerified,
    isArchived: Boolean(user.isArchived),
    archivedAt: user.archivedAt ? user.archivedAt.toISOString() : null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
};

/**
 * Register a new customer account
 * @param {object} input 
 * @returns {Promise<{ user: object, rawVerificationToken: string, emailDelivery: object }>}
 */
export const registerUser = async (input) => {
  const normalizedEmail = input.email.trim().toLowerCase();

  // 1. Check for existing account
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (existingUser) {
    throw new AppError(
      'An account with this email address already exists.',
      409,
      'EMAIL_ALREADY_EXISTS'
    );
  }

  // 2. Hash password with Argon2id
  const passwordHash = await hashPassword(input.password);

  // 3. Generate single-use cryptographic email verification token
  const rawVerificationToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

  // 4. Atomic user creation and auth_token record
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        city: input.city?.trim() || null,
        role: 'CUSTOMER',
        emailVerified: false,
        isArchived: false
      }
    });

    await tx.authToken.create({
      data: {
        userId: newUser.id,
        tokenHash,
        purpose: 'EMAIL_VERIFICATION',
        expiresAt
      }
    });

    return newUser;
  }, {
    timeout: 30000,
    maxWait: 15000
  });

  // 5. Dispatch combined Welcome & Registration Confirmation email
  // Safe failure guarantee: Upstream email delivery issues NEVER fail account registration!
  let emailDelivery = { success: false, isMock: true, provider: 'MOCK' };
  try {
    const deliveryRes = await sendRegistrationConfirmationEmail({
      to: normalizedEmail,
      fullName: input.fullName,
      rawVerificationToken
    });
    emailDelivery = {
      success: deliveryRes.success,
      isMock: deliveryRes.isMock ?? true,
      messageId: deliveryRes.messageId
    };
  } catch (emailErr) {
    logger.error({
      msg: 'Non-fatal email delivery error during account registration',
      error: emailErr.message,
      email: normalizedEmail
    });
  }

  return {
    user: sanitizeUser(user),
    rawVerificationToken,
    emailDelivery
  };
};



/**
 * Authenticate customer credentials
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<object>} Sanitized authenticated user
 */
export const authenticateUser = async (email, password) => {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Retrieve user
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  // Generic credential error to avoid email enumeration. Archived accounts cannot authenticate.
  if (!user || user.isArchived) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  // 2. Verify Argon2id password hash
  const isValid = await verifyPassword(user.passwordHash, password);
  if (!isValid) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  // 3. Update last login timestamp
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  return sanitizeUser(updatedUser);
};

/**
 * Verify customer email address using verification token
 * @param {string} token 
 * @returns {Promise<{ message: string, email: string }>}
 */
export const verifyUserEmail = async (token) => {
  if (!token || typeof token !== 'string') {
    throw new AppError('Invalid or expired verification token.', 400, 'INVALID_TOKEN');
  }

  // Hash candidate token with SHA-256 for constant-time lookup
  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

  const tokenRecord = await prisma.authToken.findFirst({
    where: {
      tokenHash,
      purpose: 'EMAIL_VERIFICATION'
    },
    include: {
      user: true
    }
  });

  // Differentiate token errors for clear user feedback while maintaining INVALID_TOKEN error code
  if (!tokenRecord) {
    throw new AppError('Invalid verification token. Please check the link or request a new verification link.', 400, 'INVALID_TOKEN');
  }
  if (tokenRecord.usedAt !== null) {
    throw new AppError('This verification link has already been used. Please sign in or request a new link.', 400, 'INVALID_TOKEN');
  }
  if (tokenRecord.expiresAt < new Date()) {
    throw new AppError('This verification link has expired (links are valid for 24 hours). Please request a new verification link.', 400, 'INVALID_TOKEN');
  }

  // Atomic update: mark token used and user email verified
  await prisma.$transaction([
    prisma.authToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() }
    }),
    prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { emailVerified: true }
    })
  ]);

  return {
    message: 'Email verified successfully.',
    email: tokenRecord.user.email
  };
};

/**
 * Retrieve user by primary key
 * @param {string} id 
 * @returns {Promise<object|null>}
 */
export const getUserById = async (id) => {
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id }
  });
  return sanitizeUser(user);
};

/**
 * Resend email verification token securely
 * Generates a fresh token and invalidates any previous unexpired verification tokens.
 * @param {string} email
 * @returns {Promise<{ alreadyVerified: boolean, rawVerificationToken: string|null, email: string, emailDelivery: object }>}
 */
export const resendVerificationEmail = async (email) => {
  if (!email || typeof email !== 'string') {
    throw new AppError('Email address is required.', 400, 'EMAIL_REQUIRED');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    // Return gracefully to prevent email enumeration attacks
    return { 
      alreadyVerified: false, 
      rawVerificationToken: null, 
      email: normalizedEmail,
      emailDelivery: { isMock: true, success: true }
    };
  }

  if (user.emailVerified) {
    return { 
      alreadyVerified: true, 
      rawVerificationToken: null, 
      email: normalizedEmail,
      emailDelivery: { isMock: true, success: true }
    };
  }

  const rawVerificationToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

  // Invalidate previous unexpired verification tokens for this user
  await prisma.authToken.updateMany({
    where: {
      userId: user.id,
      purpose: 'EMAIL_VERIFICATION',
      usedAt: null
    },
    data: {
      usedAt: new Date()
    }
  });

  // Create new active token
  await prisma.authToken.create({
    data: {
      userId: user.id,
      tokenHash,
      purpose: 'EMAIL_VERIFICATION',
      expiresAt
    }
  });

  // Dispatch email notification via configured provider (MockEmailProvider in dev/test)
  let emailDelivery = { success: false, isMock: true };
  try {
    const delivery = await sendAccountVerificationEmail({
      to: normalizedEmail,
      fullName: user.fullName,
      rawVerificationToken
    });
    emailDelivery = {
      success: delivery.success,
      isMock: delivery.isMock ?? true,
      messageId: delivery.messageId
    };
  } catch (err) {
    logger.error({
      msg: 'Non-fatal error resending verification email',
      error: err.message,
      email: normalizedEmail
    });
  }

  return {
    alreadyVerified: false,
    rawVerificationToken,
    email: normalizedEmail,
    emailDelivery
  };
};



