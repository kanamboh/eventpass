import { z } from 'zod';

/**
 * UUID validator for route parameters
 */
export const uuidParamSchema = z
  .object({
    id: z.string().uuid('Invalid reservation ID format. Must be a valid UUID.')
  })
  .strict();

/**
 * Validation schema for creating a ticket reservation
 * Strictly validates ticketTypeId and quantity
 * Rejects client-supplied price, currency, total, userId, or expiresAt via .strict()
 */
export const createReservationSchema = z.object({
  ticketTypeId: z.string().uuid('ticketTypeId must be a valid UUID.'),
  quantity: z
    .number({
      required_error: 'Quantity is required.',
      invalid_type_error: 'Quantity must be an integer.'
    })
    .int('Quantity must be an integer.')
    .min(1, 'Quantity must be at least 1.')
    .max(10, 'Maximum 10 tickets per reservation request.')
});
