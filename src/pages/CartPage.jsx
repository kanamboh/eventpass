import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  Clock, 
  ArrowRight, 
  ArrowLeft, 
  ShieldCheck, 
  Tag, 
  Check, 
  Store,
  AlertCircle,
  Lock
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { FALLBACK_EVENT_IMAGE, handleImageError } from '../utils/imageFallback';
import { fetchPaymentStatus } from '../services/paymentApi';

const CartPage = () => {
  const {
    cartItems,
    updateQuantity,
    removeFromCart,
    subtotal,
    serviceFee,
    discount,
    total,
    appliedPromo,
    applyPromoCode,
    removePromoCode,
    isPromoValidating,
    promoError,
    timerSeconds,
    activePendingOrder
  } = useCart();
  const navigate = useNavigate();

  const [promoInput, setPromoInput] = useState('');
  const [localError, setLocalError] = useState('');
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [isCheckingPayments, setIsCheckingPayments] = useState(true);

  React.useEffect(() => {
    let isMounted = true;
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
  }, []);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleApplyPromo = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (!promoInput.trim()) {
      setLocalError('Please enter a promotional code.');
      return;
    }
    const res = await applyPromoCode(promoInput.trim());
    if (res.success) {
      setPromoInput('');
      setLocalError('');
    } else {
      setLocalError(res.message);
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="py-16 bg-[#f8fafc] min-h-[calc(100vh-250px)] flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4 text-center">
          <div className="w-20 h-20 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4 border border-gray-200">
            <ShoppingBag className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 font-sans mb-2">Your Cart is Empty</h2>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            You don't have any tickets reserved yet. Explore our featured concerts, festivals, and sporting matches to start booking.
          </p>
          <Link
            to="/events"
            className="btn-webticket-primary h-12 px-8 text-xs inline-flex shadow-lg shadow-[#7fbd52]/30"
          >
            <span>Explore Events</span>
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 bg-[#f8fafc] min-h-[calc(100vh-250px)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Reservation Hold Countdown Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-900 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block">Tickets Temporarily Reserved</span>
              <span className="text-[11px] text-amber-700">Please complete checkout before timer expires.</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-full border border-amber-200 font-mono font-black text-sm text-amber-800">
            <span>Hold Time:</span>
            <span className="text-base text-red-600">{formatTimer(timerSeconds)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 font-sans tracking-tight">
            Shopping Cart
          </h1>
          <Link
            to="/events"
            className="text-xs font-bold uppercase tracking-wider text-[#6aa340] hover:underline flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Continue Shopping</span>
          </Link>
        </div>

        {activePendingOrder && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-sm animate-fade-in">
            <div className="flex items-start gap-2.5">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="block font-bold text-amber-950 text-xs">
                  Active Checkout Hold ({activePendingOrder.orderReference})
                </strong>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  These tickets are reserved for you in an active order. Click <strong>Proceed to Checkout</strong> to authorize payment before the reservation window expires.
                </p>
              </div>
            </div>
            <Link
              to="/checkout"
              className="btn-webticket-primary h-8 px-4 text-xs font-bold whitespace-nowrap self-end sm:self-center"
            >
              <span>Resume Checkout</span>
            </Link>
          </div>
        )}

        {/* Payment Freeze Notice Banner */}
        {!paymentsEnabled && !isCheckingPayments && (
          <div
            id="cart-payments-frozen-banner"
            className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 shadow-sm animate-fade-in"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="text-xs font-bold block text-amber-950">
                  Online Payments Temporarily Unavailable
                </strong>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Online payments and checkout processing are currently paused for scheduled system maintenance. Your reserved tickets remain held in your session, but checkout submission is temporarily disabled.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Cart Items List (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {cartItems.map((item) => (
              <div
                key={`${item.eventId}-${item.tierId}`}
                className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                {/* Event Image & Info */}
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <img
                    src={item.eventImage || FALLBACK_EVENT_IMAGE}
                    alt={item.eventTitle}
                    className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                    onError={handleImageError}
                  />
                  <div className="min-w-0">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6aa340]">
                      {item.eventDate}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {item.eventTitle}
                    </h3>
                    <p className="text-[11px] text-slate-500 truncate mb-1">
                      {item.eventVenue}
                    </p>
                    <span className="inline-block bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded">
                      {item.tierName}
                    </span>
                  </div>
                </div>

                {/* Quantity & Price Controls */}
                <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-0 border-gray-100">
                  {/* Quantity Counter */}
                  <div className="flex items-center gap-2 border border-gray-200 rounded-full px-2 py-1 bg-slate-50">
                    <button
                      onClick={() => updateQuantity(item.eventId, item.tierId, item.quantity - 1)}
                      disabled={!!activePendingOrder}
                      className="w-6 h-6 rounded-full hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-3 h-3 text-slate-600" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-slate-800">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.eventId, item.tierId, item.quantity + 1)}
                      disabled={!!activePendingOrder}
                      className="w-6 h-6 rounded-full hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-3 h-3 text-slate-600" />
                    </button>
                  </div>

                  {/* Price */}
                  <div className="text-right min-w-[70px]">
                    <span className="text-sm font-black text-slate-900 font-sans block">
                      R{(item.price * item.quantity).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      R{item.price} each
                    </span>
                  </div>

                  {/* Delete Item */}
                  <button
                    onClick={() => removeFromCart(item.eventId, item.tierId)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Online Payment Security Notice */}
            <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center gap-3 text-xs">
              <ShieldCheck className="w-5 h-5 text-[#7fbd52] flex-shrink-0" />
              <p>
                EventPass supports <strong>secure online payment only</strong>. Official digital entrance tickets and verified barcodes are dispatched directly to your email.
              </p>
            </div>
          </div>

          {/* Right Summary Card (4 cols) */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-md space-y-6">
              
              <h2 className="text-sm font-black font-sans uppercase tracking-wider text-slate-900 pb-3 border-b border-gray-100">
                Order Summary
              </h2>

              <div className="space-y-3 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Tickets Subtotal</span>
                  <span className="font-bold text-slate-900">R{subtotal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between">
                  <span>Booking & Service Fee</span>
                  <span className="font-bold text-slate-900">R{serviceFee.toFixed(2)}</span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-[#598c34] font-bold">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      <span>Discount ({appliedPromo?.promoCode?.code || activePendingOrder?.promoCode || 'Promo'})</span>
                    </span>
                    <span>-R{discount.toFixed(2)}</span>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-3 flex justify-between text-base font-black text-slate-900">
                  <span>Grand Total</span>
                  <span className="text-[#6aa340] text-lg">R{total.toFixed(2)}</span>
                </div>
              </div>

              {/* Promo Code Input or Applied Badge */}
              {appliedPromo ? (
                <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl p-3.5 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#dcfce7] text-[#16a34a] flex items-center justify-center font-bold">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-slate-900 uppercase">
                            {appliedPromo.promoCode?.code}
                          </span>
                          <span className="bg-[#dcfce7] text-[#15803d] text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {appliedPromo.discountType === 'PERCENTAGE'
                              ? `${appliedPromo.discountValue}% OFF`
                              : `-R${(appliedPromo.discountValue / 100).toFixed(2)}`}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#166534] font-medium mt-0.5">
                          Saved R{(appliedPromo.discountMinor / 100).toFixed(2)} on eligible items
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removePromoCode}
                      className="text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline px-2 py-1 rounded"
                    >
                      Remove
                    </button>
                  </div>
                  {appliedPromo.restrictions?.partiallyEligible && (
                    <p className="text-[10px] text-amber-800 bg-amber-50 rounded-lg p-2 border border-amber-200">
                      Note: This code applies only to eligible items in your cart.
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={handleApplyPromo} className="pt-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Have a Promo / Voucher Code?
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={promoInput}
                      onChange={(e) => {
                        setPromoInput(e.target.value);
                        setLocalError('');
                      }}
                      placeholder="e.g. SAVE10"
                      disabled={isPromoValidating}
                      className="flex-1 h-10 px-3 rounded-xl bg-slate-50 border border-gray-200 text-xs uppercase font-bold focus:outline-none focus:border-[#7fbd52] disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={isPromoValidating || !promoInput.trim()}
                      className="btn-webticket-outline h-10 px-4 text-xs font-bold disabled:opacity-40"
                    >
                      {isPromoValidating ? 'Checking...' : 'Apply'}
                    </button>
                  </div>
                  {(localError || promoError) && (
                    <p className="text-[11px] text-red-600 font-medium mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{localError || promoError}</span>
                    </p>
                  )}
                </form>
              )}

              {/* Proceed to Checkout CTA */}
              {!paymentsEnabled ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={true}
                    id="cart-disabled-checkout-btn"
                    className="w-full h-12 text-xs font-bold gap-2 rounded-full bg-slate-200 text-slate-500 cursor-not-allowed flex items-center justify-center border border-slate-300 shadow-none uppercase tracking-wider"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Payments Temporarily Disabled</span>
                  </button>
                  <p className="text-[10px] text-center text-amber-800 font-medium">
                    Checkout submission is disabled while payment processing is frozen.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/checkout')}
                  id="cart-proceed-checkout-btn"
                  className="w-full btn-webticket-primary h-12 text-xs font-bold gap-2 shadow-lg shadow-[#7fbd52]/30"
                >
                  <span>Proceed to Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#7fbd52]" />
                <span>SSL Encrypted & Guaranteed Authentic</span>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default CartPage;
