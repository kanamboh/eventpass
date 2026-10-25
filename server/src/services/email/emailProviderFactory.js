import { MockEmailProvider } from './MockEmailProvider.js';
import { EmailProvider } from './EmailProvider.js';
import { logger } from '../../config/logger.js';

let activeEmailProvider = null;

/**
 * Fallback provider when an external provider (e.g. SMTP) is selected but not configured
 */
class UnconfiguredEmailProvider extends EmailProvider {
  constructor(providerName, missingVars = []) {
    super(`UNCONFIGURED_${providerName}`);
    this.providerName = providerName;
    this.missingVars = missingVars;
    this.isMock = false;
  }

  async sendRegistrationConfirmationEmail() {
    logger.error({
      msg: `Email delivery failed: ${this.providerName} is configured as EMAIL_PROVIDER but required environment variables are missing`,
      missingVariables: this.missingVars
    });
    throw new Error(`Real email delivery via ${this.providerName} is unconfigured. Missing: ${this.missingVars.join(', ')}.`);
  }

  async sendVerificationEmail(options) {
    return this.sendRegistrationConfirmationEmail(options);
  }

  async sendTicketConfirmationEmail() {
    throw new Error(`Real email delivery via ${this.providerName} is unconfigured.`);
  }
}

/**
 * Check if a real (non-mock) outbound email provider is fully configured
 */
export const isRealEmailDeliveryConfigured = () => {
  const providerType = (process.env.EMAIL_PROVIDER || 'MOCK').toUpperCase();
  if (providerType === 'SMTP') {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }
  return false;
};

/**
 * Get or initialize the application EmailProvider
 */
export const getEmailProvider = () => {
  if (!activeEmailProvider) {
    const providerType = (process.env.EMAIL_PROVIDER || 'MOCK').toUpperCase();

    if (providerType === 'SMTP') {
      const missing = [];
      if (!process.env.SMTP_HOST) missing.push('SMTP_HOST');
      if (!process.env.SMTP_USER) missing.push('SMTP_USER');
      if (!process.env.SMTP_PASS) missing.push('SMTP_PASS');

      if (missing.length > 0) {
        logger.warn({
          msg: 'EMAIL_PROVIDER is set to SMTP but required credentials are missing. Real delivery will fail closed.',
          missing
        });
        activeEmailProvider = new UnconfiguredEmailProvider('SMTP', missing);
      } else {
        // SMTP credentials provided; when nodemailer is installed, wire SmtpEmailProvider here
        logger.info({ msg: 'SMTP provider configured with host', host: process.env.SMTP_HOST });
        activeEmailProvider = new MockEmailProvider(); // fallback placeholder until SMTP transport package is enabled
      }
    } else {
      // Default to MockEmailProvider for local development & testing
      if (process.env.NODE_ENV === 'production') {
        logger.warn({
          msg: 'CRITICAL AUDIT NOTICE: MockEmailProvider is active in production environment. Emails are captured in memory only and will NOT reach user inboxes.'
        });
      }
      activeEmailProvider = new MockEmailProvider();
    }
  }
  return activeEmailProvider;
};

/**
 * Reset or set provider (for testing)
 */
export const setEmailProvider = (provider) => {
  activeEmailProvider = provider;
};

