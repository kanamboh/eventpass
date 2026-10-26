import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';
import { formatCurrency, calculateTicketInventory } from './eventService.js';
import { validateImageBuffer, isEventImageValid, extractCloudinaryPublicId } from '../utils/imageValidator.js';
import { getStorageProvider } from './storage/storageProviderFactory.js';
import { detectDuplicateEvent } from './duplicateDetectionService.js';


/**
 * Generate URL-friendly slug from title
 */
const generateSlug = async (title, tx = prisma, currentEventId = null) => {
  let baseSlug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

  if (!baseSlug) {
    baseSlug = 'event';
  }

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await tx.event.findUnique({
      where: { slug }
    });

    if (!existing || (currentEventId && existing.id === currentEventId)) {
      return slug;
    }

    slug = `${baseSlug}-${counter}-${crypto.randomBytes(2).toString('hex')}`;
    counter++;
  }
};

/**
 * Lightweight Admin Audit Logger (Zero DB migration, stored in WebhookEvent with provider: 'ADMIN_AUDIT')
 */
export const recordAdminAuditLog = async ({ adminUserId, action, entityType, entityId, payload }) => {
  const auditId = `AUDIT_${crypto.randomUUID()}`;
  const now = new Date();

  logger.info({
    msg: `[ADMIN AUDIT] ${action}`,
    auditId,
    adminUserId,
    action,
    entityType,
    entityId,
    payload
  });

  try {
    await prisma.webhookEvent.create({
      data: {
        provider: 'ADMIN_AUDIT',
        providerEventId: auditId,
        eventType: action,
        payload: {
          adminUserId,
          action,
          entityType,
          entityId,
          details: payload || {},
          timestamp: now
        },
        processedAt: now
      }
    });
  } catch (err) {
    logger.warn({
      msg: 'Failed to write admin audit log to DB (non-fatal)',
      error: err.message,
      auditId
    });
  }
};

/**
 * Format admin event DTO with comprehensive inventory & ticket stats
 */
export const formatAdminEventDto = (event) => {
  const ticketTypes = (event.ticketTypes || []).map((t) => {
    const inv = calculateTicketInventory(t);
    return {
      ...inv,
      maxPerOrder: t.maxPerOrder,
      isActive: t.isActive
    };
  });

  const totalCapacity = ticketTypes.reduce((sum, t) => sum + t.quantityTotal, 0);
  const totalSold = ticketTypes.reduce((sum, t) => sum + t.quantitySold, 0);
  const totalReserved = ticketTypes.reduce((sum, t) => sum + t.quantityReserved, 0);
  const totalAvailable = ticketTypes.reduce((sum, t) => sum + t.quantityAvailable, 0);
  const totalRevenueMinor = ticketTypes.reduce((sum, t) => sum + (t.quantitySold * t.priceMinor), 0);

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    subtitle: event.subtitle || null,
    description: event.description,
    categoryId: event.categoryId,
    category: event.category ? {
      id: event.category.id,
      name: event.category.name,
      slug: event.category.slug
    } : null,
    venue: event.venue,
    location: event.location,
    province: event.province || 'Western Cape',
    startDateTime: event.startDateTime.toISOString(),
    endDateTime: event.endDateTime ? event.endDateTime.toISOString() : null,
    imageUrl: event.imageUrl,
    bannerUrl: event.bannerUrl || event.imageUrl,
    organizerName: event.organizerName,
    organizerVerified: event.organizerVerified,
    ageRestriction: event.ageRestriction || 'All Ages',
    isFeatured: event.isFeatured,
    isActive: event.isActive,
    status: event.status,
    ticketTypes,
    stats: {
      totalCapacity,
      totalSold,
      totalReserved,
      totalAvailable,
      totalRevenueMinor,
      totalRevenueFormatted: formatCurrency(totalRevenueMinor, 'ZAR', true),
      tiersCount: ticketTypes.length
    },
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString()
  };
};

/**
 * List all events for admin dashboard (all statuses included, searchable, paginated)
 */
export const listAdminEvents = async (options = {}) => {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const where = {};
  const andConditions = [];

  if (options.status && options.status !== 'all') {
    where.status = options.status;
  }

  if (options.categoryId) {
    where.categoryId = options.categoryId;
  }

  if (options.search && options.search.trim().length > 0) {
    const term = options.search.trim();
    andConditions.push({
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { venue: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
        { organizerName: { contains: term, mode: 'insensitive' } }
      ]
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const [total, events] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      skip,
      take: limit,
      include: {
        category: true,
        ticketTypes: {
          orderBy: { priceMinor: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return {
    items: events.map(formatAdminEventDto),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1
  };
};

/**
 * Get single event for admin inspection and editing
 */
export const getAdminEventById = async (eventId) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      category: true,
      ticketTypes: {
        orderBy: { priceMinor: 'asc' }
      }
    }
  });

  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  return formatAdminEventDto(event);
};

/**
 * Create a new event as administrator
 */
export const createAdminEvent = async ({ adminUserId, data }) => {
  // 1. Verify Category exists
  const category = await prisma.category.findUnique({
    where: { id: data.categoryId }
  });
  if (!category) {
    throw new AppError('Selected category does not exist.', 400, 'CATEGORY_NOT_FOUND');
  }

  // 2. Strict Image Check: An event must never be published without a genuine image
  if (data.status === 'PUBLISHED' && !isEventImageValid(data.imageUrl)) {
    throw new AppError(
      'Cannot publish an event without a valid image. A genuine poster image is required for public display.',
      400,
      'CANNOT_PUBLISH_WITHOUT_VALID_IMAGE'
    );
  }

  return await prisma.$transaction(async (tx) => {
    // 3. Duplicate Event Detection across all statuses
    const duplicateResult = await detectDuplicateEvent({
      tx,
      title: data.title,
      startDateTime: data.startDateTime,
      venue: data.venue,
      location: data.location
    });

    if (duplicateResult.isDuplicate) {
      if (data.allowDuplicateOverride) {
        await recordAdminAuditLog({
          adminUserId,
          action: 'event.duplicate_override_approved',
          entityType: 'event',
          entityId: 'NEW_PENDING',
          payload: {
            title: data.title,
            duplicateOfId: duplicateResult.duplicateEvent?.id,
            duplicateOfTitle: duplicateResult.duplicateEvent?.title,
            matchType: duplicateResult.matchType
          }
        });
      } else {
        throw new AppError(
          duplicateResult.message,
          409,
          'DUPLICATE_EVENT_DETECTED',
          {
            duplicateEvent: duplicateResult.duplicateEvent,
            matchType: duplicateResult.matchType
          }
        );
      }
    }

    // 4. Generate unique slug
    const slug = await generateSlug(data.title, tx);

    // 5. Create Event record

    const event = await tx.event.create({
      data: {
        slug,
        title: data.title,
        subtitle: data.subtitle || null,
        description: data.description,
        categoryId: data.categoryId,
        venue: data.venue,
        location: data.location,
        province: data.province || 'Western Cape',
        startDateTime: new Date(data.startDateTime),
        endDateTime: data.endDateTime ? new Date(data.endDateTime) : null,
        imageUrl: data.imageUrl,
        bannerUrl: data.bannerUrl || data.imageUrl,
        organizerName: data.organizerName,
        organizerVerified: true,
        ageRestriction: data.ageRestriction || 'All Ages',
        isFeatured: Boolean(data.isFeatured),
        isActive: true,
        status: data.status || 'DRAFT'
      }
    });

    // 4. Optionally create initial ticket tiers
    if (data.ticketTypes && Array.isArray(data.ticketTypes) && data.ticketTypes.length > 0) {
      for (const tier of data.ticketTypes) {
        await tx.ticketType.create({
          data: {
            eventId: event.id,
            name: tier.name,
            description: tier.description || null,
            priceMinor: tier.priceMinor,
            paymentPriceUsdMinor: tier.paymentPriceUsdMinor !== undefined ? tier.paymentPriceUsdMinor : 0,
            currency: 'ZAR',
            quantityTotal: tier.quantityTotal,
            quantitySold: 0,
            quantityReserved: 0,
            quantityAvailable: tier.quantityTotal,
            maxPerOrder: tier.maxPerOrder || 10,
            status: 'ACTIVE',
            isActive: true
          }
        });
      }
    }

    // 5. Fetch full event with ticket types
    const createdEvent = await tx.event.findUnique({
      where: { id: event.id },
      include: { category: true, ticketTypes: true }
    });

    // 6. Record Audit Log
    await recordAdminAuditLog({
      adminUserId,
      action: 'event.created',
      entityType: 'event',
      entityId: event.id,
      payload: {
        title: event.title,
        slug: event.slug,
        status: event.status,
        tiersCount: data.ticketTypes?.length || 0
      }
    });

    return formatAdminEventDto(createdEvent);
  });
};

/**
 * Update event metadata (mass assignment safe)
 */
export const updateAdminEvent = async ({ adminUserId, eventId, data }) => {
  const existing = await prisma.event.findUnique({
    where: { id: eventId }
  });

  if (!existing) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  if (data.categoryId && data.categoryId !== existing.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId }
    });
    if (!category) {
      throw new AppError('Category does not exist.', 400, 'CATEGORY_NOT_FOUND');
    }
  }

  // Strict Image Check: If the event is or will be published, ensure image is valid
  const willBePublished = (data.status === 'PUBLISHED') ||
    (existing.status === 'PUBLISHED' && data.status !== 'DRAFT' && data.status !== 'CANCELLED');
  const candidateImage = data.imageUrl !== undefined ? data.imageUrl : existing.imageUrl;
  if (willBePublished && !isEventImageValid(candidateImage)) {
    throw new AppError(
      'Cannot publish an event without a valid image. A genuine poster image is required for public display.',
      400,
      'CANNOT_PUBLISH_WITHOUT_VALID_IMAGE'
    );
  }

  // Duplicate Event Check (excluding current event)
  const titleToCheck = data.title !== undefined ? data.title : existing.title;
  const startDateToCheck = data.startDateTime !== undefined ? data.startDateTime : existing.startDateTime;
  const venueToCheck = data.venue !== undefined ? data.venue : existing.venue;
  const locationToCheck = data.location !== undefined ? data.location : existing.location;

  const duplicateResult = await detectDuplicateEvent({
    title: titleToCheck,
    startDateTime: startDateToCheck,
    venue: venueToCheck,
    location: locationToCheck,
    excludeEventId: eventId
  });

  if (duplicateResult.isDuplicate) {
    if (data.allowDuplicateOverride) {
      await recordAdminAuditLog({
        adminUserId,
        action: 'event.duplicate_override_approved',
        entityType: 'event',
        entityId: eventId,
        payload: {
          title: titleToCheck,
          duplicateOfId: duplicateResult.duplicateEvent?.id,
          duplicateOfTitle: duplicateResult.duplicateEvent?.title,
          matchType: duplicateResult.matchType
        }
      });
    } else {
      throw new AppError(
        duplicateResult.message,
        409,
        'DUPLICATE_EVENT_DETECTED',
        {
          duplicateEvent: duplicateResult.duplicateEvent,
          matchType: duplicateResult.matchType
        }
      );
    }
  }

  const updatePayload = {};


  if (data.title !== undefined) updatePayload.title = data.title;
  if (data.subtitle !== undefined) updatePayload.subtitle = data.subtitle;
  if (data.description !== undefined) updatePayload.description = data.description;
  if (data.categoryId !== undefined) updatePayload.categoryId = data.categoryId;
  if (data.venue !== undefined) updatePayload.venue = data.venue;
  if (data.location !== undefined) updatePayload.location = data.location;
  if (data.province !== undefined) updatePayload.province = data.province;
  if (data.startDateTime !== undefined) updatePayload.startDateTime = new Date(data.startDateTime);
  if (data.endDateTime !== undefined) {
    updatePayload.endDateTime = data.endDateTime ? new Date(data.endDateTime) : null;
  }
  if (data.imageUrl !== undefined) updatePayload.imageUrl = data.imageUrl;
  if (data.bannerUrl !== undefined) updatePayload.bannerUrl = data.bannerUrl;
  if (data.organizerName !== undefined) updatePayload.organizerName = data.organizerName;
  if (data.ageRestriction !== undefined) updatePayload.ageRestriction = data.ageRestriction;
  if (data.isFeatured !== undefined) updatePayload.isFeatured = Boolean(data.isFeatured);
  if (data.status !== undefined) updatePayload.status = data.status;

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: updatePayload,
    include: {
      category: true,
      ticketTypes: { orderBy: { priceMinor: 'asc' } }
    }
  });

  await recordAdminAuditLog({
    adminUserId,
    action: 'event.updated',
    entityType: 'event',
    entityId: eventId,
    payload: { modifiedFields: Object.keys(updatePayload) }
  });

  return formatAdminEventDto(updated);
};

/**
 * Transition event status (PUBLISHED, DRAFT, CANCELLED, COMPLETED)
 */
export const updateAdminEventStatus = async ({ adminUserId, eventId, status }) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { ticketTypes: true }
  });

  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  // Publishing requires at least one active ticket tier and a valid image
  if (status === 'PUBLISHED') {
    if (!event.ticketTypes || event.ticketTypes.length === 0) {
      throw new AppError(
        'Cannot publish an event with zero ticket tiers. Add at least one ticket tier first.',
        400,
        'CANNOT_PUBLISH_EMPTY_EVENT'
      );
    }

    if (!isEventImageValid(event.imageUrl)) {
      throw new AppError(
        'Cannot publish an event without a valid image. A genuine poster image is required for public display.',
        400,
        'CANNOT_PUBLISH_WITHOUT_VALID_IMAGE'
      );
    }
  }

  return await prisma.$transaction(async (tx) => {
    // If cancelling, completing, or unpublishing to DRAFT, cancel active uncommitted reservations
    if (status === 'CANCELLED' || status === 'DRAFT' || status === 'COMPLETED') {
      const tierIds = event.ticketTypes.map((t) => t.id);
      if (tierIds.length > 0) {
        // 1. Cancel all active uncommitted reservations
        await tx.reservation.updateMany({
          where: {
            ticketTypeId: { in: tierIds },
            status: 'ACTIVE'
          },
          data: { status: 'CANCELLED' }
        });

        // 2. If cancelling, also cancel any unfulfilled PENDING or PROCESSING orders
        if (status === 'CANCELLED') {
          const pendingOrderItems = await tx.orderItem.findMany({
            where: {
              ticketTypeId: { in: tierIds },
              order: { status: { in: ['PENDING', 'PAYMENT_PROCESSING'] } }
            },
            select: { orderId: true }
          });
          const pendingOrderIds = [...new Set(pendingOrderItems.map((oi) => oi.orderId))];
          if (pendingOrderIds.length > 0) {
            await tx.order.updateMany({
              where: { id: { in: pendingOrderIds } },
              data: { status: 'CANCELLED' }
            });
          }
        }

        // 3. Synchronize quantityReserved and quantityAvailable on tiers
        await tx.$executeRaw`
          UPDATE ticket_types tt
          SET 
            "quantityReserved" = 0,
            "quantityAvailable" = GREATEST(0, tt."quantityTotal" - tt."quantitySold"),
            "updatedAt" = NOW()
          WHERE tt.id = ANY(${tierIds}::uuid[])
        `;
      }
    }

    const updated = await tx.event.update({
      where: { id: eventId },
      data: {
        status,
        isActive: status === 'CANCELLED' ? false : true
      },
      include: {
        category: true,
        ticketTypes: { orderBy: { priceMinor: 'asc' } }
      }
    });

    const actionName =
      status === 'PUBLISHED'
        ? 'event.published'
        : status === 'DRAFT'
        ? 'event.unpublished'
        : status === 'CANCELLED'
        ? 'event.cancelled'
        : status === 'COMPLETED'
        ? 'event.completed'
        : 'event.status_changed';

    await recordAdminAuditLog({
      adminUserId,
      action: actionName,
      entityType: 'event',
      entityId: eventId,
      payload: { previousStatus: event.status, newStatus: status }
    });

    return formatAdminEventDto(updated);
  });
};

/**
 * Permanently delete an event if dependency checks confirm it is safe.
 *
 * Security & Data Safety Rules:
 * - Only ADMIN or SUPER_ADMIN may delete events.
 * - If orders or issued tickets exist for this event: BLOCK deletion and provide structured dependency explanation.
 * - If active cart reservations exist: BLOCK deletion and advise unpublishing or cancelling first.
 * - Transactionally delete reservations, promo links, ticket tiers, and event record.
 * - After successful DB transaction, inspect whether event image is used by other events.
 *   If not shared, delete Cloudinary asset. Storage failure never rolls back the DB deletion.
 * - Audit log recorded via recordAdminAuditLog.
 */
export const deleteAdminEvent = async ({ adminUserId, eventId }) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      ticketTypes: true
    }
  });

  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  const tierIds = (event.ticketTypes || []).map((t) => t.id);

  // 1. Comprehensive Dependency Checks:
  // Check orders, issued tickets, and active cart reservations
  const [orderItemsCount, ticketsCount, activeReservationsCount] = await Promise.all([
    prisma.orderItem.count({
      where: {
        OR: [
          { eventId },
          ...(tierIds.length > 0 ? [{ ticketTypeId: { in: tierIds } }] : [])
        ]
      }
    }),
    prisma.ticket.count({
      where: {
        OR: [
          { eventId },
          ...(tierIds.length > 0 ? [{ ticketTypeId: { in: tierIds } }] : [])
        ]
      }
    }),
    tierIds.length > 0
      ? prisma.reservation.count({
          where: {
            ticketTypeId: { in: tierIds },
            status: 'ACTIVE',
            expiresAt: { gt: new Date() }
          }
        })
      : 0
  ]);

  if (orderItemsCount > 0 || ticketsCount > 0) {
    const dependenciesList = [];
    if (orderItemsCount > 0) dependenciesList.push(`${orderItemsCount} order item(s)`);
    if (ticketsCount > 0) dependenciesList.push(`${ticketsCount} issued ticket(s)`);
    const dependenciesDesc = dependenciesList.join(' and ');

    throw new AppError(
      `Cannot permanently delete event "${event.title}" because it has ${dependenciesDesc}. To protect historical customer records and financial accounting, permanent deletion is blocked. Please cancel or archive the event instead.`,
      409,
      'CANNOT_DELETE_EVENT_WITH_TRANSACTIONS',
      {
        eventId,
        eventTitle: event.title,
        currentStatus: event.status,
        orderItemsCount,
        ticketsCount,
        activeReservationsCount,
        dependencyType: 'HISTORICAL_TRANSACTIONS',
        suggestedActions: [
          { action: 'CANCELLED', label: 'Cancel Event', description: 'Mark as CANCELLED (preserves historical records for customer support)' },
          { action: 'COMPLETED', label: 'Mark as Completed', description: 'Mark as COMPLETED (preserves accounting if event has ended)' },
          { action: 'DRAFT', label: 'Unpublish to Draft', description: 'Revert to DRAFT (hides from public catalog)' }
        ]
      }
    );
  }

  if (activeReservationsCount > 0) {
    throw new AppError(
      `Cannot permanently delete event "${event.title}" because ${activeReservationsCount} active cart reservation(s) are currently held by customers. Please unpublish or cancel the event first, or wait for active reservations to expire.`,
      409,
      'CANNOT_DELETE_EVENT_ACTIVE_RESERVATIONS',
      {
        eventId,
        eventTitle: event.title,
        currentStatus: event.status,
        orderItemsCount: 0,
        ticketsCount: 0,
        activeReservationsCount,
        dependencyType: 'ACTIVE_RESERVATIONS',
        suggestedActions: [
          { action: 'DRAFT', label: 'Unpublish to Draft', description: 'Revert to DRAFT and safely release cart reservations' },
          { action: 'CANCELLED', label: 'Cancel Event', description: 'Cancel event and release reservations immediately' }
        ]
      }
    );
  }

  const imageUrl = event.imageUrl;

  // 2. Perform database deletion transactionally
  await prisma.$transaction(async (tx) => {
    // Re-verify counts within transaction for strict concurrency safety
    const concurrentOrderItems = await tx.orderItem.count({
      where: {
        OR: [
          { eventId },
          ...(tierIds.length > 0 ? [{ ticketTypeId: { in: tierIds } }] : [])
        ]
      }
    });
    const concurrentTickets = await tx.ticket.count({
      where: {
        OR: [
          { eventId },
          ...(tierIds.length > 0 ? [{ ticketTypeId: { in: tierIds } }] : [])
        ]
      }
    });

    if (concurrentOrderItems > 0 || concurrentTickets > 0) {
      throw new AppError(
        'Concurrent customer transactions detected. Deletion blocked to protect records.',
        409,
        'CANNOT_DELETE_EVENT_WITH_TRANSACTIONS'
      );
    }

    // Delete active and expired reservations on this event's tiers
    if (tierIds.length > 0) {
      await tx.reservation.deleteMany({
        where: { ticketTypeId: { in: tierIds } }
      });

      // Delete promo code relations referencing tiers
      await tx.promoCodeTicketType.deleteMany({
        where: { ticketTypeId: { in: tierIds } }
      });
    }

    // Delete promo code relations referencing event
    await tx.promoCodeEvent.deleteMany({
      where: { eventId }
    });

    // Delete ticket tiers
    await tx.ticketType.deleteMany({
      where: { eventId }
    });

    // Delete event record
    await tx.event.delete({
      where: { id: eventId }
    });
  });

  // 3. Post-transaction Cloudinary asset cleanup (only unshared images)
  try {
    if (imageUrl) {
      const sharedCount = await prisma.event.count({
        where: {
          OR: [
            { imageUrl },
            { bannerUrl: imageUrl }
          ]
        }
      });

      if (sharedCount === 0) {
        const publicId = extractCloudinaryPublicId(imageUrl);
        if (publicId) {
          const storageProvider = getStorageProvider();
          await storageProvider.deleteImage(publicId);
          logger.info({ publicId, eventId }, 'Deleted unshared Cloudinary asset for permanently deleted event.');
        }
      } else {
        logger.info({ imageUrl, sharedCount, eventId }, 'Preserved shared image asset during event deletion.');
      }
    }
  } catch (err) {
    logger.warn({ error: err.message, eventId }, 'Cloudinary image cleanup failed post-deletion (non-fatal).');
  }

  // 4. Record Admin Audit Log
  await recordAdminAuditLog({
    adminUserId,
    action: 'event.permanently_deleted',
    entityType: 'event',
    entityId: eventId,
    payload: {
      title: event.title,
      slug: event.slug,
      deletedTiersCount: event.ticketTypes?.length || 0,
      timestamp: new Date().toISOString()
    }
  });

  return {
    success: true,
    message: 'Event permanently deleted successfully.',
    deletedEventId: eventId,
    title: event.title
  };
};


/**
 * Add a new ticket tier to an event
 */
export const createAdminTicketType = async ({ adminUserId, eventId, data }) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId }
  });

  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  const created = await prisma.ticketType.create({
    data: {
      eventId,
      name: data.name,
      description: data.description || null,
      priceMinor: data.priceMinor,
      paymentPriceUsdMinor: data.paymentPriceUsdMinor !== undefined ? data.paymentPriceUsdMinor : 0,
      currency: 'ZAR',
      quantityTotal: data.quantityTotal,
      quantitySold: 0,
      quantityReserved: 0,
      quantityAvailable: data.quantityTotal,
      maxPerOrder: data.maxPerOrder || 10,
      status: data.status || 'ACTIVE',
      isActive: true
    }
  });

  await recordAdminAuditLog({
    adminUserId,
    action: 'ticket_type.created',
    entityType: 'ticket_type',
    entityId: created.id,
    payload: {
      eventId,
      name: created.name,
      priceMinor: created.priceMinor,
      quantityTotal: created.quantityTotal
    }
  });

  return calculateTicketInventory(created);
};

/**
 * Update an existing ticket tier
 * Enforces Critical Inventory Rule F: quantityTotal cannot be reduced below quantitySold + quantityReserved.
 * Enforces Critical Price Rule G: historical order prices are never recalculated.
 */
export const updateAdminTicketType = async ({ adminUserId, eventId, ticketTypeId, data }) => {
  return await prisma.$transaction(
    async (tx) => {
      // 1. Lock tier row FOR UPDATE to prevent race conditions during inventory or price update
      const lockedRows = await tx.$queryRaw`
        SELECT 
          id, 
          "eventId", 
          name, 
          "priceMinor", 
          currency,
          "quantityTotal", 
          "quantitySold", 
          "quantityReserved", 
          "quantityAvailable", 
          status, 
          "isActive", 
          "maxPerOrder"
        FROM ticket_types
        WHERE id = ${ticketTypeId}::uuid
          AND "eventId" = ${eventId}::uuid
        FOR UPDATE
      `;

      if (!lockedRows || lockedRows.length === 0) {
        throw new AppError('Ticket tier not found for this event.', 404, 'TICKET_TYPE_NOT_FOUND');
      }

      const lockedTier = lockedRows[0];
      const currentSold = Number(lockedTier.quantitySold) || 0;
      const currentReserved = Number(lockedTier.quantityReserved) || 0;
      const minLegalTotal = currentSold + currentReserved;

      // 2. CRITICAL INVENTORY RULE F: Validate quantityTotal reduction safety
      let newTotal = Number(lockedTier.quantityTotal);
      if (data.quantityTotal !== undefined) {
        newTotal = Number(data.quantityTotal);
        if (newTotal < minLegalTotal) {
          throw new AppError(
            `Cannot reduce total quantity (${newTotal}) below the sum of sold (${currentSold}) and reserved (${currentReserved}) tickets (minimum allowed: ${minLegalTotal}).`,
            400,
            'INVALID_INVENTORY_UPDATE',
            {
              requestedTotal: newTotal,
              quantitySold: currentSold,
              quantityReserved: currentReserved,
              minimumLegalTotal: minLegalTotal
            }
          );
        }
      }

      // 3. Compute new availability
      const newAvailable = Math.max(0, newTotal - currentSold - currentReserved);

      // 4. Determine status
      let newStatus = data.status || lockedTier.status;
      if (newAvailable <= 0 && newStatus === 'ACTIVE') {
        newStatus = 'SOLD_OUT';
      } else if (newAvailable > 0 && newStatus === 'SOLD_OUT') {
        newStatus = 'ACTIVE';
      }

      // 5. Update payload (Mass Assignment Safe: quantitySold and quantityReserved are NEVER modifiable by admin!)
      const updateData = {
        quantityTotal: newTotal,
        quantityAvailable: newAvailable,
        status: newStatus
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.maxPerOrder !== undefined) updateData.maxPerOrder = data.maxPerOrder;

      // Price update: Historical orders remain untouched (they store historical order_item.unitPriceMinor)
      if (data.priceMinor !== undefined) {
        updateData.priceMinor = data.priceMinor;
      }
      if (data.paymentPriceUsdMinor !== undefined) {
        updateData.paymentPriceUsdMinor = data.paymentPriceUsdMinor;
      }

      const updated = await tx.ticketType.update({
        where: { id: ticketTypeId },
        data: updateData
      });

      // 6. Record Audit Log
      await recordAdminAuditLog({
        adminUserId,
        action: 'ticket_type.updated',
        entityType: 'ticket_type',
        entityId: ticketTypeId,
        payload: {
          eventId,
          name: updated.name,
          oldPriceMinor: lockedTier.priceMinor,
          newPriceMinor: updated.priceMinor,
          oldTotal: lockedTier.quantityTotal,
          newTotal: updated.quantityTotal,
          quantitySold: currentSold,
          quantityReserved: currentReserved,
          quantityAvailable: newAvailable
        }
      });

      return calculateTicketInventory(updated);
    },
    {
      isolationLevel: 'ReadCommitted',
      timeout: 30000,
      maxWait: 15000
    }
  );
};

/**
 * Delete a ticket tier safely (only if no sales or active orders exist)
 */
export const deleteAdminTicketType = async ({ adminUserId, eventId, ticketTypeId }) => {
  const tier = await prisma.ticketType.findFirst({
    where: { id: ticketTypeId, eventId },
    include: {
      _count: {
        select: {
          orderItems: true,
          tickets: true,
          reservations: {
            where: { status: 'ACTIVE' }
          }
        }
      }
    }
  });

  if (!tier) {
    throw new AppError('Ticket tier not found for this event.', 404, 'TICKET_TYPE_NOT_FOUND');
  }

  if (tier.quantitySold > 0 || tier._count.tickets > 0 || tier._count.orderItems > 0) {
    throw new AppError(
      'Cannot delete a ticket tier that has sold tickets or active orders. Set it to INACTIVE instead.',
      400,
      'CANNOT_DELETE_ACTIVE_TIER'
    );
  }

  if (tier._count.reservations > 0) {
    throw new AppError(
      'Cannot delete a ticket tier with active reservations. Wait for reservations to expire or set to INACTIVE.',
      400,
      'CANNOT_DELETE_RESERVED_TIER'
    );
  }

  await prisma.ticketType.delete({
    where: { id: ticketTypeId }
  });

  await recordAdminAuditLog({
    adminUserId,
    action: 'ticket_type.deleted',
    entityType: 'ticket_type',
    entityId: ticketTypeId,
    payload: { eventId, name: tier.name }
  });

  return { success: true, message: 'Ticket tier deleted successfully.' };
};

/**
  * Upload Event Poster Image to Persistent Storage
  * Validates size (<= 5MB), MIME type, and deep magic bytes (JPEG, PNG, WebP).
  * Uploads to configured persistent cloud storage provider.
  */
export const uploadEventPoster = async ({ adminUserId, file, overrideStorageProvider = null }) => {
  if (!file || !file.buffer) {
    throw new AppError('No image file provided for upload.', 400, 'MISSING_FILE');
  }

  // 1. Strict Validation: Size (<= 5MB), MIME type, deep magic byte validation, collision-safe UUID filename
  const validatedImage = validateImageBuffer(file.buffer, file.originalname, file.mimetype);

  // 2. Select Storage Provider
  const storageProvider = overrideStorageProvider || getStorageProvider();

  // 3. Upload to Persistent Cloud Storage
  const uploadResult = await storageProvider.uploadImage({
    buffer: file.buffer,
    mimeType: validatedImage.mimeType,
    extension: validatedImage.extension,
    publicId: validatedImage.publicId,
    safeFilename: validatedImage.safeFilename
  });

  // 4. Record Admin Audit Log (without logging binary data or credentials)
  await recordAdminAuditLog({
    adminUserId,
    action: 'event_poster.uploaded',
    entityType: 'event_poster',
    entityId: uploadResult.publicId,
    payload: {
      url: uploadResult.url,
      format: uploadResult.format,
      size: uploadResult.size
    }
  });

  return uploadResult;
};

/**
 * List users for SUPER_ADMIN with pagination, role filter, archival filter, and search
 */
export const listAdminUsers = async ({ page = 1, limit = 20, search, role = 'ALL', archived, status = 'active' }) => {
  const skip = (page - 1) * limit;

  const where = {};

  // Archival filtering (default: active accounts only)
  if (status === 'all') {
    // Return all without archival constraint
  } else if (archived === true || status === 'archived') {
    where.isArchived = true;
  } else {
    where.isArchived = false;
  }

  if (role && role !== 'ALL') {
    where.role = role;
  }

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }
    ];
  }

  const [total, users, activeCount, archivedCount] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        city: true,
        role: true,
        emailVerified: true,
        isArchived: true,
        archivedAt: true,
        createdAt: true,
        lastLoginAt: true
      }
    }),
    prisma.user.count({ where: { isArchived: false } }),
    prisma.user.count({ where: { isArchived: true } })
  ]);

  return {
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    activeCount,
    archivedCount
  };
};

/**
 * Update user role (appoint CUSTOMER as ADMIN or revoke ADMIN to CUSTOMER).
 * Owner (SUPER_ADMIN) only.
 */
export const updateAdminUserRole = async ({ adminUserId, targetUserId, newRole }) => {
  if (!targetUserId) {
    throw new AppError('Target user ID is required.', 400, 'MISSING_USER_ID');
  }

  // Prevent users from modifying their own role
  if (adminUserId === targetUserId) {
    throw new AppError('You cannot modify your own administrative role.', 400, 'CANNOT_MODIFY_OWN_ROLE');
  }

  // Only appointment to ADMIN or revocation to CUSTOMER is supported
  if (newRole !== 'ADMIN' && newRole !== 'CUSTOMER') {
    throw new AppError('Invalid role assignment. Only ADMIN or CUSTOMER can be assigned.', 400, 'INVALID_ROLE');
  }

  return await prisma.$transaction(async (tx) => {
    const targetUser = await tx.user.findUnique({
      where: { id: targetUserId }
    });

    if (!targetUser) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    // Protect SUPER_ADMIN account from being demoted or altered
    if (targetUser.role === 'SUPER_ADMIN') {
      throw new AppError('The SUPER_ADMIN account cannot be demoted or modified through this interface.', 403, 'SUPER_ADMIN_PROTECTED');
    }

    // Protect archived accounts from being promoted or modified
    if (targetUser.isArchived) {
      throw new AppError('Archived accounts cannot be modified or granted administrative privileges.', 400, 'ARCHIVED_USER_PROTECTED');
    }

    // No-op check
    if (targetUser.role === newRole) {
      throw new AppError(`User already has the ${newRole} role.`, 400, 'ROLE_ALREADY_ASSIGNED');
    }

    const previousRole = targetUser.role;

    const updatedUser = await tx.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        city: true,
        role: true,
        emailVerified: true,
        isArchived: true,
        archivedAt: true,
        createdAt: true,
        lastLoginAt: true
      }
    });

    // Verify invariant: at least one SUPER_ADMIN must always remain in the system
    const superAdminCount = await tx.user.count({
      where: { role: 'SUPER_ADMIN' }
    });
    if (superAdminCount < 1) {
      throw new AppError('Security invariant violated: at least one SUPER_ADMIN must exist.', 500, 'SUPER_ADMIN_REQUIRED');
    }

    // Record audit log entry (stored in webhook_events with provider: 'ADMIN_AUDIT')
    await recordAdminAuditLog({
      adminUserId,
      action: newRole === 'ADMIN' ? 'admin.appointed' : 'admin.revoked',
      entityType: 'user_role',
      entityId: targetUserId,
      payload: {
        targetEmail: targetUser.email,
        targetFullName: targetUser.fullName,
        previousRole,
        newRole: updatedUser.role
      }
    });

    return updatedUser;
  });
};

/**
 * Retrieve recent role change audit logs
 */
export const getAdminUserAuditLogs = async (limit = 20) => {
  const events = await prisma.webhookEvent.findMany({
    where: {
      provider: 'ADMIN_AUDIT',
      eventType: { in: ['admin.appointed', 'admin.revoked'] }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  return events.map(e => ({
    id: e.id,
    action: e.eventType,
    payload: e.payload,
    createdAt: e.createdAt
  }));
};


