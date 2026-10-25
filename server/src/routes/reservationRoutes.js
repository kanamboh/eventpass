import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { reservationRateLimiter } from '../middleware/rateLimiter.js';
import * as reservationController from '../controllers/reservationController.js';

const router = Router();

// All reservation endpoints require an authenticated user session
router.use(requireAuth);

router.post('/', reservationRateLimiter, reservationController.create);
router.get('/', reservationController.list);
router.get('/:id', reservationController.getById);
router.delete('/:id', reservationRateLimiter, reservationController.cancel);

export default router;
