import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { CATEGORIES, EVENTS } from '../../src/data/events.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting EventPass Database Seeding...');
  console.log(`Connecting to: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}`);

  // 1. Seed Categories
  console.log('📦 Seeding Categories...');
  const categoryMap = new Map();

  for (const cat of CATEGORIES) {
    if (cat.id === 'all') continue; // Skip 'all' filter pseudo-category

    const category = await prisma.category.upsert({
      where: { slug: cat.id },
      update: {
        name: cat.name,
        icon: cat.icon || null,
        description: `${cat.name} events on EventPass`
      },
      create: {
        slug: cat.id,
        name: cat.name,
        icon: cat.icon || null,
        description: `${cat.name} events on EventPass`
      }
    });

    categoryMap.set(cat.id, category.id);
    console.log(`  ✓ Category: ${category.name} (${category.slug})`);
  }

  // Fallback category if any event uses an unmapped category
  const defaultCategory = categoryMap.get('lifestyle') || Array.from(categoryMap.values())[0];

  // 2. Seed Events and Ticket Types
  console.log(`\n🎟️ Seeding ${EVENTS.length} Events and Ticket Types...`);
  let seededEventsCount = 0;
  let seededTicketTypesCount = 0;

  for (const eventData of EVENTS) {
    const categoryId = categoryMap.get(eventData.category) || defaultCategory;

    // Parse start date safely
    let startDateTime = new Date();
    if (eventData.rawDate) {
      const parsed = new Date(eventData.rawDate);
      if (!isNaN(parsed.getTime())) {
        startDateTime = parsed;
      }
    }

    // Upsert Event
    const event = await prisma.event.upsert({
      where: { slug: eventData.id },
      update: {
        title: eventData.title,
        description: eventData.description || eventData.title,
        categoryId,
        venue: eventData.venue || 'Venue TBA',
        location: eventData.location || eventData.city || 'Cape Town',
        province: eventData.province || 'Western Cape',
        startDateTime,
        imageUrl: eventData.imageUrl || eventData.image || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
        bannerUrl: eventData.imageUrl || eventData.image || null,
        organizerName: eventData.organizer || 'EventPass Official',
        organizerVerified: Boolean(eventData.organizerVerified),
        ageRestriction: eventData.ageRestriction || 'All Ages',
        isFeatured: Boolean(eventData.featured),
        isActive: true,
        status: 'PUBLISHED'
      },
      create: {
        slug: eventData.id,
        title: eventData.title,
        description: eventData.description || eventData.title,
        categoryId,
        venue: eventData.venue || 'Venue TBA',
        location: eventData.location || eventData.city || 'Cape Town',
        province: eventData.province || 'Western Cape',
        startDateTime,
        imageUrl: eventData.imageUrl || eventData.image || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
        bannerUrl: eventData.imageUrl || eventData.image || null,
        organizerName: eventData.organizer || 'EventPass Official',
        organizerVerified: Boolean(eventData.organizerVerified),
        ageRestriction: eventData.ageRestriction || 'All Ages',
        isFeatured: Boolean(eventData.featured),
        isActive: true,
        status: 'PUBLISHED'
      }
    });

    seededEventsCount++;

    // Prepare ticket tiers
    const rawTiers = Array.isArray(eventData.tiers) && eventData.tiers.length > 0
      ? eventData.tiers
      : [
          {
            name: 'General Admission',
            price: eventData.price || 50,
            description: 'Standard Entry Ticket',
            available: 250 // Sensible default venue capacity assumption
          }
        ];

    // Seed or update ticket types for this event
    for (let tIdx = 0; tIdx < rawTiers.length; tIdx++) {
      const tier = rawTiers[tIdx];
      const priceMinor = Math.round(Number(tier.price) * 100);
      const capacity = Number(tier.available) || 250;
      // Realistic inventory: some sold, a few reserved
      const sold = Math.min(capacity, Math.round(capacity * (0.2 + (tIdx * 0.15))));
      const reserved = Math.min(capacity - sold, 5);
      const available = Math.max(0, capacity - sold - reserved);

      // Find existing ticket type by eventId + name
      const existingTier = await prisma.ticketType.findFirst({
        where: {
          eventId: event.id,
          name: tier.name
        }
      });

      if (existingTier) {
        await prisma.ticketType.update({
          where: { id: existingTier.id },
          data: {
            description: tier.description || null,
            priceMinor,
            quantityTotal: capacity,
            quantitySold: sold,
            quantityReserved: reserved,
            quantityAvailable: available,
            status: available > 0 ? 'ACTIVE' : 'SOLD_OUT',
            isActive: true
          }
        });
      } else {
        await prisma.ticketType.create({
          data: {
            eventId: event.id,
            name: tier.name,
            description: tier.description || null,
            priceMinor,
            currency: 'ZAR',
            quantityTotal: capacity,
            quantitySold: sold,
            quantityReserved: reserved,
            quantityAvailable: available,
            status: available > 0 ? 'ACTIVE' : 'SOLD_OUT',
            maxPerOrder: 10,
            isActive: true
          }
        });
      }
      seededTicketTypesCount++;
    }
  }

  // 3. Seed Draft and Cancelled Events for authorization & visibility boundary verification
  const testCategoryId = defaultCategory;
  
  await prisma.event.upsert({
    where: { slug: 'draft-secret-orchestra' },
    update: {
      status: 'DRAFT',
      isActive: false
    },
    create: {
      slug: 'draft-secret-orchestra',
      title: '[DRAFT - UNPUBLISHED] Private Orchestra Rehearsal',
      description: 'Internal rehearsal session - not for public ticket sales.',
      categoryId: testCategoryId,
      venue: 'Artscape Rehearsal Studio B',
      location: 'Cape Town',
      province: 'Western Cape',
      startDateTime: new Date('2026-11-15T14:00:00Z'),
      imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
      organizerName: 'Artscape Admin',
      status: 'DRAFT',
      isActive: false,
      isFeatured: false
    }
  });

  await prisma.event.upsert({
    where: { slug: 'cancelled-winter-jazz' },
    update: {
      status: 'CANCELLED',
      isActive: false
    },
    create: {
      slug: 'cancelled-winter-jazz',
      title: '[CANCELLED] Winter Jazz Gala 2026',
      description: 'This event was cancelled due to venue renovations.',
      categoryId: testCategoryId,
      venue: 'The Baxter Concert Hall',
      location: 'Cape Town',
      province: 'Western Cape',
      startDateTime: new Date('2026-08-20T19:00:00Z'),
      imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
      organizerName: 'Baxter Theatre Center',
      status: 'CANCELLED',
      isActive: false,
      isFeatured: false
    }
  });

  console.log(`\n✅ Database seed completed successfully!`);
  console.log(`📊 Summary:`);
  console.log(`  - Categories: ${categoryMap.size}`);
  console.log(`  - Published Events: ${seededEventsCount}`);
  console.log(`  - Test Non-Public Events (DRAFT/CANCELLED): 2`);
  console.log(`  - Ticket Types: ${seededTicketTypesCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
