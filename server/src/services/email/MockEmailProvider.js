import { EmailProvider } from './EmailProvider.js';
import { 
  generateTicketEmailHtml, 
  generateTicketEmailText,
  generateRegistrationConfirmationEmailHtml,
  generateRegistrationConfirmationEmailText
} from './emailTemplate.js';
import { logger } from '../../config/logger.js';

/**
 * MockEmailProvider for local development and automated security testing
 * Safely generates authentic email HTML and records delivery in memory without sending real network emails.
 */
export class MockEmailProvider extends EmailProvider {
  constructor() {
    super('MOCK_EMAIL_PROVIDER');
    this.sentEmails = [];
    this.simulatedFailure = false;
    this.isMock = true;
  }

  /**
   * Set simulated failure mode for testing error resilience
   */
  setFailureMode(shouldFail = false) {
    this.simulatedFailure = shouldFail;
  }

  /**
   * Send ticket confirmation email (in-memory mock)
   */
  async sendTicketConfirmationEmail({
    to,
    buyerName,
    orderReference,
    event,
    tickets = [],
    supportEmail
  }) {
    if (this.simulatedFailure) {
      logger.warn({
        msg: '[MOCK EMAIL] Simulated provider failure triggered',
        to,
        orderReference
      });
      throw new Error('Simulated upstream email service failure (503 Service Unavailable).');
    }

    const html = generateTicketEmailHtml({
      buyerName,
      orderReference,
      event,
      tickets,
      supportEmail
    });

    const text = generateTicketEmailText({
      buyerName,
      orderReference,
      event,
      tickets,
      supportEmail
    });

    const emailRecord = {
      messageId: `mock-email-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      to,
      subject: `Your EventPass Tickets - ${event?.title || 'Event Confirmation'}`,
      buyerName,
      orderReference,
      eventTitle: event?.title,
      eventDate: event?.startDateTime,
      venue: event?.venue,
      ticketsCount: tickets.length,
      tickets: tickets.map((t) => ({
        reference: t.ticketReference,
        tier: t.tier?.name,
        hasQr: Boolean(t.qrDataUrl),
        qrDataUrl: t.qrDataUrl || null,
        qrPayload: t.qrPayload || null,
        status: t.activeStatus || t.status
      })),
      html,
      text,
      sentAt: new Date().toISOString()
    };

    this.sentEmails.push(emailRecord);

    logger.info({
      msg: '[MOCK EMAIL] Ticket confirmation email generated successfully',
      messageId: emailRecord.messageId,
      to,
      orderReference,
      ticketsCount: tickets.length
    });

    return {
      success: true,
      messageId: emailRecord.messageId,
      sentAt: emailRecord.sentAt,
      isMock: true,
      html,
      text
    };
  }

  /**
   * Send registration confirmation email with verification link (in-memory mock)
   */
  async sendRegistrationConfirmationEmail({
    to,
    fullName,
    rawVerificationToken,
    verificationUrl,
    supportEmail = 'support@eventpass.co.za'
  }) {
    if (this.simulatedFailure) {
      logger.warn({
        msg: '[MOCK EMAIL] Simulated provider failure triggered for registration confirmation email',
        to
      });
      throw new Error('Simulated upstream email service failure (503 Service Unavailable).');
    }

    const resolvedUrl = verificationUrl || `http://localhost:3001/verify-email?token=${rawVerificationToken}`;

    const html = generateRegistrationConfirmationEmailHtml({
      fullName,
      email: to,
      verificationUrl: resolvedUrl,
      supportEmail
    });

    const text = generateRegistrationConfirmationEmailText({
      fullName,
      email: to,
      verificationUrl: resolvedUrl,
      supportEmail
    });

    const emailRecord = {
      messageId: `mock-reg-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      type: 'REGISTRATION_CONFIRMATION_EMAIL',
      to,
      subject: 'Welcome to EventPass — Confirm Your Email Address',
      fullName,
      rawVerificationToken,
      verificationUrl: resolvedUrl,
      supportEmail,
      html,
      text,
      sentAt: new Date().toISOString()
    };

    this.sentEmails.push(emailRecord);

    // Security rule: Never log raw verification tokens
    logger.info({
      msg: '[MOCK EMAIL] Registration confirmation email recorded in mock provider',
      messageId: emailRecord.messageId,
      to,
      type: 'REGISTRATION_CONFIRMATION_EMAIL'
    });

    return {
      success: true,
      messageId: emailRecord.messageId,
      sentAt: emailRecord.sentAt,
      isMock: true,
      html,
      text
    };
  }

  /**
   * Send email verification link (in-memory mock)
   * Also provides full HTML and text for backward compatibility with verification suites
   */
  async sendVerificationEmail({
    to,
    fullName,
    rawVerificationToken,
    verificationUrl,
    supportEmail = 'support@eventpass.co.za'
  }) {
    if (this.simulatedFailure) {
      logger.warn({
        msg: '[MOCK EMAIL] Simulated provider failure triggered for verification email',
        to
      });
      throw new Error('Simulated upstream email service failure (503 Service Unavailable).');
    }

    const resolvedUrl = verificationUrl || `http://localhost:3001/verify-email?token=${rawVerificationToken}`;

    const html = generateRegistrationConfirmationEmailHtml({
      fullName,
      email: to,
      verificationUrl: resolvedUrl,
      supportEmail
    });

    const text = generateRegistrationConfirmationEmailText({
      fullName,
      email: to,
      verificationUrl: resolvedUrl,
      supportEmail
    });

    const emailRecord = {
      messageId: `mock-verify-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      type: 'VERIFICATION_EMAIL',
      to,
      subject: 'Welcome to EventPass — Confirm Your Email Address',
      fullName,
      rawVerificationToken,
      verificationUrl: resolvedUrl,
      supportEmail,
      html,
      text,
      sentAt: new Date().toISOString()
    };

    this.sentEmails.push(emailRecord);

    // Security rule: Do not log raw verification tokens
    logger.info({
      msg: '[MOCK EMAIL] Verification email recorded in mock provider',
      messageId: emailRecord.messageId,
      to,
      type: 'VERIFICATION_EMAIL'
    });

    return {
      success: true,
      messageId: emailRecord.messageId,
      sentAt: emailRecord.sentAt,
      isMock: true,
      html,
      text
    };
  }

  getSentEmails() {
    return [...this.sentEmails];
  }

  getLastEmail() {
    return this.sentEmails.length > 0 ? this.sentEmails[this.sentEmails.length - 1] : null;
  }

  clearSentEmails() {
    this.sentEmails = [];
    this.simulatedFailure = false;
  }
}

