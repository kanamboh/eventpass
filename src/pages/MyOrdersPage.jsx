import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ShoppingBag, 
  Calendar, 
  CreditCard, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink, 
  Ticket, 
  RefreshCw, 
  ChevronRight,
  ShieldCheck,
  Package
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchUserOrders } from '../services/orderApi';

const getStatusBadge = (status) => {
  switch (status) {
    case 'PAID':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle className="w-3 h-3 text-emerald-600" />
          Paid & Confirmed
        </span>
      );
    case 'PENDING':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" />
          Payment Pending
        </span>
      );
    case 'EXPIRED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
          Expired
        </span>
      );
    case 'CANCELLED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
          Cancelled
        </span>
      );
    case 'PAYMENT_SUCCESS_INVENTORY_RECONCILIATION_REQUIRED':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-orange-50 text-orange-700 border border-orange-200">
          <AlertCircle className="w-3 h-3 text-orange-600" />
          Reconciliation Required
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
          {status}
        </span>
      );
  }
};

const MyOrdersPage = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadOrders = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchUserOrders();
      setOrders(data);
    } catch (err) {
      console.error('Failed to load user orders:', err);
      setError(err.message || 'Unable to retrieve your order history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [user]);

  return (
    <div className="py-8 bg-[#f8fafc] min-h-[calc(100vh-250px)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#6aa340] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#7fbd52]" />
              Account Purchase History
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 font-sans tracking-tight">
              My Orders & Receipts
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadOrders}
              disabled={loading}
              className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-slate-600 transition-colors shadow-sm disabled:opacity-50"
              title="Refresh Orders"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <Link
              to="/my-tickets"
              className="btn-webticket-outline h-10 px-4 text-xs inline-flex items-center gap-2"
            >
              <Ticket className="w-4 h-4 text-[#7fbd52]" />
              <span>Go to My Tickets</span>
            </Link>

            <Link
              to="/events"
              className="btn-webticket-primary h-10 px-5 text-xs inline-flex items-center"
            >
              <span>Explore Events</span>
            </Link>
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-white p-6 rounded-3xl border border-gray-200 animate-pulse space-y-4">
                <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                <div className="h-6 bg-slate-200 rounded w-1/2"></div>
                <div className="h-4 bg-slate-100 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-white p-8 rounded-3xl border border-red-200 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
            <h3 className="text-lg font-bold text-slate-900">Unable to load orders</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{error}</p>
            <button
              onClick={loadOrders}
              className="btn-webticket-primary h-10 px-6 text-xs inline-flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-gray-200 text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-slate-900">No orders placed yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              When you purchase event passes or tickets, your order receipts and invoices will appear right here.
            </p>
            <Link
              to="/events"
              className="btn-webticket-primary h-11 px-6 text-xs inline-flex items-center gap-2 shadow-lg shadow-[#7fbd52]/30"
            >
              <span>Discover Upcoming Events</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const primaryItem = order.items?.[0];
              const eventTitle = primaryItem?.eventTitle || 'Event Booking';
              const eventDate = primaryItem?.eventDate
                ? new Date(primaryItem.eventDate).toLocaleDateString('en-ZA', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })
                : 'Date TBA';

              return (
                <div
                  key={order.id}
                  className="bg-white p-6 sm:p-7 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-[#1a2b49] text-white flex items-center justify-center font-mono font-bold text-xs flex-shrink-0">
                        EP
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-sm text-slate-900">
                            {order.orderReference}
                          </span>
                          {getStatusBadge(order.status)}
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Ordered on {new Date(order.createdAt).toLocaleDateString('en-ZA', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 self-start md:self-auto">
                      <div className="text-right">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                          Total Paid
                        </span>
                        <strong className="text-lg font-black text-slate-900">
                          {order.totalFormatted}
                        </strong>
                      </div>

                      {order.status === 'PAID' && (
                        <Link
                          to="/my-tickets"
                          className="btn-webticket-primary h-10 px-4 text-xs font-bold gap-1.5 inline-flex items-center shadow-sm"
                        >
                          <Ticket className="w-3.5 h-3.5" />
                          <span>View {order.ticketCount || 'Passes'}</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Order Items Summary */}
                  <div className="pt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-8 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-slate-900">
                          {eventTitle}
                        </span>
                        <span className="text-xs text-slate-400">•</span>
                        <span className="text-xs text-slate-600 font-medium flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {eventDate}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {order.items?.map((item) => (
                          <span
                            key={item.id}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-semibold px-2.5 py-1 rounded-xl"
                          >
                            {item.quantity}x {item.tierName} ({item.unitPriceFormatted})
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="md:col-span-4 flex items-center justify-end gap-2 text-xs text-slate-500">
                      <span>Buyer: <strong className="text-slate-800">{order.buyerName}</strong></span>
                      <span>({order.buyerEmail})</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
};

export default MyOrdersPage;
