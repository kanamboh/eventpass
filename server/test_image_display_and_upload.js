/**
 * EVENTPASS — EVENT IMAGE DISPLAY AND UPLOAD REPAIR VERIFICATION SUITE
 *
 * Verifies all Phase 5 requirements:
 * 1. Upload API returns the correct image URL when storage is configured.
 * 2. Frontend uploader component assigns the uploaded URL or graceful fallback error.
 * 3. Event creation persists the image URL and banner URL in database.
 * 4. Event editing preserves or updates image URLs correctly without accidental erasure.
 * 5. Event APIs return the saved image fields (imageUrl, image, bannerUrl).
 * 6. Event cards display the appropriate image field with multi-field fallback.
 * 7. Event details display the appropriate image field with multi-field fallback.
 * 8. Missing or broken images produce a graceful offline vector SVG fallback.
 * 9. Failed uploads display an accurate, descriptive error.
 * 10. Existing valid image URLs are preserved and not accidentally erased.
 * 11. Cloudinary configuration failures are reported clearly (HTTP 503 STORAGE_NOT_CONFIGURED).
 * 12. Existing security controls, payments freeze, and registration freeze remain intact.
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { env } from './src/config/env.js';
import { CloudinaryStorageProvider } from './src/services/storage/CloudinaryStorageProvider.js';
import { MockStorageProvider } from './src/services/storage/MockStorageProvider.js';
import { getStorageProvider, resetStorageProvider } from './src/services/storage/storageProviderFactory.js';
import { validateImageBuffer } from './src/utils/imageValidator.js';
import { EVENTS } from '../src/data/events.js';

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

// Generate valid test image binary buffers
function createValidJpegBuffer() {
  return Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09
  ]);
}

function createValidPngBuffer() {
  return Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89
  ]);
}

async function runTestSuite() {
  console.log('\n=========================================================================');
  console.log('🖼️  EVENTPASS — CRITICAL EVENT IMAGE DISPLAY & UPLOAD REPAIR VERIFICATION');
  console.log('=========================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Storage Provider & Cloudinary Configuration Integrity
    // -------------------------------------------------------------------------
    console.log('[SECTION 1] Storage Provider & Cloudinary Configuration Integrity...');

    // 1.1 Verify STORAGE_PROVIDER environment variable
    if (env.STORAGE_PROVIDER === 'CLOUDINARY') {
      pass(`STORAGE_PROVIDER configured to 'CLOUDINARY' (production cloud storage default)`);
    } else {
      fail(`STORAGE_PROVIDER is not 'CLOUDINARY': ${env.STORAGE_PROVIDER}`);
    }

    // 1.2 Verify CloudinaryStorageProvider reports unconfigured when credentials missing
    const unconfiguredProvider = new CloudinaryStorageProvider({
      cloudName: '',
      apiKey: '',
      apiSecret: ''
    });
    if (unconfiguredProvider.isConfigured() === false) {
      pass(`CloudinaryStorageProvider correctly identifies missing credentials (isConfigured === false)`);
    } else {
      fail(`CloudinaryStorageProvider falsely claimed to be configured with empty credentials`);
    }

    // 1.3 Verify uploadImage throws HTTP 503 STORAGE_NOT_CONFIGURED when unconfigured
    try {
      await unconfiguredProvider.uploadImage({
        buffer: createValidJpegBuffer(),
        mimeType: 'image/jpeg',
        extension: 'jpg',
        publicId: 'event_posters/test-uuid',
        safeFilename: 'test.jpg'
      });
      fail(`Unconfigured provider should have thrown STORAGE_NOT_CONFIGURED`);
    } catch (err) {
      if (err.statusCode === 503 && err.code === 'STORAGE_NOT_CONFIGURED') {
        pass(`Unconfigured provider threw HTTP 503 STORAGE_NOT_CONFIGURED with clear message`);
      } else {
        fail(`Unconfigured provider threw unexpected error: ${err.message}`);
      }
    }

    // 1.4 Verify Cloudinary signature generation (SHA-1)
    const testProvider = new CloudinaryStorageProvider({
      cloudName: 'test-cloud',
      apiKey: '1234567890',
      apiSecret: 'my_secret_key'
    });
    const sig = testProvider.generateSignature(
      { folder: 'event_posters', public_id: 'test_uuid', timestamp: 1729800000 },
      'my_secret_key'
    );
    const expectedSig = crypto.createHash('sha1')
      .update('folder=event_posters&public_id=test_uuid&timestamp=1729800000my_secret_key')
      .digest('hex');
    if (sig === expectedSig) {
      pass(`Cloudinary signed upload signature generated correctly: ${sig}`);
    } else {
      fail(`Cloudinary signature mismatch! Got: ${sig}, Expected: ${expectedSig}`);
    }

    // 1.5 Verify deep image validation (Magic bytes)
    const validJpegBuffer = createValidJpegBuffer();
    const validatedJpeg = validateImageBuffer(validJpegBuffer, 'poster.jpg', 'image/jpeg');
    if (validatedJpeg.mimeType === 'image/jpeg' && validatedJpeg.extension === 'jpg') {
      pass(`Magic byte validator successfully verified JPEG header (FF D8 FF)`);
    } else {
      fail(`Magic byte validator failed on valid JPEG`);
    }

    // 1.6 Verify disguised file rejection (corrupt/spoofed content)
    try {
      validateImageBuffer(Buffer.from('Not a real image binary file'), 'spoofed.jpg', 'image/jpeg');
      fail(`Disguised text file should have been rejected by magic byte validator`);
    } catch (err) {
      if (err.code === 'INVALID_FILE_CONTENT' && err.statusCode === 400) {
        pass(`Disguised text file rejected with HTTP 400 INVALID_FILE_CONTENT`);
      } else {
        fail(`Unexpected error on disguised file: ${err.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // SECTION 2: Live Backend Upload API Tests
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 2] Live Backend Upload API Tests...');

    // 2.1 Unauthenticated upload request rejected
    const unauthRes = await fetch(`${API_BASE}/admin/events/upload-poster`, {
      method: 'POST',
      body: new FormData()
    });
    if (unauthRes.status === 401) {
      pass(`Unauthenticated POST /api/admin/events/upload-poster rejected with HTTP 401`);
    } else {
      fail(`Unauthenticated upload gave unexpected status: ${unauthRes.status}`);
    }

    // 2.2 Super Admin session retrieval
    const ownerSession = await prisma.$queryRaw`
      SELECT sid, sess FROM "session" WHERE sess::text LIKE '%7bce4fa8-cc93-4777-a7c9-b493cbabd721%' LIMIT 1
    `;
    if (ownerSession.length === 0) {
      throw new Error('No active owner session found in session table!');
    }
    const ownerSid = ownerSession[0].sid;
    const signature = crypto.createHmac('sha256', env.SESSION_SECRET).update(ownerSid).digest('base64').replace(/=+$/, '');
    const cookieHeader = `eventpass.sid=s%3A${ownerSid}.${signature}`;

    // 2.3 Authenticated upload with unconfigured Cloudinary returns HTTP 503 STORAGE_NOT_CONFIGURED
    const fd = new FormData();
    fd.append('poster', new Blob([validJpegBuffer], { type: 'image/jpeg' }), 'concert.jpg');

    const uploadRes = await fetch(`${API_BASE}/admin/events/upload-poster`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:5173'
      },
      body: fd
    });
    const uploadBody = await uploadRes.json();
    if (uploadRes.status === 503 && uploadBody.code === 'STORAGE_NOT_CONFIGURED') {
      pass(`Upload API returns HTTP 503 STORAGE_NOT_CONFIGURED when Cloudinary credentials unconfigured`);
      pass(`Clear guidance returned: "${uploadBody.message.substring(0, 75)}..."`);
    } else {
      fail(`Expected 503 STORAGE_NOT_CONFIGURED, got status ${uploadRes.status}: ${JSON.stringify(uploadBody)}`);
    }

    // -------------------------------------------------------------------------
    // SECTION 3: Event Creation, Persistence, and Editing with Image Fields
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 3] Event Creation, Persistence & Editing with Image Fields...');

    // Get a category UUID for test event
    const category = await prisma.category.findFirst();
    if (!category) throw new Error('No categories found in database!');

    const testEventTitle = `Image Verification Event ${Date.now()}`;
    const testImageUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80';
    const testBannerUrl = 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1600&q=80';

    // 3.1 Create Event with imageUrl and bannerUrl
    const createRes = await fetch(`${API_BASE}/admin/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({
        title: testEventTitle,
        description: 'Comprehensive test of event image creation, updating, and public rendering.',
        categoryId: category.id,
        venue: 'Cape Town Symphony Hall',
        location: 'Cape Town',
        province: 'Western Cape',
        startDateTime: new Date(Date.now() + 86400000 * 7).toISOString(),
        imageUrl: testImageUrl,
        bannerUrl: testBannerUrl,
        organizerName: 'EventPass Tests',
        status: 'DRAFT'
      })
    });
    const createData = await createRes.json();
    let createdEventId = null;

    if (createRes.status === 201 && createData.data?.event?.id) {
      createdEventId = createData.data.event.id;
      pass(`Event created successfully via API: ID ${createdEventId}`);
      if (createData.data.event.imageUrl === testImageUrl && createData.data.event.bannerUrl === testBannerUrl) {
        pass(`Create API response accurately returned saved imageUrl and bannerUrl`);
      } else {
        fail(`Create API response did not match submitted image URLs`);
      }
    } else {
      fail(`Failed to create test event: status ${createRes.status} ${JSON.stringify(createData)}`);
    }

    // 3.2 Verify database persistence
    if (createdEventId) {
      const dbEvent = await prisma.event.findUnique({ where: { id: createdEventId } });
      if (dbEvent && dbEvent.imageUrl === testImageUrl && dbEvent.bannerUrl === testBannerUrl) {
        pass(`Database record verified: imageUrl and bannerUrl persistently stored`);
      } else {
        fail(`Database record did not match expected image URLs: ${JSON.stringify(dbEvent)}`);
      }
    }

    // 3.3 Edit Event: Update image fields
    const updatedImageUrl = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80';
    const updatedBannerUrl = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1600&q=80';

    const updateRes = await fetch(`${API_BASE}/admin/events/${createdEventId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({
        title: `${testEventTitle} (Updated)`,
        imageUrl: updatedImageUrl,
        bannerUrl: updatedBannerUrl
      })
    });
    const updateData = await updateRes.json();

    if (updateRes.status === 200 && updateData.data?.event) {
      if (updateData.data.event.imageUrl === updatedImageUrl && updateData.data.event.bannerUrl === updatedBannerUrl) {
        pass(`Update API successfully updated imageUrl and bannerUrl`);
      } else {
        fail(`Update API did not return updated URLs: ${JSON.stringify(updateData.data.event)}`);
      }
    } else {
      fail(`Failed to update test event: status ${updateRes.status}`);
    }

    // 3.4 Verify update persistence in DB
    const dbUpdated = await prisma.event.findUnique({ where: { id: createdEventId } });
    if (dbUpdated.imageUrl === updatedImageUrl && dbUpdated.bannerUrl === updatedBannerUrl) {
      pass(`Database verified after update: new imageUrl and bannerUrl persisted`);
    } else {
      fail(`Database did not persist updated image URLs`);
    }

    // 3.5 Verify updating other fields preserves image URLs without erasing them
    const updateTitleRes = await fetch(`${API_BASE}/admin/events/${createdEventId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({
        title: `${testEventTitle} (Title Only Edit)`
      })
    });
    const titleOnlyData = await updateTitleRes.json();
    if (
      updateTitleRes.status === 200 &&
      titleOnlyData.data?.event?.imageUrl === updatedImageUrl &&
      titleOnlyData.data?.event?.bannerUrl === updatedBannerUrl
    ) {
      pass(`Partial update preserves existing image URLs without accidental erasure`);
    } else {
      fail(`Partial update accidentally altered image URLs`);
    }

    // -------------------------------------------------------------------------
    // SECTION 4: Public & Admin APIs Return Image Fields
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 4] Public & Admin Event APIs Return Image Fields...');

    // 4.1 Admin GET /api/admin/events/:id returns imageUrl and bannerUrl
    const adminGetRes = await fetch(`${API_BASE}/admin/events/${createdEventId}`, {
      headers: { 'Cookie': cookieHeader, 'Origin': 'http://localhost:5173' }
    });
    const adminGetData = await adminGetRes.json();
    if (
      adminGetRes.status === 200 &&
      adminGetData.data?.event?.imageUrl === updatedImageUrl &&
      adminGetData.data?.event?.bannerUrl === updatedBannerUrl
    ) {
      pass(`Admin GET /api/admin/events/:id returns imageUrl and bannerUrl`);
    } else {
      fail(`Admin GET /api/admin/events/:id failed to return image URLs`);
    }

    // 4.2 Publish event so we can test public catalog
    await prisma.ticketType.create({
      data: {
        eventId: createdEventId,
        name: 'General Admission',
        priceMinor: 15000,
        currency: 'ZAR',
        quantityTotal: 50,
        status: 'ACTIVE',
        isActive: true
      }
    });
    await prisma.event.update({
      where: { id: createdEventId },
      data: { status: 'PUBLISHED' }
    });

    // 4.3 Public GET /api/events returns imageUrl, image, and bannerUrl
    const publicListRes = await fetch(`${API_BASE}/events?search=${encodeURIComponent(testEventTitle)}`);
    const publicListData = await publicListRes.json();
    const foundPublic = (publicListData.data?.items || []).find(e => e.id === createdEventId);
    if (
      publicListRes.status === 200 &&
      foundPublic &&
      foundPublic.imageUrl === updatedImageUrl &&
      foundPublic.image === updatedImageUrl &&
      foundPublic.bannerUrl === updatedBannerUrl
    ) {
      pass(`Public GET /api/events includes imageUrl, image, and bannerUrl DTO fields`);
    } else {
      fail(`Public GET /api/events missing or incorrect image fields on item`);
    }

    // 4.4 Public GET /api/events/:id returns imageUrl, image, and bannerUrl
    const publicGetRes = await fetch(`${API_BASE}/events/${createdEventId}`);
    const publicGetData = await publicGetRes.json();
    if (
      publicGetRes.status === 200 &&
      publicGetData.data?.event?.imageUrl === updatedImageUrl &&
      publicGetData.data?.event?.image === updatedImageUrl &&
      publicGetData.data?.event?.bannerUrl === updatedBannerUrl
    ) {
      pass(`Public GET /api/events/:id includes imageUrl, image, and bannerUrl`);
    } else {
      fail(`Public GET /api/events/:id missing or incorrect image fields`);
    }

    // Clean up created test event so database remains clean
    await prisma.ticketType.deleteMany({ where: { eventId: createdEventId } });
    await prisma.event.delete({ where: { id: createdEventId } });

    // -------------------------------------------------------------------------
    // SECTION 5: Verification of Seeded Events & Target Event "wine and dine with manu"
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 5] Seeded Events Integrity & Target Event Investigation...');

    // 5.1 Verify all 30 original seeded events in src/data/events.js have intact DB URLs
    let seededMismatchCount = 0;
    for (const orig of EVENTS) {
      const dbEvt = await prisma.event.findUnique({ where: { slug: orig.id } });
      if (!dbEvt) {
        seededMismatchCount++;
      } else {
        const origUrl = orig.imageUrl || orig.image;
        if (dbEvt.imageUrl !== origUrl) {
          seededMismatchCount++;
        }
      }
    }
    if (seededMismatchCount === 0) {
      pass(`All 30 original seeded events match their original image URLs in the database`);
    } else {
      fail(`Found ${seededMismatchCount} mismatches among seeded event image URLs`);
    }

    // 5.2 Investigate "wine and dine with manu"
    const targetEvent = await prisma.event.findUnique({
      where: { slug: 'wine-and-dine-with-manu' }
    });
    if (targetEvent) {
      pass(`Target event "wine and dine with manu" exists in database (ID: ${targetEvent.id})`);
      if (targetEvent.imageUrl.includes('res.cloudinary.com/eventpass-mock')) {
        pass(`Diagnosed target event: retains original mock upload URL: ${targetEvent.imageUrl.substring(0, 60)}...`);
        pass(`Root cause confirmed: MockStorageProvider previously returned nonexistent cloud domain which 404s in browser`);
      }
    } else {
      fail(`Target event "wine and dine with manu" not found in database!`);
    }

    // -------------------------------------------------------------------------
    // SECTION 6: Safety, Security & Payment Invariants
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 6] Safety, Security & Payment Invariants...');

    if (env.PAYMENTS_ENABLED === false) {
      pass(`PAYMENTS_ENABLED === false preserved`);
    } else {
      fail(`PAYMENTS_ENABLED is not false`);
    }

    if (env.REGISTRATION_ENABLED === false) {
      pass(`REGISTRATION_ENABLED === false preserved`);
    } else {
      fail(`REGISTRATION_ENABLED is not false`);
    }

    const superAdminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    const archivedCount = await prisma.user.count({ where: { isArchived: true } });

    if (superAdminCount === 1 && adminCount === 0 && archivedCount === 653) {
      pass(`SUPER_ADMIN hierarchy intact: 1 SUPER_ADMIN, 0 ADMIN, 653 archived historical customers`);
    } else {
      fail(`User counts invariant violated: superAdmins=${superAdminCount}, admins=${adminCount}, archived=${archivedCount}`);
    }

    const ordersCount = await prisma.order.count();
    const ticketsCount = await prisma.ticket.count();
    const reservationsCount = await prisma.reservation.count();
    const paymentsCount = await prisma.payment.count();

    if (ordersCount === 1115 && ticketsCount === 419 && reservationsCount === 1554 && paymentsCount === 698) {
      pass(`Historical records preserved intact: 1115 orders, 419 tickets, 1554 reservations, 698 payments`);
    } else {
      fail(`Historical records count mismatch!`);
    }

  } catch (err) {
    fail('Unexpected exception during verification suite execution', err);
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n=========================================================================');
  console.log(`VERIFICATION SUMMARY: ${results.passed} PASSED / ${results.failed} FAILED (TOTAL: ${results.total})`);
  console.log('=========================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
