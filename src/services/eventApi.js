/**
 * EventPass Frontend API Service
 * Centralized, authoritative client for Events, Categories, and Ticket Inventory
 */

export async function fetchEvents(params = {}) {
  const query = new URLSearchParams();

  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.search && params.search.trim()) query.set('search', params.search.trim());
  if (params.category && params.category !== 'all') query.set('category', params.category);
  if (params.location && params.location !== 'all') query.set('location', params.location);
  if (params.when && params.when !== 'anytime') query.set('when', params.when);
  if (params.sort) query.set('sort', params.sort);
  if (params.featured) query.set('featured', 'true');

  const queryString = query.toString();
  const url = `/api/events${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg = body?.message || 'Failed to fetch events from server.';
    const error = new Error(errorMsg);
    error.status = res.status;
    error.code = body?.code || 'FETCH_ERROR';
    throw error;
  }

  return body.data;
}

export async function fetchEventByIdOrSlug(idOrSlug) {
  if (!idOrSlug) throw new Error('Event ID or slug is required.');

  const res = await fetch(`/api/events/${encodeURIComponent(idOrSlug)}`, {
    headers: {
      Accept: 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg = body?.message || 'Failed to load event details.';
    const error = new Error(errorMsg);
    error.status = res.status;
    error.code = body?.code || 'NOT_FOUND';
    throw error;
  }

  return body.data?.event;
}

export async function fetchEventTicketTypes(idOrSlug) {
  if (!idOrSlug) throw new Error('Event ID or slug is required.');

  const res = await fetch(`/api/events/${encodeURIComponent(idOrSlug)}/ticket-types`, {
    headers: {
      Accept: 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg = body?.message || 'Failed to load ticket availability.';
    const error = new Error(errorMsg);
    error.status = res.status;
    error.code = body?.code || 'NOT_FOUND';
    throw error;
  }

  return body.data?.ticketTypes || [];
}

export async function fetchCategories() {
  const res = await fetch('/api/categories', {
    headers: {
      Accept: 'application/json'
    }
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorMsg = body?.message || 'Failed to fetch categories.';
    const error = new Error(errorMsg);
    error.status = res.status;
    throw error;
  }

  return body.data?.categories || [];
}
