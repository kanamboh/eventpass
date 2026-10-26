import { prisma } from '../config/db.js';

/**
 * Normalizes an event title for collision and duplicate comparison:
 * - Lowercase
 * - Trims leading and trailing whitespace
 * - Strips punctuation and symbols
 * - Collapses consecutive whitespace characters into a single space
 *
 * @param {string} title
 * @returns {string}
 */
export function normalizeEventTitle(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normalizes venue or location string.
 *
 * @param {string} str
 * @returns {string}
 */
export function normalizeLocation(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Computes Levenshtein edit distance between two strings.
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, () => []);
  for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculates string similarity ratio between 0.0 and 1.0 based on edit distance.
 */
function calculateSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(a, b);
  return (maxLen - distance) / maxLen;
}

/**
 * Checks whether two dates fall within the same 24-hour timeframe or share a calendar date.
 */
function areDatesOverlapping(d1, d2, maxDiffHours = 20) {
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  if (isNaN(t1) || isNaN(t2)) return false;

  const diffHours = Math.abs(t1 - t2) / (1000 * 60 * 60);
  return diffHours <= maxDiffHours;
}

/**
 * Authoritative Server-Side Duplicate Event Detection Service.
 *
 * Inspects all existing events across PUBLISHED, DRAFT, CANCELLED, and COMPLETED states.
 * Excludes the current event during editing.
 *
 * Checks:
 * 1. Exact Duplicates:
 *    - Normalized title matches identically AND dates overlap within 24h AND venue/location matches.
 * 2. Same Title and Date:
 *    - Normalized title matches identically AND dates overlap within 24h.
 * 3. Similar Duplicates:
 *    - High title similarity (>= 85% or edit distance <= 3) AND dates overlap AND venues overlap.
 *
 * @param {Object} params
 * @param {any} [params.tx] - Optional Prisma transaction client
 * @param {string} params.title - Target event title
 * @param {Date|string} params.startDateTime - Event start timestamp
 * @param {string} params.venue - Target venue name
 * @param {string} [params.location] - City / region
 * @param {string|null} [params.excludeEventId] - Event ID to exclude (when editing)
 * @returns {Promise<{
 *   isDuplicate: boolean,
 *   matchType?: 'EXACT' | 'SAME_TITLE_AND_DATE' | 'SIMILAR',
 *   duplicateEvent?: Object,
 *   message?: string
 * }>}
 */
export async function detectDuplicateEvent({
  tx = prisma,
  title,
  startDateTime,
  venue,
  location = '',
  excludeEventId = null
}) {
  const normalizedCandidateTitle = normalizeEventTitle(title);
  const normalizedCandidateVenue = normalizeLocation(venue);
  const normalizedCandidateLocation = normalizeLocation(location);
  const candidateStartDate = new Date(startDateTime);

  if (!normalizedCandidateTitle) {
    return { isDuplicate: false };
  }

  // Fetch all existing events across all statuses
  const candidates = await tx.event.findMany({
    where: excludeEventId ? { id: { not: excludeEventId } } : {},
    select: {
      id: true,
      title: true,
      slug: true,
      venue: true,
      location: true,
      province: true,
      startDateTime: true,
      endDateTime: true,
      status: true
    }
  });

  for (const candidate of candidates) {
    const existingTitleNorm = normalizeEventTitle(candidate.title);
    const existingVenueNorm = normalizeLocation(candidate.venue);
    const existingLocationNorm = normalizeLocation(candidate.location);
    const isSameDate = areDatesOverlapping(candidateStartDate, candidate.startDateTime);

    const formattedDate = new Date(candidate.startDateTime).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    // 1. Exact Duplicate: Title, Date, and Venue all match
    if (existingTitleNorm === normalizedCandidateTitle && isSameDate) {
      const venueMatches = 
        !normalizedCandidateVenue || 
        !existingVenueNorm || 
        existingVenueNorm === normalizedCandidateVenue || 
        existingLocationNorm === normalizedCandidateLocation;

      if (venueMatches) {
        return {
          isDuplicate: true,
          matchType: 'EXACT',
          duplicateEvent: {
            id: candidate.id,
            title: candidate.title,
            slug: candidate.slug,
            status: candidate.status,
            venue: candidate.venue,
            location: candidate.location,
            startDateTime: candidate.startDateTime
          },
          message: `An identical event "${candidate.title}" already exists on ${formattedDate} at "${candidate.venue}" (Status: ${candidate.status}).`
        };
      }

      // Title and Date match even if venue string varies slightly
      return {
        isDuplicate: true,
        matchType: 'SAME_TITLE_AND_DATE',
        duplicateEvent: {
          id: candidate.id,
          title: candidate.title,
          slug: candidate.slug,
          status: candidate.status,
          venue: candidate.venue,
          location: candidate.location,
          startDateTime: candidate.startDateTime
        },
        message: `An event titled "${candidate.title}" is already scheduled on ${formattedDate} (Status: ${candidate.status}).`
      };
    }

    // 2. Similar Duplicate: Near-identical title, same date, and overlapping venue
    if (isSameDate) {
      const similarity = calculateSimilarity(existingTitleNorm, normalizedCandidateTitle);
      const isTitleVerySimilar = similarity >= 0.85 || (
        existingTitleNorm.length > 5 && 
        normalizedCandidateTitle.length > 5 && 
        (existingTitleNorm.includes(normalizedCandidateTitle) || normalizedCandidateTitle.includes(existingTitleNorm))
      );

      const venueSimilar = 
        existingVenueNorm === normalizedCandidateVenue || 
        (existingVenueNorm && normalizedCandidateVenue && (existingVenueNorm.includes(normalizedCandidateVenue) || normalizedCandidateVenue.includes(existingVenueNorm)));

      if (isTitleVerySimilar && venueSimilar) {
        return {
          isDuplicate: true,
          matchType: 'SIMILAR',
          duplicateEvent: {
            id: candidate.id,
            title: candidate.title,
            slug: candidate.slug,
            status: candidate.status,
            venue: candidate.venue,
            location: candidate.location,
            startDateTime: candidate.startDateTime
          },
          message: `A very similar event "${candidate.title}" is already scheduled at "${candidate.venue}" on ${formattedDate} (Status: ${candidate.status}).`
        };
      }
    }
  }

  return { isDuplicate: false };
}
