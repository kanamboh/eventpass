import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  Ticket, 
  Printer, 
  Calendar, 
  MapPin, 
  ArrowLeft, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  User, 
  Info,
  Building,
  Mail
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchTicketById } from '../services/ticketApi';

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local.slice(0, 2)}${'*'.repeat(Math.min(local.length - 2, 5))}@${domain}`;
};

const TicketDetailsPage = () => {
  const { ticketId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadTicket = async () => {
      if (!ticketId) return;

      try {
        setLoading(true);
        setError(null);
        const data = await fetchTicketById(ticketId);
        if (isMounted) {
          setTicket(data);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load ticket details:', err);
          if (err.status === 403 || err.code === 'TICKET_ACCESS_DENIED') {
            setError('Access Denied: You do not own this ticket.');
          } else if (err.status === 404 || err.code === 'TICKET_NOT_FOUND') {
            setError('Ticket not found. Please verify the ticket link.');
          } else {
            setError(err.message || 'Unable to load ticket details.');
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadTicket();

    return () => {
      isMounted = false;
    };
  }, [ticketId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="py-16 bg-[#f8fafc] min-h-[calc(100vh-250px)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-[#7fbd52] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Loading official ticket pass...
          </p>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="py-16 bg-[#f8fafc] min-h-[calc(100vh-250px)] flex items-center justify-center">
        <div className="max-w-md w-full mx-4 bg-white p-8 rounded-3xl border border-gray-200 text-center space-y-4 shadow-sm">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-black text-slate-900 font-sans">Ticket Access Error</h2>
          <p className="text-xs text-slate-500 leading-relaxed">{error || 'Ticket could not be found.'}</p>
          <div className="pt-2">
            <Link
              to="/my-tickets"
              className="btn-webticket-primary h-11 px-6 text-xs inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to My Tickets</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isCheckedIn = ticket.status === 'CHECKED_IN';
  const isCancelled = ticket.status === 'CANCELLED' || ticket.status === 'REFUNDED';
  const isValid = ticket.status === 'VALID';

  const eventDateFormatted = ticket.eventDate
    ? new Date(ticket.eventDate).toLocaleDateString('en-ZA', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Date TBA';

  return (
    <div className="py-8 bg-[#f8fafc] min-h-[calc(100vh-250px)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Navigation Bar */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link
            to="/my-tickets"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-[#598c34] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to All Tickets</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="btn-webticket-outline h-9 px-3.5 text-xs font-bold gap-1.5 inline-flex items-center"
              title="Print Pass Summary"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print Pass</span>
            </button>
          </div>
        </div>

        {/* Primary Email Delivery Notification Banner */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 mb-6 flex items-start gap-3.5 shadow-xs">
          <Mail className="w-5 h-5 text-[#598c34] flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <strong className="text-slate-900 block font-bold text-sm">
              Primary Ticket Delivery: Emailed to {ticket.buyer?.email ? maskEmail(ticket.buyer.email) : user?.email ? maskEmail(user.email) : 'your registered inbox'}
            </strong>
            <p className="text-slate-600 leading-relaxed">
              Your official scannable entrance pass and turnstile QR credentials have been dispatched directly to your email inbox. For fraud prevention and ticket authenticity, QR codes exist exclusively in your confirmation email. Please check your Gmail or email inbox and present the email QR code at the event turnstile.
            </p>
          </div>
        </div>

        {/* Master Ticket Container */}
        <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-xl">
          
          {/* Header Brand Bar */}
          <div className="bg-[#1a2b49] px-6 sm:px-8 py-5 flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight">
                Event<span className="text-[#7fbd52]">Pass</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-white/10 px-2.5 py-0.5 rounded-full">
                Digital Pass
              </span>
            </div>

            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#7fbd52]" />
              <span className="text-xs font-bold font-mono tracking-wider text-slate-200">
                {ticket.ticketReference}
              </span>
            </div>
          </div>

          {/* Ticket Core Body */}
          <div className="p-6 sm:p-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            
            {/* Left Column: Event & Attendee Info (7 cols) */}
            <div className="md:col-span-7 space-y-6">
              
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {isValid && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                      Active / Valid for Entry
                    </span>
                  )}
                  {isCheckedIn && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                      <Clock className="w-3 h-3 text-purple-600" />
                      Admitted & Checked In
                    </span>
                  )}
                  {isCancelled && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertCircle className="w-3 h-3 text-rose-600" />
                      {ticket.status}
                    </span>
                  )}

                  <span className="bg-[#7fbd52]/10 text-[#598c34] text-[11px] font-extrabold px-3 py-1 rounded-full">
                    {ticket.tierName || 'Standard Admission'}
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 font-sans tracking-tight leading-tight">
                  {ticket.eventTitle}
                </h1>
              </div>

              {/* Event Metadata Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-start gap-3 text-xs text-slate-700">
                  <Calendar className="w-4 h-4 text-[#598c34] mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block text-slate-900 font-bold">Date & Time</strong>
                    <span>{eventDateFormatted}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-xs text-slate-700">
                  <MapPin className="w-4 h-4 text-[#598c34] mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block text-slate-900 font-bold">Venue & Location</strong>
                    <span>{ticket.venue}{ticket.location ? `, ${ticket.location}` : ''}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 text-xs text-slate-700">
                  <User className="w-4 h-4 text-[#598c34] mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block text-slate-900 font-bold">Attendee Name</strong>
                    <span>{ticket.buyerName || user?.fullName || 'Valued Guest'}</span>
                  </div>
                </div>
              </div>

              {/* Admission Notice / Status Detail */}
              {isCheckedIn && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl text-xs text-purple-900 flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div className="leading-relaxed">
                    <strong>Gate Check-In Confirmed:</strong> Admitted at{' '}
                    {ticket.checkedInAt ? new Date(ticket.checkedInAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Gate'}
                    {ticket.checkedInBy ? ` by staff terminal [${ticket.checkedInBy}]` : ''}.
                  </div>
                </div>
              )}

              {isValid && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div className="leading-relaxed">
                    <strong>Turnstile Instructions:</strong> Your official entrance QR barcode has been sent to your email. Please open Gmail on your smartphone and present the email QR code at the turnstile scanner.
                  </div>
                </div>
              )}

            </div>

            {/* Right Column: Official Email Delivery Notice Card (5 cols) */}
            <div className="md:col-span-5 flex flex-col items-center justify-center p-6 sm:p-7 bg-slate-50 border border-slate-200 rounded-3xl text-center space-y-4">
              
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#598c34] shadow-xs">
                <Mail className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200 inline-block">
                  Email Delivery Only
                </span>
                <h4 className="text-sm font-black text-slate-900 font-sans mt-2">
                  Scannable Pass Sent via Email
                </h4>
                <p className="text-xs text-slate-500 max-w-[220px] mx-auto leading-relaxed">
                  For anti-fraud security, turnstile QR credentials exist exclusively in your confirmation email sent to <strong>{ticket.buyer?.email ? maskEmail(ticket.buyer.email) : user?.email ? maskEmail(user.email) : 'your email'}</strong>.
                </p>
              </div>

              <div className="w-full bg-white rounded-2xl border border-gray-200 p-3.5 text-left space-y-2 shadow-xs">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 font-medium">Ticket Reference</span>
                  <span className="font-mono font-bold text-slate-900">{ticket.ticketReference}</span>
                </div>
                {ticket.orderReference && (
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-medium">Order Reference</span>
                    <span className="font-mono text-slate-600">{ticket.orderReference}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400 font-medium">Status</span>
                  <span className="font-semibold text-emerald-700">{ticket.activeStatus || ticket.status}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 bg-blue-50/70 border border-blue-100 rounded-xl p-2.5 text-left leading-relaxed w-full">
                💡 <strong>At the venue gate:</strong> Open your email on your smartphone and present the attached QR code to the entrance scanner.
              </div>
            </div>

          </div>

          {/* Ticket Footer Security Strip */}
          <div className="bg-slate-50 border-t border-gray-200 px-6 sm:px-8 py-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-4 h-4 text-[#7fbd52]" />
              EventPass Anti-Fraud Protected • Server Authoritative
            </span>
            <span className="text-[11px] text-slate-400">
              Need assistance? support@eventpass.co.za
            </span>
          </div>

        </div>

      </div>
    </div>
  );
};

export default TicketDetailsPage;
