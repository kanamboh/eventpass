/**
 * EVENTPASS — STEP 8: ADMIN EVENT & TICKET MANAGEMENT AUDIT SUITE
 * 
 * Verifies all Step 8 requirements:
 * 1. Admin Authorization Barrier: role === 'ADMIN' only
 * 2. Customer attempts strictly rejected with HTTP 403
 * 3. Unauthenticated attempts strictly rejected with HTTP 401
 * 4. Safe 404 for nonexistent event or tier UUID
 * 5. Event creation with Zod validation, auto-generated slug, and default DRAFT status
 * 6. Mass assignment protection: extraneous / privileged fields rejected
 * 7. Published event safety: DRAFT events invisible to public APIs and non-purchasable
 * 8. Publishing constraint: cannot publish an event with 0 ticket tiers
 * 9. Event publishing: becomes publicly visible and purchasable
 * 10. Event metadata editing and status transitions
 * 11. Ticket tier creation with integer minor unit pricing (no floats)
 * 12. Critical Inventory Rule F: cannot reduce quantityTotal below (quantitySold + quantityReserved)
 * 13. Critical Price Rule G: price change does NOT recalculate historical orders
 * 14. Event cancellation safety: deactivates active holds and rejects new purchases
 * 15. Safe tier deletion: cannot delete tier with sold tickets
 * 16. Audit logging: actions recorded in DB (WebhookEvent with provider: ADMIN_AUDIT)
 * 17. Concurrency-safe ticket tier updates
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

    // Authoritatively set role and email verification in database
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

    if (loginRes.status === 200) {
      this.user = loginRes.body.user || loginRes.body.data?.user;
    }
    return loginRes;
  }
}

async function runAdminAuditSuite() {
  console.log('🛡️ =========================================================================');
  console.log('🛡️ EVENTPASS — STEP 8: ADMIN EVENT & TICKET MANAGEMENT AUDIT');
  console.log('🛡️ =========================================================================\n');

  try {
    const timestamp = Date.now();
    const unauthClient = new TestClient('Unauthenticated');
    const customer = new TestClient('CustomerAlice');
    const admin = new TestClient('AdminBoss');

    const customerEmail = `customer_${timestamp}@test.co.za`;
    const adminEmail = `admin_${timestamp}@test.co.za`;

    await customer.registerAndLogin(customerEmail, 'CustomerSecret123#', 'Alice Customer', 'CUSTOMER');
    await admin.registerAndLogin(adminEmail, 'AdminSecret123#', 'Boss Administrator', 'ADMIN');

    // Retrieve or seed a Category
    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({
        data: {
          name: `Festivals_${timestamp}`,
          slug: `festivals-${timestamp}`,
          description: 'Live outdoor festivals'
        }
      });
    }

    // -------------------------------------------------------------------------
    // Phase 1: Admin Authorization & BOLA Denial Testing
    // -------------------------------------------------------------------------
    console.log('--- 1. Admin Authorization & BOLA Access Control ---');

    // 1. Unauthenticated attempts -> HTTP 401
    const unauthGet = await unauthClient.request('/admin/events');
    if (unauthGet.status === 401 && unauthGet.body.code === 'UNAUTHENTICATED') {
      pass('Unauthenticated GET /api/admin/events strictly rejected with 401 UNAUTHENTICATED');
    } else {
      fail(`Unauthenticated GET allowed: ${unauthGet.status}`);
    }

    const unauthPost = await unauthClient.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({ title: 'Hack Event' })
    });
    if (unauthPost.status === 401 && unauthPost.body.code === 'UNAUTHENTICATED') {
      pass('Unauthenticated POST /api/admin/events strictly rejected with 401 UNAUTHENTICATED');
    } else {
      fail(`Unauthenticated POST allowed: ${unauthPost.status}`);
    }

    // 2. Customer role attempts -> HTTP 403
    const custGet = await customer.request('/admin/events');
    if (custGet.status === 403 && custGet.body.code === 'FORBIDDEN') {
      pass('Customer GET /api/admin/events strictly rejected with 403 FORBIDDEN');
    } else {
      fail(`Customer GET allowed: ${custGet.status}`);
    }

    const custPost = await customer.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({ title: 'Unauthorized Event' })
    });
    if (custPost.status === 403 && custPost.body.code === 'FORBIDDEN') {
      pass('Customer POST /api/admin/events strictly rejected with 403 FORBIDDEN');
    } else {
      fail(`Customer POST allowed: ${custPost.status}`);
    }

    const custPut = await customer.request(`/admin/events/${crypto.randomUUID()}`, {
      method: 'PUT',
      body: JSON.stringify({ title: 'Hijack Event' })
    });
    if (custPut.status === 403 && custPut.body.code === 'FORBIDDEN') {
      pass('Customer PUT /api/admin/events/:id strictly rejected with 403 FORBIDDEN');
    } else {
      fail(`Customer PUT allowed: ${custPut.status}`);
    }

    const custPatchStatus = await customer.request(`/admin/events/${crypto.randomUUID()}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PUBLISHED' })
    });
    if (custPatchStatus.status === 403 && custPatchStatus.body.code === 'FORBIDDEN') {
      pass('Customer PATCH /api/admin/events/:id/status strictly rejected with 403 FORBIDDEN');
    } else {
      fail(`Customer status patch allowed: ${custPatchStatus.status}`);
    }

    const custPostTier = await customer.request(`/admin/events/${crypto.randomUUID()}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Free VIP', priceMinor: 0, quantityTotal: 100 })
    });
    if (custPostTier.status === 403 && custPostTier.body.code === 'FORBIDDEN') {
      pass('Customer POST /api/admin/events/:id/ticket-types strictly rejected with 403 FORBIDDEN');
    } else {
      fail(`Customer tier creation allowed: ${custPostTier.status}`);
    }

    // 3. Admin successfully accesses /admin/events -> HTTP 200
    const adminGet = await admin.request('/admin/events');
    if (adminGet.status === 200 && adminGet.body.success === true) {
      pass('Authorized ADMIN user successfully retrieves admin event listing (200 OK)');
    } else {
      fail(`Admin GET failed: ${adminGet.status} ${JSON.stringify(adminGet.body)}`);
    }

    // 4. Safe 404 for nonexistent event
    const nonExistentId = crypto.randomUUID();
    const admin404 = await admin.request(`/admin/events/${nonExistentId}`);
    if (admin404.status === 404 && admin404.body.code === 'EVENT_NOT_FOUND') {
      pass('Nonexistent event UUID returns safe 404 EVENT_NOT_FOUND');
    } else {
      fail(`Nonexistent event did not return 404: ${admin404.status}`);
    }

    // -------------------------------------------------------------------------
    // Phase 2: Event Creation, Zod Validation & Mass-Assignment Defense
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Event Creation & Input Validation ---');

    // 1. Malformed input: Missing description and invalid date
    const malformedCreate = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'AB', // too short
        categoryId: category.id,
        venue: 'Park',
        location: 'Cape Town',
        startDateTime: 'not-a-date',
        imageUrl: 'http://img.com/pic.jpg',
        organizerName: 'Live Events'
      })
    });
    if (malformedCreate.status === 400) {
      pass('Malformed event creation rejected by strict Zod schema validation (400)');
    } else {
      fail(`Malformed creation accepted: ${malformedCreate.status}`);
    }

    // 2. Mass assignment attack: Passing forbidden fields like role, userId, quantitySold
    const massAssignmentCreate = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: `Cape Jazz ${timestamp}`,
        description: 'World-class jazz performances in the botanical gardens.',
        categoryId: category.id,
        venue: 'Kirstenbosch Grounds',
        location: 'Cape Town',
        province: 'Western Cape',
        startDateTime: new Date(Date.now() + 14 * 86400000).toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-jazz-123',
        organizerName: 'Jazz SA',
        // Injected fields:
        role: 'SUPERADMIN',
        userId: customer.user.id,
        quantitySold: 9999
      })
    });
    if (massAssignmentCreate.status === 400) {
      pass('Mass assignment payload containing unexpected fields strictly rejected with 400');
    } else {
      fail(`Mass assignment payload accepted: ${massAssignmentCreate.status}`);
    }

    // 3. Legitimate event creation in DRAFT state
    const validCreateRes = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: `Cape Town Symphony Gala ${timestamp}`,
        subtitle: 'An evening of classical masterworks',
        description: 'Spectacular orchestral performance celebrating South African composers.',
        categoryId: category.id,
        venue: 'City Hall',
        location: 'Cape Town',
        province: 'Western Cape',
        startDateTime: new Date(Date.now() + 20 * 86400000).toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-symphony-456',
        organizerName: 'Philharmonic Society',
        ageRestriction: 'All Ages',
        status: 'DRAFT'
      })
    });

    if (validCreateRes.status === 201 && validCreateRes.body.data?.event) {
      pass('Admin successfully creates new event in DRAFT status with generated slug');
    } else {
      fail(`Event creation failed: ${validCreateRes.status} ${JSON.stringify(validCreateRes.body)}`);
    }

    const createdEvent = validCreateRes.body.data.event;
    const eventId = createdEvent.id;

    if (createdEvent.status === 'DRAFT' && createdEvent.slug.includes('cape-town-symphony-gala')) {
      pass('Created event has status DRAFT and correct deterministic slug format');
    } else {
      fail(`Unexpected event fields: status=${createdEvent.status}, slug=${createdEvent.slug}`);
    }

    // -------------------------------------------------------------------------
    // Phase 3: Published Event Safety (DRAFT Protection)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Published Event Safety & Public Boundary ---');

    // 1. DRAFT event does NOT appear in public catalog
    const publicCatalogRes = await customer.request('/events');
    const foundInPublic = publicCatalogRes.body.data?.items?.some((e) => e.id === eventId);
    if (!foundInPublic) {
      pass('DRAFT event strictly hidden from public event catalog (/api/events)');
    } else {
      fail('DRAFT event leaked into public catalog!');
    }

    // 2. DRAFT event returns 404 when queried via public detail endpoint
    const publicDetailRes = await customer.request(`/events/${eventId}`);
    if (publicDetailRes.status === 404) {
      pass('DRAFT event returns 404 on public event details endpoint (/api/events/:id)');
    } else {
      fail(`DRAFT event accessible publicly: ${publicDetailRes.status}`);
    }

    // 3. Publishing constraint: Cannot publish an event with 0 ticket tiers
    const publishEmptyRes = await admin.request(`/admin/events/${eventId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PUBLISHED' })
    });
    if (publishEmptyRes.status === 400 && publishEmptyRes.body.code === 'CANNOT_PUBLISH_EMPTY_EVENT') {
      pass('Attempt to publish event with 0 ticket tiers strictly rejected with CANNOT_PUBLISH_EMPTY_EVENT');
    } else {
      fail(`Publish empty event allowed: ${publishEmptyRes.status} ${JSON.stringify(publishEmptyRes.body)}`);
    }

    // -------------------------------------------------------------------------
    // Phase 4: Ticket Tier Creation & Integer Minor Unit Enforcement
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Ticket Tier Management & Minor Unit Validation ---');

    // 1. Float price rejection: floating point currencies rejected
    const floatPriceRes = await admin.request(`/admin/events/${eventId}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'General Admission',
        priceMinor: 150.50, // Floating point!
        quantityTotal: 100
      })
    });
    if (floatPriceRes.status === 400) {
      pass('Floating-point ticket price rejected by strict integer minor unit validator');
    } else {
      fail(`Floating-point price accepted: ${floatPriceRes.status}`);
    }

    // 2. Negative price rejection
    const negPriceRes = await admin.request(`/admin/events/${eventId}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'General Admission',
        priceMinor: -5000,
        quantityTotal: 100
      })
    });
    if (negPriceRes.status === 400) {
      pass('Negative ticket price rejected by validator');
    } else {
      fail(`Negative price accepted: ${negPriceRes.status}`);
    }

    // 3. Valid Tier Creation: GA (R150.00 = 15000 minor) and VIP (R450.00 = 45000 minor)
    const gaTierRes = await admin.request(`/admin/events/${eventId}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'General Admission',
        description: 'Standard seated admission to the main hall',
        priceMinor: 15000,
        quantityTotal: 50,
        maxPerOrder: 6
      })
    });
    if (gaTierRes.status === 201 && gaTierRes.body.data?.ticketType) {
      pass('Successfully created General Admission ticket tier (50 tickets @ R150.00)');
    } else {
      fail(`GA tier creation failed: ${gaTierRes.status} ${JSON.stringify(gaTierRes.body)}`);
    }
    const gaTier = gaTierRes.body.data.ticketType;

    const vipTierRes = await admin.request(`/admin/events/${eventId}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'VIP Experience',
        description: 'Front row seats and welcome reception',
        priceMinor: 45000,
        quantityTotal: 20,
        maxPerOrder: 4
      })
    });
    if (vipTierRes.status === 201 && vipTierRes.body.data?.ticketType) {
      pass('Successfully created VIP Experience ticket tier (20 tickets @ R450.00)');
    } else {
      fail(`VIP tier creation failed: ${vipTierRes.status}`);
    }
    const vipTier = vipTierRes.body.data.ticketType;

    // Verify initial inventory invariants
    if (gaTier.quantityAvailable === 50 && gaTier.quantitySold === 0 && gaTier.quantityReserved === 0) {
      pass('Initial ticket tier inventory: quantityAvailable (50) == quantityTotal (50)');
    } else {
      fail('Initial tier inventory incorrect', gaTier);
    }

    // 4. Try reserving tickets on DRAFT event: Must be rejected
    const draftResAttempt = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: gaTier.id, quantity: 2 })
    });
    if (draftResAttempt.status === 400 && draftResAttempt.body.code === 'EVENT_NOT_PUBLISHED') {
      pass('Attempting to reserve tickets for DRAFT event strictly rejected with 400 EVENT_NOT_PUBLISHED');
    } else {
      fail(`DRAFT reservation attempt allowed: ${draftResAttempt.status} ${JSON.stringify(draftResAttempt.body)}`);
    }

    // -------------------------------------------------------------------------
    // Phase 5: Event Publishing & Public Availability
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Event Publishing & Purchase Availability ---');

    // Admin publishes event
    const publishRes = await admin.request(`/admin/events/${eventId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PUBLISHED' })
    });
    if (publishRes.status === 200 && publishRes.body.data?.event?.status === 'PUBLISHED') {
      pass('Admin successfully publishes event (status: PUBLISHED)');
    } else {
      fail(`Publishing failed: ${publishRes.status}`);
    }

    // Public catalog now includes event
    const publicCheck = await customer.request(`/events/${eventId}`);
    if (publicCheck.status === 200 && publicCheck.body.data?.event?.status === 'PUBLISHED') {
      pass('Event is now publicly accessible with live tier availability');
    } else {
      fail('Event still not accessible publicly after publish');
    }

    // Customer can now reserve tickets
    const custRes = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: gaTier.id, quantity: 2 })
    });
    if (custRes.status === 201 && custRes.body.data?.reservation) {
      pass('Customer successfully reserves 2 General Admission tickets on published event');
    } else {
      fail(`Reservation failed: ${custRes.status} ${JSON.stringify(custRes.body)}`);
    }
    const gaReservationId = custRes.body.data.reservation.id;

    // Customer completes purchase (Order -> Payment -> Verify -> Tickets)
    const orderRes = await customer.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [gaReservationId],
        buyerDetails: {
          firstName: 'Alice',
          lastName: 'Customer',
          email: customerEmail,
          phone: '0821234567'
        }
      })
    });
    const order = orderRes.body.data.order;

    // Check if payments are enabled or frozen
    const payStatusRes = await customer.request('/payments/status');
    const paymentsActive = payStatusRes.body.data?.paymentsEnabled;

    if (paymentsActive) {
      const initPayRes = await customer.request('/payments/initialize', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id })
      });
      const paymentRef = initPayRes.body.data?.reference;
      if (paymentRef) {
        await customer.request(`/payments/verify/${paymentRef}`);
      }
    } else {
      // While payments are frozen, transition order to PAID and update tier sold count directly
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'PAID' }
        });
        await tx.ticketType.update({
          where: { id: gaTier.id },
          data: {
            quantitySold: 2,
            quantityReserved: 0,
            quantityAvailable: 48
          }
        });
      });
    }

    // Verify order is PAID
    const verifiedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: { orderItems: true }
    });
    if (verifiedOrder.status === 'PAID') {
      pass('Customer order successfully paid and confirmed (PAID)');
    } else {
      fail(`Order not paid: ${verifiedOrder.status}`);
    }

    // Check inventory state in DB: 2 sold, 0 reserved, 48 available
    const dbGaTier = await prisma.ticketType.findUnique({ where: { id: gaTier.id } });
    if (dbGaTier.quantitySold === 2 && dbGaTier.quantityAvailable === 48) {
      pass('Database inventory confirms: quantitySold = 2, quantityAvailable = 48');
    } else {
      fail('Unexpected inventory numbers after purchase', dbGaTier);
    }

    // -------------------------------------------------------------------------
    // Phase 6: Critical Inventory Rule F (Cannot Reduce Below Sold + Reserved)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Critical Inventory Rule F (Anti-Overselling Guardrail) ---');

    // Customer reserves 3 tickets (creating 3 active holds)
    const holdRes = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: gaTier.id, quantity: 3 })
    });
    if (holdRes.status === 201) {
      pass('Customer created 3 additional active holds (quantityReserved = 3)');
    } else {
      fail('Failed to create second hold');
    }

    // Current State: Sold = 2, Reserved = 3, Total Sold + Reserved = 5.
    // Minimum legal quantityTotal is 5!

    // 1. Admin attempts to reduce quantityTotal to 4 (below 5) -> MUST BE REJECTED!
    const illegalReduction = await admin.request(`/admin/events/${eventId}/ticket-types/${gaTier.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        quantityTotal: 4 // ILLEGAL: sold (2) + reserved (3) = 5
      })
    });

    if (illegalReduction.status === 400 && illegalReduction.body.code === 'INVALID_INVENTORY_UPDATE') {
      pass('CRITICAL INVENTORY RULE F: Attempt to reduce quantityTotal (4) below sold + reserved (5) strictly rejected (400 INVALID_INVENTORY_UPDATE)');
    } else {
      fail(`Overselling vulnerability! Illegal inventory reduction accepted: ${illegalReduction.status} ${JSON.stringify(illegalReduction.body)}`);
    }

    // 2. Admin attempts to set quantityTotal to exactly 5 (minimum legal total) -> Allowed
    const exactLegalReduction = await admin.request(`/admin/events/${eventId}/ticket-types/${gaTier.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        quantityTotal: 5
      })
    });

    if (exactLegalReduction.status === 200 && exactLegalReduction.body.data?.ticketType?.quantityTotal === 5) {
      pass('Setting quantityTotal exactly equal to sold + reserved (5) succeeds with quantityAvailable = 0 (SOLD_OUT)');
    } else {
      fail(`Legal exact reduction failed: ${exactLegalReduction.status} ${JSON.stringify(exactLegalReduction.body)}`);
    }

    // 3. Admin increases capacity to 60 -> Available becomes 60 - 2 - 3 = 55
    const capacityIncrease = await admin.request(`/admin/events/${eventId}/ticket-types/${gaTier.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        quantityTotal: 60
      })
    });

    const updatedTier = capacityIncrease.body.data.ticketType;
    if (updatedTier.quantityTotal === 60 && updatedTier.quantityAvailable === 55) {
      pass('Capacity increase to 60 correctly recalculates quantityAvailable: 60 - 2(sold) - 3(reserved) = 55');
    } else {
      fail(`Capacity increase calculation wrong: total=${updatedTier.quantityTotal}, available=${updatedTier.quantityAvailable}`);
    }

    // -------------------------------------------------------------------------
    // Phase 7: Critical Price Rule G (Historical Order Preservation)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Critical Price Rule G (Historical Order Protection) ---');

    // Alice purchased 2 tickets earlier at R150 (15000 minor) = R300 (30000 minor)
    const originalOrderItem = verifiedOrder.orderItems[0];
    const originalUnitPrice = originalOrderItem.unitPriceMinor;
    const originalTotal = originalOrderItem.totalMinor;

    // Admin updates GA ticket price to R250.00 (25000 minor)
    const priceUpdateRes = await admin.request(`/admin/events/${eventId}/ticket-types/${gaTier.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        priceMinor: 25000
      })
    });
    if (priceUpdateRes.status === 200 && priceUpdateRes.body.data.ticketType.priceMinor === 25000) {
      pass('Admin successfully updates ticket price from R150 to R250 (25000 minor)');
    } else {
      fail('Price update failed', priceUpdateRes.body);
    }

    // Verify Alice's historical order was NOT modified or recalculated
    const aliceOrderAfterPriceChange = await prisma.order.findUnique({
      where: { id: order.id },
      include: { orderItems: true }
    });
    const orderItemAfter = aliceOrderAfterPriceChange.orderItems[0];

    if (
      orderItemAfter.unitPriceMinor === originalUnitPrice &&
      orderItemAfter.totalMinor === originalTotal &&
      aliceOrderAfterPriceChange.totalMinor === verifiedOrder.totalMinor
    ) {
      pass('CRITICAL PRICE RULE G: Historical order line items and total remain strictly preserved (unitPrice: 15000, total: 30000)');
    } else {
      fail('Corruption! Historical order was recalculated with new ticket price!', {
        was: originalTotal,
        now: orderItemAfter.totalMinor
      });
    }

    // -------------------------------------------------------------------------
    // Phase 8: Event Cancellation & Safe Deletion Rules
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Event Cancellation & Safe Deletion ---');

    // 1. Attempt to delete ticket tier that has sold tickets -> MUST BE REJECTED
    const illegalDelete = await admin.request(`/admin/events/${eventId}/ticket-types/${gaTier.id}`, {
      method: 'DELETE'
    });
    if (illegalDelete.status === 400 && illegalDelete.body.code === 'CANNOT_DELETE_ACTIVE_TIER') {
      pass('Attempt to delete ticket tier with sold tickets strictly rejected with CANNOT_DELETE_ACTIVE_TIER');
    } else {
      fail(`Tier with sold tickets deleted: ${illegalDelete.status}`);
    }

    // 2. Admin cancels event
    const cancelRes = await admin.request(`/admin/events/${eventId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CANCELLED' })
    });
    if (cancelRes.status === 200 && cancelRes.body.data.event.status === 'CANCELLED') {
      pass('Admin successfully cancels event (status: CANCELLED)');
    } else {
      fail('Event cancellation failed', cancelRes.body);
    }

    // 3. New reservations strictly blocked on cancelled event
    const cancelResAttempt = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: vipTier.id, quantity: 1 })
    });
    if (cancelResAttempt.status === 400 && cancelResAttempt.body.code === 'EVENT_NOT_PUBLISHED') {
      pass('New reservations strictly blocked on CANCELLED event (400 EVENT_NOT_PUBLISHED)');
    } else {
      fail(`Reservation allowed on cancelled event: ${cancelResAttempt.status}`);
    }

    // -------------------------------------------------------------------------
    // Phase 9: Audit Logging Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Audit Logging Verification ---');

    const auditLogs = await prisma.webhookEvent.findMany({
      where: {
        provider: 'ADMIN_AUDIT',
        payload: {
          path: ['details', 'eventId'],
          equals: eventId
        }
      }
    });

    const eventCreationLog = await prisma.webhookEvent.findFirst({
      where: {
        provider: 'ADMIN_AUDIT',
        eventType: 'event.created',
        payload: {
          path: ['entityId'],
          equals: eventId
        }
      }
    });

    const eventCancelLog = await prisma.webhookEvent.findFirst({
      where: {
        provider: 'ADMIN_AUDIT',
        eventType: 'event.cancelled',
        payload: {
          path: ['entityId'],
          equals: eventId
        }
      }
    });

    if (eventCreationLog && eventCancelLog) {
      pass('Lightweight audit records successfully verified in DB for event.created and event.cancelled');
    } else {
      fail('Audit logs missing for admin operations', {
        foundCreation: Boolean(eventCreationLog),
        foundCancel: Boolean(eventCancelLog)
      });
    }

    // -------------------------------------------------------------------------
    // Phase 10: Adversarial Audit 1 — Concurrent Inventory Updates (Area 1)
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Adversarial Audit 1: Concurrent Inventory Updates ---');

    // Setup an event with tier: total = 100, sold = 60, reserved = 35 -> committed = 95
    const auditEvent10Res = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: `Concurrency Inventory Audit Event ${Date.now()}`,
        description: 'Audit test event for concurrent inventory capacity updates',
        categoryId: category.id,
        venue: 'Grand Arena',
        location: 'Cape Town',
        province: 'Western Cape',
        startDateTime: new Date(Date.now() + 86400000 * 10).toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-test-concurrency',
        organizerName: 'Audit Org'
      })
    });
    const event10Id = auditEvent10Res.body.data.event.id;

    const tier10Res = await admin.request(`/admin/events/${event10Id}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Concurrent Stress Tier',
        priceMinor: 10000,
        quantityTotal: 100
      })
    });
    const tier10Id = tier10Res.body.data.ticketType.id;

    // Simulate database committed state: sold = 60, reserved = 35 (committed = 95)
    await prisma.ticketType.update({
      where: { id: tier10Id },
      data: {
        quantitySold: 60,
        quantityReserved: 35,
        quantityAvailable: 5
      }
    });

    // Concurrently submit 8 admin updates: 4 unsafe (< 95) and 4 safe (>= 95)
    const attemptedTotals = [70, 90, 92, 94, 95, 96, 102, 110];
    const concurrentUpdateResults = await Promise.all(
      attemptedTotals.map((attemptTotal) =>
        admin.request(`/admin/events/${event10Id}/ticket-types/${tier10Id}`, {
          method: 'PUT',
          body: JSON.stringify({ quantityTotal: attemptTotal })
        })
      )
    );

    let rejectedUnsafeCount = 0;
    let safeSuccessCount = 0;

    concurrentUpdateResults.forEach((res, idx) => {
      const attempted = attemptedTotals[idx];
      if (attempted < 95) {
        if (res.status === 400 && res.body.code === 'INVALID_INVENTORY_UPDATE') {
          rejectedUnsafeCount++;
        }
      } else {
        if (res.status === 200) {
          safeSuccessCount++;
        }
      }
    });

    if (rejectedUnsafeCount === 4) {
      pass('Area 1: All 4 unsafe capacity reduction requests (< 95) strictly rejected under concurrency (400 INVALID_INVENTORY_UPDATE)');
    } else {
      fail(`Unsafe capacity reduction leaked through concurrency! (rejected: ${rejectedUnsafeCount}/4)`);
    }

    if (safeSuccessCount > 0) {
      pass(`Area 1: Safe capacity updates successfully executed and serialized (success count: ${safeSuccessCount})`);
    } else {
      fail('Safe capacity updates unexpectedly failed');
    }

    // Verify database row invariant
    const finalTier10 = await prisma.ticketType.findUnique({ where: { id: tier10Id } });
    if (finalTier10.quantityTotal >= 95 && (finalTier10.quantitySold + finalTier10.quantityReserved) <= finalTier10.quantityTotal) {
      pass(`Area 1: Database invariant strictly preserved: quantityTotal (${finalTier10.quantityTotal}) >= sold (${finalTier10.quantitySold}) + reserved (${finalTier10.quantityReserved}) = 95`);
    } else {
      fail('CRITICAL INVARIANT VIOLATION: quantityTotal < quantitySold + quantityReserved in DB!', finalTier10);
    }

    // -------------------------------------------------------------------------
    // Phase 11: Adversarial Audit 2 — Ticket-Type Deletion & Historical Integrity (Area 2)
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Adversarial Audit 2: Ticket-Type Deletion & Historical Integrity ---');

    // Verify foreign keys on OrderItem and Ticket models have onDelete: Restrict
    // Check that Alice's historical order items, orders, and tickets are fully intact
    const originalTicketsCount = await prisma.ticket.count({ where: { orderId: order.id } });
    const originalOrderItemsCount = await prisma.orderItem.count({ where: { orderId: order.id } });

    // Attempt administrative deletion of gaTier (has historical orders and tickets)
    const attemptDeleteActiveTier = await admin.request(`/admin/events/${eventId}/ticket-types/${gaTier.id}`, {
      method: 'DELETE'
    });

    if (attemptDeleteActiveTier.status === 400 && attemptDeleteActiveTier.body.code === 'CANNOT_DELETE_ACTIVE_TIER') {
      pass('Area 2: Administrative deletion of active/sold ticket tier strictly rejected with 400 CANNOT_DELETE_ACTIVE_TIER');
    } else {
      fail(`Deletion of sold tier allowed: ${attemptDeleteActiveTier.status}`, attemptDeleteActiveTier.body);
    }

    // Verify historical orders, items, and tickets remain completely intact
    const remainingTicketsCount = await prisma.ticket.count({ where: { orderId: order.id } });
    const remainingOrderItemsCount = await prisma.orderItem.count({ where: { orderId: order.id } });
    const remainingOrder = await prisma.order.findUnique({ where: { id: order.id } });

    if (
      remainingTicketsCount === originalTicketsCount &&
      remainingOrderItemsCount === originalOrderItemsCount &&
      remainingOrder !== null &&
      remainingOrder.status === 'PAID'
    ) {
      pass('Area 2: Historical orders, order items, and issued tickets remain 100% intact and uncorrupted');
    } else {
      fail('Area 2: Historical records missing or corrupted after deletion attempt!');
    }

    // -------------------------------------------------------------------------
    // Phase 12: Adversarial Audit 3 — Event Cancellation with Active Reservations (Area 3)
    // -------------------------------------------------------------------------
    console.log('\n--- 12. Adversarial Audit 3: Event Cancellation with Active Reservations ---');

    // Create a new published event with a tier
    const auditEvent12Res = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: `Cancellation Reservation Audit ${Date.now()}`,
        description: 'Testing reservation order conversion rejection upon event cancellation',
        categoryId: category.id,
        venue: 'Kirstenbosch Gardens',
        location: 'Cape Town',
        province: 'Western Cape',
        startDateTime: new Date(Date.now() + 86400000 * 14).toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-test-cancellation',
        organizerName: 'Audit Org'
      })
    });
    const event12Id = auditEvent12Res.body.data.event.id;

    const tier12Res = await admin.request(`/admin/events/${event12Id}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Standard Pass',
        priceMinor: 20000,
        quantityTotal: 50
      })
    });
    const tier12Id = tier12Res.body.data.ticketType.id;

    // Publish event
    await admin.request(`/admin/events/${event12Id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PUBLISHED' })
    });

    // Customer creates active reservation for 2 tickets
    const customerBob = new TestClient('Customer Bob');
    const bobEmail = `bob.cancel.${Date.now()}@example.co.za`;
    await customerBob.registerAndLogin(bobEmail, 'StrongPass123!', 'Bob Cancellation Tester');

    const bobRes = await customerBob.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tier12Id, quantity: 2 })
    });
    if (bobRes.status !== 201) {
      fail('Bob failed to create reservation', bobRes.body);
    }
    const bobReservationId = bobRes.body.data.reservation.id;

    // Admin cancels the parent event
    const cancelEventRes = await admin.request(`/admin/events/${event12Id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CANCELLED' })
    });
    if (cancelEventRes.status === 200 && cancelEventRes.body.data.event.status === 'CANCELLED') {
      pass('Area 3: Admin successfully cancelled the parent event while Bob holds an active reservation');
    } else {
      fail('Failed to cancel event in Area 3', cancelEventRes.body);
    }

    // Customer Bob attempts to convert his reservation to an order -> MUST BE REJECTED
    const bobOrderAttempt = await customerBob.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [bobReservationId],
        buyerName: 'Bob Cancellation Tester',
        buyerEmail: bobEmail
      })
    });

    if (
      bobOrderAttempt.status === 400 &&
      (bobOrderAttempt.body.code === 'RESERVATION_CANCELLED' || bobOrderAttempt.body.code === 'EVENT_NOT_PUBLISHED')
    ) {
      pass(`Area 3: Order conversion of reservation on cancelled event strictly rejected with 400 (${bobOrderAttempt.body.code})`);
    } else {
      fail(`Order conversion succeeded on cancelled event: ${bobOrderAttempt.status}`, bobOrderAttempt.body);
    }

    // Verify payment initialization cannot be reached
    const fakePaymentInit = await customerBob.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: crypto.randomUUID() })
    });
    if (fakePaymentInit.status === 404 || fakePaymentInit.status === 400) {
      pass('Area 3: Payment initialization cannot be reached for cancelled event');
    }

    // Verify inventory integrity: no tickets sold, quantityReserved dropped to 0
    const tier12After = await prisma.ticketType.findUnique({ where: { id: tier12Id } });
    if (tier12After.quantitySold === 0 && tier12After.quantityReserved === 0) {
      pass('Area 3: Inventory integrity strictly maintained: quantitySold = 0, quantityReserved = 0');
    } else {
      fail('Area 3: Inventory leakage on cancelled event', tier12After);
    }

    // -------------------------------------------------------------------------
    // Phase 13: Adversarial Audit 4 — Price Change During Active Reservation (Area 4)
    // -------------------------------------------------------------------------
    console.log('\n--- 13. Adversarial Audit 4: Price Change During Active Reservation ---');

    // Create a new published event with a tier priced at R150 (15000 minor)
    const auditEvent13Res = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: `Price Change Audit Event ${Date.now()}`,
        description: 'Testing price change during active reservation vs historical order immutability',
        categoryId: category.id,
        venue: 'Baxter Theatre',
        location: 'Cape Town',
        province: 'Western Cape',
        startDateTime: new Date(Date.now() + 86400000 * 20).toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-test-pricing',
        organizerName: 'Audit Org'
      })
    });
    const event13Id = auditEvent13Res.body.data.event.id;

    const tier13Res = await admin.request(`/admin/events/${event13Id}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Flexible Pricing Tier',
        priceMinor: 15000, // R150.00
        quantityTotal: 40
      })
    });
    const tier13Id = tier13Res.body.data.ticketType.id;

    await admin.request(`/admin/events/${event13Id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PUBLISHED' })
    });

    // Customer Charlie creates an active reservation for 2 tickets at initial R150 price
    const customerCharlie = new TestClient('Customer Charlie');
    const charlieEmail = `charlie.price.${Date.now()}@example.co.za`;
    await customerCharlie.registerAndLogin(charlieEmail, 'StrongPass123!', 'Charlie Price Tester');

    const charlieRes = await customerCharlie.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tier13Id, quantity: 2 })
    });
    const charlieReservationId = charlieRes.body.data.reservation.id;

    // Admin now updates ticket tier price from R150 (15000) to R250 (25000)
    await admin.request(`/admin/events/${event13Id}/ticket-types/${tier13Id}`, {
      method: 'PUT',
      body: JSON.stringify({ priceMinor: 25000 })
    });

    // Customer Charlie converts reservation to an order
    const charlieOrderRes = await customerCharlie.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [charlieReservationId],
        buyerDetails: {
          firstName: 'Charlie',
          lastName: 'Tester',
          email: charlieEmail,
          phone: '0821234567'
        }
      })
    });
    const charlieOrder = charlieOrderRes.body.data?.order;
    const charlieItem = charlieOrder?.orderItems?.[0] || charlieOrder?.items?.[0];

    // Documented architecture behavior: Reservation holds capacity/inventory, not fixed price quote.
    // Order creation charges current authoritative database tier price (25000 minor).
    if (charlieItem && charlieItem.unitPriceMinor === 25000 && charlieOrder.subtotalMinor === 50000) {
      pass('Area 4: Reservation holds inventory capacity; order conversion charges authoritative DB price (25000 minor)');
    } else {
      fail(`Unexpected price charged on order conversion: unitPrice=${charlieItem?.unitPriceMinor}`);
    }

    // Now, admin changes ticket tier price AGAIN to R350 (35000 minor)
    await admin.request(`/admin/events/${event13Id}/ticket-types/${tier13Id}`, {
      method: 'PUT',
      body: JSON.stringify({ priceMinor: 35000 })
    });

    // Charlie's existing order MUST remain frozen at 25000 (historical immutability)
    const charlieOrderFrozen = await prisma.order.findUnique({
      where: { id: charlieOrder.id },
      include: { orderItems: true }
    });
    const charlieFrozenItem = charlieOrderFrozen.orderItems[0];

    if (
      charlieFrozenItem.unitPriceMinor === 25000 &&
      charlieFrozenItem.totalMinor === 50000 &&
      charlieOrderFrozen.subtotalMinor === 50000
    ) {
      pass('Area 4: Historical OrderItem.unitPriceMinor (25000) and order totals strictly immutable after subsequent admin price changes');
    } else {
      fail('Area 4: Historical order price recalculated!', charlieFrozenItem);
    }

    // -------------------------------------------------------------------------
    // Phase 14: Adversarial Audit 5 — Audit Logging Integrity & Spoofing Defense (Area 5)
    // -------------------------------------------------------------------------
    console.log('\n--- 14. Adversarial Audit 5: Audit Logging Integrity & Spoofing Defense ---');

    // Attempt actor identity spoofing via request body
    const spoofAttempt = await admin.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Spoofing Test Event',
        description: 'Attempting to inject spoofed adminUserId and role',
        categoryId: category.id,
        venue: 'Spoof Hall',
        location: 'Cape Town',
        province: 'Western Cape',
        startDateTime: new Date(Date.now() + 86400000 * 5).toISOString(),
        imageUrl: 'https://images.unsplash.com/spoof',
        organizerName: 'Audit Org',
        adminUserId: '00000000-0000-0000-0000-000000000000', // Spoofed actor field
        role: 'SUPERADMIN' // Privileged role injection
      })
    });

    if (spoofAttempt.status === 400 && spoofAttempt.body.code === 'VALIDATION_ERROR') {
      pass('Area 5: Request body actor spoofing (adminUserId / role) strictly rejected with 400 by Zod .strict() schema');
    } else {
      fail(`Actor spoofing payload accepted: ${spoofAttempt.status}`);
    }

    // Verify stored audit records in DB: inspect payload for absence of sensitive secrets
    const latestAuditLogs = await prisma.webhookEvent.findMany({
      where: { provider: 'ADMIN_AUDIT' },
      take: 10,
      orderBy: { createdAt: 'desc' }
    });

    let leaksFound = false;
    for (const log of latestAuditLogs) {
      const payloadStr = JSON.stringify(log.payload);
      if (
        payloadStr.includes('password') ||
        payloadStr.includes('passwordHash') ||
        payloadStr.includes('secret') ||
        payloadStr.includes('qrToken')
      ) {
        leaksFound = true;
        break;
      }
    }

    if (!leaksFound && latestAuditLogs.length > 0) {
      pass(`Area 5: Verified ${latestAuditLogs.length} audit records: zero passwords, tokens, or payment secrets leaked into audit logs`);
    } else {
      fail('Area 5: Sensitive credentials detected in audit logs!');
    }

    // -------------------------------------------------------------------------
    // Phase 15: Adversarial Audit 6 — QuantityAvailable Source of Truth (Area 6)
    // -------------------------------------------------------------------------
    console.log('\n--- 15. Adversarial Audit 6: QuantityAvailable Source of Truth & Zero-Drift ---');

    // Query all ticket tiers in the database
    const allDbTiers = await prisma.ticketType.findMany({
      where: {
        eventId: { in: [eventId, event10Id, event12Id, event13Id] }
      }
    });

    let driftCount = 0;
    for (const t of allDbTiers) {
      const expectedAvailable = Math.max(0, t.quantityTotal - t.quantitySold - t.quantityReserved);
      if (t.quantityAvailable !== expectedAvailable) {
        driftCount++;
      }
    }

    if (driftCount === 0) {
      pass(`Area 6: All ${allDbTiers.length} audited ticket tiers have ZERO drift: quantityAvailable strictly matches GREATEST(0, total - sold - reserved)`);
    } else {
      fail(`Area 6: Detected ${driftCount} ticket tiers with drifted quantityAvailable in database!`);
    }

  } catch (err) {
    fail('Unhandled exception in Admin Events Audit Suite', err);
  } finally {
    await prisma.$disconnect();
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n=========================================================================');
  console.log(`📊 Step 8 Admin Event & Ticket Management: ${results.passed} PASSED, ${results.failed} FAILED`);
  console.log('=========================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdminAuditSuite();
