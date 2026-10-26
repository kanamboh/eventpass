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
 * Image error event handler that safely swaps a broken image src with the fallback SVG.
 * Idempotent: ensures no infinite loop if fallback were ever to trigger onError.
 * 
 * @param {React.SyntheticEvent<HTMLImageElement, Event>} e
 */
export const handleImageError = (e) => {
  if (e?.currentTarget && e.currentTarget.src !== FALLBACK_EVENT_IMAGE) {
    e.currentTarget.onerror = null;
    e.currentTarget.src = FALLBACK_EVENT_IMAGE;
  }
};

/**
 * Check if an event image string is a genuine, valid image URL.
 * Used for admin alerts and ensuring customers never see missing-image events.
 */
export const isEventImageValid = (url) => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length < 10) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('blob:') || lower.startsWith('javascript:')) {
    return false;
  }
  if (
    lower.includes('placeholder') ||
    lower.includes('event photo pending') ||
    lower.includes('no-image') ||
    lower.includes('dummyimage') ||
    lower.includes('via.placeholder')
  ) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.hostname.includes('cloudinary.com') || parsed.hostname.includes('unsplash.com')) return true;
    return /\.(jpe?g|png|webp|avif|gif|svg)($|\?)/i.test(parsed.pathname);
  } catch {
    return false;
  }
};

