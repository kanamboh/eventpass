/**
 * EventPass Admin API Service
 * Secure client for admin event and ticket tier management.
 * Always passes credentials for session verification.
 */

export async function fetchAdminEvents(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.search && params.search.trim()) query.set('search', params.search.trim());
  if (params.status && params.status !== 'all') query.set('status', params.status);

  const queryString = query.toString();
  const url = `/api/admin/events${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include'
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to fetch admin events.');
    error.status = res.status;
    error.code = body?.code || 'FETCH_ERROR';
    throw error;
  }

  return body.data;
}

export async function fetchAdminEventById(eventId) {
  if (!eventId) throw new Error('Event ID is required.');

  const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include'
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to fetch event.');
    error.status = res.status;
    error.code = body?.code || 'NOT_FOUND';
    throw error;
  }

  return body.data.event;
}

export async function createAdminEvent(payload) {
  const res = await fetch('/api/admin/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to create event.');
    error.status = res.status;
    error.code = body?.code || 'CREATE_ERROR';
    error.details = body?.details;
    throw error;
  }

  return body.data.event;
}

export async function updateAdminEvent(eventId, payload) {
  if (!eventId) throw new Error('Event ID is required.');

  const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to update event.');
    error.status = res.status;
    error.code = body?.code || 'UPDATE_ERROR';
    error.details = body?.details;
    throw error;
  }

  return body.data.event;
}

export async function updateAdminEventStatus(eventId, status) {
  if (!eventId) throw new Error('Event ID is required.');

  const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ status })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to update event status.');
    error.status = res.status;
    error.code = body?.code || 'STATUS_ERROR';
    throw error;
  }

  return body.data.event;
}

export async function createAdminTicketType(eventId, payload) {
  if (!eventId) throw new Error('Event ID is required.');

  const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/ticket-types`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to create ticket tier.');
    error.status = res.status;
    error.code = body?.code || 'CREATE_TIER_ERROR';
    error.details = body?.details;
    throw error;
  }

  return body.data.ticketType;
}

export async function updateAdminTicketType(eventId, ticketTypeId, payload) {
  if (!eventId || !ticketTypeId) throw new Error('Event ID and Ticket Type ID are required.');

  const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/ticket-types/${encodeURIComponent(ticketTypeId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to update ticket tier.');
    error.status = res.status;
    error.code = body?.code || 'UPDATE_TIER_ERROR';
    error.details = body?.details;
    throw error;
  }

  return body.data.ticketType;
}

export async function deleteAdminTicketType(eventId, ticketTypeId) {
  if (!eventId || !ticketTypeId) throw new Error('Event ID and Ticket Type ID are required.');

  const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/ticket-types/${encodeURIComponent(ticketTypeId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    credentials: 'include'
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to delete ticket tier.');
    error.status = res.status;
    error.code = body?.code || 'DELETE_TIER_ERROR';
    throw error;
  }

  return body.data;
}

/**
 * Secure Event Poster Image Upload
 * Sends multipart/form-data with session cookies for administrator authorization.
 *
 * @param {File} file - Selected image file (JPEG, PNG, WebP <= 5MB)
 * @returns {Promise<{ url: string, publicId: string, format: string, size: number }>}
 */
export async function uploadAdminEventPoster(file) {
  if (!file) throw new Error('File is required for upload.');

  // Client-side pre-validation
  if (file.size > 5 * 1024 * 1024) {
    const error = new Error('File exceeds the maximum allowed size of 5 MB.');
    error.code = 'LIMIT_FILE_SIZE';
    error.status = 400;
    throw error;
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (file.type && !allowedTypes.includes(file.type)) {
    const error = new Error('Unsupported file format. Please select a JPEG, PNG, or WebP image.');
    error.code = 'INVALID_FILE_TYPE';
    error.status = 400;
    throw error;
  }

  const formData = new FormData();
  formData.append('poster', file);

  const res = await fetch('/api/admin/events/upload-poster', {
    method: 'POST',
    headers: {
      Accept: 'application/json'
    },
    credentials: 'include',
    body: formData
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to upload event poster.');
    error.status = res.status;
    error.code = body?.code || 'UPLOAD_FAILED';
    error.details = body?.details;
    throw error;
  }

  return body.data;
}

/**
 * Fetch users list with pagination, search, and role filter (SUPER_ADMIN only)
 */
export async function fetchAdminUsers(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.search && params.search.trim()) query.set('search', params.search.trim());
  if (params.role && params.role !== 'ALL') query.set('role', params.role);
  if (params.archived !== undefined) query.set('archived', String(params.archived));
  if (params.status) query.set('status', params.status);

  const queryString = query.toString();
  const url = `/api/admin/users${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include'
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to fetch users.');
    error.status = res.status;
    error.code = body?.code || 'FETCH_USERS_FAILED';
    throw error;
  }

  return body.data;
}

/**
 * Update a user's role between CUSTOMER and ADMIN (SUPER_ADMIN only)
 */
export async function updateAdminUserRole(userId, role) {
  if (!userId) throw new Error('User ID is required.');
  if (!role) throw new Error('Role is required.');

  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ role })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to update user role.');
    error.status = res.status;
    error.code = body?.code || 'UPDATE_ROLE_FAILED';
    throw error;
  }

  return body.data.user;
}

/**
 * Fetch role change audit history (SUPER_ADMIN only)
 */
export async function fetchAdminUserAuditLogs() {
  const res = await fetch('/api/admin/users/audit-logs', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include'
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body?.message || 'Failed to fetch audit logs.');
    error.status = res.status;
    error.code = body?.code || 'FETCH_AUDIT_LOGS_FAILED';
    throw error;
  }

  return body.data.logs;
}


