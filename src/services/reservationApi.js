/**
 * EventPass Frontend Reservation API Service
 * Interacts with /api/reservations using credentials: 'include' for session auth
 */

export async function fetchUserReservations() {
  const res = await fetch('/api/reservations', {
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to fetch reservations.');
    error.status = res.status;
    error.code = body?.code || 'FETCH_ERROR';
    throw error;
  }

  return body.data;
}

export async function createReservation({ ticketTypeId, quantity }) {
  const res = await fetch('/api/reservations', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      ticketTypeId,
      quantity
    })
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to reserve tickets.');
    error.status = res.status;
    error.code = body?.code || 'RESERVATION_ERROR';
    error.details = body?.details;
    throw error;
  }

  return body.data;
}

export async function cancelReservation(reservationId) {
  if (!reservationId) return null;

  const res = await fetch(`/api/reservations/${reservationId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      Accept: 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to cancel reservation.');
    error.status = res.status;
    error.code = body?.code || 'CANCEL_ERROR';
    throw error;
  }

  return body.data;
}
