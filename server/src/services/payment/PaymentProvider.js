/**
 * Abstract Payment Provider Interface
 * All payment gateway implementations must conform to this interface.
 */
export class PaymentProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Check if a given currency is supported natively for charging
   * @param {string} currency e.g. 'ZAR', 'KES', 'USD'
   * @returns {boolean}
   */
  isCurrencySupported(currency) {
    throw new Error('Method isCurrencySupported() must be implemented.');
  }

  /**
   * Initialize a transaction with the provider
   * @param {Object} params
   * @param {string} params.reference Unique server-generated reference
   * @param {number} params.amountMinor Amount in minor units (integer cents)
   * @param {string} params.currency Currency code
   * @param {string} params.customerEmail Customer's email
   * @param {string} [params.callbackUrl] Optional browser callback redirect URL
   * @param {Object} [params.metadata] Additional safe metadata
   * @returns {Promise<{ authorizationUrl: string, accessCode?: string, reference: string }>}
   */
  async initializeTransaction(params) {
    throw new Error('Method initializeTransaction() must be implemented.');
  }

  /**
   * Verify transaction status with provider via server-to-server call
   * @param {string} reference
   * @returns {Promise<{ status: 'SUCCESS' | 'FAILED' | 'PENDING', amountMinor: number, currency: string, providerReference: string, gatewayResponse: string, paidAt?: Date }>}
   */
  async verifyTransaction(reference) {
    throw new Error('Method verifyTransaction() must be implemented.');
  }

  /**
   * Verify webhook authenticity using cryptographic signature
   * @param {Buffer} rawBody Unmodified HTTP request body byte buffer
   * @param {string} signature Header signature
   * @returns {boolean}
   */
  verifyWebhookSignature(rawBody, signature) {
    throw new Error('Method verifyWebhookSignature() must be implemented.');
  }

  /**
   * Parse and extract standard event information from webhook payload
   * @param {Object} payload Parsed JSON payload
   * @returns {{ eventType: string, eventId: string, reference: string, status: string, amountMinor: number, currency: string, paidAt?: Date, customerEmail?: string, rawData: Object }}
   */
  parseWebhookEvent(payload) {
    throw new Error('Method parseWebhookEvent() must be implemented.');
  }
}
