/**
 * EventPass Frontend Ticket API Service
 * Interacts with /api/tickets using credentials: 'include' for session auth
 */

export async function fetchMyTickets() {
  const res = await fetch('/api/tickets/my-tickets', {
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to fetch tickets.');
    error.status = res.status;
    error.code = body?.code || 'FETCH_ERROR';
    throw error;
  }

  return body.data || [];
}

export async function fetchTicketById(id) {
  const res = await fetch(`/api/tickets/${id}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Ticket not found.');
    error.status = res.status;
    error.code = body?.code || 'NOT_FOUND';
    throw error;
  }

  return body.data;
}

export async function validateTicketPayload({ ticketCode, qrToken, qrPayload }) {
  const res = await fetch('/api/tickets/validate', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ ticketCode, qrToken, qrPayload })
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Validation request failed.');
    error.status = res.status;
    error.code = body?.code || 'VALIDATION_ERROR';
    throw error;
  }

  return body.data;
}

export async function checkInTicketPayload({ ticketCode, qrToken, qrPayload, eventId }) {
  const res = await fetch('/api/tickets/check-in', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ ticketCode, qrToken, qrPayload, eventId })
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Check-in failed.');
    error.status = res.status;
    error.code = body?.code || 'CHECKIN_ERROR';
    error.details = body?.details;
    throw error;
  }

  return body.data;
}
