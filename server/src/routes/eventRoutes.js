import { Router } from 'express';
import {
  getEvents,
  getEventById,
  getEventBySlug,
  getTicketTypes
} from '../controllers/eventController.js';

const router = Router();

// Public Event Catalog Endpoints
router.get('/', getEvents);
router.get('/slug/:slug', getEventBySlug);
router.get('/:id', getEventById);
router.get('/:id/ticket-types', getTicketTypes);

export default router;
