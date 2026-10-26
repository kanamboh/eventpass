/**
 * EVENTPASS — AUTOMATED VERIFICATION SUITE
 * Test Suite: Image Validation Consistency & Safe Event Deletion
 * 
 * Verifies:
 * 1. Image validator rejecting placeholders, mock domains, stubs, and empty strings.
 * 2. Public events catalog, search, and featured exclusions for invalid images.
 * 3. Pagination total and category counts consistency with image eligibility.
 * 4. Public direct event access and ticket types return 404 for invalid-image events.
 * 5. Admin endpoints preserve events with missing/invalid images with proper visibility.
 * 6. Administrative deletion blocked for events with historical transactions (409 Conflict).
 * 7. Administrative deletion blocked for events with active cart reservations (409 Conflict).
 * 8. Deletion failure returns structured dependency details and suggested safe actions.
 * 9. Safe alternatives (DRAFT, CANCELLED, COMPLETED) successfully update status and preserve records.
 * 10. Role-based security: Customer (403) and Unauthenticated (401) blocked from deletion.
 * 11. Eligible event (zero orders/tickets/reservations) permanently deleted cleanly.
 * 12. Production payment freeze and mock provider invariants preserved.
 */

import http from 'node:http';
import { PrismaClient } from '@prisma/client';
import app from './src/app.js';
import { env } from './src/config/env.js';
import { isEventImageValid } from './src/utils/imageValidator.js';

const prisma = new PrismaClient();

class TestHttpClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = [];
  }

  request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const reqHeaders = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {})
      };

      if (this.cookies.length > 0) {
        reqHeaders.Cookie = this.cookies.join('; ');
      }

      const req = http.request(
        url,
        {
          method: options.method || 'GET',
          headers: reqHeaders
        },
        (res) => {
          const setCookieHeaders = res.headers['set-cookie'];
          if (setCookieHeaders) {
            for (const cookieStr of setCookieHeaders) {
              const [cookiePart] = cookieStr.split(';');
              const [name] = cookiePart.split('=');
              this.cookies = this.cookies.filter((c) => !c.startsWith(`${name}=`));
              this.cookies.push(cookiePart);
            }
          }

          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            let parsedBody = null;
            try {
              parsedBody = JSON.parse(data);
            } catch {
              parsedBody = data;
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: parsedBody
            });
          });
        }
      );

      req.on('error', reject);

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  async registerAndLogin(email, password, fullName = 'Tester', role = 'CUSTOMER') {
    const regRes = await this.request('/auth/register', {
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

    if (regRes.status !== 201) {
      throw new Error(`Failed to register user: ${regRes.status} ${JSON.stringify(regRes.body)}`);
    }

    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      await prisma.user.update({
        where: { email },
        data: { role, emailVerified: true }
      });
    } else {
      await prisma.user.update({
        where: { email },
        data: { emailVerified: true }
      });
    }

    const loginRes = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (loginRes.status !== 200) {
      throw new Error(`Failed to log in user: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }

    return loginRes.body;
  }
}

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ❌ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
  }
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('🧪 EVENTPASS: IMAGE VALIDATION & SAFE EVENT DELETION SUITE');
  console.log('===============================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  console.log(`📡 In-process test server listening on ${baseUrl}\n`);

  const customerClient = new TestHttpClient(baseUrl);
  const adminClient = new TestHttpClient(baseUrl);

  const testRunId = Date.now();
  const adminEmail = `admin_test_${testRunId}@eventpass.co.za`;
  const customerEmail = `customer_test_${testRunId}@eventpass.co.za`;
  const defaultPassword = 'SecurePassword123!@#';

  const createdEventIds = [];
  const createdUserIds = [];
  const createdCategoryIds = [];

  try {
    // 0. Set up users
    await adminClient.registerAndLogin(adminEmail, defaultPassword, 'Test Admin', 'ADMIN');
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    createdUserIds.push(adminUser.id);

    await customerClient.registerAndLogin(customerEmail, defaultPassword, 'Test Customer', 'CUSTOMER');
    const customerUser = await prisma.user.findUnique({ where: { email: customerEmail } });
    createdUserIds.push(customerUser.id);

    // Create a dedicated test category
    const testCategory = await prisma.category.create({
      data: {
        name: `Test Cat ${testRunId}`,
        slug: `test-cat-${testRunId}`,
        description: 'Test Category'
      }
    });
    createdCategoryIds.push(testCategory.id);

    // -------------------------------------------------------------
    // PART 1: Image Validation Utility Unit Tests
    // -------------------------------------------------------------
    console.log('🖼️ --- PART 1: Image Validation Utility Rules ---');

    assert(
      isEventImageValid('https://images.unsplash.com/photo-1540575467063-178a50c2df87'),
      'Valid Unsplash photo URL with standard numeric-hex pattern is accepted'
    );
    assert(
      isEventImageValid('https://images.unsplash.com/premium_photo-1681487814165-018814e29155?auto=format&fit=crop'),
      'Valid Unsplash premium photo URL is accepted'
    );
    assert(
      isEventImageValid('https://res.cloudinary.com/eventpass/image/upload/v1234567890/events/concert_poster.jpg'),
      'Valid Cloudinary URL with genuine cloud name is accepted'
    );

    assert(
      !isEventImageValid('https://images.unsplash.com/photo-symphony-456'),
      'Stub Unsplash URL without authentic photo ID is rejected'
    );
    assert(
      !isEventImageValid('https://images.unsplash.com/photo-test-pricing'),
      'Stub Unsplash pricing URL is rejected'
    );
    assert(
      !isEventImageValid('https://res.cloudinary.com/eventpass-mock/image/upload/v1/mock.jpg'),
      'Mock Cloudinary cloud name eventpass-mock is rejected'
    );
    assert(
      !isEventImageValid('https://res.cloudinary.com/demo/image/upload/sample.jpg'),
      'Sample Cloudinary URL is rejected'
    );
    assert(
      !isEventImageValid('https://via.placeholder.com/600x400'),
      'via.placeholder URL is rejected'
    );
    assert(
      !isEventImageValid('https://dummyimage.com/600x400/000/fff'),
      'dummyimage URL is rejected'
    );
    assert(
      !isEventImageValid(''),
      'Empty string image is rejected'
    );
    assert(
      !isEventImageValid(null),
      'Null image is rejected'
    );
    assert(
      !isEventImageValid('javascript:alert(1)'),
      'Non-http URL is rejected'
    );

    // -------------------------------------------------------------
    // PART 2: Public Event Discovery & Catalog Filtering
    // -------------------------------------------------------------
    console.log('\n🔍 --- PART 2: Public Event Discovery & Catalog Filtering ---');

    // Create 4 test events under testCategory
    // Event 1: Valid image, Published
    const evValid = await prisma.event.create({
      data: {
        title: `Valid Image Event ${testRunId}`,
        slug: `valid-img-${testRunId}`,
        description: 'An event with a perfectly valid photo',
        categoryId: testCategory.id,
        venue: 'Grand Hall',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 86400000 * 5),
        endDateTime: new Date(Date.now() + 86400000 * 5 + 14400000),
        imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
        organizerName: 'Organizers Ltd',
        status: 'PUBLISHED',
        isFeatured: true
      }
    });
    createdEventIds.push(evValid.id);

    // Create a ticket tier for evValid
    await prisma.ticketType.create({
      data: {
        eventId: evValid.id,
        name: 'General Admission',
        priceMinor: 15000,
        quantityTotal: 100,
        quantityAvailable: 100
      }
    });

    // Event 2: Stub Unsplash image, Published
    const evStub = await prisma.event.create({
      data: {
        title: `Stub Image Event ${testRunId}`,
        slug: `stub-img-${testRunId}`,
        description: 'An event with a fake photo-symphony-456 stub',
        categoryId: testCategory.id,
        venue: 'City Amphitheater',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 86400000 * 6),
        imageUrl: 'https://images.unsplash.com/photo-symphony-456',
        organizerName: 'Organizers Ltd',
        status: 'PUBLISHED',
        isFeatured: true
      }
    });
    createdEventIds.push(evStub.id);

    // Event 3: Mock Cloudinary image, Published
    const evMockCloud = await prisma.event.create({
      data: {
        title: `Mock Cloudinary Event ${testRunId}`,
        slug: `mock-cloud-${testRunId}`,
        description: 'An event with eventpass-mock Cloudinary',
        categoryId: testCategory.id,
        venue: 'Convention Center',
        location: 'Durban',
        startDateTime: new Date(Date.now() + 86400000 * 7),
        imageUrl: 'https://res.cloudinary.com/eventpass-mock/image/upload/v1/mock.jpg',
        organizerName: 'Organizers Ltd',
        status: 'PUBLISHED',
        isFeatured: false
      }
    });
    createdEventIds.push(evMockCloud.id);

    // Event 4: via.placeholder image, Published
    const evPlaceholder = await prisma.event.create({
      data: {
        title: `Placeholder Event ${testRunId}`,
        slug: `placeholder-img-${testRunId}`,
        description: 'An event with via.placeholder',
        categoryId: testCategory.id,
        venue: 'Civic Centre',
        location: 'Johannesburg',
        startDateTime: new Date(Date.now() + 86400000 * 8),
        imageUrl: 'https://via.placeholder.com/600x400',
        organizerName: 'Organizers Ltd',
        status: 'PUBLISHED',
        isFeatured: false
      }
    });
    createdEventIds.push(evPlaceholder.id);

    // Test Catalog: GET /events?category=<testCategory.slug>
    const catEventsRes = await customerClient.request(`/events?category=${testCategory.slug}`);
    assert(catEventsRes.status === 200, 'Public events by category returned 200');

    const catData = catEventsRes.body.data || catEventsRes.body;
    const catItems = catData.items || [];
    const validFound = catItems.some((e) => e.id === evValid.id);
    const stubFound = catItems.some((e) => e.id === evStub.id);
    const mockFound = catItems.some((e) => e.id === evMockCloud.id);
    const placeholderFound = catItems.some((e) => e.id === evPlaceholder.id);

    assert(validFound, 'Valid image event appears in public category query');
    assert(!stubFound, 'Stub Unsplash event is EXCLUDED from public category query');
    assert(!mockFound, 'Mock Cloudinary event is EXCLUDED from public category query');
    assert(!placeholderFound, 'Placeholder event is EXCLUDED from public category query');

    // Test Pagination Totals
    assert(
      catData.total === 1,
      `Pagination total reflects ONLY image-eligible events (expected: 1, got: ${catData.total})`
    );
    assert(
      catData.totalPages === 1,
      `Pagination totalPages matches total / limit correctly (got: ${catData.totalPages})`
    );
    assert(
      catItems.length === 1,
      `Items count matches pagination total exactly (got: ${catItems.length})`
    );

    // Test Featured Events: GET /events?featured=true
    const featRes = await customerClient.request('/events?featured=true');
    assert(featRes.status === 200, 'Featured events query returned 200');
    const featData = featRes.body.data || featRes.body;
    const featItems = featData.items || featData || [];
    const stubInFeatured = featItems.some((e) => e.id === evStub.id);
    assert(!stubInFeatured, 'Stub image event is EXCLUDED from featured events even if isFeatured=true');

    // Test Categories endpoint: GET /categories
    const allCatsRes = await customerClient.request('/categories');
    assert(allCatsRes.status === 200, 'Categories list returned 200');
    const catList = allCatsRes.body.data?.categories || allCatsRes.body.categories || allCatsRes.body || [];
    const myCatObj = catList.find((c) => c.id === testCategory.id);
    assert(
      myCatObj && myCatObj.eventCount === 1,
      `Category eventCount reflects only image-valid events (expected: 1, got: ${myCatObj?.eventCount})`
    );

    // Test Direct Event Access by Slug / ID
    const validDetailRes = await customerClient.request(`/events/${evValid.slug}`);
    assert(validDetailRes.status === 200, 'Direct access to image-valid event succeeds (200)');

    const stubDetailRes = await customerClient.request(`/events/${evStub.slug}`);
    assert(
      stubDetailRes.status === 404,
      `Direct access to stub-image event returns 404 NOT_FOUND (got: ${stubDetailRes.status})`
    );

    const mockDetailRes = await customerClient.request(`/events/${evMockCloud.id}`);
    assert(
      mockDetailRes.status === 404,
      `Direct access to mock-cloudinary event by ID returns 404 NOT_FOUND (got: ${mockDetailRes.status})`
    );

    // Test Direct Ticket Types query
    const validTiersRes = await customerClient.request(`/events/${evValid.id}/ticket-types`);
    assert(validTiersRes.status === 200, 'Ticket types for valid event returned 200');

    const stubTiersRes = await customerClient.request(`/events/${evStub.id}/ticket-types`);
    assert(
      stubTiersRes.status === 404,
      `Ticket types for stub-image event returns 404 NOT_FOUND (got: ${stubTiersRes.status})`
    );

    // -------------------------------------------------------------
    // PART 3: Admin Discovery & Correction of Missing Image Events
    // -------------------------------------------------------------
    console.log('\n🛠️ --- PART 3: Admin Visibility of Missing Image Events ---');

    const adminEventsRes = await adminClient.request('/admin/events');
    assert(adminEventsRes.status === 200, 'Admin can fetch full event management list (200)');

    const adminItems = adminEventsRes.body.data?.items || adminEventsRes.body.items || [];
    const stubInAdmin = adminItems.find((e) => e.id === evStub.id);
    assert(
      Boolean(stubInAdmin),
      'Admin can see events with missing/stub images for review and correction'
    );
    assert(
      stubInAdmin && stubInAdmin.imageUrl === 'https://images.unsplash.com/photo-symphony-456',
      'Admin view preserves existing URL without silently deleting or replacing it'
    );

    // -------------------------------------------------------------
    // PART 4: Safe Event Deletion & Dependency Protection
    // -------------------------------------------------------------
    console.log('\n🗑️ --- PART 4: Safe Event Deletion Safeguards ---');

    // 4.1 Authorization: Non-admin (Customer) blocked
    const customerDelRes = await customerClient.request(`/admin/events/${evValid.id}`, {
      method: 'DELETE'
    });
    assert(
      customerDelRes.status === 403,
      `Customer role attempting deletion is blocked with 403 Forbidden (got: ${customerDelRes.status})`
    );

    // 4.2 Authorization: Unauthenticated blocked
    const unauthClient = new TestHttpClient(baseUrl);
    const unauthDelRes = await unauthClient.request(`/admin/events/${evValid.id}`, {
      method: 'DELETE'
    });
    assert(
      unauthDelRes.status === 401,
      `Unauthenticated caller attempting deletion is blocked with 401 Unauthorized (got: ${unauthDelRes.status})`
    );

    // 4.3 Event with Historical Orders: Create Order + OrderItem
    const evWithOrder = await prisma.event.create({
      data: {
        title: `Event With Historical Order ${testRunId}`,
        slug: `event-with-order-${testRunId}`,
        description: 'Event with customer order item',
        categoryId: testCategory.id,
        venue: 'Historic Arena',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 86400000 * 10),
        imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
        organizerName: 'Organizers Ltd',
        status: 'PUBLISHED'
      }
    });
    createdEventIds.push(evWithOrder.id);

    const tierWithOrder = await prisma.ticketType.create({
      data: {
        eventId: evWithOrder.id,
        name: 'VIP Admission',
        priceMinor: 50000,
        quantityTotal: 50,
        quantitySold: 1,
        quantityAvailable: 49
      }
    });

    const testOrder = await prisma.order.create({
      data: {
        orderReference: `ORD-TEST-${testRunId}`,
        userId: customerUser.id,
        buyerName: 'Test Customer',
        buyerEmail: customerEmail,
        totalMinor: 50000,
        subtotalMinor: 50000,
        status: 'PAID'
      }
    });

    await prisma.orderItem.create({
      data: {
        orderId: testOrder.id,
        ticketTypeId: tierWithOrder.id,
        quantity: 1,
        unitPriceMinor: 50000,
        totalMinor: 50000,
        eventId: evWithOrder.id
      }
    });

    // Attempt deleting evWithOrder
    const blockedDelRes = await adminClient.request(`/admin/events/${evWithOrder.id}`, {
      method: 'DELETE'
    });

    assert(
      blockedDelRes.status === 409,
      `Deletion of event with historical orders is BLOCKED with 409 Conflict (got: ${blockedDelRes.status})`
    );
    assert(
      blockedDelRes.body.code === 'CANNOT_DELETE_EVENT_WITH_TRANSACTIONS',
      `Blocked deletion returns code CANNOT_DELETE_EVENT_WITH_TRANSACTIONS (got: ${blockedDelRes.body?.code})`
    );
    assert(
      blockedDelRes.body.details?.orderItemsCount === 1,
      `Dependency details includes orderItemsCount=1 (got: ${blockedDelRes.body?.details?.orderItemsCount})`
    );
    assert(
      Array.isArray(blockedDelRes.body.details?.suggestedActions) &&
      blockedDelRes.body.details.suggestedActions.some((a) => a.action === 'CANCELLED'),
      'Suggested safe actions include CANCELLED alternative'
    );

    // Verify record in DB is completely intact
    const verifyEv = await prisma.event.findUnique({ where: { id: evWithOrder.id } });
    assert(Boolean(verifyEv), 'Event record remains completely intact in database after blocked deletion');

    // 4.4 Event with Active Cart Reservation
    const evWithRes = await prisma.event.create({
      data: {
        title: `Event With Reservation ${testRunId}`,
        slug: `event-with-res-${testRunId}`,
        description: 'Event with active reservation',
        categoryId: testCategory.id,
        venue: 'Active Hall',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 86400000 * 12),
        imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
        organizerName: 'Organizers Ltd',
        status: 'PUBLISHED'
      }
    });
    createdEventIds.push(evWithRes.id);

    const tierWithRes = await prisma.ticketType.create({
      data: {
        eventId: evWithRes.id,
        name: 'Standard Ticket',
        priceMinor: 20000,
        quantityTotal: 100,
        quantityReserved: 2,
        quantityAvailable: 98
      }
    });

    const activeRes = await prisma.reservation.create({
      data: {
        sessionId: `sess_${testRunId}`,
        ticketTypeId: tierWithRes.id,
        quantity: 2,
        expiresAt: new Date(Date.now() + 900000) // 15 mins in future
      }
    });

    const blockedResDel = await adminClient.request(`/admin/events/${evWithRes.id}`, {
      method: 'DELETE'
    });

    assert(
      blockedResDel.status === 409,
      `Deletion of event with active reservations is BLOCKED with 409 Conflict (got: ${blockedResDel.status})`
    );
    assert(
      blockedResDel.body.code === 'CANNOT_DELETE_EVENT_ACTIVE_RESERVATIONS',
      `Blocked deletion returns code CANNOT_DELETE_EVENT_ACTIVE_RESERVATIONS (got: ${blockedResDel.body?.code})`
    );

    // Clean up active reservation so we don't leave dangling state
    await prisma.reservation.delete({ where: { id: activeRes.id } });

    // 4.5 Safe Alternatives: Unpublish (DRAFT), Cancel (CANCELLED), Complete (COMPLETED)
    // 4.5.1 Unpublish to DRAFT
    const draftRes = await adminClient.request(`/admin/events/${evWithOrder.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'DRAFT' })
    });
    assert(draftRes.status === 200, 'Unpublishing event with orders to DRAFT succeeds (200)');
    const draftDb = await prisma.event.findUnique({ where: { id: evWithOrder.id } });
    assert(draftDb.status === 'DRAFT', 'Event status updated to DRAFT in DB');

    // 4.5.2 Mark CANCELLED
    const cancelRes = await adminClient.request(`/admin/events/${evWithOrder.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CANCELLED' })
    });
    assert(cancelRes.status === 200, 'Marking event with orders as CANCELLED succeeds (200)');
    const cancelDb = await prisma.event.findUnique({ where: { id: evWithOrder.id } });
    assert(cancelDb.status === 'CANCELLED', 'Event status updated to CANCELLED in DB');

    // 4.5.3 Mark COMPLETED
    const completeRes = await adminClient.request(`/admin/events/${evWithOrder.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'COMPLETED' })
    });
    assert(completeRes.status === 200, 'Marking event with orders as COMPLETED succeeds (200)');
    const completeDb = await prisma.event.findUnique({ where: { id: evWithOrder.id } });
    assert(completeDb.status === 'COMPLETED', 'Event status updated to COMPLETED in DB');

    // Verify historical order item still exists intact
    const historicalOrderItem = await prisma.orderItem.findFirst({
      where: { eventId: evWithOrder.id }
    });
    assert(Boolean(historicalOrderItem), 'Historical order item remains intact throughout all status changes');

    // 4.6 Successful Permanent Deletion for Eligible Event (Zero Dependencies)
    const evEligible = await prisma.event.create({
      data: {
        title: `Clean Eligible Event ${testRunId}`,
        slug: `clean-eligible-${testRunId}`,
        description: 'An eligible event with zero orders or reservations',
        categoryId: testCategory.id,
        venue: 'Empty Hall',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 86400000 * 15),
        imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
        organizerName: 'Organizers Ltd',
        status: 'DRAFT'
      }
    });

    const eligibleTier = await prisma.ticketType.create({
      data: {
        eventId: evEligible.id,
        name: 'Early Bird',
        priceMinor: 10000,
        quantityTotal: 50,
        quantityAvailable: 50
      }
    });

    const successfulDel = await adminClient.request(`/admin/events/${evEligible.id}`, {
      method: 'DELETE'
    });
    assert(
      successfulDel.status === 200,
      `Permanent deletion of eligible event succeeds with 200 OK (got: ${successfulDel.status})`
    );

    const deletedEvDb = await prisma.event.findUnique({ where: { id: evEligible.id } });
    assert(deletedEvDb === null, 'Eligible event record successfully removed from database');

    const deletedTierDb = await prisma.ticketType.findUnique({ where: { id: eligibleTier.id } });
    assert(deletedTierDb === null, 'Dependent ticket tier removed transactionally with event');

    // -------------------------------------------------------------
    // PART 5: Production Safety & Invariants
    // -------------------------------------------------------------
    console.log('\n🔒 --- PART 5: Production Safety & Invariants ---');

    assert(env.PAYMENTS_ENABLED === false, 'PAYMENTS_ENABLED is strictly false');
    assert(env.PAYMENT_PROVIDER === 'MOCK', 'PAYMENT_PROVIDER is strictly MOCK');
    assert(env.EMAIL_PROVIDER === 'MOCK', 'EMAIL_PROVIDER is strictly MOCK');
    assert(env.REGISTRATION_ENABLED === true, 'REGISTRATION_ENABLED is true');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    console.log('\n🧹 --- Teardown: Safely cleaning up temporary test records ---');

    // Clean up created test records in reverse order
    try {
      for (const eventId of createdEventIds) {
        // Remove test order items, tickets, ticket types, and event if created during test
        const tiers = await prisma.ticketType.findMany({ where: { eventId }, select: { id: true } });
        const tierIds = tiers.map((t) => t.id);

        await prisma.orderItem.deleteMany({ where: { eventId } });
        await prisma.orderItem.deleteMany({ where: { ticketTypeId: { in: tierIds } } });
        await prisma.ticket.deleteMany({ where: { eventId } });
        await prisma.reservation.deleteMany({ where: { ticketTypeId: { in: tierIds } } });
        await prisma.ticketType.deleteMany({ where: { eventId } });
        await prisma.event.deleteMany({ where: { id: eventId } });
      }

      await prisma.order.deleteMany({ where: { orderReference: `ORD-TEST-${testRunId}` } });

      for (const catId of createdCategoryIds) {
        await prisma.category.deleteMany({ where: { id: catId } });
      }

      for (const userId of createdUserIds) {
        await prisma.authToken.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }

      console.log('  Cleaned up all temporary test records safely.');
    } catch (cleanupErr) {
      console.warn('  Cleanup warning:', cleanupErr.message);
    }

    server.close();
    await prisma.$disconnect();

    console.log('\n===============================================================');
    console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();
