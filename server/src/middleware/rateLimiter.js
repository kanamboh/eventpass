import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests from this IP, please try again later.'
  }
});

// Stricter rate limiting on authentication attempts (login/register)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 100 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.'
  }
});

// Stricter rate limiting on verification attempts
export const verifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'VERIFY_RATE_LIMIT_EXCEEDED',
    message: 'Too many verification attempts from this IP. Please try again after 15 minutes.'
  }
});

// Rate limiting on reservation creation & cancellation
export const reservationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 120 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RESERVATION_RATE_LIMIT_EXCEEDED',
    message: 'Too many reservation requests from this IP. Please try again in a few minutes.'
  }
});

// Rate limiting on promo code validation
export const promoRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 120 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'PROMO_RATE_LIMIT_EXCEEDED',
    message: 'Too many promo code validation attempts from this IP. Please try again in a few minutes.'
  }
});

// Rate limiting on order creation
export const orderRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 60 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'ORDER_RATE_LIMIT_EXCEEDED',
    message: 'Too many order requests from this IP. Please try again in a few minutes.'
  }
});

// Rate limiting on payment initialization and verification
export const paymentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 60 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'PAYMENT_RATE_LIMIT_EXCEEDED',
    message: 'Too many payment requests from this IP. Please try again in a few minutes.'
  }
});

// Rate limiting on webhook endpoint: tuned to accommodate high-volume festival ticket sales
// and Paystack webhook retries (from Paystack egress IPs) while preventing unauthenticated volumetric floods.
// Authenticity is strictly enforced cryptographically via HMAC-SHA512.
export const webhookRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 1500 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
    message: 'Too many webhook requests from this IP.'
  }
});

// Rate limiting on ticket listing and viewing
export const ticketRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 120 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'TICKET_RATE_LIMIT_EXCEEDED',
    message: 'Too many ticket requests from this IP. Please try again in a few minutes.'
  }
});

// Stricter rate limiting on ticket validation and gate check-in attempts to prevent credential guessing
export const ticketValidationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'TICKET_VALIDATION_RATE_LIMIT_EXCEEDED',
    message: 'Too many ticket validation attempts from this IP. Please try again later.'
  }
});




