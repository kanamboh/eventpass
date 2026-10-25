import { Router } from 'express';
import { promoRateLimiter } from '../middleware/rateLimiter.js';
import { optionalAuth } from '../middleware/authMiddleware.js';
import * as promoCodeController from '../controllers/promoCodeController.js';

const router = Router();

// Validate promotional code against customer cart items
// POST /api/promocodes/validate
router.post('/validate', promoRateLimiter, optionalAuth, promoCodeController.validate);

export default router;
