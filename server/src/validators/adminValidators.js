import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Helper to reject floating point / non-integer money amounts
const integerMinorUnits = z
  .number()
  .int({ message: 'Price must be an exact integer minor units (cents).' })
  .min(0, { message: 'Price cannot be negative.' });

export const adminListEventsQuerySchema = z.object({
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
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 100, {
      message: 'Limit must be an integer between 1 and 100.'
    }),
  search: z
    .string()
    .max(100)
    .optional()
    .transform((val) => (val ? val.trim() : undefined)),
  status: z
    .enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'all'])
    .optional()
    .default('all'),
  categoryId: z
    .string()
    .refine((val) => UUID_REGEX.test(val), { message: 'Invalid category UUID.' })
    .optional()
});

export const adminCreateTicketTypeNestedSchema = z.object({
  name: z.string().trim().min(2, 'Tier name must be at least 2 characters.').max(100),
  description: z.string().trim().max(500).optional(),
  priceMinor: integerMinorUnits,
  paymentPriceUsdMinor: integerMinorUnits.optional(),
  quantityTotal: z.number().int().min(1, 'Quantity must be at least 1.').max(100000),
  maxPerOrder: z.number().int().min(1).max(50).optional().default(10)
});

export const adminCreateEventSchema = z.object({
  title: z.string().trim().min(3, 'Event title must be at least 3 characters.').max(200),
  subtitle: z.string().trim().max(200).optional(),
  description: z.string().trim().min(10, 'Description must be at least 10 characters.').max(10000),
  categoryId: z.string().refine((val) => UUID_REGEX.test(val), { message: 'Valid categoryId is required.' }),
  venue: z.string().trim().min(2, 'Venue must be at least 2 characters.').max(200),
  location: z.string().trim().min(2, 'Location/City must be at least 2 characters.').max(100),
  province: z.string().trim().max(60).optional(),
  startDateTime: z.string().datetime({ message: 'startDateTime must be a valid ISO-8601 date string.' }),
  endDateTime: z.string().datetime({ message: 'endDateTime must be a valid ISO-8601 date string.' }).optional(),
  imageUrl: z.string().trim().min(5, 'Image URL must be at least 5 characters.').max(1000),
  bannerUrl: z.string().trim().max(1000).optional(),
  organizerName: z.string().trim().min(2, 'Organizer name must be at least 2 characters.').max(100),
  ageRestriction: z.string().trim().max(50).optional(),
  isFeatured: z.boolean().optional().default(false),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional().default('DRAFT'),
  ticketTypes: z.array(adminCreateTicketTypeNestedSchema).optional()
}).strict({
  message: 'Unexpected parameters rejected by strict schema validation.'
});

export const adminUpdateEventSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  subtitle: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().min(10).max(10000).optional(),
  categoryId: z.string().refine((val) => UUID_REGEX.test(val), { message: 'Valid categoryId is required.' }).optional(),
  venue: z.string().trim().min(2).max(200).optional(),
  location: z.string().trim().min(2).max(100).optional(),
  province: z.string().trim().max(60).optional().nullable(),
  startDateTime: z.string().datetime({ message: 'startDateTime must be a valid ISO-8601 date string.' }).optional(),
  endDateTime: z.string().datetime({ message: 'endDateTime must be a valid ISO-8601 date string.' }).optional().nullable(),
  imageUrl: z.string().trim().min(5).max(1000).optional(),
  bannerUrl: z.string().trim().max(1000).optional().nullable(),
  organizerName: z.string().trim().min(2).max(100).optional(),
  ageRestriction: z.string().trim().max(50).optional().nullable(),
  isFeatured: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']).optional()
}).strict({
  message: 'Unexpected parameters rejected by strict schema validation.'
});

export const adminUpdateEventStatusSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'], {
    errorMap: () => ({ message: 'Status must be one of: DRAFT, PUBLISHED, CANCELLED, COMPLETED.' })
  })
}).strict();

export const adminCreateTicketTypeSchema = z.object({
  name: z.string().trim().min(2, 'Tier name must be at least 2 characters.').max(100),
  description: z.string().trim().max(500).optional().nullable(),
  priceMinor: integerMinorUnits,
  paymentPriceUsdMinor: integerMinorUnits.optional(),
  quantityTotal: z.number().int().min(1, 'Total quantity must be at least 1.').max(100000),
  maxPerOrder: z.number().int().min(1).max(50).optional().default(10),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE')
}).strict({
  message: 'Unexpected parameters rejected by strict schema validation.'
});

export const adminUpdateTicketTypeSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  priceMinor: integerMinorUnits.optional(),
  paymentPriceUsdMinor: integerMinorUnits.optional(),
  quantityTotal: z.number().int().min(1).max(100000).optional(),
  maxPerOrder: z.number().int().min(1).max(50).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SOLD_OUT']).optional()
}).strict({
  message: 'Unexpected parameters rejected by strict schema validation.'
});

export const adminListUsersQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .refine((val) => !isNaN(val) && val >= 1, {
      message: 'Page must be an integer >= 1.'
    }),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 100, {
      message: 'Limit must be an integer between 1 and 100.'
    }),
  search: z
    .string()
    .max(100)
    .optional()
    .transform((val) => (val ? val.trim() : undefined)),
  role: z
    .enum(['ALL', 'CUSTOMER', 'ADMIN', 'SUPER_ADMIN'])
    .optional()
    .default('ALL'),
  archived: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  status: z
    .enum(['active', 'archived', 'all'])
    .optional()
    .default('active')
});

export const adminUpdateUserRoleSchema = z.object({
  role: z.enum(['ADMIN', 'CUSTOMER'], {
    errorMap: () => ({ message: 'Role must be either ADMIN or CUSTOMER.' })
  })
}).strict({
  message: 'Unexpected parameters rejected by strict schema validation.'
});

