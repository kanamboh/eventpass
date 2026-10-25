import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;

// Query parameter schema for GET /api/events
export const listEventsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .refine((val) => !isNaN(val) && val >= 1, {
      message: 'Page must be an integer greater than or equal to 1.'
    }),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 12))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 50, {
      message: 'Limit must be an integer between 1 and 50.'
    }),
  search: z
    .string()
    .max(100, { message: 'Search query cannot exceed 100 characters.' })
    .optional()
    .transform((val) => (val ? val.trim() : undefined)),
  category: z
    .string()
    .max(50, { message: 'Category identifier cannot exceed 50 characters.' })
    .optional()
    .transform((val) => (val && val !== 'all' ? val.trim().toLowerCase() : undefined)),
  location: z
    .string()
    .max(60, { message: 'Location cannot exceed 60 characters.' })
    .optional()
    .transform((val) => (val && val !== 'all' ? val.trim() : undefined)),
  when: z
    .enum(['anytime', 'weekend', 'month', 'upcoming'])
    .optional()
    .default('anytime'),
  sort: z
    .enum([
      'date',
      'date-asc',
      'date-desc',
      'price-low',
      'price-high',
      'popular',
      'title-asc',
      'title-desc'
    ])
    .optional()
    .default('date'),
  featured: z
    .string()
    .optional()
    .transform((val) => val === 'true' || val === '1')
});

// Event identifier schema (supports either UUID or slug)
export const eventIdentifierSchema = z.object({
  id: z
    .string()
    .min(1, { message: 'Event identifier is required.' })
    .max(120, { message: 'Event identifier exceeds maximum length.' })
    .refine((val) => SAFE_SLUG_REGEX.test(val), {
      message: 'Event identifier contains invalid characters.'
    })
});

// Slug parameter schema
export const slugParamSchema = z.object({
  slug: z
    .string()
    .min(1, { message: 'Slug is required.' })
    .max(120, { message: 'Slug exceeds maximum length.' })
    .refine((val) => SAFE_SLUG_REGEX.test(val), {
      message: 'Slug contains invalid characters.'
    })
});

// Category slug parameter schema
export const categorySlugParamSchema = z.object({
  slug: z
    .string()
    .min(1, { message: 'Category slug is required.' })
    .max(60, { message: 'Category slug exceeds maximum length.' })
    .refine((val) => SAFE_SLUG_REGEX.test(val), {
      message: 'Category slug contains invalid characters.'
    })
});

export const isUuid = (val) => UUID_REGEX.test(val);
