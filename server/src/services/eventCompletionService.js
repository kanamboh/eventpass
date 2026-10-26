import { prisma } from '../config/db.js';
import { logger } from '../config/logger.js';
import { recordAdminAuditLog } from './adminService.js';

/**
 * Calculates the authoritative, effective end time for an event.
 *
 * Requirements & Policy:
 * 1. If an event defines an explicit `endDateTime`, that exact timestamp is used.
 *    For multi-day events, the event remains PUBLISHED until this full end date/time has passed.
 * 2. If `endDateTime` is null/omitted:
 *    Documented fallback: Single-timed events in EventPass without an explicit end time
 *    are deemed to conclude either:
 *    a) 4 hours after `startDateTime` (standard duration for concerts/theatre/sporting events), OR
 *    b) at the end of the start date (23:59:59.999 UTC on that calendar day),
 *    whichever is LATER.
 *    This ensures that late-night events (e.g. starting at 21:00 or 22:00) do NOT get
 *    abruptly marked completed at midnight before their full 4-hour performance window finishes,
 *    and prevents silently assuming midnight for all events.
 *
 * @param {Object} event
 * @param {Date|string} event.startDateTime
 * @param {Date|string|null} [event.endDateTime]
 * @returns {Date}
 */
export function calculateEventEffectiveEndTime(event) {
  if (event.endDateTime) {
    return new Date(event.endDateTime);
  }

  const startDate = new Date(event.startDateTime);
  const plus4HoursMs = startDate.getTime() + (4 * 60 * 60 * 1000);

  const endOfCalendarDay = new Date(startDate);
  endOfCalendarDay.setUTCHours(23, 59, 59, 999);

  return new Date(Math.max(plus4HoursMs, endOfCalendarDay.getTime()));
}

/**
 * Automatically marks eligible PUBLISHED events as COMPLETED if their effective end time has passed.
 *
 * Idempotent:
 * - Only queries events with status === 'PUBLISHED'.
 * - Leaves DRAFT, CANCELLED, and COMPLETED untouched.
 * - Multi-day events remain PUBLISHED until their full endDateTime has elapsed.
 *
 * @param {Object} [options]
 * @param {Date} [options.currentTime] - Optional time override for testing
 * @returns {Promise<{ completedCount: number, completedEventIds: string[] }>}
 */
export async function autoCompletePastEvents({ currentTime = new Date() } = {}) {
  const now = currentTime instanceof Date ? currentTime : new Date(currentTime);

  // 1. Fetch only PUBLISHED events
  const publishedEvents = await prisma.event.findMany({
    where: {
      status: 'PUBLISHED'
    },
    select: {
      id: true,
      title: true,
      slug: true,
      startDateTime: true,
      endDateTime: true
    }
  });

  const expiredIds = [];

  for (const event of publishedEvents) {
    const effectiveEndTime = calculateEventEffectiveEndTime(event);
    if (now.getTime() > effectiveEndTime.getTime()) {
      expiredIds.push(event.id);
    }
  }

  if (expiredIds.length === 0) {
    logger.info({ now: now.toISOString() }, 'Auto-completion job: No expired published events found.');
    return {
      completedCount: 0,
      completedEventIds: []
    };
  }

  // 2. Batch update status to COMPLETED and set isActive to false
  await prisma.event.updateMany({
    where: {
      id: { in: expiredIds }
    },
    data: {
      status: 'COMPLETED',
      isActive: false
    }
  });

  logger.info(
    { count: expiredIds.length, eventIds: expiredIds, now: now.toISOString() },
    'Auto-completion job: Completed expired events.'
  );

  // 3. Record audit log for system scheduled task
  await recordAdminAuditLog({
    adminUserId: 'SYSTEM_CRON',
    action: 'events.auto_completed',
    entityType: 'event',
    entityId: 'BATCH',
    payload: {
      completedCount: expiredIds.length,
      completedEventIds: expiredIds,
      executedAt: now.toISOString()
    }
  });

  return {
    completedCount: expiredIds.length,
    completedEventIds: expiredIds
  };
}
