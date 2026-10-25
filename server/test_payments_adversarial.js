/**
 * EventPass - Step 5 Final Security Gate Adversarial Audit Test Suite
 * Comprehensive automated tests for:
 * 1. Concurrent payment initialization (10+ requests for same order & user)
 * 2. PaymentStatus & OrderStatus state machines & terminal state preservation
 * 3. Webhook idempotency identity strategy, field validation, and deduplication
 * 4. ZAR / KES / USD currency manipulation defense & strict schema rejection
 * 5. Payment success + inventory race (reconciliation required without overselling)
 * 6. Webhook HMAC-SHA512 cryptographic verification and payload integrity
 * 7. Provider failure handling and error isolation
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { setPaymentProviderInstance } from './src/services/payment/paymentProviderFactory.js';
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

    if (loginRes.status !== 200) {
      throw new Error(`Failed to log in ${this.name}: ${loginRes.status}`);
    }

    this.user = loginRes.body?.user || loginRes.body?.data?.user;
    if (!this.user) {
      throw new Error(`Failed to extract user from login response: ${JSON.stringify(loginRes.body)}`);
    }
    return this.user;
  }
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`  ✅ [PASS] ${message}`);
    passed++;
  }
}

async function runAdversarialAudit() {
  console.log('🔒 Starting EventPass Step 5 Final Security Gate Adversarial Audit...\n');

  // Install Mock payment provider for test isolation using shared test webhook secret
  const testWebhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || 'test_mock_webhook_secret_key_12345678';
  const mockProvider = new MockPaymentProvider({
    webhookSecret: testWebhookSecret,
    supportedCurrencies: ['ZAR', 'KES', 'USD']
  });
  setPaymentProviderInstance(mockProvider);

  // Setup test users
  const timestamp = Date.now();
  const alice = new TestClient('Alice');
  await alice.registerAndLogin(`alice_adv_${timestamp}@example.com`, 'SecurePass123!', 'Alice Adv');

  const bob = new TestClient('Bob');
  await bob.registerAndLogin(`bob_adv_${timestamp}@example.com`, 'SecurePass123!', 'Bob Adv');

  const testEvent = await prisma.event.findFirst({
    where: { status: 'PUBLISHED' }
  });

  // Helper to create a ticket tier and order
  async function createTestEventAndOrder(client, { capacity = 50, priceMinor = 35000, quantity = 2 } = {}) {
    const tierSlug = `Tier-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const ticketType = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: `Adv ${tierSlug}`,
        description: 'Security testing tier',
        priceMinor,
        currency: 'ZAR',
        quantityTotal: capacity,
        quantitySold: 0,
        quantityReserved: 0,
        status: 'ACTIVE',
        maxPerOrder: 10
      }
    });

    // Create reservation
    const resResponse = await client.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: ticketType.id,
        quantity
      })
    });

    if (resResponse.status !== 201) {
      throw new Error(`Failed to create reservation: ${JSON.stringify(resResponse.body)}`);
    }

    const reservationId = resResponse.body.data.reservation.id;

    // Create order
    const orderResponse = await client.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [reservationId],
        buyerDetails: {
          firstName: client.user.fullName.split(' ')[0],
          lastName: client.user.fullName.split(' ')[1] || 'User',
          email: client.user.email,
          phone: '0821234567'
        }
      })
    });

    if (orderResponse.status !== 201) {
      throw new Error(`Failed to create order: ${JSON.stringify(orderResponse.body)}`);
    }

    return {
      event: testEvent,
      ticketType,
      order: orderResponse.body.data.order
    };
  }

  // =========================================================================
  // 1. CONCURRENT PAYMENT INITIALIZATION (12 CONCURRENT REQUESTS)
  // =========================================================================
  console.log('--- 1. Concurrent Payment Initialization (12 Concurrent Requests) ---');
  {
    const { order } = await createTestEventAndOrder(alice, { capacity: 20, priceMinor: 40000, quantity: 1 });

    // Fire 12 concurrent initialization requests for the exact same order and user
    const initPromises = Array.from({ length: 12 }, () =>
      alice.request('/payments/initialize', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id })
      })
    );

    const results = await Promise.all(initPromises);
    console.log('Results statuses:', results.map((r) => ({ status: r.status, code: r.body?.code, message: r.body?.message })));

    // Verify all 12 returned HTTP 200 OK
    const allSuccessful = results.every((r) => r.status === 200);
    assert(allSuccessful, 'All 12 concurrent payment initialization requests succeeded with HTTP 200');

    // Verify exactly 1 was newly created (reused: false) and 11 reused the active session (reused: true)
    const newSessions = results.filter((r) => r.body.data.reused === false);
    const reusedSessions = results.filter((r) => r.body.data.reused === true);
    assert(newSessions.length === 1, `Exactly 1 initialization created new payment session (actual: ${newSessions.length})`);
    assert(reusedSessions.length === 11, `Remaining 11 requests safely reused active payment session (actual: ${reusedSessions.length})`);

    // Verify all 12 requests received the exact same authoritative provider reference
    const references = new Set(results.map((r) => r.body.data.reference));
    assert(references.size === 1, `All 12 concurrent requests received identical reference: ${Array.from(references)[0]}`);

    // Directly inspect database to verify at most 1 payment record exists for this order
    const dbPayments = await prisma.payment.findMany({
      where: { orderId: order.id }
    });
    assert(dbPayments.length === 1, `Database contains exactly 1 payment record for order (actual: ${dbPayments.length})`);
    assert(dbPayments[0].status === 'PENDING', `Database payment status is PENDING (actual: ${dbPayments[0].status})`);
  }

  // =========================================================================
  // 2. PAYMENT STATUS MATRIX & ORDER STATE MACHINE AUDIT
  // =========================================================================
  console.log('\n--- 2. Payment Status Matrix & Order State Machine Audit ---');
  {
    // A. Order with existing PENDING payment: reuses session
    const { order: pendingOrder } = await createTestEventAndOrder(alice, { capacity: 20, priceMinor: 30000, quantity: 1 });
    const init1 = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: pendingOrder.id })
    });
    assert(init1.status === 200 && init1.body.data.reused === false, 'First initialize creates PENDING payment');

    const init2 = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: pendingOrder.id })
    });
    assert(init2.status === 200 && init2.body.data.reused === true, 'Second initialize on PENDING order reuses session');
    assert(init2.body.data.reference === init1.body.data.reference, 'Reused session returns identical reference');

    // B. Order with existing FAILED payment: allows creating a fresh attempt
    await prisma.payment.update({
      where: { providerReference: init1.body.data.reference },
      data: { status: 'FAILED', failureReason: 'Card declined by user bank' }
    });
    const initAfterFail = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: pendingOrder.id })
    });
    assert(initAfterFail.status === 200, 'Initialize succeeds after previous payment failed');
    assert(initAfterFail.body.data.reused === false, 'Fresh payment attempt created after failure');
    assert(initAfterFail.body.data.reference !== init1.body.data.reference, 'Fresh attempt receives new unique reference');

    // C. Order with existing ABANDONED payment: allows creating a fresh attempt
    await prisma.payment.update({
      where: { providerReference: initAfterFail.body.data.reference },
      data: { status: 'ABANDONED', failureReason: 'User abandoned transaction' }
    });
    const initAfterAbandon = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: pendingOrder.id })
    });
    assert(initAfterAbandon.status === 200, 'Initialize succeeds after previous payment abandoned');
    assert(initAfterAbandon.body.data.reused === false, 'Fresh payment attempt created after abandonment');

    // D. Order with existing SUCCESS payment: strictly rejected with 400 ORDER_ALREADY_PAID
    await prisma.payment.update({
      where: { providerReference: initAfterAbandon.body.data.reference },
      data: { status: 'SUCCESS', paidAt: new Date() }
    });
    const initAfterSuccess = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: pendingOrder.id })
    });
    assert(initAfterSuccess.status === 400, 'Initialize on order with SUCCESS payment rejected with HTTP 400');
    assert(initAfterSuccess.body.code === 'ORDER_ALREADY_PAID', 'Rejection code is ORDER_ALREADY_PAID');

    // E. Order in PAID state: rejected with 400 ORDER_ALREADY_PAID
    await prisma.order.update({
      where: { id: pendingOrder.id },
      data: { status: 'PAID' }
    });
    const initPaid = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: pendingOrder.id })
    });
    assert(initPaid.status === 400 && initPaid.body.code === 'ORDER_ALREADY_PAID', 'Initialize on PAID order rejected with ORDER_ALREADY_PAID');

    // F. Order in EXPIRED state: rejected with 400 ORDER_EXPIRED
    const { order: expOrder } = await createTestEventAndOrder(alice, { capacity: 10, priceMinor: 20000, quantity: 1 });
    await prisma.order.update({
      where: { id: expOrder.id },
      data: { status: 'EXPIRED' }
    });
    const initExp = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: expOrder.id })
    });
    assert(initExp.status === 400 && initExp.body.code === 'ORDER_EXPIRED', 'Initialize on EXPIRED order rejected with ORDER_EXPIRED');

    // G. Order in CANCELLED state: rejected with 400 ORDER_CANCELLED
    const { order: cancelOrder } = await createTestEventAndOrder(alice, { capacity: 10, priceMinor: 20000, quantity: 1 });
    await prisma.order.update({
      where: { id: cancelOrder.id },
      data: { status: 'CANCELLED' }
    });
    const initCancel = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: cancelOrder.id })
    });
    assert(initCancel.status === 400 && initCancel.body.code === 'ORDER_CANCELLED', 'Initialize on CANCELLED order rejected with ORDER_CANCELLED');

    // H. Order in PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED state: rejected with 400 ORDER_RECONCILIATION_REQUIRED
    const { order: reconOrder } = await createTestEventAndOrder(alice, { capacity: 10, priceMinor: 20000, quantity: 1 });
    await prisma.order.update({
      where: { id: reconOrder.id },
      data: { status: 'PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED' }
    });
    const initRecon = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: reconOrder.id })
    });
    assert(initRecon.status === 400 && initRecon.body.code === 'ORDER_RECONCILIATION_REQUIRED', 'Initialize on reconciliation-required order rejected');
  }

  // =========================================================================
  // 3. TERMINAL STATE PRESERVATION (ANTI-CORRUPTION & ANTI-REVERSAL)
  // =========================================================================
  console.log('\n--- 3. Terminal State Preservation (Anti-Corruption & Anti-Reversal) ---');
  {
    const { order, ticketType } = await createTestEventAndOrder(alice, { capacity: 30, priceMinor: 50000, quantity: 2 });
    const initRes = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order.id })
    });
    const reference = initRes.body.data.reference;

    // Finalize payment successfully via verify
    const verifySuccess = await alice.request(`/payments/verify/${reference}`);
    assert(verifySuccess.status === 200 && verifySuccess.body.data.orderStatus === 'PAID', 'Order successfully verified and marked PAID');

    const dbOrderAfterPaid = await prisma.order.findUnique({ where: { id: order.id } });
    const dbPaymentAfterPaid = await prisma.payment.findUnique({ where: { providerReference: reference } });
    const dbTierAfterPaid = await prisma.ticketType.findUnique({ where: { id: ticketType.id } });
    const initialSold = dbTierAfterPaid.quantitySold;

    assert(dbOrderAfterPaid.status === 'PAID', 'Order status in DB is PAID');
    assert(dbPaymentAfterPaid.status === 'SUCCESS', 'Payment status in DB is SUCCESS');

    // Attack A: Stale FAILED webhook arriving AFTER payment is already SUCCESS
    const failedWebhookPayload = {
      event: 'charge.failed',
      data: {
        id: timestamp + 1,
        reference,
        status: 'failed',
        amount: order.totalMinor,
        currency: 'ZAR',
        gateway_response: 'Stale late failure'
      }
    };
    const failedSig = mockProvider.generateSignature(failedWebhookPayload);
    const staleFailedRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': failedSig
      },
      body: JSON.stringify(failedWebhookPayload)
    });
    assert(staleFailedRes.status === 200, 'Stale FAILED webhook accepted safely without error');

    // Verify payment was NOT reverted to FAILED
    const paymentAfterFailedWebhook = await prisma.payment.findUnique({ where: { providerReference: reference } });
    assert(paymentAfterFailedWebhook.status === 'SUCCESS', 'Terminal Payment SUCCESS preserved; stale FAILED webhook suppressed');

    // Verify order was NOT reverted from PAID to FAILED
    const orderAfterFailedWebhook = await prisma.order.findUnique({ where: { id: order.id } });
    assert(orderAfterFailedWebhook.status === 'PAID', 'Terminal Order PAID preserved; stale FAILED webhook did NOT revert order');

    // Attack B: Stale FAILED verification attempt on already PAID order
    const staleVerifyRes = await alice.request(`/payments/verify/${reference}`, {
      headers: { 'x-mock-failure': 'FAILED_STATUS' }
    });
    assert(staleVerifyRes.status === 200, 'Verification call on PAID order returns safely');
    assert(staleVerifyRes.body.data.alreadyProcessed === true, 'Verification flags alreadyProcessed: true');
    assert(staleVerifyRes.body.data.orderStatus === 'PAID', 'Order status remains PAID despite simulated gateway failure');

    // Attack C: Duplicate SUCCESS webhook does NOT increment quantitySold twice
    const successWebhookPayload = {
      event: 'charge.success',
      data: {
        id: timestamp + 2,
        reference,
        status: 'success',
        amount: order.totalMinor,
        currency: 'ZAR'
      }
    };
    const successSig = mockProvider.generateSignature(successWebhookPayload);
    await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': successSig
      },
      body: JSON.stringify(successWebhookPayload)
    });

    const tierAfterDupWebhook = await prisma.ticketType.findUnique({ where: { id: ticketType.id } });
    assert(tierAfterDupWebhook.quantitySold === initialSold, `Inventory quantitySold NOT incremented twice (was ${initialSold}, is ${tierAfterDupWebhook.quantitySold})`);
  }

  // =========================================================================
  // 4. WEBHOOK IDEMPOTENCY IDENTITY & PAYLOAD STRUCTURE AUDIT
  // =========================================================================
  console.log('\n--- 4. Webhook Idempotency Identity & Payload Structure Audit ---');
  {
    const { order } = await createTestEventAndOrder(alice, { capacity: 20, priceMinor: 25000, quantity: 1 });
    const initRes = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order.id })
    });
    const reference = initRes.body.data.reference;

    // A. Verify exact deterministic identity format: PAYSTACK_${event}_${transactionId ? 'TX_' + transactionId : 'REF_' + reference}
    const paystackProvider = new PaystackProvider({ secretKey: 'test_key', merchantCountry: 'KE' });
    const eventWithId = paystackProvider.parseWebhookEvent({
      event: 'charge.success',
      data: { id: 30129988, reference: 'EP-ABC12345' }
    });
    assert(eventWithId.eventId === 'PAYSTACK_charge.success_TX_30129988', `Deterministic ID with numeric id: ${eventWithId.eventId}`);

    const eventWithoutId = paystackProvider.parseWebhookEvent({
      event: 'charge.success',
      data: { reference: 'EP-ABC12345' }
    });
    assert(eventWithoutId.eventId === 'PAYSTACK_charge.success_REF_EP-ABC12345', `Deterministic ID with reference fallback: ${eventWithoutId.eventId}`);

    const timestamp = Date.now();

    // B. Delivery of same webhook twice sequentially
    const webhookPayload = {
      event: 'charge.success',
      data: {
        id: timestamp + 10,
        reference,
        status: 'success',
        amount: order.totalMinor,
        currency: 'ZAR'
      }
    };
    const sig = mockProvider.generateSignature(webhookPayload);

    const firstDelivery = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
      body: JSON.stringify(webhookPayload)
    });
    const firstBody = await firstDelivery.json();
    assert(firstDelivery.status === 200 && firstBody.data.duplicate === false, 'First webhook delivery processed (duplicate: false)');

    const secondDelivery = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
      body: JSON.stringify(webhookPayload)
    });
    const secondBody = await secondDelivery.json();
    assert(secondDelivery.status === 200 && secondBody.data.duplicate === true, 'Second identical webhook delivery deduplicated (duplicate: true)');

    // C. Concurrent delivery of same webhook (5 concurrent requests)
    const concurrentPayload = {
      event: 'charge.success',
      data: {
        id: timestamp + 20,
        reference,
        status: 'success',
        amount: order.totalMinor,
        currency: 'ZAR'
      }
    };
    const concSig = mockProvider.generateSignature(concurrentPayload);
    const concPromises = Array.from({ length: 5 }, () =>
      fetch(`${API_BASE}/payments/webhook/paystack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-paystack-signature': concSig },
        body: JSON.stringify(concurrentPayload)
      })
    );
    const concResults = await Promise.all(concPromises);
    const all200 = concResults.every((r) => r.status === 200);
    assert(all200, 'All 5 concurrent identical webhooks acknowledged with HTTP 200 OK');

    const concBodies = await Promise.all(concResults.map((r) => r.json()));
    const processedCount = concBodies.filter((b) => b.data.duplicate === false).length;
    const dedupCount = concBodies.filter((b) => b.data.duplicate === true).length;
    assert(processedCount === 1, `Exactly 1 concurrent webhook executed (actual: ${processedCount})`);
    assert(dedupCount === 4, `Remaining 4 concurrent webhooks deduplicated cleanly via DB unique constraint (actual: ${dedupCount})`);

    // D. Same transaction with different event types generates distinct event IDs
    const disputePayload = {
      event: 'charge.dispute.create',
      data: {
        id: timestamp + 10, // Same transaction ID as charge.success above!
        reference,
        status: 'dispute'
      }
    };
    const disputeParsed = mockProvider.parseWebhookEvent(disputePayload);
    assert(disputeParsed.eventId === `MOCK_charge.dispute.create_TX_${timestamp + 10}`, 'Different event on same transaction generates distinct event ID');

    // E. Malformed webhook payloads fail closed with 400 INVALID_WEBHOOK_PAYLOAD
    const malformed1 = { event: '', data: { id: 123, reference: 'REF' } }; // missing event
    const sigM1 = mockProvider.generateSignature(malformed1);
    const resM1 = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sigM1 },
      body: JSON.stringify(malformed1)
    });
    assert(resM1.status === 400, 'Webhook missing event type rejected with HTTP 400');

    const malformed2 = { event: 'charge.success' }; // missing data
    const sigM2 = mockProvider.generateSignature(malformed2);
    const resM2 = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sigM2 },
      body: JSON.stringify(malformed2)
    });
    assert(resM2.status === 400, 'Webhook missing data object rejected with HTTP 400');

    const malformed3 = { event: 'charge.success', data: { status: 'success' } }; // missing both id and reference
    const sigM3 = mockProvider.generateSignature(malformed3);
    const resM3 = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sigM3 },
      body: JSON.stringify(malformed3)
    });
    assert(resM3.status === 400, 'Webhook missing both id and reference rejected with HTTP 400');
  }

  // =========================================================================
  // 5. FINANCIAL INJECTION & CURRENCY / FX SECURITY AUDIT
  // =========================================================================
  console.log('\n--- 5. Financial Injection & Currency / FX Security Audit ---');
  {
    const { order } = await createTestEventAndOrder(alice, { capacity: 20, priceMinor: 75000, quantity: 2 });

    // Attack A: Client submits tampered financial fields to payment initialize
    const injectionAttempt = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({
        orderId: order.id,
        amountMinor: 100, // Attempt to charge 1 Rand instead of 750
        currency: 'KES', // Attempt to force currency to KES
        fxRate: 0.001, // Attempt to inject malicious FX rate
        settlementAmountMinor: 1, // Attempt to bypass settlement calculation
        providerReference: 'FORGED_REF_123'
      })
    });
    assert(injectionAttempt.status === 400, 'Client financial injection strictly rejected with HTTP 400');
    assert(injectionAttempt.body.code === 'VALIDATION_ERROR', 'Validator returned VALIDATION_ERROR due to strict schema');

    // Attack B: Provider amount mismatch rejected
    const initRes = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order.id })
    });
    const reference = initRes.body.data.reference;

    const mismatchAmountRes = await alice.request(`/payments/verify/${reference}`, {
      headers: { 'x-mock-failure': 'AMOUNT_MISMATCH' }
    });
    assert(mismatchAmountRes.status === 400, 'Provider amount mismatch rejected with HTTP 400');
    assert(mismatchAmountRes.body.code === 'AMOUNT_MISMATCH', 'Rejection code is AMOUNT_MISMATCH');

    const orderAfterMismatch = await prisma.order.findUnique({ where: { id: order.id } });
    assert(orderAfterMismatch.status !== 'PAID', 'Order NOT marked PAID after amount mismatch');

    // Attack C: Provider currency mismatch rejected
    const mismatchCurrRes = await alice.request(`/payments/verify/${reference}`, {
      headers: { 'x-mock-failure': 'CURRENCY_MISMATCH' }
    });
    assert(mismatchCurrRes.status === 400, 'Provider currency mismatch rejected with HTTP 400');
    assert(mismatchCurrRes.body.code === 'CURRENCY_MISMATCH', 'Rejection code is CURRENCY_MISMATCH');

    // Attack D: Paystack Kenya merchant with ZAR order fails safely
    const kenyaPaystack = new PaystackProvider({ secretKey: 'test_sk_ke', merchantCountry: 'KE' });
    let kenyaZarError = null;
    try {
      await kenyaPaystack.initializeTransaction({
        reference: 'EP-TEST-ZAR-KENYA-ADV',
        amountMinor: order.totalMinor,
        currency: order.currency, // ZAR
        customerEmail: alice.user.email
      });
    } catch (err) {
      kenyaZarError = err;
    }
    assert(kenyaZarError && kenyaZarError.statusCode === 422, 'Unsupported ZAR on Kenyan Paystack fails safely with HTTP 422');
    assert(kenyaZarError && kenyaZarError.code === 'CURRENCY_NOT_SUPPORTED_BY_MERCHANT', 'Error code is CURRENCY_NOT_SUPPORTED_BY_MERCHANT');

    // Attack E: BOLA Defense - Bob cannot initialize payment for Alice's order
    const bobBOLAInit = await bob.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order.id })
    });
    assert(bobBOLAInit.status === 403, 'Bob initializing payment for Alice order rejected with HTTP 403');
    assert(bobBOLAInit.body.code === 'ORDER_ACCESS_DENIED', 'Rejection code is ORDER_ACCESS_DENIED');

    // Attack F: BOLA Defense - Bob cannot verify Alice's payment
    const bobBOLAVerify = await bob.request(`/payments/verify/${reference}`);
    assert(bobBOLAVerify.status === 403, 'Bob verifying Alice payment rejected with HTTP 403');
    assert(bobBOLAVerify.body.code === 'PAYMENT_ACCESS_DENIED', 'Rejection code is PAYMENT_ACCESS_DENIED');
  }

  // =========================================================================
  // 6. PAYMENT SUCCESS + INVENTORY RACE (LATE PAYMENT RECONCILIATION)
  // =========================================================================
  console.log('\n--- 6. Payment Success + Inventory Race (Late Payment Reconciliation) ---');
  {
    // Create an event with strictly 1 ticket available
    const { order: aliceOrder, ticketType } = await createTestEventAndOrder(alice, { capacity: 1, priceMinor: 60000, quantity: 1 });

    const aliceInit = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: aliceOrder.id })
    });
    const aliceRef = aliceInit.body.data.reference;

    // Simulate reservation expiration: expire Alice's reservation and order
    await prisma.reservation.updateMany({
      where: { orderId: aliceOrder.id },
      data: { status: 'EXPIRED', expiresAt: new Date(Date.now() - 60000) }
    });
    await prisma.order.update({
      where: { id: aliceOrder.id },
      data: { status: 'EXPIRED', expiresAt: new Date(Date.now() - 60000) }
    });

    // Bob purchases the last remaining ticket
    const bobRes = await bob.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: ticketType.id, quantity: 1 })
    });
    assert(bobRes.status === 201, 'Bob successfully reserved the released ticket');

    const bobOrderRes = await bob.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [bobRes.body.data.reservation.id],
        buyerDetails: { firstName: 'Bob', lastName: 'Adv', email: bob.user.email, phone: '0821234567' }
      })
    });
    const bobOrder = bobOrderRes.body.data.order;

    const bobInit = await bob.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: bobOrder.id })
    });
    await bob.request(`/payments/verify/${bobInit.body.data.reference}`);

    // Verify Bob has taken the only available ticket
    const tierAfterBob = await prisma.ticketType.findUnique({ where: { id: ticketType.id } });
    assert(tierAfterBob.quantitySold === 1, 'Bob took the single available ticket (quantitySold: 1/1)');

    // Now Alice's late payment webhook arrives for her expired order
    const lateWebhookPayload = {
      event: 'charge.success',
      data: {
        id: Date.now() + 30,
        reference: aliceRef,
        status: 'success',
        amount: aliceOrder.totalMinor,
        currency: 'ZAR'
      }
    };
    const lateSig = mockProvider.generateSignature(lateWebhookPayload);
    const lateWebhookRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': lateSig },
      body: JSON.stringify(lateWebhookPayload)
    });
    assert(lateWebhookRes.status === 200, 'Late webhook accepted by server with HTTP 200');

    // Verify Alice's order transitioned to PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED
    const aliceOrderAfterRace = await prisma.order.findUnique({ where: { id: aliceOrder.id } });
    assert(
      aliceOrderAfterRace.status === 'PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED',
      `Alice order transitioned to PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED (actual: ${aliceOrderAfterRace.status})`
    );

    // Verify Alice's payment record marked SUCCESS
    const alicePaymentAfterRace = await prisma.payment.findUnique({ where: { providerReference: aliceRef } });
    assert(alicePaymentAfterRace.status === 'SUCCESS', 'Alice payment recorded as SUCCESS for auditing');

    // Verify INVENTORY INVARIANT: zero overselling!
    const tierAfterRace = await prisma.ticketType.findUnique({ where: { id: ticketType.id } });
    assert(tierAfterRace.quantitySold === 1, `Zero overselling: quantitySold remains 1 (quantityTotal: ${tierAfterRace.quantityTotal})`);
    assert(tierAfterRace.quantitySold + tierAfterRace.quantityReserved <= tierAfterRace.quantityTotal, 'Inventory invariant strictly held: quantitySold + quantityReserved <= quantityTotal');
  }

  // =========================================================================
  // 7. WEBHOOK CRYPTOGRAPHIC HMAC-SHA512 INTEGRITY AUDIT
  // =========================================================================
  console.log('\n--- 7. Webhook Cryptographic HMAC-SHA512 Integrity Audit ---');
  {
    const samplePayload = JSON.stringify({ event: 'charge.success', data: { id: 111, reference: 'EP-REF' } });

    // A. Missing HMAC signature header
    const noSigRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: samplePayload
    });
    assert(noSigRes.status === 401, 'Missing webhook signature header rejected with HTTP 401');

    // B. Wrong HMAC secret / signature
    const wrongSigRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': 'badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad'
      },
      body: samplePayload
    });
    assert(wrongSigRes.status === 401, 'Invalid webhook signature rejected with HTTP 401');

    // C. Malformed signature length (timing-safe check avoids crash)
    const malformedSigRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': 'short_sig'
      },
      body: samplePayload
    });
    assert(malformedSigRes.status === 401, 'Malformed length signature rejected safely with HTTP 401 without unhandled crash');

    // D. Tampered payload byte with valid original signature
    const validSig = mockProvider.generateSignature(samplePayload);
    const tamperedPayload = JSON.stringify({ event: 'charge.success', data: { id: 111, reference: 'EP-REF_TAMPERED' } });
    const tamperedRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': validSig
      },
      body: tamperedPayload
    });
    assert(tamperedRes.status === 401, 'Tampered payload bytes rejected with HTTP 401');
  }

  // =========================================================================
  // 8. PROVIDER GATEWAY FAILURE HANDLING & ISOLATION
  // =========================================================================
  console.log('\n--- 8. Provider Gateway Failure Handling & Isolation ---');
  {
    const { order } = await createTestEventAndOrder(alice, { capacity: 10, priceMinor: 20000, quantity: 1 });

    // A. Gateway unavailable on initialize
    mockProvider.setFailureMode('GATEWAY_ERROR');
    let initGatewayError = null;
    try {
      await mockProvider.initializeTransaction({
        reference: 'EP-FAIL-INIT',
        amountMinor: order.totalMinor,
        currency: order.currency,
        customerEmail: alice.user.email
      });
    } catch (err) {
      initGatewayError = err;
    }
    assert(initGatewayError && initGatewayError.statusCode === 502, 'Gateway error on initialize returns HTTP 502');
    assert(initGatewayError && initGatewayError.code === 'PAYMENT_GATEWAY_UNAVAILABLE', 'Rejection code is PAYMENT_GATEWAY_UNAVAILABLE');
    mockProvider.reset();

    // B. Normal initialize succeeds after gateway recovers
    const initRecovered = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order.id })
    });
    assert(initRecovered.status === 200, 'Initialize succeeds after gateway recovers');
    const reference = initRecovered.body.data.reference;

    // C. Gateway unavailable on verify
    const verifyErrorRes = await alice.request(`/payments/verify/${reference}`, {
      headers: { 'x-mock-failure': 'GATEWAY_ERROR' }
    });
    assert(verifyErrorRes.status === 502, 'Gateway error on verify returns HTTP 502');
    assert(verifyErrorRes.body.code === 'PAYMENT_GATEWAY_UNAVAILABLE', 'Rejection code is PAYMENT_GATEWAY_UNAVAILABLE');
  }

  console.log('\n==================================================');
  console.log(`📊 Final Adversarial Audit Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdversarialAudit()
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
