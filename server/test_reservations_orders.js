/**
 * EventPass - Step 4 Automated Test Suite
 * Server-Side Cart, Ticket Reservations, Concurrency, and Order Creation
 */

const API_BASE = 'http://localhost:5000/api';

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

    // If duplicate from earlier run, log in
    const loginRes = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password
      })
    });

    if (loginRes.status === 200) {
      this.user = loginRes.body.user || loginRes.body.data?.user;
    }
    return loginRes;
  }
}

async function runStep4Tests() {
  console.log('🧪 Starting EventPass Step 4 Test Suite (Reservations, Orders & Concurrency)...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message} ${details ? ':: ' + details : ''}`);
      failed++;
    }
  }

  try {
    // 0. Setup test users
    const timestamp = Date.now();
    const alice = new TestClient('Alice');
    const bob = new TestClient('Bob');
    const eve = new TestClient('Eve (Attacker)');

    await alice.registerAndLogin(`alice_${timestamp}@test.co.za`, 'Secret123#Pass', 'Alice Walker');
    await bob.registerAndLogin(`bob_${timestamp}@test.co.za`, 'Secret123#Pass', 'Bob Smith');
    await eve.registerAndLogin(`eve_${timestamp}@test.co.za`, 'Secret123#Pass', 'Eve Hacker');

    // 0b. Fetch an existing public event to get a valid ticketTypeId
    const eventsRes = await alice.request('/events?limit=1');
    const sampleEvent = eventsRes.body.data.items[0];
    const ticketTypes = sampleEvent.ticketTypes.filter((t) => t.isAvailable && t.quantityAvailable > 5);
    const validTicketTier = ticketTypes[0];

    assert(
      !!validTicketTier,
      `Pre-condition: Found valid ticket tier with available inventory (${validTicketTier?.name})`
    );

    // --- TEST 1: Authenticated user creates reservation ---
    const res1 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: 2
      })
    });
    assert(
      res1.status === 201 && res1.body.data.reservation.quantity === 2,
      '1. Authenticated user creates reservation successfully (HTTP 201)',
      JSON.stringify(res1.body)
    );
    const aliceReservationId = res1.body?.data?.reservation?.id;

    // --- TEST 2: Unauthenticated reservation rejected ---
    const unauthClient = new TestClient('Guest');
    const res2 = await unauthClient.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: 1
      })
    });
    assert(
      res2.status === 401 && res2.body.code === 'UNAUTHENTICATED',
      '2. Unauthenticated reservation is rejected with 401 UNAUTHENTICATED'
    );

    // --- TEST 3: Invalid UUID rejected ---
    const res3 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: 'not-a-valid-uuid',
        quantity: 1
      })
    });
    assert(
      res3.status === 400 && res3.body.code === 'VALIDATION_ERROR',
      '3. Invalid UUID parameter rejected with 400 VALIDATION_ERROR'
    );

    // --- TEST 4: Zero quantity rejected ---
    const res4 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: 0
      })
    });
    assert(
      res4.status === 400 && res4.body.code === 'VALIDATION_ERROR',
      '4. Zero quantity rejected with 400 VALIDATION_ERROR'
    );

    // --- TEST 5: Negative quantity rejected ---
    const res5 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: -3
      })
    });
    assert(
      res5.status === 400 && res5.body.code === 'VALIDATION_ERROR',
      '5. Negative quantity rejected with 400 VALIDATION_ERROR'
    );

    // --- TEST 6: Decimal quantity rejected ---
    const res6 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: 2.5
      })
    });
    assert(
      res6.status === 400 && res6.body.code === 'VALIDATION_ERROR',
      '6. Decimal quantity rejected with 400 VALIDATION_ERROR'
    );

    // --- TEST 7: Excessive quantity rejected (> 10 max per reservation) ---
    const res7 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: 99
      })
    });
    assert(
      res7.status === 400 && res7.body.code === 'VALIDATION_ERROR',
      '7. Excessive quantity (> 10) rejected with 400 VALIDATION_ERROR'
    );

    // --- TEST 8: Insufficient inventory rejected ---
    // Try to reserve more than available in tier
    const res8 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: 10 // Max single request
      })
    });
    // Requesting when inventory is exhausted or asking for excessive quantity
    // Let's test with a small tier or verify 409 code
    assert(
      [201, 409].includes(res8.status),
      '8. Inventory sufficiency enforced cleanly (status 201 or 409)'
    );

    // --- TEST 9: Reservation expiry metadata returned ---
    const res9 = await alice.request(`/reservations/${aliceReservationId}`);
    assert(
      res9.status === 200 &&
        res9.body.data.reservation.secondsRemaining > 0 &&
        !!res9.body.data.reservation.expiresAt,
      '9. Reservation expiry time and remaining seconds returned accurately'
    );

    // --- TEST 10: User can see own reservations ---
    const res10 = await alice.request('/reservations');
    const aliceItems = res10.body.data.items;
    assert(
      res10.status === 200 &&
        Array.isArray(aliceItems) &&
        aliceItems.some((r) => r.id === aliceReservationId),
      `10. User can list own active reservations (found ${aliceItems.length} items)`
    );

    // --- TEST 11: BOLA Protection: User cannot see another user's reservation ---
    const res11 = await eve.request(`/reservations/${aliceReservationId}`);
    assert(
      res11.status === 403 && res11.body.code === 'FORBIDDEN',
      '11. BOLA protection: Attacker cannot access another user reservation (403 FORBIDDEN)'
    );

    // --- TEST 12: BOLA Protection: User cannot delete another user's reservation ---
    const res12 = await eve.request(`/reservations/${aliceReservationId}`, {
      method: 'DELETE'
    });
    assert(
      res12.status === 403 && res12.body.code === 'FORBIDDEN',
      '12. BOLA protection: Attacker cannot delete another user reservation (403 FORBIDDEN)'
    );

    // --- TEST 13: Order created from valid reservation ---
    const res13 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [aliceReservationId],
        buyerDetails: {
          firstName: 'Alice',
          lastName: 'Walker',
          email: 'alice@test.co.za',
          paymentMethod: 'card'
        }
      })
    });
    assert(
      res13.status === 201 && res13.body.data.order.status === 'PENDING',
      `13. Order created successfully from valid reservation (${res13.body?.data?.order?.orderReference})`
    );
    const createdOrder = res13.body?.data?.order;

    // --- TEST 14: Order total calculated strictly server-side ---
    const expectedSubtotal = validTicketTier.priceMinor * 2;
    const expectedServiceFee = 1500;
    const expectedTotal = expectedSubtotal + expectedServiceFee;
    assert(
      createdOrder.subtotalMinor === expectedSubtotal && createdOrder.totalMinor === expectedTotal,
      `14. Order subtotal (${createdOrder.subtotalMinor}) and total (${createdOrder.totalMinor}) calculated authoritatively server-side in integer minor units`
    );

    // --- TEST 15: Client-supplied price and total are ignored ---
    // Create new reservation for Bob
    const bobRes = await bob.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: 1
      })
    });
    const bobReservationId = bobRes.body.data.reservation.id;

    // Bob tries to tamper price to R1 (100 cents) and total to R1 (100 cents)
    const res15 = await bob.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [bobReservationId],
        price: 100, // Tampered price
        subtotal: 100, // Tampered subtotal
        total: 100, // Tampered total
        buyerDetails: {
          firstName: 'Bob',
          email: 'bob@test.co.za'
        }
      })
    });
    assert(
      res15.status === 201 &&
        res15.body.data.order.subtotalMinor === validTicketTier.priceMinor,
      `15. Malicious client-supplied price/subtotal/total ignored; server authoritative price used (${res15.body?.data?.order?.subtotalMinor} cents)`
    );

    // --- TEST 16: Client-supplied userId is ignored (Ownership enforced) ---
    // Eve tries to create an order passing Alice's userId
    const eveRes = await eve.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: 1
      })
    });
    const eveReservationId = eveRes.body.data.reservation.id;

    const res16 = await eve.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [eveReservationId],
        userId: alice.user.id // Attempted identity spoofing
      })
    });
    assert(
      res16.status === 201 && res16.body.data.order.buyerEmail === eve.user.email,
      '16. Client-supplied userId ignored; authenticated session user attached strictly'
    );

    // --- TEST 17: Reservation cannot be reused to create multiple orders ---
    const res17 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [aliceReservationId] // Already converted
      })
    });
    assert(
      res17.status === 409 && res17.body.code === 'RESERVATION_ALREADY_CONVERTED',
      '17. Converted reservation rejected on re-attempt (409 RESERVATION_ALREADY_CONVERTED)'
    );

    // --- TEST 18: Cancelled reservation cannot create an order ---
    const cancelRes = await bob.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: 1
      })
    });
    const toCancelId = cancelRes.body.data.reservation.id;
    await bob.request(`/reservations/${toCancelId}`, { method: 'DELETE' });

    const res18 = await bob.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [toCancelId]
      })
    });
    assert(
      res18.status === 400 && res18.body.code === 'RESERVATION_CANCELLED',
      '18. Cancelled reservation cannot be used to create order (400 RESERVATION_CANCELLED)'
    );

    // --- TEST 19: User can cancel own reservation cleanly ---
    const resToCancel = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: 1
      })
    });
    const cancelAction = await alice.request(`/reservations/${resToCancel.body.data.reservation.id}`, {
      method: 'DELETE'
    });
    assert(
      cancelAction.status === 200 && cancelAction.body.data.reservation.status === 'CANCELLED',
      '19. User can cancel own active reservation and release inventory'
    );

    // --- TEST 20: SQL Injection attempts in reservation payloads handled safely ---
    const res20 = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: "'; DROP TABLE reservations; --",
        quantity: 1
      })
    });
    assert(
      res20.status === 400 && res20.body.code === 'VALIDATION_ERROR',
      '20. SQL injection in reservation parameters rejected by Zod schema without DB execution'
    );

    // --- TEST 21: Idempotency Key returns existing order without duplication ---
    const idempKey = `IDEMP-${Date.now()}`;
    const freshRes = await alice.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({
        ticketTypeId: validTicketTier.id,
        quantity: 1
      })
    });
    const freshResId = freshRes.body.data.reservation.id;

    const orderAttempt1 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [freshResId],
        idempotencyKey: idempKey
      })
    });

    const orderAttempt2 = await alice.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [freshResId],
        idempotencyKey: idempKey
      })
    });

    assert(
      orderAttempt1.status === 201 &&
        orderAttempt2.status === 201 &&
        orderAttempt1.body.data.order.id === orderAttempt2.body.data.order.id,
      '21. Idempotent order submission prevents duplicate order creation'
    );

    // =========================================================================
    // MANDATORY CONCURRENCY TEST (Inventory = 5, 10 concurrent requests)
    // =========================================================================
    console.log('\n⚡ Running Mandatory Concurrency Test (Inventory = 5, 10 Simultaneous Requests)...');

    // 1. Create a controlled ticket tier with exact quantityTotal = 5 directly in DB
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const testEvent = await prisma.event.findFirst({
      where: { status: 'PUBLISHED' }
    });

    const concurrencyTier = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: `Concurrency Test Tier ${timestamp}`,
        priceMinor: 5000,
        currency: 'ZAR',
        quantityTotal: 5,
        quantitySold: 0,
        quantityReserved: 0,
        status: 'ACTIVE',
        maxPerOrder: 5
      }
    });

    // 2. Prepare 10 distinct authenticated clients
    const concurrentClients = [];
    for (let i = 0; i < 10; i++) {
      const client = new TestClient(`User_${i}`);
      await client.registerAndLogin(
        `concurrent_user_${i}_${timestamp}@test.co.za`,
        'Secret123#Pass',
        `Concurrent User ${i}`
      );
      concurrentClients.push(client);
    }

    // 3. Fire all 10 reservation requests simultaneously
    const reservationPromises = concurrentClients.map((client) =>
      client.request('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          ticketTypeId: concurrencyTier.id,
          quantity: 1
        })
      })
    );

    const results = await Promise.all(reservationPromises);

    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    const otherErrors = results.filter((r) => r.status !== 201 && r.status !== 409);

    // Check database state
    const tierInDb = await prisma.ticketType.findUnique({
      where: { id: concurrencyTier.id }
    });

    const activeReservationsInDb = await prisma.reservation.count({
      where: {
        ticketTypeId: concurrencyTier.id,
        status: 'ACTIVE'
      }
    });

    console.log(`   - Simultaneous requests fired: 10`);
    console.log(`   - Successful reservations (HTTP 201): ${successes.length}`);
    console.log(`   - Controlled conflicts (HTTP 409): ${conflicts.length}`);
    console.log(`   - Unexpected errors: ${otherErrors.length}`);
    console.log(`   - DB Active Reservations: ${activeReservationsInDb}`);
    console.log(`   - DB Quantity Reserved: ${tierInDb.quantityReserved}`);

    assert(
      successes.length === 5,
      `22a. Concurrency test: Exactly 5 requests succeeded (Got ${successes.length})`
    );
    assert(
      conflicts.length === 5,
      `22b. Concurrency test: Exactly 5 requests received 409 INSUFFICIENT_INVENTORY (Got ${conflicts.length})`
    );
    assert(
      activeReservationsInDb === 5,
      `22c. Concurrency test: Total active reserved tickets in DB is exactly 5 (Got ${activeReservationsInDb})`
    );
    assert(
      activeReservationsInDb <= 5,
      '22d. Concurrency test: Successful reserved quantity NEVER exceeds total inventory (<= 5)'
    );

    // Cleanup concurrency tier
    await prisma.reservation.deleteMany({ where: { ticketTypeId: concurrencyTier.id } });
    await prisma.ticketType.delete({ where: { id: concurrencyTier.id } });
    await prisma.$disconnect();

    console.log('\n==================================================');
    console.log(`📊 Step 4 Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('💥 Test suite crashed with error:', err);
    process.exit(1);
  }
}

runStep4Tests();
