import { getUserById } from '../services/authService.js';
import { AppError } from './errorHandler.js';
import { env } from '../config/env.js';

/**
 * Middleware: Requires an active, authenticated server session
 */
export const requireAuth = async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        status: 'error',
        code: 'UNAUTHENTICATED',
        message: 'Authentication required to access this resource.'
      });
    }

    // Load full user from database
    const user = await getUserById(req.session.userId);
    if (!user || user.isArchived) {
      // Session refers to a deleted or archived user: destroy session
      req.session.destroy(() => {});
      return res.status(401).json({
        status: 'error',
        code: 'UNAUTHENTICATED',
        message: 'Session invalid or account no longer active.'
      });
    }

    // Attach sanitized user to request context
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware: Optional session authentication.
 * Populates req.user if an active session exists, but allows unauthenticated visitors through.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    if (req.session && req.session.userId) {
      const user = await getUserById(req.session.userId);
      if (user && !user.isArchived) {
        req.user = user;
      }
    }
    next();
  } catch {
    next();
  }
};

/**
 * Middleware: Requires specific role(s) (e.g., ADMIN)
 * @param  {...string} allowedRoles 
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

/**
 * Middleware: Enforces verified email policy
 * NOTE: Mandatory email verification is temporarily paused to allow ongoing feature development.
 * Unverified users are permitted to access customer functionality.
 * The original check is preserved below for future re-enabling.
 */
export const requireVerifiedEmail = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHENTICATED',
      message: 'Authentication required.'
    });
  }

  // TEMPORARILY PAUSED: Mandatory email verification check is bypassed.
  // if (!req.user.emailVerified) {
  //   return res.status(403).json({
  //     status: 'error',
  //     code: 'EMAIL_NOT_VERIFIED',
  //     message: 'Email verification is required to complete this action.'
  //   });
  // }

  next();
};

/**
 * Middleware: Defense-in-depth CSRF verification
 * Verifies Origin on mutating requests (POST, PUT, PATCH, DELETE)
 */
export const verifyOrigin = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Webhook endpoints are authenticated via cryptographic signatures, not browser Origin
  if (req.originalUrl && req.originalUrl.includes('/webhook')) {
    return next();
  }

  const origin = req.headers.origin;
  if (!origin) {
    // Same-origin browser requests or non-browser test runner
    return next();
  }

  const host = req.headers.host;
  const localDevOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001'
  ];

  const allowed = [
    env.CLIENT_URL,
    ...(env.NODE_ENV !== 'production' ? localDevOrigins : [])
  ].filter(Boolean);

  try {
    const originUrl = new URL(origin);
    const isMatchingHost = originUrl.host === host;
    const isAllowedOrigin = allowed.includes(origin);

    if (!isMatchingHost && !isAllowedOrigin) {
      return res.status(403).json({
        status: 'error',
        code: 'CSRF_REJECTED',
        message: 'Cross-origin request blocked by CSRF protection.'
      });
    }
  } catch {
    return res.status(403).json({
      status: 'error',
      code: 'CSRF_REJECTED',
      message: 'Invalid origin header.'
    });
  }

  next();
};

