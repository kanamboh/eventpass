import { initializePayment, verifyPayment, processWebhook } from '../services/paymentService.js';
import { initializePaymentSchema, paymentReferenceParamSchema } from '../validators/paymentValidators.js';
import { env } from '../config/env.js';

/**
 * Controller: Get central online payment processing status
 * GET /api/payments/status
 */
export const getStatus = (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      paymentsEnabled: env.PAYMENTS_ENABLED
    }
  });
};

/**
 * Controller: Initialize payment session for an order
 * POST /api/payments/initialize
 */
export const initialize = async (req, res, next) => {
  try {
    const validatedData = initializePaymentSchema.parse(req.body);
    const providerOverride = env.NODE_ENV !== 'production' ? req.headers['x-payment-provider'] : undefined;
    const result = await initializePayment({
      orderId: validatedData.orderId,
      userId: req.user.id,
      callbackUrl: validatedData.callbackUrl,
      providerOverride
    });

    res.status(200).json({
      status: 'success',
      message: 'Payment initialized successfully.',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: Verify payment transaction status independently
 * GET /api/payments/verify/:reference
 */
export const verify = async (req, res, next) => {
  try {
    const { reference } = paymentReferenceParamSchema.parse(req.params);
    const simulatedFailureMode = env.NODE_ENV !== 'production' ? req.headers['x-mock-failure'] : undefined;
    const result = await verifyPayment({
      reference,
      userId: req.user?.id,
      simulatedFailureMode
    });

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: Handle Paystack Webhook
 * POST /api/payments/webhook/paystack
 * Note: Authenticated via cryptographic HMAC-SHA512 signature in x-paystack-signature header
 */
export const paystackWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body), 'utf8');

    const result = await processWebhook({
      rawBody,
      signature,
      eventPayload: req.body
    });

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
};
