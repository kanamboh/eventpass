import { env } from '../../config/env.js';
import { AppError } from '../../middleware/errorHandler.js';
import { PaystackProvider } from './PaystackProvider.js';
import { MockPaymentProvider } from './MockPaymentProvider.js';

const providerInstances = new Map();

/**
 * Get or create the payment provider instance
 * @param {string} [overrideProvider] Optional provider name ('PAYSTACK' | 'MOCK')
 * @returns {import('./PaymentProvider.js').PaymentProvider}
 */
export const getPaymentProvider = (overrideProvider = null) => {
  const providerName = (overrideProvider || env.PAYMENT_PROVIDER || (env.PAYSTACK_SECRET_KEY ? 'PAYSTACK' : 'MOCK')).toUpperCase();

  if (env.NODE_ENV === 'production' && providerName === 'MOCK') {
    throw new AppError('Mock payment provider is strictly forbidden in production environments.', 500, 'UNSAFE_PAYMENT_CONFIGURATION');
  }

  if (!providerInstances.has(providerName)) {
    if (providerName === 'PAYSTACK') {
      providerInstances.set(
        providerName,
        new PaystackProvider({
          secretKey: env.PAYSTACK_SECRET_KEY,
          webhookSecret: env.PAYSTACK_WEBHOOK_SECRET,
          merchantCountry: env.PAYSTACK_MERCHANT_COUNTRY
        })
      );
    } else {
      providerInstances.set(
        providerName,
        new MockPaymentProvider({
          webhookSecret: env.PAYSTACK_WEBHOOK_SECRET || 'test_mock_webhook_secret_key_12345678'
        })
      );
    }
  }

  return providerInstances.get(providerName);
};

/**
 * For testing: set or reset the active provider instance
 */
export const setPaymentProviderInstance = (instance, providerName = 'MOCK') => {
  providerInstances.set(providerName.toUpperCase(), instance);
};
