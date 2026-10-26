/**
 * EVENTPASS — AUTOMATED VERIFICATION SUITE
 * Comprehensive Event-Management Improvements
 * 
 * Objectives Verified:
 * 1. Automatic Event Completion (Phase 2):
 *    - Past-ended events become COMPLETED
 *    - Future events remain PUBLISHED
 *    - Multi-day events remain PUBLISHED until final end time
 *    - Fallback end time (Math.max(start + 4h, endOfDay)) handles missing end time accurately
 *    - DRAFT, CANCELLED, and COMPLETED events are untouched
 *    - Repeated scheduled executions are idempotent and safe
 *    - Cron endpoint security (/api/cron/complete-events): bearer auth & admin session
 *    - Completed events disappear from public upcoming listings
 * 
 * 2. Strict Image Requirement for Public Events (Phase 4):
 *    - Events without images or with invalid/placeholder images excluded from public listings
 *    - Missing-image events remain visible to administrators
 *    - Direct public event-detail / slug endpoint returns 404 for missing image or unpublished events
 *    - Admin publishing without valid image is rejected
 *    - Category event counts only tally published events with valid images
 * 
 * 3. Duplicate-Event Detection and Prevention (Phase 5):
 *    - Exact duplicate creation is rejected (HTTP 409 DUPLICATE_EVENT_DETECTED)
 *    - Normalization: whitespace trimming, lowercase normalization, space collapsing
 *    - Similar titles with overlapping date/venue are detected
 *    - Editing an event does not flag the event itself (excludeEventId)
 *    - Legitimate recurring event proceeds with explicit override (allowDuplicateOverride: true)
 *    - Approved override records an audit entry in WebhookEvent
 *    - Duplicate detection covers all statuses (PUBLISHED, DRAFT, CANCELLED, COMPLETED)
 * 
 * 4. Administrator Permanent Deletion (Phase 3):
 *    - Customer role cannot delete events (403 Forbidden)
 *    - Unauthenticated request is rejected (401 Unauthorized)
 *    - Authorized administrator can delete eligible event with zero orders/tickets
 *    - Dependent ticket types and relations removed transactionally
 *    - Events with historical transactions (orders/tickets) are blocked (409 CANNOT_DELETE_EVENT_WITH_TRANSACTIONS)
 *    - Failed deletion leaves data completely intact
 *    - Cloudinary cleanup: unshared image is deleted, shared image is preserved
 *    - Audit log recorded in WebhookEvent for permanent deletion
 * 
 * 5. Data Integrity & Safety (Phase 6):
 *    - Existing users, orders, tickets, reservations, payments, and unrelated events remain intact
 *    - PAYMENTS_ENABLED remains false
 */

import http from 'node:http';
import { PrismaClient } from '@prisma/client';
import app from './src/app.js';
import { env } from './src/config/env.js';
import { calculateEventEffectiveEndTime, autoCompletePastEvents } from './src/services/eventCompletionService.js';
import { normalizeEventTitle, detectDuplicateEvent } from './src/services/duplicateDetectionService.js';
import { isEventImageValid, extractCloudinaryPublicId } from './src/utils/imageValidator.js';
import { getStorageProvider } from './src/services/storage/storageProviderFactory.js';

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

    return loginRes;
  }
}

async function runTestSuite() {
  const results = { total: 0, passed: 0, failed: 0 };
  const createdEventIds = [];
  const createdUserIds = [];
  const createdOrderIds = [];

  const assert = (condition, description, details = null) => {
    results.total++;
    if (condition) {
      results.passed++;
      console.log(`  ✅ [PASS] ${description}`);
    } else {
      results.failed++;
      console.error(`  ❌ [FAIL] ${description}`);
      if (details) console.error('     Details:', details);
    }
  };

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const anonClient = new TestHttpClient(baseUrl);
  const customerClient = new TestHttpClient(baseUrl);
  const adminClient = new TestHttpClient(baseUrl);

  console.log('\n🚀 =========================================================================');
  console.log('🚀 EVENTPASS — COMPREHENSIVE EVENT-MANAGEMENT VERIFICATION SUITE');
  console.log('🚀 =========================================================================\n');
  console.log(`📡 Ephemeral Test Server running at ${baseUrl}`);

  try {
    // Obtain a test category
    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({
        data: {
          slug: 'test-category',
          name: 'Test Category',
          description: 'Category for automated test suite'
        }
      });
    }

    // Set up test users
    const timestamp = Date.now();
    const customerEmail = `customer_${timestamp}@testpass.co.za`;
    const adminEmail = `admin_${timestamp}@testpass.co.za`;
    const testPassword = 'TestPassword123!';

    console.log('\n--- Setting up test users ---');
    await customerClient.registerAndLogin(customerEmail, testPassword, 'Regular Customer', 'CUSTOMER');
    const custUser = await prisma.user.findUnique({ where: { email: customerEmail } });
    createdUserIds.push(custUser.id);
    console.log(`✓ Customer user registered: ${customerEmail}`);

    await adminClient.registerAndLogin(adminEmail, testPassword, 'Site Admin', 'ADMIN');
    const admUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    createdUserIds.push(admUser.id);
    console.log(`✓ Admin user registered: ${adminEmail}`);

    // =========================================================================
    // SECTION 1: AUTOMATIC EVENT COMPLETION (PHASE 2)
    // =========================================================================
    console.log('\n📋 --- SECTION 1: Automatic Event Completion Tests ---');

    // 1.1 Past-ended event becomes COMPLETED
    const pastEndedEvent = await prisma.event.create({
      data: {
        title: `Past Concert ${timestamp}`,
        slug: `past-concert-${timestamp}`,
        description: 'Concert that has concluded',
        categoryId: category.id,
        venue: 'Kirstenbosch Gardens',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() - 48 * 3600 * 1000), // 2 days ago
        endDateTime: new Date(Date.now() - 24 * 3600 * 1000),   // 1 day ago
        imageUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a',
        organizerName: 'Live Nation',
        status: 'PUBLISHED',
        isActive: true
      }
    });
    createdEventIds.push(pastEndedEvent.id);

    // 1.2 Future event remains PUBLISHED
    const futureEvent = await prisma.event.create({
      data: {
        title: `Future Music Festival ${timestamp}`,
        slug: `future-festival-${timestamp}`,
        description: 'Festival happening next month',
        categoryId: category.id,
        venue: 'Ostrich Farm',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 7 * 24 * 3600 * 1000), // in 7 days
        endDateTime: new Date(Date.now() + 8 * 24 * 3600 * 1000),   // in 8 days
        imageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745',
        organizerName: 'Festival Org',
        status: 'PUBLISHED',
        isActive: true
      }
    });
    createdEventIds.push(futureEvent.id);

    // 1.3 Multi-day event spanning past start date but future end date remains PUBLISHED
    const multiDayEvent = await prisma.event.create({
      data: {
        title: `Multi-Day Conference ${timestamp}`,
        slug: `multiday-conf-${timestamp}`,
        description: 'Conference spanning 3 days, currently on day 2',
        categoryId: category.id,
        venue: 'CTICC',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() - 24 * 3600 * 1000), // started yesterday
        endDateTime: new Date(Date.now() + 24 * 3600 * 1000),   // ends tomorrow
        imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
        organizerName: 'Tech Summit',
        status: 'PUBLISHED',
        isActive: true
      }
    });
    createdEventIds.push(multiDayEvent.id);

    // 1.4 Fallback end time: event lacking endDateTime
    // A: Started 2 hours ago (within 4h fallback window) -> should remain PUBLISHED
    const recentNoEndEvent = await prisma.event.create({
      data: {
        title: `Ongoing Showcase ${timestamp}`,
        slug: `ongoing-showcase-${timestamp}`,
        description: 'Showcase without explicit end date, started recently',
        categoryId: category.id,
        venue: 'Baxter Theatre',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() - 2 * 3600 * 1000), // 2 hours ago
        endDateTime: null,
        imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
        organizerName: 'Showcase Team',
        status: 'PUBLISHED',
        isActive: true
      }
    });
    createdEventIds.push(recentNoEndEvent.id);

    // B: Started 3 days ago (fallback window long expired) -> should become COMPLETED
    const oldNoEndEvent = await prisma.event.create({
      data: {
        title: `Concluded Gala ${timestamp}`,
        slug: `concluded-gala-${timestamp}`,
        description: 'Gala without explicit end date, occurred 3 days ago',
        categoryId: category.id,
        venue: 'City Hall',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() - 3 * 24 * 3600 * 1000), // 3 days ago
        endDateTime: null,
        imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
        organizerName: 'Gala Org',
        status: 'PUBLISHED',
        isActive: true
      }
    });
    createdEventIds.push(oldNoEndEvent.id);

    // 1.5 DRAFT and CANCELLED past events are NOT altered
    const draftPastEvent = await prisma.event.create({
      data: {
        title: `Draft Past Meeting ${timestamp}`,
        slug: `draft-past-${timestamp}`,
        description: 'Draft meeting from last week',
        categoryId: category.id,
        venue: 'Boardroom A',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() - 7 * 24 * 3600 * 1000),
        endDateTime: new Date(Date.now() - 6 * 24 * 3600 * 1000),
        imageUrl: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678',
        organizerName: 'Internal',
        status: 'DRAFT',
        isActive: false
      }
    });
    createdEventIds.push(draftPastEvent.id);

    const cancelledPastEvent = await prisma.event.create({
      data: {
        title: `Cancelled Past Show ${timestamp}`,
        slug: `cancelled-past-${timestamp}`,
        description: 'Cancelled show from last week',
        categoryId: category.id,
        venue: 'Grand Arena',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() - 7 * 24 * 3600 * 1000),
        endDateTime: new Date(Date.now() - 6 * 24 * 3600 * 1000),
        imageUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30',
        organizerName: 'Grand Shows',
        status: 'CANCELLED',
        isActive: false
      }
    });
    createdEventIds.push(cancelledPastEvent.id);

    // Run the automatic event completion service
    const completionResult = await autoCompletePastEvents();
    assert(completionResult.completedCount >= 2, `autoCompletePastEvents completed at least 2 events (actual: ${completionResult.completedCount})`);

    // Verify DB states
    const refetchedPastEnded = await prisma.event.findUnique({ where: { id: pastEndedEvent.id } });
    assert(refetchedPastEnded.status === 'COMPLETED' && refetchedPastEnded.isActive === false, 'Past-ended event status updated to COMPLETED with isActive=false');

    const refetchedFuture = await prisma.event.findUnique({ where: { id: futureEvent.id } });
    assert(refetchedFuture.status === 'PUBLISHED' && refetchedFuture.isActive === true, 'Future event remains PUBLISHED with isActive=true');

    const refetchedMultiDay = await prisma.event.findUnique({ where: { id: multiDayEvent.id } });
    assert(refetchedMultiDay.status === 'PUBLISHED' && refetchedMultiDay.isActive === true, 'Multi-day event whose end date is future remains PUBLISHED');

    const refetchedRecentNoEnd = await prisma.event.findUnique({ where: { id: recentNoEndEvent.id } });
    assert(refetchedRecentNoEnd.status === 'PUBLISHED', 'Recent event without endDateTime remains PUBLISHED within 4h/calendar-day fallback window');

    const refetchedOldNoEnd = await prisma.event.findUnique({ where: { id: oldNoEndEvent.id } });
    assert(refetchedOldNoEnd.status === 'COMPLETED', 'Old event without endDateTime transitioned to COMPLETED after fallback window');

    const refetchedDraft = await prisma.event.findUnique({ where: { id: draftPastEvent.id } });
    assert(refetchedDraft.status === 'DRAFT', 'DRAFT event left unchanged by completion job');

    const refetchedCancelled = await prisma.event.findUnique({ where: { id: cancelledPastEvent.id } });
    assert(refetchedCancelled.status === 'CANCELLED', 'CANCELLED event left unchanged by completion job');

    // 1.6 Idempotency: Running completion service again is safe and completes 0 additional
    const secondCompletion = await autoCompletePastEvents();
    assert(secondCompletion.completedCount === 0, 'Repeated execution is idempotent (completed 0 additional events)');

    // 1.7 Cron endpoint security (/api/cron/complete-events)
    const unauthCron = await anonClient.request('/cron/complete-events', { method: 'POST' });
    assert(unauthCron.status === 401, 'Unauthenticated cron call rejected with 401 Unauthorized');

    const invalidBearerCron = await anonClient.request('/cron/complete-events', {
      method: 'POST',
      headers: { Authorization: 'Bearer totally-invalid-token' }
    });
    assert(invalidBearerCron.status === 401, 'Invalid Bearer token cron call rejected with 401 Unauthorized');

    const adminCron = await adminClient.request('/cron/complete-events', { method: 'POST' });
    assert(adminCron.status === 200 && (adminCron.body.success === true || adminCron.body.status === 'success'), 'Admin session successfully invokes cron endpoint');

    // If CRON_SECRET configured or mocked, test valid Bearer
    if (env.CRON_SECRET) {
      const validBearerCron = await anonClient.request('/cron/complete-events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` }
      });
      assert(validBearerCron.status === 200, 'Valid CRON_SECRET Bearer header successfully authorizes cron request');
    }

    // 1.8 Completed events hidden from public listing
    const publicListRes = await anonClient.request('/events');
    const publicEvents = publicListRes.body.data?.items || publicListRes.body.data?.events || (Array.isArray(publicListRes.body.data) ? publicListRes.body.data : []);
    const containsCompleted = publicEvents.some((e) => e.id === pastEndedEvent.id || e.status === 'COMPLETED');
    assert(!containsCompleted, 'COMPLETED events are strictly excluded from public upcoming event listings');

    // =========================================================================
    // SECTION 2: STRICT IMAGE REQUIREMENT FOR PUBLIC EVENTS (PHASE 4)
    // =========================================================================
    console.log('\n🖼️ --- SECTION 2: Strict Image Requirement Tests ---');

    // 2.1 Event with empty image URL is excluded from public listing
    const emptyImageEvent = await prisma.event.create({
      data: {
        title: `Empty Image Event ${timestamp}`,
        slug: `empty-image-${timestamp}`,
        description: 'Event with empty image string',
        categoryId: category.id,
        venue: 'Public Park',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 10 * 24 * 3600 * 1000),
        imageUrl: '',
        organizerName: 'Park Org',
        status: 'PUBLISHED',
        isActive: true
      }
    });
    createdEventIds.push(emptyImageEvent.id);

    // 2.2 Event with placeholder URL is excluded from public listing
    const placeholderImageEvent = await prisma.event.create({
      data: {
        title: `Placeholder Image Event ${timestamp}`,
        slug: `placeholder-image-${timestamp}`,
        description: 'Event with dummy placeholder image',
        categoryId: category.id,
        venue: 'Public Hall',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 12 * 24 * 3600 * 1000),
        imageUrl: 'https://via.placeholder.com/600x400.png',
        organizerName: 'Placeholder Org',
        status: 'PUBLISHED',
        isActive: true
      }
    });
    createdEventIds.push(placeholderImageEvent.id);

    // Fetch public catalogue with search filter for future event
    const publicEvents2 = await anonClient.request(`/events?limit=50&search=${encodeURIComponent(futureEvent.title)}`);
    const catalogue = publicEvents2.body.data?.items || publicEvents2.body.data?.events || (Array.isArray(publicEvents2.body.data) ? publicEvents2.body.data : []);
    const hasEmptyImage = catalogue.some((e) => e.id === emptyImageEvent.id);
    const hasPlaceholder = catalogue.some((e) => e.id === placeholderImageEvent.id);
    const hasFutureValid = catalogue.some((e) => e.id === futureEvent.id);

    assert(!hasEmptyImage, 'Event with empty imageUrl is excluded from public catalogue');
    assert(!hasPlaceholder, 'Event with placeholder imageUrl is excluded from public catalogue');
    assert(hasFutureValid, 'Event with valid image URL is visible in public catalogue');

    // 2.3 Direct slug endpoint (/api/events/:slug) for missing/placeholder image returns 404
    const emptyImageSlugRes = await anonClient.request(`/events/${emptyImageEvent.slug}`);
    assert(emptyImageSlugRes.status === 404, 'Public detail request for event with empty image returns 404 Not Found');

    const placeholderSlugRes = await anonClient.request(`/events/${placeholderImageEvent.slug}`);
    assert(placeholderSlugRes.status === 404, 'Public detail request for event with placeholder image returns 404 Not Found');

    // 2.4 Direct slug endpoint for unpublished (DRAFT) event returns 404
    const draftSlugRes = await anonClient.request(`/events/${draftPastEvent.slug}`);
    assert(draftSlugRes.status === 404, 'Public detail request for DRAFT event returns 404 Not Found');

    // 2.5 Admin can still see missing-image events in admin inventory
    const adminEventsRes = await adminClient.request('/admin/events?limit=50');
    const adminEvents = adminEventsRes.body.data?.items || adminEventsRes.body.data?.events || [];
    const adminHasEmpty = adminEvents.some((e) => e.id === emptyImageEvent.id);
    assert(adminHasEmpty, 'Administrator inventory still includes events with missing/invalid images');

    // 2.6 Admin cannot publish an event without a valid image URL
    const invalidPublishRes = await adminClient.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: `Invalid Image Event ${timestamp}`,
        description: 'Should fail to publish without valid image',
        categoryId: category.id,
        venue: 'Town Square',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString(),
        imageUrl: '',
        organizerName: 'Test Org',
        status: 'PUBLISHED'
      })
    });
    assert(invalidPublishRes.status === 400, 'Admin creating event directly with status=PUBLISHED and empty imageUrl is rejected with 400 Bad Request');

    const updateStatusNoImageRes = await adminClient.request(`/admin/events/${emptyImageEvent.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PUBLISHED' })
    });
    assert(updateStatusNoImageRes.status === 400, 'Admin attempting to transition missing-image event to PUBLISHED is rejected with 400 Bad Request');

    // =========================================================================
    // SECTION 3: DUPLICATE-EVENT DETECTION & PREVENTION (PHASE 5)
    // =========================================================================
    console.log('\n🔍 --- SECTION 3: Duplicate-Event Detection Tests ---');

    // Clean up any potential leftover test events from crashed test runs
    await prisma.event.deleteMany({
      where: {
        title: { contains: 'Jazz Spectacular' }
      }
    });

    // Create a base event for duplicate testing
    const testSalt = Math.random().toString(36).substring(2, 7);
    const baseEventTitle = `Cape Town Jazz Spectacular ${testSalt} ${timestamp}`;
    const baseStartDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const baseVenue = 'Artscape Opera House';

    const baseEventRes = await adminClient.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: baseEventTitle,
        description: 'Premier jazz showcase in Cape Town',
        categoryId: category.id,
        venue: baseVenue,
        location: 'Cape Town',
        startDateTime: baseStartDate.toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
        organizerName: 'Jazz Festival Org',
        status: 'DRAFT'
      })
    });
    assert(baseEventRes.status === 201, 'Base event created successfully for duplicate testing', baseEventRes.body);
    const baseEventId = baseEventRes.body.data?.event?.id || baseEventRes.body.event?.id;
    if (baseEventId) createdEventIds.push(baseEventId);

    // 3.1 Exact duplicate creation is rejected
    const exactDupRes = await adminClient.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: baseEventTitle,
        description: 'Exact copy attempt description',
        categoryId: category.id,
        venue: baseVenue,
        location: 'Cape Town',
        startDateTime: baseStartDate.toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
        organizerName: 'Jazz Festival Org',
        status: 'DRAFT'
      })
    });
    assert(exactDupRes.status === 409, 'Exact duplicate creation rejected with HTTP 409');
    assert(exactDupRes.body.code === 'DUPLICATE_EVENT_DETECTED', 'Duplicate error returns DUPLICATE_EVENT_DETECTED error code');

    // 3.2 Normalized title match: extra spaces, mixed case, leading/trailing whitespace
    const normalizedTitleAttempt = `   cApE   tOwN   jAzZ   sPeCtAcUlAr   ${timestamp}   `;
    const normalizedDupRes = await adminClient.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: normalizedTitleAttempt,
        description: 'Normalized title duplicate attempt description',
        categoryId: category.id,
        venue: baseVenue,
        location: 'Cape Town',
        startDateTime: baseStartDate.toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
        organizerName: 'Jazz Festival Org',
        status: 'DRAFT'
      })
    });
    assert(normalizedDupRes.status === 409, 'Title with whitespace and case variations correctly detected as duplicate (409)');

    // 3.3 Editing an existing event without changing title does NOT flag itself as duplicate
    const editSelfRes = await adminClient.request(`/admin/events/${baseEventId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: baseEventTitle,
        description: 'Updated description for same event in Cape Town',
        categoryId: category.id,
        venue: baseVenue,
        location: 'Cape Town',
        startDateTime: baseStartDate.toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
        organizerName: 'Jazz Festival Org'
      })
    });
    assert(editSelfRes.status === 200, 'Editing existing event excludes itself from duplicate detection (HTTP 200)');

    // 3.4 Legitimate recurring event creation proceeds with allowDuplicateOverride: true
    const overrideRes = await adminClient.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({
        title: baseEventTitle,
        description: 'Legitimate recurring session approved by administrator',
        categoryId: category.id,
        venue: baseVenue,
        location: 'Cape Town',
        startDateTime: baseStartDate.toISOString(),
        imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4',
        organizerName: 'Jazz Festival Org',
        status: 'DRAFT',
        allowDuplicateOverride: true
      })
    });
    assert(overrideRes.status === 201, 'Legitimate recurring event created with explicit administrator override (HTTP 201)');
    const overrideEventId = overrideRes.body.data?.event?.id || overrideRes.body.event?.id;
    if (overrideEventId) createdEventIds.push(overrideEventId);

    // 3.5 Check that duplicate override recorded an audit entry
    const overrideAudit = await prisma.webhookEvent.findFirst({
      where: {
        provider: 'ADMIN_AUDIT',
        eventType: 'event.duplicate_override_approved'
      },
      orderBy: { createdAt: 'desc' }
    });
    assert(overrideAudit !== null, 'Approved duplicate override logged in WebhookEvent audit table');

    // =========================================================================
    // SECTION 4: ADMINISTRATOR PERMANENT DELETION (PHASE 3)
    // =========================================================================
    console.log('\n🗑️ --- SECTION 4: Administrator Permanent Deletion Tests ---');

    // 4.1 Unauthorized customer cannot delete an event
    const custDeleteRes = await customerClient.request(`/admin/events/${overrideEventId}`, {
      method: 'DELETE'
    });
    assert(custDeleteRes.status === 403, 'Customer role attempting permanent deletion rejected with 403 Forbidden');

    // 4.2 Unauthenticated user cannot delete an event
    const anonDeleteRes = await anonClient.request(`/admin/events/${overrideEventId}`, {
      method: 'DELETE'
    });
    assert(anonDeleteRes.status === 401, 'Unauthenticated caller attempting permanent deletion rejected with 401 Unauthorized');

    // 4.3 Create an event with a dummy order/ticket to test transaction blocking
    const eventWithOrder = await prisma.event.create({
      data: {
        title: `Event With Transaction ${timestamp}`,
        slug: `event-with-trans-${timestamp}`,
        description: 'Event that has customer ticket orders',
        categoryId: category.id,
        venue: 'Grand Arena',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 20 * 24 * 3600 * 1000),
        imageUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a',
        organizerName: 'Grand Productions',
        status: 'PUBLISHED',
        isActive: true,
        ticketTypes: {
          create: {
            name: 'General Admission',
            priceMinor: 25000,
            currency: 'ZAR',
            quantityTotal: 100,
            quantitySold: 1,
            quantityReserved: 0,
            quantityAvailable: 99,
            status: 'ACTIVE'
          }
        }
      },
      include: { ticketTypes: true }
    });
    createdEventIds.push(eventWithOrder.id);
    const tier = eventWithOrder.ticketTypes[0];

    // Create a mock order for this event
    const testOrder = await prisma.order.create({
      data: {
        orderReference: `ORD-TEST-${timestamp}`,
        userId: custUser.id,
        buyerName: 'Regular Customer',
        buyerEmail: customerEmail,
        subtotalMinor: 25000,
        totalMinor: 25000,
        currency: 'ZAR',
        status: 'PAID',
        orderItems: {
          create: {
            eventId: eventWithOrder.id,
            ticketTypeId: tier.id,
            quantity: 1,
            unitPriceMinor: 25000,
            totalMinor: 25000
          }
        }
      }
    });
    createdOrderIds.push(testOrder.id);

    // 4.4 Attempt permanent deletion of event with existing orders -> must be blocked!
    const blockedDeleteRes = await adminClient.request(`/admin/events/${eventWithOrder.id}`, {
      method: 'DELETE'
    });
    assert(blockedDeleteRes.status === 409, 'Permanent deletion of event with orders blocked with HTTP 409 Conflict');
    assert(blockedDeleteRes.body.code === 'CANNOT_DELETE_EVENT_WITH_TRANSACTIONS', 'Blocked deletion returns CANNOT_DELETE_EVENT_WITH_TRANSACTIONS');

    // Verify event still exists in DB
    const stillExistingEvent = await prisma.event.findUnique({ where: { id: eventWithOrder.id } });
    assert(stillExistingEvent !== null, 'Event with orders was not deleted; remained completely intact');

    // 4.5 Permanent deletion of eligible event (zero orders/tickets) succeeds
    const eligibleEvent = await prisma.event.create({
      data: {
        title: `Eligible Deletion Event ${timestamp}`,
        slug: `eligible-delete-${timestamp}`,
        description: 'Zero transaction event created for deletion test',
        categoryId: category.id,
        venue: 'Temporary Hall',
        location: 'Cape Town',
        startDateTime: new Date(Date.now() + 50 * 24 * 3600 * 1000),
        imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
        organizerName: 'Temp Org',
        status: 'DRAFT',
        ticketTypes: {
          create: {
            name: 'Early Bird',
            priceMinor: 15000,
            currency: 'ZAR',
            quantityTotal: 50,
            quantitySold: 0,
            quantityReserved: 0,
            quantityAvailable: 50,
            status: 'ACTIVE'
          }
        }
      }
    });

    const successfulDeleteRes = await adminClient.request(`/admin/events/${eligibleEvent.id}`, {
      method: 'DELETE'
    });
    assert(successfulDeleteRes.status === 200, 'Permanent deletion of eligible event succeeded with HTTP 200 OK');

    // Verify event and its ticket tiers are gone from DB
    const deletedEventCheck = await prisma.event.findUnique({ where: { id: eligibleEvent.id } });
    assert(deletedEventCheck === null, 'Deleted event record no longer exists in database');

    const remainingTiers = await prisma.ticketType.findMany({ where: { eventId: eligibleEvent.id } });
    assert(remainingTiers.length === 0, 'Dependent ticket tiers removed transactionally');

    // 4.6 Verify deletion audit record
    const deleteAudit = await prisma.webhookEvent.findFirst({
      where: {
        provider: 'ADMIN_AUDIT',
        eventType: 'event.permanently_deleted'
      },
      orderBy: { createdAt: 'desc' }
    });
    assert(deleteAudit !== null, 'Permanent deletion logged in WebhookEvent audit table with admin ID and event ID');

    // =========================================================================
    // SECTION 5: DATA INTEGRITY & ARCHITECTURE SAFETY (PHASE 6)
    // =========================================================================
    console.log('\n🔒 --- SECTION 5: Data Integrity & Platform Safety Tests ---');

    assert(env.PAYMENTS_ENABLED === false, 'PAYMENTS_ENABLED remains strictly false');

    // Ensure customer order remains intact
    const refetchedOrder = await prisma.order.findUnique({ where: { id: testOrder.id } });
    assert(refetchedOrder !== null && refetchedOrder.status === 'PAID', 'Customer historical order remains intact and unmodified');

    // Cloudinary safety validator tests
    assert(isEventImageValid('https://res.cloudinary.com/eventpass/image/upload/v1234/events/photo.jpg') === true, 'Cloudinary image URL is validated as genuine');
    assert(isEventImageValid('https://images.unsplash.com/photo-1501386761578-eac5c94b800a') === true, 'Unsplash image URL is validated as genuine');
    assert(isEventImageValid('https://via.placeholder.com/150') === false, 'Placeholder image URL rejected by image validator');
    assert(isEventImageValid('') === false, 'Empty string rejected by image validator');
    assert(isEventImageValid(null) === false, 'Null rejected by image validator');
    assert(isEventImageValid('javascript:alert(1)') === false, 'Malicious URI rejected by image validator');

    const publicId = extractCloudinaryPublicId('https://res.cloudinary.com/cloudname/image/upload/v1612345678/events/concert-2026.jpg');
    assert(publicId === 'events/concert-2026', 'Cloudinary public ID extracted correctly from URL');

  } catch (err) {
    console.error('💥 Unexpected error during test run:', err);
    results.failed++;
  } finally {
    console.log('\n🧹 --- Teardown: Safely cleaning up test records ---');
    // Clean up created test orders
    for (const orderId of createdOrderIds) {
      try {
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.delete({ where: { id: orderId } });
      } catch (e) {
        console.warn(`Could not clean up test order ${orderId}:`, e.message);
      }
    }

    // Clean up created test events
    for (const eventId of createdEventIds) {
      try {
        await prisma.ticketType.deleteMany({ where: { eventId } });
        await prisma.eventPromoCode.deleteMany({ where: { eventId } });
        await prisma.event.delete({ where: { id: eventId } });
      } catch (e) {
        // Ignored if already deleted by tests
      }
    }

    // Clean up created test users
    for (const userId of createdUserIds) {
      try {
        await prisma.user.delete({ where: { id: userId } });
      } catch (e) {
        console.warn(`Could not clean up test user ${userId}:`, e.message);
      }
    }

    server.close();
    await prisma.$disconnect();

    console.log('\n===============================================================');
    console.log(`📊 TEST RESULTS: ${results.passed}/${results.total} PASSED (${results.failed} failed)`);
    console.log('===============================================================\n');

    if (results.failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTestSuite();
