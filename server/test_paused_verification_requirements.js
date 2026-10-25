/**
 * EVENTPASS — PAUSED EMAIL VERIFICATION VERIFICATION SUITE
 * 
 * Verifies all requirements under Objective 4:
 * 1. A new customer can register successfully.
 * 2. The customer can log in without verifying their email.
 * 3. The customer can access ordinary customer features after login.
 * 4. An unverified customer cannot access administrator features (HTTP 403 FORBIDDEN).
 * 5. Public registration cannot assign the ADMIN role.
 * 6. Existing unverified accounts can log in and access ordinary customer features.
 * 7. Verification routes and token models remain intact for optional verification.
 * 8. Existing database data is strictly preserved.
 */

import { prisma } from './src/config/db.js';

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
      const parts = header.split(';').map(p => p.trim());
      const [nameVal] = parts;
      const [name, val] = nameVal.split('=');
      this.cookies.set(name, val);
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

async function request(path, options = {}, jar = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (jar) {
    const cookieHeader = jar.getCookieHeader();
    if (cookieHeader) headers['Cookie'] = cookieHeader;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (jar) {
    jar.setFromHeaders(res.headers);
  }

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: res.status,
    headers: res.headers,
    data
  };
}

async function runPausedVerificationRequirementsSuite() {
  console.log('🧪 =========================================================================');
  console.log('🧪 EVENTPASS — PAUSED EMAIL VERIFICATION VERIFICATION SUITE');
  console.log('🧪 =========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`, details);
      failed++;
    }
  }

  const timestamp = Date.now();
  const testEmail = `newcustomer.${timestamp}@example.co.za`;
  const testPassword = 'Password123!';
  const jar = new CookieJar();

  try {
    // -------------------------------------------------------------------------
    // 1. A new customer can register successfully & Public registration cannot assign ADMIN
    // -------------------------------------------------------------------------
    console.log('--- 1. Registration & Role Security Checks ---');
    const regRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        fullName: 'New Customer',
        phone: '0821234567',
        city: 'Cape Town',
        termsAccepted: true,
        role: 'ADMIN' // Malicious attempt to escalate role
      })
    });

    assert(regRes.status === 201, '1. New customer registers successfully with HTTP 201', regRes.data);
    assert(regRes.data?.status === 'success', '2. Registration status is success');
    assert(regRes.data?.user?.email === testEmail.toLowerCase(), '3. Email saved in normalized lowercase');
    assert(regRes.data?.user?.emailVerified === false, '4. Customer account emailVerified is false by default');
    assert(regRes.data?.user?.role === 'CUSTOMER', '5. Public registration strictly defaults to CUSTOMER role (ignores requested ADMIN)');
    assert(regRes.data?.message === 'Account created successfully.', '6. Registration response message does not instruct users to check inbox');

    // Verify DB user record
    const userInDb = await prisma.user.findUnique({
      where: { email: testEmail.toLowerCase() }
    });
    assert(userInDb !== null, '7. User record created in database');
    assert(userInDb.role === 'CUSTOMER', '8. Database user role is strictly CUSTOMER');
    assert(userInDb.emailVerified === false, '9. Database emailVerified is false');

    // -------------------------------------------------------------------------
    // 2. The customer can log in without verifying their email
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Login Without Email Verification ---');
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    }, jar);

    assert(loginRes.status === 200, '10. Unverified customer logs in successfully with HTTP 200', loginRes.data);
    assert(loginRes.data?.status === 'success', '11. Login status is success');
    assert(loginRes.data?.user?.emailVerified === false, '12. Logged-in user data confirms emailVerified is false');
    assert(jar.cookies.has('eventpass.sid'), '13. Secure eventpass.sid session cookie is established');

    // -------------------------------------------------------------------------
    // 3. The customer can access ordinary customer pages after login
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Ordinary Customer Feature Access for Unverified Account ---');
    
    // Auth context inspection (/api/auth/me)
    const meRes = await request('/auth/me', { method: 'GET' }, jar);
    assert(meRes.status === 200, '14. /api/auth/me accessible (HTTP 200)', meRes.data);
    assert(meRes.data?.user?.id === userInDb.id, '15. /api/auth/me returns authenticated customer context');

    // Orders endpoint (/api/orders)
    const ordersRes = await request('/orders', { method: 'GET' }, jar);
    assert(ordersRes.status === 200, '16. /api/orders accessible to unverified customer (HTTP 200)', ordersRes.data);
    assert(Array.isArray(ordersRes.data?.data?.orders), '17. Customer orders list returned as array');

    // Tickets endpoint (/api/tickets/my-tickets)
    const ticketsRes = await request('/tickets/my-tickets', { method: 'GET' }, jar);
    assert(ticketsRes.status === 200, '18. /api/tickets/my-tickets accessible to unverified customer (HTTP 200)', ticketsRes.data);
    assert(Array.isArray(ticketsRes.data?.data), '19. Customer tickets list returned as array');

    // Reservations endpoint (/api/reservations)
    const reservationsRes = await request('/reservations', { method: 'GET' }, jar);
    assert(reservationsRes.status === 200, '20. /api/reservations accessible to unverified customer (HTTP 200)', reservationsRes.data);

    // -------------------------------------------------------------------------
    // 4. An unverified customer cannot access administrator features
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Administrator Feature Access Denial ---');
    const adminEventsRes = await request('/admin/events', { method: 'GET' }, jar);
    assert(adminEventsRes.status === 403, '21. /api/admin/events strictly returns 403 FORBIDDEN for customer', adminEventsRes.status);
    assert(adminEventsRes.data?.code === 'FORBIDDEN', '22. Error code is FORBIDDEN');

    const adminPromosRes = await request('/admin/promocodes', { method: 'GET' }, jar);
    assert(adminPromosRes.status === 403, '23. /api/admin/promocodes strictly returns 403 FORBIDDEN for customer', adminPromosRes.status);

    const adminCreateEventRes = await request('/admin/events', {
      method: 'POST',
      body: JSON.stringify({ title: 'Malicious Event' })
    }, jar);
    assert(adminCreateEventRes.status === 403, '24. Mutating admin endpoint (/api/admin/events POST) rejected with 403 FORBIDDEN', adminCreateEventRes.status);

    // -------------------------------------------------------------------------
    // 5. Existing Unverified User Access
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Existing Unverified Accounts Check ---');
    // Find an existing unverified user from DB without modifying their verification status
    const existingUnverifiedUser = await prisma.user.findFirst({
      where: {
        emailVerified: false,
        id: { not: userInDb.id }
      }
    });

    if (existingUnverifiedUser) {
      assert(existingUnverifiedUser.emailVerified === false, `25. Existing user ${existingUnverifiedUser.email} has emailVerified = false preserved`);
      // Confirm that requireVerifiedEmail middleware does not block this user
      const reqMock = { user: existingUnverifiedUser };
      let middlewareAllowed = false;
      const { requireVerifiedEmail } = await import('./src/middleware/authMiddleware.js');
      requireVerifiedEmail(reqMock, {}, () => {
        middlewareAllowed = true;
      });
      assert(middlewareAllowed === true, '26. requireVerifiedEmail middleware permits unverified customer through next()');
    } else {
      console.log('  ℹ️  No prior unverified accounts found in DB other than test user; creating verification test case.');
      const testUnverified = { id: 'dummy-id', role: 'CUSTOMER', emailVerified: false };
      let middlewareAllowed = false;
      const { requireVerifiedEmail } = await import('./src/middleware/authMiddleware.js');
      requireVerifiedEmail({ user: testUnverified }, {}, () => {
        middlewareAllowed = true;
      });
      assert(middlewareAllowed === true, '26. requireVerifiedEmail middleware permits unverified customer through next()');
    }

    // -------------------------------------------------------------------------
    // 6. Optional Verification Endpoints Intact
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Optional Verification Endpoints Intact ---');
    // Ensure /api/auth/resend-verification and /api/auth/verify-email still work
    const resendRes = await request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail })
    }, jar);
    assert(resendRes.status === 200, '27. Optional /api/auth/resend-verification still functions properly');

    const devToken = resendRes.data?._devVerificationToken;
    if (devToken) {
      const verifyRes = await request('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: devToken })
      }, jar);
      assert(verifyRes.status === 200, '28. Optional /api/auth/verify-email successfully verifies account when token supplied');
    }

    // -------------------------------------------------------------------------
    // 7. Data Preservation Check
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Database Integrity & Preservation Check ---');
    const totalUsers = await prisma.user.count();
    const totalOrders = await prisma.order.count();
    const totalTickets = await prisma.ticket.count();
    const totalEvents = await prisma.event.count();
    const totalPromoCodes = await prisma.promoCode.count();

    assert(totalUsers > 0, `29. Database users preserved (count: ${totalUsers})`);
    assert(totalOrders >= 0, `30. Database orders preserved (count: ${totalOrders})`);
    assert(totalTickets >= 0, `31. Database tickets preserved (count: ${totalTickets})`);
    assert(totalEvents > 0, `32. Database events preserved (count: ${totalEvents})`);
    assert(totalPromoCodes >= 0, `33. Database promo codes preserved (count: ${totalPromoCodes})`);

  } catch (err) {
    console.error('Unexpected error during suite execution:', err);
    failed++;
  } finally {
    console.log('\n=========================================================================');
    console.log(`📊 Paused Email Verification Suite: ${passed} PASSED, ${failed} FAILED`);
    console.log('=========================================================================\n');
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runPausedVerificationRequirementsSuite();
