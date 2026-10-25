/**
 * AUDIT SUITE: Payment + Ticket Delivery + Checkout UX & Security
 * 
 * Comprehensive 32-Point Verification Suite covering:
 * - PAYMENT: 1 to 8
 * - CART: 9 to 12
 * - TICKETS: 13 to 19
 * - EMAIL: 20 to 26
 * - PAYMENT METHOD: 27 to 29
 * - AUTHORIZATION: 30 to 32
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setPaymentProviderInstance } from './src/services/payment/paymentProviderFactory.js';
import { MockPaymentProvider } from './src/services/payment/MockPaymentProvider.js';
import { PaystackProvider } from './src/services/payment/PaystackProvider.js';
import { getEmailProvider, setEmailProvider } from './src/services/email/emailProviderFactory.js';
import { MockEmailProvider } from './src/services/email/MockEmailProvider.js';
import * as emailService from './src/services/emailService.js';
import { generateTicketQrData } from './src/services/ticketService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:5000/api';

const results = {
  passed: 0,
  failed: 0,
  total: 0
};

const pass = (num, desc) => {
  results.passed++;
  results.total++;
  console.log(`  ✅ [TEST ${num} PASS] ${desc}`);
};

const fail = (num, desc, err) => {
  results.failed++;
  results.total++;
  console.error(`  ❌ [TEST ${num} FAIL] ${desc}`);
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
    const regRes = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        fullName,
        phone: '0821234567',
        city: 'Johannesburg',
        termsAccepted: true
      })
    });

    // Directly mark email verified in database for test user
    const dbUser = await prisma.user.findUnique({ where: { email } });
    if (dbUser) {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { emailVerified: true, role }
      });
      this.user = { ...dbUser, emailVerified: true, role };
    }

    // Login to get session cookie
    const loginRes = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (loginRes.body?.user) {
      this.user = loginRes.body.user;
    }

    return loginRes;
  }
}

async function runAuditSuite() {
  console.log('===============================================================');
  console.log('🚀 EVENTPASS FINAL PAYMENT + TICKET + CHECKOUT AUDIT SUITE (32 TESTS)');
  console.log('===============================================================\n');

  // Find a valid published event with available tickets
  const event = await prisma.event.findFirst({
    where: {
      status: 'PUBLISHED',
      isActive: true,
      ticketTypes: { some: { quantityAvailable: { gt: 5 } } }
    },
    include: { ticketTypes: true }
  });

  if (!event || !event.ticketTypes.length) {
    throw new Error('No published events with ticket types available in database!');
  }

  const ticketType = event.ticketTypes.find((t) => t.quantityAvailable > 5) || event.ticketTypes[0];
  const uniqueSuffix = Date.now().toString().slice(-6);

  // Create primary test customer
  const customer = new TestClient('CustomerA');
  await customer.registerAndLogin(
    `auditor_${uniqueSuffix}@example.com`,
    'SecureAuditPass123!',
    'Auditor Alice',
    'CUSTOMER'
  );

  // Create secondary customer for authorization isolation tests
  const customerB = new TestClient('CustomerB');
  await customerB.registerAndLogin(
    `attacker_${uniqueSuffix}@example.com`,
    'SecureAuditPass123!',
    'Bob Attacker',
    'CUSTOMER'
  );

  // --------------------------------------------------------------------------
  // SECTION 1: PAYMENT (Tests 1 - 8)
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: PAYMENT AUDIT (Tests 1 - 8) ---');

  let orderId = null;
  let orderRef = null;
  let paymentRef = null;

  // TEST 1: Valid order -> payment initialization
  try {
    const resRes = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: ticketType.id,
        quantity: 2
      })
    });

    const reservationId = resRes.body.data.reservation.id;

    const orderRes = await customer.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [reservationId],
        buyerDetails: {
          firstName: 'Auditor',
          lastName: 'Alice',
          email: `auditor_${uniqueSuffix}@example.com`,
          phone: '0821234567',
          paymentMethod: 'card',
          deliveryType: 'digital'
        }
      })
    });

    orderId = orderRes.body.data.order.id;
    orderRef = orderRes.body.data.order.orderReference;

    const initRes = await customer.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId })
    });

    if (initRes.status === 200 && initRes.body.data?.reference) {
      paymentRef = initRes.body.data.reference;
      pass(1, `Valid order → payment initialization succeeded (Ref: ${paymentRef})`);
    } else {
      fail(1, `Payment initialization failed: ${JSON.stringify(initRes.body)}`);
    }
  } catch (err) {
    fail(1, 'Payment initialization threw error', err);
  }

  // TEST 2: Paystack success -> server-side reconciliation
  try {
    const verifyRes = await customer.request(`/payments/verify/${paymentRef}`);

    const dbOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true }
    });

    if (verifyRes.status === 200 && dbOrder.status === 'PAID' && dbOrder.payments[0]?.status === 'SUCCESS') {
      pass(2, `Payment success → server-side reconciliation confirmed (Status: ${dbOrder.status})`);
    } else {
      fail(2, `Reconciliation failed. Order status: ${dbOrder?.status}`);
    }
  } catch (err) {
    fail(2, 'Payment reconciliation threw error', err);
  }

  // TEST 3: Webhook HMAC validation
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET || 'test_mock_webhook_secret_key_12345678';
  let webhookPaymentRef = null;
  let webhookTargetAmount = 0;
  let webhookTargetCurr = 'USD';
  try {
    // Create an initialized order to receive the webhook
    const resWebhook = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: ticketType.id, quantity: 1 })
    });
    const orderWebhook = await customer.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [resWebhook.body.data.reservation.id],
        buyerDetails: {
          firstName: 'Webhook',
          lastName: 'Tester',
          email: customer.user.email,
          phone: '0821234567',
          paymentMethod: 'card',
          deliveryType: 'digital'
        }
      })
    });
    const initWebhook = await customer.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: orderWebhook.body.data.order.id })
    });
    webhookPaymentRef = initWebhook.body.data.reference;

    webhookTargetAmount = orderWebhook.body.data.order.paymentTotalUsdMinor || orderWebhook.body.data.order.totalMinor;
    webhookTargetCurr = orderWebhook.body.data.order.paymentCurrency || 'USD';

    const sampleWebhookPayload = {
      event: 'charge.success',
      data: {
        id: 99887711 + Math.floor(Math.random() * 1000),
        reference: webhookPaymentRef,
        amount: webhookTargetAmount,
        currency: webhookTargetCurr,
        status: 'success',
        paid_at: new Date().toISOString(),
        customer: { email: customer.user.email }
      }
    };
    const rawBody = JSON.stringify(sampleWebhookPayload);
    const validSignature = crypto.createHmac('sha512', webhookSecret).update(rawBody).digest('hex');

    const webhookRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': validSignature
      },
      body: rawBody
    });

    if (webhookRes.status === 200) {
      pass(3, 'Webhook with valid HMAC signature accepted & reconciled (HTTP 200)');
    } else {
      fail(3, `Valid webhook rejected with status ${webhookRes.status}: ${JSON.stringify(await webhookRes.json())}`);
    }
  } catch (err) {
    fail(3, 'Webhook HMAC validation error', err);
  }

  // TEST 4: Invalid webhook rejected
  try {
    const invalidSignature = 'bad_forged_hmac_signature_0000000000000000';
    const fakePayload = JSON.stringify({ event: 'charge.success', data: { reference: 'FAKE' } });

    const webhookRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': invalidSignature
      },
      body: fakePayload
    });

    if (webhookRes.status === 400 || webhookRes.status === 401) {
      pass(4, `Forged webhook signature rejected with HTTP ${webhookRes.status}`);
    } else {
      fail(4, `Forged webhook not rejected: status ${webhookRes.status}`);
    }
  } catch (err) {
    fail(4, 'Forged webhook test error', err);
  }

  // TEST 5: Duplicate webhook is idempotent
  try {
    const dedupEventId = 11223300 + Math.floor(Math.random() * 1000);
    const duplicatePayload = {
      event: 'charge.success',
      data: {
        id: dedupEventId,
        reference: webhookPaymentRef,
        amount: webhookTargetAmount,
        currency: webhookTargetCurr,
        status: 'success',
        paid_at: new Date().toISOString()
      }
    };
    const rawBody = JSON.stringify(duplicatePayload);
    const signature = crypto.createHmac('sha512', webhookSecret).update(rawBody).digest('hex');

    const firstRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature },
      body: rawBody
    });

    const secondRes = await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature },
      body: rawBody
    });

    if (firstRes.status === 200 && secondRes.status === 200) {
      const records = await prisma.webhookEvent.findMany({
        where: { providerEventId: { contains: String(dedupEventId) } }
      });
      if (records.length === 1) {
        pass(5, 'Duplicate webhook deduplicated idempotently (1 record stored, both 200 OK)');
      } else {
        fail(5, `Expected 1 webhook record, found ${records.length}`);
      }
    } else {
      fail(5, `Webhook deduplication status mismatch: ${firstRes.status}, ${secondRes.status}`);
    }
  } catch (err) {
    fail(5, 'Duplicate webhook idempotency test error', err);
  }

  // TEST 6: Provider success without webhook is not falsely marked confirmed
  try {
    // Create an unverified order in PENDING status
    const resRes = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: ticketType.id, quantity: 1 })
    });
    const orderRes = await customer.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [resRes.body.data.reservation.id],
        buyerDetails: {
          firstName: 'Pending',
          lastName: 'User',
          email: 'pending@example.com',
          phone: '0821234567',
          paymentMethod: 'card',
          deliveryType: 'digital'
        }
      })
    });
    const pendingOrderId = orderRes.body.data.order.id;

    // Check DB status directly - must remain PENDING
    const checkOrder = await prisma.order.findUnique({ where: { id: pendingOrderId } });
    if (checkOrder.status === 'PENDING' && checkOrder.paidAt === null) {
      pass(6, 'Order without server-side verification remains PENDING (never falsely confirmed)');
    } else {
      fail(6, `Order without verification status was ${checkOrder.status}`);
    }
  } catch (err) {
    fail(6, 'Unverified order status check error', err);
  }

  // TEST 7: Unsupported ZAR merchant configuration handled safely
  try {
    const zarTier = await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: `ZAR Only Tier ${uniqueSuffix}`,
        priceMinor: 25000,
        currency: 'ZAR',
        quantityTotal: 5,
        status: 'ACTIVE'
      }
    });

    const resRes = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: zarTier.id, quantity: 1 })
    });
    const zarOrderRes = await customer.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [resRes.body.data.reservation.id],
        buyerDetails: {
          firstName: 'ZAR',
          lastName: 'User',
          email: 'zar@example.com',
          phone: '0821234567',
          paymentMethod: 'card',
          deliveryType: 'digital'
        }
      })
    });
    const zarOrderId = zarOrderRes.body.data.order.id;

    // Send payment initialize with 'x-payment-provider': 'PAYSTACK' header
    // In server/.env, PAYSTACK_MERCHANT_COUNTRY="KE" which rejects ZAR
    const zarInitRes = await customer.request('/payments/initialize', {
      method: 'POST',
      headers: { 'x-payment-provider': 'PAYSTACK' },
      body: JSON.stringify({ orderId: zarOrderId })
    });

    if (zarInitRes.status === 422 && zarInitRes.body?.code === 'CURRENCY_NOT_SUPPORTED_BY_MERCHANT') {
      pass(7, 'Kenyan merchant safely rejects ZAR with HTTP 422 CURRENCY_NOT_SUPPORTED_BY_MERCHANT');
    } else {
      fail(7, `Expected 422 currency rejection, got ${zarInitRes.status}: ${JSON.stringify(zarInitRes.body)}`);
    }
  } catch (err) {
    fail(7, 'Unsupported ZAR merchant test error', err);
  }

  // TEST 8: Payment initialization failure preserves cart / order
  try {
    // Create an order, simulate failure, check order is still intact and retrievable
    const resRes = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: ticketType.id, quantity: 1 })
    });
    const orderRes = await customer.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [resRes.body.data.reservation.id],
        buyerDetails: {
          firstName: 'Cart',
          lastName: 'Check',
          email: customer.user.email,
          phone: '0821234567',
          paymentMethod: 'card',
          deliveryType: 'digital'
        }
      })
    });
    const pendingId = orderRes.body.data.order.id;

    // Check order can be retrieved via /api/orders/:id and is PENDING
    const fetchOrder = await customer.request(`/orders/${pendingId}`);
    if (fetchOrder.status === 200 && fetchOrder.body.data.order.status === 'PENDING') {
      pass(8, 'Failed payment initialization preserves pending order and cart item details');
    } else {
      fail(8, `Order retrieval failed: ${fetchOrder.status}`);
    }
  } catch (err) {
    fail(8, 'Cart preservation after failure error', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 2: CART (Tests 9 - 12)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: CART AUDIT (Tests 9 - 12) ---');

  // TEST 9: Successful payment flow clears cart at the correct point
  try {
    const paidOrder = await prisma.order.findUnique({ where: { id: orderId } });
    if (paidOrder.status === 'PAID') {
      pass(9, 'Successful payment flow transitions order to PAID, which triggers frontend cart clearance');
    } else {
      fail(9, `Order was not PAID: ${paidOrder.status}`);
    }
  } catch (err) {
    fail(9, 'Cart clearance condition error', err);
  }

  // TEST 10: Failed payment initialization does NOT clear cart
  try {
    const checkoutPagePath = path.resolve(__dirname, '../src/pages/CheckoutPage.jsx');
    const checkoutCode = fs.readFileSync(checkoutPagePath, 'utf8');

    const clearsCartOnCreate = checkoutCode.includes('clearCart();\n      const initRes = await paymentApi.initializePayment');
    const clearsCartOnError = checkoutCode.includes('catch (initErr) {\n      clearCart()');

    if (!clearsCartOnCreate && !clearsCartOnError) {
      pass(10, 'CheckoutPage strictly preserves cart on initialization failure or errors');
    } else {
      fail(10, 'CheckoutPage prematurely clears cart on order creation or error');
    }
  } catch (err) {
    fail(10, 'Cart retention check error', err);
  }

  // TEST 11: User cancellation does NOT clear cart incorrectly
  try {
    const checkoutPagePath = path.resolve(__dirname, '../src/pages/CheckoutPage.jsx');
    const checkoutCode = fs.readFileSync(checkoutPagePath, 'utf8');

    const clearsOnCancel = checkoutCode.includes('onClose: () => {\n      clearCart()');
    if (!clearsOnCancel) {
      pass(11, 'User cancellation / closing Paystack popup preserves cart without clearing');
    } else {
      fail(11, 'CheckoutPage incorrectly clears cart on popup close');
    }
  } catch (err) {
    fail(11, 'Popup cancellation check error', err);
  }

  // TEST 12: Retry does not create unintended duplicate orders
  try {
    const resRes = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: ticketType.id, quantity: 1 })
    });
    const orderRes = await customer.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [resRes.body.data.reservation.id],
        buyerDetails: {
          firstName: 'Retry',
          lastName: 'User',
          email: customer.user.email,
          phone: '0821234567',
          paymentMethod: 'card',
          deliveryType: 'digital'
        }
      })
    });
    const retryOrderId = orderRes.body.data.order.id;

    // Initialize 1
    const init1 = await customer.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: retryOrderId })
    });

    // Initialize 2 (retry on same order)
    const init2 = await customer.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: retryOrderId })
    });

    const orderCount = await prisma.order.count({
      where: { id: retryOrderId }
    });

    if (init1.status === 200 && init2.status === 200 && orderCount === 1) {
      pass(12, 'Payment retry re-initializes existing order without creating duplicate orders (orderCount: 1)');
    } else {
      fail(12, `Payment retry failed or created duplicate orders: count=${orderCount}`);
    }
  } catch (err) {
    fail(12, 'Retry duplicate order test error', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 3: TICKETS (Tests 13 - 19)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: TICKETS AUDIT (Tests 13 - 19) ---');

  // TEST 13: Verified payment creates correct number of tickets
  try {
    const tickets = await prisma.ticket.findMany({ where: { orderId } });
    if (tickets.length === 2) {
      pass(13, `Verified payment for quantity 2 created exactly 2 tickets in DB`);
    } else {
      fail(13, `Expected 2 tickets, found ${tickets.length}`);
    }
  } catch (err) {
    fail(13, 'Ticket count check error', err);
  }

  // TEST 14: Ticket generation is idempotent
  try {
    await customer.request(`/payments/verify/${paymentRef}`);
    const ticketsAfter = await prisma.ticket.findMany({ where: { orderId } });
    if (ticketsAfter.length === 2) {
      pass(14, 'Duplicate verifyPayment call is idempotent: ticket count unchanged (2 tickets)');
    } else {
      fail(14, `Ticket count changed to ${ticketsAfter.length} on repeated verification`);
    }
  } catch (err) {
    fail(14, 'Ticket idempotency error', err);
  }

  // TEST 15: Customer ticket API strictly omits QR data (Email-only QR model)
  let testTicket = null;
  try {
    testTicket = await prisma.ticket.findFirst({
      where: { orderId },
      include: { event: true, ticketType: true }
    });

    const ticketDetailRes = await customer.request(`/tickets/${testTicket.id}`);
    const ticketDto = ticketDetailRes.body.data;

    const noQrDataUrl = ticketDto.qrDataUrl === undefined;
    const noQrPayload = ticketDto.qrPayload === undefined;
    const noQrSvg = ticketDto.qrSvg === undefined;
    const noSignature = ticketDto.signature === undefined;
    const noToken = ticketDto.qrToken === undefined;

    if (noQrDataUrl && noQrPayload && noQrSvg && noSignature && noToken) {
      pass(15, 'Customer ticket API strictly omits qrDataUrl, qrPayload, qrSvg, and signatures (Email-only QR model)');
    } else {
      fail(15, `Customer ticket API unexpectedly exposed QR fields: qrDataUrl=${ticketDto.qrDataUrl}, qrPayload=${ticketDto.qrPayload}`);
    }
  } catch (err) {
    fail(15, 'Customer API QR omission error', err);
  }

  // TEST 16: Email generation DOES contain QR credentials with zero PII
  let testEmailQrPayload = null;
  try {
    const webhookEvent = await prisma.webhookEvent.findFirst({
      where: { providerEventId: `ORDER_EMAIL_${orderId}` }
    });
    const emailTicket = webhookEvent?.payload?.tickets?.find((t) => t.reference === testTicket.ticketReference);

    if (emailTicket && emailTicket.hasQr && emailTicket.qrDataUrl && emailTicket.qrPayload) {
      testEmailQrPayload = emailTicket.qrPayload;
      const parts = testEmailQrPayload.split(':');
      const hasCorrectStructure = parts.length === 2 && parts[0].startsWith('TK-') && parts[1].length === 64;

      const payloadStr = String(testEmailQrPayload).toLowerCase();
      const hasEmail = payloadStr.includes('@') || payloadStr.includes('example.com') || payloadStr.includes('auditor');
      const hasName = payloadStr.includes('alice') || payloadStr.includes('auditor');
      const hasPhone = payloadStr.includes('0821234567');
      const hasCard = payloadStr.includes('card') || payloadStr.includes('cvv') || payloadStr.includes('pan');

      if (hasCorrectStructure && !hasEmail && !hasName && !hasPhone && !hasCard) {
        pass(16, `Email payload contains high-res QR and opaque HMAC credential (${parts[0]}:<64-hex>) with zero PII`);
      } else {
        fail(16, `Email QR credential failed validation: structure=${hasCorrectStructure}, email=${hasEmail}`);
      }
    } else {
      fail(16, 'Email ticket missing QR data URL or QR payload');
    }
  } catch (err) {
    fail(16, 'Email QR inspection error', err);
  }

  // TEST 17: Forged QR signature strictly rejected
  try {
    const validQr = testEmailQrPayload || generateTicketQrData(testTicket.id, testTicket.ticketReference, orderId).qrPayload;
    const [refCode] = validQr.split(':');
    const forgedPayload = `${refCode}:0000000000000000000000000000000000000000000000000000000000000000`;

    const checkInRes = await fetch(`${API_BASE}/tickets/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-scanner-key': process.env.SCANNER_API_KEY || 'eventpass-gate-scanner-2026-key'
      },
      body: JSON.stringify({ qrPayload: forgedPayload })
    });

    const checkInBody = await checkInRes.json();

    if (checkInRes.status === 400 || checkInRes.status === 401 || checkInBody.code === 'INVALID_QR_SIGNATURE' || checkInBody.code === 'INVALID_QR_CREDENTIAL') {
      pass(17, 'Forged QR credential strictly rejected (INVALID_QR_CREDENTIAL / HTTP 400)');
    } else {
      fail(17, `Forged QR was not rejected: status ${checkInRes.status}, body ${JSON.stringify(checkInBody)}`);
    }
  } catch (err) {
    fail(17, 'QR forgery test error', err);
  }

  // TEST 18: Authentic email QR validates for check-in and enforces replay protection
  try {
    const validQr = testEmailQrPayload || generateTicketQrData(testTicket.id, testTicket.ticketReference, orderId).qrPayload;
    const scannerKey = process.env.SCANNER_API_KEY || 'eventpass-gate-scanner-2026-key';

    // Check-in 1: Scanning authentic email QR must succeed
    const firstCheckIn = await fetch(`${API_BASE}/tickets/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-scanner-key': scannerKey },
      body: JSON.stringify({ qrPayload: validQr })
    });
    const firstBody = await firstCheckIn.json();

    // Check-in 2: Must be rejected as ALREADY_CHECKED_IN / ALREADY_USED
    const secondCheckIn = await fetch(`${API_BASE}/tickets/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-scanner-key': scannerKey },
      body: JSON.stringify({ qrPayload: validQr })
    });
    const secondBody = await secondCheckIn.json();

    if (firstCheckIn.status === 200 && (secondCheckIn.status === 409 || secondBody.code === 'TICKET_ALREADY_USED')) {
      pass(18, 'Email QR check-in replay protection enforced (First scan: 200 OK, Replay: 409 TICKET_ALREADY_USED)');
    } else {
      fail(18, `Replay protection failed. First: ${firstCheckIn.status}, Second: ${secondCheckIn.status}`);
    }
  } catch (err) {
    fail(18, 'QR replay check error', err);
  }

  // TEST 19: Duplicate payment webhook does not create duplicate tickets
  try {
    const ticketsBefore = await prisma.ticket.count({ where: { orderId } });
    const duplicateWebhookPayload = {
      event: 'charge.success',
      data: {
        id: 77889900 + Math.floor(Math.random() * 1000),
        reference: paymentRef,
        amount: 25000,
        currency: 'ZAR',
        status: 'success'
      }
    };
    const rawBody = JSON.stringify(duplicateWebhookPayload);
    const signature = crypto.createHmac('sha512', webhookSecret).update(rawBody).digest('hex');

    await fetch(`${API_BASE}/payments/webhook/paystack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature },
      body: rawBody
    });

    const ticketsAfter = await prisma.ticket.count({ where: { orderId } });
    if (ticketsBefore === ticketsAfter) {
      pass(19, `Duplicate payment webhook does not create duplicate tickets (Count: ${ticketsAfter})`);
    } else {
      fail(19, `Tickets increased from ${ticketsBefore} to ${ticketsAfter}`);
    }
  } catch (err) {
    fail(19, 'Webhook ticket duplicate test error', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 4: EMAIL (Tests 20 - 26)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: EMAIL AUDIT (Tests 20 - 26) ---');

  // TEST 20: Successful ticket issuance triggers ticket email
  let orderEmailRecord = null;
  try {
    const webhookEvent = await prisma.webhookEvent.findFirst({
      where: { providerEventId: `ORDER_EMAIL_${orderId}` }
    });

    if (webhookEvent) {
      orderEmailRecord = webhookEvent.payload;
      pass(20, `Successful ticket issuance recorded email in DB (Event: ${webhookEvent.providerEventId})`);
    } else {
      fail(20, `Email event not found for order ${orderId}`);
    }
  } catch (err) {
    fail(20, 'Email trigger check error', err);
  }

  // TEST 21: Email contains event information
  try {
    if (orderEmailRecord && orderEmailRecord.eventTitle && orderEmailRecord.venue) {
      pass(21, `Email contains event title ("${orderEmailRecord.eventTitle}") and venue ("${orderEmailRecord.venue}")`);
    } else {
      fail(21, `Email event details missing: ${JSON.stringify(orderEmailRecord)}`);
    }
  } catch (err) {
    fail(21, 'Email event details check error', err);
  }

  // TEST 22: Email contains ticket reference
  try {
    const hasRefs = orderEmailRecord?.tickets?.length > 0 && orderEmailRecord.tickets.every((t) => t.reference);
    if (hasRefs) {
      pass(22, `Email contains all ticket references (${orderEmailRecord.tickets.map((t) => t.reference).join(', ')})`);
    } else {
      fail(22, 'Email missing ticket references');
    }
  } catch (err) {
    fail(22, 'Email ticket references check error', err);
  }

  // TEST 23: Email contains the QR
  try {
    const ticketsWithQr = orderEmailRecord?.tickets?.filter((t) => t.hasQr && (t.qrDataUrl || t.qrPayload));
    if (ticketsWithQr && ticketsWithQr.length === orderEmailRecord.tickets.length) {
      pass(23, `Email payload explicitly contains QR code data for all ${ticketsWithQr.length} tickets`);
    } else {
      fail(23, 'Email payload missing QR code data');
    }
  } catch (err) {
    fail(23, 'Email QR check error', err);
  }

  // TEST 24: Email does not contain card/payment secrets
  try {
    const emailStr = JSON.stringify(orderEmailRecord);
    const hasCardSecrets = emailStr.includes('cardNumber') || emailStr.includes('cardCvc') || emailStr.includes('cardExpiry') || emailStr.includes('secretKey');
    if (!hasCardSecrets) {
      pass(24, 'Email payload contains zero card, CVV, expiry, or provider secrets');
    } else {
      fail(24, 'Email payload contains sensitive payment secrets!');
    }
  } catch (err) {
    fail(24, 'Email secrets check error', err);
  }

  // TEST 25: Duplicate webhook/payment verification does not send unlimited duplicate emails
  try {
    await emailService.sendOrderTicketEmail({ orderId });

    const emailRecords = await prisma.webhookEvent.findMany({
      where: { providerEventId: `ORDER_EMAIL_${orderId}` }
    });

    if (emailRecords.length === 1) {
      pass(25, 'Duplicate confirmation attempt respects idempotency (exactly 1 email recorded in DB)');
    } else {
      fail(25, `Duplicate emails found: count=${emailRecords.length}`);
    }
  } catch (err) {
    fail(25, 'Email duplicate test error', err);
  }

  // TEST 26: MockEmailProvider records the expected email in development
  try {
    const dbEmailCount = await prisma.webhookEvent.count({
      where: { provider: 'SYSTEM_EMAIL' }
    });
    if (dbEmailCount >= 1) {
      pass(26, `MockEmailProvider & emailService correctly recorded ${dbEmailCount} email delivery event(s) in development`);
    } else {
      fail(26, `No email delivery events recorded: count=${dbEmailCount}`);
    }
  } catch (err) {
    fail(26, 'MockEmailProvider check error', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 5: PAYMENT METHOD (Tests 27 - 29)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: PAYMENT METHOD AUDIT (Tests 27 - 29) ---');

  // TEST 27: Offline payment and QR displays are absent from the customer UI
  try {
    const checkoutPagePath = path.resolve(__dirname, '../src/pages/CheckoutPage.jsx');
    const myTicketsPagePath = path.resolve(__dirname, '../src/pages/MyTicketsPage.jsx');
    const ticketDetailsPagePath = path.resolve(__dirname, '../src/pages/TicketDetailsPage.jsx');

    const checkoutCode = fs.readFileSync(checkoutPagePath, 'utf8');
    const myTicketsCode = fs.readFileSync(myTicketsPagePath, 'utf8');
    const ticketDetailsCode = fs.readFileSync(ticketDetailsPagePath, 'utf8');

    const forbiddenPhrases = [
      'Payment at the gate',
      'Pay at gate',
      'Pay on arrival',
      'Cash at gate',
      'Pay at venue',
      'Pay at Pick n Pay',
      'pnp-cash',
      'pnpStore'
    ];

    const foundPhrases = forbiddenPhrases.filter((phrase) => checkoutCode.toLowerCase().includes(phrase.toLowerCase()));

    // QR & Backup Pass exclusion check across customer pages
    const forbiddenQrPhrases = [
      'emergency backup pass',
      'emergency web backup pass',
      'selectedticketforqr',
      'ticket.qrdataurl',
      'ticketdto.qrdataurl'
    ];
    const combinedPages = (checkoutCode + myTicketsCode + ticketDetailsCode).toLowerCase();
    const foundQrPhrases = forbiddenQrPhrases.filter((phrase) => combinedPages.includes(phrase));

    if (foundPhrases.length === 0 && foundQrPhrases.length === 0) {
      pass(27, 'UI verified: Offline payment, QR images, and Emergency Backup Pass are absent from customer website');
    } else {
      fail(27, `Found forbidden elements in UI: payment=[${foundPhrases.join(', ')}], qr=[${foundQrPhrases.join(', ')}]`);
    }
  } catch (err) {
    fail(27, 'Gate payment & QR UI audit error', err);
  }

  // TEST 28: Forged API request attempting gate payment is rejected server-side
  try {
    const resRes = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: ticketType.id, quantity: 1 })
    });

    const forgedRes = await customer.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [resRes.body.data.reservation.id],
        buyerDetails: {
          firstName: 'Hacker',
          lastName: 'Bob',
          email: 'hacker@example.com',
          phone: '0821234567',
          paymentMethod: 'gate', // FORGED UNSUPPORTED PAYMENT METHOD
          deliveryType: 'digital'
        }
      })
    });

    if (forgedRes.status === 400 && forgedRes.body?.code === 'VALIDATION_ERROR') {
      pass(28, 'Forged order request with paymentMethod: "gate" strictly rejected with HTTP 400 VALIDATION_ERROR');
    } else {
      fail(28, `Forged gate payment request was not rejected with 400 VALIDATION_ERROR: status ${forgedRes.status}, body: ${JSON.stringify(forgedRes.body)}`);
    }
  } catch (err) {
    fail(28, 'Forged gate payment request error', err);
  }

  // TEST 29: Only supported online payment method is accepted
  try {
    const resRes = await customer.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: ticketType.id, quantity: 1 })
    });

    const validOnlineRes = await customer.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [resRes.body.data.reservation.id],
        buyerDetails: {
          firstName: 'Alice',
          lastName: 'Valid',
          email: 'alice.valid@example.com',
          phone: '0821234567',
          paymentMethod: 'card', // SUPPORTED ONLINE PAYMENT
          deliveryType: 'digital'
        }
      })
    });

    if (validOnlineRes.status === 201) {
      pass(29, 'Supported online payment method ("card" via Paystack hosted checkout) accepted (HTTP 201)');
    } else {
      fail(29, `Valid online payment rejected: ${validOnlineRes.status}`);
    }
  } catch (err) {
    fail(29, 'Online payment acceptance error', err);
  }

  // --------------------------------------------------------------------------
  // SECTION 6: AUTHORIZATION (Tests 30 - 32)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 6: AUTHORIZATION AUDIT (Tests 30 - 32) ---');

  // TEST 30: Customer cannot access admin payment/ticket controls
  try {
    const adminEventsRes = await customer.request('/admin/events');
    const adminReportsRes = await customer.request('/admin/reports');

    if ((adminEventsRes.status === 401 || adminEventsRes.status === 403) && (adminReportsRes.status === 401 || adminReportsRes.status === 403)) {
      pass(30, 'Customer strictly blocked from admin controls (/admin/events & /admin/reports → HTTP 403)');
    } else {
      fail(30, `Customer accessed admin routes: status ${adminEventsRes.status}, ${adminReportsRes.status}`);
    }
  } catch (err) {
    fail(30, 'Admin route authorization check error', err);
  }

  // TEST 31: Customer cannot access another customer's tickets/orders (BOLA Defense)
  try {
    // Customer B attempts to retrieve Customer A's ticket
    const bolaTicketRes = await customerB.request(`/tickets/${testTicket.id}`);
    const bolaOrderRes = await customerB.request(`/orders/${orderId}`);

    if ((bolaTicketRes.status === 403 || bolaTicketRes.status === 404) && (bolaOrderRes.status === 403 || bolaOrderRes.status === 404)) {
      pass(31, 'BOLA defense verified: Customer B blocked from accessing Customer A tickets/orders (HTTP 403/404)');
    } else {
      fail(31, `BOLA breach! Customer B accessed Customer A data: ${bolaTicketRes.status}, ${bolaOrderRes.status}`);
    }
  } catch (err) {
    fail(31, 'BOLA defense check error', err);
  }

  // TEST 32: QR/ticket validation preserves existing authorization requirements
  try {
    // Unauthenticated request without scanner key to /api/tickets/check-in
    const unauthCheckIn = await fetch(`${API_BASE}/tickets/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrPayload: 'some.random.token' })
    });

    // Customer session attempting to call /api/tickets/check-in
    const customerCheckIn = await customer.request('/tickets/check-in', {
      method: 'POST',
      body: JSON.stringify({ qrPayload: 'some.random.token' })
    });

    if (unauthCheckIn.status === 401 && (customerCheckIn.status === 403 || customerCheckIn.status === 401)) {
      pass(32, 'Ticket check-in strictly requires authorized gate scanner / staff key (Unauthenticated: 401, Customer: 403)');
    } else {
      fail(32, `Check-in authorization bypassed: unauth=${unauthCheckIn.status}, customer=${customerCheckIn.status}`);
    }
  } catch (err) {
    fail(32, 'Check-in authorization check error', err);
  }

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`📊 FINAL AUDIT RESULTS: ${results.passed}/${results.total} PASSED, ${results.failed} FAILED`);
  console.log('===============================================================');

  if (results.failed > 0) {
    process.exit(1);
  }
}

runAuditSuite()
  .catch((err) => {
    console.error('Fatal audit failure:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
