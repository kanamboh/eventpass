import crypto from 'crypto';
import { PaymentProvider } from './PaymentProvider.js';
import { AppError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';

export class MockPaymentProvider extends PaymentProvider {
  constructor({ webhookSecret = 'test_mock_webhook_secret_key_12345678', supportedCurrencies = ['ZAR', 'KES', 'USD'] } = {}) {
    super('MOCK');
    this.webhookSecret = webhookSecret;
    this.supportedCurrencies = supportedCurrencies.map((c) => c.toUpperCase());
    this.transactions = new Map();
    this.failureMode = null; // 'GATEWAY_ERROR' | 'AMOUNT_MISMATCH' | 'CURRENCY_MISMATCH' | 'FAILED_STATUS'
  }

  setFailureMode(mode) {
    this.failureMode = mode;
  }

  reset() {
    this.transactions.clear();
    this.failureMode = null;
  }

  isCurrencySupported(currency) {
    if (!currency) return false;
    return this.supportedCurrencies.includes(currency.toUpperCase());
  }

  async initializeTransaction({ reference, amountMinor, currency, customerEmail, callbackUrl, metadata = {} }) {
    if (env.NODE_ENV === 'production') {
      throw new AppError('Mock payment provider is strictly disabled in production environments.', 403, 'MOCK_PAYMENT_FORBIDDEN_IN_PRODUCTION');
    }

    if (!env.PAYMENTS_ENABLED) {
      throw new AppError('Online payments are temporarily unavailable.', 503, 'PAYMENTS_DISABLED');
    }

    if (this.failureMode === 'GATEWAY_ERROR') {
      throw new AppError('Payment gateway unavailable (simulated error).', 502, 'PAYMENT_GATEWAY_UNAVAILABLE');
    }

    if (!this.isCurrencySupported(currency)) {
      throw new AppError(
        `Mock payment provider does not support currency: ${currency}. Supported: ${this.supportedCurrencies.join(', ')}`,
        422,
        'CURRENCY_NOT_SUPPORTED_BY_MERCHANT',
        { requestedCurrency: currency, supportedCurrencies: this.supportedCurrencies }
      );
    }

    const tx = {
      reference,
      amountMinor,
      currency: currency.toUpperCase(),
      customerEmail,
      status: 'PENDING',
      createdAt: new Date(),
      paidAt: null
    };

    this.transactions.set(reference, tx);

    return {
      authorizationUrl: `https://checkout.eventpass.co.za/mock-pay?reference=${encodeURIComponent(reference)}`,
      accessCode: `mock_code_${reference}`,
      reference
    };
  }

  async verifyTransaction(reference, options = {}) {
    if (env.NODE_ENV === 'production') {
      throw new AppError('Mock payment provider is strictly disabled in production environments.', 403, 'MOCK_PAYMENT_FORBIDDEN_IN_PRODUCTION');
    }

    if (!env.PAYMENTS_ENABLED) {
      throw new AppError('Online payments are temporarily unavailable.', 503, 'PAYMENTS_DISABLED');
    }

    const mode = options.failureMode || this.failureMode;
    if (this.failureMode) {
      this.failureMode = null;
    }

    if (mode === 'GATEWAY_ERROR') {
      throw new AppError('Payment gateway unavailable during verify (simulated error).', 502, 'PAYMENT_GATEWAY_UNAVAILABLE');
    }

    const tx = this.transactions.get(reference);

    if (mode === 'AMOUNT_MISMATCH') {
      return {
        status: 'SUCCESS',
        amountMinor: (tx ? tx.amountMinor : 5000) - 1000,
        currency: tx ? tx.currency : 'ZAR',
        providerReference: reference,
        gatewayResponse: 'Successful',
        paidAt: new Date()
      };
    }

    if (mode === 'CURRENCY_MISMATCH') {
      return {
        status: 'SUCCESS',
        amountMinor: tx ? tx.amountMinor : 5000,
        currency: tx?.currency === 'USD' ? 'EUR' : 'USD',
        providerReference: reference,
        gatewayResponse: 'Successful',
        paidAt: new Date()
      };
    }

    if (!tx) {
      return {
        status: 'FAILED',
        amountMinor: 0,
        currency: '',
        providerReference: reference,
        gatewayResponse: 'Transaction not found on gateway.'
      };
    }

    if (mode === 'FAILED_STATUS') {
      return {
        status: 'FAILED',
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        providerReference: reference,
        gatewayResponse: 'Card declined (simulated failure).'
      };
    }

    // Default successful verification
    tx.status = 'SUCCESS';
    tx.paidAt = new Date();

    return {
      status: 'SUCCESS',
      amountMinor: tx.amountMinor,
      currency: tx.currency,
      providerReference: reference,
      gatewayResponse: 'Approved',
      paidAt: tx.paidAt,
      channel: 'card',
      customerEmail: tx.customerEmail,
      transactionId: `mock_tx_${reference}`
    };
  }

  verifyWebhookSignature(rawBody, signature) {
    if (!rawBody || !Buffer.isBuffer(rawBody) || !signature) {
      return false;
    }

    try {
      const hash = crypto
        .createHmac('sha512', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      const sigBuffer = Buffer.from(signature.trim(), 'utf8');
      const hashBuffer = Buffer.from(hash, 'utf8');

      if (sigBuffer.length !== hashBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuffer, hashBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Helper to sign a test payload for automated tests
   */
  generateSignature(payload) {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha512', this.webhookSecret).update(Buffer.from(raw, 'utf8')).digest('hex');
  }

  parseWebhookEvent(payload) {
    if (env.NODE_ENV === 'production') {
      throw new AppError('Mock payment provider is strictly disabled in production environments.', 403, 'MOCK_PAYMENT_FORBIDDEN_IN_PRODUCTION');
    }

    if (!payload || typeof payload !== 'object') {
      throw new AppError('Invalid webhook payload structure.', 400, 'INVALID_WEBHOOK_PAYLOAD');
    }

    const event = String(payload.event || '').trim();
    if (!event) {
      throw new AppError('Webhook event type is missing.', 400, 'INVALID_WEBHOOK_PAYLOAD');
    }

    const data = payload.data;
    if (!data || typeof data !== 'object') {
      throw new AppError('Webhook payload data object is missing.', 400, 'INVALID_WEBHOOK_PAYLOAD');
    }

    const transactionId = data.id !== undefined && data.id !== null && String(data.id).trim() !== ''
      ? String(data.id).trim()
      : '';
    const reference = data.reference ? String(data.reference).trim() : '';

    if (!transactionId && !reference) {
      throw new AppError('Webhook payload lacks both transaction ID and reference.', 400, 'INVALID_WEBHOOK_PAYLOAD');
    }

    const uniqueKey = transactionId ? `TX_${transactionId}` : `REF_${reference}`;
    const deterministicEventId = `MOCK_${event}_${uniqueKey}`;

    let status = 'PENDING';
    if (data.status === 'success' || event === 'charge.success') {
      status = 'SUCCESS';
    } else if (['failed', 'abandoned'].includes(data.status)) {
      status = 'FAILED';
    }

    return {
      provider: 'MOCK',
      eventType: event,
      eventId: deterministicEventId,
      transactionId,
      reference,
      status,
      amountMinor: Number(data.amount) || 0,
      currency: (data.currency || 'ZAR').toUpperCase(),
      customerEmail: data.customer?.email || '',
      paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
      rawData: payload
    };
  }
}
