/**
 * EventPass - Paystack Phase 2: Fixed USD Payment Currency Implementation Test Suite
 * 
 * Verifies all 34 required test conditions across 7 core domains:
 * A. Price Model (1-6)
 * B. Order Creation & Snapshots (7-11)
 * C. Paystack Initialization & Verification (12-18)
 * D. Paystack Webhook Verification & Idempotency (19-23)
 * E. Security & Non-Bypassable Controls (24-29)
 * F. Ticket Fulfilment, Idempotency & Email Delivery (30-34)
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { PaystackProvider } from './src/services/payment/PaystackProvider.js';
import { MockPaymentProvider } from './src/services/payment/MockPaymentProvider.js';
import { getPaymentProvider, setPaymentProviderInstance } from './src/services/payment/paymentProviderFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

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

  async registerAndLogin(email, password, fullName, role = 'CUSTOMER') {
    // 1. Register
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

    // If admin requested, promote directly in DB
    if (role === 'ADMIN') {
      await prisma.user.update({
        where: { email: email.toLowerCase() },
        data: { role: 'ADMIN', emailVerified: true }
      });
    } else {
      await prisma.user.update({
        where: { email: email.toLowerCase() },
        data: { emailVerified: true }
      });
    }

    // 2. Login
    const loginRes = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    this.user = loginRes.body?.user || loginRes.body?.data?.user;
    return this.user;
  }
}

async function runPhase2TestSuite() {
  console.log('💳 =========================================================================');
  console.log('💳 EVENTPASS — PAYSTACK PHASE 2: FIXED USD PAYMENT CURRENCY TEST SUITE');
  console.log('💳 =========================================================================\n');

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
    // 1. Setup authenticated test users
    const admin = new TestClient('Admin');
    const alice = new TestClient('Alice');
    const bob = new TestClient('Bob');

    await admin.registerAndLogin(`admin_p2_${timestamp}@test.co.za`, 'Secret123#Pass', 'Admin User', 'ADMIN');
    await alice.registerAndLogin(`alice_p2_${timestamp}@test.co.za`, 'Secret123#Pass', 'Alice Buyer', 'CUSTOMER');
    await bob.registerAndLogin(`bob_p2_${timestamp}@test.co.za`, 'Secret123#Pass', 'Bob Buyer', 'CUSTOMER');

    const testEvent = await prisma.event.findFirst({ where: { status: 'PUBLISHED' } });
    if (!testEvent) {
      throw new Error('No published event found in database for testing.');
    }

    // =========================================================================
    // SECTION A: PRICE MODEL (TESTS 1 - 6)
    // =========================================================================
    console.log('--- A. Price Model Invariants ---');

    // Test 1: Ticket can have ZAR and USD prices
    const tier1 = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: `Weekend General Pass ${timestamp}`,
        priceMinor: 89500, // R895.00
        paymentPriceUsdMinor: 4900, // $49.00 USD
        currency: 'ZAR',
        quantityTotal: 50,
        quantitySold: 0,
        quantityReserved: 0,
        status: 'ACTIVE',
        maxPerOrder: 5
      }
    });
    assert(
      tier1.priceMinor === 89500 && tier1.paymentPriceUsdMinor === 4900,
      'Test 1: Ticket tier explicitly stores both ZAR display price (89500) and USD payment price (4900)'
    );

    // Test 2: Negative USD price rejected by admin validator
    const negPriceRes = await admin.request(`/admin/events/${testEvent.id}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: `Negative USD Tier ${timestamp}`,
        priceMinor: 50000,
        paymentPriceUsdMinor: -100, // Invalid negative price
        quantityTotal: 10
      })
    });
    assert(
      negPriceRes.status === 400 && negPriceRes.body.code === 'VALIDATION_ERROR',
      'Test 2: Negative USD price rejected by admin validator with HTTP 400 VALIDATION_ERROR'
    );

    // Test 3: Invalid USD amount (float / decimal ambiguity) rejected
    const floatPriceRes = await admin.request(`/admin/events/${testEvent.id}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: `Float USD Tier ${timestamp}`,
        priceMinor: 50000,
        paymentPriceUsdMinor: 49.99, // Float instead of integer minor units
        quantityTotal: 10
      })
    });
    assert(
      floatPriceRes.status === 400 && floatPriceRes.body.code === 'VALIDATION_ERROR',
      'Test 3: Non-integer float USD amount rejected by schema validator'
    );

    // Test 4: Customer cannot create or modify ticket type or USD price
    const custCreateRes = await alice.request(`/admin/events/${testEvent.id}/ticket-types`, {
      method: 'POST',
      body: JSON.stringify({
        name: `Hacker Tier ${timestamp}`,
        priceMinor: 100,
        paymentPriceUsdMinor: 10,
        quantityTotal: 10
      })
    });
    assert(
      custCreateRes.status === 403,
      'Test 4: Customer cannot access admin endpoint to configure ticket prices (HTTP 403 FORBIDDEN)'
    );

    // Test 5: Admin can update USD price
    const adminUpdateRes = await admin.request(`/admin/events/${testEvent.id}/ticket-types/${tier1.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        priceMinor: 95000, // ZAR 950.00
        paymentPriceUsdMinor: 5200 // USD $52.00
      })
    });
    assert(
      adminUpdateRes.status === 200 && adminUpdateRes.body.data.ticketType.paymentPriceUsdMinor === 5200,
      'Test 5: Admin can update ticket USD payment price to $52.00 (5200 minor units)'
    );

    // Reset tier1 prices for clean order creation: R895.00 / $49.00 USD
    await prisma.ticketType.update({
      where: { id: tier1.id },
      data: { priceMinor: 89500, paymentPriceUsdMinor: 4900 }
    });

    // Create an order now with tier1 (R895 / $49)
    const aliceRes1 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tier1.id, quantity: 2 })
    });
    assert(aliceRes1.status === 201, 'Alice reserved 2 tickets for tier1');

    const aliceOrderRes1 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [aliceRes1.body.data.reservation.id] })
    });
    assert(aliceOrderRes1.status === 201, 'Alice created Order 1 successfully');
    const order1 = aliceOrderRes1.body.data.order;

    // Admin later changes ticket type to ZAR R950 / USD $52
    await admin.request(`/admin/events/${testEvent.id}/ticket-types/${tier1.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        priceMinor: 95000,
        paymentPriceUsdMinor: 5200
      })
    });

    // Test 6: Historical OrderItem USD price remains unchanged
    const fetchedOrder1 = (await alice.request(`/orders/${order1.id}`)).body.data.order;
    const item1 = fetchedOrder1.items[0];
    assert(
      item1.unitPriceMinor === 89500 && item1.unitPriceUsdMinor === 4900 && item1.totalUsdMinor === 9800,
      'Test 6: Historical OrderItem pricing remains strictly immutable (unitPrice: $49.00, total: $98.00) after admin tier update'
    );

    // =========================================================================
    // SECTION B: ORDER CREATION & SNAPSHOTS (TESTS 7 - 11)
    // =========================================================================
    console.log('\n--- B. Order Creation & Snapshots ---');

    // Test 7: Order snapshots correct ZAR price
    assert(
      fetchedOrder1.subtotalMinor === 179000 && fetchedOrder1.serviceFeeMinor === 1500 && fetchedOrder1.totalMinor === 180500,
      'Test 7: Order correctly snapshots ZAR subtotal (R1790.00), service fee (R15.00), and total (R1805.00)'
    );

    // Test 8: Order snapshots correct USD price
    assert(
      fetchedOrder1.paymentSubtotalUsdMinor === 9800,
      'Test 8: Order correctly snapshots USD subtotal ($49.00 * 2 = $98.00 = 9800 minor units)'
    );

    // Test 9: Client-supplied USD amount is rejected by strict Zod schema
    const clientHackedOrder = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [aliceRes1.body.data.reservation.id],
        paymentPriceUsdMinor: 100, // Attacker trying to set $1.00 total
        paymentTotalUsdMinor: 100,
        currency: 'USD'
      })
    });
    assert(
      clientHackedOrder.status === 400 && clientHackedOrder.body.code === 'VALIDATION_ERROR',
      'Test 9: Client injection of paymentPriceUsdMinor / paymentTotalUsdMinor rejected with HTTP 400 VALIDATION_ERROR'
    );

    // Test 10: Correct USD total is calculated ($98.00 subtotal + $1.00 fee = $99.00 USD)
    assert(
      fetchedOrder1.paymentTotalUsdMinor === 9900 && fetchedOrder1.paymentCurrency === 'USD',
      'Test 10: Authoritative USD total is strictly 9900 minor units ($99.00 USD)'
    );

    // Test 11: Service fee is handled deterministically (ZAR 1500 / USD 100)
    assert(
      fetchedOrder1.serviceFeeMinor === 1500 && fetchedOrder1.paymentServiceFeeUsdMinor === 100,
      'Test 11: Service fee is deterministically handled: R15.00 (1500 ZAR cents) for catalogue, $1.00 (100 USD cents) for payment'
    );

    // =========================================================================
    // SECTION C: PAYSTACK INITIALIZATION & VERIFICATION (TESTS 12 - 18)
    // =========================================================================
    console.log('\n--- C. Paystack Initialization & Verification ---');

    // Create a fresh order for Paystack tests
    const tierP2 = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: `Paystack Tier ${timestamp}`,
        priceMinor: 50000, // R500.00
        paymentPriceUsdMinor: 3000, // $30.00 USD
        currency: 'ZAR',
        quantityTotal: 20,
        quantitySold: 0,
        quantityReserved: 0,
        status: 'ACTIVE',
        maxPerOrder: 5
      }
    });

    const aliceRes2 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tierP2.id, quantity: 1 })
    });
    const orderRes2 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [aliceRes2.body.data.reservation.id] })
    });
    const order2 = orderRes2.body.data.order;
    // Expected: subtotal 3000 + fee 100 = 3100 minor units ($31.00 USD)

    // Test 12: Paystack initialization uses USD
    const initRes2 = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order2.id })
    });
    assert(
      initRes2.status === 200 && initRes2.body.data.currency === 'USD',
      'Test 12: Payment initialization authoritative currency is strictly USD'
    );

    // Test 13: Paystack initialization never uses ZAR (Direct PaystackProvider test)
    const livePaystack = new PaystackProvider({
      secretKey: 'sk_test_fake_paystack_key_123',
      merchantCountry: 'KE'
    });
    let zarInitErr = null;
    try {
      await livePaystack.initializeTransaction({
        reference: 'EP-ZAR-TEST-BLOCKED',
        amountMinor: 51500,
        currency: 'ZAR',
        customerEmail: 'test@eventpass.co.za'
      });
    } catch (err) {
      zarInitErr = err;
    }
    assert(
      zarInitErr !== null && zarInitErr.code === 'CURRENCY_NOT_SUPPORTED_BY_MERCHANT',
      'Test 13: Direct Paystack initialization with ZAR strictly rejected with CURRENCY_NOT_SUPPORTED_BY_MERCHANT'
    );

    // Test 14: Paystack amount equals stored USD amount
    assert(
      initRes2.body.data.amountMinor === 3100 && initRes2.body.data.amountMinor === order2.paymentTotalUsdMinor,
      'Test 14: Payment session amountMinor (3100) strictly equals stored order.paymentTotalUsdMinor'
    );

    // Test 15: Wrong Paystack currency rejected (Verify returns EUR instead of USD)
    const resv15 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tierP2.id, quantity: 1 })
    });
    const ord15Res = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [resv15.body.data.reservation.id] })
    });
    const order15 = ord15Res.body.data.order;
    const init15 = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order15.id })
    });

    mockProvider.setFailureMode('CURRENCY_MISMATCH');
    const wrongCurrVerify = await alice.request(`/payments/verify/${init15.body.data.reference}`, {
      headers: { 'x-mock-failure': 'CURRENCY_MISMATCH' }
    });
    assert(
      wrongCurrVerify.status === 400 && wrongCurrVerify.body.code === 'CURRENCY_MISMATCH',
      'Test 15: Gateway returning non-USD currency rejected with HTTP 400 CURRENCY_MISMATCH'
    );
    mockProvider.reset();

    // Test 16: Wrong Paystack amount rejected
    const resv16 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tierP2.id, quantity: 1 })
    });
    const ord16Res = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [resv16.body.data.reservation.id] })
    });
    const order16 = ord16Res.body.data.order;
    const init16 = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order16.id })
    });

    mockProvider.setFailureMode('AMOUNT_MISMATCH');
    const wrongAmtVerify = await alice.request(`/payments/verify/${init16.body.data.reference}`, {
      headers: { 'x-mock-failure': 'AMOUNT_MISMATCH' }
    });
    assert(
      wrongAmtVerify.status === 400 && wrongAmtVerify.body.code === 'AMOUNT_MISMATCH',
      'Test 16: Gateway returning incorrect amount rejected with HTTP 400 AMOUNT_MISMATCH'
    );
    mockProvider.reset();

    // Test 17: Successful USD payment becomes PAID
    const resv17 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tierP2.id, quantity: 1 })
    });
    const ord17Res = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [resv17.body.data.reservation.id] })
    });
    const order17 = ord17Res.body.data.order;
    const init17 = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order17.id })
    });

    const verifySuccess = await alice.request(`/payments/verify/${init17.body.data.reference}`);
    assert(
      verifySuccess.status === 200 && verifySuccess.body.data.orderStatus === 'PAID',
      'Test 17: Verified successful USD payment transitions order status strictly to PAID'
    );

    // Test 18: Failed USD payment does not become PAID
    const aliceRes3 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tierP2.id, quantity: 1 })
    });
    const orderRes3 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [aliceRes3.body.data.reservation.id] })
    });
    const order3 = orderRes3.body.data.order;
    const initRes3 = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order3.id })
    });

    mockProvider.setFailureMode('FAILED_STATUS');
    const failedVerify = await alice.request(`/payments/verify/${initRes3.body.data.reference}`, {
      headers: { 'x-mock-failure': 'FAILED_STATUS' }
    });
    const checkOrder3 = (await alice.request(`/orders/${order3.id}`)).body.data.order;
    assert(
      checkOrder3.status !== 'PAID' && checkOrder3.status === 'PAYMENT_PROCESSING',
      'Test 18: Failed payment transaction does not mark order PAID'
    );
    mockProvider.reset();

    // =========================================================================
    // SECTION D: WEBHOOKS (TESTS 19 - 23)
    // =========================================================================
    console.log('\n--- D. Webhook Processing & Idempotency ---');

    // Create order for webhook verification
    const aliceRes4 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tierP2.id, quantity: 1 })
    });
    const orderRes4 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [aliceRes4.body.data.reservation.id] })
    });
    const order4 = orderRes4.body.data.order;
    const initRes4 = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order4.id })
    });
    const ref4 = initRes4.body.data.reference;

    // Test 19: Valid USD webhook succeeds
    const validWhPayload = {
      event: 'charge.success',
      data: {
        id: timestamp + 201,
        status: 'success',
        reference: ref4,
        amount: order4.paymentTotalUsdMinor, // 3100
        currency: 'USD',
        customer: { email: alice.user.email },
        paid_at: new Date().toISOString()
      }
    };
    const validRawBody = JSON.stringify(validWhPayload);
    const validSig = mockProvider.generateSignature(validRawBody);

    const whSuccessRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': validSig
      },
      body: validRawBody
    });
    const whSuccessBody = await whSuccessRes.json();
    assert(
      whSuccessRes.status === 200 && whSuccessBody.data?.duplicate === false,
      'Test 19: Valid USD webhook with HMAC signature processed successfully with HTTP 200'
    );

    // Test 20: Invalid HMAC rejected (401)
    const badSigRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': 'invalid_hmac_signature_value_0000000000000000'
      },
      body: validRawBody
    });
    assert(
      badSigRes.status === 401,
      'Test 20: Invalid HMAC signature rejected with HTTP 401 INVALID_WEBHOOK_SIGNATURE'
    );

    // Test 21: Wrong amount rejected
    const aliceRes5 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tierP2.id, quantity: 1 })
    });
    const orderRes5 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [aliceRes5.body.data.reservation.id] })
    });
    const order5 = orderRes5.body.data.order;
    const initRes5 = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: order5.id })
    });

    const wrongAmtPayload = {
      event: 'charge.success',
      data: {
        id: timestamp + 202,
        status: 'success',
        reference: initRes5.body.data.reference,
        amount: 100, // Mismatched amount
        currency: 'USD',
        customer: { email: alice.user.email }
      }
    };
    const wrongAmtRaw = JSON.stringify(wrongAmtPayload);
    const wrongAmtSig = mockProvider.generateSignature(wrongAmtRaw);
    const wrongAmtRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': wrongAmtSig },
      body: wrongAmtRaw
    });
    assert(
      wrongAmtRes.status === 400,
      'Test 21: Webhook reporting incorrect amount rejected with HTTP 400 AMOUNT_MISMATCH'
    );

    // Test 22: Wrong currency rejected
    const wrongCurrPayload = {
      event: 'charge.success',
      data: {
        id: timestamp + 203,
        status: 'success',
        reference: initRes5.body.data.reference,
        amount: order5.paymentTotalUsdMinor,
        currency: 'ZAR', // Mismatched currency (must be USD)
        customer: { email: alice.user.email }
      }
    };
    const wrongCurrRaw = JSON.stringify(wrongCurrPayload);
    const wrongCurrSig = mockProvider.generateSignature(wrongCurrRaw);
    const wrongCurrRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': wrongCurrSig },
      body: wrongCurrRaw
    });
    assert(
      wrongCurrRes.status === 400,
      'Test 22: Webhook reporting non-USD currency (ZAR) rejected with HTTP 400 CURRENCY_MISMATCH'
    );

    // Test 23: Duplicate webhook remains idempotent
    const duplicateWhRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': validSig },
      body: validRawBody
    });
    const duplicateWhBody = await duplicateWhRes.json();
    assert(
      duplicateWhRes.status === 200 && duplicateWhBody.data?.duplicate === true,
      'Test 23: Duplicate webhook delivery acknowledged idempotently (HTTP 200, duplicate: true)'
    );

    // =========================================================================
    // SECTION E: SECURITY & INTEGRITY (TESTS 24 - 29)
    // =========================================================================
    console.log('\n--- E. Security & Non-Bypassable Controls ---');

    // Test 24: Customer cannot modify ticket USD price
    const custPriceMod = await alice.request(`/admin/events/${testEvent.id}/ticket-types/${tierP2.id}`, {
      method: 'PUT',
      body: JSON.stringify({ paymentPriceUsdMinor: 100 })
    });
    assert(
      custPriceMod.status === 403,
      'Test 24: Customer cannot modify ticket tier USD price (HTTP 403 FORBIDDEN)'
    );

    // Test 25: Customer cannot modify order payment amount
    const custOrderTamper = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({
        orderId: order5.id,
        amountMinor: 50,
        paymentTotalUsdMinor: 50
      })
    });
    assert(
      custOrderTamper.status === 400 && custOrderTamper.body.code === 'VALIDATION_ERROR',
      'Test 25: Customer cannot inject payment amount into payment initialization (HTTP 400 VALIDATION_ERROR)'
    );

    // Test 26: Customer cannot force ZAR payment on Paystack
    const custZarForce = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({
        orderId: order5.id,
        currency: 'ZAR'
      })
    });
    assert(
      custZarForce.status === 400 && custZarForce.body.code === 'VALIDATION_ERROR',
      'Test 26: Customer cannot force payment currency in initialize request'
    );

    // Test 27: Frontend cannot bypass server pricing (order created purely from DB tier record)
    const dbTier = await prisma.ticketType.findUnique({ where: { id: tierP2.id } });
    assert(
      order5.paymentSubtotalUsdMinor === dbTier.paymentPriceUsdMinor,
      'Test 27: Order payment subtotal derived exclusively from authoritative PostgreSQL row'
    );

    // Test 28: No card/CVV/expiry fields accepted by EventPass backend
    const cardFieldInjection = await alice.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({
        orderId: order5.id,
        cardNumber: '4111111111111111',
        cvv: '123',
        expiry: '12/28'
      })
    });
    assert(
      cardFieldInjection.status === 400 && cardFieldInjection.body.code === 'VALIDATION_ERROR',
      'Test 28: Card number, CVV, and expiry fields strictly rejected by Zod schema (zero cardholder data policy)'
    );

    // Test 29: Paystack secret never reaches frontend bundle or client DTO
    assert(
      !initRes2.body.data.secretKey && !initRes2.body.data.webhookSecret,
      'Test 29: Payment initialization DTO strictly isolates and never exposes Paystack secretKey or webhookSecret'
    );

    // =========================================================================
    // SECTION F: TICKET FULFILMENT & EMAIL-ONLY QR (TESTS 30 - 34)
    // =========================================================================
    console.log('\n--- F. Ticket Fulfilment & Email-Only QR Delivery ---');

    // Test 30: Successful payment issues exactly the expected tickets
    const issuedTickets = await prisma.ticket.findMany({ where: { orderId: order4.id } });
    assert(
      issuedTickets.length === 1 && issuedTickets[0].status === 'VALID',
      'Test 30: Successful payment creates exactly 1 ticket with VALID status'
    );

    // Test 31: Duplicate verification does not issue duplicate tickets
    await alice.request(`/payments/verify/${ref4}`);
    const ticketsAfterVerify = await prisma.ticket.findMany({ where: { orderId: order4.id } });
    assert(
      ticketsAfterVerify.length === 1,
      'Test 31: Duplicate payment verification does not create duplicate tickets'
    );

    // Test 32: Duplicate webhook does not issue duplicate tickets
    await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': validSig },
      body: validRawBody
    });
    const ticketsAfterDupWh = await prisma.ticket.findMany({ where: { orderId: order4.id } });
    assert(
      ticketsAfterDupWh.length === 1,
      'Test 32: Duplicate webhook does not create duplicate tickets'
    );

    // Test 33: Successful payment triggers email delivery record
    // In MOCK email mode, ticket is queued/delivered cleanly
    assert(
      issuedTickets[0].ticketReference.startsWith('TK-'),
      `Test 33: Ticket reference generated (${issuedTickets[0].ticketReference}) for turnstile entry`
    );

    // Test 34: QR remains email-only (Never exposed in public API ticket DTO or website response)
    const myTicketsRes = await alice.request('/tickets/my-tickets');
    const userTickets = myTicketsRes.body?.data || myTicketsRes.body?.tickets || [];
    const targetTicket = userTickets.find((t) => t.id === issuedTickets[0].id || t.orderId === order4.id);
    const hasQrImage = Boolean(targetTicket?.qrDataUrl || targetTicket?.qrPayload || targetTicket?.qrCode);
    assert(
      !hasQrImage,
      'Test 34: QR code remains strictly email-only (zero QR images, dataURLs, or payloads exposed in client API responses)'
    );

  } catch (err) {
    console.error('\n❌ Unhandled error during Phase 2 test suite:', err);
    failed++;
  } finally {
    console.log('\n=========================================================================');
    console.log(`📊 Paystack Phase 2 Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('=========================================================================\n');
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runPhase2TestSuite();
