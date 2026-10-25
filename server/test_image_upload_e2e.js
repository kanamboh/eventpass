/**
 * EventPass Secure Event Poster Image Uploads — Comprehensive E2E Verification Suite
 *
 * Verifies all 10 Phase 6 requirements:
 * 1. An ADMIN can upload a valid image (JPEG, PNG, WebP).
 * 2. A CUSTOMER cannot upload an image (HTTP 403 Forbidden).
 * 3. An unauthenticated request is rejected (HTTP 401 Unauthorized).
 * 4. An unsupported image format is rejected (HTTP 400 INVALID_FILE_TYPE).
 * 5. A file larger than 5 MB is rejected (HTTP 400 LIMIT_FILE_SIZE).
 * 6. Invalid image content disguised with a valid extension is rejected (HTTP 400 INVALID_FILE_CONTENT).
 * 7. Missing storage configuration produces a safe, understandable error (HTTP 503 STORAGE_NOT_CONFIGURED).
 * 8. Existing image URLs continue to work.
 * 9. Uploaded image URLs are saved and displayed correctly in public catalogue.
 * 10. Payments remain disabled (PAYMENTS_ENABLED=false).
 */

import crypto from 'crypto';
import { prisma } from './src/config/db.js';
import { env } from './src/config/env.js';
import { CloudinaryStorageProvider } from './src/services/storage/CloudinaryStorageProvider.js';
import { uploadEventPoster } from './src/services/adminService.js';

const API_BASE = 'http://localhost:5000/api';

const results = {
  total: 0,
  passed: 0,
  failed: 0
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
  if (err) console.error(`     Error: ${err.message}`, err.cause || '');
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

  async requestMultipart(endpoint, formData) {
    const url = `${API_BASE}${endpoint}`;
    const cookieHeader = this.jar.getCookieHeader();
    const headers = {
      Accept: 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: formData
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

    this.user = loginRes.body?.user || loginRes.body?.data?.user;
    return loginRes;
  }
}

// Generate valid test image binary buffers
function createValidJpegBuffer() {
  // Valid JPEG header: FF D8 FF E0 ...
  return Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09
  ]);
}

function createValidPngBuffer() {
  // Valid PNG header: 89 50 4E 47 0D 0A 1A 0A ...
  return Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89
  ]);
}

function createValidWebpBuffer() {
  // Valid WebP header: RIFF .... WEBP VP8 ...
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x1A, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, 0x0E, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9D,
    0x01, 0x2A, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00
  ]);
}

async function runImageUploadE2ESuite() {
  console.log('\n=========================================================================');
  console.log('🖼️  EVENTPASS — SECURE EVENT POSTER IMAGE UPLOADS E2E VERIFICATION');
  console.log('=========================================================================\n');

  const timestamp = Date.now();
  const adminEmail = `admin_uploader_${timestamp}@test.co.za`;
  const customerEmail = `customer_uploader_${timestamp}@test.co.za`;
  const password = 'StrongPassword123!';

  const adminClient = new TestClient('Admin');
  const customerClient = new TestClient('Customer');
  const unauthClient = new TestClient('Unauth');

  // Initialize Users
  await adminClient.registerAndLogin(adminEmail, password, 'Admin Uploader', 'ADMIN');
  await customerClient.registerAndLogin(customerEmail, password, 'Customer User', 'CUSTOMER');

  let uploadedPosterUrl = null;

  // -------------------------------------------------------------------------
  // Requirement 1: An ADMIN can upload a valid image
  // -------------------------------------------------------------------------
  console.log('--- 1. ADMIN Upload Permissions & Valid Formats ---');
  try {
    const validJpeg = createValidJpegBuffer();
    const fd = new FormData();
    fd.append('poster', new Blob([validJpeg], { type: 'image/jpeg' }), 'concert_poster.jpg');

    const res = await adminClient.requestMultipart('/admin/events/upload-poster', fd);
    if (res.status === 201 && res.body?.success && res.body?.data?.url) {
      pass(`Admin successfully uploaded valid JPEG: ${res.body.data.url}`);
      uploadedPosterUrl = res.body.data.url;
    } else {
      fail(`Admin JPEG upload failed with status ${res.status}: ${JSON.stringify(res.body)}`);
    }

    // Also test valid PNG
    const validPng = createValidPngBuffer();
    const fdPng = new FormData();
    fdPng.append('poster', new Blob([validPng], { type: 'image/png' }), 'stage_lights.png');
    const resPng = await adminClient.requestMultipart('/admin/events/upload-poster', fdPng);
    if (resPng.status === 201 && resPng.body?.success && resPng.body?.data?.format === 'PNG') {
      pass('Admin successfully uploaded valid PNG format');
    } else {
      fail(`Admin PNG upload failed with status ${resPng.status}: ${JSON.stringify(resPng.body)}`);
    }

    // Also test valid WebP
    const validWebp = createValidWebpBuffer();
    const fdWebp = new FormData();
    fdWebp.append('poster', new Blob([validWebp], { type: 'image/webp' }), 'banner_art.webp');
    const resWebp = await adminClient.requestMultipart('/admin/events/upload-poster', fdWebp);
    if (resWebp.status === 201 && resWebp.body?.success && resWebp.body?.data?.format === 'WEBP') {
      pass('Admin successfully uploaded valid WebP format');
    } else {
      fail(`Admin WebP upload failed with status ${resWebp.status}: ${JSON.stringify(resWebp.body)}`);
    }
  } catch (err) {
    fail('ADMIN upload execution error', err);
  }

  // -------------------------------------------------------------------------
  // Requirement 2: A CUSTOMER cannot upload an image
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Customer Upload Prohibition ---');
  try {
    const validJpeg = createValidJpegBuffer();
    const fd = new FormData();
    fd.append('poster', new Blob([validJpeg], { type: 'image/jpeg' }), 'customer_poster.jpg');

    const res = await customerClient.requestMultipart('/admin/events/upload-poster', fd);
    if (res.status === 403 && res.body?.code === 'FORBIDDEN') {
      pass('Ordinary CUSTOMER strictly prohibited from uploading images (HTTP 403 FORBIDDEN)');
    } else {
      fail(`Customer upload was not properly forbidden (status ${res.status}): ${JSON.stringify(res.body)}`);
    }
  } catch (err) {
    fail('Customer prohibition test error', err);
  }

  // -------------------------------------------------------------------------
  // Requirement 3: An unauthenticated request is rejected
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Unauthenticated Request Rejection ---');
  try {
    const validJpeg = createValidJpegBuffer();
    const fd = new FormData();
    fd.append('poster', new Blob([validJpeg], { type: 'image/jpeg' }), 'anonymous_poster.jpg');

    const res = await unauthClient.requestMultipart('/admin/events/upload-poster', fd);
    if (res.status === 401 && (res.body?.code === 'UNAUTHORIZED' || res.body?.code === 'UNAUTHENTICATED')) {
      pass('Unauthenticated request strictly rejected (HTTP 401 UNAUTHENTICATED)');
    } else {
      fail(`Unauthenticated request not rejected with 401 (status ${res.status}): ${JSON.stringify(res.body)}`);
    }
  } catch (err) {
    fail('Unauthenticated rejection test error', err);
  }

  // -------------------------------------------------------------------------
  // Requirement 4: An unsupported image format is rejected
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Unsupported Image Format Rejection ---');
  try {
    // Attempt uploading a GIF
    const gifBuffer = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xFF\xFF\xFF\x00\x00\x00!\xF9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;');
    const fdGif = new FormData();
    fdGif.append('poster', new Blob([gifBuffer], { type: 'image/gif' }), 'animation.gif');

    const resGif = await adminClient.requestMultipart('/admin/events/upload-poster', fdGif);
    if (resGif.status === 400 && resGif.body?.code === 'INVALID_FILE_TYPE') {
      pass('Unsupported format (GIF) rejected with HTTP 400 INVALID_FILE_TYPE');
    } else {
      fail(`Unsupported format (GIF) was not rejected properly (status ${resGif.status}): ${JSON.stringify(resGif.body)}`);
    }

    // Attempt uploading an SVG
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    const fdSvg = new FormData();
    fdSvg.append('poster', new Blob([svgBuffer], { type: 'image/svg+xml' }), 'vector.svg');

    const resSvg = await adminClient.requestMultipart('/admin/events/upload-poster', fdSvg);
    if (resSvg.status === 400 && resSvg.body?.code === 'INVALID_FILE_TYPE') {
      pass('Unsupported format (SVG) rejected with HTTP 400 INVALID_FILE_TYPE');
    } else {
      fail(`Unsupported format (SVG) was not rejected properly (status ${resSvg.status}): ${JSON.stringify(resSvg.body)}`);
    }
  } catch (err) {
    fail('Unsupported format rejection test error', err);
  }

  // -------------------------------------------------------------------------
  // Requirement 5: A file larger than 5 MB is rejected
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Oversized File (> 5 MB) Rejection ---');
  try {
    // 5.2 MB buffer
    const oversizedBuffer = Buffer.alloc(5.2 * 1024 * 1024, 0x41);
    // Add JPEG header to simulate oversized JPEG
    oversizedBuffer[0] = 0xFF;
    oversizedBuffer[1] = 0xD8;
    oversizedBuffer[2] = 0xFF;

    const fdOversized = new FormData();
    fdOversized.append('poster', new Blob([oversizedBuffer], { type: 'image/jpeg' }), 'huge_poster.jpg');

    const resOversized = await adminClient.requestMultipart('/admin/events/upload-poster', fdOversized);
    if (resOversized.status === 400 && resOversized.body?.code === 'LIMIT_FILE_SIZE') {
      pass('Oversized file (>5 MB) rejected with HTTP 400 LIMIT_FILE_SIZE');
    } else {
      fail(`Oversized file was not rejected properly (status ${resOversized.status}): ${JSON.stringify(resOversized.body)}`);
    }
  } catch (err) {
    fail('Oversized file rejection test error', err);
  }

  // -------------------------------------------------------------------------
  // Requirement 6: Invalid content disguised with valid extension is rejected
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Disguised / Malicious Content Rejection ---');
  try {
    // Text/script payload disguised as a .jpg file
    const fakeJpegContent = Buffer.from('<?php echo "malicious payload"; ?>\nThis is not a real JPEG image.');
    const fdFake = new FormData();
    fdFake.append('poster', new Blob([fakeJpegContent], { type: 'image/jpeg' }), 'malicious_script.jpg');

    const resFake = await adminClient.requestMultipart('/admin/events/upload-poster', fdFake);
    if (resFake.status === 400 && (resFake.body?.code === 'INVALID_FILE_CONTENT' || resFake.body?.code === 'INVALID_FILE_TYPE')) {
      pass('Disguised content (text script named .jpg) rejected via magic byte inspection');
    } else {
      fail(`Disguised content was not rejected with 400 (status ${resFake.status}): ${JSON.stringify(resFake.body)}`);
    }
  } catch (err) {
    fail('Disguised content rejection test error', err);
  }

  // -------------------------------------------------------------------------
  // Requirement 7: Missing storage configuration produces a safe error
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Unconfigured Cloud Storage Graceful Error ---');
  try {
    // Test Cloudinary provider with empty credentials
    const unconfiguredProvider = new CloudinaryStorageProvider({
      cloudName: '',
      apiKey: '',
      apiSecret: ''
    });

    let caughtError = null;
    try {
      await uploadEventPoster({
        adminUserId: adminClient.user.id,
        file: {
          buffer: createValidJpegBuffer(),
          originalname: 'poster.jpg',
          mimetype: 'image/jpeg'
        },
        overrideStorageProvider: unconfiguredProvider
      });
    } catch (err) {
      caughtError = err;
    }

    if (
      caughtError &&
      caughtError.statusCode === 503 &&
      caughtError.code === 'STORAGE_NOT_CONFIGURED' &&
      caughtError.message.includes('Cloud storage is not configured')
    ) {
      pass('Unconfigured storage safely reports HTTP 503 STORAGE_NOT_CONFIGURED with clear guidance');
    } else {
      fail(`Unconfigured storage error mismatch: ${caughtError?.statusCode} - ${caughtError?.message}`);
    }
  } catch (err) {
    fail('Missing storage configuration test error', err);
  }

  // -------------------------------------------------------------------------
  // Requirement 8: Existing image URLs continue to work
  // -------------------------------------------------------------------------
  console.log('\n--- 8. Existing Image-URL Workflow Continuity ---');
  let eventWithManualUrl = null;
  try {
    const category = await prisma.category.findFirst();
    const externalImageUrl = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80';

    const createPayload = {
      title: `Manual URL Concert ${timestamp}`,
      description: 'Event created using a direct external image URL as a fallback.',
      categoryId: category.id,
      venue: 'Artscape Theatre',
      location: 'Cape Town',
      province: 'Western Cape',
      startDateTime: new Date(Date.now() + 86400000 * 10).toISOString(),
      imageUrl: externalImageUrl,
      organizerName: 'Live Nation Africa',
      ticketTypes: [
        {
          name: 'Standard Ticket',
          description: 'Standard access pass',
          priceMinor: 18000,
          quantityTotal: 150
        }
      ]
    };

    const res = await adminClient.request('/admin/events', {
      method: 'POST',
      body: JSON.stringify(createPayload)
    });

    if (res.status === 201 && res.body?.data?.event?.imageUrl === externalImageUrl) {
      pass('Direct image URL workflow functions normally: imageUrl preserved accurately');
      eventWithManualUrl = res.body.data.event;
    } else {
      fail(`Direct image URL event creation failed (status ${res.status}): ${JSON.stringify(res.body)}`);
    }
  } catch (err) {
    fail('Existing image URLs test error', err);
  }

  // -------------------------------------------------------------------------
  // Requirement 9: Uploaded image URLs are saved and displayed correctly
  // -------------------------------------------------------------------------
  console.log('\n--- 9. Saving & Public Display of Uploaded Image URL ---');
  try {
    if (!uploadedPosterUrl) {
      fail('Cannot test requirement 9: uploadedPosterUrl was not set in requirement 1');
    } else {
      const category = await prisma.category.findFirst();

      const uploadedEventPayload = {
        title: `Uploaded Poster Festival ${timestamp}`,
        description: 'Event created using the persistent uploaded image URL from Phase 3.',
        categoryId: category.id,
        venue: 'Grand Arena, GrandWest',
        location: 'Cape Town',
        province: 'Western Cape',
        startDateTime: new Date(Date.now() + 86400000 * 15).toISOString(),
        imageUrl: uploadedPosterUrl,
        bannerUrl: uploadedPosterUrl,
        organizerName: 'EventPass Productions',
        ticketTypes: [
          {
            name: 'General Admission',
            description: 'Access pass',
            priceMinor: 25000,
            quantityTotal: 200
          }
        ]
      };

      const createRes = await adminClient.request('/admin/events', {
        method: 'POST',
        body: JSON.stringify(uploadedEventPayload)
      });

      if (createRes.status === 201 && createRes.body?.data?.event) {
        const createdEvent = createRes.body.data.event;
        pass(`Event successfully created with uploaded poster URL: ${createdEvent.imageUrl}`);

        // Publish event to make it public
        await adminClient.request(`/admin/events/${createdEvent.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'PUBLISHED' })
        });

        // Query public event catalogue
        const publicRes = await unauthClient.request(`/events/${createdEvent.slug}`);
        if (publicRes.status === 200 && publicRes.body?.data?.event?.imageUrl === uploadedPosterUrl) {
          pass('Public event catalogue correctly renders and returns the uploaded poster URL');
        } else {
          fail(`Public event catalogue query failed: status ${publicRes.status}, body: ${JSON.stringify(publicRes.body)}`);
        }
      } else {
        fail(`Event creation with uploaded URL failed (status ${createRes.status}): ${JSON.stringify(createRes.body)}`);
      }
    }
  } catch (err) {
    fail('Public display of uploaded image test error', err);
  }

  // -------------------------------------------------------------------------
  // Requirement 10: Payments remain disabled (PAYMENTS_ENABLED=false)
  // -------------------------------------------------------------------------
  console.log('\n--- 10. Payment Freeze Enforcement ---');
  try {
    const payRes = await customerClient.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({
        orderId: crypto.randomUUID(),
        email: customerEmail,
        amountMinor: 25000
      })
    });

    if (payRes.status === 503 && payRes.body?.code === 'PAYMENTS_DISABLED') {
      pass('Payment initialization strictly blocked with HTTP 503 PAYMENTS_DISABLED');
    } else {
      fail(`Payment initialization was not frozen as expected (status ${payRes.status}): ${JSON.stringify(payRes.body)}`);
    }
  } catch (err) {
    fail('Payment freeze test error', err);
  }

  console.log('\n=========================================================================');
  console.log(`📊 Image Upload E2E Results: ${results.passed} PASSED, ${results.failed} FAILED (${results.total} total)`);
  console.log('=========================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

runImageUploadE2ESuite()
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
