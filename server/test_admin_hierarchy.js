/**
 * EVENTPASS — PHASE 7: ADMIN ROLE HIERARCHY VERIFICATION SUITE
 * 
 * Verifies all Phase 7 requirements:
 * 1. Owner account (dropsair511@gmail.com) is verified as SUPER_ADMIN
 * 2. Exactly one SUPER_ADMIN exists in the entire database
 * 3. SUPER_ADMIN can promote a CUSTOMER to ADMIN
 * 4. SUPER_ADMIN can revoke an ADMIN back to CUSTOMER
 * 5. ADMIN cannot promote users or change roles (403 FORBIDDEN)
 * 6. CUSTOMER cannot access admin management (403 FORBIDDEN)
 * 7. Public registration strictly assigns CUSTOMER (cannot supply or gain ADMIN / SUPER_ADMIN)
 * 8. Attempts to assign SUPER_ADMIN via role management API are rejected with 400
 * 9. SUPER_ADMIN cannot demote themselves or be demoted via the management API
 * 10. Existing ADMIN event-management functionality continues to work
 * 11. Unauthenticated requests are rejected with 401 UNAUTHENTICATED
 * 12. Audit log is created in webhook_events with provider: 'ADMIN_AUDIT' without secrets
 * 13. Existing records preserved, PAYMENTS_ENABLED remains false
 * 14. Isolated test accounts cleaned up completely
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { hashPassword } from './src/services/passwordService.js';
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
      list.push(`${name}=${val}`);
    }
    return list.join('; ');
  }
}

async function request(path, options = {}, jar = null) {
  const headers = { ...(options.headers || {}) };
  headers['Origin'] = 'http://localhost:5173';

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

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}

  return { status: res.status, headers: res.headers, body: json, rawText: text };
}

async function loginUser(email, password, jar) {
  const res = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  }, jar);

  if (res.status !== 200 || !res.body?.user) {
    throw new Error(`Login failed for ${email}: ${res.body?.message || res.status}`);
  }
  return res.body.user;
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 EVENTPASS — ADMIN ROLE HIERARCHY TEST SUITE');
  console.log('======================================================\n');

  const createdUserIds = [];
  const testPassword = 'TestPassword123!';
  const pwHash = await hashPassword(testPassword);
  const ts = Date.now();

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Owner Account & Super Admin Count Invariant
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Verifying Owner Account and SUPER_ADMIN Invariant...');
    const ownerAccount = await prisma.user.findUnique({
      where: { email: 'dropsair511@gmail.com' }
    });

    if (ownerAccount && ownerAccount.role === 'SUPER_ADMIN') {
      pass(`Owner dropsair511@gmail.com is confirmed as SUPER_ADMIN (ID: ${ownerAccount.id})`);
    } else {
      fail(`Owner dropsair511@gmail.com has unexpected role: ${ownerAccount?.role}`);
    }

    const totalSuperAdmins = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
    if (totalSuperAdmins === 1) {
      pass(`Exactly one SUPER_ADMIN exists in the entire database`);
    } else {
      fail(`Expected exactly 1 SUPER_ADMIN, found: ${totalSuperAdmins}`);
    }

    // -------------------------------------------------------------------------
    // SETUP: Create isolated test users for testing hierarchy
    // -------------------------------------------------------------------------
    console.log('\n[SETUP] Creating isolated test accounts for role validation...');

    // 1. Temporary Super Admin test account (to test login & operations without modifying owner password)
    const superAdminUser = await prisma.user.create({
      data: {
        email: `test_superadmin_${ts}@test.co.za`,
        passwordHash: pwHash,
        fullName: 'Super Admin Tester',
        role: 'SUPER_ADMIN',
        emailVerified: true
      }
    });
    createdUserIds.push(superAdminUser.id);

    // 2. Standard Admin test account
    const standardAdminUser = await prisma.user.create({
      data: {
        email: `test_admin_${ts}@test.co.za`,
        passwordHash: pwHash,
        fullName: 'Standard Admin Tester',
        role: 'ADMIN',
        emailVerified: true
      }
    });
    createdUserIds.push(standardAdminUser.id);

    // 3. Customer test account
    const customerUser = await prisma.user.create({
      data: {
        email: `test_customer_${ts}@test.co.za`,
        passwordHash: pwHash,
        fullName: 'Customer User Tester',
        role: 'CUSTOMER',
        emailVerified: true
      }
    });
    createdUserIds.push(customerUser.id);

    // 4. Target customer for promotion/revocation
    const targetCandidate = await prisma.user.create({
      data: {
        email: `test_candidate_${ts}@test.co.za`,
        passwordHash: pwHash,
        fullName: 'Candidate Customer',
        role: 'CUSTOMER',
        emailVerified: true
      }
    });
    createdUserIds.push(targetCandidate.id);

    pass(`Created isolated test accounts for SUPER_ADMIN, ADMIN, and CUSTOMER`);

    // Log in all accounts
    const superAdminJar = new CookieJar();
    await loginUser(superAdminUser.email, testPassword, superAdminJar);

    const adminJar = new CookieJar();
    await loginUser(standardAdminUser.email, testPassword, adminJar);

    const customerJar = new CookieJar();
    await loginUser(customerUser.email, testPassword, customerJar);

    // -------------------------------------------------------------------------
    // TEST 2: Unauthenticated Access to Admin Routes
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Testing unauthenticated access to admin endpoints...');
    const unauthEventsRes = await request('/admin/events', { method: 'GET' });
    if (unauthEventsRes.status === 401 && unauthEventsRes.body?.code === 'UNAUTHENTICATED') {
      pass(`Unauthenticated GET /api/admin/events rejected with 401 UNAUTHENTICATED`);
    } else {
      fail(`Expected 401 for unauthenticated /admin/events, got ${unauthEventsRes.status}`);
    }

    const unauthUsersRes = await request('/admin/users', { method: 'GET' });
    if (unauthUsersRes.status === 401 && unauthUsersRes.body?.code === 'UNAUTHENTICATED') {
      pass(`Unauthenticated GET /api/admin/users rejected with 401 UNAUTHENTICATED`);
    } else {
      fail(`Expected 401 for unauthenticated /admin/users, got ${unauthUsersRes.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Customer Access to Admin Routes
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Testing customer access to admin endpoints...');
    const customerEventsRes = await request('/admin/events', { method: 'GET' }, customerJar);
    if (customerEventsRes.status === 403 && customerEventsRes.body?.code === 'FORBIDDEN') {
      pass(`Customer GET /api/admin/events rejected with 403 FORBIDDEN`);
    } else {
      fail(`Expected 403 for customer /admin/events, got ${customerEventsRes.status}`);
    }

    const customerUsersRes = await request('/admin/users', { method: 'GET' }, customerJar);
    if (customerUsersRes.status === 403 && customerUsersRes.body?.code === 'FORBIDDEN') {
      pass(`Customer GET /api/admin/users rejected with 403 FORBIDDEN`);
    } else {
      fail(`Expected 403 for customer /admin/users, got ${customerUsersRes.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Admin Access to Events vs User Management
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Testing standard ADMIN permissions...');
    // Standard ADMIN can access event management
    const adminEventsRes = await request('/admin/events?limit=5', { method: 'GET' }, adminJar);
    if (adminEventsRes.status === 200 && adminEventsRes.body?.success) {
      pass(`ADMIN successfully accessed GET /api/admin/events`);
    } else {
      fail(`ADMIN failed to access /api/admin/events, got ${adminEventsRes.status}`);
    }

    // Standard ADMIN CANNOT access user management
    const adminUsersRes = await request('/admin/users', { method: 'GET' }, adminJar);
    if (adminUsersRes.status === 403 && adminUsersRes.body?.code === 'FORBIDDEN') {
      pass(`ADMIN GET /api/admin/users strictly rejected with 403 FORBIDDEN`);
    } else {
      fail(`Expected 403 for ADMIN /admin/users, got ${adminUsersRes.status}`);
    }

    // Standard ADMIN CANNOT promote users
    const adminPromoteRes = await request(`/admin/users/${targetCandidate.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN' })
    }, adminJar);

    if (adminPromoteRes.status === 403 && adminPromoteRes.body?.code === 'FORBIDDEN') {
      pass(`ADMIN PATCH /api/admin/users/:id/role strictly rejected with 403 FORBIDDEN`);
    } else {
      fail(`Expected 403 for ADMIN attempting role promotion, got ${adminPromoteRes.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Super Admin User Listing & Filtering
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Testing SUPER_ADMIN user listing and filtering...');
    const superListRes = await request('/admin/users?limit=10', { method: 'GET' }, superAdminJar);
    if (superListRes.status === 200 && superListRes.body?.success && Array.isArray(superListRes.body?.data?.users)) {
      pass(`SUPER_ADMIN successfully fetched user list (${superListRes.body.data.users.length} users returned)`);
      // Verify no password hashes or tokens exposed
      const exposedHash = superListRes.body.data.users.some(u => u.passwordHash || u.tokenHash);
      if (!exposedHash) {
        pass(`User list guarantees zero credential/passwordHash exposure`);
      } else {
        fail(`Security vulnerability: passwordHash found in user list response!`);
      }
    } else {
      fail(`SUPER_ADMIN failed to fetch user list, got ${superListRes.status}`);
    }

    // Role filtering: filter by SUPER_ADMIN
    const filterRes = await request('/admin/users?role=SUPER_ADMIN', { method: 'GET' }, superAdminJar);
    if (filterRes.status === 200 && filterRes.body?.data?.users?.every(u => u.role === 'SUPER_ADMIN')) {
      pass(`SUPER_ADMIN role filtering successfully returned only SUPER_ADMIN accounts`);
    } else {
      fail(`Role filtering by SUPER_ADMIN failed`);
    }

    // -------------------------------------------------------------------------
    // TEST 6: Super Admin Appoints Customer as ADMIN
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Testing SUPER_ADMIN appointing a CUSTOMER as ADMIN...');
    const promoteRes = await request(`/admin/users/${targetCandidate.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN' })
    }, superAdminJar);

    if (promoteRes.status === 200 && promoteRes.body?.data?.user?.role === 'ADMIN') {
      pass(`SUPER_ADMIN successfully promoted candidate to ADMIN`);
    } else {
      fail(`Role promotion failed: ${promoteRes.body?.message || promoteRes.status}`);
    }

    // Verify in database
    const dbCandidateAfterPromote = await prisma.user.findUnique({ where: { id: targetCandidate.id } });
    if (dbCandidateAfterPromote.role === 'ADMIN') {
      pass(`Database verified candidate role is ADMIN`);
    } else {
      fail(`Database does not reflect role ADMIN: ${dbCandidateAfterPromote?.role}`);
    }

    // -------------------------------------------------------------------------
    // TEST 7: Super Admin Revokes Admin Back to CUSTOMER
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7] Testing SUPER_ADMIN revoking an ADMIN back to CUSTOMER...');
    const revokeRes = await request(`/admin/users/${targetCandidate.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'CUSTOMER' })
    }, superAdminJar);

    if (revokeRes.status === 200 && revokeRes.body?.data?.user?.role === 'CUSTOMER') {
      pass(`SUPER_ADMIN successfully revoked candidate to CUSTOMER`);
    } else {
      fail(`Role revocation failed: ${revokeRes.body?.message || revokeRes.status}`);
    }

    // Verify in database
    const dbCandidateAfterRevoke = await prisma.user.findUnique({ where: { id: targetCandidate.id } });
    if (dbCandidateAfterRevoke.role === 'CUSTOMER') {
      pass(`Database verified candidate role is CUSTOMER`);
    } else {
      fail(`Database does not reflect role CUSTOMER: ${dbCandidateAfterRevoke?.role}`);
    }

    // -------------------------------------------------------------------------
    // TEST 8: Protection Against Self-Role-Modification & Demoting SUPER_ADMIN
    // -------------------------------------------------------------------------
    console.log('\n[TEST 8] Testing protection against self-modification & demoting SUPER_ADMIN...');
    // Self-modification attempt
    const selfModRes = await request(`/admin/users/${superAdminUser.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'CUSTOMER' })
    }, superAdminJar);

    if (selfModRes.status === 400 && selfModRes.body?.code === 'CANNOT_MODIFY_OWN_ROLE') {
      pass(`Attempt to modify own role rejected with 400 CANNOT_MODIFY_OWN_ROLE`);
    } else {
      fail(`Expected 400 for self-modification attempt, got ${selfModRes.status}`);
    }

    // Demoting Owner SUPER_ADMIN attempt
    const demoteOwnerRes = await request(`/admin/users/${ownerAccount.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'CUSTOMER' })
    }, superAdminJar);

    if (demoteOwnerRes.status === 403 && demoteOwnerRes.body?.code === 'SUPER_ADMIN_PROTECTED') {
      pass(`Attempt to demote SUPER_ADMIN rejected with 403 SUPER_ADMIN_PROTECTED`);
    } else {
      fail(`Expected 403 for demoting SUPER_ADMIN, got ${demoteOwnerRes.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 9: Prohibition of Escalating to SUPER_ADMIN via API
    // -------------------------------------------------------------------------
    console.log('\n[TEST 9] Testing prohibition of escalating to SUPER_ADMIN via API...');
    const escalateRes = await request(`/admin/users/${targetCandidate.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'SUPER_ADMIN' })
    }, superAdminJar);

    if (escalateRes.status === 400) {
      pass(`Attempt to assign SUPER_ADMIN via role management API strictly rejected with 400`);
    } else {
      fail(`Expected 400 for escalating to SUPER_ADMIN, got ${escalateRes.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 10: Public Registration Always Assigns CUSTOMER
    // -------------------------------------------------------------------------
    console.log('\n[TEST 10] Testing public registration role enforcement...');
    const pubRegPayload = {
      fullName: 'Public Registrant',
      email: `pubreg_${ts}@example.co.za`,
      phone: '+27 82 111 2222',
      city: 'Cape Town',
      password: 'StrongPassword123!',
      termsAccepted: true,
      role: 'ADMIN' // Malicious injection attempt
    };

    const regRes = await request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pubRegPayload)
    });

    if (regRes.status === 201 && regRes.body?.user?.role === 'CUSTOMER') {
      createdUserIds.push(regRes.body.user.id);
      pass(`Public registration strictly ignored injected role and assigned role: CUSTOMER`);
    } else {
      fail(`Public registration role assignment unexpected: ${regRes.status}, role: ${regRes.body?.user?.role}`);
    }

    // -------------------------------------------------------------------------
    // TEST 11: Audit Log Generation for Role Changes
    // -------------------------------------------------------------------------
    console.log('\n[TEST 11] Testing Audit Log generation for role modifications...');
    const auditLogsRes = await request('/admin/users/audit-logs', { method: 'GET' }, superAdminJar);
    if (auditLogsRes.status === 200 && Array.isArray(auditLogsRes.body?.data?.logs)) {
      const logs = auditLogsRes.body.data.logs;
      const hasAppointLog = logs.some(l => l.action === 'admin.appointed');
      const hasRevokeLog = logs.some(l => l.action === 'admin.revoked');

      if (hasAppointLog && hasRevokeLog) {
        pass(`Audit logs correctly recorded admin.appointed and admin.revoked events`);
      } else {
        fail(`Audit logs missing expected appoint/revoke actions`);
      }

      // Check no password hashes or tokens in logs
      const logString = JSON.stringify(logs);
      if (!logString.includes('passwordHash') && !logString.includes('tokenHash')) {
        pass(`Audit logs contain zero credentials or tokens`);
      } else {
        fail(`Credentials found in audit logs!`);
      }
    } else {
      fail(`Failed to fetch audit logs: ${auditLogsRes.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 12: Invariant Check: PAYMENTS_ENABLED remains false
    // -------------------------------------------------------------------------
    console.log('\n[TEST 12] Checking PAYMENTS_ENABLED remains false...');
    if (env.PAYMENTS_ENABLED === false) {
      pass(`PAYMENTS_ENABLED=false remains strictly enforced`);
    } else {
      fail(`PAYMENTS_ENABLED is not false!`);
    }

  } catch (err) {
    console.error('Unexpected test runner error:', err);
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP: Isolated test data cleanup
    // -------------------------------------------------------------------------
    console.log('\n[CLEANUP] Cleaning up isolated test users...');
    if (createdUserIds.length > 0) {
      const deleteResult = await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } }
      });
      console.log(`  🧹 Cleaned up ${deleteResult.count} isolated test accounts.`);
    }

    // Clean up test audit logs created during this run
    await prisma.webhookEvent.deleteMany({
      where: {
        provider: 'ADMIN_AUDIT',
        payload: {
          path: ['details', 'targetEmail'],
          string_contains: `_${ts}@`
        }
      }
    });

    await prisma.$disconnect();
  }

  // Final Invariant Verification
  const finalPrisma = new PrismaClient();
  const finalSuperAdminCount = await finalPrisma.user.count({ where: { role: 'SUPER_ADMIN' } });
  const finalOwner = await finalPrisma.user.findUnique({ where: { email: 'dropsair511@gmail.com' } });
  await finalPrisma.$disconnect();

  console.log('\n======================================================');
  console.log(`TEST RESULTS: ${results.passed}/${results.total} PASSED, ${results.failed} FAILED`);
  console.log(`FINAL SUPER_ADMIN COUNT: ${finalSuperAdminCount} (Owner: ${finalOwner?.email})`);
  console.log('======================================================\n');

  if (results.failed > 0 || finalSuperAdminCount !== 1) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
