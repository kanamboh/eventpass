import crypto from 'crypto';
import { PaymentProvider } from './PaymentProvider.js';
import { AppError } from '../../middleware/errorHandler.js';
import { logger } from '../../config/logger.js';

export class PaystackProvider extends PaymentProvider {
  /**
   * @param {Object} config
   * @param {string} [config.secretKey] Paystack Secret Key (e.g. sk_live_... / sk_test_...)
   * @param {string} [config.webhookSecret] Optional separate webhook secret
   * @param {string} [config.merchantCountry='KE'] Domiciled merchant country
   */
  constructor({ secretKey, webhookSecret, merchantCountry = 'KE' } = {}) {
    super('PAYSTACK');
    this.secretKey = secretKey || '';
    this.webhookSecret = webhookSecret || secretKey || '';
    this.merchantCountry = (merchantCountry || 'KE').toUpperCase();
    this.apiBase = 'https://api.paystack.co';

    // Official Paystack country currency capability map
    this.countryCurrencies = {
      KE: ['KES', 'USD'],
      ZA: ['ZAR'],
      NG: ['NGN', 'USD'],
      GH: ['GHS', 'USD']
    };
  }

  /**
   * Check if the merchant's Paystack account can charge in this currency
   * @param {string} currency
   * @returns {boolean}
   */
  isCurrencySupported(currency) {
    if (!currency) return false;
    const supported = this.countryCurrencies[this.merchantCountry] || [];
    return supported.includes(currency.toUpperCase());
  }

  /**
   * Get supported currencies for this merchant account configuration
   * @returns {string[]}
   */
  getSupportedCurrencies() {
    return this.countryCurrencies[this.merchantCountry] || [];
  }

  /**
   * Initialize a Paystack transaction
   */
  async initializeTransaction({ reference, amountMinor, currency, customerEmail, callbackUrl, metadata = {} }) {
    // Explicit server-side validation against unsupported merchant currency
    if (!this.isCurrencySupported(currency)) {
      const supported = this.getSupportedCurrencies().join(', ');
      throw new AppError(
        `Paystack ${this.merchantCountry} account does not support charging in ${currency}. Supported currencies: ${supported}. Native ZAR requires a South African merchant account or active server-side FX conversion.`,
        422,
        'CURRENCY_NOT_SUPPORTED_BY_MERCHANT',
        { requestedCurrency: currency, merchantCountry: this.merchantCountry, supportedCurrencies: this.getSupportedCurrencies() }
      );
    }

    if (!this.secretKey) {
      throw new AppError(
        'Paystack provider is not configured with a valid secret key.',
        500,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    try {
      const payload = {
        reference,
        amount: amountMinor, // Paystack expects integer minor units (kobo, cents)
        currency: currency.toUpperCase(),
        email: customerEmail,
        callback_url: callbackUrl,
        channels: ['card', 'apple_pay'],
        metadata: {
          ...metadata,
          source: 'eventpass_ticketing'
        }
      };

      const res = await fetch(`${this.apiBase}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.status) {
        const responseMessage = body.message || res.statusText || 'Payment provider rejected transaction initialization.';
        const isCurrencyUnsupported =
          (res.status === 403 || res.status === 422 || res.status === 400) &&
          (responseMessage.toLowerCase().includes('currency not supported') || responseMessage.toLowerCase().includes('currency'));

        logger.error({
          msg: 'Paystack initialize failed',
          statusCode: res.status,
          responseMessage,
          reference,
          isCurrencyUnsupported
        });

        if (isCurrencyUnsupported) {
          throw new AppError(
            `Paystack does not support charging in ${currency} for this merchant account. In your Paystack Dashboard, navigate to Settings > Preferences to enable 'Accept international payments' for USD processing, or configure a supported settlement currency.`,
            422,
            'CURRENCY_NOT_SUPPORTED_BY_MERCHANT',
            { providerMessage: responseMessage, requestedCurrency: currency, merchantCountry: this.merchantCountry }
          );
        }

        const statusCode = res.status >= 400 && res.status < 500 ? res.status : 502;
        const errorCode = res.status >= 400 && res.status < 500 ? 'PROVIDER_INITIALIZATION_FAILED' : 'PAYMENT_GATEWAY_UNAVAILABLE';

        throw new AppError(
          responseMessage,
          statusCode,
          errorCode,
          { providerMessage: responseMessage }
        );
      }

      return {
        authorizationUrl: body.data.authorization_url,
        accessCode: body.data.access_code,
        reference: body.data.reference
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ msg: 'Network error calling Paystack initialize', error: err.message, reference });
      throw new AppError(
        'Unable to communicate with payment provider. Please try again.',
        502,
        'PAYMENT_GATEWAY_UNAVAILABLE'
      );
    }
  }

  /**
   * Verify transaction with Paystack via server-to-server call
   */
  async verifyTransaction(reference) {
    if (!this.secretKey) {
      throw new AppError(
        'Paystack provider is not configured with a valid secret key.',
        500,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    try {
      const res = await fetch(`${this.apiBase}/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          Accept: 'application/json'
        }
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.status) {
        logger.warn({ msg: 'Paystack verify rejected', status: res.status, message: body.message, reference });
        return {
          status: 'FAILED',
          amountMinor: 0,
          currency: '',
          providerReference: reference,
          gatewayResponse: body.message || 'Verification failed on payment gateway.'
        };
      }

      const data = body.data || {};
      let mappedStatus = 'PENDING';
      if (data.status === 'success') {
        mappedStatus = 'SUCCESS';
      } else if (['failed', 'abandoned'].includes(data.status)) {
        mappedStatus = 'FAILED';
      }

      return {
        status: mappedStatus,
        amountMinor: Number(data.amount) || 0,
        currency: (data.currency || '').toUpperCase(),
        providerReference: data.reference || reference,
        gatewayResponse: data.gateway_response || data.status || '',
        paidAt: data.paid_at ? new Date(data.paid_at) : null,
        channel: data.channel,
        customerEmail: data.customer?.email,
        transactionId: data.id ? String(data.id) : null
      };
    } catch (err) {
      logger.error({ msg: 'Network error verifying with Paystack', error: err.message, reference });
      throw new AppError(
        'Unable to verify transaction with payment gateway. Please try again later.',
        502,
        'PAYMENT_GATEWAY_UNAVAILABLE'
      );
    }
  }

  /**
   * Cryptographically verify Paystack webhook signature using constant-time HMAC-SHA512
   */
  verifyWebhookSignature(rawBody, signature) {
    if (!this.webhookSecret) {
      logger.error({ msg: 'Paystack webhook secret not configured' });
      return false;
    }

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      logger.warn({ msg: 'Webhook rawBody is missing or not a Buffer' });
      return false;
    }

    if (!signature || typeof signature !== 'string') {
      return false;
    }

    try {
      const hash = crypto
        .createHmac('sha512', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      const sigBuffer = Buffer.from(signature.trim(), 'utf8');
      const hashBuffer = Buffer.from(hash, 'utf8');

      // Safe constant-time length check prevents RangeError DoS on malformed signatures
      if (sigBuffer.length !== hashBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuffer, hashBuffer);
    } catch (err) {
      logger.error({ msg: 'Error computing webhook HMAC signature', error: err.message });
      return false;
    }
  }

  /**
   * Parse Paystack webhook payload and construct deterministic event identity
   */
  parseWebhookEvent(payload) {
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

    // Deterministic idempotency identity using provider + event + provider transaction ID
    const uniqueKey = transactionId ? `TX_${transactionId}` : `REF_${reference}`;
    const deterministicEventId = `PAYSTACK_${event}_${uniqueKey}`;

    let status = 'PENDING';
    if (data.status === 'success' || event === 'charge.success') {
      status = 'SUCCESS';
    } else if (['failed', 'abandoned'].includes(data.status)) {
      status = 'FAILED';
    }

    return {
      provider: 'PAYSTACK',
      eventType: event,
      eventId: deterministicEventId,
      transactionId,
      reference,
      status,
      amountMinor: Number(data.amount) || 0,
      currency: (data.currency || '').toUpperCase(),
      customerEmail: data.customer?.email || '',
      paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
      rawData: payload
    };
  }
}
