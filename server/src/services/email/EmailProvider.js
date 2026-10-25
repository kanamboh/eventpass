/**
 * Base Abstract EmailProvider interface
 */
export class EmailProvider {
  constructor(name = 'BASE_EMAIL_PROVIDER') {
    this.name = name;
  }

  /**
   * Send a ticket confirmation email
   * @param {Object} options
   * @param {string} options.to - Recipient email
   * @param {string} options.buyerName - Customer name
   * @param {string} options.orderReference - Order reference code
   * @param {Object} options.event - Event metadata
   * @param {Array} options.tickets - Array of formatted tickets with qrDataUrl
   * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
   */
  async sendTicketConfirmationEmail(options) {
    throw new Error('sendTicketConfirmationEmail() must be implemented by concrete EmailProvider.');
  }

  /**
   * Send a registration confirmation email with verification link
   * @param {Object} options
   * @param {string} options.to - Recipient email
   * @param {string} [options.fullName] - User full name
   * @param {string} options.rawVerificationToken - Raw cryptographic token
   * @param {string} options.verificationUrl - Verification web URL
   * @param {string} [options.supportEmail] - Support contact email
   * @returns {Promise<{ success: boolean, messageId?: string, isMock?: boolean, html?: string, text?: string, error?: string }>}
   */
  async sendRegistrationConfirmationEmail(options) {
    throw new Error('sendRegistrationConfirmationEmail() must be implemented by concrete EmailProvider.');
  }

  /**
   * Send an email verification link
   * @param {Object} options
   * @param {string} options.to - Recipient email
   * @param {string} [options.fullName] - User full name
   * @param {string} options.rawVerificationToken - Raw cryptographic token
   * @param {string} options.verificationUrl - Verification web URL
   * @returns {Promise<{ success: boolean, messageId?: string, isMock?: boolean, html?: string, text?: string, error?: string }>}
   */
  async sendVerificationEmail(options) {
    throw new Error('sendVerificationEmail() must be implemented by concrete EmailProvider.');
  }
}


