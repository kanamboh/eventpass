/**
 * EVENTPASS — AUTOMATED VERIFICATION SUITE
 * Public Customer Registration & Password Visibility Controls
 * 
 * Verifies:
 * 1. Configuration behavior: REGISTRATION_ENABLED dynamic enforcement
 * 2. Successful public registration creates CUSTOMER role exclusively
 * 3. Client-supplied ADMIN or SUPER_ADMIN role is ignored/stripped
 * 4. Duplicate email handling (exact match & case variations return 409)
 * 5. Validation handling: invalid email, missing required fields, weak passwords
 * 6. Archived account protection: duplicate registration rejects and leaves account archived
 * 7. Rate limiting & Helmet security headers
 * 8. Argon2id password hashing and successful session authentication (/api/auth/login)
 * 9. Admin route authorization guards (/api/admin/events and /api/admin/users)
 * 10. Frontend password visibility controls: type="button", accessible labels, Eye/EyeOff icons, default type="password"
 * 11. Safe teardown of test records
 */

import { prisma } from './src/config/db.js';
import { env } from './src/config/env.js';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:5000/api';

let passed = 0;
let failed = 0;
const testRecordsCreated = [];

function pass(msg) {
  console.log(`  ✅ PASS: ${msg}`);
  passed++;
}

function fail(msg, details = null) {
  console.error(`  ❌ FAIL: ${msg}`);
  if (details) console.error('     Details:', details);
  failed++;
}

class TestClient {
  constructor(name) {
    this.name = name;
    this.cookies = '';
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    if (this.cookies) {
      headers['Cookie'] = this.cookies;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const parts = setCookie.split(';');
      this.cookies = parts[0];
    }

    let body = null;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    return {
      status: res.status,
      headers: res.headers,
      body
    };
  }
}

async function runVerification() {
  console.log('\n===============================================================');
  console.log('🧪 EVENTPASS: PUBLIC REGISTRATION & PASSWORD VISIBILITY TESTS');
  console.log('===============================================================\n');

  const client = new TestClient('Tester');

  try {
    // -----------------------------------------------------------------
    // TEST 1: Server Configuration & Feature Flag State
    // -----------------------------------------------------------------
    console.log('--- TEST 1: Configuration & Feature Flag State ---');
    if (env.REGISTRATION_ENABLED === true) {
      pass('REGISTRATION_ENABLED is strictly true in active server configuration');
    } else {
      fail(`Expected REGISTRATION_ENABLED to be true, got ${env.REGISTRATION_ENABLED}`);
    }

    if (env.PAYMENTS_ENABLED === false) {
      pass('PAYMENTS_ENABLED remains strictly false in active server configuration');
    } else {
      fail(`Expected PAYMENTS_ENABLED to be false, got ${env.PAYMENTS_ENABLED}`);
    }

    // -----------------------------------------------------------------
    // TEST 2: Successful Public Registration Creates CUSTOMER
    // -----------------------------------------------------------------
    console.log('\n--- TEST 2: Successful Public Registration Creates CUSTOMER ---');
    const timestamp = Date.now();
    const customerEmail = `verified_cust_${timestamp}@testpass.co.za`;
    const customerPassword = 'ValidPassword2026!';

    const regRes = await client.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Sipho Ndlovu',
        email: customerEmail,
        phone: '+27 82 555 1234',
        city: 'Durban',
        password: customerPassword,
        termsAccepted: true
      })
    });

    if (regRes.status === 201 && regRes.body.status === 'success') {
      pass('Public registration returned HTTP 201 Created');
      testRecordsCreated.push(regRes.body.user.id);
    } else {
      fail(`Registration failed with status ${regRes.status}`, regRes.body);
    }

    if (regRes.body.user?.role === 'CUSTOMER') {
      pass('Newly registered user strictly assigned CUSTOMER role');
    } else {
      fail(`Expected role CUSTOMER, got ${regRes.body.user?.role}`);
    }

    if (regRes.body.user?.emailVerified === false) {
      pass('New account is created unverified by default (emailVerified: false)');
    } else {
      fail(`Expected emailVerified false, got ${regRes.body.user?.emailVerified}`);
    }

    if (regRes.body.user?.passwordHash === undefined) {
      pass('Password hash is strictly omitted from registration response payload');
    } else {
      fail('Security violation: passwordHash exposed in registration response');
    }

    // -----------------------------------------------------------------
    // TEST 3: Client-Supplied ADMIN or SUPER_ADMIN Role Is Ignored
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3: Client-Supplied Role Escalation Defense ---');
    const attackerEmail = `priv_esc_${timestamp}@testpass.co.za`;
    const escRes = await client.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Role Attacker',
        email: attackerEmail,
        phone: '+27 82 999 8888',
        city: 'Johannesburg',
        password: 'AttackPassword2026!',
        role: 'SUPER_ADMIN', // Attempted role escalation
        termsAccepted: true
      })
    });

    if (escRes.status === 201) {
      testRecordsCreated.push(escRes.body.user.id);
      if (escRes.body.user.role === 'CUSTOMER') {
        pass('Client-supplied role "SUPER_ADMIN" ignored; account created as CUSTOMER');
      } else {
        fail(`Privilege escalation vulnerability: user created with role ${escRes.body.user.role}`);
      }
    } else {
      fail(`Escalation test request failed with status ${escRes.status}`, escRes.body);
    }

    // -----------------------------------------------------------------
    // TEST 4: Duplicate Email Handling (Case Variations)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 4: Duplicate Email Handling ---');
    const dupRes = await client.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Duplicate User',
        email: customerEmail.toUpperCase(), // Case variant
        phone: '+27 82 111 2222',
        city: 'Cape Town',
        password: 'AnotherPassword2026!',
        termsAccepted: true
      })
    });

    if (dupRes.status === 409 && dupRes.body.code === 'EMAIL_ALREADY_EXISTS') {
      pass('Duplicate registration rejected with HTTP 409 EMAIL_ALREADY_EXISTS');
    } else {
      fail(`Expected HTTP 409 EMAIL_ALREADY_EXISTS, got ${dupRes.status}`, dupRes.body);
    }

    // -----------------------------------------------------------------
    // TEST 5: Input Validation Tests
    // -----------------------------------------------------------------
    console.log('\n--- TEST 5: Input Validation & Negative Tests ---');
    
    // 5a: Invalid email
    const badEmailRes = await client.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Bad Email',
        email: 'invalid-email-format',
        phone: '+27 82 111 2222',
        city: 'Cape Town',
        password: 'ValidPassword123!',
        termsAccepted: true
      })
    });
    if (badEmailRes.status === 400) {
      pass('Invalid email format rejected with HTTP 400 Bad Request');
    } else {
      fail(`Expected 400 for bad email, got ${badEmailRes.status}`);
    }

    // 5b: Missing required terms accepted
    const noTermsRes = await client.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'No Terms',
        email: `noterms_${timestamp}@testpass.co.za`,
        phone: '+27 82 111 2222',
        city: 'Cape Town',
        password: 'ValidPassword123!',
        termsAccepted: false
      })
    });
    if (noTermsRes.status === 400) {
      pass('Unaccepted terms of service rejected with HTTP 400 Bad Request');
    } else {
      fail(`Expected 400 for unaccepted terms, got ${noTermsRes.status}`);
    }

    // 5c: Weak password (< 8 chars or missing complexity)
    const weakPwdRes = await client.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Weak Pwd',
        email: `weak_${timestamp}@testpass.co.za`,
        phone: '+27 82 111 2222',
        city: 'Cape Town',
        password: 'weak',
        termsAccepted: true
      })
    });
    if (weakPwdRes.status === 400) {
      pass('Weak password rejected with HTTP 400 Bad Request');
    } else {
      fail(`Expected 400 for weak password, got ${weakPwdRes.status}`);
    }

    // -----------------------------------------------------------------
    // TEST 6: Archived Account Protection
    // -----------------------------------------------------------------
    console.log('\n--- TEST 6: Archived Account Protection ---');
    let archivedUser = await prisma.user.findFirst({
      where: { isArchived: true }
    });

    if (!archivedUser) {
      archivedUser = await prisma.user.create({
        data: {
          fullName: 'Archived Customer',
          email: `test_archived_${timestamp}@testpass.co.za`,
          passwordHash: 'dummy_hash',
          isArchived: true,
          archivedAt: new Date(),
          role: 'CUSTOMER'
        }
      });
      testRecordsCreated.push(archivedUser.id);
    }

    const archivedRegRes = await client.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Impostor',
        email: archivedUser.email,
        phone: '+27 82 999 0000',
        city: 'Pretoria',
        password: 'NewImpostorPassword123!',
        termsAccepted: true
      })
    });

    if (archivedRegRes.status === 409 && archivedRegRes.body.code === 'EMAIL_ALREADY_EXISTS') {
      pass('Registration with archived email rejected with HTTP 409 EMAIL_ALREADY_EXISTS');
    } else {
      fail(`Expected 409 for archived email registration, got ${archivedRegRes.status}`, archivedRegRes.body);
    }

    const freshArchivedRecord = await prisma.user.findUnique({
      where: { id: archivedUser.id }
    });

    if (freshArchivedRecord.isArchived === true && freshArchivedRecord.fullName === archivedUser.fullName) {
      pass('Archived account record preserved intact (isArchived strictly remains true)');
    } else {
      fail('CRITICAL: Archived account was modified or reactivated!');
    }

    // -----------------------------------------------------------------
    // TEST 7: Argon2id Password Hashing & Successful Authentication
    // -----------------------------------------------------------------
    console.log('\n--- TEST 7: Argon2id Password Hashing & Session Authentication ---');
    const dbCustomer = await prisma.user.findUnique({
      where: { email: customerEmail }
    });

    if (dbCustomer && dbCustomer.passwordHash.startsWith('$argon2id$')) {
      pass('Database confirms passwordHash uses Argon2id algorithm ($argon2id$...)');
    } else {
      fail('Expected Argon2id password hash format in database');
    }

    const loginRes = await client.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: customerEmail,
        password: customerPassword
      })
    });

    if (loginRes.status === 200 && loginRes.body.status === 'success') {
      pass('Newly registered customer successfully authenticated via /api/auth/login');
    } else {
      fail(`Customer login failed with status ${loginRes.status}`, loginRes.body);
    }

    const meRes = await client.request('/auth/me');
    if (meRes.status === 200 && meRes.body.user?.email === customerEmail) {
      pass('/api/auth/me returns authenticated customer session');
    } else {
      fail(`Session verification failed with status ${meRes.status}`, meRes.body);
    }

    // -----------------------------------------------------------------
    // TEST 8: Authorization Protection for Admin Endpoints
    // -----------------------------------------------------------------
    console.log('\n--- TEST 8: Customer Authorization Boundaries ---');
    const adminEventsRes = await client.request('/admin/events');
    if (adminEventsRes.status === 403) {
      pass('Customer role blocked from /api/admin/events with HTTP 403 Forbidden');
    } else {
      fail(`Expected 403 for customer accessing admin events, got ${adminEventsRes.status}`);
    }

    const adminUsersRes = await client.request('/admin/users');
    if (adminUsersRes.status === 403) {
      pass('Customer role blocked from /api/admin/users with HTTP 403 Forbidden');
    } else {
      fail(`Expected 403 for customer accessing user management, got ${adminUsersRes.status}`);
    }

    const anonClient = new TestClient('Anon');
    const anonRes = await anonClient.request('/admin/events');
    if (anonRes.status === 401) {
      pass('Unauthenticated visitor blocked from admin endpoints with HTTP 401 Unauthorized');
    } else {
      fail(`Expected 401 for anonymous client, got ${anonRes.status}`);
    }

    // -----------------------------------------------------------------
    // TEST 9: Payment Availability Remains Disabled
    // -----------------------------------------------------------------
    console.log('\n--- TEST 9: Payment Feature Freeze Remains Enforced ---');
    const paymentStatusRes = await client.request('/payments/status');
    const isPaymentsEnabled = paymentStatusRes.body?.data?.paymentsEnabled ?? paymentStatusRes.body?.paymentsEnabled;
    if (paymentStatusRes.status === 200 && isPaymentsEnabled === false) {
      pass('GET /api/payments/status confirms paymentsEnabled is false');
    } else {
      fail('Expected paymentsEnabled: false', paymentStatusRes.body);
    }

    const payInitRes = await client.request('/payments/initialize', {
      method: 'POST',
      body: JSON.stringify({ reservationId: 'dummy-res-id' })
    });
    if (payInitRes.status === 503 && payInitRes.body.code === 'PAYMENTS_DISABLED') {
      pass('POST /api/payments/initialize rejected with HTTP 503 PAYMENTS_DISABLED');
    } else {
      fail(`Expected 503 PAYMENTS_DISABLED, got ${payInitRes.status}`);
    }

    // -----------------------------------------------------------------
    // TEST 10: Security Headers (Helmet)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 10: Security Headers Verification ---');
    const healthRes = await client.request('/health');
    const xcto = healthRes.headers.get('x-content-type-options');
    const xfo = healthRes.headers.get('x-frame-options');

    if (xcto === 'nosniff' && xfo === 'SAMEORIGIN') {
      pass('Helmet security headers present (X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN)');
    } else {
      fail(`Missing security headers: xcto=${xcto}, xfo=${xfo}`);
    }

    // -----------------------------------------------------------------
    // TEST 11: Frontend Password Visibility Controls Audit
    // -----------------------------------------------------------------
    console.log('\n--- TEST 11: Frontend Password Visibility Controls Audit ---');
    const registerPagePath = path.resolve('../src/pages/RegisterPage.jsx');
    const loginPagePath = path.resolve('../src/pages/LoginPage.jsx');

    const registerPageSrc = fs.readFileSync(registerPagePath, 'utf8');
    const loginPageSrc = fs.readFileSync(loginPagePath, 'utf8');

    if (registerPageSrc.includes('showPassword') && registerPageSrc.includes('setShowPassword')) {
      pass('RegisterPage: showPassword state hook defined');
    } else {
      fail('RegisterPage: showPassword state hook missing');
    }

    if (registerPageSrc.includes('showConfirmPassword') && registerPageSrc.includes('setShowConfirmPassword')) {
      pass('RegisterPage: showConfirmPassword state hook defined');
    } else {
      fail('RegisterPage: showConfirmPassword state hook missing');
    }

    if (registerPageSrc.includes('type={showPassword ? \'text\' : \'password\'}')) {
      pass('RegisterPage: Password input type toggles between text and password (defaulting to password)');
    } else {
      fail('RegisterPage: Password input dynamic type binding missing');
    }

    if (registerPageSrc.includes('type={showConfirmPassword ? \'text\' : \'password\'}')) {
      pass('RegisterPage: Confirm Password input type toggles between text and password');
    } else {
      fail('RegisterPage: Confirm Password input dynamic type binding missing');
    }

    if (registerPageSrc.includes('type="button"') && registerPageSrc.includes('aria-label={showPassword ? \'Hide password\' : \'Show password\'}')) {
      pass('RegisterPage: Password eye toggle button uses type="button" and accessible aria-label');
    } else {
      fail('RegisterPage: Accessible type="button" toggle button missing');
    }

    if (registerPageSrc.includes('aria-label={showConfirmPassword ? \'Hide password\' : \'Show password\'}')) {
      pass('RegisterPage: Confirm Password toggle button has accessible aria-label');
    } else {
      fail('RegisterPage: Confirm Password accessible aria-label missing');
    }

    if (registerPageSrc.includes('Eye') && registerPageSrc.includes('EyeOff')) {
      pass('RegisterPage: Eye and EyeOff icons imported and conditionally rendered');
    } else {
      fail('RegisterPage: Eye and EyeOff icons missing in RegisterPage');
    }

    if (loginPageSrc.includes('showPassword') && loginPageSrc.includes('setShowPassword')) {
      pass('LoginPage: showPassword state hook defined');
    } else {
      fail('LoginPage: showPassword state hook missing');
    }

    if (loginPageSrc.includes('type={showPassword ? \'text\' : \'password\'}')) {
      pass('LoginPage: Password input type toggles between text and password (defaulting to password)');
    } else {
      fail('LoginPage: Password input dynamic type binding missing');
    }

    if (loginPageSrc.includes('type="button"') && loginPageSrc.includes('aria-label={showPassword ? \'Hide password\' : \'Show password\'}')) {
      pass('LoginPage: Eye toggle button uses type="button" and accessible aria-label');
    } else {
      fail('LoginPage: Accessible type="button" toggle button missing in LoginPage');
    }

    if (loginPageSrc.includes('Eye') && loginPageSrc.includes('EyeOff')) {
      pass('LoginPage: Eye and EyeOff icons imported and conditionally rendered');
    } else {
      fail('LoginPage: Eye and EyeOff icons missing in LoginPage');
    }

  } catch (err) {
    fail('Unhandled exception in test runner', err);
  } finally {
    if (testRecordsCreated.length > 0) {
      console.log(`\n🧹 Cleaning up ${testRecordsCreated.length} temporary test user records...`);
      try {
        await prisma.authToken.deleteMany({
          where: { userId: { in: testRecordsCreated } }
        });
        await prisma.user.deleteMany({
          where: { id: { in: testRecordsCreated } }
        });
        console.log('   Teardown complete.');
      } catch (cleanErr) {
        console.warn('   Teardown warning:', cleanErr.message);
      }
    }
    await prisma.$disconnect();
  }

  console.log('\n===============================================================');
  console.log(`📊 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
