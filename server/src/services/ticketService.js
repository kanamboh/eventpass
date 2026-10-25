import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';
import { generateQrDataUrl, generateQrSvg } from '../utils/qrGenerator.js';
import { formatCurrency } from './eventService.js';

/**
 * Secret key used to generate opaque, high-entropy ticket QR signatures
 */
const getQrSecretKey = () => {
  return process.env.TICKET_QR_SECRET || process.env.SESSION_SECRET || 'eventpass_default_qr_signing_secret_2026_xyz';
};

/**
 * Generate a cryptographically random, unpredictable ticket reference
 * Format: TK-<16 uppercase hex chars> (64 bits entropy)
 */
export const generateSecureTicketReference = () => {
  const hex = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `TK-${hex}`;
};

/**
 * Generate opaque QR credential for a ticket
 * Uses HMAC-SHA256 signature to allow deterministic re-rendering for authorized customer
 * and SHA-256 hash stored in the DB for one-way verification protection.
 */
export const generateTicketQrData = (ticketId, ticketReference, orderId) => {
  const secret = getQrSecretKey();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${ticketId}:${ticketReference}:${orderId}`)
    .digest('hex');

  const qrPayload = `${ticketReference}:${signature}`;
  const qrTokenHash = crypto.createHash('sha256').update(signature).digest('hex');

  return { qrPayload, qrTokenHash, signature };
};

/**
 * Verify a scanned QR token against a ticket's stored qrTokenHash
 */
export const verifyTicketQrToken = (ticket, providedToken) => {
  if (!providedToken || !ticket.qrTokenHash) {
    return false;
  }

  // Calculate sha256 of the provided token/signature
  const computedHash = crypto.createHash('sha256').update(providedToken).digest('hex');

  const bufA = Buffer.from(computedHash, 'hex');
  const bufB = Buffer.from(ticket.qrTokenHash, 'hex');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Format a ticket model into a clean public DTO
/**
 * Format a ticket model into a clean, safe customer DTO
 * STRICT SECURITY REQUIREMENT:
 * Never returns qrPayload, qrDataUrl, qrSvg, signatures, or raw QR credentials to the browser!
 */
export const formatCustomerTicketDto = (ticket) => {
  const event = ticket.event || {};
  const tier = ticket.ticketType || {};
  const order = ticket.order || {};

  return {
    id: ticket.id,
    ticketReference: ticket.ticketReference,
    ticketCode: ticket.ticketReference,
    orderId: ticket.orderId,
    orderReference: order.orderReference || null,
    status: ticket.status,
    activeStatus: ticket.status === 'VALID' ? 'ACTIVE' : ticket.status === 'CHECKED_IN' ? 'USED' : ticket.status,
    isValid: ticket.status === 'VALID',
    issuedAt: ticket.createdAt.toISOString(),
    createdAt: ticket.createdAt.toISOString(),
    checkedInAt: ticket.checkedInAt ? ticket.checkedInAt.toISOString() : null,
    checkedInBy: ticket.checkedInBy || null,
    event: {
      id: event.id || ticket.eventId,
      title: event.title || 'Event',
      slug: event.slug || null,
      venue: event.venue || '',
      location: event.location || '',
      startDateTime: event.startDateTime ? new Date(event.startDateTime).toISOString() : null,
      imageUrl: event.imageUrl || ''
    },
    tier: {
      id: tier.id || ticket.ticketTypeId,
      name: tier.name || 'General Admission',
      priceMinor: tier.priceMinor || 0,
      priceFormatted: formatCurrency(tier.priceMinor || 0, tier.currency || 'ZAR'),
      currency: tier.currency || 'ZAR'
    },
    buyer: {
      name: order.buyerName || null,
      email: order.buyerEmail || null
    }
  };
};

/**
 * Format a ticket model with embedded QR credentials for internal EMAIL DISPATCH ONLY.
 * NEVER expose this function or its output to customer HTTP endpoints.
 */
export const formatTicketWithQrForEmail = async (ticket) => {
  const baseDto = formatCustomerTicketDto(ticket);
  const qrData = generateTicketQrData(ticket.id, ticket.ticketReference, ticket.orderId);
  const qrPayload = qrData.qrPayload;
  let qrDataUrl = null;
  let qrSvg = null;

  try {
    qrDataUrl = await generateQrDataUrl(qrPayload);
    qrSvg = await generateQrSvg(qrPayload);
  } catch (err) {
    logger.warn({ msg: 'Failed to generate QR graphics for email ticket', ticketId: ticket.id, error: err.message });
  }

  return {
    ...baseDto,
    qrPayload,
    qrDataUrl,
    qrSvg
  };
};

/**
 * General ticket formatter.
 * Defaults to safe customer DTO (NO QR DATA).
 */
export const formatTicketDto = async (ticket, includeQr = false) => {
  if (includeQr) {
    return await formatTicketWithQrForEmail(ticket);
  }
  return formatCustomerTicketDto(ticket);
};

/**
 * Atomically issue tickets for an authoritatively confirmed order inside a database transaction
 * Strictly idempotent: will never create duplicate tickets if run multiple times
 */
export const issueTicketsForOrder = async (tx, order, orderItems) => {
  // 1. Idempotency Check: check if tickets already exist for this order
  const existingTickets = await tx.ticket.findMany({
    where: { orderId: order.id },
    include: {
      event: true,
      ticketType: true,
      order: true
    }
  });

  if (existingTickets && existingTickets.length > 0) {
    logger.info({
      msg: 'Tickets already exist for order; skipping duplicate creation',
      orderId: order.id,
      count: existingTickets.length
    });
    return existingTickets;
  }

  // 2. Build exactly N tickets for each order item with quantity N
  const createdTickets = [];

  for (const item of orderItems) {
    for (let i = 0; i < item.quantity; i++) {
      const ticketId = crypto.randomUUID();
      const ticketRef = generateSecureTicketReference();
      const qrData = generateTicketQrData(ticketId, ticketRef, order.id);

      const ticket = await tx.ticket.create({
        data: {
          id: ticketId,
          orderId: order.id,
          orderItemId: item.id,
          eventId: item.eventId,
          ticketTypeId: item.ticketTypeId,
          userId: order.userId || null,
          ticketReference: ticketRef,
          qrTokenHash: qrData.qrTokenHash,
          status: 'VALID',
          createdAt: new Date()
        },
        include: {
          event: true,
          ticketType: true,
          order: true
        }
      });

      createdTickets.push(ticket);
    }
  }

  logger.info({
    msg: 'Successfully generated individual tickets for paid order',
    orderId: order.id,
    ticketsCount: createdTickets.length
  });

  return createdTickets;
};

/**
 * Customer ticket listing with strict ownership filtering (BOLA Defense)
 */
export const getMyTickets = async (userId) => {
  if (!userId) {
    throw new AppError('Authentication is required to view your tickets.', 401, 'UNAUTHENTICATED');
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      userId
    },
    include: {
      event: true,
      ticketType: true,
      order: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return tickets.map((t) => formatCustomerTicketDto(t));
};

/**
 * Get single ticket by ID with BOLA protection
 */
export const getTicketById = async (ticketId, requestingUserId, requestingUserRole) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: true,
      ticketType: true,
      order: true
    }
  });

  if (!ticket) {
    throw new AppError('Ticket not found.', 404, 'TICKET_NOT_FOUND');
  }

  // BOLA enforcement: must be owner or ADMIN
  if (ticket.userId !== requestingUserId && requestingUserRole !== 'ADMIN') {
    throw new AppError('You do not have permission to view this ticket.', 403, 'TICKET_ACCESS_DENIED');
  }

  return formatCustomerTicketDto(ticket);
};

/**
 * Get single ticket by public ticket reference with BOLA protection
 */
export const getTicketByReference = async (ticketReference, requestingUserId, requestingUserRole) => {
  const ticket = await prisma.ticket.findUnique({
    where: { ticketReference },
    include: {
      event: true,
      ticketType: true,
      order: true
    }
  });

  if (!ticket) {
    throw new AppError('Ticket not found.', 404, 'TICKET_NOT_FOUND');
  }

  // BOLA enforcement: must be owner or ADMIN
  if (ticket.userId !== requestingUserId && requestingUserRole !== 'ADMIN') {
    throw new AppError('You do not have permission to view this ticket.', 403, 'TICKET_ACCESS_DENIED');
  }

  return formatCustomerTicketDto(ticket);
};

/**
 * Validate a ticket credential (Read-Only Gate Lookup / Scanner Preview)
 * Validates existence, order status, cancellation, usage, event match, and cryptographic signature
 */
export const validateTicket = async ({ ticketCode, qrToken, qrPayload, eventId, isStaffOrScanner = false }) => {
  let code = ticketCode;
  let token = qrToken;

  // Support full payload format "TK-XXXX:SIGNATURE"
  if (qrPayload && !code) {
    const parts = qrPayload.split(':');
    code = parts[0];
    token = parts[1] || null;
  } else if (code && code.includes(':') && !token) {
    const parts = code.split(':');
    code = parts[0];
    token = parts[1];
  }

  if (!code) {
    throw new AppError('Ticket code or QR payload is required for validation.', 400, 'VALIDATION_ERROR');
  }

  const ticket = await prisma.ticket.findUnique({
    where: { ticketReference: code },
    include: {
      event: true,
      ticketType: true,
      order: true
    }
  });

  if (!ticket) {
    return {
      valid: false,
      reason: 'TICKET_NOT_FOUND',
      message: 'Ticket does not exist.'
    };
  }

  // 1. Verify associated order is PAID
  if (ticket.order?.status !== 'PAID') {
    return {
      valid: false,
      reason: 'ORDER_NOT_PAID',
      message: `Associated order has status ${ticket.order?.status || 'UNKNOWN'}.`,
      status: ticket.status
    };
  }

  // 2. Check Event match if provided
  if (eventId && ticket.eventId !== eventId) {
    return {
      valid: false,
      reason: 'EVENT_MISMATCH',
      message: 'Ticket belongs to a different event.',
      expectedEventId: eventId,
      actualEventId: ticket.eventId
    };
  }

  // 3. Check Ticket Status
  if (ticket.status === 'CHECKED_IN') {
    return {
      valid: false,
      reason: 'TICKET_ALREADY_USED',
      message: 'Ticket has already been used.',
      status: 'CHECKED_IN',
      activeStatus: 'USED',
      checkedInAt: ticket.checkedInAt ? ticket.checkedInAt.toISOString() : null,
      ticketReference: ticket.ticketReference,
      eventTitle: ticket.event.title,
      tierName: ticket.ticketType.name,
      buyerName: (token || isStaffOrScanner) ? ticket.order.buyerName : undefined
    };
  }

  if (ticket.status === 'CANCELLED') {
    return {
      valid: false,
      reason: 'TICKET_CANCELLED',
      message: 'Ticket has been cancelled.',
      status: 'CANCELLED'
    };
  }

  if (ticket.status === 'REFUNDED') {
    return {
      valid: false,
      reason: 'TICKET_REFUNDED',
      message: 'Ticket has been refunded.',
      status: 'REFUNDED'
    };
  }

  // 4. Verify cryptographic QR token if supplied
  if (token) {
    const isSignatureValid = verifyTicketQrToken(ticket, token);
    if (!isSignatureValid) {
      return {
        valid: false,
        reason: 'INVALID_QR_CREDENTIAL',
        message: 'Cryptographic QR signature does not match ticket.'
      };
    }
  }

  return {
    valid: true,
    status: 'VALID',
    activeStatus: 'ACTIVE',
    ticketReference: ticket.ticketReference,
    eventTitle: ticket.event.title,
    eventDate: ticket.event.startDateTime ? new Date(ticket.event.startDateTime).toISOString() : null,
    venue: ticket.event.venue,
    tierName: ticket.ticketType.name,
    buyerName: (token || isStaffOrScanner) ? ticket.order.buyerName : undefined
  };
};

/**
 * Concurrency-Safe Check-In (Atomic Turnstile Transition: VALID -> CHECKED_IN)
 * Uses SELECT ... FOR UPDATE to prevent double-scan race conditions at turnstiles.
 */
export const checkInTicket = async ({ ticketCode, qrToken, qrPayload, eventId, staffId = 'GATE_STAFF' }) => {
  let code = ticketCode;
  let token = qrToken;

  if (qrPayload && !code) {
    const parts = qrPayload.split(':');
    code = parts[0];
    token = parts[1] || null;
  } else if (code && code.includes(':') && !token) {
    const parts = code.split(':');
    code = parts[0];
    token = parts[1];
  }

  if (!code) {
    throw new AppError('Ticket code or QR payload is required for check-in.', 400, 'VALIDATION_ERROR');
  }

  return await prisma.$transaction(
    async (tx) => {
      // 1. Lock Ticket row FOR UPDATE to serialize concurrent scanner attempts
      const tickets = await tx.$queryRaw`
        SELECT t.id, t."ticketReference", t."qrTokenHash", t."status", t."checkedInAt", t."checkedInBy",
               t."orderId", t."eventId", t."userId", o.status as "orderStatus"
        FROM tickets t
        JOIN orders o ON o.id = t."orderId"
        WHERE t."ticketReference" = ${code}
        FOR UPDATE OF t
      `;

      if (!tickets || tickets.length === 0) {
        throw new AppError('Ticket not found.', 404, 'TICKET_NOT_FOUND');
      }

      const ticket = tickets[0];

      // 2. Validate order status
      if (ticket.orderStatus !== 'PAID') {
        throw new AppError(
          `Cannot check in ticket: associated order is not paid (status: ${ticket.orderStatus}).`,
          400,
          'ORDER_NOT_PAID'
        );
      }

      // 3. Replay / Double-Scan Protection
      if (ticket.status === 'CHECKED_IN') {
        throw new AppError(
          `Ticket has already been used and checked in at ${new Date(ticket.checkedInAt).toISOString()}.`,
          409,
          'TICKET_ALREADY_USED',
          { checkedInAt: ticket.checkedInAt }
        );
      }

      // 4. Invalidation protections
      if (ticket.status === 'CANCELLED') {
        throw new AppError('Ticket has been cancelled and cannot be used.', 400, 'TICKET_CANCELLED');
      }

      if (ticket.status === 'REFUNDED') {
        throw new AppError('Ticket has been refunded and cannot be used.', 400, 'TICKET_REFUNDED');
      }

      // 5. Event verification
      if (eventId && ticket.eventId !== eventId) {
        throw new AppError('Ticket belongs to a different event.', 400, 'EVENT_MISMATCH');
      }

      // 6. Cryptographic signature check if token provided
      if (token) {
        const isSignatureValid = verifyTicketQrToken(ticket, token);
        if (!isSignatureValid) {
          throw new AppError('Cryptographic QR signature does not match ticket.', 400, 'INVALID_QR_CREDENTIAL');
        }
      }

      // 7. Atomic transition: VALID -> CHECKED_IN
      const now = new Date();
      await tx.$executeRaw`
        UPDATE tickets
        SET "status" = 'CHECKED_IN'::"TicketStatus",
            "checkedInAt" = ${now},
            "checkedInBy" = ${staffId}
        WHERE id = ${ticket.id}::uuid
      `;

      logger.info({
        msg: 'Ticket checked in successfully',
        ticketReference: code,
        checkedInBy: staffId
      });

      return {
        success: true,
        message: 'Ticket checked in successfully.',
        ticketReference: code,
        status: 'CHECKED_IN',
        activeStatus: 'USED',
        checkedInAt: now.toISOString()
      };
    },
    {
      isolationLevel: 'ReadCommitted',
      timeout: 30000,
      maxWait: 15000
    }
  );
};
