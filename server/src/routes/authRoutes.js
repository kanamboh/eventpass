import { Router } from 'express';
import {
  register,
  login,
  logout,
  getMe,
  verifyEmail,
  resendVerification,
  getDevVerificationToken
} from '../controllers/authController.js';
import { authRateLimiter, verifyRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Registration with dedicated rate limiting
router.post('/register', authRateLimiter, register);

// Login with dedicated rate limiting and session regeneration
router.post('/login', authRateLimiter, login);

// Logout and session invalidation
router.post('/logout', logout);

// Current user inspection
router.get('/me', getMe);

// Email verification with dedicated rate limiting
router.post('/verify-email', verifyRateLimiter, verifyEmail);

// Resend email verification link with dedicated rate limiting
router.post('/resend-verification', verifyRateLimiter, resendVerification);

// Development-only testing helper
router.post('/dev-token', getDevVerificationToken);

export default router;
