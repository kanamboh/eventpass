import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Ticket, Lock, Mail, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/my-tickets';

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please provide both email address and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-12 sm:py-16 bg-[#f8fafc] min-h-[calc(100vh-250px)] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-gray-200 shadow-xl p-8 sm:p-10 space-y-6">
        
        {/* Brand Header */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#6aa340] to-[#7fbd52] flex items-center justify-center text-white mx-auto mb-3 shadow-md">
            <Ticket className="w-6 h-6 transform -rotate-12" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 font-sans tracking-tight">
            Sign In to EventPass
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Access your purchased tickets, race entries, and saved likes
          </p>
        </div>

        {/* Error Notification Banner */}
        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <span className="leading-tight">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                placeholder="e.g. thabo@example.co.za"
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52] disabled:bg-gray-50"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold uppercase text-slate-500">
                Password
              </label>
              <a href="#forgot" className="text-[11px] font-bold text-[#6aa340] hover:underline">
                Forgot Password?
              </a>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
                placeholder="Enter your password"
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52] disabled:bg-gray-50"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" defaultChecked className="accent-[#7fbd52] rounded" />
              <span>Remember me on this device</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn-webticket-primary h-12 text-xs font-bold gap-2 shadow-lg shadow-[#7fbd52]/30 mt-2 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="border-t border-gray-100 pt-4 text-center">
          <p className="text-xs text-slate-500">
            Don't have an EventPass account?{' '}
            <Link to="/register" className="text-[#6aa340] font-bold hover:underline">
              Create an account
            </Link>
          </p>
        </div>

        {/* Loyalty Partner Box */}
        <div className="p-3 bg-slate-50 rounded-2xl border border-gray-100 flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <span>Collect Smart Shopper points on every booking</span>
          <span className="font-bold text-[#c8102e]">Pick n Pay</span>
        </div>

      </div>
    </div>
  );
};

export default LoginPage;
