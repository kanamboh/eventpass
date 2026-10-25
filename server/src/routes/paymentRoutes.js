import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { paymentRateLimiter, webhookRateLimiter } from '../middleware/rateLimiter.js';
import { requirePaymentsEnabled } from '../middleware/paymentGate.js';
import * as paymentController from '../controllers/paymentController.js';

const router = Router();

// Central read-only payment availability status endpoint
router.get('/status', paymentController.getStatus);

// 1. Payment Initialization: requires active authenticated session & payments enabled
router.post('/initialize', requirePaymentsEnabled, requireAuth, paymentRateLimiter, paymentController.initialize);

// 2. Server-side Payment Verification: strictly guarded by requirePaymentsEnabled & rate-limited
// If session is present, attaches user context for BOLA enforcement
router.get('/verify/:reference', requirePaymentsEnabled, paymentRateLimiter, (req, res, next) => {
  if (req.session && req.session.userId) {
    req.user = { id: req.session.userId };
  }
  next();
}, paymentController.verify);

// 3. Paystack Webhook: Machine-to-machine callback
// Strictly guarded by requirePaymentsEnabled when payment processing is frozen
router.post('/webhook/paystack', requirePaymentsEnabled, webhookRateLimiter, paymentController.paystackWebhook);

export default router;
