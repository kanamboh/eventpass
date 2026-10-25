import { Router } from 'express';
import {
  getCategories,
  getCategoryEvents
} from '../controllers/eventController.js';

const router = Router();

// Public Category Endpoints
router.get('/', getCategories);
router.get('/:slug/events', getCategoryEvents);

export default router;
