import { z } from 'zod';

export const uuidParamSchema = z
  .object({
    id: z.string().uuid('Invalid order ID format. Must be a valid UUID.')
  })
  .strict();

export const buyerDetailsSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required.').max(100).optional(),
    lastName: z.string().trim().min(1, 'Last name is required.').max(100).optional(),
    email: z.string().trim().email('Invalid email address.').optional(),
    phone: z.string().trim().max(30).optional(),
    deliveryType: z
      .enum(['digital'], {
        errorMap: () => ({ message: 'Only digital email delivery is supported. Physical or in-store collection is not supported.' })
      })
      .default('digital'),
    paymentMethod: z
      .enum(['card'], {
        errorMap: () => ({
          message: 'Unsupported payment method. Offline or gate payment is not supported; EventPass supports secure online payments only.'
        })
      })
      .default('card')
  })
  .strict();

/**
 * Validation schema for order creation
 * Only references active reservations and buyer details
 * Rejects client-supplied prices, totals, userId, or statuses via .strict()
 */
export const createOrderSchema = z.object({
  reservationIds: z
    .array(z.string().uuid('Each reservation ID must be a valid UUID.'))
    .min(1, 'At least one reservation is required to create an order.')
    .max(10, 'Maximum 10 reservations per order.')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate reservation IDs are not permitted in an order.'
    })
    .optional(),
  buyerDetails: buyerDetailsSchema.optional(),
  buyerName: z.string().trim().max(100).optional(),
  buyerEmail: z.string().trim().email('Invalid email address.').optional(),
  promoCode: z
    .string()
    .trim()
    .max(50, 'promoCode cannot exceed 50 characters.')
    .optional(),
  idempotencyKey: z
    .string()
    .trim()
    .min(1, 'idempotencyKey cannot be empty.')
    .max(100, 'idempotencyKey cannot exceed 100 characters.')
    .optional()
});

