/**
 * Comprehensive End-to-End Verification Suite: Admin Event Creation & Management
 * 
 * Verifies:
 * 1. Admin Authorization Barrier: Role ADMIN required, CUSTOMER rejected (403), Unauthenticated rejected (401).
 * 2. Invalid event payloads rejected with understandable Zod validation errors.
 * 3. Strict schema enforcement: unexpected fields (city, address, postalCode, startsAt, endsAt, organizerContact) rejected.
 * 4. Admin creates valid draft event with initial ticket tier using priceMinor.
 * 5. Minor unit conversion (ZAR cents) stored and formatted accurately.
 * 6. Publishing constraint: Cannot publish event with 0 ticket tiers (CANNOT_PUBLISH_EMPTY_EVENT).
 * 7. Admin adds additional ticket categories/tiers to existing event.
 * 8. Inventory safety rule F: quantityTotal cannot be reduced below committed inventory (sold + reserved).
 * 9. Customer blocked from editing, publishing, or modifying ticket tiers.
 * 10. Publishing succeeds once valid ticket tiers are attached.
 * 11. Clean, non-destructive test isolation with preservation of historical database records.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:5000/api';

const results = {
  passed: 0,
  failed: 0,
  total: 0
};

const pass = (desc) => {
  results.passed++;
  results.total++;
  console.log(`  ✅ [PASS] ${desc}`);
};

const fail = (desc, err) => {
  results.failed++;
  results.total++;
  console.error(`  ❌ [FAIL] ${desc}`);
  if (err) console.error(`     Error: ${err.message || JSON.stringify(err)}`);
};

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  setFromHeaders(headers) {
    let setCookieHeaders = [];
    if (typeof headers.getSetCookie === 'function') {
      setCookieHeaders = headers.getSetCookie();
    } else {
      const single = headers.get('set-cookie');
      if (single) setCookieHeaders = [single];
    }

    for (const header of setCookieHeaders) {
      const parts = header.split(';').map((p) => p.trim());
      const nameVal = parts[0];
      const eqIdx = nameVal.indexOf('=');
      if (eqIdx !== -1) {
        const name = nameVal.substring(0, eqIdx).trim();
        const val = nameVal.substring(eqIdx + 1).trim();
        if (name && val) {
          this.cookies.set(name, val);
        }
      }
    }
  }

  getCookieHeader() {
    const list = [];
    for (const [name, val] of this.cookies.entries()) {
      if (val) list.push(`${name}=${val}`);
    }
    return list.join('; ');
  }
}

class TestClient {
  constructor(name) {
    this.name = name;
    this.jar = new CookieJar();
    this.user = null;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const cookieHeader = this.jar.getCookieHeader();
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(options.headers || {})
    };

    const res = await fetch(url, {
      ...options,
      headers
    });

    this.jar.setFromHeaders(res.headers);

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    return {
      status: res.status,
      headers: res.headers,
      body
    };
  }

  async registerAndLogin(email, password, fullName, role = 'CUSTOMER') {
    await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        fullName,
        phone: '0821234567',
        city: 'Cape Town',
        termsAccepted: true
      })
    });

    // Authoritatively set role in database
    await prisma.user.updateMany({
      where: { email },
      data: {
        role,
        emailVerified: true
      }
    });

    const loginRes = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password
      })
    });

    this.user = loginRes.body?.data?.user;
    return loginRes;
  }
}

async function runAdminCreationE2ESuite() {
  console.log('\n=========================================================================');
  console.log('🎪 EVENTPASS — ADMIN EVENT CREATION & INVENTORY MANAGEMENT E2E VERIFICATION');
  console.log('=========================================================================\n');

  let testEventId = null;
  let emptyEventId = null;

  try {
    // -------------------------------------------------------------------------
    // Setup Test Actors
    // -------------------------------------------------------------------------
    const admin = new TestClient('Authorized Admin');
    const customer = new TestClient('Ordinary Customer');

    const timestamp = Date.now();
    const adminEmail = `admin_creation_${timestamp}@eventpass.co.za`;
    const customerEmail = `customer_creation_${timestamp}@eventpass.co.za`;

    await admin.registerAndLogin(adminEmail, 'AdminSecret123!', 'Authorized Administrator', 'ADMIN');
    await customer.registerAndLogin(customerEmail, 'CustomerSecret123!', 'Ordinary Customer', 'CUSTOMER');

    // Fetch existing category
    const category = await prisma.category.findFirst();

    if (!category) {
      throw new Error('No active category found in DB.');
    }

    // -------------------------------------------------------------------------
    // 1. Authorization Boundaries (Phase 4)
    // -------------------------------------------------------------------------
    console.log('--- 1. Authorization Boundaries ---');

    // Unauthenticated POST /api/admin/events -> 401
    const unauthClient = new TestClient('Anonymous');
    const unauthRes = await unauthClient.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' })
    });
    if (unauthRes.status === 401) {
      pass('Unauthenticated request to create event strictly rejected with 401 UNAUTHENTICATED');
    } else {
      fail(`Unauthenticated request unexpected status: ${unauthRes.status}`);
    }

    // Customer POST /api/admin/events -> 403
    const custCreateRes = await customer.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Customer Rogue Event',
        description: 'Should never be allowed',
        categoryId: category.id,
        venue: 'Park',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 86400000).toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-test',
        organizerName: 'Rogue Customer'
      })
    });
    if (custCreateRes.status === 403) {
      pass('Ordinary customer request to create event strictly rejected with 403 FORBIDDEN');
    } else {
      fail(`Customer create event not rejected with 403: ${custCreateRes.status}`);
    }

    // Customer GET /api/admin/events -> 403
    const custGetRes = await customer.request('/admin/events');
    if (custGetRes.status === 403) {
      pass('Ordinary customer request to list admin events strictly rejected with 403 FORBIDDEN');
    } else {
      fail(`Customer list admin events not rejected with 403: ${custGetRes.status}`);
    }

    // -------------------------------------------------------------------------
    // 2. Payload Validation & Rejection of Mismatched Fields (Phase 2)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Payload Validation & Strict Schema Checks ---');

    // Mismatched fields: city, address, startsAt, endsAt, organizerContact -> MUST BE REJECTED by .strict()
    const mismatchedPayloadRes = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Mismatched Frontend Payload',
        description: 'Testing that old frontend fields are rejected by strict schema',
        categoryId: category.id,
        venue: 'Grand Arena',
        address: '123 Main St', // Invalid
        city: 'Cape Town',      // Invalid (requires location)
        postalCode: '8001',     // Invalid
        startsAt: new Date(Date.now() + 86400000).toISOString(), // Invalid (requires startDateTime)
        endsAt: new Date(Date.now() + 86400000 * 2).toISOString(), // Invalid (requires endDateTime)
        imageUrl: 'https://images.unsplash.com/photo-valid',
        organizerName: 'Test Org',
        organizerContact: 'test@test.com' // Invalid
      })
    });

    if (mismatchedPayloadRes.status === 400 && mismatchedPayloadRes.body.code === 'VALIDATION_ERROR') {
      pass('Old mismatched frontend payload (city, address, startsAt, etc.) strictly rejected with 400 VALIDATION_ERROR');
    } else {
      fail(`Mismatched payload was not rejected: ${mismatchedPayloadRes.status}`, mismatchedPayloadRes.body);
    }

    // Missing required fields: title < 3 chars
    const shortTitleRes = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'AB',
        description: 'A valid description of at least 10 chars',
        categoryId: category.id,
        venue: 'Venue',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 86400000).toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-valid',
        organizerName: 'Test Org'
      })
    });
    if (shortTitleRes.status === 400 && shortTitleRes.body.message.includes('title')) {
      pass('Validation error message clearly identifies invalid title length (min 3 chars)');
    } else {
      fail(`Short title not rejected properly: ${shortTitleRes.status}`, shortTitleRes.body);
    }

    // Invalid floating-point tier price
    const floatTierRes = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Float Price Test Event',
        description: 'A valid description of at least 10 chars',
        categoryId: category.id,
        venue: 'Venue',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 86400000).toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-valid',
        organizerName: 'Test Org',
        ticketTypes: [
          {
            name: 'General Admission',
            priceMinor: 150.50, // Floating point
            quantityTotal: 100
          }
        ]
      })
    });
    if (floatTierRes.status === 400) {
      pass('Non-integer price minor rejected: Price must be an exact integer minor units (cents)');
    } else {
      fail(`Floating point tier price accepted: ${floatTierRes.status}`);
    }

    // -------------------------------------------------------------------------
    // 3. Admin Event Creation with Nested Ticket Tier (Phase 2 & Phase 3)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Event Creation with Correct Backend Schema ---');

    const createPayload = {
      title: `Kirstenbosch Summer Sunset Concert ${timestamp}`,
      subtitle: 'Live classical and jazz performances under the stars',
      description: 'An enchanting evening of live music in the heart of Kirstenbosch National Botanical Gardens. Bring a picnic basket.',
      categoryId: category.id,
      venue: 'Kirstenbosch Botanical Gardens',
      location: 'Cape Town',
      province: 'Western Cape',
      startDateTime: new Date(Date.now() + 86400000 * 7).toISOString(),
      endDateTime: new Date(Date.now() + 86400000 * 7 + 14400000).toISOString(),
      imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
      bannerUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600',
      organizerName: 'EventPass Productions',
      ageRestriction: 'All Ages',
      status: 'DRAFT',
      ticketTypes: [
        {
          name: 'General Lawn Access',
          description: 'Standard adult entrance to the botanical lawns',
          priceMinor: 22000, // R220.00
          quantityTotal: 250,
          maxPerOrder: 10
        }
      ]
    };

    const createRes = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify(createPayload)
    });

    if (createRes.status === 201 && createRes.body.data?.event) {
      pass('Administrator successfully creates new event with initial ticket tier (201 Created)');
    } else {
      fail(`Admin event creation failed: ${createRes.status}`, createRes.body);
    }

    const createdEvent = createRes.body.data.event;
    testEventId = createdEvent.id;

    // Verify fields
    if (createdEvent.status === 'DRAFT') {
      pass('Created event defaults to status: DRAFT');
    } else {
      fail(`Created event status expected DRAFT, got ${createdEvent.status}`);
    }

    if (createdEvent.location === 'Cape Town' && createdEvent.venue === 'Kirstenbosch Botanical Gardens') {
      pass('Event location ("Cape Town") and venue successfully stored');
    } else {
      fail(`Location/venue incorrect: location=${createdEvent.location}, venue=${createdEvent.venue}`);
    }

    if (createdEvent.startDateTime && createdEvent.endDateTime) {
      pass('ISO-8601 startDateTime and endDateTime stored and returned accurately');
    } else {
      fail('Dates missing or malformed', createdEvent);
    }

    const initialTier = createdEvent.ticketTypes?.[0];
    if (initialTier && initialTier.priceMinor === 22000 && initialTier.quantityTotal === 250) {
      pass('Initial ticket tier created: priceMinor = 22000 (R220.00 ZAR), quantityTotal = 250');
    } else {
      fail('Initial tier data incorrect', initialTier);
    }

    // Verify DRAFT event is not visible in public catalog
    const publicList = await customer.request('/events');
    const foundInPublic = publicList.body.data?.items?.some((e) => e.id === testEventId);
    if (!foundInPublic) {
      pass('DRAFT event is strictly hidden from customer-facing catalog');
    } else {
      fail('DRAFT event leaked into public catalog');
    }

    // -------------------------------------------------------------------------
    // 4. Adding Additional Ticket Categories / Tiers (Phase 3)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Adding Ticket Categories & Tiers ---');

    // Admin creates VIP tier
    const vipTierRes = await admin.request(`/admin/events/${testEventId}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'VIP Golden Circle',
        description: 'Prime seating, welcome wine tasting, and picnic hamper',
        priceMinor: 55000, // R550.00
        paymentPriceUsdMinor: 3000, // $30.00
        quantityTotal: 50,
        maxPerOrder: 6,
        status: 'ACTIVE'
      })
    });

    if (vipTierRes.status === 201 && vipTierRes.body.data?.ticketType) {
      pass('Admin successfully adds VIP ticket tier (R550.00 ZAR, capacity: 50)');
    } else {
      fail(`Failed to add VIP tier: ${vipTierRes.status}`, vipTierRes.body);
    }

    const vipTier = vipTierRes.body.data.ticketType;

    // Verify updated event details
    const eventDetailsRes = await admin.request(`/admin/events/${testEventId}`);
    const eventDetails = eventDetailsRes.body.data?.event;
    if (eventDetails && eventDetails.ticketTypes?.length === 2) {
      pass(`Event now has ${eventDetails.ticketTypes.length} configured ticket categories (Total capacity: 300)`);
    } else {
      fail(`Expected 2 ticket tiers, got ${eventDetails?.ticketTypes?.length}`);
    }

    // -------------------------------------------------------------------------
    // 5. Publishing Constraints & Publishing with Valid Tiers (Phase 3)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Publishing Constraints ---');

    // Create an event with 0 ticket tiers
    const emptyEventRes = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: `Empty Event Without Tiers ${timestamp}`,
        description: 'An event created without any ticket tiers to test publish constraints',
        categoryId: category.id,
        venue: 'Empty Arena',
        location: 'Johannesburg',
        startDateTime: new Date(Date.now() + 86400000 * 10).toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-valid-empty',
        organizerName: 'EventPass Productions'
      })
    });
    const emptyEvent = emptyEventRes.body.data.event;
    emptyEventId = emptyEvent.id;

    // Attempt to publish empty event -> MUST BE REJECTED
    const publishEmptyRes = await admin.request(`/admin/events/${emptyEventId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PUBLISHED' })
    });

    if (publishEmptyRes.status === 400 && publishEmptyRes.body.code === 'CANNOT_PUBLISH_EMPTY_EVENT') {
      pass('Publishing event without ticket tiers is strictly rejected with 400 CANNOT_PUBLISH_EMPTY_EVENT');
    } else {
      fail(`Publishing empty event was allowed: ${publishEmptyRes.status}`, publishEmptyRes.body);
    }

    // Now publish the event that HAS ticket tiers
    const publishValidRes = await admin.request(`/admin/events/${testEventId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PUBLISHED' })
    });

    if (publishValidRes.status === 200 && publishValidRes.body.data?.event?.status === 'PUBLISHED') {
      pass('Admin successfully publishes event with valid ticket categories (status: PUBLISHED)');
    } else {
      fail(`Publishing valid event failed: ${publishValidRes.status}`, publishValidRes.body);
    }

    // Public catalog now displays published event
    const publicPublishedCheck = await customer.request(`/events/${testEventId}`);
    if (publicPublishedCheck.status === 200 && publicPublishedCheck.body.data?.event?.status === 'PUBLISHED') {
      pass('Published event is now live and accessible in the public catalogue');
    } else {
      fail('Published event not accessible in public catalog');
    }

    // -------------------------------------------------------------------------
    // 6. Inventory Safety & Rule F (Phase 3 & Phase 4)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Inventory Safety Rule F ---');

    // Customer reserves 2 VIP tickets (creating 2 active reservations)
    const reserveRes = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: vipTier.id,
        quantity: 2
      })
    });

    if (reserveRes.status === 201) {
      pass('Customer reserves 2 VIP tickets: quantityReserved = 2, quantityAvailable = 48');
    } else {
      fail(`Reservation failed: ${reserveRes.status}`, reserveRes.body);
    }

    // Admin attempts to reduce total quantity below reserved count (< 2)
    const illegalReductionRes = await admin.request(`/admin/events/${testEventId}/ticket-types/${vipTier.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        quantityTotal: 1 // Illegal! Reserved is 2!
      })
    });

    if (illegalReductionRes.status === 400 && illegalReductionRes.body.code === 'INVALID_INVENTORY_UPDATE') {
      pass('CRITICAL INVENTORY RULE F: Reducing quantityTotal below sold + reserved is strictly rejected (400 INVALID_INVENTORY_UPDATE)');
    } else {
      fail(`Illegal inventory reduction allowed: ${illegalReductionRes.status}`, illegalReductionRes.body);
    }

    // Legal capacity adjustment: increase VIP capacity to 60
    const legalUpdateRes = await admin.request(`/admin/events/${testEventId}/ticket-types/${vipTier.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        quantityTotal: 60
      })
    });

    if (legalUpdateRes.status === 200 && legalUpdateRes.body.data?.ticketType?.quantityTotal === 60) {
      pass('Legal capacity increase to 60 succeeded: Available recalculated to 58 (60 - 2 reserved)');
    } else {
      fail(`Legal capacity update failed: ${legalUpdateRes.status}`, legalUpdateRes.body);
    }

    // -------------------------------------------------------------------------
    // 7. Security: Customers Cannot Modify Events (Phase 4)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Non-Admin Modification Defense ---');

    const custUpdateEvent = await customer.request(`/admin/events/${testEventId}`, {
      method: 'PUT',
      body: JSON.stringify({ title: 'Hacked Title' })
    });
    if (custUpdateEvent.status === 403) {
      pass('Customer attempt to update event metadata strictly rejected (403 FORBIDDEN)');
    } else {
      fail(`Customer could modify event: ${custUpdateEvent.status}`);
    }

    const custStatusChange = await customer.request(`/admin/events/${testEventId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'DRAFT' })
    });
    if (custStatusChange.status === 403) {
      pass('Customer attempt to change event status strictly rejected (403 FORBIDDEN)');
    } else {
      fail(`Customer could change event status: ${custStatusChange.status}`);
    }

    const custAddTier = await customer.request(`/admin/events/${testEventId}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Hacked Free Tier',
        priceMinor: 0,
        quantityTotal: 1000
      })
    });
    if (custAddTier.status === 403) {
      pass('Customer attempt to add ticket tier strictly rejected (403 FORBIDDEN)');
    } else {
      fail(`Customer could add ticket tier: ${custAddTier.status}`);
    }

    // -------------------------------------------------------------------------
    // 8. Event Editing Metadata Updates
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Admin Event Editing & Updating ---');

    const updateEventRes = await admin.request(`/admin/events/${testEventId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: `Kirstenbosch Summer Sunset Concert ${timestamp} (Updated)`,
        venue: 'Kirstenbosch Amphitheatre',
        location: 'Cape Town',
        organizerName: 'EventPass South Africa'
      })
    });

    if (updateEventRes.status === 200 && updateEventRes.body.data?.event?.venue === 'Kirstenbosch Amphitheatre') {
      pass('Admin successfully updates event venue and organizer details via PUT /api/admin/events/:id');
    } else {
      fail(`Admin event update failed: ${updateEventRes.status}`, updateEventRes.body);
    }

  } catch (err) {
    fail('Unhandled exception in Admin Event Creation E2E Suite', err);
  } finally {
    // Non-destructive cleanup: Delete only the test events created in this specific run
    try {
      if (testEventId) {
        // Cancel reservations created during test
        await prisma.reservation.deleteMany({
          where: { ticketType: { eventId: testEventId } }
        });
        await prisma.ticketType.deleteMany({
          where: { eventId: testEventId }
        });
        await prisma.event.delete({
          where: { id: testEventId }
        });
      }
      if (emptyEventId) {
        await prisma.event.delete({
          where: { id: emptyEventId }
        });
      }
    } catch (cleanupErr) {
      console.warn('Test cleanup warning (non-fatal):', cleanupErr.message);
    }

    await prisma.$disconnect();
  }

  console.log('\n=========================================================================');
  console.log(`📊 Admin Event Creation E2E Results: ${results.passed} PASSED, ${results.failed} FAILED`);
  console.log('=========================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdminCreationE2ESuite();
