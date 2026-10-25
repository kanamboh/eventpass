/**
 * EventPass Frontend Promotional Code API Service
 */

/**
 * Validates a promotional code against cart items using server-side calculation
 * @param {Object} params
 * @param {string} params.code - The promotional code to validate
 * @param {Array<{ticketTypeId: string, quantity: number}>} params.items - Cart items
 * @param {string} [params.email] - Optional buyer email for customer limit check
 * @returns {Promise<Object>} Authoritative validation result including calculated discounts and totals
 */
export async function validatePromoCode({ code, items, email } = {}) {
  const res = await fetch('/api/promocodes/validate', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      code: code ? code.trim() : '',
      items: (items || []).map((item) => ({
        ticketTypeId: item.tierId || item.ticketTypeId,
        quantity: Number(item.quantity)
      })),
      email: email ? email.trim() : undefined
    })
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to validate promo code.');
    error.status = res.status;
    error.code = body?.code || 'PROMO_VALIDATION_ERROR';
    error.details = body?.details;
    throw error;
  }

  return body.data;
}

/**
 * Admin: List promotional codes with pagination and filters
 */
export async function fetchAdminPromoCodes({ page = 1, limit = 20, search = '', status = 'ALL' } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    status
  });
  if (search) params.set('search', search);

  const res = await fetch(`/api/admin/promocodes?${params.toString()}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to load promotional codes.');
    error.status = res.status;
    throw error;
  }
  return body.data;
}

/**
 * Admin: Get single promotional code by ID
 */
export async function fetchAdminPromoCodeById(id) {
  const res = await fetch(`/api/admin/promocodes/${id}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to load promotional code details.');
    error.status = res.status;
    throw error;
  }
  return body.data?.promoCode;
}

/**
 * Admin: Create a new promotional code
 */
export async function createAdminPromoCode(data) {
  const res = await fetch('/api/admin/promocodes', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(data)
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to create promotional code.');
    error.status = res.status;
    error.details = body?.details;
    throw error;
  }
  return body.data?.promoCode;
}

/**
 * Admin: Update promotional code
 */
export async function updateAdminPromoCode(id, data) {
  const res = await fetch(`/api/admin/promocodes/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(data)
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to update promotional code.');
    error.status = res.status;
    error.details = body?.details;
    throw error;
  }
  return body.data?.promoCode;
}

/**
 * Admin: Toggle promo code active status
 */
export async function toggleAdminPromoCodeStatus(id, isActive) {
  const res = await fetch(`/api/admin/promocodes/${id}/status`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ isActive })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to toggle promotional code status.');
    error.status = res.status;
    throw error;
  }
  return body.data?.promoCode;
}

/**
 * Admin: Delete or deactivate promotional code
 */
export async function deleteAdminPromoCode(id) {
  const res = await fetch(`/api/admin/promocodes/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to delete promotional code.');
    error.status = res.status;
    throw error;
  }
  return body;
}
