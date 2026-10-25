/**
 * REGRESSION SUITE: Payment Checkout Flow & Cart Preservation
 * 
 * Tests the complete checkout, order creation, payment initialization,
 * failure recovery, retry without duplicate orders, cart persistence,
 * and strict PCI-DSS boundaries.
 */

import { PrismaClient } from '@prisma/client';
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

    const loginRes = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    this.user = loginRes.body?.user || res.body?.user;

    // Verify email directly in DB for checkout readiness
    if (this.user?.id) {
      await prisma.user.update({
        where: { id: this.user.id },
        data: { emailVerified: true }
      });
    }

    return this.user;
  }
}

async function runRegressionTests() {
  console.log('🧪 Running Payment Checkout & Cart Preservation Regression Suite...\n');
  let passed = 0;
  let failed = 0;

  function pass(msg) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  }

  function fail(msg, details = null) {
    console.error(`  ❌ [FAIL] ${msg}`);
    if (details) console.error('     Details:', details);
    failed++;
  }

  try {
    // 0. Ensure an active published event exists with inventory
    let testEvent = await prisma.event.findFirst({
      where: {
        status: 'PUBLISHED',
        isActive: true,
        ticketTypes: { some: { quantityAvailable: { gt: 10 } } }
      },
      include: { ticketTypes: true }
    });

    if (!testEvent) {
      const category = await prisma.category.findFirst();
      const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      testEvent = await prisma.event.create({
        data: {
          title: `Payment Flow Test Event ${Date.now()}`,
          slug: `payment-flow-event-${Date.now()}`,
          description: 'Testing payment flow end to end',
          venue: 'GrandWest Grand Arena',
          location: 'Cape Town',
          imageUrl: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14',
          organizerName: 'Event Organizer',
          status: 'PUBLISHED',
          isActive: true,
          categoryId: category.id,
          startDateTime: new Date(Date.now() + 86400000 * 30),
          organizerId: admin.id,
          ticketTypes: {
            create: [
              {
                name: 'VIP Golden Circle',
                priceMinor: 50000,
                currency: 'ZAR',
                quantityTotal: 100,
                quantityAvailable: 100,
                quantitySold: 0,
                quantityReserved: 0
              }
            ]
          }
        },
        include: { ticketTypes: true }
      });
    }

    const tier = testEvent.ticketTypes[0];

    // =========================================================================
    // TEST A: Successful order creation + successful payment initialization (Mock)
    // =========================================================================
    console.log('--- TEST A: Successful Order Creation + Payment Initialization ---');
    const clientA = new TestClient('ClientA');
    await clientA.registerAndLogin(`clienta.${Date.now()}@example.co.za`, 'Password123!', 'Client A');

    // 1. Reserve ticket
    const resA = await clientA.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tier.id, quantity: 2 })
    });
    if (resA.status === 201 && resA.body?.data?.reservation?.id) {
      pass('Reservation created successfully');
    } else {
      fail('Failed to create reservation', resA);
    }
    const reservationAId = resA.body.data.reservation.id;

    // 2. Create order
    const orderResA = await clientA.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [reservationAId],
        buyerDetails: {
          firstName: 'Client',
          lastName: 'A',
          email: 'clienta@example.co.za',
          paymentMethod: 'card'
        }
      })
    });
    if (orderResA.status === 201 && orderResA.body?.data?.order?.status === 'PENDING') {
      pass('Order created with status PENDING');
    } else {
      fail('Order creation failed', orderResA);
    }
    const orderA = orderResA.body.data.order;

    // Verify reservation converted in DB
    const dbResA = await prisma.reservation.findUnique({ where: { id: reservationAId } });
    if (dbResA.status === 'CONVERTED' && dbResA.orderId === orderA.id) {
      pass('Reservation atomically converted and linked to order');
    } else {
      fail('Reservation status not CONVERTED', dbResA);
    }

    // 3. Initialize payment with Mock provider
    setPaymentProviderInstance(new MockPaymentProvider());
    const payInitResA = await clientA.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: orderA.id })
    });
    if (payInitResA.status === 200 && payInitResA.body?.data?.reference) {
      pass(`Payment initialized with reference: ${payInitResA.body.data.reference}`);
    } else {
      fail('Payment initialization failed', payInitResA);
    }
    const referenceA = payInitResA.body.data.reference;

    // 4. Verify payment
    const verifyResA = await clientA.request(`/payments/verify/${referenceA}`);
    if (verifyResA.status === 200 && verifyResA.body?.data?.payment?.status === 'SUCCESS') {
      pass('Payment verified successfully; status = SUCCESS');
    } else {
      fail('Payment verification failed', verifyResA);
    }

    // 5. Confirm order is PAID and tickets issued
    const finalOrderA = await prisma.order.findUnique({
      where: { id: orderA.id },
      include: { tickets: true }
    });
    if (finalOrderA.status === 'PAID' && finalOrderA.tickets.length === 2) {
      pass(`Order transitioned to PAID with ${finalOrderA.tickets.length} tickets issued`);
    } else {
      fail('Final order state invalid', finalOrderA);
    }

    // =========================================================================
    // TEST B: Order creation + CURRENCY_NOT_SUPPORTED_BY_MERCHANT (Paystack Kenyan)
    // =========================================================================
    console.log('\n--- TEST B: Order Creation + Currency Rejection (HTTP 422) ---');
    const clientB = new TestClient('ClientB');
    await clientB.registerAndLogin(`clientb.${Date.now()}@example.co.za`, 'Password123!', 'Client B');

    // 1. Reserve ticket
    const resB = await clientB.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tier.id, quantity: 1 })
    });
    const reservationBId = resB.body.data.reservation.id;

    // 2. Create order
    const orderResB = await clientB.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [reservationBId],
        buyerDetails: { firstName: 'Client', lastName: 'B', email: 'clientb@example.co.za' }
      })
    });
    const orderB = orderResB.body.data.order;
    if (orderResB.status === 201 && orderB.currency === 'ZAR') {
      pass('ZAR order created successfully in PENDING status');
    } else {
      fail('ZAR order creation failed', orderResB);
    }

    // 3. Switch to Kenyan Paystack Provider
    setPaymentProviderInstance(new PaystackProvider({
      secretKey: 'sk_test_mock_kenya_secret',
      merchantCountry: 'KE',
      supportedCurrencies: ['KES', 'USD']
    }));

    const payInitResB = await clientB.request('/payments/initialize', {
      method: 'POST',
      headers: { 'x-payment-provider': 'PAYSTACK' },
      body: JSON.stringify({ orderId: orderB.id })
    });

    if (payInitResB.status === 422 && payInitResB.body?.code === 'CURRENCY_NOT_SUPPORTED_BY_MERCHANT') {
      pass('Paystack Kenyan merchant safely rejects ZAR with HTTP 422 CURRENCY_NOT_SUPPORTED_BY_MERCHANT');
    } else {
      fail('Expected HTTP 422 CURRENCY_NOT_SUPPORTED_BY_MERCHANT', payInitResB);
    }

    // 4. Verify PENDING order is still intact and not lost
    const checkOrderB = await prisma.order.findUnique({
      where: { id: orderB.id },
      include: { orderItems: true }
    });
    if (checkOrderB && checkOrderB.status === 'PENDING' && checkOrderB.orderItems.length === 1) {
      pass('PENDING order remains completely intact with order items preserved after 422 rejection');
    } else {
      fail('Order state was corrupted after payment failure', checkOrderB);
    }

    // =========================================================================
    // TEST C & E: Retry Payment On Existing PENDING Order (No Duplicate Orders!)
    // =========================================================================
    console.log('\n--- TEST C & E: Payment Retry On Existing PENDING Order ---');

    // Count user's orders before retry
    const initialOrdersCount = await prisma.order.count({ where: { userId: clientB.user.id } });

    // Client retries by switching/enabling a supported provider (e.g. Mock or SA merchant)
    setPaymentProviderInstance(new MockPaymentProvider());

    // CRITICAL TEST: Retry directly calls /api/payments/initialize with existing orderId
    const retryPayInitRes = await clientB.request('/payments/initialize', {
      method: 'POST',
      headers: { 'x-payment-provider': 'MOCK' },
      body: JSON.stringify({ orderId: orderB.id })
    });

    if (retryPayInitRes.status === 200 && retryPayInitRes.body?.data?.reference) {
      pass(`Payment successfully initialized on retry for existing order: ${retryPayInitRes.body.data.reference}`);
    } else {
      fail('Payment retry failed', retryPayInitRes);
    }

    // Verify NO duplicate orders were created
    const postRetryOrdersCount = await prisma.order.count({ where: { userId: clientB.user.id } });
    if (postRetryOrdersCount === initialOrdersCount) {
      pass('Zero duplicate orders created on payment retry (exactly 1 order in DB)');
    } else {
      fail(`Duplicate orders were created: before=${initialOrdersCount}, after=${postRetryOrdersCount}`);
    }

    // Verify order transitions to PAID on verification
    const retryVerify = await clientB.request(`/payments/verify/${retryPayInitRes.body.data.reference}`);
    if (retryVerify.status === 200 && retryVerify.body?.data?.payment?.status === 'SUCCESS') {
      pass('Retried order successfully completed and verified');
    } else {
      fail('Retried order verification failed', retryVerify);
    }

    // =========================================================================
    // TEST D: User Cancellation / Uncompleted Payment & Expiry Handling
    // =========================================================================
    console.log('\n--- TEST D: Uncompleted Payment & Order Expiration Safety ---');
    const clientD = new TestClient('ClientD');
    await clientD.registerAndLogin(`clientd.${Date.now()}@example.co.za`, 'Password123!', 'Client D');

    const resD = await clientD.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tier.id, quantity: 1 })
    });
    const reservationDId = resD.body.data.reservation.id;

    const orderResD = await clientD.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [reservationDId],
        buyerDetails: { firstName: 'Client', lastName: 'D', email: 'clientd@example.co.za' }
      })
    });
    const orderD = orderResD.body.data.order;

    // Simulate order expiry by artificially setting expiresAt to the past
    await prisma.order.update({
      where: { id: orderD.id },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });

    // Attempt payment initialization on expired order
    const expiredInitRes = await clientD.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ orderId: orderD.id })
    });

    if (expiredInitRes.status === 400 && expiredInitRes.body?.code === 'ORDER_EXPIRED') {
      pass('Backend strictly blocks payment initialization for expired orders (ORDER_EXPIRED)');
    } else {
      fail('Expected ORDER_EXPIRED for expired order', expiredInitRes);
    }

    // =========================================================================
    // TEST F: Cart Persistence / Recovery of Pending Orders
    // =========================================================================
    console.log('\n--- TEST F: Cart Persistence After Failed Initialization ---');
    const clientF = new TestClient('ClientF');
    await clientF.registerAndLogin(`clientf.${Date.now()}@example.co.za`, 'Password123!', 'Client F');

    const resF = await clientF.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tier.id, quantity: 2 })
    });
    const reservationFId = resF.body.data.reservation.id;

    const orderResF = await clientF.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [reservationFId],
        buyerDetails: { firstName: 'Client', lastName: 'F', email: 'clientf@example.co.za' }
      })
    });
    const orderF = orderResF.body.data.order;

    // Simulate payment initialization failure with unsupported currency
    setPaymentProviderInstance(new PaystackProvider({
      secretKey: 'sk_test_mock_kenya_secret',
      merchantCountry: 'KE',
      supportedCurrencies: ['KES']
    }));
    await clientF.request('/payments/initialize', {
      method: 'POST',
      headers: { 'x-payment-provider': 'PAYSTACK' },
      body: JSON.stringify({ orderId: orderF.id })
    });

    // Query user orders (as CartContext.refreshCart does when reservations is empty)
    const userOrdersRes = await clientF.request('/orders');
    const recoveredOrders = userOrdersRes.body?.data?.orders || [];
    const pendingOrder = recoveredOrders.find(
      (o) => (o.status === 'PENDING' || o.status === 'PAYMENT_PROCESSING') && new Date(o.expiresAt) > new Date()
    );

    if (pendingOrder && pendingOrder.id === orderF.id && pendingOrder.items.length === 1 && pendingOrder.items[0].quantity === 2) {
      pass('Unfulfilled PENDING order is successfully recovered via /api/orders with all ticket details');
    } else {
      fail('Failed to recover pending order for cart persistence', userOrdersRes);
    }

    // =========================================================================
    // TEST G: Strict PCI-DSS: Zero Card Data Allowed in EventPass APIs
    // =========================================================================
    console.log('\n--- TEST G: Strict PCI-DSS Zero Cardholder Data Enforcement ---');
    const clientG = new TestClient('ClientG');
    await clientG.registerAndLogin(`clientg.${Date.now()}@example.co.za`, 'Password123!', 'Client G');

    const resG = await clientG.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tier.id, quantity: 1 })
    });
    const reservationGId = resG.body.data.reservation.id;

    // 1. Attempt sending raw card details in buyerDetails
    const cardInOrderRes = await clientG.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [reservationGId],
        buyerDetails: {
          firstName: 'Attacker',
          cardNumber: '4111222233334444',
          cvv: '123',
          expiry: '12/28'
        }
      })
    });
    if (cardInOrderRes.status === 400) {
      pass('Order creation strictly rejects cardNumber/cvv/expiry with HTTP 400 via Zod .strict()');
    } else {
      fail('Expected HTTP 400 for cardholder data in orders', cardInOrderRes);
    }

    // 2. Attempt sending card details in /payments/initialize
    const cardInPayInitRes = await clientG.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({
        orderId: orderF.id,
        cardNumber: '4111222233334444',
        cvv: '123'
      })
    });
    if (cardInPayInitRes.status === 400) {
      pass('Payment initialization strictly rejects cardNumber/cvv with HTTP 400 via Zod .strict()');
    } else {
      fail('Expected HTTP 400 for cardholder data in payment initialization', cardInPayInitRes);
    }

    // Reset default mock provider for safety
    setPaymentProviderInstance(new MockPaymentProvider());

  } catch (err) {
    console.error('💥 Unexpected test error:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n==================================================');
  console.log(`📊 Payment Regression Suite: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTests();
