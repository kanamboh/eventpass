import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { formatCurrency } from './eventService.js';
import { recordAdminAuditLog } from './adminService.js';

/**
 * Normalizes promo code string consistently: trims whitespace and capitalizes
 */
export const normalizePromoCode = (code) => {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase();
};

/**
 * Computes discount strictly adhering to currency minor units (cents)
 * Discount CANNOT exceed the eligible subtotal
 */
export const calculatePromoDiscount = ({ promo, eligibleSubtotalMinor }) => {
  if (eligibleSubtotalMinor <= 0) return 0;

  let calculatedDiscountMinor = 0;

  if (promo.discountType === 'PERCENTAGE') {
    // Percentage discount: e.g. 10% on R500.00 (50000 cents) = 5000 cents (R50.00)
    calculatedDiscountMinor = Math.floor((eligibleSubtotalMinor * promo.discountValue) / 100);

    // Apply optional cap on percentage discount if configured
    if (promo.maxDiscountMinor && promo.maxDiscountMinor > 0) {
      calculatedDiscountMinor = Math.min(calculatedDiscountMinor, promo.maxDiscountMinor);
    }
  } else if (promo.discountType === 'FIXED') {
    // Fixed discount: discountValue is stored in integer minor units (ZAR cents)
    calculatedDiscountMinor = promo.discountValue;
  }

  // Safety invariant: discount can NEVER exceed eligible subtotal
  calculatedDiscountMinor = Math.min(calculatedDiscountMinor, eligibleSubtotalMinor);

  // Guarantee non-negative integer
  return Math.max(0, calculatedDiscountMinor);
};

/**
 * Validates a promotional code against cart items using authoritative DB records
 * Server-authoritative: completely ignores any client-supplied prices or discounts
 */
export const validatePromoCodeAgainstCart = async ({
  code,
  items,
  userId = null,
  customerEmail = null,
  tx = prisma
}) => {
  const normalizedCode = normalizePromoCode(code);
  if (!normalizedCode) {
    throw new AppError('Promotional code cannot be empty.', 400, 'PROMO_CODE_EMPTY');
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError('At least one ticket item is required to validate a promo code.', 400, 'EMPTY_CART');
  }

  // 1. Fetch promo code from DB with restrictions
  const promo = await tx.promoCode.findFirst({
    where: {
      code: {
        equals: normalizedCode,
        mode: 'insensitive'
      }
    },
    include: {
      events: true,
      ticketTypes: true
    }
  });

  if (!promo) {
    throw new AppError(`Promotional code "${normalizedCode}" does not exist.`, 404, 'PROMO_CODE_NOT_FOUND');
  }

  // 2. Active status check
  if (!promo.isActive) {
    throw new AppError(`Promotional code "${promo.code}" is currently inactive.`, 400, 'PROMO_CODE_INACTIVE');
  }

  const now = new Date();

  // 3. Start date check
  if (promo.startsAt && now < new Date(promo.startsAt)) {
    throw new AppError(
      `Promotional code "${promo.code}" is not yet active (valid from ${new Date(promo.startsAt).toLocaleDateString('en-ZA')}).`,
      400,
      'PROMO_CODE_NOT_STARTED'
    );
  }

  // 4. Expiration check
  if (promo.expiresAt && now >= new Date(promo.expiresAt)) {
    throw new AppError(
      `Promotional code "${promo.code}" has expired on ${new Date(promo.expiresAt).toLocaleDateString('en-ZA')}.`,
      400,
      'PROMO_CODE_EXPIRED'
    );
  }

  // 5. Global redemption limit check
  if (promo.maxTotalRedemptions !== null && promo.currentRedemptions >= promo.maxTotalRedemptions) {
    throw new AppError(
      `Promotional code "${promo.code}" has reached its maximum total redemption limit.`,
      400,
      'PROMO_GLOBAL_LIMIT_EXHAUSTED'
    );
  }

  // 6. Per-customer redemption limit check
  if (promo.maxPerCustomer !== null && (userId || customerEmail)) {
    const customerConditions = [];
    if (userId) customerConditions.push({ userId });
    if (customerEmail) customerConditions.push({ customerEmail: customerEmail.toLowerCase().trim() });

    const existingRedemptions = await tx.promoCodeRedemption.count({
      where: {
        promoCodeId: promo.id,
        OR: customerConditions
      }
    });

    if (existingRedemptions >= promo.maxPerCustomer) {
      throw new AppError(
        `You have already reached the redemption limit (${promo.maxPerCustomer}) for code "${promo.code}".`,
        400,
        'PROMO_CUSTOMER_LIMIT_REACHED'
      );
    }
  }

  // 7. Authoritatively retrieve ticket types and events from DB
  const requestedTicketTypeIds = [...new Set(items.map((i) => i.ticketTypeId))];
  const ticketTypes = await tx.ticketType.findMany({
    where: {
      id: { in: requestedTicketTypeIds }
    },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          isActive: true
        }
      }
    }
  });

  const ticketTypeMap = new Map(ticketTypes.map((t) => [t.id, t]));

  // Verify all requested ticket types exist
  for (const item of items) {
    if (!ticketTypeMap.has(item.ticketTypeId)) {
      throw new AppError(
        `Ticket type "${item.ticketTypeId}" does not exist.`,
        400,
        'TICKET_TYPE_NOT_FOUND'
      );
    }
  }

  // 8. Determine item eligibility based on restrictions
  const restrictedEventIds = new Set(promo.events.map((e) => e.eventId));
  const restrictedTicketTypeIds = new Set(promo.ticketTypes.map((t) => t.ticketTypeId));
  const hasEventRestrictions = restrictedEventIds.size > 0;
  const hasTicketTypeRestrictions = restrictedTicketTypeIds.size > 0;

  let originalSubtotalMinor = 0;
  let eligibleSubtotalMinor = 0;
  let eligibleItemCount = 0;
  let totalItemCount = 0;

  const itemEvaluations = [];

  for (const item of items) {
    const tier = ticketTypeMap.get(item.ticketTypeId);
    const unitPriceMinor = tier.priceMinor;
    const lineTotalMinor = unitPriceMinor * item.quantity;
    originalSubtotalMinor += lineTotalMinor;
    totalItemCount += item.quantity;

    // Restriction check
    const matchesEvent = !hasEventRestrictions || restrictedEventIds.has(tier.eventId);
    const matchesTicketType = !hasTicketTypeRestrictions || restrictedTicketTypeIds.has(tier.id);
    const isEligible = matchesEvent && matchesTicketType;

    if (isEligible) {
      eligibleSubtotalMinor += lineTotalMinor;
      eligibleItemCount += item.quantity;
    }

    itemEvaluations.push({
      ticketTypeId: tier.id,
      tierName: tier.name,
      eventId: tier.eventId,
      eventTitle: tier.event?.title,
      quantity: item.quantity,
      unitPriceMinor,
      lineTotalMinor,
      isEligible
    });
  }

  // 9. Verify eligible items exist
  if (eligibleSubtotalMinor <= 0) {
    let restrictionMsg = 'This promotional code does not apply to any ticket items in your cart.';
    if (hasEventRestrictions && hasTicketTypeRestrictions) {
      restrictionMsg = 'This code is restricted to specific events and ticket types not currently in your cart.';
    } else if (hasEventRestrictions) {
      restrictionMsg = 'This code is only valid for selected events.';
    } else if (hasTicketTypeRestrictions) {
      restrictionMsg = 'This code is only valid for selected ticket tiers.';
    }
    throw new AppError(restrictionMsg, 400, 'PROMO_NO_ELIGIBLE_ITEMS');
  }

  // 10. Check minimum purchase amount (ZAR cents)
  if (promo.minSubtotalMinor > 0 && eligibleSubtotalMinor < promo.minSubtotalMinor) {
    const minZar = formatCurrency(promo.minSubtotalMinor, 'ZAR');
    throw new AppError(
      `A minimum eligible purchase of ${minZar} is required to apply code "${promo.code}".`,
      400,
      'PROMO_MIN_PURCHASE_NOT_MET'
    );
  }

  // 11. Calculate authoritative discount
  const discountMinor = calculatePromoDiscount({ promo, eligibleSubtotalMinor });
  const discountedSubtotalMinor = Math.max(0, originalSubtotalMinor - discountMinor);
  const serviceFeeMinor = items.length > 0 ? 1500 : 0; // Flat R15.00 booking fee
  const finalTotalMinor = discountedSubtotalMinor + serviceFeeMinor;

  return {
    valid: true,
    promoCode: {
      id: promo.id,
      code: promo.code,
      description: promo.description,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      maxDiscountMinor: promo.maxDiscountMinor,
      minSubtotalMinor: promo.minSubtotalMinor,
      hasRestrictions: hasEventRestrictions || hasTicketTypeRestrictions
    },
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    discountMinor,
    discountFormatted: formatCurrency(discountMinor, 'ZAR'),
    originalSubtotalMinor,
    originalSubtotalFormatted: formatCurrency(originalSubtotalMinor, 'ZAR'),
    eligibleSubtotalMinor,
    eligibleSubtotalFormatted: formatCurrency(eligibleSubtotalMinor, 'ZAR'),
    discountedSubtotalMinor,
    discountedSubtotalFormatted: formatCurrency(discountedSubtotalMinor, 'ZAR'),
    serviceFeeMinor,
    serviceFeeFormatted: formatCurrency(serviceFeeMinor, 'ZAR'),
    finalTotalMinor,
    finalTotalFormatted: formatCurrency(finalTotalMinor, 'ZAR'),
    currency: 'ZAR',
    restrictions: {
      hasEventRestrictions,
      hasTicketTypeRestrictions,
      eligibleItemCount,
      totalItemCount,
      partiallyEligible: eligibleItemCount < totalItemCount
    },
    items: itemEvaluations
  };
};

/**
 * Atomically records successful redemption of a promo code upon authoritative payment confirmation
 * Concurrency & Transaction Safe:
 * - Participates in outer transaction if provided, or opens an explicit transaction.
 * - Idempotent on (promoCodeId, orderId): returns existing record without double-incrementing.
 * - Per-customer concurrency: Uses pg_advisory_xact_lock to serialize concurrent attempts per customer.
 * - Global concurrency: Uses conditional UPDATE row-locking on promo_codes counter.
 * - Counter and record roll back together on any error.
 */
export const recordPromoRedemption = async ({
  promoCodeId,
  orderId = null,
  userId = null,
  customerEmail = null,
  discountAmountMinor = 0,
  tx = null
}) => {
  if (!promoCodeId) return null;

  const executeOperation = async (activeTx) => {
    // 1. Idempotency Check on (promoCodeId, orderId):
    // If this order has already recorded a redemption for this promo code, return it idempotently without incrementing counters.
    if (orderId) {
      const existingRedemption = await activeTx.promoCodeRedemption.findUnique({
        where: {
          promoCodeId_orderId: {
            promoCodeId,
            orderId
          }
        }
      });
      if (existingRedemption) {
        return existingRedemption;
      }
    }

    // 2. Fetch promo code configuration
    const promo = await activeTx.promoCode.findUnique({
      where: { id: promoCodeId }
    });

    if (!promo) {
      throw new AppError('Promotional code not found.', 404, 'PROMO_CODE_NOT_FOUND');
    }

    // 3. Per-customer concurrency protection:
    // If maxPerCustomer is configured, acquire a PostgreSQL transaction advisory lock for this customer and promo code.
    // This serializes concurrent redemption attempts for the same customer, preventing race conditions.
    const normalizedEmail = customerEmail ? customerEmail.toLowerCase().trim() : null;
    if (promo.maxPerCustomer !== null && (userId || normalizedEmail)) {
      const customerIdentifier = userId
        ? `user_${userId}`
        : `email_${normalizedEmail}`;
      const customerLockKey = `promo_${promoCodeId}_${customerIdentifier}`;
      await activeTx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${customerLockKey}))`;

      const customerFilter = [];
      if (userId) customerFilter.push({ userId });
      if (normalizedEmail) customerFilter.push({ customerEmail: normalizedEmail });

      const priorRedemptions = await activeTx.promoCodeRedemption.count({
        where: {
          promoCodeId,
          OR: customerFilter
        }
      });

      if (priorRedemptions >= promo.maxPerCustomer) {
        throw new AppError(
          `You have exceeded the maximum redemptions (${promo.maxPerCustomer}) for promotional code "${promo.code}".`,
          409,
          'CUSTOMER_REDEMPTION_LIMIT_EXCEEDED'
        );
      }
    }

    // 4. Atomic conditional update on global currentRedemptions counter
    // Uses row-locking with WHERE clause guard to prevent exceeding maxTotalRedemptions
    const updatedRows = await activeTx.$queryRaw`
      UPDATE promo_codes
      SET "currentRedemptions" = "currentRedemptions" + 1,
          "updatedAt" = NOW()
      WHERE id = ${promoCodeId}::uuid
        AND ("maxTotalRedemptions" IS NULL OR "currentRedemptions" < "maxTotalRedemptions")
      RETURNING id, "currentRedemptions", "maxTotalRedemptions", "maxPerCustomer";
    `;

    if (!updatedRows || updatedRows.length === 0) {
      throw new AppError(
        'Promotional code redemption limit has been reached.',
        409,
        'PROMO_REDEMPTION_LIMIT_EXCEEDED'
      );
    }

    // 5. Create committed redemption record
    try {
      const redemption = await activeTx.promoCodeRedemption.create({
        data: {
          promoCodeId,
          orderId,
          userId,
          customerEmail: normalizedEmail,
          discountAmountMinor
        }
      });
      return redemption;
    } catch (err) {
      if (err.code === 'P2002' && orderId) {
        // Unique constraint violation on (promoCodeId, orderId) - concurrent insert race:
        // Fetch existing and return idempotently
        const existing = await activeTx.promoCodeRedemption.findUnique({
          where: {
            promoCodeId_orderId: {
              promoCodeId,
              orderId
            }
          }
        });
        if (existing) return existing;
      }
      throw err;
    }
  };

  // If tx is provided and is an interactive transaction client, use it directly.
  // Otherwise, wrap in prisma.$transaction
  if (tx && typeof tx.$queryRaw === 'function' && tx !== prisma) {
    return await executeOperation(tx);
  }

  return await prisma.$transaction(async (innerTx) => {
    return await executeOperation(innerTx);
  });
};

// ---------------------------------------------------------------------------
// ADMIN OPERATIONS
// ---------------------------------------------------------------------------

export const listAdminPromoCodes = async ({
  page = 1,
  limit = 20,
  search = '',
  status = 'ALL'
}) => {
  const skip = (page - 1) * limit;
  const where = {};

  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ];
  }

  const now = new Date();
  if (status === 'ACTIVE') {
    where.isActive = true;
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gt: now } }
    ];
  } else if (status === 'INACTIVE') {
    where.isActive = false;
  } else if (status === 'EXPIRED') {
    where.expiresAt = { lte: now };
  }

  const [total, items] = await Promise.all([
    prisma.promoCode.count({ where }),
    prisma.promoCode.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        events: {
          include: {
            event: { select: { id: true, title: true, slug: true } }
          }
        },
        ticketTypes: {
          include: {
            ticketType: { select: { id: true, name: true, eventId: true } }
          }
        },
        createdBy: {
          select: { id: true, fullName: true, email: true }
        },
        _count: {
          select: { redemptions: true }
        }
      }
    })
  ]);

  return {
    items: items.map((p) => ({
      id: p.id,
      code: p.code,
      description: p.description,
      discountType: p.discountType,
      discountValue: p.discountValue,
      discountFormatted: p.discountType === 'PERCENTAGE'
        ? `${p.discountValue}%`
        : formatCurrency(p.discountValue, 'ZAR'),
      maxDiscountMinor: p.maxDiscountMinor,
      maxDiscountFormatted: p.maxDiscountMinor ? formatCurrency(p.maxDiscountMinor, 'ZAR') : null,
      minSubtotalMinor: p.minSubtotalMinor,
      minSubtotalFormatted: formatCurrency(p.minSubtotalMinor, 'ZAR'),
      maxTotalRedemptions: p.maxTotalRedemptions,
      maxPerCustomer: p.maxPerCustomer,
      currentRedemptions: p.currentRedemptions,
      isActive: p.isActive,
      startsAt: p.startsAt ? p.startsAt.toISOString() : null,
      expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      createdById: p.createdById,
      createdByName: p.createdBy?.fullName || null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      restrictedEvents: p.events.map((e) => ({ id: e.eventId, title: e.event?.title })),
      restrictedTicketTypes: p.ticketTypes.map((t) => ({ id: t.ticketTypeId, name: t.ticketType?.name }))
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

export const getAdminPromoCodeById = async (id) => {
  const promo = await prisma.promoCode.findUnique({
    where: { id },
    include: {
      events: {
        include: {
          event: { select: { id: true, title: true, slug: true } }
        }
      },
      ticketTypes: {
        include: {
          ticketType: { select: { id: true, name: true, eventId: true } }
        }
      },
      createdBy: {
        select: { id: true, fullName: true, email: true }
      },
      redemptions: {
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { id: true, orderReference: true, status: true, totalMinor: true } },
          user: { select: { id: true, fullName: true, email: true } }
        }
      }
    }
  });

  if (!promo) {
    throw new AppError('Promotional code not found.', 404, 'PROMO_CODE_NOT_FOUND');
  }

  return {
    ...promo,
    startsAt: promo.startsAt ? promo.startsAt.toISOString() : null,
    expiresAt: promo.expiresAt ? promo.expiresAt.toISOString() : null,
    createdAt: promo.createdAt.toISOString(),
    updatedAt: promo.updatedAt.toISOString()
  };
};

export const createAdminPromoCode = async ({ adminUserId, data }) => {
  const normalizedCode = normalizePromoCode(data.code);

  const existing = await prisma.promoCode.findFirst({
    where: {
      code: { equals: normalizedCode, mode: 'insensitive' }
    }
  });

  if (existing) {
    throw new AppError(`A promotional code with code "${normalizedCode}" already exists.`, 409, 'PROMO_CODE_EXISTS');
  }

  const startsAt = data.startsAt ? new Date(data.startsAt) : null;
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

  const createdPromo = await prisma.promoCode.create({
    data: {
      code: normalizedCode,
      description: data.description || null,
      discountType: data.discountType,
      discountValue: data.discountValue,
      maxDiscountMinor: data.maxDiscountMinor || null,
      minSubtotalMinor: data.minSubtotalMinor || 0,
      maxTotalRedemptions: data.maxTotalRedemptions || null,
      maxPerCustomer: data.maxPerCustomer || null,
      isActive: data.isActive !== undefined ? data.isActive : true,
      startsAt,
      expiresAt,
      createdById: adminUserId,
      events: data.eventIds && data.eventIds.length > 0
        ? {
            create: data.eventIds.map((eventId) => ({ eventId }))
          }
        : undefined,
      ticketTypes: data.ticketTypeIds && data.ticketTypeIds.length > 0
        ? {
            create: data.ticketTypeIds.map((ticketTypeId) => ({ ticketTypeId }))
          }
        : undefined
    },
    include: {
      events: true,
      ticketTypes: true
    }
  });

  await recordAdminAuditLog({
    adminUserId,
    action: 'CREATE_PROMO_CODE',
    entityType: 'PROMO_CODE',
    entityId: createdPromo.id,
    payload: {
      code: createdPromo.code,
      discountType: createdPromo.discountType,
      discountValue: createdPromo.discountValue
    }
  });

  return createdPromo;
};

export const updateAdminPromoCode = async ({ adminUserId, id, data }) => {
  const existing = await prisma.promoCode.findUnique({
    where: { id },
    include: { events: true, ticketTypes: true }
  });

  if (!existing) {
    throw new AppError('Promotional code not found.', 404, 'PROMO_CODE_NOT_FOUND');
  }

  const updateData = {};
  if (data.description !== undefined) updateData.description = data.description;
  if (data.discountType !== undefined) updateData.discountType = data.discountType;
  if (data.discountValue !== undefined) updateData.discountValue = data.discountValue;
  if (data.maxDiscountMinor !== undefined) updateData.maxDiscountMinor = data.maxDiscountMinor;
  if (data.minSubtotalMinor !== undefined) updateData.minSubtotalMinor = data.minSubtotalMinor;
  if (data.maxTotalRedemptions !== undefined) updateData.maxTotalRedemptions = data.maxTotalRedemptions;
  if (data.maxPerCustomer !== undefined) updateData.maxPerCustomer = data.maxPerCustomer;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.startsAt !== undefined) updateData.startsAt = data.startsAt ? new Date(data.startsAt) : null;
  if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

  // Handle relation updates and promo update inside an atomic transaction
  const updated = await prisma.$transaction(async (tx) => {
    if (data.eventIds !== undefined) {
      await tx.promoCodeEvent.deleteMany({ where: { promoCodeId: id } });
      if (data.eventIds.length > 0) {
        updateData.events = {
          create: data.eventIds.map((eventId) => ({ eventId }))
        };
      }
    }

    if (data.ticketTypeIds !== undefined) {
      await tx.promoCodeTicketType.deleteMany({ where: { promoCodeId: id } });
      if (data.ticketTypeIds.length > 0) {
        updateData.ticketTypes = {
          create: data.ticketTypeIds.map((ticketTypeId) => ({ ticketTypeId }))
        };
      }
    }

    return await tx.promoCode.update({
      where: { id },
      data: updateData,
      include: {
        events: true,
        ticketTypes: true
      }
    });
  });

  await recordAdminAuditLog({
    adminUserId,
    action: 'UPDATE_PROMO_CODE',
    entityType: 'PROMO_CODE',
    entityId: id,
    payload: {
      updatedFields: Object.keys(data)
    }
  });

  return updated;
};

export const deleteAdminPromoCode = async ({ adminUserId, id }) => {
  const existing = await prisma.promoCode.findUnique({
    where: { id },
    include: { _count: { select: { redemptions: true, orders: true } } }
  });

  if (!existing) {
    throw new AppError('Promotional code not found.', 404, 'PROMO_CODE_NOT_FOUND');
  }

  // If there are existing redemptions or orders associated with this promo code, soft-delete by deactivating
  if (existing._count.redemptions > 0 || existing._count.orders > 0) {
    const deactivated = await prisma.promoCode.update({
      where: { id },
      data: { isActive: false }
    });

    await recordAdminAuditLog({
      adminUserId,
      action: 'DEACTIVATE_PROMO_CODE_SOFT_DELETE',
      entityType: 'PROMO_CODE',
      entityId: id,
      payload: { reason: 'Has existing historical orders or redemptions' }
    });

    return { id, deactivated: true, message: 'Promo code has historical redemptions; deactivated successfully.' };
  }

  await prisma.promoCode.delete({ where: { id } });

  await recordAdminAuditLog({
    adminUserId,
    action: 'DELETE_PROMO_CODE',
    entityType: 'PROMO_CODE',
    entityId: id,
    payload: { code: existing.code }
  });

  return { id, deleted: true };
};
