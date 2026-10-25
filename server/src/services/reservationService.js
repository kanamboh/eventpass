import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { formatCurrency } from './eventService.js';

/**
 * Format a single reservation into a clean client DTO
 */
export const formatReservationDto = (reservation) => {
  const now = Date.now();
  const expiresAtMs = new Date(reservation.expiresAt).getTime();
  const secondsRemaining = Math.max(0, Math.floor((expiresAtMs - now) / 1000));
  const isExpired = secondsRemaining <= 0 || reservation.status === 'EXPIRED';

  const ticketType = reservation.ticketType || {};
  const event = ticketType.event || {};
  const unitPriceMinor = ticketType.priceMinor ?? 0;
  const lineTotalMinor = unitPriceMinor * reservation.quantity;
  const currency = ticketType.currency || 'ZAR';

  const unitPriceUsdMinor = ticketType.paymentPriceUsdMinor ?? 0;
  const lineTotalUsdMinor = unitPriceUsdMinor * reservation.quantity;
  const paymentCurrency = 'USD';

  return {
    id: reservation.id,
    userId: reservation.userId,
    ticketTypeId: reservation.ticketTypeId,
    tierName: ticketType.name || 'Standard Ticket',
    eventId: event.id || ticketType.eventId,
    eventTitle: event.title || 'Event',
    eventSlug: event.slug,
    eventVenue: event.venue || '',
    eventLocation: event.location || '',
    eventDate: event.startDateTime ? new Date(event.startDateTime).toISOString() : null,
    eventImage: event.imageUrl || '',
    quantity: reservation.quantity,
    unitPriceMinor,
    unitPriceFormatted: formatCurrency(unitPriceMinor, currency),
    lineTotalMinor,
    lineTotalFormatted: formatCurrency(lineTotalMinor, currency),
    currency,
    unitPriceUsdMinor,
    unitPriceUsdFormatted: formatCurrency(unitPriceUsdMinor, paymentCurrency),
    lineTotalUsdMinor,
    lineTotalUsdFormatted: formatCurrency(lineTotalUsdMinor, paymentCurrency),
    paymentCurrency,
    status: isExpired && reservation.status === 'ACTIVE' ? 'EXPIRED' : reservation.status,
    expiresAt: reservation.expiresAt.toISOString(),
    secondsRemaining: reservation.status === 'ACTIVE' && !isExpired ? secondsRemaining : 0,
    createdAt: reservation.createdAt.toISOString()
  };
};

/**
 * Cleanup expired reservations across the system or for a specific ticket type
 */
export const cleanupExpiredReservations = async (tx = prisma, ticketTypeId = null) => {
  const now = new Date();
  const where = {
    status: 'ACTIVE',
    expiresAt: { lt: now }
  };
  if (ticketTypeId) {
    where.ticketTypeId = ticketTypeId;
  }

  return await tx.reservation.updateMany({
    where,
    data: {
      status: 'EXPIRED'
    }
  });
};

/**
 * Create a ticket reservation with atomic row locking and concurrency protection
 * Rule: available = Math.max(0, quantityTotal - quantitySold - activeUnexpiredReservations)
 */
export const createReservation = async ({ userId, sessionId, ticketTypeId, quantity }) => {
  return await prisma.$transaction(
    async (tx) => {
      // 1. Lock the ticket type row using PostgreSQL SELECT ... FOR UPDATE
      // This strictly serializes concurrent reservation attempts for this ticket tier
      const lockedRows = await tx.$queryRaw`
        SELECT 
          t.id, 
          t."eventId", 
          t.name, 
          t."priceMinor", 
          t.currency,
          t."quantityTotal", 
          t."quantitySold", 
          t."quantityReserved", 
          t.status, 
          t."isActive",
          t."maxPerOrder",
          e.status as "eventStatus",
          e."isActive" as "eventIsActive"
        FROM ticket_types t
        JOIN events e ON e.id = t."eventId"
        WHERE t.id = ${ticketTypeId}::uuid
        FOR UPDATE OF t
      `;

      if (!lockedRows || lockedRows.length === 0) {
        throw new AppError('Ticket type not found.', 404, 'TICKET_TYPE_NOT_FOUND');
      }

      const lockedTier = lockedRows[0];

      // Part H Safety: DRAFT, CANCELLED, or COMPLETED events are not purchasable
      if (lockedTier.eventStatus !== 'PUBLISHED' || !lockedTier.eventIsActive) {
        throw new AppError(
          `Cannot reserve tickets: event is not currently published (status: ${lockedTier.eventStatus}).`,
          400,
          'EVENT_NOT_PUBLISHED'
        );
      }

      if (!lockedTier.isActive || lockedTier.status === 'INACTIVE') {
        throw new AppError('Ticket tier is currently not available for reservation.', 400, 'TICKET_TYPE_INACTIVE');
      }

      if (quantity > lockedTier.maxPerOrder) {
        throw new AppError(
          `Requested quantity (${quantity}) exceeds tier maximum of ${lockedTier.maxPerOrder} tickets.`,
          400,
          'MAX_PER_ORDER_EXCEEDED'
        );
      }

      // 2. Check per-user total active hold limit to prevent ticket hoarding abuse
      const userActiveHoldsResult = await tx.$queryRaw`
        SELECT COALESCE(SUM(quantity), 0)::int as "totalHeld"
        FROM reservations
        WHERE "userId" = ${userId}::uuid
          AND status = 'ACTIVE'::"ReservationStatus"
          AND "expiresAt" > NOW()
      `;
      const totalHeld = Number(userActiveHoldsResult[0]?.totalHeld || 0);
      const MAX_USER_ACTIVE_HOLDS = 20;
      if (totalHeld + quantity > MAX_USER_ACTIVE_HOLDS) {
        throw new AppError(
          `Active reservation limit exceeded. You may hold at most ${MAX_USER_ACTIVE_HOLDS} tickets simultaneously across active reservations. Currently holding ${totalHeld}.`,
          400,
          'ACTIVE_RESERVATIONS_LIMIT_EXCEEDED'
        );
      }

      // 3. Mark any expired reservations for this ticket type as EXPIRED
      await tx.$executeRaw`
        UPDATE reservations
        SET status = 'EXPIRED'::"ReservationStatus", "updatedAt" = NOW()
        WHERE "ticketTypeId" = ${ticketTypeId}::uuid
          AND status = 'ACTIVE'::"ReservationStatus"
          AND "expiresAt" <= NOW()
      `;

      // 4. Authoritatively aggregate currently active, unexpired reservations
      const activeReservedResult = await tx.$queryRaw`
        SELECT COALESCE(SUM(quantity), 0)::int as "activeReserved"
        FROM reservations
        WHERE "ticketTypeId" = ${ticketTypeId}::uuid
          AND status = 'ACTIVE'::"ReservationStatus"
          AND "expiresAt" > NOW()
      `;

      const activeReserved = Number(activeReservedResult[0]?.activeReserved || 0);
      const total = Number(lockedTier.quantityTotal) || 0;
      const sold = Number(lockedTier.quantitySold) || 0;
      const available = Math.max(0, total - sold - activeReserved);

      // 5. Verify inventory sufficiency
      if (quantity > available) {
        throw new AppError(
          `Insufficient ticket inventory. Requested ${quantity}, but only ${available} available.`,
          409,
          'INSUFFICIENT_INVENTORY',
          { requested: quantity, available }
        );
      }

      // 6. Create reservation with server-authoritative TTL
      const expiresAt = new Date(Date.now() + env.RESERVATION_TTL_SECONDS * 1000);

      const reservation = await tx.reservation.create({
        data: {
          userId,
          sessionId: sessionId || userId,
          ticketTypeId,
          quantity,
          status: 'ACTIVE',
          expiresAt
        },
        include: {
          ticketType: {
            include: {
              event: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  venue: true,
                  location: true,
                  startDateTime: true,
                  imageUrl: true
                }
              }
            }
          }
        }
      });

      // 7. Update ticket_types quantityReserved and quantityAvailable to maintain strict invariant
      await tx.$executeRaw`
        UPDATE ticket_types
        SET 
          "quantityReserved" = (
            SELECT COALESCE(SUM(quantity), 0)::int
            FROM reservations
            WHERE "ticketTypeId" = ${ticketTypeId}::uuid
              AND status = 'ACTIVE'::"ReservationStatus"
              AND "expiresAt" > NOW()
          ),
          "quantityAvailable" = GREATEST(0, "quantityTotal" - "quantitySold" - (
            SELECT COALESCE(SUM(quantity), 0)::int
            FROM reservations
            WHERE "ticketTypeId" = ${ticketTypeId}::uuid
              AND status = 'ACTIVE'::"ReservationStatus"
              AND "expiresAt" > NOW()
          )),
          "updatedAt" = NOW()
        WHERE id = ${ticketTypeId}::uuid
      `;

      return {
        reservation: formatReservationDto(reservation),
        availableRemaining: available - quantity
      };
    },
    {
      isolationLevel: 'ReadCommitted',
      timeout: 30000
    }
  );
};

/**
 * Retrieve all active, unexpired reservations for the authenticated user
 */
export const getUserReservations = async (userId) => {
  // First mark expired reservations for this user as EXPIRED
  const now = new Date();
  await prisma.reservation.updateMany({
    where: {
      userId,
      status: 'ACTIVE',
      expiresAt: { lte: now }
    },
    data: {
      status: 'EXPIRED'
    }
  });

  const reservations = await prisma.reservation.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      expiresAt: { gt: now }
    },
    include: {
      ticketType: {
        include: {
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
              venue: true,
              location: true,
              startDateTime: true,
              imageUrl: true
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  const formattedItems = reservations.map(formatReservationDto);
  const totalQuantity = formattedItems.reduce((acc, r) => acc + r.quantity, 0);
  const subtotalMinor = formattedItems.reduce((acc, r) => acc + r.lineTotalMinor, 0);
  const serviceFeeMinor = formattedItems.length > 0 ? 1500 : 0; // R15.00 flat fee
  const totalMinor = subtotalMinor + serviceFeeMinor;

  const paymentSubtotalUsdMinor = formattedItems.reduce((acc, r) => acc + (r.lineTotalUsdMinor || 0), 0);
  const paymentServiceFeeUsdMinor = paymentSubtotalUsdMinor > 0 ? 100 : 0; // $1.00 USD flat fee when USD pricing is active
  const paymentTotalUsdMinor = paymentSubtotalUsdMinor > 0 ? paymentSubtotalUsdMinor + paymentServiceFeeUsdMinor : 0;

  return {
    items: formattedItems,
    count: formattedItems.length,
    totalQuantity,
    subtotalMinor,
    subtotalFormatted: formatCurrency(subtotalMinor),
    serviceFeeMinor,
    serviceFeeFormatted: formatCurrency(serviceFeeMinor),
    totalMinor,
    totalFormatted: formatCurrency(totalMinor),
    paymentSubtotalUsdMinor,
    paymentSubtotalUsdFormatted: formatCurrency(paymentSubtotalUsdMinor, 'USD'),
    paymentServiceFeeUsdMinor,
    paymentServiceFeeUsdFormatted: formatCurrency(paymentServiceFeeUsdMinor, 'USD'),
    paymentTotalUsdMinor,
    paymentTotalUsdFormatted: formatCurrency(paymentTotalUsdMinor, 'USD'),
    paymentCurrency: 'USD'
  };
};

/**
 * Retrieve single reservation by ID with strict ownership validation (BOLA defense)
 */
export const getReservationById = async (id, userId) => {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      ticketType: {
        include: {
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
              venue: true,
              location: true,
              startDateTime: true,
              imageUrl: true
            }
          }
        }
      }
    }
  });

  if (!reservation) {
    throw new AppError('Reservation not found.', 404, 'RESERVATION_NOT_FOUND');
  }

  // Ownership verification
  if (reservation.userId !== userId) {
    throw new AppError('You do not have permission to view this reservation.', 403, 'FORBIDDEN');
  }

  // Check expiration
  if (reservation.status === 'ACTIVE' && new Date(reservation.expiresAt) <= new Date()) {
    await prisma.reservation.update({
      where: { id },
      data: { status: 'EXPIRED' }
    });
    reservation.status = 'EXPIRED';
  }

  return formatReservationDto(reservation);
};

/**
 * Cancel a user's reservation and release the held inventory atomically
 */
export const cancelReservation = async (id, userId) => {
  return await prisma.$transaction(
    async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id },
        include: {
          ticketType: {
            include: {
              event: true
            }
          }
        }
      });

      if (!reservation) {
        throw new AppError('Reservation not found.', 404, 'RESERVATION_NOT_FOUND');
      }

      // Ownership verification (BOLA defense)
      if (reservation.userId !== userId) {
        throw new AppError('You do not have permission to cancel this reservation.', 403, 'FORBIDDEN');
      }

      // If already cancelled, return idempotent response
      if (reservation.status === 'CANCELLED') {
        return formatReservationDto(reservation);
      }

      if (reservation.status === 'CONVERTED') {
        throw new AppError(
          'Cannot cancel a reservation that has already been converted to an order.',
          400,
          'RESERVATION_ALREADY_CONVERTED'
        );
      }

      if (reservation.status === 'EXPIRED' || new Date(reservation.expiresAt) <= new Date()) {
        throw new AppError(
          'Cannot cancel an expired reservation.',
          400,
          'RESERVATION_EXPIRED'
        );
      }

      // Lock the ticket type row to serialize inventory adjustments
      await tx.$queryRaw`
        SELECT id FROM ticket_types
        WHERE id = ${reservation.ticketTypeId}::uuid
        FOR UPDATE
      `;

      // Update reservation status to CANCELLED
      const updatedReservation = await tx.reservation.update({
        where: { id },
        data: {
          status: 'CANCELLED'
        },
        include: {
          ticketType: {
            include: {
              event: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  venue: true,
                  location: true,
                  startDateTime: true,
                  imageUrl: true
                }
              }
            }
          }
        }
      });

      // Recalculate remaining active reservations for this tier and update quantityReserved and quantityAvailable
      await tx.$executeRaw`
        UPDATE ticket_types
        SET 
          "quantityReserved" = (
            SELECT COALESCE(SUM(quantity), 0)::int
            FROM reservations
            WHERE "ticketTypeId" = ${reservation.ticketTypeId}::uuid
              AND status = 'ACTIVE'::"ReservationStatus"
              AND "expiresAt" > NOW()
          ),
          "quantityAvailable" = GREATEST(0, "quantityTotal" - "quantitySold" - (
            SELECT COALESCE(SUM(quantity), 0)::int
            FROM reservations
            WHERE "ticketTypeId" = ${reservation.ticketTypeId}::uuid
              AND status = 'ACTIVE'::"ReservationStatus"
              AND "expiresAt" > NOW()
          )),
          "updatedAt" = NOW()
        WHERE id = ${reservation.ticketTypeId}::uuid
      `;

      return formatReservationDto(updatedReservation);
    },
    {
      isolationLevel: 'ReadCommitted',
      timeout: 30000
    }
  );
};
