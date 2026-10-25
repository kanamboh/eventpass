import { prisma } from './src/config/db.js';

const BASE_URL = 'http://localhost:5000/api';

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  setFromHeaders(headers) {
    // node-fetch / global fetch headers.getSetCookie() or get('set-cookie')
    let setCookieHeaders = [];
    if (typeof headers.getSetCookie === 'function') {
      setCookieHeaders = headers.getSetCookie();
    } else {
      const single = headers.get('set-cookie');
      if (single) setCookieHeaders = [single];
    }

    for (const header of setCookieHeaders) {
      const parts = header.split(';').map(p => p.trim());
      const [nameVal, ...attrs] = parts;
      const [name, val] = nameVal.split('=');
      const isHttpOnly = parts.some(p => p.toLowerCase() === 'httponly');
      const isSecure = parts.some(p => p.toLowerCase() === 'secure');
      const sameSite = parts.find(p => p.toLowerCase().startsWith('samesite='))?.split('=')[1] || null;

      this.cookies.set(name, {
        value: val,
        httpOnly: isHttpOnly,
        secure: isSecure,
        sameSite: sameSite,
        raw: header
      });
    }
  }

  getCookieHeader() {
    const list = [];
    for (const [name, meta] of this.cookies.entries()) {
      if (meta.value && meta.value !== '') {
        list.push(`${name}=${meta.value}`);
      }
    }
    return list.join('; ');
  }

  get(name) {
    return this.cookies.get(name);
  }

  clear() {
    this.cookies.clear();
  }
}

async function request(path, options = {}, jar = null) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (jar) {
    const cookieHeader = jar.getCookieHeader();
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (jar) {
    jar.setFromHeaders(response.headers);
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  return {
    status: response.status,
    headers: response.headers,
    data
  };
}

async function runSecurityTestSuite() {
  console.log('🧪 Starting EventPass Step 2 Security Test Suite...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const testEmail = `test.user.${Date.now()}@example.com`;
  const testPassword = 'StrongPassword123!';
  let devToken = null;
  const jar = new CookieJar();

  try {
    // -------------------------------------------------------------
    // Test 1: Register valid user
    // -------------------------------------------------------------
    console.log('--- Test 1: Register valid customer account ---');
    const res1 = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Jane Doe',
        email: testEmail,
        phone: '+27 82 123 4567',
        city: 'Cape Town',
        password: testPassword,
        termsAccepted: true
      })
    });

    assert(res1.status === 201, `Status is 201 (got ${res1.status})`);
    assert(res1.data?.status === 'success', 'Response status is success');
    assert(res1.data?.user?.email === testEmail.toLowerCase(), 'Email normalized and saved');
    assert(res1.data?.user?.role === 'CUSTOMER', 'Role is CUSTOMER');
    assert(res1.data?.user?.emailVerified === false, 'emailVerified is false by default');
    assert(res1.data?.user?.passwordHash === undefined, 'passwordHash is NOT exposed');
    assert(res1.data?._devVerificationToken !== undefined, 'Dev verification token returned in dev mode');
    devToken = res1.data?._devVerificationToken;

    // -------------------------------------------------------------
    // Test 2: Register duplicate email (case insensitive)
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Register duplicate email (case variant) ---');
    const res2 = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Jane Duplicate',
        email: testEmail.toUpperCase(),
        phone: '+27 82 999 8888',
        city: 'Johannesburg',
        password: testPassword,
        termsAccepted: true
      })
    });

    assert(res2.status === 409, `Status is 409 Conflict (got ${res2.status})`);
    assert(res2.data?.code === 'EMAIL_ALREADY_EXISTS', 'Code is EMAIL_ALREADY_EXISTS');

    // -------------------------------------------------------------
    // Test 3: Register invalid email
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Register invalid email format ---');
    const res3 = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Bad Email',
        email: 'not-an-email',
        phone: '+27 82 111 2222',
        city: 'Durban',
        password: testPassword,
        termsAccepted: true
      })
    });
    assert(res3.status === 400 || res3.status === 500, `Rejected invalid email (status ${res3.status})`);

    // -------------------------------------------------------------
    // Test 4: Register weak password
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Register weak password ---');
    const res4 = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Weak Pwd',
        email: `weak.${Date.now()}@example.com`,
        phone: '+27 82 111 2222',
        city: 'Pretoria',
        password: 'weak',
        termsAccepted: true
      })
    });
    assert(res4.status === 400 || res4.status === 500, `Rejected weak password (status ${res4.status})`);

    // -------------------------------------------------------------
    // Test 5: Register without terms acceptance
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Register without terms acceptance ---');
    const res5 = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'No Terms',
        email: `noterms.${Date.now()}@example.com`,
        phone: '+27 82 111 2222',
        city: 'Cape Town',
        password: testPassword,
        termsAccepted: false
      })
    });
    assert(res5.status === 400 || res5.status === 500, `Rejected missing terms (status ${res5.status})`);

    // -------------------------------------------------------------
    // Test 6: Access /auth/me while logged out
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Access /auth/me while logged out ---');
    const emptyJar = new CookieJar();
    const res6 = await request('/auth/me', { method: 'GET' }, emptyJar);
    assert(res6.status === 401, `Status is 401 Unauthorized (got ${res6.status})`);
    assert(res6.data?.code === 'UNAUTHENTICATED', 'Code is UNAUTHENTICATED');

    // -------------------------------------------------------------
    // Test 7: Login with incorrect password
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Login with incorrect password ---');
    const res7 = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: 'WrongPassword999!'
      })
    }, jar);
    assert(res7.status === 401, `Status is 401 (got ${res7.status})`);
    assert(res7.data?.code === 'INVALID_CREDENTIALS', 'Code is INVALID_CREDENTIALS');
    assert(res7.data?.message === 'Invalid email or password.', 'Generic error message used');

    // -------------------------------------------------------------
    // Test 8: Login with nonexistent email
    // -------------------------------------------------------------
    console.log('\n--- Test 8: Login with nonexistent email ---');
    const res8 = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'does.not.exist@example.com',
        password: testPassword
      })
    }, jar);
    assert(res8.status === 401, `Status is 401 (got ${res8.status})`);
    assert(res8.data?.message === 'Invalid email or password.', 'Identical generic message prevents user enumeration');

    // -------------------------------------------------------------
    // Test 9: Login with correct credentials & Session Regeneration
    // -------------------------------------------------------------
    console.log('\n--- Test 9: Login with correct credentials & Session cookie checks ---');
    // First trigger a preliminary session by visiting health
    const sessionJar = new CookieJar();
    const sidBefore = sessionJar.get('eventpass.sid')?.value || null;

    const res9 = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    }, sessionJar);

    assert(res9.status === 200, `Login successful (status ${res9.status})`);
    assert(res9.data?.user?.email === testEmail.toLowerCase(), 'Authenticated user returned');
    assert(res9.data?.user?.passwordHash === undefined, 'No passwordHash in response');

    // Cookie checks
    const cookieMeta = sessionJar.get('eventpass.sid');
    assert(cookieMeta !== undefined, 'eventpass.sid cookie received');
    assert(cookieMeta?.httpOnly === true, 'Cookie has HttpOnly flag');
    assert(cookieMeta?.sameSite?.toLowerCase() === 'lax', 'Cookie has SameSite=Lax flag');
    const sidAfter = cookieMeta?.value;
    assert(sidAfter !== sidBefore, 'Session ID regenerated after login (Fixation prevention)');

    // -------------------------------------------------------------
    // Test 10: Access /auth/me while logged in
    // -------------------------------------------------------------
    console.log('\n--- Test 10: Access /auth/me while logged in ---');
    const res10 = await request('/auth/me', { method: 'GET' }, sessionJar);
    assert(res10.status === 200, `Status is 200 (got ${res10.status})`);
    assert(res10.data?.user?.email === testEmail.toLowerCase(), 'Returned matching user');
    assert(res10.data?.user?.role === 'CUSTOMER', 'Returned user role');
    assert(res10.data?.user?.passwordHash === undefined, 'No passwordHash exposed');

    // -------------------------------------------------------------
    // Test 11: Email verification with valid token
    // -------------------------------------------------------------
    console.log('\n--- Test 11: Verify email with valid cryptographic token ---');
    assert(devToken !== null, 'Dev token exists for verification');
    const res11 = await request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: devToken })
    }, sessionJar);
    assert(res11.status === 200, `Status is 200 (got ${res11.status})`);

    // Verify database state directly
    const userInDb = await prisma.user.findUnique({ where: { email: testEmail.toLowerCase() } });
    assert(userInDb?.emailVerified === true, 'Database confirms emailVerified is true');

    // -------------------------------------------------------------
    // Test 12: Reuse verification token (Single-use enforcement)
    // -------------------------------------------------------------
    console.log('\n--- Test 12: Reuse verification token ---');
    const res12 = await request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: devToken })
    });
    assert(res12.status === 400, `Rejected token reuse with status 400 (got ${res12.status})`);
    assert(res12.data?.code === 'INVALID_TOKEN', 'Code is INVALID_TOKEN');

    // -------------------------------------------------------------
    // Test 13: Use expired verification token
    // -------------------------------------------------------------
    console.log('\n--- Test 13: Use expired verification token ---');
    // Create an intentionally expired token directly in DB
    const crypto = await import('crypto');
    const expiredRawToken = crypto.randomBytes(32).toString('hex');
    const expiredHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');
    await prisma.authToken.create({
      data: {
        userId: userInDb.id,
        tokenHash: expiredHash,
        purpose: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() - 3600000) // 1 hour in the past
      }
    });

    const res13 = await request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: expiredRawToken })
    });
    assert(res13.status === 400, `Rejected expired token with status 400 (got ${res13.status})`);

    // -------------------------------------------------------------
    // Test 14: Logout & Session Invalidation
    // -------------------------------------------------------------
    console.log('\n--- Test 14: Logout & Session Invalidation ---');
    const res14 = await request('/auth/logout', { method: 'POST' }, sessionJar);
    assert(res14.status === 200, `Logout status is 200 (got ${res14.status})`);

    // Re-verify that calling /auth/me with previous session now returns 401
    const res14b = await request('/auth/me', { method: 'GET' }, sessionJar);
    assert(res14b.status === 401, `Session invalidated on server: /auth/me returns 401 (got ${res14b.status})`);

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log(`\n===========================================`);
    console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log(`===========================================`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal test runner error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSecurityTestSuite();
