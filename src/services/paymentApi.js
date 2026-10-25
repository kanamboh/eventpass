/**
 * EventPass Frontend Payment API Service
 * Interacts with /api/payments using credentials: 'include' for session auth.
 * 
 * Strict Security Boundaries:
 * - EventPass NEVER receives, stores, or logs raw credit card details (card number, CVV, expiry).
 * - Sensitive cardholder data is collected directly by Paystack-hosted / modal checkout.
 * - This service handles only server-authoritative payment initialization and verification.
 */

/**
 * Query central online payment availability status
 * GET /api/payments/status
 * 
 * @returns {Promise<{ paymentsEnabled: boolean }>}
 */
export async function fetchPaymentStatus() {
  try {
    const res = await fetch('/api/payments/status', {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json'
      }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { paymentsEnabled: false };
    }
    return body.data || { paymentsEnabled: false };
  } catch (err) {
    return { paymentsEnabled: false };
  }
}

/**
 * Initialize payment session for an existing order
 * POST /api/payments/initialize
 * 
 * @param {Object} params
 * @param {string} params.orderId - Authoritative UUID of the created order
 * @param {string} [params.callbackUrl] - Optional client redirect callback URL
 * @returns {Promise<{
 *   paymentId: string,
 *   orderId: string,
 *   orderReference: string,
 *   reference: string,
 *   authorizationUrl: string | null,
 *   accessCode: string | null,
 *   amountMinor: number,
 *   amountFormatted: string,
 *   currency: string,
 *   expiresAt: string | null,
 *   reused?: boolean
 * }>}
 */
export async function initializePayment({ orderId, callbackUrl } = {}) {
  const res = await fetch('/api/payments/initialize', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      orderId,
      callbackUrl
    })
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to initialize payment.');
    error.status = res.status;
    error.code = body?.code || 'PAYMENT_INITIALIZATION_ERROR';
    error.details = body?.details;
    throw error;
  }

  return body.data;
}

/**
 * Verify payment status server-side
 * GET /api/payments/verify/:reference
 * 
 * @param {string} reference - The opaque EP-... payment reference
 * @returns {Promise<{
 *   payment: Object,
 *   orderStatus: string,
 *   alreadyProcessed: boolean,
 *   reconciled?: boolean
 * }>}
 */
export async function verifyPayment(reference) {
  if (!reference) {
    throw new Error('Payment reference is required for verification.');
  }

  const res = await fetch(`/api/payments/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Payment verification failed.');
    error.status = res.status;
    error.code = body?.code || 'PAYMENT_VERIFICATION_ERROR';
    error.details = body?.details;
    throw error;
  }

  return body.data;
}
