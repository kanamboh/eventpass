import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { orderRateLimiter } from '../middleware/rateLimiter.js';
import * as orderController from '../controllers/orderController.js';

const router = Router();

// All order creation and retrieval endpoints require an authenticated user session
router.use(requireAuth);

router.post('/', orderRateLimiter, orderController.create);
router.get('/', orderController.list);
router.get('/:id', orderController.getById);

export default router;
