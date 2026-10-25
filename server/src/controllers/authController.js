import { registerSchema, loginSchema, verifyEmailSchema, resendVerificationSchema } from '../validators/authValidators.js';
import { registerUser, authenticateUser, verifyUserEmail, resendVerificationEmail, getUserById } from '../services/authService.js';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import crypto from 'crypto';

/**
 * POST /api/auth/register
 * Register a new customer account
 */
export const register = async (req, res, next) => {
  try {
    if (env.REGISTRATION_ENABLED === false) {
      return res.status(403).json({
        status: 'error',
        code: 'REGISTRATION_DISABLED',
        message: 'Public account registration is currently disabled.'
      });
    }

    const validatedData = registerSchema.parse(req.body);
    const { user, rawVerificationToken, emailDelivery } = await registerUser(validatedData);

    const response = {
      status: 'success',
      message: 'Account created successfully.',
      user,
      emailDelivery: {
        isMock: Boolean(emailDelivery?.isMock),
        success: Boolean(emailDelivery?.success)
      }
    };

    // Safe development-only verification token helper (strictly blocked in production)
    if (env.NODE_ENV === 'development') {
      response._devVerificationToken = rawVerificationToken;
    }

    return res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};


/**
 * POST /api/auth/login
 * Authenticate customer credentials and establish a secure server-side session
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await authenticateUser(email, password);

    // Session Fixation Prevention: Regenerate session on authentication boundary
    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.userId = user.id;
      req.session.role = user.role;

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);

        return res.status(200).json({
          status: 'success',
          message: 'Logged in successfully.',
          user
        });
      });
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 * Invalidate server session and destroy session cookie
 */
export const logout = async (req, res, next) => {
  try {
    if (!req.session) {
      return res.status(200).json({
        status: 'success',
        message: 'Logged out successfully.'
      });
    }

    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('eventpass.sid');
      return res.status(200).json({
        status: 'success',
        message: 'Logged out successfully.'
      });
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 * Retrieve the current authenticated user context
 */
export const getMe = async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        status: 'error',
        code: 'UNAUTHENTICATED',
        message: 'Not authenticated.'
      });
    }

    const user = await getUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      res.clearCookie('eventpass.sid');
      return res.status(401).json({
        status: 'error',
        code: 'UNAUTHENTICATED',
        message: 'Session invalid or user account no longer exists.'
      });
    }

    return res.status(200).json({
      status: 'success',
      user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/verify-email
 * Complete email verification via single-use cryptographic token
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = verifyEmailSchema.parse(req.body);
    const result = await verifyUserEmail(token);

    // If currently logged in as this user, refresh their session data
    if (req.session && req.session.userId) {
      const currentUser = await getUserById(req.session.userId);
      return res.status(200).json({
        status: 'success',
        message: result.message,
        user: currentUser
      });
    }

    return res.status(200).json({
      status: 'success',
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/resend-verification
 * Resend email verification link with a newly generated single-use token
 */
export const resendVerification = async (req, res, next) => {
  try {
    const validatedData = resendVerificationSchema.parse(req.body);

    // Use explicitly provided email; if omitted and session is active, fallback to session user email
    let targetEmail = validatedData.email;
    if (!targetEmail && req.session && req.session.userId) {
      const currentUser = await getUserById(req.session.userId);
      if (currentUser?.email) {
        targetEmail = currentUser.email;
      }
    }

    if (!targetEmail) {
      return res.status(400).json({
        status: 'error',
        code: 'EMAIL_REQUIRED',
        message: 'Email address is required.'
      });
    }

    const { alreadyVerified, rawVerificationToken, emailDelivery } = await resendVerificationEmail(targetEmail);

    if (alreadyVerified) {
      return res.status(200).json({
        status: 'success',
        code: 'ALREADY_VERIFIED',
        message: 'Your email address is already verified.'
      });
    }

    const response = {
      status: 'success',
      message: 'If an account exists with this email, a verification link has been sent.',
      emailDelivery: {
        isMock: Boolean(emailDelivery?.isMock),
        success: Boolean(emailDelivery?.success)
      }
    };

    // Safe dev helper strictly limited to local development
    if (env.NODE_ENV === 'development' && rawVerificationToken) {
      response._devVerificationToken = rawVerificationToken;
    }

    return res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};


/**
 * POST /api/auth/dev-mock-token (strictly disabled outside development)
 * Generates or retrieves the raw verification token for testing
 */
export const getDevVerificationToken = async (req, res, next) => {
  if (env.NODE_ENV !== 'development') {
    return res.status(404).json({ status: 'error', message: 'Not found' });
  }

  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Email required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }
    });

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // In development testing, create a fresh known token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash,
        purpose: 'EMAIL_VERIFICATION',
        expiresAt
      }
    });

    return res.status(200).json({
      status: 'success',
      devVerificationToken: rawToken
    });
  } catch (error) {
    next(error);
  }
};
