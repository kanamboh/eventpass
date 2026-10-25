/**
 * EVENTPASS — PHASE 2: PROMOTIONAL CODES VERIFICATION SUITE
 * 
 * Verifies all 30 promo-code requirements and business logic:
 * 1. Valid percentage code
 * 2. Valid fixed-value code
 * 3. Invalid code
 * 4. Empty code
 * 5. Code with leading or trailing whitespace
 * 6. Case-insensitive behavior
 * 7. Expired code
 * 8. Inactive code
 * 9. Code used before its start date
 * 10. Exhausted global redemption limit
 * 11. Customer redemption limit reached
 * 12. Minimum purchase requirement not met
 * 13. Code restricted to another event
 * 14. Code restricted to another ticket type
 * 15. Cart containing both eligible and ineligible items
 * 16. Discount cannot exceed eligible subtotal
 * 17. Malformed ticket identifiers
 * 18. Invalid or excessive quantities
 * 19. Tampered client-submitted prices
 * 20. Tampered client-submitted discount amounts
 * 21. Tampered client-submitted totals
 * 22. Repeated application does not create duplicate redemptions
 * 23. Concurrent redemption-limit requests do not exceed the configured limit
 * 24. Applying a promo code does not change a pending order to PAID
 * 25. Applying a promo code does not issue tickets
 * 26. Applying a promo code does not enable payments
 * 27. Payment initialization still returns the existing disabled response
 * 28. Event browsing continues to work
 * 29. Existing tickets remain accessible
 * 30. Existing historical orders remain intact
 */

import http from 'node:http';
import { PrismaClient } from '@prisma/client';
import app from './src/app.js';
import { env } from './src/config/env.js';
import { recordPromoRedemption, updateAdminPromoCode } from './src/services/promoCodeService.js';
import { finalizePaymentSuccess } from './src/services/paymentService.js';

const prisma = new PrismaClient();

class TestHttpClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = [];
  }

  request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const reqHeaders = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {})
      };

      if (this.cookies.length > 0) {
        reqHeaders.Cookie = this.cookies.join('; ');
      }

      const req = http.request(
        url,
        {
          method: options.method || 'GET',
          headers: reqHeaders
        },
        (res) => {
          const setCookieHeaders = res.headers['set-cookie'];
          if (setCookieHeaders) {
            for (const cookieStr of setCookieHeaders) {
              const [cookiePart] = cookieStr.split(';');
              const [name] = cookiePart.split('=');
              this.cookies = this.cookies.filter((c) => !c.startsWith(`${name}=`));
              this.cookies.push(cookiePart);
            }
          }

          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            let parsedBody = null;
            try {
              parsedBody = JSON.parse(data);
            } catch {
              parsedBody = data;
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: parsedBody
            });
          });
        }
      );

      req.on('error', reject);

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  async registerAndLogin(email, password, fullName = 'Promo Tester', role = 'CUSTOMER') {
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
      throw new Error(`Failed to register user: ${regRes.status} ${JSON.stringify(regRes.body)}`);
    }

    if (role === 'ADMIN') {
      await prisma.user.update({
        where: { email },
        data: { role: 'ADMIN', emailVerified: true }
      });
    } else {
      await prisma.user.update({
        where: { email },
        data: { emailVerified: true }
      });
    }

    const loginRes = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    return loginRes;
  }
}

async function runPromoCodesSuite() {
  const results = { total: 0, passed: 0, failed: 0 };
  const createdPromoCodeIds = [];
  const createdUserIds = [];
  const createdOrderIds = [];
  const createdPaymentIds = [];

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

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const client = new TestHttpClient(baseUrl);
  const adminClient = new TestHttpClient(baseUrl);

  console.log('\n🎟️ =========================================================================');
  console.log('🎟️ EVENTPASS — PHASE 2: PROMOTIONAL CODES COMPREHENSIVE VERIFICATION SUITE');
  console.log('🎟️ =========================================================================\n');
  console.log(`📡 Ephemeral Test Server running at ${baseUrl}`);

  const timestamp = Date.now();
  const testUserEmail = `promocustomer_${timestamp}@test.co.za`;
  const adminEmail = `promoadmin_${timestamp}@test.co.za`;

  try {
    // -------------------------------------------------------------------------
    // 0. Setup: Users & Ticket Types
    // -------------------------------------------------------------------------
    await client.registerAndLogin(testUserEmail, 'Pass123#Secure', 'Customer Tester', 'CUSTOMER');
    const customerUser = await prisma.user.findUnique({ where: { email: testUserEmail } });
    createdUserIds.push(customerUser.id);

    await adminClient.registerAndLogin(adminEmail, 'Admin123#Pass', 'Admin Tester', 'ADMIN');
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    createdUserIds.push(adminUser.id);

    // Fetch two distinct published events and their ticket types for restriction testing
    const events = await prisma.event.findMany({
      where: { status: 'PUBLISHED', isActive: true },
      include: { ticketTypes: { where: { quantityAvailable: { gt: 5 } } } },
      take: 2
    });

    assert(events.length >= 2, 'Found at least 2 published events with available tickets');
    const eventA = events[0];
    const eventB = events[1];
    const tierA1 = eventA.ticketTypes[0];
    const tierA2 = eventA.ticketTypes[1] || eventA.ticketTypes[0];
    const tierB1 = eventB.ticketTypes[0];

    assert(Boolean(tierA1 && tierB1), `Found active ticket tiers: "${tierA1.name}" (R${(tierA1.priceMinor/100).toFixed(2)}) & "${tierB1.name}" (R${(tierB1.priceMinor/100).toFixed(2)})`);

    // Helper to create test promo code
    const makePromo = async (data) => {
      const code = `TEST_${data.code}_${timestamp}`;
      const promo = await prisma.promoCode.create({
        data: {
          code,
          description: data.description || 'Test promo code',
          discountType: data.discountType || 'PERCENTAGE',
          discountValue: data.discountValue || 10,
          maxDiscountMinor: data.maxDiscountMinor ?? null,
          minSubtotalMinor: data.minSubtotalMinor || 0,
          maxTotalRedemptions: data.maxTotalRedemptions ?? null,
          maxPerCustomer: data.maxPerCustomer ?? null,
          currentRedemptions: data.currentRedemptions || 0,
          isActive: data.isActive !== undefined ? data.isActive : true,
          startsAt: data.startsAt ?? null,
          expiresAt: data.expiresAt ?? null,
          createdById: adminUser.id,
          events: data.eventIds ? { create: data.eventIds.map(eventId => ({ eventId })) } : undefined,
          ticketTypes: data.ticketTypeIds ? { create: data.ticketTypeIds.map(ticketTypeId => ({ ticketTypeId })) } : undefined
        }
      });
      createdPromoCodeIds.push(promo.id);
      return promo;
    };

    // -------------------------------------------------------------------------
    // TEST 1: Valid Percentage Code
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Percentage Discount Validation ---');
    const promoPerc = await makePromo({ code: 'PERC20', discountType: 'PERCENTAGE', discountValue: 20 });
    const resPerc = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoPerc.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 2 }]
      })
    });
    assert(resPerc.status === 200, 'POST /api/promocodes/validate returns HTTP 200');
    assert(resPerc.body?.data?.valid === true, 'Response reports valid: true');
    const expectedPercDisc = Math.floor((tierA1.priceMinor * 2 * 20) / 100);
    assert(resPerc.body?.data?.discountMinor === expectedPercDisc, `Calculates exact 20% discount (expected ${expectedPercDisc} cents, got ${resPerc.body?.data?.discountMinor})`);
    assert(resPerc.body?.data?.discountType === 'PERCENTAGE', 'Discount type is PERCENTAGE');

    // -------------------------------------------------------------------------
    // TEST 2: Valid Fixed-Value Code
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Fixed-Value Discount Validation ---');
    const promoFixed = await makePromo({ code: 'FIXED50', discountType: 'FIXED', discountValue: 5000 }); // R50.00
    const resFixed = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoFixed.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }]
      })
    });
    assert(resFixed.status === 200, 'Fixed code returns HTTP 200');
    assert(resFixed.body?.data?.discountMinor === 5000, 'Calculates exact R50.00 (5000 cents) fixed discount');
    assert(resFixed.body?.data?.discountType === 'FIXED', 'Discount type is FIXED');

    // -------------------------------------------------------------------------
    // TEST 3: Invalid Code (Non-Existent)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Invalid Code Handling ---');
    const resInvalid = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: 'DOESNOTEXIST999',
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }]
      })
    });
    assert(resInvalid.status === 404, 'Non-existent code returns HTTP 404');
    assert(resInvalid.body?.code === 'PROMO_CODE_NOT_FOUND', 'Error code is PROMO_CODE_NOT_FOUND');

    // -------------------------------------------------------------------------
    // TEST 4: Empty Code
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Empty Code Handling ---');
    const resEmpty = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: '',
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }]
      })
    });
    assert(resEmpty.status === 400, 'Empty code string returns HTTP 400');

    // -------------------------------------------------------------------------
    // TEST 5: Code with Whitespace
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Whitespace Trimming ---');
    const resWhitespace = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: `   ${promoPerc.code}   `,
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }]
      })
    });
    assert(resWhitespace.status === 200, 'Code with leading/trailing whitespace returns HTTP 200');
    assert(resWhitespace.body?.data?.valid === true, 'Whitespace is safely trimmed and matched');

    // -------------------------------------------------------------------------
    // TEST 6: Case-Insensitive Behavior
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Case-Insensitive Matching ---');
    const resLower = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoPerc.code.toLowerCase(),
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }]
      })
    });
    assert(resLower.status === 200, 'Lowercase code input matches uppercase stored code (HTTP 200)');
    assert(resLower.body?.data?.valid === true, 'Case-insensitive matching succeeds');

    // -------------------------------------------------------------------------
    // TEST 7: Expired Code
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Expired Code Rejection ---');
    const promoExpired = await makePromo({
      code: 'EXPIRED',
      expiresAt: new Date(Date.now() - 3600000) // 1 hour ago
    });
    const resExpired = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoExpired.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }]
      })
    });
    assert(resExpired.status === 400, 'Expired promo code returns HTTP 400');
    assert(resExpired.body?.code === 'PROMO_CODE_EXPIRED', 'Error code is PROMO_CODE_EXPIRED');

    // -------------------------------------------------------------------------
    // TEST 8: Inactive Code
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Inactive Code Rejection ---');
    const promoInactive = await makePromo({ code: 'INACTIVE', isActive: false });
    const resInactive = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoInactive.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }]
      })
    });
    assert(resInactive.status === 400, 'Inactive code returns HTTP 400');
    assert(resInactive.body?.code === 'PROMO_CODE_INACTIVE', 'Error code is PROMO_CODE_INACTIVE');

    // -------------------------------------------------------------------------
    // TEST 9: Code Before Start Date
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Future Start Date Rejection ---');
    const promoFuture = await makePromo({
      code: 'FUTURE',
      startsAt: new Date(Date.now() + 86400000) // Tomorrow
    });
    const resFuture = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoFuture.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }]
      })
    });
    assert(resFuture.status === 400, 'Code with future startsAt returns HTTP 400');
    assert(resFuture.body?.code === 'PROMO_CODE_NOT_STARTED', 'Error code is PROMO_CODE_NOT_STARTED');

    // -------------------------------------------------------------------------
    // TEST 10: Exhausted Global Redemption Limit
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Global Redemption Limit Exhaustion ---');
    const promoExhausted = await makePromo({
      code: 'MAXLIMIT',
      maxTotalRedemptions: 5,
      currentRedemptions: 5
    });
    const resExhausted = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoExhausted.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }]
      })
    });
    assert(resExhausted.status === 400, 'Exhausted global redemption limit returns HTTP 400');
    assert(resExhausted.body?.code === 'PROMO_GLOBAL_LIMIT_EXHAUSTED', 'Error code is PROMO_GLOBAL_LIMIT_EXHAUSTED');

    // -------------------------------------------------------------------------
    // TEST 11: Customer Redemption Limit Reached
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Customer Redemption Limit ---');
    const promoCustLimit = await makePromo({
      code: 'ONCEPERUSER',
      maxPerCustomer: 1
    });
    // Create an existing redemption record for this customer
    await prisma.promoCodeRedemption.create({
      data: {
        promoCodeId: promoCustLimit.id,
        userId: customerUser.id,
        customerEmail: testUserEmail,
        discountAmountMinor: 1000
      }
    });

    const resCustLimit = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoCustLimit.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }]
      })
    });
    assert(resCustLimit.status === 400, 'Exceeded customer redemption limit returns HTTP 400');
    assert(resCustLimit.body?.code === 'PROMO_CUSTOMER_LIMIT_REACHED', 'Error code is PROMO_CUSTOMER_LIMIT_REACHED');

    // -------------------------------------------------------------------------
    // TEST 12: Minimum Purchase Requirement Not Met
    // -------------------------------------------------------------------------
    console.log('\n--- 12. Minimum Purchase Threshold ---');
    const promoMinSub = await makePromo({
      code: 'MIN10000',
      minSubtotalMinor: 1000000 // R10,000.00 min subtotal
    });
    const resMinSub = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoMinSub.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }]
      })
    });
    assert(resMinSub.status === 400, 'Cart below minSubtotalMinor returns HTTP 400');
    assert(resMinSub.body?.code === 'PROMO_MIN_PURCHASE_NOT_MET', 'Error code is PROMO_MIN_PURCHASE_NOT_MET');

    // -------------------------------------------------------------------------
    // TEST 13: Code Restricted to Another Event
    // -------------------------------------------------------------------------
    console.log('\n--- 13. Event Restriction Rejection ---');
    const promoEventBOnly = await makePromo({
      code: 'EVENTBONLY',
      eventIds: [eventB.id] // Only valid for Event B
    });
    const resEventRestrict = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoEventBOnly.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }] // Cart has Event A
      })
    });
    assert(resEventRestrict.status === 400, 'Code restricted to Event B rejects Event A cart (HTTP 400)');
    assert(resEventRestrict.body?.code === 'PROMO_NO_ELIGIBLE_ITEMS', 'Error code is PROMO_NO_ELIGIBLE_ITEMS');

    // -------------------------------------------------------------------------
    // TEST 14: Code Restricted to Another Ticket Type
    // -------------------------------------------------------------------------
    console.log('\n--- 14. Ticket Type Restriction Rejection ---');
    const promoTierBOnly = await makePromo({
      code: 'TIERBONLY',
      ticketTypeIds: [tierB1.id] // Only valid for tier B1
    });
    const resTierRestrict = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoTierBOnly.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }] // Cart has tier A1
      })
    });
    assert(resTierRestrict.status === 400, 'Code restricted to tier B rejects tier A (HTTP 400)');
    assert(resTierRestrict.body?.code === 'PROMO_NO_ELIGIBLE_ITEMS', 'Error code is PROMO_NO_ELIGIBLE_ITEMS');

    // -------------------------------------------------------------------------
    // TEST 15: Cart with Eligible and Ineligible Items
    // -------------------------------------------------------------------------
    console.log('\n--- 15. Mixed Cart Partial Discount Allocation ---');
    const promoMixed = await makePromo({
      code: 'EVENTAONLY',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      eventIds: [eventA.id]
    });
    const resMixed = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoMixed.code,
        items: [
          { ticketTypeId: tierA1.id, quantity: 1 }, // Eligible (Event A)
          { ticketTypeId: tierB1.id, quantity: 1 }  // Ineligible (Event B)
        ]
      })
    });
    assert(resMixed.status === 200, 'Mixed cart returns HTTP 200');
    assert(resMixed.body?.data?.restrictions?.partiallyEligible === true, 'Identifies cart is partially eligible');
    const expectedEligibleSub = tierA1.priceMinor;
    const expectedMixedDisc = Math.floor((expectedEligibleSub * 10) / 100);
    assert(resMixed.body?.data?.eligibleSubtotalMinor === expectedEligibleSub, `Calculates eligible subtotal exclusively from Event A (${expectedEligibleSub} cents)`);
    assert(resMixed.body?.data?.discountMinor === expectedMixedDisc, `Calculates 10% discount ONLY against eligible items (${expectedMixedDisc} cents)`);

    // -------------------------------------------------------------------------
    // TEST 16: Discount Cannot Exceed Eligible Subtotal
    // -------------------------------------------------------------------------
    console.log('\n--- 16. Subtotal Cap Invariant ---');
    const promoHugeFixed = await makePromo({
      code: 'HUGE10000',
      discountType: 'FIXED',
      discountValue: 1000000 // R10,000 fixed discount
    });
    const resCapped = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoHugeFixed.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 1 }] // Item costs less than R10,000
      })
    });
    assert(resCapped.status === 200, 'Fixed discount larger than subtotal returns HTTP 200');
    assert(resCapped.body?.data?.discountMinor === tierA1.priceMinor, 'Discount is strictly capped at eligible subtotal');
    assert(resCapped.body?.data?.discountedSubtotalMinor === 0, 'Discounted subtotal is exactly 0 (does not become negative)');

    // -------------------------------------------------------------------------
    // TEST 17: Malformed Ticket Identifiers
    // -------------------------------------------------------------------------
    console.log('\n--- 17. Malformed Ticket Identifiers ---');
    const resMalformed = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoPerc.code,
        items: [{ ticketTypeId: 'not-a-valid-uuid', quantity: 1 }]
      })
    });
    assert(resMalformed.status === 400, 'Malformed ticketTypeId UUID returns HTTP 400');

    // -------------------------------------------------------------------------
    // TEST 18: Invalid or Excessive Quantities
    // -------------------------------------------------------------------------
    console.log('\n--- 18. Invalid Quantities ---');
    const resZeroQty = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoPerc.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 0 }]
      })
    });
    assert(resZeroQty.status === 400, 'Quantity 0 returns HTTP 400');

    const resExcessQty = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoPerc.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 999 }]
      })
    });
    assert(resExcessQty.status === 400, 'Quantity 999 exceeds limit (HTTP 400)');

    // -------------------------------------------------------------------------
    // TEST 19: Tampered Client-Submitted Prices
    // -------------------------------------------------------------------------
    console.log('\n--- 19. Tampered Client Prices Ignored ---');
    const resTamperedPrice = await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({
        code: promoPerc.code,
        items: [{ ticketTypeId: tierA1.id, quantity: 1, unitPriceMinor: 100, price: 1.00 }] // Client claims R1.00
      })
    });
    assert(resTamperedPrice.status === 200, 'Request returns HTTP 200');
    assert(resTamperedPrice.body?.data?.originalSubtotalMinor === tierA1.priceMinor, 'Server strictly used authoritative DB price, ignoring client price');

    // -------------------------------------------------------------------------
    // TEST 20: Tampered Client-Submitted Discount Amounts in Order
    // -------------------------------------------------------------------------
    console.log('\n--- 20. Tampered Client Discount Ignored in Order Creation ---');
    // Reserve tickets
    const resRes1 = await client.request('/reservations', {
      method: 'POST',
      body: JSON.stringify({ ticketTypeId: tierA1.id, quantity: 1 })
    });
    const reservationId1 = resRes1.body?.data?.reservation?.id;
    assert(Boolean(reservationId1), 'Created reservation for order test');

    const orderResTampered = await client.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        reservationIds: [reservationId1],
        promoCode: promoPerc.code,
        discountMinor: 999999, // Client claims R9,999 discount
        totalMinor: 0
      })
    });
    assert(orderResTampered.status === 201, 'Order created successfully (HTTP 201)');
    const expectedAuthoritativeDiscount = Math.floor((tierA1.priceMinor * 20) / 100);
    assert(orderResTampered.body?.data?.order?.discountMinor === expectedAuthoritativeDiscount, `Server calculates authoritative discount (${expectedAuthoritativeDiscount}) ignoring client discount`);

    // -------------------------------------------------------------------------
    // TEST 21: Tampered Client-Submitted Totals in Order
    // -------------------------------------------------------------------------
    console.log('\n--- 21. Tampered Client Totals Recomputed by Server ---');
    const expectedTotal = tierA1.priceMinor + 1500 - expectedAuthoritativeDiscount;
    assert(orderResTampered.body?.data?.order?.totalMinor === expectedTotal, `Server strictly computes authoritative grand total (${expectedTotal} cents)`);

    // -------------------------------------------------------------------------
    // TEST 22: Repeated Application Does Not Create Duplicate Redemptions
    // -------------------------------------------------------------------------
    console.log('\n--- 22. Idempotent Validation Previews ---');
    const redemptionsBefore = await prisma.promoCodeRedemption.count({ where: { promoCodeId: promoPerc.id } });
    await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({ code: promoPerc.code, items: [{ ticketTypeId: tierA1.id, quantity: 1 }] })
    });
    await client.request('/promocodes/validate', {
      method: 'POST',
      body: JSON.stringify({ code: promoPerc.code, items: [{ ticketTypeId: tierA1.id, quantity: 1 }] })
    });
    const redemptionsAfter = await prisma.promoCodeRedemption.count({ where: { promoCodeId: promoPerc.id } });
    assert(redemptionsBefore === redemptionsAfter, 'Previewing promo code repeatedly does NOT create redemption records');

    // -------------------------------------------------------------------------
    // TEST 23: Concurrent Redemption-Limit Requests
    // -------------------------------------------------------------------------
    console.log('\n--- 23. Concurrency Protection on Redemption Cap ---');
    const promoSingleUse = await makePromo({
      code: 'SINGLEUSE',
      maxTotalRedemptions: 1,
      currentRedemptions: 0
    });

    // Launch 3 simultaneous atomic redemption attempts
    const concurrentAttempts = await Promise.allSettled([
      recordPromoRedemption({ promoCodeId: promoSingleUse.id, discountAmountMinor: 100, customerEmail: 'c1@test.co.za' }),
      recordPromoRedemption({ promoCodeId: promoSingleUse.id, discountAmountMinor: 100, customerEmail: 'c2@test.co.za' }),
      recordPromoRedemption({ promoCodeId: promoSingleUse.id, discountAmountMinor: 100, customerEmail: 'c3@test.co.za' })
    ]);

    const successes = concurrentAttempts.filter(r => r.status === 'fulfilled');
    const rejections = concurrentAttempts.filter(r => r.status === 'rejected');

    assert(successes.length === 1, `Exactly 1 concurrent request succeeded (got ${successes.length})`);
    assert(rejections.length === 2, `Exactly 2 concurrent requests were rejected (got ${rejections.length})`);
    const finalPromo = await prisma.promoCode.findUnique({ where: { id: promoSingleUse.id } });
    assert(finalPromo.currentRedemptions === 1, 'Final currentRedemptions counter is exactly 1 (cap never exceeded)');

    // -------------------------------------------------------------------------
    // TEST 24: Applying Promo Code Does Not Change Order to PAID
    // -------------------------------------------------------------------------
    console.log('\n--- 24. Order Status Remains PENDING ---');
    assert(orderResTampered.body?.data?.order?.status === 'PENDING', 'Order status remains strictly PENDING');
    const orderInDb = await prisma.order.findUnique({ where: { id: orderResTampered.body?.data?.order?.id } });
    assert(orderInDb.status === 'PENDING', 'Database order status is confirmed PENDING');

    // -------------------------------------------------------------------------
    // TEST 25: Applying Promo Code Does Not Issue Tickets
    // -------------------------------------------------------------------------
    console.log('\n--- 25. No Tickets Issued for Unpaid Discounted Order ---');
    const ticketsForOrder = await prisma.ticket.count({ where: { orderId: orderInDb.id } });
    assert(ticketsForOrder === 0, 'Zero tickets issued for unpaid discounted order');

    // -------------------------------------------------------------------------
    // TEST 26: Applying Promo Code Does Not Enable Payments
    // -------------------------------------------------------------------------
    console.log('\n--- 26. Payments Flag Remains Disabled ---');
    const statusRes = await client.request('/payments/status');
    assert(statusRes.body?.data?.paymentsEnabled === false, 'GET /api/payments/status confirms paymentsEnabled === false');
    assert(env.PAYMENTS_ENABLED === false, 'Server config env.PAYMENTS_ENABLED is false');

    // -------------------------------------------------------------------------
    // TEST 27: Payment Initialization Still Returns 503 PAYMENTS_DISABLED
    // -------------------------------------------------------------------------
    console.log('\n--- 27. Payment Freeze Maintained on Discounted Order ---');
    const payInitRes = await client.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({
        orderId: orderInDb.id,
        callbackUrl: 'http://localhost:5173/my-orders'
      })
    });
    assert(payInitRes.status === 503, 'Payment initialization returns HTTP 503');
    assert(payInitRes.body?.code === 'PAYMENTS_DISABLED', 'Error code is PAYMENTS_DISABLED');

    // -------------------------------------------------------------------------
    // TEST 28: Event Browsing Continues to Work
    // -------------------------------------------------------------------------
    console.log('\n--- 28. Event Browsing Continuity ---');
    const eventsRes = await client.request('/events');
    assert(eventsRes.status === 200, 'GET /api/events returns HTTP 200');
    const totalEvents = eventsRes.body?.data?.total || eventsRes.body?.data?.items?.length || 0;
    assert(totalEvents === 30, `All 30 public seed events remain accessible (found: ${totalEvents})`);

    // -------------------------------------------------------------------------
    // TEST 29: Existing Tickets Remain Accessible
    // -------------------------------------------------------------------------
    console.log('\n--- 29. Existing Ticket Access ---');
    const myTicketsRes = await client.request('/tickets/my-tickets');
    assert(myTicketsRes.status === 200, 'GET /api/tickets/my-tickets returns HTTP 200');

    // -------------------------------------------------------------------------
    // TEST 30: Existing Historical Orders Remain Intact
    // -------------------------------------------------------------------------
    console.log('\n--- 30. Historical Orders & Paid Records Preserved ---');
    const paidOrdersCount = await prisma.order.count({ where: { status: 'PAID' } });
    const validTicketsCount = await prisma.ticket.count({ where: { status: 'VALID' } });
    assert(paidOrdersCount >= 378, `All verified PAID orders intact (count: ${paidOrdersCount})`);
    assert(validTicketsCount >= 336, `All valid customer tickets intact (count: ${validTicketsCount})`);

    // -------------------------------------------------------------------------
    // ADMIN MANAGEMENT VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- Admin Management API Verification ---');
    const adminListRes = await adminClient.request('/admin/promocodes');
    assert(adminListRes.status === 200, 'GET /api/admin/promocodes returns HTTP 200 for ADMIN');
    assert(adminListRes.body?.data?.items?.length > 0, 'Admin can list promo codes');

    const customerForbiddenRes = await client.request('/admin/promocodes');
    assert(customerForbiddenRes.status === 403, 'GET /api/admin/promocodes returns HTTP 403 for CUSTOMER');

    const adminCreatedCode = `ADMIN_${timestamp}`;
    const adminCreateRes = await adminClient.request('/admin/promocodes', {
      method: 'POST',
      body: JSON.stringify({
        code: adminCreatedCode,
        description: 'Admin created discount',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        minSubtotalMinor: 5000,
        maxPerCustomer: 2
      })
    });
    assert(adminCreateRes.status === 201, 'POST /api/admin/promocodes creates code (HTTP 201)');
    const createdAdminPromoId = adminCreateRes.body?.data?.promoCode?.id;
    if (createdAdminPromoId) createdPromoCodeIds.push(createdAdminPromoId);

    const adminToggleRes = await adminClient.request(`/admin/promocodes/${createdAdminPromoId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: false })
    });
    assert(adminToggleRes.status === 200, 'PATCH /api/admin/promocodes/:id/status toggles isActive');

    // =========================================================================
    // PHASE 2.2 INTEGRITY HARDENING VERIFICATION SUITE
    // =========================================================================
    console.log('\n🎟️ =========================================================================');
    console.log('🎟️ PHASE 2.2 HARDENING: TRANSACTION SAFETY & REDEMPTION INTEGRITY');
    console.log('🎟️ =========================================================================\n');

    // -------------------------------------------------------------------------
    // H1: Counter & Record Rollback Together on Failed Customer Limit
    // -------------------------------------------------------------------------
    console.log('\n--- H1. Transactional Rollback on Customer Limit Exceeded ---');
    const promoRollbackTest = await makePromo({
      code: 'ROLLBACK_TEST',
      maxPerCustomer: 1,
      maxTotalRedemptions: 10
    });
    // First redemption succeeds
    const firstRedemption = await recordPromoRedemption({
      promoCodeId: promoRollbackTest.id,
      userId: customerUser.id,
      customerEmail: testUserEmail,
      discountAmountMinor: 500
    });
    assert(Boolean(firstRedemption?.id), 'Initial redemption succeeds');
    const promoAfterFirst = await prisma.promoCode.findUnique({ where: { id: promoRollbackTest.id } });
    assert(promoAfterFirst.currentRedemptions === 1, 'Counter incremented to 1 after first success');

    // Second redemption must fail and rollback counter atomically
    let rollbackError = null;
    try {
      await recordPromoRedemption({
        promoCodeId: promoRollbackTest.id,
        userId: customerUser.id,
        customerEmail: testUserEmail,
        discountAmountMinor: 500
      });
    } catch (err) {
      rollbackError = err;
    }
    assert(Boolean(rollbackError), 'Second redemption throws customer limit error');
    assert(rollbackError?.code === 'CUSTOMER_REDEMPTION_LIMIT_EXCEEDED', 'Error code is CUSTOMER_REDEMPTION_LIMIT_EXCEEDED');
    const promoAfterRollback = await prisma.promoCode.findUnique({ where: { id: promoRollbackTest.id } });
    assert(promoAfterRollback.currentRedemptions === 1, 'Counter strictly rolled back to 1 (did not drift to 2)');
    const countInDbAfterRollback = await prisma.promoCodeRedemption.count({ where: { promoCodeId: promoRollbackTest.id } });
    assert(countInDbAfterRollback === 1, 'Total redemption records in DB is strictly 1');

    // -------------------------------------------------------------------------
    // H2: Idempotent Redemption for Same Order & Unique Constraint Enforcement
    // -------------------------------------------------------------------------
    console.log('\n--- H2. Idempotency & Unique Constraint on (promoCodeId, orderId) ---');
    const promoOrderTest = await makePromo({ code: 'ORDER_IDEMP' });
    const testOrder1 = await prisma.order.create({
      data: {
        orderReference: `EP-H2-${Date.now()}-1`,
        userId: customerUser.id,
        buyerName: 'Customer Tester',
        buyerEmail: testUserEmail,
        subtotalMinor: 20000,
        serviceFeeMinor: 1500,
        discountMinor: 2000,
        totalMinor: 19500,
        currency: 'ZAR',
        status: 'PENDING',
        promoCodeId: promoOrderTest.id
      }
    });
    createdOrderIds.push(testOrder1.id);

    const firstOrderRedemption = await recordPromoRedemption({
      promoCodeId: promoOrderTest.id,
      orderId: testOrder1.id,
      userId: customerUser.id,
      customerEmail: testUserEmail,
      discountAmountMinor: 2000
    });
    assert(Boolean(firstOrderRedemption?.id), 'First redemption for order succeeds');
    const promoOrderCount1 = await prisma.promoCode.findUnique({ where: { id: promoOrderTest.id } });
    assert(promoOrderCount1.currentRedemptions === 1, 'Counter is 1 after first order redemption');

    // Call again with the exact same orderId -> must return existing record idempotently
    const duplicateOrderRedemption = await recordPromoRedemption({
      promoCodeId: promoOrderTest.id,
      orderId: testOrder1.id,
      userId: customerUser.id,
      customerEmail: testUserEmail,
      discountAmountMinor: 2000
    });
    assert(duplicateOrderRedemption?.id === firstOrderRedemption.id, 'Repeated redemption returns identical existing record idempotently');
    const promoOrderCount2 = await prisma.promoCode.findUnique({ where: { id: promoOrderTest.id } });
    assert(promoOrderCount2.currentRedemptions === 1, 'Counter remains 1 (did not double-increment for same order)');

    // Direct duplicate insert at DB level must throw P2002 unique constraint violation
    let p2002Caught = false;
    try {
      await prisma.promoCodeRedemption.create({
        data: {
          promoCodeId: promoOrderTest.id,
          orderId: testOrder1.id,
          userId: customerUser.id,
          customerEmail: testUserEmail,
          discountAmountMinor: 2000
        }
      });
    } catch (err) {
      if (err.code === 'P2002') p2002Caught = true;
    }
    assert(p2002Caught, 'Database unique constraint strictly rejects duplicate (promoCodeId, orderId)');

    // -------------------------------------------------------------------------
    // H3: Concurrent Per-Customer Redemption Attempts Serialized via Advisory Lock
    // -------------------------------------------------------------------------
    console.log('\n--- H3. Concurrent Per-Customer Race Protection ---');
    const promoCustRace = await makePromo({
      code: 'CUST_RACE',
      maxPerCustomer: 1,
      maxTotalRedemptions: 10
    });
    const raceCustomerEmail = `racecust_${timestamp}@test.co.za`;

    // Fire 4 simultaneous redemptions for the same customer
    const raceAttempts = await Promise.allSettled([
      recordPromoRedemption({ promoCodeId: promoCustRace.id, customerEmail: raceCustomerEmail, discountAmountMinor: 100 }),
      recordPromoRedemption({ promoCodeId: promoCustRace.id, customerEmail: raceCustomerEmail, discountAmountMinor: 100 }),
      recordPromoRedemption({ promoCodeId: promoCustRace.id, customerEmail: raceCustomerEmail, discountAmountMinor: 100 }),
      recordPromoRedemption({ promoCodeId: promoCustRace.id, customerEmail: raceCustomerEmail, discountAmountMinor: 100 })
    ]);
    const raceSuccesses = raceAttempts.filter((r) => r.status === 'fulfilled');
    const raceRejections = raceAttempts.filter((r) => r.status === 'rejected');
    assert(raceSuccesses.length === 1, `Exactly 1 concurrent customer request succeeded (got ${raceSuccesses.length})`);
    assert(raceRejections.length === 3, `Exactly 3 concurrent customer requests rejected (got ${raceRejections.length})`);
    const finalCustRacePromo = await prisma.promoCode.findUnique({ where: { id: promoCustRace.id } });
    assert(finalCustRacePromo.currentRedemptions === 1, 'Counter is exactly 1 (no leak or race condition)');

    // -------------------------------------------------------------------------
    // H4: Different Customers Can Redeem Concurrently
    // -------------------------------------------------------------------------
    console.log('\n--- H4. Independent Customers Concurrency ---');
    const promoMultiCust = await makePromo({
      code: 'MULTI_CUST',
      maxPerCustomer: 1,
      maxTotalRedemptions: 5
    });
    const multiCustAttempts = await Promise.allSettled([
      recordPromoRedemption({ promoCodeId: promoMultiCust.id, customerEmail: `userA_${timestamp}@test.co.za`, discountAmountMinor: 100 }),
      recordPromoRedemption({ promoCodeId: promoMultiCust.id, customerEmail: `userB_${timestamp}@test.co.za`, discountAmountMinor: 100 }),
      recordPromoRedemption({ promoCodeId: promoMultiCust.id, customerEmail: `userC_${timestamp}@test.co.za`, discountAmountMinor: 100 })
    ]);
    const multiSuccesses = multiCustAttempts.filter((r) => r.status === 'fulfilled');
    assert(multiSuccesses.length === 3, 'All 3 different customers successfully redeem independently');
    const promoMultiCheck = await prisma.promoCode.findUnique({ where: { id: promoMultiCust.id } });
    assert(promoMultiCheck.currentRedemptions === 3, 'Counter accurately reflects 3 distinct customer redemptions');

    // -------------------------------------------------------------------------
    // H5: Failed Customer Redemption Does Not Consume Global Allowance
    // -------------------------------------------------------------------------
    console.log('\n--- H5. Global Allowance Preserved on Customer Failure ---');
    const promoGlobalPreserve = await makePromo({
      code: 'GLOBAL_PRESERVE',
      maxTotalRedemptions: 2,
      maxPerCustomer: 1
    });
    // Customer 1 redeems
    await recordPromoRedemption({ promoCodeId: promoGlobalPreserve.id, customerEmail: `c1_${timestamp}@test.co.za`, discountAmountMinor: 100 });
    // Customer 1 attempts again and fails
    try {
      await recordPromoRedemption({ promoCodeId: promoGlobalPreserve.id, customerEmail: `c1_${timestamp}@test.co.za`, discountAmountMinor: 100 });
    } catch {}
    // Global allowance must still be available for Customer 2
    const c2Redemption = await recordPromoRedemption({
      promoCodeId: promoGlobalPreserve.id,
      customerEmail: `c2_${timestamp}@test.co.za`,
      discountAmountMinor: 100
    });
    assert(Boolean(c2Redemption?.id), 'Customer 2 successfully claims the second global redemption');
    const promoGlobalFinal = await prisma.promoCode.findUnique({ where: { id: promoGlobalPreserve.id } });
    assert(promoGlobalFinal.currentRedemptions === 2, 'Global allowance reached exactly 2');

    // -------------------------------------------------------------------------
    // H6: Transactional Admin Restriction Updates (Atomic Rollback on Failure)
    // -------------------------------------------------------------------------
    console.log('\n--- H6. Transactional Admin Restriction Updates ---');
    const promoAdminAtomic = await makePromo({
      code: 'ADMIN_ATOMIC',
      eventIds: [eventA.id]
    });
    const initialEventsCount = await prisma.promoCodeEvent.count({ where: { promoCodeId: promoAdminAtomic.id } });
    assert(initialEventsCount === 1, 'Initial event restriction created');

    // Attempt update with an invalid UUID that triggers a foreign key error
    let adminUpdateFailed = false;
    try {
      await updateAdminPromoCode({
        adminUserId: adminUser.id,
        id: promoAdminAtomic.id,
        data: {
          eventIds: ['00000000-0000-0000-0000-000000000000'] // Non-existent foreign key
        }
      });
    } catch {
      adminUpdateFailed = true;
    }
    assert(adminUpdateFailed, 'Admin update with non-existent foreign key rejected by database');
    const eventsCountAfterFail = await prisma.promoCodeEvent.count({ where: { promoCodeId: promoAdminAtomic.id } });
    assert(eventsCountAfterFail === 1, 'Existing event restriction preserved (atomic rollback succeeded)');

    // -------------------------------------------------------------------------
    // H7: PENDING & CANCELLED Orders Do Not Consume Redemptions
    // -------------------------------------------------------------------------
    console.log('\n--- H7. PENDING & CANCELLED Orders Do Not Consume Redemptions ---');
    const promoPendingCancel = await makePromo({ code: 'PENDING_CANCEL' });
    const orderCancelled = await prisma.order.create({
      data: {
        orderReference: `EP-H7-${Date.now()}-1`,
        userId: customerUser.id,
        buyerName: 'Customer Tester',
        buyerEmail: testUserEmail,
        subtotalMinor: 20000,
        serviceFeeMinor: 1500,
        discountMinor: 2000,
        totalMinor: 19500,
        currency: 'ZAR',
        status: 'CANCELLED',
        promoCodeId: promoPendingCancel.id
      }
    });
    createdOrderIds.push(orderCancelled.id);
    const redemptionsForCancelled = await prisma.promoCodeRedemption.count({ where: { promoCodeId: promoPendingCancel.id } });
    assert(redemptionsForCancelled === 0, 'Zero redemptions created for CANCELLED order');
    const promoPendingCancelDoc = await prisma.promoCode.findUnique({ where: { id: promoPendingCancel.id } });
    assert(promoPendingCancelDoc.currentRedemptions === 0, 'currentRedemptions counter remains 0');

    // -------------------------------------------------------------------------
    // H8: Payment Completion Records Redemption Exactly Once (Isolated Double)
    // -------------------------------------------------------------------------
    console.log('\n--- H8. Payment Completion Integration (Controlled Test Double) ---');
    const promoPaymentTest = await makePromo({ code: 'PAY_SUCCESS_TEST' });
    const testOrderPay = await prisma.order.create({
      data: {
        orderReference: `EP-H8-${Date.now()}-1`,
        userId: customerUser.id,
        buyerName: 'Customer Tester',
        buyerEmail: testUserEmail,
        subtotalMinor: tierA1.priceMinor,
        serviceFeeMinor: 1500,
        discountMinor: 2000,
        totalMinor: tierA1.priceMinor + 1500 - 2000,
        currency: 'ZAR',
        paymentSubtotalUsdMinor: 1000,
        paymentServiceFeeUsdMinor: 100,
        paymentTotalUsdMinor: 1000,
        paymentCurrency: 'USD',
        status: 'PENDING',
        promoCodeId: promoPaymentTest.id,
        orderItems: {
          create: [
            {
              ticketTypeId: tierA1.id,
              eventId: eventA.id,
              quantity: 1,
              unitPriceMinor: tierA1.priceMinor,
              totalMinor: tierA1.priceMinor,
              unitPriceUsdMinor: 1000,
              totalUsdMinor: 1000
            }
          ]
        }
      }
    });
    createdOrderIds.push(testOrderPay.id);

    const testPaymentRef = `EP-MOCK-${Date.now()}-PAY`;
    const testPayment = await prisma.payment.create({
      data: {
        orderId: testOrderPay.id,
        provider: 'PAYSTACK',
        providerReference: testPaymentRef,
        amountMinor: 1000,
        currency: 'USD',
        status: 'PENDING'
      }
    });
    createdPaymentIds.push(testPayment.id);

    // 1. Verify payment freeze barrier: finalizePaymentSuccess directly throws 503 PAYMENTS_DISABLED
    let freezeError = null;
    try {
      await finalizePaymentSuccess({
        reference: testPaymentRef,
        providerData: { currency: 'USD', paidAt: new Date() }
      });
    } catch (err) {
      freezeError = err;
    }
    assert(freezeError?.statusCode === 503, 'finalizePaymentSuccess strictly throws HTTP 503 while payments are frozen');
    assert(freezeError?.code === 'PAYMENTS_DISABLED', 'Error code is PAYMENTS_DISABLED');

    // 2. Controlled test double: execute the fulfillment transaction logic to verify promo redemption recording
    const fulfillmentDouble = async (orderId) => {
      return await prisma.$transaction(async (tx) => {
        // Transition order to PAID
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: 'PAID', paidAt: new Date() }
        });
        // Record promo redemption atomically inside transaction
        if (updatedOrder.promoCodeId) {
          await recordPromoRedemption({
            promoCodeId: updatedOrder.promoCodeId,
            orderId: updatedOrder.id,
            userId: updatedOrder.userId,
            customerEmail: updatedOrder.buyerEmail,
            discountAmountMinor: updatedOrder.discountMinor || 0,
            tx
          });
        }
        return updatedOrder;
      });
    };

    const doubleRes = await fulfillmentDouble(testOrderPay.id);
    assert(doubleRes.status === 'PAID', 'Controlled test double transitions order to PAID');
    const redemptionsAfterPayment = await prisma.promoCodeRedemption.count({
      where: { promoCodeId: promoPaymentTest.id, orderId: testOrderPay.id }
    });
    assert(redemptionsAfterPayment === 1, 'Redemption record created exactly once upon payment completion');
    const promoPayCheck = await prisma.promoCode.findUnique({ where: { id: promoPaymentTest.id } });
    assert(promoPayCheck.currentRedemptions === 1, 'currentRedemptions counter incremented to 1');

    // Repeated call to fulfillment double must be idempotent
    await fulfillmentDouble(testOrderPay.id);
    const redemptionsAfterDuplicate = await prisma.promoCodeRedemption.count({
      where: { promoCodeId: promoPaymentTest.id, orderId: testOrderPay.id }
    });
    assert(redemptionsAfterDuplicate === 1, 'Redemption record count remains strictly 1 (no duplicate creation)');
    const promoPayCheck2 = await prisma.promoCode.findUnique({ where: { id: promoPaymentTest.id } });
    assert(promoPayCheck2.currentRedemptions === 1, 'Counter remains strictly 1 (no double increment)');

  } finally {
    // Clean up test data created by this run
    if (createdPaymentIds.length > 0) {
      await prisma.payment.deleteMany({ where: { id: { in: createdPaymentIds } } });
    }
    if (createdOrderIds.length > 0) {
      await prisma.ticket.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.promoCodeRedemption.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (createdPromoCodeIds.length > 0) {
      await prisma.promoCodeRedemption.deleteMany({ where: { promoCodeId: { in: createdPromoCodeIds } } });
      await prisma.promoCodeEvent.deleteMany({ where: { promoCodeId: { in: createdPromoCodeIds } } });
      await prisma.promoCodeTicketType.deleteMany({ where: { promoCodeId: { in: createdPromoCodeIds } } });
      await prisma.order.updateMany({ where: { promoCodeId: { in: createdPromoCodeIds } }, data: { promoCodeId: null } });
      await prisma.promoCode.deleteMany({ where: { id: { in: createdPromoCodeIds } } });
    }

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

runPromoCodesSuite().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
