/**
 * EVENTPASS — EMAIL VERIFICATION & REGISTRATION SECURITY TEST SUITE
 * 
 * Comprehensive tests for:
 * 1. Successful registration with default unverified customer account.
 * 2. Exactly one combined registration-confirmation email generated (no duplicate emails).
 * 3. Correct recipient and secure verification link.
 * 4. HTML and plain-text email content with EventPass branding and XSS escaping.
 * 5. Account remaining strictly unverified until valid token is consumed.
 * 6. Successful email verification with DB update and active session synchronization.
 * 7. Token negative testing: invalid, expired, and reused tokens fail safely with differentiated messages.
 * 8. Email-provider failure resilience without accidental account duplication.
 * 9. Resend-verification behavior, prior token invalidation, anti-enumeration, and rate limiting.
 * 10. Zero leakage of raw tokens, credentials, or password hashes in production responses/logs.
 * 11. Existing login and authentication behavior remaining intact (role defaults, session integrity).
 */

import { prisma } from './src/config/db.js';
import crypto from 'crypto';
import { getEmailProvider } from './src/services/email/emailProviderFactory.js';
import { registerUser, resendVerificationEmail } from './src/services/authService.js';
import { env } from './src/config/env.js';
import { verifyRateLimiter } from './src/middleware/rateLimiter.js';

const API_BASE = 'http://localhost:5000/api';

class TestClient {
  constructor(name) {
    this.name = name;
    this.cookies = '';
    this.user = null;
  }

  async request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.cookies) {
      headers['Cookie'] = this.cookies;
    }

    const res = await fetch(`${API_BASE}${path}`, {
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

  async registerAndLogin(email, password, fullName, extra = {}) {
    const regRes = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        fullName,
        phone: '0821234567',
        city: 'Cape Town',
        termsAccepted: true,
        ...extra
      })
    });

    const loginRes = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    this.user = loginRes.body?.user || null;
    return {
      regRes,
      loginRes
    };
  }
}

async function runEmailVerificationSuite() {
  console.log('✉️  =========================================================================');
  console.log('✉️  EVENTPASS — EMAIL VERIFICATION SECURITY & FLOW AUDIT');
  console.log('✉️  =========================================================================\n');

  let passed = 0;
  let failed = 0;

  function pass(msg) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  }

  function fail(msg, details) {
    console.error(`  ❌ [FAIL] ${msg}`, details || '');
    failed++;
  }

  const provider = getEmailProvider();
  const timestamp = Date.now();
  const testEmail = `verify.tester.${timestamp}@example.co.za`;
  const password = 'StrongPassword123!';
  const client = new TestClient('Verification Tester');

  try {
    // -------------------------------------------------------------------------
    // 1. HTTP API Registration & Default Unverified State
    // -------------------------------------------------------------------------
    console.log('--- 1. Registration & Default Unverified State ---');
    const { regRes, loginRes } = await client.registerAndLogin(
      testEmail, 
      password, 
      'Jane Tester',
      { role: 'ADMIN' } // Attempt privilege escalation
    );

    if (regRes.status === 201 && regRes.body.user.emailVerified === false) {
      pass('1. New user registered with emailVerified strictly false');
    } else {
      fail('1. Expected emailVerified to be false on registration', regRes.body);
    }

    if (regRes.body.user.role === 'CUSTOMER') {
      pass('2. Public registration ignores requested ADMIN role and defaults to CUSTOMER');
    } else {
      fail('2. Role was not defaulted to CUSTOMER', regRes.body.user);
    }

    if (!regRes.body.user.password && !regRes.body.user.passwordHash) {
      pass('3. Registration response does not leak password or passwordHash');
    } else {
      fail('3. Password hash leaked in registration response', regRes.body);
    }

    if (regRes.body.emailDelivery && regRes.body.emailDelivery.isMock === true && regRes.body.emailDelivery.success === true) {
      pass('4. Registration response explicitly returns emailDelivery metadata (isMock: true, success: true)');
    } else {
      fail('4. Registration response missing or incorrect emailDelivery metadata', regRes.body);
    }

    if (loginRes.status === 200 && loginRes.body.user.emailVerified === false) {
      pass('5. Authenticated session reports isEmailVerified = false before verification');
    } else {
      fail('5. Login session does not reflect unverified status', loginRes.body);
    }

    const initialDevToken = regRes.body._devVerificationToken;
    if (initialDevToken && typeof initialDevToken === 'string' && initialDevToken.length >= 32) {
      pass('6. Safe dev-only verification token exposed in development mode');
    } else {
      fail('6. Expected dev token in dev environment', regRes.body);
    }

    // -------------------------------------------------------------------------
    // 2. In-Process Email Recording: Exactly One Email, Branding, Plain-Text & XSS
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Email Delivery, Content & Security Verification ---');
    provider.clearSentEmails();

    const mockEmailTarget = `mock.verified.${timestamp}@example.co.za`;
    const mockPassword = 'SecretPassword987!';
    const regResult = await registerUser({
      email: mockEmailTarget,
      password: mockPassword,
      fullName: 'Jane <script>alert("xss")</script> Doe',
      phone: '0829876543',
      city: 'Johannesburg',
      termsAccepted: true
    });

    const sentEmailsForMock = provider.getSentEmails().filter(e => e.to === mockEmailTarget);

    if (sentEmailsForMock.length === 1) {
      pass('7. Exactly one registration confirmation email was generated (no duplicate emails)');
    } else {
      fail(`7. Expected exactly 1 email, found ${sentEmailsForMock.length}`, sentEmailsForMock);
    }

    const regEmail = sentEmailsForMock[0];
    if (regEmail && regEmail.type === 'REGISTRATION_CONFIRMATION_EMAIL') {
      pass('8. Email type is combined REGISTRATION_CONFIRMATION_EMAIL');
    } else {
      fail('8. Email type was not REGISTRATION_CONFIRMATION_EMAIL', regEmail);
    }

    if (regEmail && regEmail.to === mockEmailTarget) {
      pass('9. Email recipient matches registered email address');
    } else {
      fail('9. Email recipient mismatch', regEmail);
    }

    const expectedUrlPrefix = `${env.CLIENT_URL || 'http://localhost:3001'}/verify-email?token=`;
    if (regEmail && regEmail.verificationUrl && regEmail.verificationUrl.startsWith(expectedUrlPrefix) && regEmail.verificationUrl.includes(regResult.rawVerificationToken)) {
      pass('10. Verification link points to frontend verification page with valid token parameter');
    } else {
      fail(`10. Verification link invalid: ${regEmail?.verificationUrl}`, regEmail);
    }

    if (regEmail && regEmail.html && regEmail.html.includes('EventPass') && regEmail.html.includes('Confirm Your Email')) {
      pass('11. HTML email contains EventPass branding and verification call-to-action');
    } else {
      fail('11. HTML email missing branding or CTA', regEmail?.html);
    }

    if (regEmail && regEmail.text && regEmail.text.includes('Welcome to EventPass') && regEmail.text.includes(regEmail.verificationUrl)) {
      pass('12. Plain-text version is readable and includes raw verification URL');
    } else {
      fail('12. Plain-text email incomplete', regEmail?.text);
    }

    // Verify HTML escaping of user input (prevent XSS in emails)
    if (regEmail && regEmail.html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;') && !regEmail.html.includes('<script>')) {
      pass('13. User-controlled content is strictly HTML-escaped to prevent email client XSS');
    } else {
      fail('13. HTML escaping failed in email template', regEmail?.html);
    }

    // Verify sensitive data is not leaked in email content
    if (regEmail && !regEmail.html.includes(mockPassword) && !regEmail.text.includes(mockPassword)) {
      pass('14. Email content does not leak user password or database secrets');
    } else {
      fail('14. Password leaked into email body!');
    }

    // -------------------------------------------------------------------------
    // 3. Token Negative Tests: Invalid, Expired, and Reused
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Negative Token Validation ---');
    const invalidTokenRes = await client.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: 'invalid_token_12345678_not_found' })
    });

    if (invalidTokenRes.status === 400 && invalidTokenRes.body.code === 'INVALID_TOKEN' && invalidTokenRes.body.message.toLowerCase().includes('invalid')) {
      pass('15. Non-existent token rejected with 400 INVALID_TOKEN and clear error message');
    } else {
      fail('15. Non-existent token not handled safely', invalidTokenRes);
    }

    // Expired token test
    const expiredRawToken = crypto.randomBytes(32).toString('hex');
    const expiredTokenHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');
    await prisma.authToken.create({
      data: {
        userId: client.user.id,
        tokenHash: expiredTokenHash,
        purpose: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() - 3600000) // 1 hour in the past
      }
    });

    const expiredTokenRes = await client.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: expiredRawToken })
    });

    if (expiredTokenRes.status === 400 && expiredTokenRes.body.code === 'INVALID_TOKEN' && expiredTokenRes.body.message.toLowerCase().includes('expired')) {
      pass('16. Expired token strictly rejected with 400 INVALID_TOKEN and "expired" explanation');
    } else {
      fail('16. Expired token was not rejected properly', expiredTokenRes);
    }

    // -------------------------------------------------------------------------
    // 4. Resend Verification Email & Invalidation of Prior Tokens
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Resend Verification & Prior Token Invalidation ---');
    const resendRes = await client.request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail })
    });

    if (resendRes.status === 200 && resendRes.body.status === 'success') {
      pass('17. Resend verification request accepted successfully (200 OK)');
    } else {
      fail('17. Resend verification failed', resendRes);
    }

    const freshDevToken = resendRes.body._devVerificationToken;
    if (freshDevToken && freshDevToken !== initialDevToken) {
      pass('18. Resend generated fresh distinct cryptographic token');
    } else {
      fail('18. Resend did not generate new token', resendRes.body);
    }

    // Attempt to use initial token that was invalidated by resend
    const staleTokenRes = await client.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: initialDevToken })
    });

    if (staleTokenRes.status === 400 && staleTokenRes.body.code === 'INVALID_TOKEN') {
      pass('19. Prior token successfully invalidated upon resend (single active token policy)');
    } else {
      fail('19. Prior token should have been invalidated by resend', staleTokenRes);
    }

    // Anti-enumeration check
    const nonExistentResend = await client.request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'nonexistent.user.random9988@unknown.co.za' })
    });

    if (nonExistentResend.status === 200 && nonExistentResend.body.status === 'success') {
      pass('20. Resend for non-existent email returns generic success (prevents email enumeration)');
    } else {
      fail('20. Enumeration leak in resend endpoint', nonExistentResend);
    }

    // -------------------------------------------------------------------------
    // 5. Successful Verification Flow & Session Sync
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Authoritative Verification & Session Synchronization ---');
    const verifySuccessRes = await client.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: freshDevToken })
    });

    if (verifySuccessRes.status === 200 && verifySuccessRes.body.status === 'success') {
      pass('21. Fresh token successfully verifies email (200 OK)');
    } else {
      fail('21. Verification with valid token failed', verifySuccessRes);
    }

    // Check DB directly
    const userInDb = await prisma.user.findUnique({
      where: { id: client.user.id }
    });
    if (userInDb && userInDb.emailVerified === true) {
      pass('22. Database confirms user.emailVerified is permanently true');
    } else {
      fail('22. DB state not updated', userInDb);
    }

    // Check active session via /api/auth/me
    const meRes = await client.request('/auth/me');
    if (meRes.status === 200 && meRes.body.user.emailVerified === true) {
      pass('23. Active session /api/auth/me immediately reflects emailVerified = true without relogin');
    } else {
      fail('23. Session did not refresh verified state', meRes);
    }

    // -------------------------------------------------------------------------
    // 6. Token Replay / Double-Use Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Replay Attack Prevention ---');
    const replayRes = await client.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: freshDevToken })
    });

    if (replayRes.status === 400 && replayRes.body.code === 'INVALID_TOKEN' && replayRes.body.message.toLowerCase().includes('already')) {
      pass('24. Token reuse / replay strictly rejected with 400 and "already been used" explanation');
    } else {
      fail('24. Token was allowed to be reused or wrong message', replayRes);
    }

    // Resend when already verified
    const alreadyVerifiedResend = await client.request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail })
    });

    if (alreadyVerifiedResend.status === 200 && alreadyVerifiedResend.body.message.toLowerCase().includes('already verified')) {
      pass('25. Resend for already verified account handled gracefully without creating unneeded tokens');
    } else {
      fail('25. Resend for verified account failed', alreadyVerifiedResend);
    }

    // -------------------------------------------------------------------------
    // 7. Email Provider Failure Resilience & Account Duplication Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Email Provider Failure Resilience ---');
    const failureEmail = `fail.resilience.${Date.now()}@example.co.za`;
    
    // Simulate provider failure in-process
    provider.setFailureMode(true);
    let failRegResult;
    try {
      failRegResult = await registerUser({
        email: failureEmail,
        password: 'StrongPassword123!',
        fullName: 'Provider Fail User',
        phone: '0825556677',
        city: 'Durban',
        termsAccepted: true
      });
    } finally {
      provider.setFailureMode(false);
    }

    if (failRegResult && failRegResult.user && failRegResult.emailDelivery && failRegResult.emailDelivery.success === false) {
      pass('26. Registration succeeds gracefully even when email provider temporarily fails (non-blocking)');
    } else {
      fail('26. Registration did not handle email provider failure gracefully', failRegResult);
    }

    // Ensure account exists and duplicate registration is prevented
    let duplicateError = null;
    try {
      await registerUser({
        email: failureEmail,
        password: 'StrongPassword123!',
        fullName: 'Duplicate User Attempt',
        phone: '0825556677',
        city: 'Durban',
        termsAccepted: true
      });
    } catch (err) {
      duplicateError = err;
    }

    if (duplicateError && duplicateError.code === 'EMAIL_ALREADY_EXISTS') {
      pass('27. User account exists cleanly in DB; duplicate registration prevented with EMAIL_ALREADY_EXISTS');
    } else {
      fail('27. Duplicate registration was not blocked correctly', duplicateError);
    }

    // -------------------------------------------------------------------------
    // 8. Authentication & Login Behavior Intact
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Authentication & Login Behavior Intact ---');
    const wrongPasswordRes = await client.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword999!' })
    });

    if (wrongPasswordRes.status === 401 && wrongPasswordRes.body.code === 'INVALID_CREDENTIALS') {
      pass('28. Login with invalid password rejected with 401 INVALID_CREDENTIALS');
    } else {
      fail('28. Invalid password was not rejected properly', wrongPasswordRes);
    }

    const correctLoginRes = await client.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: testEmail, password })
    });

    if (correctLoginRes.status === 200 && correctLoginRes.body.user.emailVerified === true) {
      pass('29. Existing login remains intact, correctly returning verified user state');
    } else {
      fail('29. Login failed for verified user', correctLoginRes);
    }

    // -------------------------------------------------------------------------
    // 9. Resend & Verification Rate Limiting
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Verification Rate Limiting ---');
    // Test verifyRateLimiter directly with a dedicated IP to prevent exhausting localhost IP
    let rateLimited = false;
    let rateLimitPayload = null;
    const testIp = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;

    for (let i = 0; i < 35; i++) {
      const mockReq = {
        ip: testIp,
        headers: {},
        app: { get: () => false }
      };
      await new Promise((resolve) => {
        const mockRes = {
          statusCode: 200,
          headers: {},
          setHeader(k, v) { this.headers[k] = v; return this; },
          getHeader(k) { return this.headers[k]; },
          status(code) { this.statusCode = code; return this; },
          send(payload) {
            rateLimitPayload = payload;
            rateLimited = true;
            resolve();
            return this;
          },
          json(payload) {
            return this.send(payload);
          }
        };

        verifyRateLimiter(mockReq, mockRes, () => resolve());
      });

      if (rateLimited) break;
    }

    if (rateLimited && rateLimitPayload?.code === 'VERIFY_RATE_LIMIT_EXCEEDED') {
      pass('30. Verification endpoint enforces rate limiting (HTTP 429 VERIFY_RATE_LIMIT_EXCEEDED)');
    } else {
      fail('30. Rate limiter did not trigger expected 429 VERIFY_RATE_LIMIT_EXCEEDED', { rateLimited, rateLimitPayload });
    }

  } catch (err) {
    console.error('Unexpected test error:', err);
    failed++;
  } finally {
    console.log('\n=========================================================================');
    console.log(`📊 Email Verification Test Suite: ${passed} PASSED, ${failed} FAILED`);
    console.log('=========================================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runEmailVerificationSuite();
