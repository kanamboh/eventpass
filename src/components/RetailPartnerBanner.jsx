import React from 'react';
import { Store, CreditCard, TicketCheck, ShieldCheck } from 'lucide-react';

const RetailPartnerBanner = () => {
  return (
    <section className="py-10 bg-white border-y border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
          
          {/* Subtle Accent Glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#7fbd52]/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
            {/* Title & Brand */}
            <div className="max-w-xl">
              <div className="flex items-center gap-3 mb-2">
                <span className="bg-[#c8102e] text-white text-[11px] font-black uppercase px-2.5 py-0.5 rounded tracking-wider">
                  Pick n Pay
                </span>
                <span className="text-xs uppercase font-bold text-gray-400 tracking-wider">
                  Official Retail Ticketing Partner
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black font-sans tracking-tight text-white mb-2">
                Book Online. Pay in Cash or Card at Any Store.
              </h3>
              <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
                Enjoy flexible payment options. Select your seats online, get a booking reference code, and pay at any Pick n Pay or Boxer till nationwide within 24 hours.
              </p>
            </div>

            {/* 3 Step Process Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                <div className="w-8 h-8 rounded-full bg-[#7fbd52] text-white flex items-center justify-center font-bold text-xs mb-2">
                  1
                </div>
                <h4 className="text-xs font-bold text-white mb-0.5">Select Tickets</h4>
                <p className="text-[11px] text-gray-300">Choose your event seats and proceed to checkout.</p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                <div className="w-8 h-8 rounded-full bg-[#7fbd52] text-white flex items-center justify-center font-bold text-xs mb-2">
                  2
                </div>
                <h4 className="text-xs font-bold text-white mb-0.5">Get Reference</h4>
                <p className="text-[11px] text-gray-300">Receive your 16-digit reference via SMS and email.</p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                <div className="w-8 h-8 rounded-full bg-[#7fbd52] text-white flex items-center justify-center font-bold text-xs mb-2">
                  3
                </div>
                <h4 className="text-xs font-bold text-white mb-0.5">Collect at Till</h4>
                <p className="text-[11px] text-gray-300">Pay at any cashier to receive printed official tickets.</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};

export default RetailPartnerBanner;
