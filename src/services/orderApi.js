/**
 * EventPass Frontend Order API Service
 * Interacts with /api/orders using credentials: 'include' for session auth
 */

export async function createOrder({ reservationIds, buyerDetails, promoCode, idempotencyKey } = {}) {
  // Defensive sanitization: EventPass backend strictly rejects unrecognized fields via Zod .strict().
  // Sensitive cardholder data (cardNumber, CVV, expiry) MUST NEVER be passed to order creation.
  const sanitizedBuyerDetails = buyerDetails
    ? {
        firstName: buyerDetails.firstName?.trim() || undefined,
        lastName: buyerDetails.lastName?.trim() || undefined,
        email: buyerDetails.email?.trim() || undefined,
        phone: buyerDetails.phone?.trim() || undefined,
        deliveryType: 'digital',
        paymentMethod: 'card'
      }
    : undefined;

  if (sanitizedBuyerDetails) {
    Object.keys(sanitizedBuyerDetails).forEach((key) => {
      if (sanitizedBuyerDetails[key] === undefined) {
        delete sanitizedBuyerDetails[key];
      }
    });
  }

  const res = await fetch('/api/orders', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      reservationIds,
      buyerDetails: sanitizedBuyerDetails,
      promoCode: promoCode ? promoCode.trim() : undefined,
      idempotencyKey
    })
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to create order.');
    error.status = res.status;
    error.code = body?.code || 'ORDER_ERROR';
    error.details = body?.details;
    throw error;
  }

  return body.data?.order;
}

export async function fetchUserOrders() {
  const res = await fetch('/api/orders', {
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to fetch orders.');
    error.status = res.status;
    error.code = body?.code || 'FETCH_ERROR';
    throw error;
  }

  return body.data?.orders || [];
}

export async function fetchOrderById(id) {
  const res = await fetch(`/api/orders/${id}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Order not found.');
    error.status = res.status;
    error.code = body?.code || 'NOT_FOUND';
    throw error;
  }

  return body.data?.order;
}
