/**
 * EVENTPASS — PHASE 5 POST-CLEANUP VERIFICATION TEST SUITE
 * 
 * Validates:
 * 1. Exactly one SUPER_ADMIN exists: dropsair511@gmail.com
 * 2. No other ADMIN accounts remain (count === 0)
 * 3. No other active/usable CUSTOMER accounts remain
 * 4. All 653 historical customer accounts are safely disabled (hashes destroyed, emails anonymized, tokens purged)
 * 5. Business records preserved: 1,115 orders, 419 tickets, 1,554 reservations, 698 payments, 153 events
 * 6. Zero foreign-key violations / zero orphaned business records
 * 7. Server settings: REGISTRATION_ENABLED=false, PAYMENTS_ENABLED=false
 * 8. Live HTTP: Registration endpoint rejects registrations with 403 REGISTRATION_DISABLED
 * 9. Live HTTP: Disabled accounts cannot authenticate (401 UNAUTHENTICATED)
 * 10. Live HTTP: Super Admin can access /auth/me, /admin/users, /admin/events, /admin/promocodes via session
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { env } from './src/config/env.js';

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:5000/api';

const results = {
  passed: 0,
  failed: 0,
  total: 0
};

const pass = (desc) => {
  results.passed++;
  results.total++;
  console.log(`  ✅ [PASS] ${desc}`);
};

const fail = (desc, err) => {
  results.failed++;
  results.total++;
  console.error(`  ❌ [FAIL] ${desc}`);
  if (err) console.error(`     Error: ${err.message || JSON.stringify(err)}`);
};

async function runVerification() {
  console.log('\n======================================================');
  console.log('🔍 EVENTPASS — POST-CLEANUP VERIFICATION SUITE');
  console.log('======================================================\n');

  try {
    // -------------------------------------------------------------------------
    // CHECK 1: Database Account Invariants
    // -------------------------------------------------------------------------
    console.log('[SECTION 1] Database User Account Invariants...');

    const superAdmins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' } });
    if (superAdmins.length === 1 && superAdmins[0].email === 'dropsair511@gmail.com') {
      pass(`Exactly one SUPER_ADMIN exists: dropsair511@gmail.com (ID: ${superAdmins[0].id})`);
    } else {
      fail(`Expected exactly 1 SUPER_ADMIN (dropsair511@gmail.com), found: ${superAdmins.length}`);
    }

    if (superAdmins[0]?.passwordHash?.startsWith('$argon2id$')) {
      pass(`SUPER_ADMIN account retains valid Argon2id password hash`);
    } else {
      fail(`SUPER_ADMIN password hash is missing or corrupted`);
    }

    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    if (admins.length === 0) {
      pass(`No other ADMIN accounts remain (count: 0)`);
    } else {
      fail(`Expected 0 ADMIN accounts, found: ${admins.length}`);
    }

    const totalUsers = await prisma.user.count();
    const customers = await prisma.user.findMany({ where: { role: 'CUSTOMER' } });
    if (totalUsers === 654 && customers.length === 653) {
      pass(`Total accounts: 654 (1 SUPER_ADMIN + 653 historical disabled CUSTOMERs)`);
    } else {
      fail(`Expected 654 total users and 653 customers, found: total=${totalUsers}, customers=${customers.length}`);
    }

    // Verify all 653 customers have destroyed password hashes and anonymized emails
    const activeCustomers = customers.filter(c => !c.passwordHash?.startsWith('!DISABLED_ACCOUNT_'));
    if (activeCustomers.length === 0) {
      pass(`All 653 customer accounts have destroyed password hashes (!DISABLED_ACCOUNT_...)`);
    } else {
      fail(`Found ${activeCustomers.length} customer accounts with active/non-disabled password hashes!`);
    }

    const nonAnonymizedEmails = customers.filter(c => !c.email.endsWith('@archived.eventpass.local'));
    if (nonAnonymizedEmails.length === 0) {
      pass(`All 653 customer accounts have anonymized archived emails (@archived.eventpass.local)`);
    } else {
      fail(`Found ${nonAnonymizedEmails.length} customer accounts with non-anonymized emails`);
    }

    // Verify auth tokens are cleared for all customer accounts
    const customersWithTokens = await prisma.authToken.count({
      where: {
        user: { role: 'CUSTOMER' }
      }
    });
    if (customersWithTokens === 0) {
      pass(`All customer auth tokens (email verification & password reset) are completely purged (0 remaining)`);
    } else {
      fail(`Found ${customersWithTokens} customer accounts with leftover auth tokens`);
    }

    // -------------------------------------------------------------------------
    // CHECK 2: Historical Business Records Integrity
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 2] Historical Business Records Integrity...');

    const orderCount = await prisma.order.count();
    if (orderCount === 1115) {
      pass(`Orders preserved intact: ${orderCount}`);
    } else {
      fail(`Orders count mismatch! Expected 1115, got: ${orderCount}`);
    }

    const ticketCount = await prisma.ticket.count();
    if (ticketCount === 419) {
      pass(`Tickets preserved intact: ${ticketCount}`);
    } else {
      fail(`Tickets count mismatch! Expected 419, got: ${ticketCount}`);
    }

    const reservationCount = await prisma.reservation.count();
    if (reservationCount === 1554) {
      pass(`Reservations preserved intact: ${reservationCount}`);
    } else {
      fail(`Reservations count mismatch! Expected 1554, got: ${reservationCount}`);
    }

    const paymentCount = await prisma.payment.count();
    if (paymentCount === 698) {
      pass(`Payments preserved intact: ${paymentCount}`);
    } else {
      fail(`Payments count mismatch! Expected 698, got: ${paymentCount}`);
    }

    const eventCount = await prisma.event.count();
    if (eventCount === 153) {
      pass(`Events preserved intact: ${eventCount}`);
    } else {
      fail(`Events count mismatch! Expected 153, got: ${eventCount}`);
    }

    const ticketTypeCount = await prisma.ticketType.count();
    if (ticketTypeCount === 658) {
      pass(`Ticket Types preserved intact: ${ticketTypeCount}`);
    } else {
      fail(`Ticket Types count mismatch! Expected 658, got: ${ticketTypeCount}`);
    }

    // Check for orphaned records
    const orphanedOrders = await prisma.$queryRaw`
      SELECT o.id FROM "orders" o LEFT JOIN "users" u ON o."userId" = u.id WHERE u.id IS NULL
    `;
    if (orphanedOrders.length === 0) {
      pass(`Zero orphaned orders (foreign key constraint intact)`);
    } else {
      fail(`Found ${orphanedOrders.length} orphaned orders!`);
    }

    const orphanedTickets = await prisma.$queryRaw`
      SELECT t.id FROM "tickets" t LEFT JOIN "users" u ON t."userId" = u.id WHERE u.id IS NULL
    `;
    if (orphanedTickets.length === 0) {
      pass(`Zero orphaned tickets (foreign key constraint intact)`);
    } else {
      fail(`Found ${orphanedTickets.length} orphaned tickets!`);
    }

    // -------------------------------------------------------------------------
    // CHECK 3: Environment Settings & Frozen State
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 3] Environment Settings & Security Controls...');

    if (env.REGISTRATION_ENABLED === false) {
      pass(`REGISTRATION_ENABLED is false in server configuration`);
    } else {
      fail(`REGISTRATION_ENABLED is not false: ${env.REGISTRATION_ENABLED}`);
    }

    if (env.PAYMENTS_ENABLED === false) {
      pass(`PAYMENTS_ENABLED remains false`);
    } else {
      fail(`PAYMENTS_ENABLED is not false: ${env.PAYMENTS_ENABLED}`);
    }

    // -------------------------------------------------------------------------
    // CHECK 4: Live HTTP API Tests
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 4] Live HTTP API & Security Tests...');

    // 1. Health check
    const healthRes = await fetch(`${API_BASE}/health`);
    if (healthRes.status === 200) {
      pass(`Backend API is alive at ${API_BASE}/health (Status: 200)`);
    } else {
      fail(`Backend health check failed: status ${healthRes.status}`);
    }

    // 2. Public Registration Endpoint is Disabled
    const regPayload = {
      fullName: 'Intruder Attempt',
      email: 'intruder@example.com',
      password: 'StrongPassword123!',
      phone: '0821234567',
      city: 'Cape Town',
      termsAccepted: true
    };
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify(regPayload)
    });
    const regBody = await regRes.json();

    if (regRes.status === 403 && regBody.code === 'REGISTRATION_DISABLED') {
      pass(`Registration endpoint properly rejects new registrations (Status: 403, Code: REGISTRATION_DISABLED, Message: "${regBody.message}")`);
    } else {
      fail(`Registration was not rejected with 403 REGISTRATION_DISABLED! Status: ${regRes.status}, Body: ${JSON.stringify(regBody)}`);
    }

    // 3. Disabled customer login attempt
    const disabledSample = customers[0];
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({
        email: disabledSample.email,
        password: 'AnyPassword123!'
      })
    });
    if (loginRes.status === 401) {
      pass(`Disabled customer account cannot log in (Status: 401 UNAUTHENTICATED)`);
    } else {
      fail(`Disabled customer login gave unexpected status: ${loginRes.status}`);
    }

    // 4. Unauthenticated Admin endpoint access
    const unauthAdmin = await fetch(`${API_BASE}/admin/users`);
    if (unauthAdmin.status === 401) {
      pass(`Unauthenticated request to /admin/users rejected (Status: 401)`);
    } else {
      fail(`Unauthenticated /admin/users gave unexpected status: ${unauthAdmin.status}`);
    }

    // 5. SUPER_ADMIN session authentication & admin endpoints access
    const ownerSession = await prisma.$queryRaw`
      SELECT sid, sess FROM "session" WHERE sess::text LIKE '%7bce4fa8-cc93-4777-a7c9-b493cbabd721%' LIMIT 1
    `;

    if (ownerSession.length > 0) {
      const ownerSid = ownerSession[0].sid;
      // Generate signed express-session cookie
      const signature = crypto.createHmac('sha256', env.SESSION_SECRET).update(ownerSid).digest('base64').replace(/=+$/, '');
      const cookieHeader = `eventpass.sid=s%3A${ownerSid}.${signature}`;

      // Check /auth/me
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Cookie': cookieHeader,
          'Origin': 'http://localhost:5173'
        }
      });
      const meData = await meRes.json();
      if (meRes.status === 200 && meData.user?.email === 'dropsair511@gmail.com' && meData.user?.role === 'SUPER_ADMIN') {
        pass(`SUPER_ADMIN session verified via /auth/me (User: ${meData.user.email}, Role: ${meData.user.role})`);
      } else {
        fail(`SUPER_ADMIN session check failed via /auth/me: ${meRes.status} ${JSON.stringify(meData)}`);
      }

      // Check /admin/users (SUPER_ADMIN only)
      const usersRes = await fetch(`${API_BASE}/admin/users`, {
        headers: {
          'Cookie': cookieHeader,
          'Origin': 'http://localhost:5173'
        }
      });
      const usersData = await usersRes.json();
      if (usersRes.status === 200 && Array.isArray(usersData.data?.users)) {
        pass(`SUPER_ADMIN successfully accesses /admin/users (Returned ${usersData.data.users.length} users on page 1, total: ${usersData.data.total})`);
      } else {
        fail(`SUPER_ADMIN failed to access /admin/users: ${usersRes.status} ${JSON.stringify(usersData)}`);
      }

      // Check /admin/events (ADMIN or SUPER_ADMIN)
      const eventsRes = await fetch(`${API_BASE}/admin/events`, {
        headers: {
          'Cookie': cookieHeader,
          'Origin': 'http://localhost:5173'
        }
      });
      const eventsData = await eventsRes.json();
      if (eventsRes.status === 200 && Array.isArray(eventsData.data?.items)) {
        pass(`SUPER_ADMIN successfully accesses /admin/events (Returned ${eventsData.data.items.length} events on page 1, total: ${eventsData.data.total})`);
      } else {
        fail(`SUPER_ADMIN failed to access /admin/events: ${eventsRes.status} ${JSON.stringify(eventsData)}`);
      }

      // Check /admin/promocodes (ADMIN or SUPER_ADMIN)
      const promoRes = await fetch(`${API_BASE}/admin/promocodes`, {
        headers: {
          'Cookie': cookieHeader,
          'Origin': 'http://localhost:5173'
        }
      });
      const promoData = await promoRes.json();
      if (promoRes.status === 200 && Array.isArray(promoData.data?.items)) {
        pass(`SUPER_ADMIN successfully accesses /admin/promocodes (Returned ${promoData.data.items.length} promo codes, total: ${promoData.data.total})`);
      } else {
        fail(`SUPER_ADMIN failed to access /admin/promocodes: ${promoRes.status} ${JSON.stringify(promoData)}`);
      }
    } else {
      fail(`Could not find active owner session in database`);
    }

  } catch (err) {
    fail(`Unhandled exception in verification suite`, err);
  } finally {
    await prisma.$disconnect();
    console.log('\n======================================================');
    console.log(`VERIFICATION SUMMARY: ${results.passed}/${results.total} PASSED, ${results.failed} FAILED`);
    console.log('======================================================\n');
  }
}

runVerification();
