import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { uploadPosterMiddleware } from '../middleware/uploadMiddleware.js';
import * as adminController from '../controllers/adminController.js';

const router = Router();

// Strict Server-Side Admin Authorization Barrier
// Unauthenticated requests receive HTTP 401.
// Authenticated CUSTOMER requests receive HTTP 403.
router.use(requireAuth);

// ============================================================================
// OWNER-ONLY USER MANAGEMENT (role === 'SUPER_ADMIN' strictly required)
// ============================================================================
router.get('/users/audit-logs', requireRole('SUPER_ADMIN'), adminController.getUserAuditLogs);
router.get('/users', requireRole('SUPER_ADMIN'), adminController.listUsers);
router.patch('/users/:id/role', requireRole('SUPER_ADMIN'), adminController.updateUserRole);

// ============================================================================
// OPERATIONAL ADMIN BARRIER (role === 'ADMIN' or 'SUPER_ADMIN')
// ============================================================================
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

// Event Management
router.get('/events', adminController.listEvents);
router.post('/events', adminController.createEvent);
router.post('/events/upload-poster', uploadPosterMiddleware, adminController.uploadPoster);
router.get('/events/:id', adminController.getEvent);
router.put('/events/:id', adminController.updateEvent);
router.patch('/events/:id/status', adminController.updateEventStatus);

// Ticket Tier Management
router.post('/events/:id/ticket-types', adminController.createTicketType);
router.put('/events/:id/ticket-types/:ticketTypeId', adminController.updateTicketType);
router.delete('/events/:id/ticket-types/:ticketTypeId', adminController.deleteTicketType);

// Promotional Code Management
router.get('/promocodes', adminController.listPromoCodes);
router.post('/promocodes', adminController.createPromoCode);
router.get('/promocodes/:id', adminController.getPromoCode);
router.put('/promocodes/:id', adminController.updatePromoCode);
router.patch('/promocodes/:id/status', adminController.togglePromoCodeStatus);
router.delete('/promocodes/:id', adminController.deletePromoCode);

export default router;
