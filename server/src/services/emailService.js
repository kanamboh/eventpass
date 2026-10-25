import { prisma } from '../config/db.js';
import { logger } from '../config/logger.js';
import { getEmailProvider } from './email/emailProviderFactory.js';
import { formatTicketWithQrForEmail } from './ticketService.js';

// Idempotency tracking set to prevent sending duplicate emails for the same order
const sentOrderEmails = new Set();

/**
 * Send ticket confirmation email for an authoritatively confirmed order
 * Safe failure handling: failure never affects payment success or ticket validity.
 */
export const sendOrderTicketEmail = async ({ orderId, order: providedOrder, tickets: providedTickets }) => {
  if (!orderId) {
    logger.warn({ msg: 'Cannot send ticket email without orderId' });
    return { success: false, reason: 'MISSING_ORDER_ID' };
  }

  // 1. Fast In-Memory Idempotency Check
  if (sentOrderEmails.has(orderId)) {
    logger.info({ msg: 'Ticket confirmation email already dispatched for order (in-memory); skipping duplicate', orderId });
    return { success: true, duplicate: true, message: 'Email already dispatched for order.' };
  }

  // 2. Database-backed Idempotency Check
  try {
    const existingDbRecord = await prisma.webhookEvent.findUnique({
      where: { providerEventId: `ORDER_EMAIL_${orderId}` }
    });
    if (existingDbRecord) {
      sentOrderEmails.add(orderId);
      logger.info({ msg: 'Ticket confirmation email already recorded in DB; skipping duplicate', orderId });
      return { success: true, duplicate: true, message: 'Email already dispatched for order.' };
    }
  } catch (dbCheckErr) {
    logger.warn({ msg: 'Could not query email idempotency DB; continuing safely', error: dbCheckErr.message });
  }

  try {
    // 2. Load order if not provided
    const order =
      providedOrder ||
      (await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          orderItems: {
            include: {
              event: true,
              ticketType: true
            }
          }
        }
      }));

    if (!order) {
      logger.error({ msg: 'Order not found for email delivery', orderId });
      return { success: false, reason: 'ORDER_NOT_FOUND' };
    }

    // 3. Strict order state check: Must be PAID
    if (order.status !== 'PAID') {
      logger.warn({
        msg: 'Refusing to send ticket email for non-PAID order',
        orderId,
        orderStatus: order.status
      });
      return { success: false, reason: 'ORDER_NOT_PAID', status: order.status };
    }

    // 4. Load tickets if not provided
    const rawTickets =
      providedTickets ||
      (await prisma.ticket.findMany({
        where: { orderId: order.id },
        include: {
          event: true,
          ticketType: true,
          order: true
        }
      }));

    if (!rawTickets || rawTickets.length === 0) {
      logger.warn({ msg: 'No tickets found for order to send in email', orderId });
      return { success: false, reason: 'NO_TICKETS_FOUND' };
    }

    // 5. Format tickets with QR credentials for email dispatch only
    const formattedTickets = await Promise.all(
      rawTickets.map((t) => formatTicketWithQrForEmail(t))
    );

    // 6. Extract event info
    const sampleEvent = rawTickets[0].event || order.orderItems?.[0]?.event;

    // 7. Dispatch via configured provider
    const provider = getEmailProvider();
    const result = await provider.sendTicketConfirmationEmail({
      to: order.buyerEmail,
      buyerName: order.buyerName,
      orderReference: order.orderReference,
      event: sampleEvent,
      tickets: formattedTickets
    });

    // 8. Record in DB idempotency table
    try {
      await prisma.webhookEvent.create({
        data: {
          provider: 'SYSTEM_EMAIL',
          providerEventId: `ORDER_EMAIL_${orderId}`,
          eventType: 'ticket.confirmation.email',
          payload: {
            orderId,
            orderReference: order.orderReference,
            recipient: order.buyerEmail,
            buyerName: order.buyerName,
            eventTitle: sampleEvent?.title || '',
            venue: sampleEvent?.venue || '',
            ticketsCount: formattedTickets.length,
            tickets: formattedTickets.map((t) => ({
              reference: t.ticketReference,
              tier: t.tier?.name,
              hasQr: Boolean(t.qrDataUrl),
              qrDataUrl: t.qrDataUrl || null,
              qrPayload: t.qrPayload || null,
              status: t.activeStatus || t.status
            })),
            html: result.html || '',
            text: result.text || '',
            messageId: result.messageId,
            sentAt: new Date()
          },
          processedAt: new Date()
        }
      });
    } catch (dbErr) {
      if (dbErr.code === 'P2002') {
        logger.info({ msg: 'Concurrent email record already logged for order', orderId });
      } else {
        logger.warn({ msg: 'Could not record email idempotency in DB', orderId, error: dbErr.message });
      }
    }

    // Mark as sent for in-memory fast caching
    sentOrderEmails.add(orderId);

    logger.info({
      msg: 'Successfully delivered ticket confirmation email',
      orderId,
      recipient: order.buyerEmail,
      ticketsCount: formattedTickets.length
    });

    return {
      success: true,
      duplicate: false,
      messageId: result.messageId
    };
  } catch (err) {
    // Failure Safety Rule: Log error, but NEVER throw upstream to break payment or invalidate tickets!
    logger.error({
      msg: 'Failed to send ticket confirmation email (Safe Handled)',
      orderId,
      error: err.message
    });

    return {
      success: false,
      safeHandled: true,
      error: err.message
    };
  }
};

/**
 * Send combined registration confirmation & email verification message via configured provider
 * Safe failure handling: failure never blocks user account creation.
 */
export const sendRegistrationConfirmationEmail = async ({ to, fullName, rawVerificationToken }) => {
  if (!to || !rawVerificationToken) {
    logger.warn({ msg: 'Cannot send registration confirmation email without recipient or token' });
    return { success: false, reason: 'MISSING_DATA' };
  }

  try {
    const provider = getEmailProvider();
    const clientBase = process.env.CLIENT_URL || 'http://localhost:3001';
    const verificationUrl = `${clientBase}/verify-email?token=${rawVerificationToken}`;

    const result = await provider.sendRegistrationConfirmationEmail({
      to,
      fullName,
      rawVerificationToken,
      verificationUrl
    });

    // Record in DB for audit trail
    try {
      await prisma.webhookEvent.create({
        data: {
          provider: 'SYSTEM_EMAIL',
          providerEventId: `REGISTRATION_EMAIL_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          eventType: 'user.registration.confirmation.email',
          payload: {
            recipient: to,
            fullName: fullName || '',
            messageId: result.messageId,
            isMock: Boolean(provider.isMock),
            sentAt: new Date()
          },
          processedAt: new Date()
        }
      });
    } catch (auditErr) {
      // Non-fatal if DB audit event fails
      logger.warn({ msg: 'Failed to record registration email in webhookEvent audit table', error: auditErr.message });
    }

    return {
      success: true,
      messageId: result.messageId,
      isMock: Boolean(provider.isMock),
      verificationUrl
    };
  } catch (err) {
    logger.error({
      msg: 'Failed to send registration confirmation email (Safe Handled)',
      to,
      error: err.message
    });
    return {
      success: false,
      safeHandled: true,
      isMock: true,
      error: err.message
    };
  }
};

/**
 * Send email verification link via configured provider (used for resends and direct verification)
 * Safe failure handling: failure never blocks account actions or crashes requests.
 */
export const sendAccountVerificationEmail = async ({ to, fullName, rawVerificationToken }) => {
  if (!to || !rawVerificationToken) {
    logger.warn({ msg: 'Cannot send verification email without recipient or token' });
    return { success: false, reason: 'MISSING_DATA' };
  }

  try {
    const provider = getEmailProvider();
    const clientBase = process.env.CLIENT_URL || 'http://localhost:3001';
    const verificationUrl = `${clientBase}/verify-email?token=${rawVerificationToken}`;
    const result = await provider.sendVerificationEmail({
      to,
      fullName,
      rawVerificationToken,
      verificationUrl
    });

    return {
      success: true,
      messageId: result.messageId,
      isMock: Boolean(provider.isMock),
      verificationUrl
    };
  } catch (err) {
    logger.error({
      msg: 'Failed to send verification email (Safe Handled)',
      to,
      error: err.message
    });
    return {
      success: false,
      safeHandled: true,
      isMock: true,
      error: err.message
    };
  }
};


/**
 * Reset idempotency cache (for automated testing)
 */
export const resetEmailIdempotency = async () => {
  sentOrderEmails.clear();
  try {
    await prisma.webhookEvent.deleteMany({
      where: { provider: 'SYSTEM_EMAIL' }
    });
  } catch (err) {
    // Non-fatal if DB cleanup fails during tests
  }
};


