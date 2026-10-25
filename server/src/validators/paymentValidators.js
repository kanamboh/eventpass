import { z } from 'zod';

export const initializePaymentSchema = z
  .object({
    orderId: z.string().uuid({ message: 'Valid Order ID (UUID) is required.' }),
    callbackUrl: z.string().url({ message: 'Callback URL must be a valid URL.' }).optional()
  })
  .strict(); // Strips/rejects any client-supplied financial tampering fields (e.g. amount, currency, status)

export const paymentReferenceParamSchema = z.object({
  reference: z
    .string()
    .min(6, 'Payment reference must be at least 6 characters.')
    .max(100, 'Payment reference cannot exceed 100 characters.')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Payment reference contains invalid characters.')
});
