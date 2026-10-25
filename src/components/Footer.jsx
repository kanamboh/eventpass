import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Ticket, 
  ShieldCheck, 
  CalendarPlus, 
  ExternalLink,
  Facebook, 
  Instagram, 
  Twitter, 
  Linkedin,
  CreditCard
} from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-slate-950 text-gray-300 pt-16 pb-8 border-t border-slate-800 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main 4 Column Grid (Matches WebTickets Architecture) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-slate-800">
          
          {/* Column 1: Sell Tickets With Us */}
          <div className="space-y-4">
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-white">
              Sell Tickets With Us
            </h4>
            <p className="text-gray-400 leading-relaxed">
              The leader in modern online ticket sales, reserved seating algorithms, and retail distribution in South Africa.
            </p>
            <div className="pt-2">
              <Link
                to="/events"
                className="btn-webticket-primary h-10 px-5 text-xs inline-flex"
              >
                <span>List Your Event</span>
              </Link>
            </div>
            <div className="pt-3">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                Retail Till Integration
              </span>
              <p className="text-[11px] text-gray-400">
                Over 1,800 Pick n Pay and Boxer supermarket point-of-sale points connected nationwide.
              </p>
            </div>
          </div>

          {/* Column 2: Find Events */}
          <div className="space-y-4">
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-white">
              Find Events
            </h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <Link to="/events" className="hover:text-[#7fbd52] transition-colors">
                  Browse All Events
                </Link>
              </li>
              <li>
                <Link to="/events?category=music" className="hover:text-[#7fbd52] transition-colors">
                  Concerts & Tours
                </Link>
              </li>
              <li>
                <Link to="/events?category=theatre" className="hover:text-[#7fbd52] transition-colors">
                  Theatre & Dance Shows
                </Link>
              </li>
              <li>
                <Link to="/events?category=sports" className="hover:text-[#7fbd52] transition-colors">
                  Sports & Marathon Entries
                </Link>
              </li>
              <li>
                <Link to="/events?category=festivals" className="hover:text-[#7fbd52] transition-colors">
                  Festivals & Expos
                </Link>
              </li>
              <li>
                <Link to="/events?filter=likes" className="hover:text-[#7fbd52] transition-colors">
                  My Likes
                </Link>
              </li>
            </ul>

            <div className="pt-2">
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                Partner Countries
              </h5>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-gray-400">Namibia</span>
                <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-gray-400">Botswana</span>
                <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-gray-400">Zambia</span>
                <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-gray-400">Malawi</span>
              </div>
            </div>
          </div>

          {/* Column 3: Help & Info */}
          <div className="space-y-4">
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-white">
              Help & Info
            </h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <a href="#faqs" className="hover:text-[#7fbd52] transition-colors">
                  Get Help & FAQs
                </a>
              </li>
              <li>
                <a href="#refunds" className="hover:text-[#7fbd52] transition-colors">
                  Refund & Cancellation Policy
                </a>
              </li>
              <li>
                <a href="#email-delivery" className="hover:text-[#7fbd52] transition-colors">
                  Email Ticket Delivery Guide
                </a>
              </li>
              <li>
                <a href="#terms" className="hover:text-[#7fbd52] transition-colors">
                  Customer Terms & Conditions
                </a>
              </li>
              <li>
                <a href="#privacy" className="hover:text-[#7fbd52] transition-colors">
                  POPIA & Privacy Policy
                </a>
              </li>
              <li>
                <a href="#promoters" className="hover:text-[#7fbd52] transition-colors">
                  Promoter Dashboard Login
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4: My Account */}
          <div className="space-y-4">
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-white">
              My Account
            </h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <Link to="/login" className="hover:text-[#7fbd52] transition-colors">
                  Sign In / Register
                </Link>
              </li>
              <li>
                <Link to="/my-tickets" className="hover:text-[#7fbd52] transition-colors">
                  My Tickets & Barcodes
                </Link>
              </li>
              <li>
                <Link to="/my-tickets" className="hover:text-[#7fbd52] transition-colors">
                  Race Entries & Passes
                </Link>
              </li>
              <li>
                <Link to="/cart" className="hover:text-[#7fbd52] transition-colors">
                  Current Cart / Checkout
                </Link>
              </li>
              <li>
                <a href="#vouchers" className="hover:text-[#7fbd52] transition-colors">
                  Gift Cards & Loyalty Vouchers
                </a>
              </li>
            </ul>

            {/* Social Icons */}
            <div className="pt-2">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                Follow Us
              </span>
              <div className="flex items-center gap-2">
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noreferrer"
                  className="w-8 h-8 rounded-full bg-slate-900 hover:bg-[#7fbd52] hover:text-white flex items-center justify-center transition-colors border border-slate-800"
                  aria-label="Facebook"
                >
                  <Facebook className="w-3.5 h-3.5" />
                </a>
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noreferrer"
                  className="w-8 h-8 rounded-full bg-slate-900 hover:bg-[#7fbd52] hover:text-white flex items-center justify-center transition-colors border border-slate-800"
                  aria-label="Twitter / X"
                >
                  <Twitter className="w-3.5 h-3.5" />
                </a>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noreferrer"
                  className="w-8 h-8 rounded-full bg-slate-900 hover:bg-[#7fbd52] hover:text-white flex items-center justify-center transition-colors border border-slate-800"
                  aria-label="Instagram"
                >
                  <Instagram className="w-3.5 h-3.5" />
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noreferrer"
                  className="w-8 h-8 rounded-full bg-slate-900 hover:bg-[#7fbd52] hover:text-white flex items-center justify-center transition-colors border border-slate-800"
                  aria-label="LinkedIn"
                >
                  <Linkedin className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

        </div>

        {/* Safe & Secure Payment Methods Strip */}
        <div className="py-8 border-b border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#7fbd52]/10 border border-[#7fbd52]/30 flex items-center justify-center text-[#7fbd52]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-xs font-bold text-white uppercase tracking-wider">Safe & Secure 256-Bit SSL Checkout</h5>
              <p className="text-[11px] text-gray-400">
                We accept Visa, Mastercard, Masterpass, Ozow Instant EFT, SnapScan, and In-Store payment at Pick n Pay.
              </p>
            </div>
          </div>

          {/* Payment Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-slate-900 border border-slate-800 px-3 py-1 rounded-md text-[11px] font-black text-white">
              VISA
            </span>
            <span className="bg-slate-900 border border-slate-800 px-3 py-1 rounded-md text-[11px] font-black text-red-400">
              Mastercard
            </span>
            <span className="bg-slate-900 border border-slate-800 px-3 py-1 rounded-md text-[11px] font-bold text-sky-400">
              Ozow EFT
            </span>
            <span className="bg-slate-900 border border-slate-800 px-3 py-1 rounded-md text-[11px] font-bold text-blue-300">
              SnapScan
            </span>
            <span className="bg-[#c8102e] px-3 py-1 rounded-md text-[11px] font-black text-white">
              Pick n Pay
            </span>
          </div>
        </div>

        {/* Copyright & Disclaimer */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-500 gap-4">
          <p>© {new Date().getFullYear()} EventPass (Pty) Ltd. Educational implementation inspired by WebTickets SA.</p>
          <div className="flex items-center gap-4">
            <a href="#terms" className="hover:text-gray-300">Terms of Service</a>
            <span>•</span>
            <a href="#privacy" className="hover:text-gray-300">Privacy Policy</a>
            <span>•</span>
            <a href="#cookies" className="hover:text-gray-300">Cookie Preferences</a>
          </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
