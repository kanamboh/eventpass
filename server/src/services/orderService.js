import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { formatCurrency } from './eventService.js';
import { validatePromoCodeAgainstCart } from './promoCodeService.js';

/**
 * Format an Order model into a clean public DTO
 */
export const formatOrderDto = (order) => {
  const orderItems = order.orderItems || [];
  const paymentCurrency = order.paymentCurrency || 'USD';
  const formattedItems = orderItems.map((item) => {
    const tier = item.ticketType || {};
    const event = item.event || {};
    const unitPriceUsdMinor = item.unitPriceUsdMinor !== undefined && item.unitPriceUsdMinor !== null
      ? item.unitPriceUsdMinor
      : (tier.paymentPriceUsdMinor || 0);
    const totalUsdMinor = item.totalUsdMinor !== undefined && item.totalUsdMinor !== null
      ? item.totalUsdMinor
      : (unitPriceUsdMinor * item.quantity);

    return {
      id: item.id,
      ticketTypeId: item.ticketTypeId,
      tierName: tier.name || 'Ticket Tier',
      eventId: item.eventId,
      eventTitle: event.title || 'Event',
      eventSlug: event.slug,
      eventVenue: event.venue || '',
      eventDate: event.startDateTime ? new Date(event.startDateTime).toISOString() : null,
      eventImage: event.imageUrl || '',
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      unitPriceFormatted: formatCurrency(item.unitPriceMinor, order.currency),
      totalMinor: item.totalMinor,
      totalFormatted: formatCurrency(item.totalMinor, order.currency),
      unitPriceUsdMinor,
      unitPriceUsdFormatted: formatCurrency(unitPriceUsdMinor, paymentCurrency, true),
      totalUsdMinor,
      totalUsdFormatted: formatCurrency(totalUsdMinor, paymentCurrency, true)
    };
  });

  const paymentSubtotalUsdMinor = order.paymentSubtotalUsdMinor || 0;
  const paymentServiceFeeUsdMinor = order.paymentServiceFeeUsdMinor || 0;
  const paymentTotalUsdMinor = order.paymentTotalUsdMinor || 0;

  return {
    id: order.id,
    orderReference: order.orderReference,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    buyerPhone: order.buyerPhone,
    currency: order.currency,
    subtotalMinor: order.subtotalMinor,
    subtotalFormatted: formatCurrency(order.subtotalMinor, order.currency),
    serviceFeeMinor: order.serviceFeeMinor,
    serviceFeeFormatted: formatCurrency(order.serviceFeeMinor, order.currency),
    discountMinor: order.discountMinor,
    discountFormatted: formatCurrency(order.discountMinor, order.currency),
    promoCodeId: order.promoCodeId || null,
    promoCode: order.promoCode?.code || null,
    totalMinor: order.totalMinor,
    totalFormatted: formatCurrency(order.totalMinor, order.currency),
    paymentCurrency,
    paymentSubtotalUsdMinor,
    paymentSubtotalUsdFormatted: formatCurrency(paymentSubtotalUsdMinor, paymentCurrency, true),
    paymentServiceFeeUsdMinor,
    paymentServiceFeeUsdFormatted: formatCurrency(paymentServiceFeeUsdMinor, paymentCurrency, true),
    paymentTotalUsdMinor,
    paymentTotalUsdFormatted: formatCurrency(paymentTotalUsdMinor, paymentCurrency, true),
    status: order.status,
    paymentProvider: order.paymentProvider,
    paymentReference: order.paymentReference,
    expiresAt: order.expiresAt ? order.expiresAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    ticketCount: order.tickets ? order.tickets.length : formattedItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
    tickets: (order.tickets || []).map((t) => ({
      id: t.id,
      ticketReference: t.ticketReference,
      status: t.status
    })),
    items: formattedItems
  };
};

/**
 * Create a new pending order by atomically converting active reservations
 * Server-authoritative: completely ignores client-supplied prices, totals, or statuses
 */
export const createOrder = async ({ userId, user, reservationIds, buyerDetails = {}, promoCode, idempotencyKey }) => {
  return await prisma.$transaction(
    async (tx) => {
      // 1. Database-backed Idempotency Check
      if (idempotencyKey) {
        const existingOrder = await tx.order.findUnique({
          where: {
            userId_idempotencyKey: {
              userId,
              idempotencyKey
            }
          },
          include: {
            promoCode: {
              select: {
                id: true,
                code: true,
                description: true,
                discountType: true,
                discountValue: true
              }
            },
            orderItems: {
              include: {
                ticketType: true,
                event: {
                  select: { id: true, title: true, slug: true, venue: true, location: true, imageUrl: true, startDateTime: true }
                }
              }
            },
            reservations: {
              select: { id: true }
            }
          }
        });

        if (existingOrder) {
          // If the client attempts to reuse the idempotency key with different order data, reject
          if (reservationIds && reservationIds.length > 0) {
            const existingResIds = (existingOrder.reservations || []).map((r) => r.id).sort();
            const requestedResIds = [...reservationIds].sort();
            const isMatch =
              existingResIds.length === requestedResIds.length &&
              existingResIds.every((id, idx) => id === requestedResIds[idx]);

            if (!isMatch) {
              throw new AppError(
                'Idempotency key has already been used with different order parameters.',
                409,
                'IDEMPOTENCY_KEY_MISMATCH'
              );
            }
          }
          return formatOrderDto(existingOrder);
        }
      }

      // 2. Fetch target reservations with row locks (FOR UPDATE, sorted to prevent deadlocks)
      let reservations;
      if (reservationIds && reservationIds.length > 0) {
        // Query specific requested reservations
        reservations = await tx.$queryRaw`
          SELECT 
            id, 
            "userId", 
            "ticketTypeId", 
            quantity, 
            status, 
            "orderId", 
            "expiresAt"
          FROM reservations
          WHERE "userId" = ${userId}::uuid
            AND id = ANY(${reservationIds}::uuid[])
          ORDER BY id ASC
          FOR UPDATE
        `;

        if (reservations.length !== reservationIds.length) {
          throw new AppError(
            'One or more requested reservations do not exist or do not belong to you.',
            403,
            'RESERVATION_ACCESS_DENIED'
          );
        }
      } else {
        // Query all active unexpired reservations for this user
        reservations = await tx.$queryRaw`
          SELECT 
            id, 
            "userId", 
            "ticketTypeId", 
            quantity, 
            status, 
            "orderId", 
            "expiresAt"
          FROM reservations
          WHERE "userId" = ${userId}::uuid
            AND status = 'ACTIVE'::"ReservationStatus"
            AND "expiresAt" > NOW()
          ORDER BY id ASC
          FOR UPDATE
        `;
      }

      if (!reservations || reservations.length === 0) {
        throw new AppError('No active reservations found to create order.', 400, 'NO_ACTIVE_RESERVATIONS');
      }

      // 3. Strict lifecycle validation on each reservation
      const now = new Date();
      for (const res of reservations) {
        // Ownership check
        if (res.userId !== userId) {
          throw new AppError('Unauthorized access to reservation.', 403, 'FORBIDDEN');
        }

        // Already converted check (prevents double-order creation)
        if (res.status === 'CONVERTED' || res.orderId !== null) {
          throw new AppError(
            'Reservation has already been converted to an order and cannot be reused.',
            409,
            'RESERVATION_ALREADY_CONVERTED'
          );
        }

        // Cancelled check
        if (res.status === 'CANCELLED') {
          throw new AppError('Cannot create an order from a cancelled reservation.', 400, 'RESERVATION_CANCELLED');
        }

        // Expiration check
        if (res.status === 'EXPIRED' || new Date(res.expiresAt) <= now) {
          await tx.$executeRaw`
            UPDATE reservations
            SET status = 'EXPIRED'::"ReservationStatus", "updatedAt" = NOW()
            WHERE id = ${res.id}::uuid
          `;
          throw new AppError(
            'One or more reservations have expired. Please reselect your tickets.',
            409,
            'RESERVATION_EXPIRED'
          );
        }

        if (res.status !== 'ACTIVE') {
          throw new AppError(
            `Reservation cannot be converted because it is ${res.status}.`,
            400,
            'INVALID_RESERVATION_STATUS'
          );
        }
      }

      // 4. Retrieve authoritative ticket types and events from DB with FOR UPDATE locks
      const targetTicketTypeIds = [...new Set(reservations.map((r) => r.ticketTypeId))].sort();
      
      // Lock affected ticket types to serialize inventory synchronization
      await tx.$queryRaw`
        SELECT id FROM ticket_types
        WHERE id = ANY(${targetTicketTypeIds}::uuid[])
        ORDER BY id ASC
        FOR UPDATE
      `;

      const ticketTypes = await tx.ticketType.findMany({
        where: { id: { in: targetTicketTypeIds } },
        include: {
          event: true
        }
      });
      const ticketTypeMap = new Map(ticketTypes.map((t) => [t.id, t]));

      // 5. Calculate line totals and subtotal strictly via server integer minor units
      let subtotalMinor = 0;
      let paymentSubtotalUsdMinor = 0;
      const orderItemsToCreate = [];

      for (const res of reservations) {
        const ticketType = ticketTypeMap.get(res.ticketTypeId);
        if (!ticketType) {
          throw new AppError('Referenced ticket type no longer exists.', 400, 'TICKET_TYPE_NOT_FOUND');
        }

        if (ticketType.event?.status !== 'PUBLISHED' || !ticketType.event?.isActive) {
          throw new AppError(
            `Cannot create order: event is not currently published (status: ${ticketType.event?.status || 'UNKNOWN'}).`,
            400,
            'EVENT_NOT_PUBLISHED'
          );
        }

        // Authoritative ZAR price directly from DB record (ignore any client price)
        const unitPriceMinor = ticketType.priceMinor;
        const lineTotalMinor = unitPriceMinor * res.quantity;
        subtotalMinor += lineTotalMinor;

        // Authoritative USD payment price directly from DB record (ignore any client price)
        const unitPriceUsdMinor = ticketType.paymentPriceUsdMinor !== undefined && ticketType.paymentPriceUsdMinor !== null
          ? Number(ticketType.paymentPriceUsdMinor)
          : 0;
        const lineTotalUsdMinor = unitPriceUsdMinor * res.quantity;
        paymentSubtotalUsdMinor += lineTotalUsdMinor;

        orderItemsToCreate.push({
          ticketTypeId: ticketType.id,
          eventId: ticketType.eventId,
          quantity: res.quantity,
          unitPriceMinor,
          totalMinor: lineTotalMinor,
          unitPriceUsdMinor,
          totalUsdMinor: lineTotalUsdMinor
        });
      }

      // Service fee calculation (R15.00 flat fee for ZAR booking, $1.00 USD for payment)
      const serviceFeeMinor = reservations.length > 0 ? 1500 : 0;
      let discountMinor = 0;
      let promoCodeId = null;

      if (promoCode) {
        const promoItems = reservations.map((r) => ({
          ticketTypeId: r.ticketTypeId,
          quantity: r.quantity
        }));
        const promoValidation = await validatePromoCodeAgainstCart({
          code: promoCode,
          items: promoItems,
          userId,
          customerEmail: buyerDetails.email || user.email,
          tx
        });
        discountMinor = promoValidation.discountMinor;
        promoCodeId = promoValidation.promoCode.id;
      }

      const totalMinor = Math.max(0, subtotalMinor + serviceFeeMinor - discountMinor);
      const currency = ticketTypes[0]?.currency || 'ZAR';

      const usdDiscountMinor = subtotalMinor > 0 && paymentSubtotalUsdMinor > 0
        ? Math.round((discountMinor / subtotalMinor) * paymentSubtotalUsdMinor)
        : 0;
      const paymentServiceFeeUsdMinor = paymentSubtotalUsdMinor > 0 ? 100 : 0;
      const paymentTotalUsdMinor = paymentSubtotalUsdMinor > 0
        ? Math.max(0, paymentSubtotalUsdMinor + paymentServiceFeeUsdMinor - usdDiscountMinor)
        : 0;
      const paymentCurrency = paymentTotalUsdMinor > 0 ? 'USD' : currency;

      // 6. Generate unique order reference (e.g., EP-WT-849201)
      const randSegment = Math.floor(100000 + Math.random() * 900000);
      const orderReference = `EP-${Date.now().toString(36).toUpperCase()}-${randSegment}`;

      // Buyer identity resolution
      const buyerName = buyerDetails.firstName
        ? `${buyerDetails.firstName} ${buyerDetails.lastName || ''}`.trim()
        : user.fullName;
      const buyerEmail = buyerDetails.email || user.email;
      const buyerPhone = buyerDetails.phone || user.phone || null;

      // 7. Create Order in PENDING status with unique idempotencyKey
      const order = await tx.order.create({
        data: {
          orderReference,
          userId,
          buyerName,
          buyerEmail,
          buyerPhone,
          subtotalMinor,
          serviceFeeMinor,
          discountMinor,
          promoCodeId,
          totalMinor,
          currency,
          paymentSubtotalUsdMinor,
          paymentServiceFeeUsdMinor,
          paymentTotalUsdMinor,
          paymentCurrency,
          status: 'PENDING',
          paymentProvider: 'PAYSTACK',
          paymentReference: idempotencyKey || null,
          idempotencyKey: idempotencyKey || null,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15-minute payment window
          orderItems: {
            create: orderItemsToCreate
          }
        },
        include: {
          promoCode: {
            select: {
              id: true,
              code: true,
              description: true,
              discountType: true,
              discountValue: true
            }
          },
          orderItems: {
            include: {
              ticketType: true,
              event: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  venue: true,
                  location: true,
                  imageUrl: true,
                  startDateTime: true
                }
              }
            }
          }
        }
      });

      // 8. Atomically convert reservations so they can never be reused
      const reservationIdsToConvert = reservations.map((r) => r.id);
      const updateResult = await tx.$executeRaw`
        UPDATE reservations
        SET status = 'CONVERTED'::"ReservationStatus",
            "orderId" = ${order.id}::uuid,
            "updatedAt" = NOW()
        WHERE id = ANY(${reservationIdsToConvert}::uuid[])
          AND status = 'ACTIVE'::"ReservationStatus"
          AND "expiresAt" > NOW()
      `;

      if (updateResult !== reservationIdsToConvert.length) {
        throw new AppError(
          'Failed to convert one or more reservations. They may have expired or already been converted.',
          409,
          'RESERVATION_CONVERSION_FAILED'
        );
      }

      // 9. Synchronize quantityReserved and quantityAvailable on all affected ticket types
      await tx.$executeRaw`
        UPDATE ticket_types tt
        SET 
          "quantityReserved" = (
            SELECT COALESCE(SUM(r.quantity), 0)::int
            FROM reservations r
            WHERE r."ticketTypeId" = tt.id
              AND r.status = 'ACTIVE'::"ReservationStatus"
              AND r."expiresAt" > NOW()
          ),
          "quantityAvailable" = GREATEST(0, tt."quantityTotal" - tt."quantitySold" - (
            SELECT COALESCE(SUM(r.quantity), 0)::int
            FROM reservations r
            WHERE r."ticketTypeId" = tt.id
              AND r.status = 'ACTIVE'::"ReservationStatus"
              AND r."expiresAt" > NOW()
          )),
          "updatedAt" = NOW()
        WHERE tt.id = ANY(${targetTicketTypeIds}::uuid[])
      `;

      return formatOrderDto(order);
    },
    {
      isolationLevel: 'ReadCommitted',
      timeout: 30000
    }
  );
};

/**
 * Retrieve user's orders with ownership verification (BOLA defense)
 */
export const getUserOrders = async (userId) => {
  const orders = await prisma.order.findMany({
    where: { userId },
    include: {
      promoCode: {
        select: { id: true, code: true, description: true, discountType: true, discountValue: true }
      },
      orderItems: {
        include: {
          ticketType: true,
          event: {
            select: { id: true, title: true, slug: true, venue: true, location: true, imageUrl: true, startDateTime: true }
          }
        }
      },
      tickets: {
        select: { id: true, ticketReference: true, status: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return orders.map(formatOrderDto);
};

/**
 * Retrieve a specific order by ID with ownership verification
 */
export const getOrderById = async (id, userId) => {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      promoCode: {
        select: { id: true, code: true, description: true, discountType: true, discountValue: true }
      },
      orderItems: {
        include: {
          ticketType: true,
          event: {
            select: { id: true, title: true, slug: true, venue: true, location: true, imageUrl: true, startDateTime: true }
          }
        }
      },
      tickets: {
        select: { id: true, ticketReference: true, status: true }
      }
    }
  });

  if (!order) {
    throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
  }

  if (order.userId !== userId) {
    throw new AppError('You do not have permission to view this order.', 403, 'FORBIDDEN');
  }

  return formatOrderDto(order);
};
