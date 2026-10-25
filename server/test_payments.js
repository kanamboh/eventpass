/**
 * EventPass - Step 5 Paystack & Payment Processing Security Test Suite
 * OWASP ASVS Level 2 / OWASP API Security Top 10 Audit for Payments
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { getPaymentProvider, setPaymentProviderInstance } from './src/services/payment/paymentProviderFactory.js';
import { MockPaymentProvider } from './src/services/payment/MockPaymentProvider.js';
import { PaystackProvider } from './src/services/payment/PaystackProvider.js';

const API_BASE = 'http://localhost:5000/api';
const prisma = new PrismaClient();

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

  async registerAndLogin(email, password, fullName) {
    const res = await this.request('/auth/register', {
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

    if (res.status !== 201) {
      throw new Error(`Failed to register ${this.name}: ${res.status} ${JSON.stringify(res.body)}`);
    }

    const loginRes = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    this.user = loginRes.body?.user || loginRes.body?.data?.user;
    return this.user;
  }
}

async function runPaymentSecuritySuite() {
  console.log('🔒 Starting EventPass Step 5 Payment Security & Invariant Audit...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  const mockWebhookSecret = 'test_mock_webhook_secret_key_12345678';
  const mockProvider = new MockPaymentProvider({ webhookSecret: mockWebhookSecret });
  setPaymentProviderInstance(mockProvider);

  try {
    // 1. Setup authenticated users
    const alice = new TestClient('Alice');
    const bob = new TestClient('Bob');

    await alice.registerAndLogin(`alice_pay_${timestamp}@test.co.za`, 'Secret123#Pass', 'Alice Payments');
    await bob.registerAndLogin(`bob_pay_${timestamp}@test.co.za`, 'Secret123#Pass', 'Bob Payments');

    const testEvent = await prisma.event.findFirst({
      where: { status: 'PUBLISHED' }
    });

    // Create a dedicated ticket tier for payment tests
    const payTier = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: `Payment Test Tier ${timestamp}`,
        priceMinor: 12000, // R120.00
        currency: 'ZAR',
        quantityTotal: 25,
        quantitySold: 0,
        quantityReserved: 0,
        status: 'ACTIVE',
        maxPerOrder: 5
      }
    });

    // Helper: assert database inventory invariants
    async function assertInventoryInvariants(tierId, contextDesc) {
      const tier = await prisma.ticketType.findUnique({ where: { id: tierId } });
      const activeSumRes = await prisma.$queryRaw`
        SELECT COALESCE(SUM(quantity), 0)::int as "sum"
        FROM reservations
        WHERE "ticketTypeId" = ${tierId}::uuid
          AND status = 'ACTIVE'::"ReservationStatus"
          AND "expiresAt" > NOW()
      `;
      const activeSum = activeSumRes[0].sum;

      const inv1 = tier.quantitySold + tier.quantityReserved <= tier.quantityTotal;
      const inv2 = tier.quantityReserved === activeSum;

      assert(
        inv1,
        `Invariant 1 [${contextDesc}]: quantitySold (${tier.quantitySold}) + quantityReserved (${tier.quantityReserved}) <= quantityTotal (${tier.quantityTotal})`
      );
      assert(
        inv2,
        `Invariant 2 [${contextDesc}]: quantityReserved (${tier.quantityReserved}) == active hold sum (${activeSum})`
      );
    }

    // =========================================================================
    // 1. AUTHORIZATION & BOLA DEFENSE
    // =========================================================================
    console.log('\n--- 1. Authorization & BOLA Defense ---');

    // Alice creates a valid order
    const aliceRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: payTier.id, quantity: 2 })
    });
    const aliceOrderRes = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [aliceRes.body.data.reservation.id] })
    });
    const aliceOrder = aliceOrderRes.body.data.order;

    // Unauthenticated payment initialization
    const unauthClient = new TestClient('Unauth');
    const unauthInit = await unauthClient.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: aliceOrder.id })
    });
    assert(unauthInit.status === 401 && unauthInit.body.code === 'UNAUTHENTICATED', 'Unauthenticated payment initialize rejected (401 UNAUTHENTICATED)');

    // Bob attempts to initialize payment for Alice's order (BOLA)
    const bobInitAliceOrder = await bob.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: aliceOrder.id })
    });
    assert(
      bobInitAliceOrder.status === 403 && bobInitAliceOrder.body.code === 'ORDER_ACCESS_DENIED',
      'Bob cannot initialize payment for Alice order (403 ORDER_ACCESS_DENIED)'
    );

    // Alice initializes payment successfully
    const aliceInit = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: aliceOrder.id })
    });
    assert(aliceInit.status === 200 && aliceInit.body.data.reference, 'Alice initializes payment successfully (HTTP 200, reference returned)');
    const alicePaymentRef = aliceInit.body.data.reference;

    // Verify cryptographic opaque format of reference (starts with EP- and >= 20 chars)
    assert(
      /^EP-[A-F0-9]{20,}$/.test(alicePaymentRef),
      `Payment reference is cryptographically random and opaque: ${alicePaymentRef}`
    );

    // Bob attempts to verify Alice's payment (BOLA)
    const bobVerifyAlicePayment = await bob.request(`/payments/verify/${alicePaymentRef}`);
    assert(
      bobVerifyAlicePayment.status === 403 && bobVerifyAlicePayment.body.code === 'PAYMENT_ACCESS_DENIED',
      'Bob cannot verify Alice payment (403 PAYMENT_ACCESS_DENIED)'
    );

    // Cancelled order cannot initiate payment
    const bobRes = await bob.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: payTier.id, quantity: 1 })
    });
    const bobOrderRes = await bob.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [bobRes.body.data.reservation.id] })
    });
    const bobOrder = bobOrderRes.body.data.order;

    await prisma.order.update({ where: { id: bobOrder.id }, data: { status: 'CANCELLED' } });
    const bobInitCancelled = await bob.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: bobOrder.id })
    });
    assert(
      bobInitCancelled.status === 400 && bobInitCancelled.body.code === 'ORDER_CANCELLED',
      'Cancelled order payment initialization rejected (400 ORDER_CANCELLED)'
    );

    // Expired order cannot initiate payment
    await prisma.order.update({ where: { id: bobOrder.id }, data: { status: 'EXPIRED' } });
    const bobInitExpired = await bob.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: bobOrder.id })
    });
    assert(
      bobInitExpired.status === 400 && bobInitExpired.body.code === 'ORDER_EXPIRED',
      'Expired order payment initialization rejected (400 ORDER_EXPIRED)'
    );

    // =========================================================================
    // 2. AMOUNT & CURRENCY MANIPULATION DEFENSE
    // =========================================================================
    console.log('\n--- 2. Amount & Currency Manipulation Defense ---');

    // Client attempts to inject tampered amount into initialize request
    const tamperAmountRes = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({
        orderId: aliceOrder.id,
        amount: 1, // Attempt R0.01 instead of R255.00
        amountMinor: 100,
        currency: 'USD',
        status: 'SUCCESS'
      })
    });
    assert(
      tamperAmountRes.status === 400 && tamperAmountRes.body.code === 'VALIDATION_ERROR',
      'Client injection of financial fields into payment initialization rejected by strict Zod schema'
    );

    // Provider reporting lower amount during verify is detected and rejected
    const tamperedOrderRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: payTier.id, quantity: 1 })
    });
    const tamperedOrder = (await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [tamperedOrderRes.body.data.reservation.id] })
    })).body.data.order;

    const tamperedInit = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: tamperedOrder.id })
    });

    mockProvider.setFailureMode('AMOUNT_MISMATCH');
    const tamperedVerify = await alice.request(`/payments/verify/${tamperedInit.body.data.reference}`, {
      headers: { 'x-mock-failure': 'AMOUNT_MISMATCH' }
    });
    assert(
      tamperedVerify.status === 400 && tamperedVerify.body.code === 'AMOUNT_MISMATCH',
      'Provider amount mismatch rejected with 400 AMOUNT_MISMATCH; order not marked paid'
    );
    mockProvider.reset();

    // Provider reporting wrong currency during verify is detected and rejected
    const currTamperOrderRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: payTier.id, quantity: 1 })
    });
    const currTamperOrder = (await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [currTamperOrderRes.body.data.reservation.id] })
    })).body.data.order;

    const currTamperInit = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: currTamperOrder.id })
    });

    mockProvider.setFailureMode('CURRENCY_MISMATCH');
    const currTamperVerify = await alice.request(`/payments/verify/${currTamperInit.body.data.reference}`, {
      headers: { 'x-mock-failure': 'CURRENCY_MISMATCH' }
    });
    assert(
      currTamperVerify.status === 400 && currTamperVerify.body.code === 'CURRENCY_MISMATCH',
      'Provider currency mismatch rejected with 400 CURRENCY_MISMATCH; order not marked paid'
    );
    mockProvider.reset();

    // =========================================================================
    // 3. PAYSTACK KENYA ACCOUNT / CURRENCY COMPATIBILITY CHECK
    // =========================================================================
    console.log('\n--- 3. Paystack Kenya / ZAR Currency Compatibility Check ---');
    const kenyaPaystack = new PaystackProvider({
      secretKey: 'sk_test_mock_kenya_secret_key_12345678',
      merchantCountry: 'KE'
    });

    assert(
      kenyaPaystack.isCurrencySupported('KES') && kenyaPaystack.isCurrencySupported('USD'),
      'Paystack Kenya provider supports KES and USD natively'
    );
    assert(
      !kenyaPaystack.isCurrencySupported('ZAR'),
      'Paystack Kenya provider does NOT support ZAR natively (safe configuration detection)'
    );

    // Attempt initialize with Paystack Kenya provider on ZAR order
    let kenyaInitError = null;
    try {
      await kenyaPaystack.initializeTransaction({
        reference: 'EP-TEST-ZAR-KENYA',
        amountMinor: 15000,
        currency: 'ZAR',
        customerEmail: 'test@example.com'
      });
    } catch (err) {
      kenyaInitError = err;
    }
    assert(
      kenyaInitError && kenyaInitError.code === 'CURRENCY_NOT_SUPPORTED_BY_MERCHANT',
      'Kenyan Paystack account fails safely with CURRENCY_NOT_SUPPORTED_BY_MERCHANT without corrupting catalog'
    );

    // =========================================================================
    // 4. WEBHOOK CRYPTOGRAPHIC SIGNATURE & RAW BODY SECURITY
    // =========================================================================
    console.log('\n--- 4. Webhook Cryptographic HMAC-SHA512 & Raw Body Security ---');

    const webhookOrderRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: payTier.id, quantity: 1 })
    });
    const webhookOrder = (await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [webhookOrderRes.body.data.reservation.id] })
    })).body.data.order;

    const webhookInit = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: webhookOrder.id })
    });
    const webhookPaymentRef = webhookInit.body.data.reference;

    const validPayload = {
      event: 'charge.success',
      data: {
        id: timestamp + 101,
        status: 'success',
        reference: webhookPaymentRef,
        amount: webhookOrder.totalMinor,
        currency: 'ZAR',
        customer: { email: alice.user.email },
        paid_at: new Date().toISOString()
      }
    };
    const validRawBody = JSON.stringify(validPayload);
    const validSig = mockProvider.generateSignature(validRawBody);

    // Missing signature
    const missingSigRes = await alice.request('/payments/webhook/paystack', {
      method: 'POST',
      body: validRawBody
    });
    assert(
      missingSigRes.status === 401 && missingSigRes.body.code === 'INVALID_WEBHOOK_SIGNATURE',
      'Missing webhook signature rejected with 401 INVALID_WEBHOOK_SIGNATURE'
    );

    // Invalid signature
    const invalidSigRes = await alice.request('/payments/webhook/paystack', {
      method: 'POST',
      headers: { 'x-paystack-signature': '0000000000000000000000000000000000000000000000000000000000000000' },
      body: validRawBody
    });
    assert(
      invalidSigRes.status === 401 && invalidSigRes.body.code === 'INVALID_WEBHOOK_SIGNATURE',
      'Tampered webhook signature rejected with 401 INVALID_WEBHOOK_SIGNATURE'
    );

    // Malformed signature length (safe constant-time length check; no DoS exception)
    const malformedLenRes = await alice.request('/payments/webhook/paystack', {
      method: 'POST',
      headers: { 'x-paystack-signature': 'invalid_short_signature' },
      body: validRawBody
    });
    assert(
      malformedLenRes.status === 401 && malformedLenRes.body.code === 'INVALID_WEBHOOK_SIGNATURE',
      'Malformed signature length fails safely without throwing unhandled exception'
    );

    // Modified payload bytes with original signature
    const tamperedPayload = { ...validPayload, data: { ...validPayload.data, amount: 10 } };
    const tamperedBytesRes = await alice.request('/payments/webhook/paystack', {
      method: 'POST',
      headers: { 'x-paystack-signature': validSig },
      body: JSON.stringify(tamperedPayload)
    });
    assert(
      tamperedBytesRes.status === 401 && tamperedBytesRes.body.code === 'INVALID_WEBHOOK_SIGNATURE',
      'Modified payload bytes with original signature rejected (raw body byte integrity confirmed)'
    );

    // Valid webhook delivery
    const validWebhookRes = await alice.request('/payments/webhook/paystack', {
      method: 'POST',
      headers: { 'x-paystack-signature': validSig },
      body: validRawBody
    });
    assert(
      validWebhookRes.status === 200 && validWebhookRes.body.data.status === 'success',
      'Valid cryptographically signed webhook accepted and processed successfully (200 OK)'
    );

    // Verify order transitioned to PAID in database
    const dbOrderAfterWebhook = await prisma.order.findUnique({ where: { id: webhookOrder.id } });
    assert(dbOrderAfterWebhook.status === 'PAID', 'Order status updated to PAID following webhook confirmation');

    // =========================================================================
    // 5. WEBHOOK IDEMPOTENCY & CONCURRENT DUPLICATE DELIVERY
    // =========================================================================
    console.log('\n--- 5. Webhook Idempotency & Concurrent Deduplication ---');

    // Replay identical webhook a second time
    const replayWebhookRes = await alice.request('/payments/webhook/paystack', {
      method: 'POST',
      headers: { 'x-paystack-signature': validSig },
      body: validRawBody
    });
    assert(
      replayWebhookRes.status === 200 && replayWebhookRes.body.data.duplicate === true,
      'Duplicate webhook delivery acknowledged idempotently without re-executing order finalization'
    );

    // Concurrent duplicate webhooks race test
    const concurrentOrderRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: payTier.id, quantity: 1 })
    });
    const concurrentOrder = (await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [concurrentOrderRes.body.data.reservation.id] })
    })).body.data.order;

    const concurrentInit = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: concurrentOrder.id })
    });

    const concurrentPayload = {
      event: 'charge.success',
      data: {
        id: timestamp + 102,
        status: 'success',
        reference: concurrentInit.body.data.reference,
        amount: concurrentOrder.totalMinor,
        currency: 'ZAR',
        customer: { email: alice.user.email },
        paid_at: new Date().toISOString()
      }
    };
    const concurrentRaw = JSON.stringify(concurrentPayload);
    const concurrentSig = mockProvider.generateSignature(concurrentRaw);

    // Fire 3 simultaneous identical webhooks
    const concurrentWebhookResults = await Promise.all([
      alice.request('/payments/webhook/paystack', { method: 'POST', headers: { 'x-paystack-signature': concurrentSig }, body: concurrentRaw }),
      alice.request('/payments/webhook/paystack', { method: 'POST', headers: { 'x-paystack-signature': concurrentSig }, body: concurrentRaw }),
      alice.request('/payments/webhook/paystack', { method: 'POST', headers: { 'x-paystack-signature': concurrentSig }, body: concurrentRaw })
    ]);

    const allOk = concurrentWebhookResults.every((r) => r.status === 200);
    const firstProcess = concurrentWebhookResults.filter((r) => r.body?.data?.duplicate === false);
    const deduplicated = concurrentWebhookResults.filter((r) => r.body?.data?.duplicate === true);

    assert(
      allOk && firstProcess.length === 1 && deduplicated.length === 2,
      `Concurrent webhooks serialized: 1 processed, 2 safely deduplicated via DB constraint`
    );

    // Verify inventory invariant: quantitySold incremented exactly once (not 3 times)
    await assertInventoryInvariants(payTier.id, 'After concurrent webhooks');

    // =========================================================================
    // 6. SERVER-SIDE VERIFICATION & FRONTEND REDIRECT SAFETY
    // =========================================================================
    console.log('\n--- 6. Server-Side Verification & Idempotency ---');

    const verifyOrderRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: payTier.id, quantity: 1 })
    });
    const verifyOrder = (await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [verifyOrderRes.body.data.reservation.id] })
    })).body.data.order;

    const verifyInit = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: verifyOrder.id })
    });
    const verifyRef = verifyInit.body.data.reference;

    // Call GET /api/payments/verify/:reference (simulating post-redirect check)
    const firstVerify = await alice.request(`/payments/verify/${verifyRef}`);
    assert(
      firstVerify.status === 200 && firstVerify.body.data.orderStatus === 'PAID',
      'Server-side verify confirms payment with gateway and transitions order to PAID'
    );

    // Second call to verify (idempotent replay)
    const secondVerify = await alice.request(`/payments/verify/${verifyRef}`);
    assert(
      secondVerify.status === 200 && secondVerify.body.data.alreadyProcessed === true,
      'Repeated verification returns cached SUCCESS state idempotently'
    );

    // Order cannot initialize payment once already PAID
    const paidReInit = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: verifyOrder.id })
    });
    assert(
      paidReInit.status === 400 && paidReInit.body.code === 'ORDER_ALREADY_PAID',
      'Payment initialization on already PAID order strictly rejected (400 ORDER_ALREADY_PAID)'
    );

    // =========================================================================
    // 7. CRITICAL PAYMENT / RESERVATION EXPIRY RACE & RECONCILIATION STATE
    // =========================================================================
    console.log('\n--- 7. Critical Race: Late Payment & PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED ---');

    // Create a constrained tier with only 1 ticket total
    const constrainedTier = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: `Constrained Race Tier ${timestamp}`,
        priceMinor: 8000,
        currency: 'ZAR',
        quantityTotal: 1,
        quantitySold: 0,
        quantityReserved: 0,
        status: 'ACTIVE',
        maxPerOrder: 1
      }
    });

    // Alice reserves the only ticket and creates an order
    const raceRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: constrainedTier.id, quantity: 1 })
    });
    const raceOrder = (await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [raceRes.body.data.reservation.id] })
    })).body.data.order;

    const raceInit = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: raceOrder.id })
    });
    const raceRef = raceInit.body.data.reference;

    // Simulate scenario: Alice's order expires while she is paying
    await prisma.order.update({
      where: { id: raceOrder.id },
      data: { status: 'EXPIRED', expiresAt: new Date(Date.now() - 10000) }
    });

    // In the meantime, Bob snaps up the released ticket and pays for it!
    const bobRaceRes = await bob.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: constrainedTier.id, quantity: 1 })
    });
    const bobRaceOrder = (await bob.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [bobRaceRes.body.data.reservation.id] })
    })).body.data.order;

    const bobRaceInit = await bob.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: bobRaceOrder.id })
    });
    await bob.request(`/payments/verify/${bobRaceInit.body.data.reference}`);

    // Verify Bob's purchase consumed the only available ticket
    const dbConstrainedTier = await prisma.ticketType.findUnique({ where: { id: constrainedTier.id } });
    assert(dbConstrainedTier.quantitySold === 1, 'Bob purchased the only available ticket (quantitySold: 1/1)');

    // Now Alice's payment webhook arrives from Paystack reporting SUCCESS!
    const aliceLatePayload = {
      event: 'charge.success',
      data: {
        id: timestamp + 103,
        status: 'success',
        reference: raceRef,
        amount: raceOrder.totalMinor,
        currency: 'ZAR',
        customer: { email: alice.user.email },
        paid_at: new Date().toISOString()
      }
    };
    const aliceLateRaw = JSON.stringify(aliceLatePayload);
    const aliceLateSig = mockProvider.generateSignature(aliceLateRaw);

    const aliceLateWebhookRes = await alice.request('/payments/webhook/paystack', {
      method: 'POST',
      headers: { 'x-paystack-signature': aliceLateSig },
      body: aliceLateRaw
    });
    assert(aliceLateWebhookRes.status === 200, 'Late webhook accepted by server without crashing');

    // Check database state: Order must be in PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED
    const dbAliceOrder = await prisma.order.findUnique({ where: { id: raceOrder.id } });
    const dbAlicePayment = await prisma.payment.findUnique({ where: { providerReference: raceRef } });

    assert(
      dbAliceOrder.status === 'PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED',
      'Critical race handled safely: Order transitioned to PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED'
    );
    assert(
      dbAlicePayment.status === 'SUCCESS',
      'Payment recorded as SUCCESS for auditing and future refund reconciliation'
    );

    // Verify Invariant: Total sold NEVER exceeded 1!
    const dbTierFinal = await prisma.ticketType.findUnique({ where: { id: constrainedTier.id } });
    assert(
      dbTierFinal.quantitySold <= dbTierFinal.quantityTotal && dbTierFinal.quantitySold === 1,
      `Inventory invariant strictly preserved: quantitySold (${dbTierFinal.quantitySold}) <= quantityTotal (${dbTierFinal.quantityTotal}); zero overselling`
    );

    // =========================================================================
    // 8. ADVERSARIAL INJECTION & INPUT TAMPERING
    // =========================================================================
    console.log('\n--- 8. Adversarial Injection & Malformed Input Tests ---');

    // SQL Injection in verify reference
    const sqliVerify = await alice.request("/payments/verify/' OR 1=1 --");
    assert(
      sqliVerify.status === 400 && sqliVerify.body.code === 'VALIDATION_ERROR',
      'SQL injection string in payment reference rejected by parameter validator'
    );

    // Non-existent payment reference
    const missingVerify = await alice.request('/payments/verify/EP-000000000000000000000000');
    assert(
      missingVerify.status === 404 && missingVerify.body.code === 'PAYMENT_NOT_FOUND',
      'Nonexistent payment reference returns clean 404 PAYMENT_NOT_FOUND'
    );

    // Malformed UUID in initialize orderId
    const malformedInit = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'not-a-valid-uuid' })
    });
    assert(
      malformedInit.status === 400 && malformedInit.body.code === 'VALIDATION_ERROR',
      'Malformed UUID in orderId rejected safely by Zod validator'
    );

    console.log('\n==================================================');
    console.log(`📊 Payment Security Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================\n');

    await prisma.$disconnect();
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during payment security test suite:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

runPaymentSecuritySuite();
