import React, { useState } from 'react';
import { Mail, Check, BellRing } from 'lucide-react';

const Newsletter = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setEmail('');
    }
  };

  return (
    <section className="py-12 bg-slate-900 text-white relative overflow-hidden">
      {/* Background Subtle Gradient Lines */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#7fbd52_1px,transparent_1px)] [background-size:16px_16px]"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-2xl mx-auto text-center">
          
          <div className="w-12 h-12 rounded-full bg-[#7fbd52]/20 text-[#7fbd52] flex items-center justify-center mx-auto mb-4 border border-[#7fbd52]/30">
            <BellRing className="w-6 h-6" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-black font-sans tracking-tight text-white mb-2">
            Get The Best Events In Your Inbox
          </h2>

          <p className="text-xs sm:text-sm text-gray-300 mb-6 max-w-lg mx-auto leading-relaxed">
            Subscribe to receive exclusive pre-sale access, early bird ticket discounts, weekend event recommendations, and tour announcements.
          </p>

          {subscribed ? (
            <div className="bg-[#7fbd52]/20 border border-[#7fbd52] text-white px-6 py-4 rounded-2xl flex items-center justify-center gap-3 animate-fade-in">
              <Check className="w-5 h-5 text-[#7fbd52]" />
              <span className="text-xs sm:text-sm font-bold">
                Thank you for subscribing! Check your inbox soon for your 10% welcome discount.
              </span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-2 max-w-md mx-auto">
              <div className="relative w-full">
                <Mail className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  className="w-full h-12 pl-11 pr-4 rounded-full bg-slate-800/90 text-white placeholder-gray-400 border border-slate-700 focus:outline-none focus:border-[#7fbd52] focus:ring-2 focus:ring-[#7fbd52]/20 text-xs sm:text-sm font-sans"
                />
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto btn-webticket-primary h-12 px-7 text-xs font-bold gap-2 whitespace-nowrap shadow-lg shadow-[#7fbd52]/20"
              >
                <Check className="w-4 h-4" />
                <span>Sign Up</span>
              </button>
            </form>
          )}

          <p className="text-[11px] text-gray-400 mt-4">
            We value your privacy. Unsubscribe at any time with one click.
          </p>

        </div>
      </div>
    </section>
  );
};

export default Newsletter;
