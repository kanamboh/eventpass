import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { isUuid } from '../validators/eventValidators.js';
import { isEventImageValid } from '../utils/imageValidator.js';


/**
 * Format currency minor units (cents) to South African Rand or USD display string
 * e.g., 25000 -> "R250" or "R250.00", 0 -> "Free"
 * USD: 4900 -> "$49.00"
 */
export const formatCurrency = (minorUnits, currency = 'ZAR', showDecimals = false) => {
  if (minorUnits === 0 && currency === 'ZAR') return 'Free';
  const major = minorUnits / 100;
  if (currency === 'USD') {
    return `$${major.toFixed(2)}`;
  }
  if (showDecimals || minorUnits % 100 !== 0) {
    return `R${major.toFixed(2)}`;
  }
  return `R${major}`;
};

/**
 * Calculate display pricing summary for an event based on its ticket types
 */
export const computeEventPriceDisplay = (ticketTypes = []) => {
  if (!ticketTypes || ticketTypes.length === 0) {
    return {
      minPriceMinor: 0,
      maxPriceMinor: 0,
      currency: 'ZAR',
      priceDisplay: 'Price TBA'
    };
  }

  const activeTiers = ticketTypes.filter((t) => t.isActive && t.status !== 'INACTIVE');
  if (activeTiers.length === 0) {
    return {
      minPriceMinor: 0,
      maxPriceMinor: 0,
      currency: 'ZAR',
      priceDisplay: 'Sold Out'
    };
  }

  const prices = activeTiers.map((t) => t.priceMinor);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const currency = activeTiers[0]?.currency || 'ZAR';

  let priceDisplay;
  if (minPrice === maxPrice) {
    priceDisplay = formatCurrency(minPrice, currency);
  } else if (activeTiers.length > 2) {
    priceDisplay = `From ${formatCurrency(minPrice, currency)}`;
  } else {
    priceDisplay = `${formatCurrency(minPrice, currency)} - ${formatCurrency(maxPrice, currency)}`;
  }

  return {
    minPriceMinor: minPrice,
    maxPriceMinor: maxPrice,
    currency,
    priceDisplay
  };
};

/**
 * Server-side authoritative calculation of ticket inventory availability
 * Rule: available = Math.max(0, quantityTotal - quantitySold - quantityReserved)
 */
export const calculateTicketInventory = (ticketType) => {
  const total = Number(ticketType.quantityTotal) || 0;
  const sold = Number(ticketType.quantitySold) || 0;
  const reserved = Number(ticketType.quantityReserved) || 0;
  const available = Math.max(0, total - sold - reserved);
  const isSoldOut = available <= 0 || ticketType.status === 'SOLD_OUT';
  const paymentPriceUsdMinor = Number(ticketType.paymentPriceUsdMinor) || 0;

  return {
    id: ticketType.id,
    eventId: ticketType.eventId,
    name: ticketType.name,
    description: ticketType.description || '',
    priceMinor: ticketType.priceMinor,
    currency: ticketType.currency,
    priceDisplay: formatCurrency(ticketType.priceMinor, ticketType.currency),
    priceFormatted: `R${(ticketType.priceMinor / 100).toFixed(2)}`,
    paymentPriceUsdMinor,
    paymentPriceUsdFormatted: formatCurrency(paymentPriceUsdMinor, 'USD', true),
    paymentCurrency: 'USD',
    quantityTotal: total,
    quantitySold: sold,
    quantityReserved: reserved,
    quantityAvailable: available,
    maxPerOrder: ticketType.maxPerOrder || 10,
    status: isSoldOut ? 'SOLD_OUT' : ticketType.status,
    isAvailable: !isSoldOut && ticketType.isActive,
    createdAt: ticketType.createdAt,
    updatedAt: ticketType.updatedAt
  };
};

/**
 * Format date objects to human-readable South African date/time strings
 */
export const formatEventDates = (startDateTime, endDateTime) => {
  const dateObj = new Date(startDateTime);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const day = dateObj.getDate();
  const month = months[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');

  const dateOnly = `${day} ${month} ${year}`;
  const timeOnly = `${hours}:${minutes}`;
  const dateDisplay = `${dateOnly} ${timeOnly}`;

  return {
    dateOnly,
    timeOnly,
    dateDisplay,
    isoString: startDateTime.toISOString()
  };
};

/**
 * Map Prisma Event model to clean public client DTO
 */
export const formatPublicEvent = (event) => {
  const dateInfo = formatEventDates(event.startDateTime, event.endDateTime);
  const priceInfo = computeEventPriceDisplay(event.ticketTypes);

  const formattedTicketTypes = (event.ticketTypes || [])
    .filter((t) => t.isActive)
    .map(calculateTicketInventory);

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    subtitle: event.subtitle || null,
    description: event.description,
    category: event.category?.slug || 'all',
    categoryName: event.category?.name || 'General',
    venue: event.venue,
    location: event.location,
    city: event.location,
    province: event.province || 'Western Cape',
    startDateTime: event.startDateTime,
    endDateTime: event.endDateTime,
    date: dateInfo.dateOnly,
    time: dateInfo.timeOnly,
    dateDisplay: dateInfo.dateDisplay,
    rawDate: dateInfo.isoString,
    imageUrl: event.imageUrl,
    image: event.imageUrl,
    bannerUrl: event.bannerUrl || event.imageUrl,
    organizer: {
      name: event.organizerName,
      verified: event.organizerVerified
    },
    ageRestriction: event.ageRestriction || 'All Ages',
    isFeatured: event.isFeatured,
    featured: event.isFeatured,
    status: event.status,
    price: priceInfo.minPriceMinor / 100,
    priceMinor: priceInfo.minPriceMinor,
    maxPriceMinor: priceInfo.maxPriceMinor,
    currency: priceInfo.currency,
    priceDisplay: priceInfo.priceDisplay,
    ticketTypes: formattedTicketTypes,
    tiers: formattedTicketTypes.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      price: t.priceMinor / 100,
      priceMinor: t.priceMinor,
      currency: t.currency,
      available: t.quantityAvailable,
      quantityAvailable: t.quantityAvailable,
      isAvailable: t.isAvailable
    })),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt
  };
};

/**
 * List public published events with parameterized filters, pagination, and sorting
 */
export const listPublicEvents = async (options = {}) => {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(50, Math.max(1, options.limit || 12));
  const skip = (page - 1) * limit;

  // Base query: ONLY published, active events with genuine images (no placeholders, no empty images)
  const where = {
    status: 'PUBLISHED',
    isActive: true,
    imageUrl: { not: '', startsWith: 'http' }
  };

  const andConditions = [
    {
      NOT: [
        { imageUrl: { contains: 'placeholder', mode: 'insensitive' } },
        { imageUrl: { contains: 'event photo pending', mode: 'insensitive' } },
        { imageUrl: { contains: 'no-image', mode: 'insensitive' } }
      ]
    }
  ];


  // 1. Search Query: parameterized search across title, venue, location, description
  if (options.search && options.search.trim().length > 0) {
    const term = options.search.trim();
    andConditions.push({
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { venue: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
        { province: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } }
      ]
    });
  }

  // 2. Category Filter
  if (options.category && options.category !== 'all') {
    if (isUuid(options.category)) {
      andConditions.push({ categoryId: options.category });
    } else {
      andConditions.push({
        category: {
          slug: options.category.toLowerCase()
        }
      });
    }
  }

  // 3. Location / Region Filter
  if (options.location && options.location !== 'all') {
    if (options.location === 'western-cape') {
      andConditions.push({
        OR: [
          { province: { contains: 'Western Cape', mode: 'insensitive' } },
          { location: { contains: 'Cape Town', mode: 'insensitive' } },
          { location: { contains: 'Stellenbosch', mode: 'insensitive' } }
        ]
      });
    } else {
      andConditions.push({
        OR: [
          { location: { contains: options.location, mode: 'insensitive' } },
          { province: { contains: options.location, mode: 'insensitive' } }
        ]
      });
    }
  }

  // 4. Featured filter
  if (options.featured === true) {
    where.isFeatured = true;
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  // 5. Date / Time Filter ('weekend', 'month', 'upcoming')
  if (options.when && options.when !== 'anytime') {
    const now = new Date();

    if (options.when === 'weekend') {
      // Find upcoming Saturday & Sunday
      const dayOfWeek = now.getDay(); // 0 is Sun, 6 is Sat
      const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
      const saturday = new Date(now);
      saturday.setDate(now.getDate() + daysUntilSaturday);
      saturday.setHours(0, 0, 0, 0);

      const sunday = new Date(saturday);
      sunday.setDate(saturday.getDate() + 1);
      sunday.setHours(23, 59, 59, 999);

      where.startDateTime = {
        gte: saturday,
        lte: sunday
      };
    } else if (options.when === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      where.startDateTime = {
        gte: startOfMonth,
        lte: endOfMonth
      };
    } else if (options.when === 'upcoming') {
      const next30Days = new Date(now);
      next30Days.setDate(now.getDate() + 30);
      where.startDateTime = {
        gte: now,
        lte: next30Days
      };
    }
  }

  // 6. Explicit Allowlist Sorting
  let orderBy = [{ startDateTime: 'asc' }];
  let sortPriceMode = null;

  switch (options.sort) {
    case 'date':
    case 'date-asc':
      orderBy = [{ startDateTime: 'asc' }];
      break;
    case 'date-desc':
      orderBy = [{ startDateTime: 'desc' }];
      break;
    case 'popular':
      orderBy = [{ isFeatured: 'desc' }, { startDateTime: 'asc' }];
      break;
    case 'title-asc':
      orderBy = [{ title: 'asc' }];
      break;
    case 'title-desc':
      orderBy = [{ title: 'desc' }];
      break;
    case 'price-low':
      sortPriceMode = 'asc';
      break;
    case 'price-high':
      sortPriceMode = 'desc';
      break;
    default:
      orderBy = [{ startDateTime: 'asc' }];
  }

  // Execute Count & Relational Query concurrently (Avoids N+1 query patterns)
  const [total, rawEvents] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      skip: sortPriceMode ? 0 : skip, // If price sorting, we calculate on minor units
      take: sortPriceMode ? undefined : limit,
      include: {
        category: {
          select: {
            id: true,
            slug: true,
            name: true,
            icon: true
          }
        },
        ticketTypes: {
          where: { isActive: true },
          select: {
            id: true,
            eventId: true,
            name: true,
            description: true,
            priceMinor: true,
            currency: true,
            quantityTotal: true,
            quantitySold: true,
            quantityReserved: true,
            status: true,
            maxPerOrder: true,
            isActive: true,
            createdAt: true,
            updatedAt: true
          }
        }
      },
      orderBy: sortPriceMode ? undefined : orderBy
    })
  ]);

  // Strict service-level verification: Guarantee customers never see events without valid images
  const validEvents = rawEvents.filter((e) => isEventImageValid(e.imageUrl));
  let formattedEvents = validEvents.map(formatPublicEvent);


  // If price sorting is requested, sort accurately using the integer minor units
  if (sortPriceMode) {
    formattedEvents.sort((a, b) => {
      return sortPriceMode === 'asc'
        ? a.priceMinor - b.priceMinor
        : b.priceMinor - a.priceMinor;
    });
    // Apply pagination slice after exact price minor unit sorting
    formattedEvents = formattedEvents.slice(skip, skip + limit);
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    items: formattedEvents,
    page,
    limit,
    total,
    totalPages
  };
};

/**
 * Get single event details by UUID or slug
 * Returns ONLY published public event details with computed ticket inventory
 */
export const getPublicEventByIdOrSlug = async (idOrSlug) => {
  const isIdUuid = isUuid(idOrSlug);

  const event = await prisma.event.findFirst({
    where: {
      ...(isIdUuid ? { id: idOrSlug } : { slug: idOrSlug }),
      status: 'PUBLISHED',
      isActive: true,
      imageUrl: { not: '', startsWith: 'http' }
    },
    include: {
      category: {
        select: {
          id: true,
          slug: true,
          name: true,
          icon: true
        }
      },
      ticketTypes: {
        where: { isActive: true },
        orderBy: { priceMinor: 'asc' }
      }
    }
  });

  if (!event || !isEventImageValid(event.imageUrl)) {
    throw new AppError('Event not found or is currently not published.', 404, 'EVENT_NOT_FOUND');
  }

  return formatPublicEvent(event);
};

/**
 * Get single event details strictly by slug
 */
export const getPublicEventBySlug = async (slug) => {
  return getPublicEventByIdOrSlug(slug);
};

/**
 * List all public categories with active event counts
 */
export const listPublicCategories = async () => {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          events: {
            where: {
              status: 'PUBLISHED',
              isActive: true,
              imageUrl: { not: '', startsWith: 'http' },
              NOT: [
                { imageUrl: { contains: 'placeholder', mode: 'insensitive' } },
                { imageUrl: { contains: 'event photo pending', mode: 'insensitive' } }
              ]
            }
          }
        }
      }
    }
  });

  return categories.map((cat) => ({
    id: cat.id,
    slug: cat.slug,
    name: cat.name,
    description: cat.description,
    icon: cat.icon,
    eventCount: cat._count.events
  }));
};

/**
 * Get ticket types and live availability for an event
 */
export const getEventTicketTypes = async (eventIdOrSlug) => {
  const isIdUuid = isUuid(eventIdOrSlug);

  const event = await prisma.event.findFirst({
    where: {
      ...(isIdUuid ? { id: eventIdOrSlug } : { slug: eventIdOrSlug }),
      status: 'PUBLISHED',
      isActive: true,
      imageUrl: { not: '', startsWith: 'http' }
    },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      ticketTypes: {
        where: { isActive: true },
        orderBy: { priceMinor: 'asc' }
      }
    }
  });

  if (!event || !isEventImageValid(event.imageUrl)) {
    throw new AppError('Event not found or is not currently available.', 404, 'EVENT_NOT_FOUND');
  }

  return event.ticketTypes.map(calculateTicketInventory);
};

