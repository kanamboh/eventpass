import { z } from 'zod';

export const validatePromoCodeItemSchema = z.object({
  ticketTypeId: z.string().uuid('Invalid ticketTypeId format.'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1.').max(10, 'Maximum 10 tickets per type.')
});

export const validatePromoCodeSchema = z.object({
  code: z
    .string({ required_error: 'Promo code is required.' })
    .trim()
    .min(1, 'Promo code cannot be empty.')
    .max(50, 'Promo code cannot exceed 50 characters.'),
  items: z
    .array(validatePromoCodeItemSchema)
    .min(1, 'At least one ticket item is required to validate a promo code.')
    .max(20, 'Maximum 20 items per validation request.'),
  email: z
    .string()
    .trim()
    .email('Invalid email address.')
    .optional()
});

export const adminCreatePromoCodeSchema = z.object({
  code: z
    .string({ required_error: 'Promo code string is required.' })
    .trim()
    .min(2, 'Promo code must be at least 2 characters.')
    .max(50, 'Promo code cannot exceed 50 characters.')
    .regex(/^[A-Za-z0-9_-]+$/, 'Promo code may only contain alphanumeric characters, hyphens, and underscores.'),
  description: z.string().trim().max(255).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED'], {
    required_error: 'discountType must be PERCENTAGE or FIXED.'
  }),
  discountValue: z
    .number({ required_error: 'discountValue is required.' })
    .int('discountValue must be an integer.')
    .positive('discountValue must be positive.')
    .refine((val) => val > 0, { message: 'discountValue must be greater than 0.' }),
  maxDiscountMinor: z
    .number()
    .int('maxDiscountMinor must be an integer.')
    .positive('maxDiscountMinor must be positive.')
    .nullable()
    .optional(),
  minSubtotalMinor: z
    .number()
    .int('minSubtotalMinor must be an integer.')
    .min(0, 'minSubtotalMinor cannot be negative.')
    .default(0),
  maxTotalRedemptions: z
    .number()
    .int('maxTotalRedemptions must be an integer.')
    .positive('maxTotalRedemptions must be positive.')
    .nullable()
    .optional(),
  maxPerCustomer: z
    .number()
    .int('maxPerCustomer must be an integer.')
    .positive('maxPerCustomer must be positive.')
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  eventIds: z.array(z.string().uuid('Invalid event ID.')).optional().default([]),
  ticketTypeIds: z.array(z.string().uuid('Invalid ticket type ID.')).optional().default([])
}).strict().superRefine((data, ctx) => {
  if (data.discountType === 'PERCENTAGE' && data.discountValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountValue'],
      message: 'Percentage discount cannot exceed 100%.'
    });
  }
  if (data.startsAt && data.expiresAt) {
    if (new Date(data.startsAt) >= new Date(data.expiresAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'expiresAt must be after startsAt.'
      });
    }
  }
});

export const adminUpdatePromoCodeSchema = z.object({
  description: z.string().trim().max(255).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountValue: z.number().int().positive().optional(),
  maxDiscountMinor: z.number().int().positive().nullable().optional(),
  minSubtotalMinor: z.number().int().min(0).optional(),
  maxTotalRedemptions: z.number().int().positive().nullable().optional(),
  maxPerCustomer: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  eventIds: z.array(z.string().uuid('Invalid event ID.')).optional(),
  ticketTypeIds: z.array(z.string().uuid('Invalid ticket type ID.')).optional()
}).strict().superRefine((data, ctx) => {
  if (data.discountType === 'PERCENTAGE' && data.discountValue && data.discountValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountValue'],
      message: 'Percentage discount cannot exceed 100%.'
    });
  }
});

export const adminListPromoCodesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE', 'EXPIRED']).default('ALL')
}).strict();
