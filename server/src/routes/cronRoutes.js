import { Router } from 'express';
import { env } from '../config/env.js';
import { autoCompletePastEvents } from '../services/eventCompletionService.js';
import { getUserById } from '../services/authService.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * Authentication middleware for cron endpoints.
 * Supports:
 * 1. Vercel Cron invocation via Authorization header: "Bearer <CRON_SECRET>"
 * 2. Authorized session from an ADMIN or SUPER_ADMIN
 */
const verifyCronAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET || env.CRON_SECRET;

  // 1. Verify Vercel Cron Secret (if configured)
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return next();
  }

  // 2. Allow session-authenticated administrators to trigger manual execution
  if (req.user && (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN')) {
    return next();
  }

  if (req.session && req.session.userId) {
    try {
      const user = await getUserById(req.session.userId);
      if (user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && !user.isArchived) {
        req.user = user;
        return next();
      }
    } catch {
      // Continue to reject
    }
  }

  logger.warn({
    path: req.originalUrl,
    ip: req.ip,
    hasAuthHeader: Boolean(authHeader)
  }, 'Unauthorized cron request blocked.');

  return res.status(401).json({
    success: false,
    code: 'UNAUTHORIZED_CRON',
    message: 'Unauthorized cron invocation. Missing or invalid cron authorization.'
  });
};

/**
 * GET /api/cron/complete-events
 * POST /api/cron/complete-events
 *
 * Automatically inspects all PUBLISHED events and transitions expired events to COMPLETED.
 * Idempotent, safe for multiple concurrent or repeated calls.
 */
const handleCompleteEvents = async (req, res, next) => {
  try {
    const result = await autoCompletePastEvents();
    res.json({
      success: true,
      message: `Event auto-completion executed successfully. ${result.completedCount} event(s) marked COMPLETED.`,
      data: result
    });
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to execute event auto-completion cron.');
    next(err);
  }
};

router.get('/complete-events', verifyCronAuth, handleCompleteEvents);
router.post('/complete-events', verifyCronAuth, handleCompleteEvents);

export default router;
