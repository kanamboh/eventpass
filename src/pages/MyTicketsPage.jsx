import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Ticket, 
  Printer, 
  Calendar, 
  MapPin, 
  CheckCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Mail
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchMyTickets } from '../services/ticketApi';

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local.slice(0, 2)}${'*'.repeat(Math.min(local.length - 2, 5))}@${domain}`;
};

const MyTicketsPage = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming');

  const loadTickets = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchMyTickets();
      setTickets(data);
    } catch (err) {
      console.error('Failed to load tickets:', err);
      setError(err.message || 'Unable to load tickets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [user]);

  // Tab filtering
  const upcomingTickets = tickets.filter((t) => t.status === 'VALID');
  const usedOrPastTickets = tickets.filter((t) => t.status !== 'VALID');
  const displayedTickets = activeTab === 'upcoming' ? upcomingTickets : usedOrPastTickets;

  return (
    <div className="py-8 bg-[#f8fafc] min-h-[calc(100vh-250px)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#6aa340] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#7fbd52]" />
              Official EventPass Passes
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 font-sans tracking-tight">
              My Tickets & Bookings
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadTickets}
              disabled={loading}
              className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-slate-600 transition-colors shadow-sm disabled:opacity-50"
              title="Refresh Tickets"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <Link
              to="/events"
              className="btn-webticket-primary h-10 px-5 text-xs self-start inline-flex items-center"
            >
              <span>Book More Events</span>
            </Link>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all px-2 ${
              activeTab === 'upcoming'
                ? 'border-[#7fbd52] text-[#598c34]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Active Tickets ({upcomingTickets.length})
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all px-2 ${
              activeTab === 'past'
                ? 'border-[#7fbd52] text-[#598c34]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Used & Past ({usedOrPastTickets.length})
          </button>
        </div>

        {/* Primary Email Delivery Notification Banner */}
        {user && !loading && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 mb-8 flex items-start gap-3.5 shadow-xs">
            <Mail className="w-5 h-5 text-[#598c34] flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <strong className="text-slate-900 block font-bold text-sm">
                Primary Ticket Delivery: Emailed to {user.email ? maskEmail(user.email) : 'your registered inbox'}
              </strong>
              <p className="text-slate-600 leading-relaxed">
                Your official scannable entrance passes and turnstile QR credentials are sent directly to your registered email address upon payment confirmation. For security and anti-fraud protection, QR tickets are delivered exclusively via email. Please check your Gmail or inbox and present the email QR code on your phone at venue entrance turnstiles.
              </p>
            </div>
          </div>
        )}

        {/* State: Not Logged In */}
        {!user && !loading && (
          <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm max-w-md mx-auto my-8">
            <div className="w-14 h-14 rounded-full bg-[#7fbd52]/15 text-[#598c34] flex items-center justify-center mx-auto mb-4">
              <Ticket className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Sign In to View Your Tickets</h3>
            <p className="text-xs text-slate-500 mt-2 mb-6 leading-relaxed">
              Your official digital passes are tied to your EventPass account.
            </p>
            <Link to="/login" className="btn-webticket-primary text-xs w-full justify-center">
              Sign In to EventPass
            </Link>
          </div>
        )}

        {/* State: Loading */}
        {loading && (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-10 h-10 text-[#7fbd52] animate-spin mb-3" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Loading your official tickets...</p>
          </div>
        )}

        {/* State: Error */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-lg mx-auto mb-8">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-red-900">Failed to load tickets</h4>
            <p className="text-xs text-red-700 mt-1 mb-4">{error}</p>
            <button
              onClick={loadTickets}
              className="btn-webticket-outline text-xs h-9 px-4 bg-white"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Tickets Grid */}
        {user && !loading && !error && displayedTickets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {displayedTickets.map((ticket) => (
              <div
                key={ticket.id}
                className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                {/* Ticket Top Brand Strip */}
                <div className="bg-[#1a2b49] text-white p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-[#7fbd52]" />
                    <span className="text-xs font-bold tracking-wider uppercase">EventPass E-Ticket</span>
                  </div>
                  <span className="text-[11px] font-mono bg-white/10 px-2.5 py-0.5 rounded text-gray-200 font-bold tracking-wider">
                    {ticket.ticketReference}
                  </span>
                </div>

                {/* Ticket Body */}
                <div className="p-5 sm:p-6 space-y-4 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wider ${
                        ticket.status === 'VALID' 
                          ? 'bg-[#7fbd52]/15 text-[#598c34]' 
                          : ticket.status === 'CHECKED_IN'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {ticket.activeStatus || ticket.status}
                      </span>
                      <h3 className="text-base sm:text-lg font-black text-slate-900 font-sans mt-2">
                        {ticket.event?.title}
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-[#7fbd52] flex-shrink-0" />
                      <strong className="text-slate-800">
                        {ticket.event?.startDateTime 
                          ? new Date(ticket.event.startDateTime).toLocaleDateString('en-ZA', { 
                              weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                            })
                          : 'Date to be confirmed'}
                      </strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#7fbd52] flex-shrink-0" />
                      <span className="truncate">{ticket.event?.venue} {ticket.event?.location ? `• ${ticket.event?.location}` : ''}</span>
                    </div>
                    {ticket.orderReference && (
                      <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
                        <span>Order: {ticket.orderReference}</span>
                      </div>
                    )}
                  </div>

                  {/* Ticket Tier & Delivery Notice */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Tier / Seating</span>
                      <strong className="text-xs text-slate-900 font-bold block">{ticket.tier?.name}</strong>
                      <span className="text-[11px] text-[#598c34] font-bold">{ticket.tier?.priceFormatted}</span>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-200">
                        <Mail className="w-3 h-3 text-emerald-600" />
                        <span>Sent via Email</span>
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Check Gmail for QR code
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ticket Footer Actions */}
                <div className="p-4 bg-slate-50 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400">
                    {ticket.ticketReference}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.print()}
                      className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
                      title="Print Ticket Summary"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <Link
                      to={`/my-tickets/${ticket.id}`}
                      className="btn-webticket-primary h-8 px-4 text-[11px] inline-flex items-center gap-1.5"
                    >
                      <span>View Details</span>
                    </Link>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

        {/* State: Empty */}
        {user && !loading && !error && displayedTickets.length === 0 && (
          <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm">
            <Ticket className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">
              {activeTab === 'upcoming' ? 'No active tickets found' : 'No past tickets found'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-6 max-w-sm mx-auto">
              {activeTab === 'upcoming' 
                ? 'When you complete a booking, your official passes will appear right here and scannable tickets will be sent to your email.'
                : 'Checked-in, cancelled, or historical event tickets will be archived in this section.'}
            </p>
            <Link to="/events" className="btn-webticket-primary text-xs inline-flex">
              Browse Events
            </Link>
          </div>
        )}

      </div>
    </div>
  );
};

export default MyTicketsPage;
