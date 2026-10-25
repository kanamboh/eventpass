import { env } from '../config/env.js';

/**
 * Server-Side Payment Processing Barrier Middleware
 * 
 * Rejects any payment initialization, session creation, or provider checkout
 * with HTTP 503 PAYMENTS_DISABLED whenever PAYMENTS_ENABLED is false.
 */
export const requirePaymentsEnabled = (req, res, next) => {
  if (!env.PAYMENTS_ENABLED) {
    return res.status(503).json({
      status: 'error',
      code: 'PAYMENTS_DISABLED',
      message: 'Online payments are temporarily unavailable.'
    });
  }
  next();
};
