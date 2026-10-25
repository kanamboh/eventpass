/**
 * EventPass - Step 4 Security Hardening & Invariant Test Suite
 * OWASP ASVS Level 2 / OWASP API Top 10 Security & Database Invariants Audit
 */

import { PrismaClient } from '@prisma/client';

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
      body: JSON.stringify({
        email,
        password
      })
    });

    if (loginRes.status !== 200) {
      throw new Error(`Failed to login ${this.name}: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
    }

    this.user = loginRes.body?.user || loginRes.body?.data?.user;
    return this.user;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runSecurityAudit() {
  console.log('🔒 Starting EventPass Step 4 Security & Invariant Audit...\n');

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

  try {
    // Setup authenticated users
    const alice = new TestClient('Alice');
    const bob = new TestClient('Bob');

    await alice.registerAndLogin(`alice_sec_${timestamp}@test.co.za`, 'Secret123#Pass', 'Alice Security');
    await bob.registerAndLogin(`bob_sec_${timestamp}@test.co.za`, 'Secret123#Pass', 'Bob Security');

    const testEvent = await prisma.event.findFirst({
      where: { status: 'PUBLISHED' }
    });

    // Create a dedicated ticket tier for invariant testing
    const testTier = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: `Security Tier ${timestamp}`,
        priceMinor: 15000, // R150.00
        currency: 'ZAR',
        quantityTotal: 10,
        quantitySold: 0,
        quantityReserved: 0,
        status: 'ACTIVE',
        maxPerOrder: 5
      }
    });

    // =========================================================================
    // INVARIANT 1: quantitySold + activeReserved <= quantityTotal
    // =========================================================================
    console.log('\n--- Invariant 1: Total Inventory Non-Overselling Guarantee ---');
    const resA = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: testTier.id, quantity: 4 })
    });
    assert(resA.status === 201, 'Alice reserves 4 tickets on tier');

    const dbTier1 = await prisma.ticketType.findUnique({ where: { id: testTier.id } });
    assert(
      dbTier1.quantitySold + dbTier1.quantityReserved <= dbTier1.quantityTotal,
      `Invariant 1 holds: ${dbTier1.quantitySold} (sold) + ${dbTier1.quantityReserved} (reserved) <= ${dbTier1.quantityTotal} (total)`
    );

    // =========================================================================
    // INVARIANT 2: quantityReserved == sum(active unexpired reservations)
    // =========================================================================
    console.log('\n--- Invariant 2: quantityReserved strictly matches SUM(active unexpired holds) ---');
    const activeSumResult1 = await prisma.$queryRaw`
      SELECT COALESCE(SUM(quantity), 0)::int as "sum"
      FROM reservations
      WHERE "ticketTypeId" = ${testTier.id}::uuid
        AND status = 'ACTIVE'::"ReservationStatus"
        AND "expiresAt" > NOW()
    `;
    assert(
      dbTier1.quantityReserved === activeSumResult1[0].sum,
      `Invariant 2 holds after creation: DB quantityReserved (${dbTier1.quantityReserved}) == active hold sum (${activeSumResult1[0].sum})`
    );

    // =========================================================================
    // INVARIANT 3 & 4: Reservation Order Exclusivity & Double-Conversion Defense
    // =========================================================================
    console.log('\n--- Invariant 3 & 4: Single-Order Conversion & Anti-Double-Spend ---');
    const resIdA = resA.body.data.reservation.id;

    // First order conversion
    const orderRes1 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [resIdA] })
    });
    assert(orderRes1.status === 201, 'Order created successfully from reservation (status 201)');

    // Verify reservation status in DB is CONVERTED
    const dbResA = await prisma.reservation.findUnique({ where: { id: resIdA } });
    assert(dbResA.status === 'CONVERTED' && dbResA.orderId === orderRes1.body.data.order.id, 'Reservation status transitioned to CONVERTED and orderId bound');

    // Attempt second conversion of the same reservation
    const orderRes2 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [resIdA] })
    });
    assert(
      orderRes2.status === 409 && orderRes2.body.code === 'RESERVATION_ALREADY_CONVERTED',
      'Invariant 4 holds: Second conversion attempt strictly rejected with 409 RESERVATION_ALREADY_CONVERTED'
    );

    // Verify Invariant 2 after order conversion: quantityReserved must have decreased by 4!
    const dbTierAfterOrder = await prisma.ticketType.findUnique({ where: { id: testTier.id } });
    const activeSumResult2 = await prisma.$queryRaw`
      SELECT COALESCE(SUM(quantity), 0)::int as "sum"
      FROM reservations
      WHERE "ticketTypeId" = ${testTier.id}::uuid
        AND status = 'ACTIVE'::"ReservationStatus"
        AND "expiresAt" > NOW()
    `;
    assert(
      dbTierAfterOrder.quantityReserved === activeSumResult2[0].sum && dbTierAfterOrder.quantityReserved === 0,
      `Invariant 2 holds after order conversion: DB quantityReserved (${dbTierAfterOrder.quantityReserved}) == active hold sum (${activeSumResult2[0].sum})`
    );

    // =========================================================================
    // =========================================================================
    // INVARIANT 5: Cancelled & Expired Reservations Cannot Create Orders
    // =========================================================================
    console.log('\n--- Invariant 5: Cancelled / Expired Reservation Order Blocking ---');
    // Create reservation for Bob then cancel it
    const resBob = await bob.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: testTier.id, quantity: 2 })
    });
    const resBobId = resBob.body.data.reservation.id;

    const cancelRes = await bob.request(`/reservations/${resBobId}`, { method: 'DELETE' });
    assert(cancelRes.status === 200, 'Bob cancels reservation successfully');

    // Invariant check after cancellation
    const dbTierAfterCancel = await prisma.ticketType.findUnique({ where: { id: testTier.id } });
    const activeSumAfterCancel = await prisma.$queryRaw`
      SELECT COALESCE(SUM(quantity), 0)::int as "sum"
      FROM reservations
      WHERE "ticketTypeId" = ${testTier.id}::uuid
        AND status = 'ACTIVE'::"ReservationStatus"
        AND "expiresAt" > NOW()
    `;
    assert(
      (dbTierAfterCancel.quantitySold + dbTierAfterCancel.quantityReserved) <= dbTierAfterCancel.quantityTotal &&
      dbTierAfterCancel.quantityReserved === activeSumAfterCancel[0].sum,
      `Invariant holds after cancellation: quantitySold (${dbTierAfterCancel.quantitySold}) + quantityReserved (${dbTierAfterCancel.quantityReserved}) <= total, quantityReserved == active sum (${activeSumAfterCancel[0].sum})`
    );

    // Bob attempts to create order using cancelled reservation
    const bobOrderFromCancelled = await bob.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [resBobId] })
    });
    assert(
      bobOrderFromCancelled.status === 400 && bobOrderFromCancelled.body.code === 'RESERVATION_CANCELLED',
      'Order creation using CANCELLED reservation rejected with 400 RESERVATION_CANCELLED'
    );

    // Directly create an expired reservation in DB for Bob
    const expiredRes = await prisma.reservation.create({
      data: {
        userId: bob.user.id,
        sessionId: bob.user.id,
        ticketTypeId: testTier.id,
        quantity: 1,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 60000) // 1 minute ago
      }
    });

    const bobOrderFromExpired = await bob.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [expiredRes.id] })
    });
    assert(
      bobOrderFromExpired.status === 409 && bobOrderFromExpired.body.code === 'RESERVATION_EXPIRED',
      'Order creation using EXPIRED reservation rejected with 409 RESERVATION_EXPIRED'
    );

    // Invariant check after expiration
    const dbTierAfterExpire = await prisma.ticketType.findUnique({ where: { id: testTier.id } });
    const activeSumAfterExpire = await prisma.$queryRaw`
      SELECT COALESCE(SUM(quantity), 0)::int as "sum"
      FROM reservations
      WHERE "ticketTypeId" = ${testTier.id}::uuid
        AND status = 'ACTIVE'::"ReservationStatus"
        AND "expiresAt" > NOW()
    `;
    assert(
      (dbTierAfterExpire.quantitySold + dbTierAfterExpire.quantityReserved) <= dbTierAfterExpire.quantityTotal &&
      dbTierAfterExpire.quantityReserved === activeSumAfterExpire[0].sum,
      `Invariant holds after expiration: quantitySold (${dbTierAfterExpire.quantitySold}) + quantityReserved (${dbTierAfterExpire.quantityReserved}) <= total, quantityReserved == active sum (${activeSumAfterExpire[0].sum})`
    );

    // Invariant check after failed transaction / rollback
    console.log('\n--- Invariant Check: Rollback Integrity after Failed Transaction ---');
    const failedTxRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: testTier.id, quantity: 1 })
    });
    const failedTxResId = failedTxRes.body.data.reservation.id;

    // Alice attempts order with her valid reservation AND a non-existent reservation UUID
    const failedTxOrder = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [failedTxResId, '00000000-0000-0000-0000-000000000000']
      })
    });
    assert(failedTxOrder.status === 403, 'Order transaction with invalid reservation fails and rolls back (HTTP 403)');

    const dbTierAfterFailedTx = await prisma.ticketType.findUnique({ where: { id: testTier.id } });
    const activeSumAfterFailedTx = await prisma.$queryRaw`
      SELECT COALESCE(SUM(quantity), 0)::int as "sum"
      FROM reservations
      WHERE "ticketTypeId" = ${testTier.id}::uuid
        AND status = 'ACTIVE'::"ReservationStatus"
        AND "expiresAt" > NOW()
    `;
    assert(
      (dbTierAfterFailedTx.quantitySold + dbTierAfterFailedTx.quantityReserved) <= dbTierAfterFailedTx.quantityTotal &&
      dbTierAfterFailedTx.quantityReserved === activeSumAfterFailedTx[0].sum,
      `Invariant holds after failed transaction: quantityReserved (${dbTierAfterFailedTx.quantityReserved}) == active sum (${activeSumAfterFailedTx[0].sum})`
    );

    // Clean up Alice's failedTx reservation so testTier is clean
    await alice.request(`/reservations/${failedTxResId}`, { method: 'DELETE' });

    // =========================================================================
    // INVARIANT 6: BOLA / IDOR Cross-Customer Protection
    // =========================================================================
    console.log('\n--- Invariant 6: BOLA / IDOR Complete Authorization Isolation ---');
    // Alice creates fresh reservation
    const aliceFreshRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: testTier.id, quantity: 2 })
    });
    const aliceFreshResId = aliceFreshRes.body.data.reservation.id;

    // Bob attempts to view Alice's reservation
    const bobGetAliceRes = await bob.request(`/reservations/${aliceFreshResId}`);
    assert(bobGetAliceRes.status === 403, 'Bob cannot view Alice reservation (HTTP 403 FORBIDDEN)');

    // Bob attempts to cancel Alice's reservation
    const bobCancelAliceRes = await bob.request(`/reservations/${aliceFreshResId}`, { method: 'DELETE' });
    assert(bobCancelAliceRes.status === 403, 'Bob cannot cancel Alice reservation (HTTP 403 FORBIDDEN)');

    // Bob attempts to checkout / convert Alice's reservation
    const bobOrderAliceRes = await bob.request('/orders', {
      method: 'POST',
      body: JSON.stringify({ reservationIds: [aliceFreshResId] })
    });
    assert(
      bobOrderAliceRes.status === 403 && bobOrderAliceRes.body.code === 'RESERVATION_ACCESS_DENIED',
      'Bob cannot convert Alice reservation into an order (HTTP 403 RESERVATION_ACCESS_DENIED)'
    );

    // Bob attempts to view Alice's order
    const aliceOrderId = orderRes1.body.data.order.id;
    const bobGetAliceOrder = await bob.request(`/orders/${aliceOrderId}`);
    assert(bobGetAliceOrder.status === 403, 'Bob cannot view Alice order (HTTP 403 FORBIDDEN)');

    // =========================================================================
    // INVARIANT 7 & 9: Mass Assignment & Financial Tampering Defense
    // =========================================================================
    console.log('\n--- Invariant 7 & 9: Mass Assignment & Financial Tampering Defense ---');
    // Attempt reservation with mass assignment
    const massAssignRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: testTier.id,
        quantity: 1,
        userId: bob.user.id,
        status: 'PAID',
        role: 'ADMIN',
        priceMinor: 1,
        quantityReserved: 999999
      })
    });
    assert(
      massAssignRes.status === 201 &&
        massAssignRes.body.data.reservation.userId === alice.user.id &&
        massAssignRes.body.data.reservation.unitPriceMinor === testTier.priceMinor,
      'Reservation mass assignment fields ignored; authenticated user and DB price strictly preserved'
    );

    // Attempt order creation with client-supplied financial fields & spoofed userId
    const orderTamperRes = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [aliceFreshResId],
        price: 1,
        subtotal: 1,
        total: 1,
        currency: 'USD',
        status: 'PAID',
        userId: bob.user.id
      })
    });
    assert(
      orderTamperRes.status === 201 &&
        orderTamperRes.body.data.order.status === 'PENDING' &&
        orderTamperRes.body.data.order.currency === 'ZAR' &&
        orderTamperRes.body.data.order.subtotalMinor === testTier.priceMinor * 2,
      'Order financial tampering ignored; server calculated subtotal and PENDING status strictly preserved'
    );

    // =========================================================================
    // INVARIANT 8: Idempotency Guarantees & Replay Safety
    // =========================================================================
    console.log('\n--- Invariant 8: Database-Backed Idempotency & Conflict Safety ---');
    const idempKey = `idemp_${timestamp}`;

    // Create fresh active reservation for idempotency test
    const aliceIdempRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: testTier.id, quantity: 1 })
    });
    const aliceIdempResId = aliceIdempRes.body.data.reservation.id;
    
    // First attempt with key
    const idempAttempt1 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [aliceIdempResId],
        idempotencyKey: idempKey
      })
    });
    assert(idempAttempt1.status === 201, 'First order with idempotency key succeeds (status 201)');

    // Second attempt with exact same key and same data -> idempotent replay
    const idempAttempt2 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [aliceIdempResId],
        idempotencyKey: idempKey
      })
    });
    assert(
      idempAttempt2.status === 201 && idempAttempt2.body.data.order.id === idempAttempt1.body.data.order.id,
      'Same idempotency key + same parameters returns exact same order without duplicates'
    );

    // Third attempt: Same key with DIFFERENT reservation data
    const aliceResAnother = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: testTier.id, quantity: 1 })
    });
    const diffResId = aliceResAnother.body.data.reservation.id;

    const idempMismatchAttempt = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [diffResId],
        idempotencyKey: idempKey
      })
    });
    assert(
      idempMismatchAttempt.status === 409 && idempMismatchAttempt.body.code === 'IDEMPOTENCY_KEY_MISMATCH',
      'Same idempotency key with different order parameters strictly rejected with 409 IDEMPOTENCY_KEY_MISMATCH'
    );

    // =========================================================================
    // SECTION 1 AUDIT: PostgreSQL Idempotency Matrix (NULL vs Key vs Multi-User)
    // A. User A + idempotencyKey = NULL
    // B. User A + idempotencyKey = NULL -> Both create separate orders
    // C. User A + key = "KEY-1"
    // D. User A + key = "KEY-1" -> Only one logical order exists (idempotent replay)
    // E. User B + key = "KEY-1" -> Allowed because uniqueness is scoped to user
    // =========================================================================
    console.log('\n--- Section 1: PostgreSQL Idempotency Matrix (NULL vs Key vs Multi-User) ---');
    const idempMatrixTier = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: `Idempotency Matrix Tier ${timestamp}`,
        priceMinor: 5000,
        currency: 'ZAR',
        quantityTotal: 50,
        quantitySold: 0,
        quantityReserved: 0,
        status: 'ACTIVE',
        maxPerOrder: 5
      }
    });

    // A. User A + idempotencyKey = NULL
    const matrixResA1 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: idempMatrixTier.id, quantity: 1 })
    });
    const matrixOrderA1 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [matrixResA1.body.data.reservation.id]
      })
    });
    assert(
      matrixOrderA1.status === 201 && matrixOrderA1.body.data.order.id,
      'A: User A + idempotencyKey = NULL creates first order (HTTP 201)'
    );

    // B. User A + idempotencyKey = NULL
    const matrixResA2 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: idempMatrixTier.id, quantity: 1 })
    });
    const matrixOrderA2 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [matrixResA2.body.data.reservation.id]
      })
    });
    assert(
      matrixOrderA2.status === 201 && matrixOrderA2.body.data.order.id !== matrixOrderA1.body.data.order.id,
      'B: User A + idempotencyKey = NULL creates second separate order (both allowed, separate IDs)'
    );

    // C. User A + key = "KEY-1"
    const staticKey1 = `KEY-1-${timestamp}`;
    const matrixResA3 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: idempMatrixTier.id, quantity: 1 })
    });
    const matrixOrderC = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [matrixResA3.body.data.reservation.id],
        idempotencyKey: staticKey1
      })
    });
    assert(
      matrixOrderC.status === 201 && matrixOrderC.body.data.order.id,
      'C: User A + key = "KEY-1" creates logical order C (HTTP 201)'
    );

    // D. User A + key = "KEY-1"
    const matrixOrderD = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [matrixResA3.body.data.reservation.id],
        idempotencyKey: staticKey1
      })
    });
    assert(
      matrixOrderD.status === 201 && matrixOrderD.body.data.order.id === matrixOrderC.body.data.order.id,
      'D: User A + key = "KEY-1" replays exact order C (only one logical order exists)'
    );

    // E. User B + key = "KEY-1"
    const matrixResB1 = await bob.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: idempMatrixTier.id, quantity: 1 })
    });
    const matrixOrderE = await bob.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [matrixResB1.body.data.reservation.id],
        idempotencyKey: staticKey1
      })
    });
    assert(
      matrixOrderE.status === 201 && matrixOrderE.body.data.order.id !== matrixOrderC.body.data.order.id,
      'E: User B + key = "KEY-1" succeeds with new order (idempotency uniqueness is scoped per user)'
    );

    // =========================================================================
    // SAME-RESERVATION CONCURRENT DOUBLE-SPEND RACE TEST
    // =========================================================================
    console.log('\n--- Concurrency Attack 1: Same-Reservation Simultaneous Double-Spend ---');
    // Prepare a fresh reservation for Bob
    const bobDoubleSpendRes = await bob.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: testTier.id, quantity: 1 })
    });
    const doubleSpendResId = bobDoubleSpendRes.body.data.reservation.id;

    // Fire 2 simultaneous order creation requests with the same reservation
    const [orderAttemptA, orderAttemptB] = await Promise.all([
      bob.request('/orders', {
        method: 'POST',
        body: JSON.stringify({ reservationIds: [doubleSpendResId] })
      }),
      bob.request('/orders', {
        method: 'POST',
        body: JSON.stringify({ reservationIds: [doubleSpendResId] })
      })
    ]);

    const successes = [orderAttemptA, orderAttemptB].filter((r) => r.status === 201);
    const conflicts = [orderAttemptA, orderAttemptB].filter((r) => r.status === 409);

    assert(
      successes.length === 1 && conflicts.length === 1,
      `Concurrent double-spend serialized: exactly 1 succeeded (status 201), 1 rejected (status 409 ${conflicts[0]?.body?.code})`
    );

    // Invariant check after concurrent order conversion
    const dbTierAfterConcurrentOrder = await prisma.ticketType.findUnique({ where: { id: testTier.id } });
    const activeSumAfterConcurrentOrder = await prisma.$queryRaw`
      SELECT COALESCE(SUM(quantity), 0)::int as "sum"
      FROM reservations
      WHERE "ticketTypeId" = ${testTier.id}::uuid
        AND status = 'ACTIVE'::"ReservationStatus"
        AND "expiresAt" > NOW()
    `;
    assert(
      (dbTierAfterConcurrentOrder.quantitySold + dbTierAfterConcurrentOrder.quantityReserved) <= dbTierAfterConcurrentOrder.quantityTotal &&
      dbTierAfterConcurrentOrder.quantityReserved === activeSumAfterConcurrentOrder[0].sum,
      `Invariant holds after concurrent order conversion: quantityReserved (${dbTierAfterConcurrentOrder.quantityReserved}) == active sum (${activeSumAfterConcurrentOrder[0].sum})`
    );

    // =========================================================================
    // CONCURRENT OVERSELLING ATTACK TEST
    // =========================================================================
    console.log('\n--- Concurrency Attack 2: 10 Simultaneous Requests against 5 Total Inventory ---');
    const oversellTier = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: `Oversell Defense Tier ${timestamp}`,
        priceMinor: 20000,
        currency: 'ZAR',
        quantityTotal: 5,
        quantitySold: 0,
        quantityReserved: 0,
        status: 'ACTIVE',
        maxPerOrder: 5
      }
    });

    const concurrentUsers = [];
    for (let i = 0; i < 10; i++) {
      const u = new TestClient(`ConcurrentUser_${i}`);
      await u.registerAndLogin(`oversell_u${i}_${timestamp}@test.co.za`, 'Secret123#Pass', `Oversell User ${i}`);
      concurrentUsers.push(u);
    }

    const concurrentResults = await Promise.all(
      concurrentUsers.map((u) =>
        u.request('/reservations', {
          method: 'POST',
          body: JSON.stringify({ ticketTypeId: oversellTier.id, quantity: 1 })
        })
      )
    );

    const oversellSuccess = concurrentResults.filter((r) => r.status === 201);
    const oversellConflict = concurrentResults.filter((r) => r.status === 409);

    const dbOversellTier = await prisma.ticketType.findUnique({ where: { id: oversellTier.id } });
    assert(
      oversellSuccess.length === 5 && oversellConflict.length === 5,
      `Oversell defense: Exactly 5 reservations succeeded (HTTP 201), exactly 5 received 409 conflict`
    );
    assert(
      dbOversellTier.quantityReserved <= dbOversellTier.quantityTotal && dbOversellTier.quantityReserved === 5,
      `DB inventory integrity: DB quantityReserved (${dbOversellTier.quantityReserved}) <= quantityTotal (${dbOversellTier.quantityTotal})`
    );

    const activeSumOversell = await prisma.$queryRaw`
      SELECT COALESCE(SUM(quantity), 0)::int as "sum"
      FROM reservations
      WHERE "ticketTypeId" = ${oversellTier.id}::uuid
        AND status = 'ACTIVE'::"ReservationStatus"
        AND "expiresAt" > NOW()
    `;
    assert(
      (dbOversellTier.quantitySold + dbOversellTier.quantityReserved) <= dbOversellTier.quantityTotal &&
      dbOversellTier.quantityReserved === activeSumOversell[0].sum,
      `Invariant holds after concurrent reservation: quantitySold (${dbOversellTier.quantitySold}) + quantityReserved (${dbOversellTier.quantityReserved}) <= total, quantityReserved == active sum (${activeSumOversell[0].sum})`
    );

    // =========================================================================
    // INVENTORY HOARDING ABUSE CONTROLS
    // =========================================================================
    console.log('\n--- Anti-Abuse: Per-User Active Hold Limitation (Max 20 Tickets) ---');
    // Alice already holds some tickets. Let's create an event tier with large capacity.
    const largeTier = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: `Hoarding Test Tier ${timestamp}`,
        priceMinor: 1000,
        currency: 'ZAR',
        quantityTotal: 100,
        quantitySold: 0,
        quantityReserved: 0,
        status: 'ACTIVE',
        maxPerOrder: 10
      }
    });

    const hoarder = new TestClient('Hoarder');
    await hoarder.registerAndLogin(`hoarder_${timestamp}@test.co.za`, 'Secret123#Pass', 'Hoarder Account');

    // Make 2 reservations of 10 tickets each (total 20)
    const hold1 = await hoarder.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: largeTier.id, quantity: 10 })
    });
    const hold2 = await hoarder.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: largeTier.id, quantity: 10 })
    });
    assert(hold1.status === 201 && hold2.status === 201, 'User reserves up to limit (20 tickets across 2 requests)');

    // Attempt 3rd reservation (exceeds 20 tickets hold limit)
    const holdExceeded = await hoarder.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: largeTier.id, quantity: 1 })
    });
    assert(
      holdExceeded.status === 400 && holdExceeded.body.code === 'ACTIVE_RESERVATIONS_LIMIT_EXCEEDED',
      'Excessive reservation hoard attempt rejected with 400 ACTIVE_RESERVATIONS_LIMIT_EXCEEDED'
    );

    // =========================================================================
    // SECTION 5 AUDIT: STATE-MACHINE AUDIT & TRANSITION INVARIANTS
    // Legal transitions verified:
    //   ACTIVE -> CANCELLED (HTTP 200 via DELETE /reservations/:id)
    //   ACTIVE -> EXPIRED (when expiresAt <= NOW())
    //   ACTIVE -> CONVERTED (HTTP 201 via POST /orders)
    // Illegal transitions strictly rejected:
    //   EXPIRED -> CANCELLED (HTTP 400 RESERVATION_EXPIRED)
    //   CONVERTED -> CANCELLED (HTTP 400 RESERVATION_ALREADY_CONVERTED)
    //   CANCELLED -> CANCELLED (Idempotent 200, status remains CANCELLED)
    // Order creation strictly prohibited from:
    //   CANCELLED (HTTP 400 RESERVATION_CANCELLED)
    //   EXPIRED (HTTP 409 RESERVATION_EXPIRED)
    //   CONVERTED (HTTP 409 RESERVATION_ALREADY_CONVERTED)
    // =========================================================================
    console.log('\n--- Section 5: State-Machine Audit & Transition Invariants ---');
    // Try to cancel an expired reservation
    const cancelExpiredRes = await bob.request(`/reservations/${expiredRes.id}`, { method: 'DELETE' });
    assert(
      cancelExpiredRes.status === 400 && cancelExpiredRes.body.code === 'RESERVATION_EXPIRED',
      'EXPIRED -> CANCELLED transition strictly forbidden (400 RESERVATION_EXPIRED)'
    );

    // Try to cancel an already converted reservation
    const cancelConvertedRes = await alice.request(`/reservations/${resIdA}`, { method: 'DELETE' });
    assert(
      cancelConvertedRes.status === 400 && cancelConvertedRes.body.code === 'RESERVATION_ALREADY_CONVERTED',
      'CONVERTED -> CANCELLED transition strictly forbidden (400 RESERVATION_ALREADY_CONVERTED)'
    );

    // Try to cancel an already cancelled reservation (idempotency - status stays CANCELLED)
    const cancelAgain = await bob.request(`/reservations/${resBobId}`, { method: 'DELETE' });
    assert(
      cancelAgain.status === 200 && cancelAgain.body?.data?.reservation?.status === 'CANCELLED',
      'CANCELLED -> CANCELLED repeated cancel is safe & idempotent without re-activating'
    );

    // =========================================================================
    // CSRF ORIGIN DEFENSE VERIFICATION
    // =========================================================================
    console.log('\n--- CSRF Defense: Cross-Origin State-Changing Requests Blocked ---');
    const csrfAttempt = await alice.request('/reservations', {
      method: 'POST',
      headers: {
        Origin: 'https://evil-ticketing-attacker.com'
      },
      body: JSON.stringify({ ticketTypeId: testTier.id, quantity: 1 })
    });
    assert(
      csrfAttempt.status === 403 && csrfAttempt.body.code === 'CSRF_REJECTED',
      'Cross-origin mutating request blocked by CSRF defense (HTTP 403 CSRF_REJECTED)'
    );

    // =========================================================================
    // SQL INJECTION DEFENSE VERIFICATION
    // =========================================================================
    console.log('\n--- SQL Injection: Parameterized Query Verification ---');
    const sqliAttempts = [
      "' OR 1=1 --",
      "'; DROP TABLE reservations; --",
      "00000000-0000-0000-0000-000000000000' UNION SELECT * FROM users --"
    ];

    for (const payload of sqliAttempts) {
      const res = await alice.request('/reservations', {
        method: 'POST',
        body: JSON.stringify({ ticketTypeId: payload, quantity: 1 })
      });
      assert(
        res.status === 400 && res.body.code === 'VALIDATION_ERROR',
        `SQL injection payload rejected safely by UUID validator without query execution`
      );
    }

    // =========================================================================
    // SESSION AUTHENTICATION & INVALIDATION
    // =========================================================================
    console.log('\n--- Session Security: Strict Session Verification & Invalidation ---');
    const unauthClient = new TestClient('Unauth');
    const unauthRes = await unauthClient.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: testTier.id, quantity: 1 })
    });
    assert(unauthRes.status === 401 && unauthRes.body.code === 'UNAUTHENTICATED', 'Unauthenticated request rejected with 401 UNAUTHENTICATED');

    const fakeCookieClient = new TestClient('FakeSession');
    const fakeRes = await fakeCookieClient.request('/reservations', {
      method: 'GET',
      headers: { Cookie: 'eventpass.sid=s%3Afake-session-id.forged-hmac-signature' }
    });
    assert(fakeRes.status === 401, 'Forged session cookie rejected with 401');

    console.log('\n==================================================');
    console.log(`📊 Security Audit Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================\n');

    await prisma.$disconnect();
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during security audit:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

runSecurityAudit();
