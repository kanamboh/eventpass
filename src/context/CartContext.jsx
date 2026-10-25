import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  fetchUserReservations,
  createReservation,
  cancelReservation
} from '../services/reservationApi';
import { createOrder, fetchUserOrders } from '../services/orderApi';
import { initializePayment, verifyPayment, fetchPaymentStatus } from '../services/paymentApi';
import { fetchMyTickets } from '../services/ticketApi';
import { validatePromoCode } from '../services/promoCodeApi';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const { user } = useAuth();

  const [reservations, setReservations] = useState([]);
  const [serverTotals, setServerTotals] = useState({
    subtotalMinor: 0,
    serviceFeeMinor: 0,
    totalMinor: 0,
    paymentSubtotalUsdMinor: 0,
    paymentServiceFeeUsdMinor: 0,
    paymentTotalUsdMinor: 0,
    paymentCurrency: 'USD'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(600);
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [isPromoValidating, setIsPromoValidating] = useState(false);
  const [promoError, setPromoError] = useState(null);

  const [purchasedTickets, setPurchasedTickets] = useState(() => {
    try {
      const saved = localStorage.getItem('eventpass_tickets');
      if (saved) return JSON.parse(saved);
    } catch {}

    // Seed default educational demonstration ticket so "My Tickets" has content out of the box
    return [
      {
        orderId: 'EP-948201',
        reference: 'WT-829104',
        purchaseDate: '2026-10-01T14:22:00',
        eventTitle: '+LIVE+ The Ultimate South African Arena Tour',
        eventDate: 'From 24 Oct 2026 19:30',
        venue: 'GrandWest Grand Arena, Goodwood, Cape Town',
        tierName: 'Golden Circle (Standing)',
        quantity: 2,
        pricePerTicket: 795,
        totalPaid: 1605,
        status: 'Confirmed',
        paymentMethod: 'Instant EFT (Ozow)',
        pickupStore: 'Pick n Pay Canal Walk'
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('eventpass_tickets', JSON.stringify(purchasedTickets));
    } catch {}
  }, [purchasedTickets]);

  const [activePendingOrder, setActivePendingOrder] = useState(null);

  // Authoritative server fetch for active reservations and pending unexpired orders
  const refreshCart = useCallback(async () => {
    if (!user) {
      setReservations([]);
      setActivePendingOrder(null);
      setServerTotals({ subtotalMinor: 0, serviceFeeMinor: 0, totalMinor: 0 });
      return;
    }

    try {
      setLoading(true);
      const data = await fetchUserReservations();
      const activeItems = data?.items || [];

      if (activeItems.length > 0) {
        setReservations(activeItems);
        setActivePendingOrder(null);
        setServerTotals({
          subtotalMinor: data?.subtotalMinor || 0,
          serviceFeeMinor: data?.serviceFeeMinor || 0,
          totalMinor: data?.totalMinor || 0,
          paymentSubtotalUsdMinor: data?.paymentSubtotalUsdMinor || 0,
          paymentServiceFeeUsdMinor: data?.paymentServiceFeeUsdMinor || 0,
          paymentTotalUsdMinor: data?.paymentTotalUsdMinor || 0,
          paymentCurrency: 'USD'
        });

        // Synchronize cosmetic timer with minimum seconds remaining across reservations
        const minSeconds = Math.min(...activeItems.map((r) => r.secondsRemaining || 600));
        setTimerSeconds(Math.max(0, minSeconds));
      } else {
        // No active reservations. Check if user has an unfulfilled PENDING order awaiting payment
        let pendingOrder = null;
        try {
          const orders = await fetchUserOrders();
          const now = Date.now();
          pendingOrder = (orders || []).find((o) => {
            if (!['PENDING', 'PAYMENT_PROCESSING'].includes(o.status)) return false;
            if (!o.expiresAt) return true;
            return new Date(o.expiresAt).getTime() > now;
          });
        } catch (orderErr) {
          console.warn('Failed to check user orders for pending cart recovery:', orderErr);
        }

        if (pendingOrder) {
          setReservations([]);
          setActivePendingOrder(pendingOrder);
          setServerTotals({
            subtotalMinor: pendingOrder.subtotalMinor || 0,
            serviceFeeMinor: pendingOrder.serviceFeeMinor || 0,
            totalMinor: pendingOrder.totalMinor || 0,
            paymentSubtotalUsdMinor: pendingOrder.paymentSubtotalUsdMinor || 0,
            paymentServiceFeeUsdMinor: pendingOrder.paymentServiceFeeUsdMinor || 0,
            paymentTotalUsdMinor: pendingOrder.paymentTotalUsdMinor || 0,
            paymentCurrency: pendingOrder.paymentCurrency || 'USD'
          });
          const orderSeconds = pendingOrder.expiresAt
            ? Math.max(0, Math.floor((new Date(pendingOrder.expiresAt).getTime() - Date.now()) / 1000))
            : 600;
          setTimerSeconds(orderSeconds);
        } else {
          setReservations([]);
          setActivePendingOrder(null);
          setServerTotals({
            subtotalMinor: 0,
            serviceFeeMinor: 0,
            totalMinor: 0,
            paymentSubtotalUsdMinor: 0,
            paymentServiceFeeUsdMinor: 0,
            paymentTotalUsdMinor: 0,
            paymentCurrency: 'USD'
          });
          setTimerSeconds(600);
        }
      }
      setError(null);
    } catch (err) {
      // If unauthenticated or session expired, clear local list
      if (err.status === 401) {
        setReservations([]);
        setActivePendingOrder(null);
      } else {
        console.error('Failed to load server reservations:', err);
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial fetch and user changes
  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  // Informational countdown timer (Cosmetic UX)
  useEffect(() => {
    const hasItems = reservations.length > 0 || (activePendingOrder && ['PENDING', 'PAYMENT_PROCESSING'].includes(activePendingOrder.status));
    if (!hasItems || timerSeconds <= 0) return;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          // Re-verify with server when countdown reaches zero
          refreshCart();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [reservations.length, activePendingOrder, timerSeconds, refreshCart]);

  // Map server reservations or active pending order to UI cart items expected by components
  const cartItems = reservations.length > 0
    ? reservations.map((res) => ({
        id: res.id,
        reservationId: res.id,
        eventId: res.eventId,
        eventTitle: res.eventTitle,
        eventDate: res.eventDate ? new Date(res.eventDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
        eventVenue: res.eventVenue,
        eventImage: res.eventImage,
        tierId: res.ticketTypeId,
        tierName: res.tierName,
        quantity: res.quantity,
        price: res.unitPriceMinor / 100,
        priceMinor: res.unitPriceMinor,
        currency: res.currency,
        lineTotal: res.lineTotalMinor / 100,
        lineTotalMinor: res.lineTotalMinor,
        priceUsd: (res.unitPriceUsdMinor || 0) / 100,
        priceUsdMinor: res.unitPriceUsdMinor || 0,
        lineTotalUsd: (res.lineTotalUsdMinor || 0) / 100,
        lineTotalUsdMinor: res.lineTotalUsdMinor || 0,
        paymentCurrency: 'USD',
        expiresAt: res.expiresAt,
        secondsRemaining: res.secondsRemaining
      }))
    : (activePendingOrder?.items || []).map((item) => {
        const expiresAtMs = activePendingOrder.expiresAt ? new Date(activePendingOrder.expiresAt).getTime() : Date.now() + 600000;
        const secondsRemaining = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
        return {
          id: item.id,
          reservationId: null,
          orderId: activePendingOrder.id,
          orderReference: activePendingOrder.orderReference,
          eventId: item.eventId,
          eventTitle: item.eventTitle,
          eventDate: item.eventDate ? new Date(item.eventDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
          eventVenue: item.eventVenue,
          eventImage: item.eventImage,
          tierId: item.ticketTypeId,
          tierName: item.tierName,
          quantity: item.quantity,
          price: item.unitPriceMinor / 100,
          priceMinor: item.unitPriceMinor,
          currency: activePendingOrder.currency || 'ZAR',
          lineTotal: item.totalMinor / 100,
          lineTotalMinor: item.totalMinor,
          priceUsd: (item.unitPriceUsdMinor || 0) / 100,
          priceUsdMinor: item.unitPriceUsdMinor || 0,
          lineTotalUsd: (item.totalUsdMinor || 0) / 100,
          lineTotalUsdMinor: item.totalUsdMinor || 0,
          paymentCurrency: 'USD',
          expiresAt: activePendingOrder.expiresAt,
          secondsRemaining
        };
      });

  /**
   * Authoritative server-side reservation creation
   */
  const addToCart = async (ticketItem) => {
    if (!user) {
      return { success: false, needAuth: true };
    }

    try {
      setLoading(true);
      await createReservation({
        ticketTypeId: ticketItem.tierId,
        quantity: ticketItem.quantity
      });
      setActivePendingOrder(null);
      await refreshCart();
      return { success: true };
    } catch (err) {
      console.error('Failed to add to cart:', err);
      return {
        success: false,
        message: err.message,
        code: err.code
      };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Authoritative server-side reservation cancellation
   */
  const removeFromCart = async (eventId, tierId) => {
    if (activePendingOrder) {
      setActivePendingOrder(null);
      await refreshCart();
      return;
    }

    const target = reservations.find(
      (r) => r.ticketTypeId === tierId || r.eventId === eventId || r.id === tierId
    );

    if (target) {
      try {
        setLoading(true);
        await cancelReservation(target.id);
        await refreshCart();
      } catch (err) {
        console.error('Failed to remove reservation:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  /**
   * Update quantity by adjusting reservations on the server
   */
  const updateQuantity = async (eventId, tierId, newQuantity) => {
    if (activePendingOrder) {
      // Pending orders are locked for payment; modifying quantity requires clearing or completing
      return;
    }

    const target = reservations.find(
      (r) => r.ticketTypeId === tierId || r.eventId === eventId || r.id === tierId
    );

    if (!target) return;

    if (newQuantity <= 0) {
      await removeFromCart(eventId, tierId);
      return;
    }

    const delta = newQuantity - target.quantity;
    if (delta > 0) {
      // Add additional tickets to reservation
      await addToCart({ tierId: target.ticketTypeId, quantity: delta });
    } else if (delta < 0) {
      // Release reservation and re-reserve desired count
      await cancelReservation(target.id);
      await createReservation({ ticketTypeId: target.ticketTypeId, quantity: newQuantity });
      await refreshCart();
    }
  };

  const clearCart = async () => {
    setActivePendingOrder(null);
    for (const res of reservations) {
      try {
        await cancelReservation(res.id);
      } catch {}
    }
    await refreshCart();
  };

  // Promotional Code Operations
  const applyPromoCode = async (code) => {
    if (!code || !code.trim()) {
      setPromoError('Please enter a promotional code.');
      return { success: false, message: 'Please enter a promotional code.' };
    }

    const items = reservations.map((r) => ({
      ticketTypeId: r.ticketTypeId,
      quantity: r.quantity
    }));

    if (items.length === 0) {
      setPromoError('Your cart is empty. Add tickets before applying a promo code.');
      return { success: false, message: 'Your cart is empty.' };
    }

    setIsPromoValidating(true);
    setPromoError(null);
    try {
      const data = await validatePromoCode({
        code: code.trim(),
        items,
        email: user?.email
      });
      setAppliedPromo(data);
      return { success: true, data };
    } catch (err) {
      setPromoError(err.message || 'Invalid promotional code.');
      setAppliedPromo(null);
      return { success: false, message: err.message || 'Invalid promotional code.' };
    } finally {
      setIsPromoValidating(false);
    }
  };

  const removePromoCode = () => {
    setAppliedPromo(null);
    setPromoError(null);
  };

  // Revalidate promo code when cart reservations change materially
  useEffect(() => {
    if (!appliedPromo) return;
    if (reservations.length === 0) {
      setAppliedPromo(null);
      return;
    }

    const items = reservations.map((r) => ({
      ticketTypeId: r.ticketTypeId,
      quantity: r.quantity
    }));

    const promoCodeString = appliedPromo.promoCode?.code || appliedPromo.code;
    if (!promoCodeString) return;

    validatePromoCode({ code: promoCodeString, items, email: user?.email })
      .then((data) => {
        setAppliedPromo(data);
      })
      .catch((err) => {
        console.warn('Promo code invalidated after cart modification:', err.message);
        setAppliedPromo(null);
        setPromoError(`Promo code removed: ${err.message}`);
      });
  }, [reservations, user?.email]);

  // Authoritative server totals
  const subtotal = (
    reservations.length > 0
      ? serverTotals.subtotalMinor
      : activePendingOrder?.subtotalMinor || serverTotals.subtotalMinor || 0
  ) / 100;

  const serviceFee = (
    reservations.length > 0
      ? serverTotals.serviceFeeMinor
      : activePendingOrder?.serviceFeeMinor || serverTotals.serviceFeeMinor || 0
  ) / 100;

  const discount = (
    appliedPromo
      ? appliedPromo.discountMinor
      : (activePendingOrder?.discountMinor || 0)
  ) / 100;

  const total = Math.max(
    0,
    (
      reservations.length > 0
        ? serverTotals.totalMinor - (appliedPromo?.discountMinor || 0)
        : activePendingOrder?.totalMinor || serverTotals.totalMinor || 0
    ) / 100
  );

  const paymentSubtotalUsd = (
    reservations.length > 0
      ? serverTotals.paymentSubtotalUsdMinor || 0
      : activePendingOrder?.paymentSubtotalUsdMinor || serverTotals.paymentSubtotalUsdMinor || 0
  ) / 100;

  const paymentServiceFeeUsd = (
    reservations.length > 0
      ? serverTotals.paymentServiceFeeUsdMinor || 0
      : activePendingOrder?.paymentServiceFeeUsdMinor || serverTotals.paymentServiceFeeUsdMinor || 0
  ) / 100;

  const paymentTotalUsd = (
    reservations.length > 0
      ? serverTotals.paymentTotalUsdMinor || 0
      : activePendingOrder?.paymentTotalUsdMinor || serverTotals.paymentTotalUsdMinor || 0
  ) / 100;

  /**
   * Authoritative server-side order creation and payment initialization
   * Strictly adheres to PCI-DSS: zero card details are ever handled by EventPass
   */
  const completeCheckout = async (buyerDetails = {}, paymentMethod = 'card') => {
    if (!user) {
      throw new Error('You must be logged in to complete checkout.');
    }

    // 0. Strict Fail-closed Payment Status Check
    const paymentStatus = await fetchPaymentStatus().catch(() => ({ paymentsEnabled: false }));
    if (!paymentStatus?.paymentsEnabled) {
      throw new Error('Online payments are temporarily unavailable.');
    }

    // 1. Strict sanitization: ensure ONLY legitimate buyer fields are passed
    const sanitizedBuyerDetails = {
      firstName: buyerDetails.firstName?.trim() || undefined,
      lastName: buyerDetails.lastName?.trim() || undefined,
      email: buyerDetails.email?.trim() || undefined,
      phone: buyerDetails.phone?.trim() || undefined,
      deliveryType: 'digital',
      paymentMethod: 'card'
    };

    Object.keys(sanitizedBuyerDetails).forEach((key) => {
      if (sanitizedBuyerDetails[key] === undefined) {
        delete sanitizedBuyerDetails[key];
      }
    });

    // 2. Authoritative order reuse or creation
    // Reuse existing valid pending order to prevent duplicate orders or RESERVATION_ALREADY_CONVERTED errors
    let order = activePendingOrder;
    const isPendingOrderValid =
      order &&
      ['PENDING', 'PAYMENT_PROCESSING'].includes(order.status) &&
      (!order.expiresAt || new Date(order.expiresAt).getTime() > Date.now());

    if (!isPendingOrderValid) {
      if (!reservations || reservations.length === 0) {
        throw new Error('No active items in cart to checkout.');
      }
      order = await createOrder({
        reservationIds: reservations.map((r) => r.id),
        buyerDetails: sanitizedBuyerDetails,
        promoCode: appliedPromo?.promoCode?.code || undefined
      });
      // Store immediately so cart items and totals remain active even if payment initialization fails
      setActivePendingOrder(order);
    }

    // 3. Initialize server payment session
    let paymentInit;
    try {
      paymentInit = await initializePayment({
        orderId: order.id,
        callbackUrl: `${window.location.origin}/my-orders`
      });
    } catch (paymentErr) {
      // Payment initialization failed (e.g., 422 CURRENCY_NOT_SUPPORTED_BY_MERCHANT, network failure, etc.)
      // Ensure pending order is maintained so cart stays fully recoverable
      setActivePendingOrder(order);
      throw paymentErr;
    }

    // 4. Redirect to provider hosted checkout URL (e.g. Paystack)
    if (paymentInit.authorizationUrl) {
      // CRITICAL: DO NOT call refreshCart() here!
      // Calling refreshCart() would clear reservations before the browser navigates,
      // causing CheckoutPage to redirect to /cart ("Your cart is empty").
      return {
        isRedirect: true,
        authorizationUrl: paymentInit.authorizationUrl,
        reference: paymentInit.reference,
        orderId: order.id,
        orderReference: order.orderReference
      };
    }

    throw new Error('Payment provider did not return a valid checkout session URL.');
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        reservations,
        activePendingOrder,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        refreshCart,
        subtotal,
        serviceFee,
        discount,
        total,
        appliedPromo,
        applyPromoCode,
        removePromoCode,
        isPromoValidating,
        promoError,
        paymentSubtotalUsd,
        paymentServiceFeeUsd,
        paymentTotalUsd,
        paymentCurrency: 'USD',
        serverTotals,
        timerSeconds,
        loading,
        error,
        purchasedTickets,
        completeCheckout
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
