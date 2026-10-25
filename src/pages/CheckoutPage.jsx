import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  CreditCard, 
  Smartphone, 
  CheckCircle, 
  Lock, 
  ArrowRight, 
  Ticket,
  AlertCircle,
  Mail,
  RefreshCw
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { fetchPaymentStatus } from '../services/paymentApi';

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local.slice(0, 2)}${'*'.repeat(Math.min(local.length - 2, 5))}@${domain}`;
};

const CheckoutPage = () => {
  const { cartItems, total, discount, appliedPromo, paymentTotalUsd, completeCheckout, activePendingOrder, loading } = useCart();
  const { user, isEmailVerified, resendVerification, getDevToken } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: user?.fullName ? user.fullName.split(' ')[0] : 'Thabo',
    lastName: user?.fullName ? user.fullName.split(' ').slice(1).join(' ') : 'Molefe',
    email: user?.email || 'thabo.molefe@example.co.za',
    phone: user?.phone || '082 555 4321',
    deliveryType: 'digital',
    paymentMethod: 'card'
  });

  const [orderComplete, setOrderComplete] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [checkoutErrorCode, setCheckoutErrorCode] = useState(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [isCheckingPayments, setIsCheckingPayments] = useState(true);

  // Email verification state
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [devToken, setDevToken] = useState(null);

  React.useEffect(() => {
    let isMounted = true;
    if (!isEmailVerified && user?.email) {
      getDevToken(user.email).then((tok) => {
        if (isMounted && tok) setDevToken(tok);
      });
    }
    fetchPaymentStatus()
      .then((data) => {
        if (isMounted) {
          setPaymentsEnabled(Boolean(data?.paymentsEnabled));
          setIsCheckingPayments(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPaymentsEnabled(false);
          setIsCheckingPayments(false);
        }
      });
    return () => { isMounted = false; };
  }, [isEmailVerified, user, getDevToken]);

  const handleResendVerification = async () => {
    setResending(true);
    setResendSuccess(false);
    try {
      const res = await resendVerification(user?.email);
      setResendSuccess(true);
      if (res._devVerificationToken) {
        setDevToken(res._devVerificationToken);
      }
    } catch (err) {
      setCheckoutError(err.message || 'Failed to resend verification email.');
    } finally {
      setResending(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!paymentsEnabled) {
      setCheckoutError('Online payments are temporarily unavailable. Ticket purchases cannot be submitted at this time.');
      return;
    }
    // TEMPORARILY PAUSED: Mandatory email verification is disabled to allow ongoing feature development
    // if (!isEmailVerified) {
    //   setCheckoutError('Email verification required: Please verify your email before purchasing tickets.');
    //   navigate('/verify-email?returnUrl=/checkout');
    //   return;
    // }
    setIsProcessing(true);
    setCheckoutError(null);
    setCheckoutErrorCode(null);

    try {
      const result = await completeCheckout(formData, formData.paymentMethod);
      if (result?.isRedirect && result?.authorizationUrl) {
        window.location.href = result.authorizationUrl;
        return;
      }
      setIsProcessing(false);
      setOrderComplete(Array.isArray(result) ? result[0] : (result || { reference: 'WT-849201' }));
    } catch (err) {
      setIsProcessing(false);
      setCheckoutError(err.message || 'Failed to process order.');
      setCheckoutErrorCode(err.code || null);
      if (err.code === 'RESERVATION_EXPIRED' || err.code === 'ORDER_EXPIRED') {
        setTimeout(() => navigate('/cart'), 2500);
      }
    }
  };

  React.useEffect(() => {
    // Only redirect to cart if cart is verified empty AND no active order pending AND not processing AND not completed AND no error
    if (!loading && cartItems.length === 0 && !activePendingOrder && !isProcessing && !orderComplete && !checkoutError) {
      navigate('/cart');
    }
  }, [loading, cartItems.length, activePendingOrder, isProcessing, orderComplete, checkoutError, navigate]);

  if (orderComplete) {
    const maskedEmail = maskEmail(formData.email || user?.email);
    const primaryTicket = (orderComplete.tickets && orderComplete.tickets[0]) || null;
    const ticketRef = primaryTicket?.ticketReference || primaryTicket?.reference || orderComplete.ticketReference || null;

    return (
      <div className="py-16 bg-[#f8fafc] min-h-[calc(100vh-250px)] flex items-center justify-center">
        <div className="max-w-lg w-full mx-auto px-4 text-center bg-white p-8 sm:p-10 rounded-3xl border border-gray-200 shadow-xl space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-[#598c34] flex items-center justify-center mx-auto mb-2 border border-emerald-200">
            <CheckCircle className="w-9 h-9" />
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#598c34] bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Payment Successful
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 font-sans mt-3">
              Your Ticket Has Been Sent to Your Email!
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed pt-1">
              Payment verified successfully. Please check your Gmail or registered email inbox (<strong>{maskedEmail}</strong>) for your official entrance pass and scannable QR code.
            </p>
          </div>

          <div className="bg-slate-50 border border-gray-200 p-4 rounded-2xl text-left text-xs space-y-2.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Order Reference:</span>
              <strong className="text-slate-900 font-mono">{orderComplete.reference || orderComplete.orderReference}</strong>
            </div>
            {ticketRef && (
              <div className="flex justify-between">
                <span className="text-slate-500">Ticket Reference:</span>
                <strong className="text-slate-900 font-mono">{ticketRef}</strong>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Event:</span>
              <strong className="text-slate-900">{orderComplete.eventTitle}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tickets Issued:</span>
              <strong className="text-[#598c34] font-bold">{orderComplete.quantity || 1} Official Pass(es)</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Primary Delivery:</span>
              <strong className="text-slate-900">Email Only (Official Turnstile Pass)</strong>
            </div>
            <div className="pt-2 border-t border-gray-200 text-[11px] text-slate-500 flex items-start gap-2 leading-relaxed">
              <Mail className="w-4 h-4 text-[#598c34] flex-shrink-0 mt-0.5" />
              <span>
                Your ticket and official entry QR code exist only in your confirmation email. Please check your Gmail inbox and spam/junk folder. Present the QR code from your email at the gate turnstiles.
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <Link
              to="/my-tickets"
              className="w-full btn-webticket-primary h-12 text-xs font-bold gap-2 shadow-lg shadow-[#7fbd52]/30 inline-flex items-center justify-center"
            >
              <Ticket className="w-4 h-4" />
              <span>View In My Tickets</span>
            </Link>

            <Link
              to="/my-orders"
              className="w-full btn-webticket-outline h-11 text-xs font-bold inline-flex items-center justify-center gap-2"
            >
              <span>View Order In My Orders</span>
            </Link>

            <Link
              to="/events"
              className="w-full text-slate-500 hover:text-slate-800 text-xs font-bold py-2 inline-flex items-center justify-center"
            >
              <span>Back To Events</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0 && !activePendingOrder && !orderComplete) {
    if (checkoutError) {
      return (
        <div className="py-16 bg-[#f8fafc] min-h-[calc(100vh-250px)] flex items-center justify-center">
          <div className="max-w-md w-full mx-auto px-4 text-center bg-white p-8 sm:p-10 rounded-3xl border border-gray-200 shadow-xl space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Payment Error</h2>
            <p className="text-xs text-red-700 bg-red-50 p-3 rounded-xl border border-red-200 leading-relaxed">
              {checkoutError}
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link to="/cart" className="btn-webticket-primary h-11 text-xs font-bold flex items-center justify-center gap-2">
                <span>Return to Cart</span>
              </Link>
              <Link to="/events" className="btn-webticket-outline h-11 text-xs font-bold flex items-center justify-center gap-2">
                <span>Browse Events</span>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="py-16 min-h-[calc(100vh-250px)] flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <RefreshCw className="w-4 h-4 animate-spin text-[#7fbd52]" />
          <span>Verifying cart session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 bg-[#f8fafc] min-h-[calc(100vh-250px)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 font-sans tracking-tight mb-8">
          Secure Checkout
        </h1>

        {!paymentsEnabled && !isCheckingPayments && (
          <div
            id="checkout-payments-frozen-banner"
            className="mb-8 p-5 bg-amber-50 border-2 border-amber-300 rounded-3xl space-y-2 text-amber-950 shadow-sm animate-fade-in"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="block font-bold text-sm text-amber-950">
                  Online Payments Temporarily Unavailable
                </strong>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Online payment processing is currently paused for system maintenance. Your reserved tickets remain safe in your cart session, but new payment transactions cannot be authorized or submitted at this time.
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Form: Details & Payment Methods (8 cols) */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* 1. Customer Information */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <span className="w-6 h-6 rounded-full bg-[#7fbd52] text-white flex items-center justify-center font-bold text-xs">
                  1
                </span>
                <h2 className="text-sm font-black font-sans uppercase tracking-wider text-slate-900">
                  Buyer Information
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    required
                    className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    required
                    className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Email Address (For E-Ticket delivery)
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Mobile Phone (For SMS Barcode)
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52]"
                  />
                </div>
              </div>
            </div>

            {/* 2. Delivery Preference */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <span className="w-6 h-6 rounded-full bg-[#7fbd52] text-white flex items-center justify-center font-bold text-xs">
                  2
                </span>
                <h2 className="text-sm font-black font-sans uppercase tracking-wider text-slate-900">
                  Ticket Delivery
                </h2>
              </div>

              <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 flex items-start gap-3">
                <Mail className="w-5 h-5 text-[#598c34] flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="text-xs font-bold text-slate-900 block">
                    Digital Email Delivery (Primary Delivery)
                  </strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Official tickets and scannable QR credentials will be automatically sent to <strong>{formData.email || user?.email}</strong> immediately upon verified payment.
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Online Payment */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <span className="w-6 h-6 rounded-full bg-[#7fbd52] text-white flex items-center justify-center font-bold text-xs">
                  3
                </span>
                <h2 className="text-sm font-black font-sans uppercase tracking-wider text-slate-900">
                  Online Payment
                </h2>
              </div>

              <div className="p-5 bg-gradient-to-br from-slate-50 to-slate-100/70 rounded-2xl border border-slate-200/80 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#7fbd52]/15 text-[#598c34] flex items-center justify-center border border-[#7fbd52]/30">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <strong className="text-xs font-bold text-slate-900 block">
                        Paystack Hosted Secure Checkout
                      </strong>
                      <span className="text-[10px] text-slate-500 font-medium">
                        PCI-DSS Level 1 Certified Online Gateway
                      </span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#598c34] bg-[#7fbd52]/10 px-2 py-0.5 rounded-full border border-[#7fbd52]/20">
                    <ShieldCheck className="w-3 h-3" />
                    Online Only
                  </span>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 text-xs text-slate-600 leading-relaxed space-y-2">
                  <p className="text-[11px] text-slate-600">
                    When you click <strong>Authorize &amp; Pay</strong>, you will complete payment via Paystack's official secure hosted payment page.
                  </p>
                  {paymentTotalUsd > 0 && (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
                      <div className="flex justify-between items-center font-bold text-xs text-emerald-950">
                        <span>Paystack Transaction Amount:</span>
                        <span className="text-[#598c34] font-mono font-black text-sm">${paymentTotalUsd.toFixed(2)} USD</span>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-tight">
                        Your payment will be processed by Paystack in USD. Your card issuer may apply its own currency conversion or foreign transaction fees.
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100 text-[10px] text-slate-500 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#598c34] flex-shrink-0" />
                    <span>
                      EventPass never receives, processes, or stores your card number, CVV, or expiry date.
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-600">Accepted Payment Types:</span>
                  <div className="flex items-center gap-1.5 font-bold text-[10px] text-slate-700">
                    <span className="px-2 py-0.5 bg-white rounded border border-slate-200 shadow-2xs font-mono">VISA</span>
                    <span className="px-2 py-0.5 bg-white rounded border border-slate-200 shadow-2xs font-mono">Mastercard</span>
                    <span className="px-2 py-0.5 bg-white rounded border border-slate-200 shadow-2xs font-mono">EFT</span>
                    <span className="px-2 py-0.5 bg-white rounded border border-slate-200 shadow-2xs font-mono">Apple Pay</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right Summary Sidebar (4 cols) */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-md sticky top-28 space-y-6">
              <h2 className="text-sm font-black font-sans uppercase tracking-wider text-slate-900 pb-3 border-b border-gray-100">
                Payment Summary
              </h2>

              <div className="space-y-3 text-xs">
                {cartItems.map((item) => (
                  <div key={`${item.eventId}-${item.tierId}`} className="flex justify-between text-slate-700">
                    <span className="truncate pr-2">
                      {item.quantity}x {item.eventTitle} ({item.tierName})
                    </span>
                    <strong className="flex-shrink-0 text-slate-900">
                      R{(item.price * item.quantity).toFixed(2)}
                    </strong>
                  </div>
                ))}

                <div className="flex justify-between text-slate-500 pt-2 border-t border-gray-100">
                  <span>Booking & Service Fee</span>
                  <span>R15.00</span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-[#598c34] font-bold">
                    <span>Discount ({appliedPromo?.promoCode?.code || activePendingOrder?.promoCode || 'Promo'})</span>
                    <span>-R{discount.toFixed(2)}</span>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-3 flex justify-between text-base font-black text-slate-900">
                  <span>Catalogue Total:</span>
                  <span className="text-slate-900 text-lg">R{total.toFixed(2)}</span>
                </div>

                {paymentTotalUsd > 0 && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1.5 mt-2">
                    <div className="flex justify-between items-center text-xs font-black text-emerald-950">
                      <span>Payment Amount:</span>
                      <span className="text-[#598c34] text-xl font-mono">${paymentTotalUsd.toFixed(2)} USD</span>
                    </div>
                    <p className="text-[10px] text-slate-600 leading-tight">
                      Your payment will be processed by Paystack in USD. Your card issuer may apply its own currency conversion or foreign transaction fees.
                    </p>
                  </div>
                )}
              </div>

              {/* Email Verification Requirement Notice (Temporarily Paused) */}

              {/* Checkout Error Notice */}
              {checkoutError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-3 text-xs text-red-900 animate-fade-in shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <strong className="block font-bold text-red-950 text-xs">
                        Payment Authorization Failed
                      </strong>
                      <p className="text-[11px] text-red-800 leading-relaxed">
                        {checkoutError}
                      </p>
                    </div>
                  </div>

                  {checkoutErrorCode === 'CURRENCY_NOT_SUPPORTED_BY_MERCHANT' && (
                    <div className="p-3 bg-amber-50/90 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 space-y-1">
                      <strong className="block font-bold text-amber-950">Paystack Dashboard Setup:</strong>
                      <p className="text-amber-800 leading-tight">
                        Standard Kenyan Paystack test accounts default to KES settlement. To allow USD checkout in test mode, enable <strong>"Accept International Payments"</strong> under <strong>Settings &gt; Preferences</strong> in your Paystack Dashboard.
                      </p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-red-200 text-[11px] text-red-700 flex items-center justify-between">
                    <span>Your tickets remain safely held in your order.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCheckoutError(null);
                        setCheckoutErrorCode(null);
                      }}
                      className="font-bold underline text-red-900 hover:text-red-700"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* Complete Order Button */}
              {!paymentsEnabled ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={true}
                    id="checkout-disabled-submit-btn"
                    className="w-full h-12 text-xs font-bold gap-2 rounded-full bg-slate-200 text-slate-500 cursor-not-allowed flex items-center justify-center border border-slate-300 shadow-none uppercase tracking-wider"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Online Payments Temporarily Disabled</span>
                  </button>
                  <p className="text-[10px] text-center text-amber-800 font-medium">
                    Payment processing is currently frozen. Checkout submission is disabled.
                  </p>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={isProcessing}
                  id="checkout-pay-btn"
                  className="w-full btn-webticket-primary h-12 text-xs font-bold gap-2 shadow-lg shadow-[#7fbd52]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <span>Processing Payment...</span>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Authorize & Pay {paymentTotalUsd > 0 ? `$${paymentTotalUsd.toFixed(2)} USD` : `R${total.toFixed(2)}`}</span>
                    </>
                  )}
                </button>
              )}

              <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#7fbd52]" />
                <span>Encrypted 256-Bit SSL Payment Gateway</span>
              </div>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};

export default CheckoutPage;
