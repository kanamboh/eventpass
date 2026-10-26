/**
 * EventPass Image Fallback Utility
 * Provides a reliable, offline-safe vector SVG fallback for missing or broken event photos.
 */

export const FALLBACK_EVENT_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#7fbd52" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="500" fill="url(#bg)"/>
  <circle cx="400" cy="200" r="280" fill="url(#glow)"/>
  <g transform="translate(400, 210)" text-anchor="middle">
    <rect x="-44" y="-44" width="88" height="88" rx="22" fill="#1e293b" stroke="#334155" stroke-width="2"/>
    <path d="M-20 -10 C-20 -2, -10 6, 0 6 C10 6, 20 -2, 20 -10 M-20 -18 L20 -18 M-20 12 L20 12" stroke="#7fbd52" stroke-width="3" stroke-linecap="round" fill="none"/>
    <circle cx="0" cy="0" r="3.5" fill="#7fbd52"/>
    <text y="76" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" letter-spacing="3">EVENTPASS</text>
    <text y="96" fill="#64748b" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="500" letter-spacing="1">EVENT PHOTO PENDING</text>
  </g>
</svg>
`)}`;

/**
 * Central registry of event IDs whose images failed to load in the current browser session.
 * Prevents broken images from re-rendering and avoids infinite reload loops.
 */
const failedImageEventIds = new Set();
const imageFailureListeners = new Set();

export const markEventImageFailed = (eventId) => {
  if (!eventId) return;
  if (!failedImageEventIds.has(eventId)) {
    failedImageEventIds.add(eventId);
    imageFailureListeners.forEach((listener) => {
      try {
        listener(eventId);
      } catch (err) {
        console.error('Error in image failure listener:', err);
      }
    });
  }
};

export const isEventImageFailed = (eventId) => {
  if (!eventId) return false;
  return failedImageEventIds.has(eventId);
};

export const subscribeToImageFailures = (listener) => {
  imageFailureListeners.add(listener);
  return () => {
    imageFailureListeners.delete(listener);
  };
};

/**
 * Image error event handler that marks the event image as failed.
 * Idempotent: removes onerror to guarantee no infinite reload loop.
 *
 * @param {React.SyntheticEvent<HTMLImageElement, Event>} e
 * @param {string} [eventId]
 * @param {Function} [onFailed]
 */
export const handleImageError = (e, eventId, onFailed) => {
  if (e?.currentTarget) {
    e.currentTarget.onerror = null;
  }
  if (eventId) {
    markEventImageFailed(eventId);
  }
  if (typeof onFailed === 'function') {
    onFailed(eventId);
  }
};

/**
 * Check if an event image string is a genuine, valid image URL.
 * Strictly checks for genuine CDNs, authentic image extensions, and rejects all placeholders.
 */
export const isEventImageValid = (url) => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 12) return false;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('javascript:')
  ) {
    return false;
  }

  // Explicit placeholder keywords and mock domains
  const placeholderPatterns = [
    'placeholder',
    'event photo pending',
    'no-image',
    'noimage',
    'dummyimage',
    'via.placeholder',
    'example.com',
    'eventpass-mock',
    'test-pricing',
    'photo-symphony',
    'photo-test',
    'placeholder.com'
  ];

  for (const pattern of placeholderPatterns) {
    if (lower.includes(pattern)) {
      return false;
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // 1. Cloudinary assets
    if (hostname.includes('cloudinary.com')) {
      if (
        pathname.includes('/eventpass-mock/') ||
        pathname.includes('/demo/') ||
        /\/sample\.(jpe?g|png|webp|avif)/i.test(pathname) ||
        pathname.includes('/placeholder')
      ) {
        return false;
      }
      return pathname.length > 8 && pathname.includes('/image/');
    }

    // 2. Unsplash CDN: must match authentic photo pattern (photo-<timestamp>-<hash>)
    if (hostname.includes('unsplash.com')) {
      const isAuthenticUnsplashPhoto = /\/(photo|premium_photo)-\d{10,}-[a-f0-9]+/i.test(pathname);
      if (isAuthenticUnsplashPhoto) {
        return true;
      }
      return /\.(jpe?g|png|webp|avif)($|\?)/i.test(pathname);
    }

    // 3. Other domains: must have an authentic image extension
    return /\.(jpe?g|png|webp|avif|gif|svg)($|\?)/i.test(pathname);
  } catch {
    return false;
  }
};

