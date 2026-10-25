import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { ticketRateLimiter, ticketValidationRateLimiter } from '../middleware/rateLimiter.js';
import * as ticketController from '../controllers/ticketController.js';

const router = Router();

// Gate Scanner & Validation endpoints (Rate limited against brute force)
router.post('/validate', ticketValidationRateLimiter, ticketController.validate);
router.post('/check-in', ticketValidationRateLimiter, ticketController.checkIn);

// Customer ticket endpoints (Strictly authenticated & BOLA enforced)
router.get('/my-tickets', requireAuth, ticketRateLimiter, ticketController.listMyTickets);
router.get('/ref/:reference', requireAuth, ticketRateLimiter, ticketController.getByReference);
router.get('/:id', requireAuth, ticketRateLimiter, ticketController.getById);

export default router;
