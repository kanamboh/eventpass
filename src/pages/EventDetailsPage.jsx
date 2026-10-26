import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  ShieldCheck, 
  Share2, 
  Heart, 
  Check, 
  ShoppingBag, 
  Info, 
  UserCheck, 
  ArrowLeft,
  Store,
  ChevronRight,
  Plus,
  Minus,
  AlertCircle
} from 'lucide-react';
import { fetchEventByIdOrSlug } from '../services/eventApi';
import { useCart } from '../context/CartContext';
import { useLikes } from '../context/LikesContext';
import { FALLBACK_EVENT_IMAGE, handleImageError, isEventImageValid } from '../utils/imageFallback';

const EventDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { isLiked, toggleLike } = useLikes();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    fetchEventByIdOrSlug(id)
      .then((data) => {
        if (isCancelled) return;
        if (!data || !isEventImageValid(data.imageUrl || data.bannerUrl || data.image)) {
          setError('This event is currently unavailable for viewing or booking.');
          setLoading(false);
          return;
        }
        setEvent(data);
        // Initialize quantities for available tiers
        const initialQuantities = {};
        const tiers = data.ticketTypes || [];
        tiers.forEach((tier, index) => {
          // If first tier is available, default to 1 ticket; otherwise 0
          const isAvail = tier.isAvailable && tier.quantityAvailable > 0;
          initialQuantities[tier.id] = (index === 0 && isAvail) ? 1 : 0;
        });
        setQuantities(initialQuantities);
        setLoading(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('Failed to load event details:', err);
        setError(err.message || 'The requested event could not be found.');
        setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="bg-[#f8fafc] py-6 sm:py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb Skeleton */}
          <div className="h-4 w-48 bg-slate-200 rounded animate-pulse mb-6"></div>

          {/* Top Header Card Skeleton */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden mb-8 animate-pulse">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-5 aspect-[16/11] lg:aspect-auto bg-slate-200 min-h-[300px]"></div>
              <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between space-y-6">
                <div>
                  <div className="flex gap-2 mb-4">
                    <div className="h-5 w-24 bg-slate-200 rounded-full"></div>
                    <div className="h-5 w-24 bg-slate-200 rounded-full"></div>
                  </div>
                  <div className="h-8 w-3/4 bg-slate-200 rounded mb-3"></div>
                  <div className="h-4 w-1/2 bg-slate-200 rounded mb-6"></div>
                  <div className="grid grid-cols-2 gap-4 py-4 border-y border-gray-100">
                    <div className="h-10 bg-slate-100 rounded"></div>
                    <div className="h-10 bg-slate-100 rounded"></div>
                  </div>
                </div>
                <div className="h-8 bg-slate-100 rounded"></div>
              </div>
            </div>
          </div>

          {/* Bottom Layout Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-8 animate-pulse">
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 h-48"></div>
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 h-40"></div>
            </div>
            <div className="lg:col-span-5 animate-pulse">
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 h-96"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="bg-[#f8fafc] py-16 sm:py-24 min-h-[calc(100vh-140px)] flex items-center">
        <div className="max-w-xl mx-auto px-4 w-full">
          <div className="text-center bg-white p-8 sm:p-12 rounded-3xl border border-gray-200 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 mx-auto flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">Event Not Found</h1>
            <p className="text-xs sm:text-sm text-slate-500 mb-6 leading-relaxed">
              {error || 'The event you are looking for does not exist, has been cancelled, or is not currently published.'}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/events"
                className="btn-webticket-primary h-11 px-6 text-xs inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Browse All Events</span>
              </Link>
              <button
                onClick={() => window.location.reload()}
                className="btn-webticket-outline h-11 px-6 text-xs inline-flex items-center gap-2"
              >
                <span>Retry</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const liked = isLiked(event.id);
  const tiers = event.ticketTypes || [];

  const handleQuantityChange = (tierId, delta) => {
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier || !tier.isAvailable || tier.quantityAvailable <= 0) return;

    const maxAllowed = Math.min(tier.maxPerOrder || 10, tier.quantityAvailable);

    setQuantities((prev) => {
      const current = prev[tierId] || 0;
      const next = Math.max(0, Math.min(maxAllowed, current + delta));
      return { ...prev, [tierId]: next };
    });
  };

  const selectedTiers = tiers.filter((tier) => (quantities[tier.id] || 0) > 0);
  const totalSelectedTickets = selectedTiers.reduce((acc, tier) => acc + quantities[tier.id], 0);
  const totalAmountMinor = selectedTiers.reduce(
    (acc, tier) => acc + tier.priceMinor * quantities[tier.id],
    0
  );
  const totalAmount = totalAmountMinor / 100;

  const handleAddToCart = async (directCheckout = false) => {
    if (totalSelectedTickets === 0) {
      setToastMessage({ type: 'warning', text: 'Please select at least 1 ticket to proceed.' });
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    try {
      for (const tier of selectedTiers) {
        const result = await addToCart({
          eventId: event.id,
          eventTitle: event.title,
          eventDate: event.dateDisplay,
          eventVenue: event.venue,
          eventImage: event.imageUrl || event.bannerUrl || event.image || '',
          tierId: tier.id,
          tierName: tier.name,
          price: tier.priceMinor / 100,
          priceMinor: tier.priceMinor,
          currency: tier.currency || 'ZAR',
          quantity: quantities[tier.id]
        });

        if (result?.needAuth) {
          navigate('/login', { state: { returnTo: `/events/${event.slug || event.id}` } });
          return;
        }

        if (result?.success === false) {
          setToastMessage({
            type: 'warning',
            text: result.message || 'Unable to reserve tickets due to inventory limits.'
          });
          setTimeout(() => setToastMessage(null), 4000);
          return;
        }
      }

      if (directCheckout) {
        navigate('/cart');
      } else {
        setToastMessage({
          type: 'success',
          text: `Reserved ${totalSelectedTickets} ticket(s) in your cart!`
        });
        setTimeout(() => setToastMessage(null), 3500);
      }
    } catch (err) {
      setToastMessage({
        type: 'warning',
        text: err.message || 'Error creating reservation.'
      });
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  return (
    <div className="bg-[#f8fafc] py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-6">
          <Link to="/" className="hover:text-slate-700 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            Home
          </Link>
          <span>/</span>
          <Link to="/events" className="hover:text-slate-700">Events</Link>
          <span>/</span>
          <span className="text-[#6aa340] truncate max-w-xs">{event.title}</span>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className={`mb-6 p-4 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-bold shadow-lg animate-fade-in ${
            toastMessage.type === 'success' 
              ? 'bg-[#7fbd52] text-white' 
              : 'bg-amber-500 text-white'
          }`}>
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5" />
              <span>{toastMessage.text}</span>
            </div>
            <Link to="/cart" className="underline hover:opacity-90 ml-4">
              View Cart →
            </Link>
          </div>
        )}

        {/* Top Header Card */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            
            {/* Left Cover Image */}
            <div className="lg:col-span-5 relative aspect-[16/11] lg:aspect-auto bg-slate-900">
              <img
                src={event.imageUrl || event.bannerUrl || event.image}
                alt={event.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  handleImageError(e, event.id);
                  setError('The event poster could not be loaded. This event is temporarily unavailable.');
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent lg:hidden"></div>

              {/* Heart Button */}
              <button
                type="button"
                onClick={() => toggleLike(event.id)}
                className={`absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg ${
                  liked 
                    ? 'bg-red-500 text-white' 
                    : 'bg-white/80 text-slate-700 hover:bg-white hover:text-red-500'
                }`}
                aria-label={liked ? "Remove from likes" : "Add to likes"}
              >
                <Heart className={`w-5 h-5 ${liked ? 'fill-white' : ''}`} />
              </button>
            </div>

            {/* Right Event Meta Information */}
            <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {event.isFeatured && (
                    <span className="bg-[#7fbd52] text-white text-[11px] font-extrabold uppercase px-3 py-0.5 rounded-full tracking-wider shadow-sm">
                      Featured
                    </span>
                  )}
                  <span className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase px-3 py-0.5 rounded-full tracking-wider">
                    {event.categoryName || event.category}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold ml-auto flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4 text-[#7fbd52]" />
                    Verified Event
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 font-sans tracking-tight mb-3">
                  {event.title}
                </h1>

                {event.subtitle && (
                  <p className="text-xs sm:text-sm text-slate-600 mb-6 font-medium leading-relaxed">
                    {event.subtitle}
                  </p>
                )}

                {/* Key Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-y border-gray-100 text-xs text-slate-700">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#7fbd52]/10 text-[#6aa340] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-400">Date & Time</span>
                      <strong className="text-slate-900 font-bold">{event.dateDisplay}</strong>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#7fbd52]/10 text-[#6aa340] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-400">Venue</span>
                      <strong className="text-slate-900 font-bold">{event.venue}</strong>
                      <span className="block text-slate-500">{event.city || event.location}, South Africa</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Retail collection reminder */}
              <div className="mt-6 pt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-[#c8102e]" />
                  <span>Tickets available online or in-store at <strong className="text-slate-900">Pick n Pay</strong></span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Starting From</span>
                  <span className="text-2xl font-black text-slate-900 font-sans">{event.priceDisplay}</span>
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* Two Column Layout: Left Content & Right Sticky Ticket Selector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Description, Lineup, Venue Details (7 cols) */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* Event Description */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-4">
              <h2 className="text-lg font-black uppercase tracking-wider text-slate-900 pb-3 border-b border-gray-100">
                Event Information
              </h2>
              <div className="text-xs sm:text-sm text-slate-600 leading-relaxed space-y-4 whitespace-pre-line font-sans">
                {event.description}
              </div>
            </div>

            {/* Terms, Entry Rules & Age Restriction */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-4">
              <h2 className="text-lg font-black uppercase tracking-wider text-slate-900 pb-3 border-b border-gray-100 flex items-center gap-2">
                <Info className="w-5 h-5 text-[#7fbd52]" />
                <span>Important Attendance Rules</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-gray-200">
                  <span className="block font-bold text-slate-800 mb-1">Age Restriction</span>
                  <p>{event.ageRestriction || 'All Ages (Children under 14 accompanied by an adult)'}</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-gray-200">
                  <span className="block font-bold text-slate-800 mb-1">Security & Ingress</span>
                  <p>Right of admission reserved. Strictly no weapons, outside alcohol or unsealed glass bottles.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-gray-200">
                  <span className="block font-bold text-slate-800 mb-1">Digital Barcodes</span>
                  <p>Official scannable QR tickets are delivered directly to your email upon purchase. One scan per ticket.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-gray-200">
                  <span className="block font-bold text-slate-800 mb-1">Refund Policy</span>
                  <p>Tickets are refundable under Consumer Protection Act provisions in event of cancellation.</p>
                </div>
              </div>
            </div>

            {/* Organizer Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 text-white flex items-center justify-center font-black text-lg">
                  {(event.organizer?.name || event.title || 'E').charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold text-slate-900">{event.organizer?.name || 'Official Event Promoter'}</h3>
                    {(event.organizer?.verified ?? true) && (
                      <ShieldCheck className="w-4 h-4 text-[#7fbd52]" title="Official Promoter" />
                    )}
                  </div>
                  <span className="text-xs text-slate-400">Verified Event Organizer</span>
                </div>
              </div>
              <button 
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  setToastMessage({ type: 'success', text: 'Event link copied to clipboard!' });
                  setTimeout(() => setToastMessage(null), 3000);
                }}
                className="btn-webticket-outline h-9 px-4 text-xs gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            </div>

          </div>

          {/* Right Column: Interactive Ticket Tier Selector (5 cols) */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#7fbd52]/30 shadow-xl sticky top-28 space-y-6">
              
              <div className="pb-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black font-sans uppercase tracking-tight text-slate-900">
                    Select Tickets
                  </h3>
                  <p className="text-xs text-slate-500">Pick your seating categories & quantity</p>
                </div>
                <span className="bg-[#7fbd52]/10 text-[#6aa340] text-xs font-bold px-2.5 py-1 rounded-full">
                  Authoritative Hold
                </span>
              </div>

              {/* Tiers List */}
              <div className="space-y-4">
                {tiers.length === 0 ? (
                  <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50 text-center text-xs text-slate-500">
                    Ticket sales are currently not open for this event.
                  </div>
                ) : (
                  tiers.map((tier) => {
                    const qty = quantities[tier.id] || 0;
                    const maxAllowed = Math.min(tier.maxPerOrder || 10, tier.quantityAvailable);
                    const isSoldOut = !tier.isAvailable || tier.quantityAvailable <= 0;

                    return (
                      <div
                        key={tier.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          isSoldOut
                            ? 'border-gray-200 bg-gray-50/70 opacity-75'
                            : qty > 0 
                              ? 'border-[#7fbd52] bg-[#7fbd52]/5 shadow-sm' 
                              : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{tier.name}</h4>
                            {tier.description && (
                              <p className="text-[11px] text-slate-500 mt-0.5">{tier.description}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-base font-black text-slate-900">
                              {tier.priceMinor === 0 ? 'Free' : tier.priceFormatted || tier.priceDisplay}
                            </span>
                          </div>
                        </div>

                        {/* Quantity Controls & Availability */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100/80">
                          {isSoldOut ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-0.5 rounded">
                              Sold Out
                            </span>
                          ) : tier.quantityAvailable < 50 ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                              Only {tier.quantityAvailable} Left!
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Available
                            </span>
                          )}

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(tier.id, -1)}
                              disabled={qty === 0 || isSoldOut}
                              aria-label={`Decrease ${tier.name}`}
                              className="w-8 h-8 rounded-full border border-gray-300 hover:border-[#7fbd52] hover:bg-[#7fbd52] hover:text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            <span className="w-6 text-center font-bold text-sm text-slate-900">
                              {qty}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleQuantityChange(tier.id, 1)}
                              disabled={isSoldOut || qty >= maxAllowed}
                              aria-label={`Increase ${tier.name}`}
                              className="w-8 h-8 rounded-full border border-gray-300 hover:border-[#7fbd52] hover:bg-[#7fbd52] hover:text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Order Summary in Box */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-gray-200 text-xs space-y-2">
                <div className="flex justify-between text-slate-600">
                  <span>Selected Tickets:</span>
                  <strong className="text-slate-900">{totalSelectedTickets}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Booking / Service Fee:</span>
                  <span>{totalSelectedTickets > 0 ? 'R15.00' : 'R0.00'}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-black text-slate-900">
                  <span>Total Amount:</span>
                  <span className="text-[#6aa340]">
                    R{totalSelectedTickets > 0 ? (totalAmount + 15).toFixed(2) : '0.00'}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleAddToCart(true)}
                  disabled={totalSelectedTickets === 0}
                  className="w-full btn-webticket-primary h-12 text-xs gap-2 shadow-lg shadow-[#7fbd52]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Book & Checkout Now</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddToCart(false)}
                  disabled={totalSelectedTickets === 0}
                  className="w-full btn-webticket-outline h-11 text-xs gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Add To Cart & Keep Browsing</span>
                </button>
              </div>

              {/* Security note */}
              <div className="pt-2 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#7fbd52]" />
                <span>100% Guaranteed Official Tickets</span>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default EventDetailsPage;
