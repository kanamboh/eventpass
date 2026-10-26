import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import eventRoutes from './eventRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import reservationRoutes from './reservationRoutes.js';
import orderRoutes from './orderRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import ticketRoutes from './ticketRoutes.js';
import adminRoutes from './adminRoutes.js';
import promoCodeRoutes from './promoCodeRoutes.js';
import cronRoutes from './cronRoutes.js';

const router = Router();

// Mount API routes
router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/events', eventRoutes);
router.use('/categories', categoryRoutes);
router.use('/reservations', reservationRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/tickets', ticketRoutes);
router.use('/promocodes', promoCodeRoutes);
router.use('/admin', adminRoutes);
router.use('/cron', cronRoutes);

export default router;

