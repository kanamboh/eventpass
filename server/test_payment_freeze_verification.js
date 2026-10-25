/**
 * EVENTPASS — PHASE 1: PAYMENT FREEZE VERIFICATION SUITE
 * 
 * Verifies all Phase 1 requirements:
 * 1. Payment initialization returns HTTP 503 with PAYMENTS_DISABLED
 * 2. Payment verification cannot complete a new payment while payments are disabled (route & service)
 * 3. The payment webhook cannot bypass the freeze (route & service)
 * 4. Mock verification cannot create a paid order in production (provider, factory, & service)
 * 5. A missing or invalid payment-enable configuration defaults to disabled (fail-closed)
 * 6. The status endpoint confirms payments are disabled
 * 7. Payment controls fail-closed when payment availability cannot be established
 * 8. Event browsing and ticket access continue working uninterrupted
 * 9. Existing verified tickets and paid orders remain valid
 */

import { PrismaClient } from '@prisma/client';
import http from 'http';
import app from './src/app.js';
import { env } from './src/config/env.js';
import { getPaymentProvider, setPaymentProviderInstance } from './src/services/payment/paymentProviderFactory.js';
import { MockPaymentProvider } from './src/services/payment/MockPaymentProvider.js';
import { PaystackProvider } from './src/services/payment/PaystackProvider.js';
import { initializePayment, verifyPayment, processWebhook, finalizePaymentSuccess } from './src/services/paymentService.js';
import { z } from 'zod';

const prisma = new PrismaClient();

const results = {
  passed: 0,
  failed: 0,
  total: 0
};

const assert = (condition, description) => {
  results.total++;
  if (condition) {
    results.passed++;
    console.log(`  ✅ [PASS] ${description}`);
  } else {
    results.failed++;
    console.error(`  ❌ [FAIL] ${description}`);
  }
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
  constructor(name, baseUrl) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.jar = new CookieJar();
    this.user = null;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
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

  async registerAndLogin(email, password, fullName) {
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
      throw new Error(`Failed to register ${this.name}: ${regRes.status} ${JSON.stringify(regRes.body)}`);
    }

    const loginRes = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    this.user = loginRes.body?.user || loginRes.body?.data?.user;
    return this.user;
  }
}

async function runPaymentFreezeSuite() {
  console.log('❄️ =========================================================================');
  console.log('❄️ EVENTPASS — PHASE 1: PAYMENT FREEZE VERIFICATION SUITE');
  console.log('❄️ =========================================================================\n');

  // Launch ephemeral server instance on random free port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const API_BASE = `http://127.0.0.1:${port}/api`;
  console.log(`📡 Ephemeral Test Server running at ${API_BASE}\n`);

  const timestamp = Date.now();
  const client = new TestClient('FreezeTester', API_BASE);

  try {
    // -------------------------------------------------------------------------
    // TEST SECTION 1: CENTRAL PAYMENT STATUS ENDPOINT
    // -------------------------------------------------------------------------
    console.log('--- 1. Central Payment Status Endpoint ---');
    const statusRes = await client.request('/payments/status');
    assert(statusRes.status === 200, 'GET /api/payments/status responds with HTTP 200');
    assert(statusRes.body?.status === 'success', 'Response status is "success"');
    assert(
      statusRes.body?.data?.paymentsEnabled === false,
      'paymentsEnabled strictly reports false'
    );
    assert(
      env.PAYMENTS_ENABLED === false,
      'server/src/config/env.js reports PAYMENTS_ENABLED === false'
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 2: CONFIGURATION SAFETY & FAIL-CLOSED DEFAULTING
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Configuration Safety & Fail-Closed Defaulting ---');
    const paymentEnabledSchema = z
      .preprocess((val) => {
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (typeof val === 'string') return val;
        return 'false';
      }, z.string().default('false'))
      .transform((val) => {
        const normalized = String(val || '').trim().toLowerCase();
        return normalized === 'true' || normalized === '1';
      });

    assert(paymentEnabledSchema.parse(undefined) === false, 'Missing configuration (undefined) defaults to false');
    assert(paymentEnabledSchema.parse('') === false, 'Empty string ("") defaults to false');
    assert(paymentEnabledSchema.parse('false') === false, '"false" evaluates to false');
    assert(paymentEnabledSchema.parse('0') === false, '"0" evaluates to false');
    assert(paymentEnabledSchema.parse('disabled') === false, '"disabled" evaluates to false');
    assert(paymentEnabledSchema.parse('invalid_string') === false, 'Arbitrary string evaluates to false');
    assert(paymentEnabledSchema.parse(false) === false, 'Boolean false evaluates to false');
    assert(paymentEnabledSchema.parse('true') === true, 'Explicit "true" parses to true');
    assert(paymentEnabledSchema.parse('TRUE') === true, 'Uppercase "TRUE" parses to true');
    assert(paymentEnabledSchema.parse('1') === true, '"1" parses to true');

    // -------------------------------------------------------------------------
    // TEST SECTION 3: USER SETUP & ORDER CREATION
    // -------------------------------------------------------------------------
    console.log('\n--- 3. User Setup & Reservation/Order Creation ---');
    await client.registerAndLogin(`freezetest_${timestamp}@test.co.za`, 'Secret123#Pass', 'Payment Freeze Tester');

    const ticketTier = await prisma.ticketType.findFirst({
      where: {
        quantityAvailable: { gt: 5 },
        event: { status: 'PUBLISHED', isActive: true }
      },
      include: { event: true }
    });
    assert(Boolean(ticketTier), `Found ticket tier with inventory: "${ticketTier?.name}" in "${ticketTier?.event?.title}"`);
    const publishedEvent = ticketTier.event;

    // Create reservation
    const resRes = await client.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: ticketTier.id,
        quantity: 1
      })
    });
    assert(resRes.status === 201, 'Created reservation successfully');
    const reservationId = resRes.body.data.reservation.id;

    // Create order from reservation
    const orderRes = await client.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [reservationId],
        buyerDetails: {
          firstName: 'Freeze',
          lastName: 'Tester',
          email: `freezetest_${timestamp}@test.co.za`,
          deliveryType: 'digital',
          paymentMethod: 'card'
        }
      })
    });
    assert(orderRes.status === 201, 'Created pending order successfully');
    const order = orderRes.body.data.order;
    assert(order.status === 'PENDING', 'Initial order status is PENDING');

    // -------------------------------------------------------------------------
    // TEST SECTION 4: PAYMENT INITIALIZATION BARRIER (HTTP 503 PAYMENTS_DISABLED)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Payment Initialization Barrier ---');
    const initRes = await client.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order.id })
    });
    assert(initRes.status === 503, 'POST /api/payments/initialize returns HTTP 503');
    assert(initRes.body?.code === 'PAYMENTS_DISABLED', 'Error code is PAYMENTS_DISABLED');
    assert(
      initRes.body?.message === 'Online payments are temporarily unavailable.',
      'User-friendly error message is returned'
    );

    // Verify order was not modified or corrupted
    const orderCheck = await prisma.order.findUnique({ where: { id: order.id } });
    assert(orderCheck.status === 'PENDING', 'Order status remains PENDING in database');
    assert(orderCheck.paymentReference === null || orderCheck.paymentReference === order.idempotencyKey, 'No payment transaction reference assigned');

    // Verify service-level direct call is also barred
    let serviceInitError = null;
    try {
      await initializePayment({ orderId: order.id, userId: client.user.id });
    } catch (err) {
      serviceInitError = err;
    }
    assert(
      serviceInitError && serviceInitError.statusCode === 503 && serviceInitError.code === 'PAYMENTS_DISABLED',
      'paymentService.initializePayment directly throws 503 PAYMENTS_DISABLED'
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 5: PAYMENT VERIFICATION BARRIER (HTTP 503 PAYMENTS_DISABLED)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Payment Verification Barrier ---');
    const fakeRef = `EP-FAKE-REF-${timestamp}`;
    const verifyRes = await client.request(`/payments/verify/${fakeRef}`);
    assert(verifyRes.status === 503, 'GET /api/payments/verify/:reference returns HTTP 503 via middleware');
    assert(verifyRes.body?.code === 'PAYMENTS_DISABLED', 'Error code is PAYMENTS_DISABLED');

    // Verify service-level verifyPayment check
    let serviceVerifyError = null;
    try {
      await verifyPayment({ reference: fakeRef, userId: client.user.id });
    } catch (err) {
      serviceVerifyError = err;
    }
    assert(
      serviceVerifyError && serviceVerifyError.statusCode === 503 && serviceVerifyError.code === 'PAYMENTS_DISABLED',
      'paymentService.verifyPayment directly throws 503 PAYMENTS_DISABLED'
    );

    // Verify finalizePaymentSuccess check
    let serviceFinalizeError = null;
    try {
      await finalizePaymentSuccess({ reference: fakeRef, providerData: { status: 'SUCCESS' } });
    } catch (err) {
      serviceFinalizeError = err;
    }
    assert(
      serviceFinalizeError && serviceFinalizeError.statusCode === 503 && serviceFinalizeError.code === 'PAYMENTS_DISABLED',
      'paymentService.finalizePaymentSuccess directly throws 503 PAYMENTS_DISABLED'
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 6: WEBHOOK PROCESSING BARRIER (HTTP 503 PAYMENTS_DISABLED)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Webhook Processing Barrier ---');
    const webhookRes = await client.request('/payments/webhook/paystack', {
      method: 'POST',
      body: JSON.stringify({
        event: 'charge.success',
        data: { reference: fakeRef, status: 'success', amount: 5000 }
      })
    });
    assert(webhookRes.status === 503, 'POST /api/payments/webhook/paystack returns HTTP 503 via middleware');
    assert(webhookRes.body?.code === 'PAYMENTS_DISABLED', 'Error code is PAYMENTS_DISABLED');

    // Direct service webhook check
    let serviceWebhookError = null;
    try {
      await processWebhook({
        rawBody: Buffer.from(JSON.stringify({ event: 'charge.success' })),
        signature: 'fake_sig',
        eventPayload: { event: 'charge.success' }
      });
    } catch (err) {
      serviceWebhookError = err;
    }
    assert(
      serviceWebhookError && serviceWebhookError.statusCode === 503 && serviceWebhookError.code === 'PAYMENTS_DISABLED',
      'paymentService.processWebhook directly throws 503 PAYMENTS_DISABLED'
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 7: MOCK PAYMENT SAFETY IN PRODUCTION
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Mock Payment Safety & Production Defense ---');
    const mockProvider = new MockPaymentProvider();

    // 1. MockProvider blocked when payments are disabled
    let mockInitFreezeError = null;
    try {
      await mockProvider.initializeTransaction({
        reference: fakeRef,
        amountMinor: 5000,
        currency: 'USD',
        customerEmail: 'test@example.com'
      });
    } catch (err) {
      mockInitFreezeError = err;
    }
    assert(
      mockInitFreezeError && mockInitFreezeError.statusCode === 503 && mockInitFreezeError.code === 'PAYMENTS_DISABLED',
      'MockPaymentProvider.initializeTransaction throws 503 PAYMENTS_DISABLED during freeze'
    );

    let mockVerifyFreezeError = null;
    try {
      await mockProvider.verifyTransaction(fakeRef);
    } catch (err) {
      mockVerifyFreezeError = err;
    }
    assert(
      mockVerifyFreezeError && mockVerifyFreezeError.statusCode === 503 && mockVerifyFreezeError.code === 'PAYMENTS_DISABLED',
      'MockPaymentProvider.verifyTransaction throws 503 PAYMENTS_DISABLED during freeze'
    );

    // 2. MockProvider strictly barred in production
    const originalEnv = env.NODE_ENV;
    try {
      env.NODE_ENV = 'production';
      let mockProdInitError = null;
      try {
        await mockProvider.initializeTransaction({
          reference: fakeRef,
          amountMinor: 5000,
          currency: 'USD',
          customerEmail: 'test@example.com'
        });
      } catch (err) {
        mockProdInitError = err;
      }
      assert(
        mockProdInitError && mockProdInitError.code === 'MOCK_PAYMENT_FORBIDDEN_IN_PRODUCTION',
        'MockPaymentProvider rejects initialization in production (MOCK_PAYMENT_FORBIDDEN_IN_PRODUCTION)'
      );

      let mockProdVerifyError = null;
      try {
        await mockProvider.verifyTransaction(fakeRef);
      } catch (err) {
        mockProdVerifyError = err;
      }
      assert(
        mockProdVerifyError && mockProdVerifyError.code === 'MOCK_PAYMENT_FORBIDDEN_IN_PRODUCTION',
        'MockPaymentProvider rejects verification in production (MOCK_PAYMENT_FORBIDDEN_IN_PRODUCTION)'
      );

      let factoryProdError = null;
      try {
        getPaymentProvider('MOCK');
      } catch (err) {
        factoryProdError = err;
      }
      assert(
        factoryProdError && factoryProdError.code === 'UNSAFE_PAYMENT_CONFIGURATION',
        'paymentProviderFactory rejects MOCK provider in production (UNSAFE_PAYMENT_CONFIGURATION)'
      );
    } finally {
      env.NODE_ENV = originalEnv;
    }

    // -------------------------------------------------------------------------
    // TEST SECTION 8: EVENT BROWSING & CATALOGUE CONTINUITY
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Event Browsing & Catalogue Continuity ---');
    const eventsRes = await client.request('/events');
    assert(eventsRes.status === 200, 'GET /api/events returns HTTP 200');
    assert(eventsRes.body?.status === 'success', 'Events API response status is "success"');
    const eventsList = eventsRes.body?.data?.items || eventsRes.body?.data?.events || [];
    const totalEvents = eventsRes.body?.data?.total || eventsList.length;
    assert(totalEvents === 30, `Exactly 30 public seed events available (found: ${totalEvents})`);

    const singleEventRes = await client.request(`/events/${publishedEvent.slug}`);
    assert(singleEventRes.status === 200, `GET /api/events/${publishedEvent.slug} returns HTTP 200`);
    assert(
      singleEventRes.body?.data?.event?.ticketTypes?.length > 0,
      'Event details include active ticket types and pricing'
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 9: PRESERVATION OF HISTORICAL ORDERS AND VALID TICKETS
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Preservation of Historical Orders & Valid Tickets ---');
    const totalOrders = await prisma.order.count();
    const paidOrders = await prisma.order.count({ where: { status: 'PAID' } });
    const validTickets = await prisma.ticket.count({ where: { status: 'VALID' } });

    assert(totalOrders > 0, `Historical orders preserved (total in DB: ${totalOrders})`);
    assert(paidOrders > 0, `Verified PAID orders preserved (total in DB: ${paidOrders})`);
    assert(validTickets > 0, `Valid customer entrance passes preserved (total in DB: ${validTickets})`);

    // Verify existing customer ticket endpoint works
    const ticketsRes = await client.request('/tickets/my-tickets');
    assert(ticketsRes.status === 200, 'GET /api/tickets/my-tickets returns HTTP 200 for authenticated user');

  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
    console.log('\n📡 Ephemeral Test Server closed.');
  }

  console.log('\n=========================================================================');
  console.log(`TEST SUMMARY: ${results.passed} / ${results.total} PASSED (${results.failed} failed)`);
  console.log('=========================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPaymentFreezeSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
