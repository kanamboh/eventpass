import {
  listPublicEvents,
  getPublicEventByIdOrSlug,
  getPublicEventBySlug,
  listPublicCategories,
  getEventTicketTypes
} from '../services/eventService.js';
import {
  listEventsQuerySchema,
  eventIdentifierSchema,
  slugParamSchema,
  categorySlugParamSchema
} from '../validators/eventValidators.js';

/**
 * GET /api/events
 * Public event catalog listing with search, category, location, date filtering, pagination, and sorting
 */
export const getEvents = async (req, res, next) => {
  try {
    const validatedQuery = listEventsQuerySchema.parse(req.query);
    const result = await listPublicEvents(validatedQuery);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/events/:id
 * Retrieve event details by UUID or slug
 */
export const getEventById = async (req, res, next) => {
  try {
    const { id } = eventIdentifierSchema.parse(req.params);
    const event = await getPublicEventByIdOrSlug(id);

    res.status(200).json({
      status: 'success',
      data: {
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/events/slug/:slug
 * Retrieve event details specifically by unique slug
 */
export const getEventBySlug = async (req, res, next) => {
  try {
    const { slug } = slugParamSchema.parse(req.params);
    const event = await getPublicEventBySlug(slug);

    res.status(200).json({
      status: 'success',
      data: {
        event
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/events/:id/ticket-types
 * Retrieve ticket inventory and available tiers for an event
 */
export const getTicketTypes = async (req, res, next) => {
  try {
    const { id } = eventIdentifierSchema.parse(req.params);
    const ticketTypes = await getEventTicketTypes(id);

    res.status(200).json({
      status: 'success',
      data: {
        ticketTypes
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/categories
 * Retrieve all event categories with active published event counts
 */
export const getCategories = async (req, res, next) => {
  try {
    const categories = await listPublicCategories();

    res.status(200).json({
      status: 'success',
      data: {
        categories
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/categories/:slug/events
 * Retrieve event catalog scoped to a specific category
 */
export const getCategoryEvents = async (req, res, next) => {
  try {
    const { slug } = categorySlugParamSchema.parse(req.params);
    const validatedQuery = listEventsQuerySchema.parse({
      ...req.query,
      category: slug
    });

    const result = await listPublicEvents(validatedQuery);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
};
