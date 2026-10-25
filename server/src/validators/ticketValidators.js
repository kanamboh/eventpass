import { z } from 'zod';

/**
 * Validation schema for validating a ticket (gate scanner preview)
 */
export const validateTicketSchema = z.object({
  ticketCode: z.string().trim().min(3).max(100).optional(),
  qrToken: z.string().trim().min(10).max(256).optional(),
  qrPayload: z.string().trim().min(3).max(500).optional(),
  eventId: z.string().uuid().optional()
}).refine(
  (data) => data.ticketCode || data.qrPayload,
  {
    message: 'Either ticketCode or qrPayload must be provided.',
    path: ['ticketCode']
  }
);

/**
 * Validation schema for checking in a ticket (turnstile entry)
 */
export const checkInTicketSchema = z.object({
  ticketCode: z.string().trim().min(3).max(100).optional(),
  qrToken: z.string().trim().min(10).max(256).optional(),
  qrPayload: z.string().trim().min(3).max(500).optional(),
  eventId: z.string().uuid().optional(),
  staffId: z.string().trim().min(1).max(100).optional()
}).refine(
  (data) => data.ticketCode || data.qrPayload,
  {
    message: 'Either ticketCode or qrPayload must be provided.',
    path: ['ticketCode']
  }
);
