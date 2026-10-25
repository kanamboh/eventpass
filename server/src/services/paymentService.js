import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';
import { getPaymentProvider } from './payment/paymentProviderFactory.js';
import { formatCurrency } from './eventService.js';
import { issueTicketsForOrder } from './ticketService.js';
import { env } from '../config/env.js';
import { sendOrderTicketEmail } from './emailService.js';
import { recordPromoRedemption } from './promoCodeService.js';

/**
 * Format payment model to clean public DTO
 */
export const formatPaymentDto = (payment) => {
  return {
    id: payment.id,
    orderId: payment.orderId,
    provider: payment.provider,
    providerReference: payment.providerReference,
    amountMinor: payment.amountMinor,
    amountFormatted: formatCurrency(payment.amountMinor, payment.currency),
    currency: payment.currency,
    status: payment.status,
    failureReason: payment.failureReason,
    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    createdAt: payment.createdAt.toISOString()
  };
};

/**
 * Generate a cryptographically secure, opaque server-side payment reference
 * Format: EP-<24 hex characters>
 */
export const generateSecurePaymentReference = () => {
  const randomBytes = crypto.randomBytes(12).toString('hex').toUpperCase();
  return `EP-${randomBytes}`;
};

/**
 * Initialize a payment session for an order
 * Server-authoritative: completely ignores client-supplied amount, currency, or status
 */
export const initializePayment = async ({ orderId, userId, callbackUrl, providerOverride }) => {
  if (!env.PAYMENTS_ENABLED) {
    throw new AppError('Online payments are temporarily unavailable.', 503, 'PAYMENTS_DISABLED');
  }

  if (!orderId) {
    throw new AppError('Order ID is required to initialize payment.', 400, 'VALIDATION_ERROR');
  }

  const provider = getPaymentProvider(providerOverride);

  try {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Row-lock the Order FOR UPDATE to serialize concurrent initialization attempts for the same order
        const orders = await tx.$queryRaw`
          SELECT id, "userId", "status", "expiresAt", "totalMinor", "currency", "orderReference", "buyerEmail", "paymentReference", "paymentTotalUsdMinor", "paymentCurrency"
          FROM orders
          WHERE id = ${orderId}::uuid
          FOR UPDATE
        `;

        if (!orders || orders.length === 0) {
          throw new AppError('Order not found.', 404, 'ORDER_NOT_FOUND');
        }
        const order = orders[0];

        // BOLA Defense: ownership verification
        if (order.userId !== userId) {
          throw new AppError('You do not have permission to pay for this order.', 403, 'ORDER_ACCESS_DENIED');
        }

        // 2. Strict order state validations
        if (order.status === 'PAID') {
          throw new AppError('Order has already been paid.', 400, 'ORDER_ALREADY_PAID');
        }

        if (order.status === 'CANCELLED') {
          throw new AppError('Cannot pay for a cancelled order.', 400, 'ORDER_CANCELLED');
        }

        if (order.status === 'REFUNDED') {
          throw new AppError('Order has been refunded.', 400, 'ORDER_REFUNDED');
        }

        const now = new Date();
        if (order.status === 'EXPIRED' || (order.expiresAt && new Date(order.expiresAt) <= now)) {
          throw new AppError('Order payment window has expired. Please create a new order.', 400, 'ORDER_EXPIRED');
        }

        if (order.status === 'PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED') {
          throw new AppError('Order has completed payment but is awaiting inventory reconciliation.', 400, 'ORDER_RECONCILIATION_REQUIRED');
        }

        if (order.status !== 'PENDING' && order.status !== 'PAYMENT_PROCESSING') {
          throw new AppError(`Order is not in a payable state (status: ${order.status}).`, 400, 'ORDER_NOT_PAYABLE');
        }

        // 2b. Ensure parent event is still PUBLISHED and active
        const orderEvents = await tx.orderItem.findMany({
          where: { orderId: order.id },
          include: {
            event: { select: { id: true, title: true, status: true, isActive: true } }
          }
        });
        for (const item of orderEvents) {
          if (item.event?.status !== 'PUBLISHED' || !item.event?.isActive) {
            throw new AppError(
              `Cannot initialize payment: event "${item.event?.title || 'Unknown'}" is not published (status: ${item.event?.status || 'UNKNOWN'}).`,
              400,
              'EVENT_NOT_PUBLISHED'
            );
          }
        }

        // Check for any existing SUCCESS payment
        const existingSuccessPayment = await tx.payment.findFirst({
          where: {
            orderId: order.id,
            status: 'SUCCESS'
          }
        });
        if (existingSuccessPayment) {
          throw new AppError('Order has already been paid.', 400, 'ORDER_ALREADY_PAID');
        }

        // 3. Inspect existing active payment attempts for this order
        // Deliberate policy:
        // - INITIATED / PENDING / PROCESSING: active attempt exists -> reuse active session
        // - FAILED / ABANDONED: previous attempt terminated -> allow creating fresh payment attempt
        // - SUCCESS: rejected above with ORDER_ALREADY_PAID
        const activePayments = await tx.$queryRaw`
          SELECT id, "providerReference", "status", "providerResponse", "amountMinor", "currency", "createdAt"
          FROM payments
          WHERE "orderId" = ${order.id}::uuid
            AND status IN ('INITIATED', 'PENDING', 'PROCESSING')
          ORDER BY "createdAt" DESC
          LIMIT 1
          FOR UPDATE
        `;

        if (activePayments && activePayments.length > 0) {
          const activePayment = activePayments[0];
          // If an active session already exists with provider authorization, reuse it idempotently
          if (activePayment.providerResponse) {
            const resp = typeof activePayment.providerResponse === 'string'
              ? JSON.parse(activePayment.providerResponse)
              : activePayment.providerResponse;

            return {
              paymentId: activePayment.id,
              orderId: order.id,
              orderReference: order.orderReference,
              reference: activePayment.providerReference,
              authorizationUrl: resp.authorizationUrl || null,
              accessCode: resp.accessCode || null,
              amountMinor: activePayment.amountMinor,
              amountFormatted: formatCurrency(activePayment.amountMinor, activePayment.currency),
              currency: activePayment.currency,
              expiresAt: order.expiresAt ? new Date(order.expiresAt).toISOString() : null,
              reused: true
            };
          }
        }

        // 4. Determine authoritative payment currency & amount
        // If order has paymentTotalUsdMinor > 0 or provider is PAYSTACK, use USD payment pricing:
        const hasUsdPrice = order.paymentTotalUsdMinor !== null && Number(order.paymentTotalUsdMinor) > 0;
        const targetCurrency = hasUsdPrice
          ? (order.paymentCurrency || 'USD')
          : (order.currency || 'ZAR');

        const targetAmountMinor = hasUsdPrice
          ? Number(order.paymentTotalUsdMinor)
          : Number(order.totalMinor);

        // Strict Paystack validation: Paystack MUST NEVER be initialized in ZAR
        if (provider.name === 'PAYSTACK' && targetCurrency.toUpperCase() === 'ZAR') {
          throw new AppError(
            'Paystack payments cannot be initialized in ZAR. Transactions must use authoritative USD payment currency.',
            422,
            'CURRENCY_NOT_SUPPORTED_BY_MERCHANT',
            { currency: targetCurrency }
          );
        }

        // Verify provider supports target currency
        if (!provider.isCurrencySupported(targetCurrency)) {
          throw new AppError(
            `Payment provider does not support payment currency: ${targetCurrency}.`,
            422,
            'CURRENCY_NOT_SUPPORTED_BY_MERCHANT',
            { currency: targetCurrency }
          );
        }

        // Ensure authoritative payment amount is strictly positive
        if (!targetAmountMinor || targetAmountMinor <= 0) {
          throw new AppError(
            'Cannot initialize payment: order does not have a valid positive payment amount.',
            400,
            'INVALID_PAYMENT_AMOUNT',
            { amountMinor: targetAmountMinor, currency: targetCurrency }
          );
        }

        // 5. Generate opaque cryptographically random payment reference
        const reference = generateSecurePaymentReference();

        // 6. Call provider to initialize payment session
        const providerInit = await provider.initializeTransaction({
          reference,
          amountMinor: targetAmountMinor,
          currency: targetCurrency,
          customerEmail: order.buyerEmail,
          callbackUrl,
          metadata: {
            orderId: order.id,
            orderReference: order.orderReference,
            userId: order.userId
          }
        });

        // 7. Update order status to PAYMENT_PROCESSING
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'PAYMENT_PROCESSING',
            paymentReference: reference
          }
        });

        // 8. Create Payment record in PENDING status
        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            provider: provider.name,
            providerReference: reference,
            amountMinor: targetAmountMinor,
            currency: targetCurrency,
            status: 'PENDING',
            providerResponse: providerInit
          }
        });

        return {
          paymentId: payment.id,
          orderId: order.id,
          orderReference: order.orderReference,
          reference,
          authorizationUrl: providerInit.authorizationUrl,
          accessCode: providerInit.accessCode,
          amountMinor: targetAmountMinor,
          amountFormatted: formatCurrency(targetAmountMinor, targetCurrency),
          currency: targetCurrency,
          expiresAt: order.expiresAt ? new Date(order.expiresAt).toISOString() : null,
          reused: false
        };
      },
      { isolationLevel: 'ReadCommitted', timeout: 30000 }
    );
  } catch (err) {
    if (err.code === 'P2002') {
      // Secondary defense: if unique_active_order_payment caught concurrent insertion, fetch and return the active session
      const activePay = await prisma.payment.findFirst({
        where: {
          orderId,
          status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] }
        },
        include: { order: true }
      });
      if (activePay && activePay.providerResponse) {
        const resp = typeof activePay.providerResponse === 'string'
          ? JSON.parse(activePay.providerResponse)
          : activePay.providerResponse;
        return {
          paymentId: activePay.id,
          orderId: activePay.orderId,
          orderReference: activePay.order.orderReference,
          reference: activePay.providerReference,
          authorizationUrl: resp.authorizationUrl || null,
          accessCode: resp.accessCode || null,
          amountMinor: activePay.amountMinor,
          amountFormatted: formatCurrency(activePay.amountMinor, activePay.currency),
          currency: activePay.currency,
          expiresAt: activePay.order.expiresAt ? new Date(activePay.order.expiresAt).toISOString() : null,
          reused: true
        };
      }
    }
    throw err;
  }
};

/**
 * Verify a payment transaction server-side
 * Never trusts frontend redirect; queries provider independently
 */
export const verifyPayment = async ({ reference, userId, simulatedFailureMode }) => {
  if (!reference) {
    throw new AppError('Payment reference is required.', 400, 'VALIDATION_ERROR');
  }

  // Freeze barrier: do not contact provider or finalize transactions while payments are frozen
  if (!env.PAYMENTS_ENABLED) {
    throw new AppError('Online payments are temporarily unavailable.', 503, 'PAYMENTS_DISABLED');
  }

  const payment = await prisma.payment.findUnique({
    where: { providerReference: reference },
    include: {
      order: true
    }
  });

  if (!payment) {
    throw new AppError('Payment transaction not found.', 404, 'PAYMENT_NOT_FOUND');
  }

  // Authorization check (BOLA defense)
  if (userId && payment.order.userId !== userId) {
    throw new AppError('You do not have permission to verify this payment.', 403, 'PAYMENT_ACCESS_DENIED');
  }

  // If payment is already finalized as SUCCESS, return current state idempotently
  if (payment.status === 'SUCCESS') {
    return {
      payment: formatPaymentDto(payment),
      orderStatus: payment.order.status,
      alreadyProcessed: true
    };
  }

  // Call provider to independently verify transaction status
  const provider = getPaymentProvider(payment.provider);
  const providerVerification = await provider.verifyTransaction(reference, {
    failureMode: simulatedFailureMode
  });

  if (providerVerification.status === 'SUCCESS') {
    try {
      // Atomically transition payment to SUCCESS and reconcile order
      const result = await finalizePaymentSuccess({
        reference,
        providerData: providerVerification
      });
      return {
        payment: formatPaymentDto(result.payment),
        orderStatus: result.order.status,
        alreadyProcessed: Boolean(result.alreadyProcessed),
        reconciled: Boolean(result.reconciled)
      };
    } catch (err) {
      if (['AMOUNT_MISMATCH', 'CURRENCY_MISMATCH'].includes(err.code)) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failureReason: err.message
          }
        });
      }
      throw err;
    }
  }

  if (providerVerification.status === 'FAILED') {
    // State machine invariant: Never revert an already successful payment or paid order to FAILED!
    if (payment.status === 'SUCCESS' || payment.order.status === 'PAID') {
      return {
        payment: formatPaymentDto(payment),
        orderStatus: payment.order.status,
        alreadyProcessed: true
      };
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        failureReason: providerVerification.gatewayResponse || 'Payment declined by gateway'
      }
    });

    return {
      payment: formatPaymentDto({ ...payment, status: 'FAILED', failureReason: providerVerification.gatewayResponse }),
      orderStatus: payment.order.status,
      alreadyProcessed: false
    };
  }

  return {
    payment: formatPaymentDto(payment),
    orderStatus: payment.order.status,
    alreadyProcessed: false
  };
};

/**
 * Process incoming provider webhook
 * Enforces cryptographic signature verification and database idempotency
 */
export const processWebhook = async ({ rawBody, signature, eventPayload }) => {
  if (!env.PAYMENTS_ENABLED) {
    throw new AppError('Online payments are temporarily unavailable.', 503, 'PAYMENTS_DISABLED');
  }

  const provider = getPaymentProvider();

  // 1. Verify cryptographic HMAC signature
  const isValid = provider.verifyWebhookSignature(rawBody, signature);
  if (!isValid) {
    logger.warn({ msg: 'Webhook rejected due to invalid signature' });
    throw new AppError('Invalid webhook signature.', 401, 'INVALID_WEBHOOK_SIGNATURE');
  }

  // 2. Parse event payload
  const parsedEvent = provider.parseWebhookEvent(eventPayload);

  // 3. Database Idempotency Check (Concurrent race-safe)
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: parsedEvent.provider,
        providerEventId: parsedEvent.eventId,
        eventType: parsedEvent.eventType,
        payload: parsedEvent.rawData || eventPayload,
        processedAt: new Date()
      }
    });
  } catch (err) {
    if (err.code === 'P2002') {
      // Duplicate event delivery: log and return 200 idempotently
      logger.info({ msg: 'Duplicate webhook event received and deduplicated', eventId: parsedEvent.eventId });
      return { status: 'success', duplicate: true, message: 'Event already processed.' };
    }
    throw err;
  }

  // 4. Process charge.success event
  if (parsedEvent.eventType === 'charge.success' || parsedEvent.status === 'SUCCESS') {
    if (parsedEvent.reference) {
      await finalizePaymentSuccess({
        reference: parsedEvent.reference,
        providerData: parsedEvent
      });
    }
  } else if (parsedEvent.status === 'FAILED') {
    if (parsedEvent.reference) {
      const existingPay = await prisma.payment.findUnique({
        where: { providerReference: parsedEvent.reference },
        include: { order: true }
      });
      // Invariant: Never allow a late FAILED webhook to overwrite a SUCCESS payment or PAID order!
      if (existingPay && existingPay.status !== 'SUCCESS' && existingPay.order?.status !== 'PAID') {
        await prisma.payment.update({
          where: { id: existingPay.id },
          data: {
            status: 'FAILED',
            failureReason: 'Payment decline reported by webhook.'
          }
        });
      }
    }
  }

  return { status: 'success', duplicate: false };
};

/**
 * Atomically finalize payment success, update order, and reconcile inventory
 * Maintains inventory invariant: quantitySold + quantityReserved <= quantityTotal
 */
export const finalizePaymentSuccess = async ({ reference, providerData }) => {
  if (!env.PAYMENTS_ENABLED) {
    throw new AppError('Online payments are temporarily unavailable.', 503, 'PAYMENTS_DISABLED');
  }

  const result = await prisma.$transaction(
    async (tx) => {
      // 1. Lock Payment row FOR UPDATE
      const payments = await tx.$queryRaw`
        SELECT id, "orderId", "amountMinor", "currency", "status", "providerReference", "provider"
        FROM payments
        WHERE "providerReference" = ${reference}
        FOR UPDATE
      `;

      if (!payments || payments.length === 0) {
        throw new AppError('Referenced payment does not exist.', 404, 'PAYMENT_NOT_FOUND');
      }
      const payment = payments[0];

      // Security barrier: Mock payment provider is strictly barred from finalizing payments in production
      if (env.NODE_ENV === 'production' && payment.provider === 'MOCK') {
        throw new AppError('Mock payment transactions cannot be finalized in production.', 403, 'MOCK_PAYMENT_FORBIDDEN_IN_PRODUCTION');
      }

      // Idempotency: if payment is already marked SUCCESS, return existing record
      if (payment.status === 'SUCCESS') {
        const existingOrder = await tx.order.findUnique({ where: { id: payment.orderId } });
        return { payment, order: existingOrder, alreadyProcessed: true };
      }

      // 2. Lock Order row FOR UPDATE
      const orders = await tx.$queryRaw`
        SELECT id, "totalMinor", "currency", "status", "expiresAt", "userId", "paymentTotalUsdMinor", "paymentCurrency", "promoCodeId", "buyerEmail", "discountMinor"
        FROM orders
        WHERE id = ${payment.orderId}::uuid
        FOR UPDATE
      `;
      const order = orders[0];

      // State transition invariant: If order is already PAID, return idempotently without touching inventory or order status
      if (order.status === 'PAID') {
        return { payment, order, alreadyProcessed: true };
      }

      // 3. Authoritative financial validation
      const isUsdPayment = payment.currency === 'USD' || (order.paymentTotalUsdMinor !== null && Number(order.paymentTotalUsdMinor) > 0);
      const expectedAmountMinor = isUsdPayment
        ? Number(order.paymentTotalUsdMinor || payment.amountMinor)
        : Number(order.totalMinor);

      const expectedCurrency = isUsdPayment
        ? (order.paymentCurrency || 'USD').toUpperCase()
        : (payment.currency || order.currency || 'ZAR').toUpperCase();

      // Strict Paystack validation: Paystack payments MUST be in USD
      if (payment.provider === 'PAYSTACK' && providerData.currency?.toUpperCase() !== 'USD') {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failureReason: `Currency mismatch: Paystack payments must be processed in USD, received ${providerData.currency}`
          }
        });
        throw new AppError('Payment currency does not match authoritative payment currency (Paystack must be USD).', 400, 'CURRENCY_MISMATCH');
      }

      if (Number(providerData.amountMinor) !== expectedAmountMinor) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failureReason: `Amount mismatch: expected ${expectedAmountMinor}, received ${providerData.amountMinor}`
          }
        });
        throw new AppError('Payment amount does not match authoritative order total.', 400, 'AMOUNT_MISMATCH');
      }

      if (providerData.currency.toUpperCase() !== expectedCurrency) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failureReason: `Currency mismatch: expected ${expectedCurrency}, received ${providerData.currency}`
          }
        });
        throw new AppError('Payment currency does not match authoritative order currency.', 400, 'CURRENCY_MISMATCH');
      }

      // 4. Retrieve order items to calculate required ticket tier adjustments
      const orderItems = await tx.orderItem.findMany({
        where: { orderId: order.id },
        include: { ticketType: true }
      });

      const ticketTypeIds = [...new Set(orderItems.map((item) => item.ticketTypeId))].sort();

      // 5. Lock ticket types FOR UPDATE in deterministic order to prevent deadlocks
      await tx.$queryRaw`
        SELECT id FROM ticket_types
        WHERE id = ANY(${ticketTypeIds}::uuid[])
        ORDER BY id ASC
        FOR UPDATE
      `;

      // 6. Critical Payment/Reservation Expiry Race Check:
      const now = new Date();
      const isOrderExpired = order.status === 'EXPIRED' || (order.expiresAt && new Date(order.expiresAt) <= now);
      const isOrderCancelled = order.status === 'CANCELLED';

      if (isOrderExpired || isOrderCancelled) {
        // Check if unallocated inventory is still sufficient to safely satisfy the order
        let canFulfill = !isOrderCancelled;
        for (const item of orderItems) {
          const tier = await tx.ticketType.findUnique({ where: { id: item.ticketTypeId } });
          const activeResSumResult = await tx.$queryRaw`
            SELECT COALESCE(SUM(quantity), 0)::int as "sum"
            FROM reservations
            WHERE "ticketTypeId" = ${item.ticketTypeId}::uuid
              AND status = 'ACTIVE'::"ReservationStatus"
              AND "expiresAt" > NOW()
          `;
          const activeReserved = activeResSumResult[0].sum;
          const available = tier.quantityTotal - tier.quantitySold - activeReserved;
          if (item.quantity > available) {
            canFulfill = false;
            break;
          }
        }

        if (!canFulfill) {
          // Inventory has been reallocated. DO NOT OVERSELL!
          // Mark Payment SUCCESS (customer paid) and Order PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED
          const updatedPayment = await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'SUCCESS',
              paidAt: providerData.paidAt || new Date(),
              failureReason: 'Payment confirmed after order expired; inventory was re-allocated. Awaiting admin reconciliation.'
            }
          });

          const reconciledOrder = await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED',
              paidAt: providerData.paidAt || new Date()
            }
          });

          logger.warn({
            msg: 'Payment confirmed but inventory unavailable. Moved to PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED',
            orderId: order.id,
            reference
          });

          return { payment: updatedPayment, order: reconciledOrder, reconciled: true };
        }
      }

      // 7. Normal or successfully reconciled fulfillment:
      // Update Payment to SUCCESS
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          paidAt: providerData.paidAt || new Date(),
          providerResponse: providerData.rawData || null
        }
      });

      // Update Order to PAID
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          paidAt: providerData.paidAt || new Date(),
          paymentReference: reference
        }
      });

      // Atomically record promo code redemption if code is associated with this order
      if (order.promoCodeId) {
        await recordPromoRedemption({
          promoCodeId: order.promoCodeId,
          orderId: order.id,
          userId: order.userId,
          customerEmail: order.buyerEmail,
          discountAmountMinor: order.discountMinor || 0,
          tx
        });
      }

      // Atomically increment quantitySold on ticket_types
      for (const item of orderItems) {
        await tx.ticketType.update({
          where: { id: item.ticketTypeId },
          data: {
            quantitySold: {
              increment: item.quantity
            }
          }
        });
      }

      // Synchronize quantityReserved and quantityAvailable to strictly maintain Invariants
      await tx.$executeRaw`
        UPDATE ticket_types tt
        SET "quantityReserved" = (
          SELECT COALESCE(SUM(r.quantity), 0)::int
          FROM reservations r
          WHERE r."ticketTypeId" = tt.id
            AND r.status = 'ACTIVE'::"ReservationStatus"
            AND r."expiresAt" > NOW()
        ),
        "quantityAvailable" = GREATEST(0, tt."quantityTotal" - tt."quantitySold" - (
          SELECT COALESCE(SUM(r.quantity), 0)::int
          FROM reservations r
          WHERE r."ticketTypeId" = tt.id
            AND r.status = 'ACTIVE'::"ReservationStatus"
            AND r."expiresAt" > NOW()
        )),
        "updatedAt" = NOW()
        WHERE tt.id = ANY(${ticketTypeIds}::uuid[])
      `;

      // 8. Atomically issue tickets for the paid order (Idempotent)
      const tickets = await issueTicketsForOrder(tx, updatedOrder, orderItems);

      return { payment: updatedPayment, order: updatedOrder, tickets };
    },
    {
      isolationLevel: 'ReadCommitted',
      timeout: 30000
    }
  );

  // 9. Asynchronously trigger ticket confirmation email AFTER transaction commits!
  // Safe failure: any email error will not affect the committed payment or tickets
  try {
    if (result.order && result.order.status === 'PAID' && result.tickets) {
      await sendOrderTicketEmail({
        orderId: result.order.id,
        order: result.order,
        tickets: result.tickets
      });
    }
  } catch (emailErr) {
    logger.error({
      msg: 'Ticket email delivery failed after payment finalization (Safe Handled)',
      orderId: result.order?.id,
      error: emailErr.message
    });
  }

  return result;
};
