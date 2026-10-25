import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Ticket, 
  ShoppingBag, 
  Menu, 
  X, 
  Search, 
  User, 
  Heart,
  Mail,
  Shield
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLikes } from '../context/LikesContext';
import { useAuth } from '../context/AuthContext';

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { cartItems } = useCart();
  const { count: likesCount } = useLikes();
  const { user, isAuthenticated, isEmailVerified, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const totalCartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/events?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileMenuOpen(false);
    }
  };

  const isActive = (path) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-[68px] gap-2 lg:gap-6">
          
          {/* Left: Mobile Menu Trigger + Brand Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 text-slate-700 hover:text-[#598c34] focus:outline-none"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded bg-[#7fbd52] flex items-center justify-center text-white">
                <Ticket className="w-4 h-4 -rotate-12" />
              </div>
              <div className="flex items-baseline">
                <span className="text-xl font-bold tracking-tight text-slate-900 font-sans">
                  Event<span className="text-[#7fbd52]">Pass</span>
                </span>
                <span className="text-[10px] font-semibold text-slate-400 ml-0.5">.co.za</span>
              </div>
            </Link>
          </div>

          {/* Center Navigation Links (Webtickets Desktop Structure) */}
          <nav className="hidden lg:flex items-center space-x-5 xl:space-x-7 text-xs font-bold uppercase tracking-wider text-slate-700">
            <Link 
              to="/events" 
              className={`hover:text-[#598c34] transition-colors ${
                isActive('/events') && !location.search ? 'text-[#598c34]' : ''
              }`}
            >
              Events
            </Link>
            <Link 
              to="/events?category=lifestyle" 
              className="hover:text-[#598c34] transition-colors"
            >
              Tourism & Activities
            </Link>
            <Link 
              to="/events?category=sports" 
              className="hover:text-[#598c34] transition-colors"
            >
              Race Entries
            </Link>
            <Link 
              to="/events?category=festivals" 
              className="hover:text-[#598c34] transition-colors"
            >
              Vouchers
            </Link>
            <Link 
              to="/events" 
              className="hover:text-[#598c34] text-slate-700 transition-colors"
            >
              List Your Event
            </Link>
          </nav>

          {/* Right: Search, Sign In, Likes & Cart */}
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            {/* Compact Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative hidden sm:flex items-center">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="h-8 w-36 lg:w-44 xl:w-52 pl-3 pr-8 text-xs text-slate-800 bg-gray-50 border border-gray-300 rounded focus:bg-white focus:outline-none focus:border-[#7fbd52] transition-all placeholder:text-gray-400"
              />
              <button
                type="submit"
                className="absolute right-2 text-gray-500 hover:text-[#598c34]"
                aria-label="Submit search"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Mobile Search Icon Button */}
            <Link
              to="/events"
              className="sm:hidden p-1.5 text-slate-700 hover:text-[#598c34]"
              aria-label="Search events"
            >
              <Search className="w-4 h-4" />
            </Link>

            {/* User Account / Sign In */}
            {isAuthenticated && user ? (
              <div className="hidden md:flex items-center gap-3">
                {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                  <Link
                    to="/admin"
                    className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-white bg-slate-900 px-2.5 py-1 rounded hover:bg-[#598c34] transition-colors shadow-sm"
                    title="Admin Dashboard"
                  >
                    <span>Admin</span>
                  </Link>
                )}
                {user.role === 'SUPER_ADMIN' && (
                  <Link
                    to="/admin/users"
                    className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded hover:bg-purple-100 transition-colors shadow-sm"
                    title="Owner: Manage Administrators"
                  >
                    <Shield className="w-3.5 h-3.5 text-purple-600" />
                    <span>Manage Admins</span>
                  </Link>
                )}
                {/* TEMPORARILY PAUSED: Email verification reminder paused */}
                <Link
                  to="/my-tickets"
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-[#598c34] transition-colors"
                  title="My Tickets"
                >
                  <Ticket className="w-3.5 h-3.5 text-[#598c34]" />
                  <span>Tickets</span>
                </Link>
                <Link
                  to="/my-orders"
                  className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-[#598c34] transition-colors"
                  title="My Orders"
                >
                  <User className="w-3.5 h-3.5 text-[#598c34]" />
                  <span className="truncate max-w-[80px]">Orders</span>
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-red-600 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="hidden md:flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-[#598c34] transition-colors"
              >
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span>Sign In</span>
              </Link>
            )}

            {/* Likes */}
            <Link
              to="/events?filter=likes"
              className="hidden md:flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-[#598c34] transition-colors"
              title="Favourites"
            >
              <Heart className={`w-3.5 h-3.5 ${likesCount > 0 ? 'text-red-500 fill-red-500' : 'text-slate-500'}`} />
              {likesCount > 0 && (
                <span className="text-[10px] font-bold text-slate-600 bg-gray-100 px-1 rounded">
                  {likesCount}
                </span>
              )}
            </Link>

            {/* Cart Button */}
            <Link
              to="/cart"
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-800 hover:text-[#598c34] transition-colors py-1 px-1.5"
              title="Cart"
            >
              <div className="relative">
                <ShoppingBag className="w-4 h-4 text-slate-700" />
                {totalCartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-[#7fbd52] text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {totalCartCount}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline">Cart</span>
            </Link>
          </div>

        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-t border-gray-200 px-4 py-4 space-y-3">
          {/* Mobile Search */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center pb-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events, artists, venues..."
              className="h-9 w-full pl-3 pr-8 text-xs text-slate-800 bg-gray-50 border border-gray-300 rounded focus:bg-white focus:outline-none focus:border-[#7fbd52]"
            />
            <button
              type="submit"
              className="absolute right-2.5 text-gray-500 hover:text-[#598c34]"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

          {/* Navigation Links */}
          <div className="space-y-1 text-xs font-bold uppercase tracking-wider text-slate-700">
            <Link
              to="/events"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 px-1 hover:text-[#598c34] border-b border-gray-100"
            >
              Events
            </Link>
            <Link
              to="/events?category=lifestyle"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 px-1 hover:text-[#598c34] border-b border-gray-100"
            >
              Tourism & Activities
            </Link>
            <Link
              to="/events?category=sports"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 px-1 hover:text-[#598c34] border-b border-gray-100"
            >
              Race Entries
            </Link>
            <Link
              to="/events?category=festivals"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 px-1 hover:text-[#598c34] border-b border-gray-100"
            >
              Vouchers
            </Link>
            <Link
              to="/events"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 px-1 hover:text-[#598c34] border-b border-gray-100"
            >
              List Your Event
            </Link>
            {isAuthenticated && user ? (
              <>
                {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block py-2 px-1 font-bold text-white bg-slate-900 rounded px-2 hover:bg-[#598c34] mb-1"
                  >
                    Admin Dashboard
                  </Link>
                )}
                {user.role === 'SUPER_ADMIN' && (
                  <Link
                    to="/admin/users"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block py-2 px-1 font-bold text-purple-700 bg-purple-50 rounded px-2 hover:bg-purple-100 mb-1 border border-purple-200"
                  >
                    Manage Admins (Owner)
                  </Link>
                )}
                {/* TEMPORARILY PAUSED: Mobile email verification reminder paused */}
                <Link
                  to="/my-tickets"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2 px-1 hover:text-[#598c34] border-b border-gray-100 text-slate-700"
                >
                  My Tickets ({user.fullName.split(' ')[0]})
                </Link>
                <Link
                  to="/my-orders"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2 px-1 hover:text-[#598c34] border-b border-gray-100 text-slate-700"
                >
                  My Orders
                </Link>
                <button
                  type="button"
                  onClick={() => { logout(); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 px-1 hover:text-red-600 border-b border-gray-100 text-slate-500 text-xs font-bold uppercase tracking-wider"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 px-1 hover:text-[#598c34] border-b border-gray-100 text-slate-600"
              >
                Sign In / My Account
              </Link>
            )}
            <Link
              to="/my-tickets"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 px-1 hover:text-[#598c34] text-slate-600"
            >
              My Tickets
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
