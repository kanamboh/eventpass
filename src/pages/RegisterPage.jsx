import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ticket, User, Mail, Lock, Phone, MapPin, ArrowRight, AlertCircle, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { CITIES } from '../data/mockEvents';
import { useAuth } from '../context/AuthContext';

const RegisterPage = () => {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    city: 'Cape Town',
    smartShopper: '',
    password: '',
    confirmPassword: '',
    agreeTerms: true
  });

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    const finalValue = type === 'checkbox' ? checked : value;
    setFormData((prev) => ({ ...prev, [name]: finalValue }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    // Client-side quick checks before submitting
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match. Please verify and try again.');
      return;
    }

    if (!formData.agreeTerms) {
      setError('You must accept the Terms of Service to register.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await register({
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        city: formData.city,
        password: formData.password,
        termsAccepted: formData.agreeTerms
      });

      setSuccessInfo({
        email: result.user.email,
        fullName: result.user.fullName,
        devToken: result._devVerificationToken,
        isMock: Boolean(result.emailDelivery?.isMock || result._devVerificationToken)
      });
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your information and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-12 sm:py-16 bg-[#f8fafc] min-h-[calc(100vh-250px)] flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white rounded-3xl border border-gray-200 shadow-xl p-8 sm:p-10 space-y-6">
        
        {/* Brand Header */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#6aa340] to-[#7fbd52] flex items-center justify-center text-white mx-auto mb-3 shadow-md">
            <Ticket className="w-6 h-6 transform -rotate-12" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 font-sans tracking-tight">
            Create Your Account
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Book tickets in seconds and manage barcodes across all your devices
          </p>
        </div>

        {/* Success State */}
        {successInfo ? (
          <div className="text-center space-y-4 py-4">
            <div className="w-14 h-14 rounded-full bg-[#7fbd52]/10 text-[#6aa340] flex items-center justify-center mx-auto border-2 border-[#7fbd52]">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Account Created Successfully</h2>
              <p className="text-xs text-slate-600 mt-2 max-w-sm mx-auto leading-relaxed">
                Welcome, <span className="font-semibold text-slate-800">{successInfo.fullName}</span>!
                <span> Your account has been created successfully. You can now sign in immediately to explore events and manage your bookings.</span>
              </p>
            </div>

            <div className="pt-2 space-y-2.5">
              <Link
                to="/login"
                className="w-full btn-webticket-primary h-11 text-xs font-bold gap-2 shadow-lg shadow-[#7fbd52]/30 flex items-center justify-center"
              >
                <span>Proceed to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                to="/events"
                className="w-full btn-webticket-outline h-11 text-xs font-bold flex items-center justify-center gap-2"
              >
                <span>Browse Live Events</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Error Notification */}
            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="leading-tight">{error}</span>
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                    disabled={isSubmitting}
                    placeholder="e.g. Nomvula Dlamini"
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52] disabled:bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      disabled={isSubmitting}
                      placeholder="nomvula@example.co.za"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52] disabled:bg-gray-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      disabled={isSubmitting}
                      placeholder="083 123 4567"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52] disabled:bg-gray-50"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Home City
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      disabled={isSubmitting}
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 text-xs font-semibold bg-white focus:outline-none focus:border-[#7fbd52] disabled:bg-gray-50"
                    >
                      {CITIES.filter(c => c !== 'All Cities').map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Smart Shopper Card (Optional)
                  </label>
                  <input
                    type="text"
                    name="smartShopper"
                    value={formData.smartShopper}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    placeholder="6009..."
                    className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52] disabled:bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      disabled={isSubmitting}
                      placeholder="Min 8 chars, 1 uppercase, 1 digit"
                      className="w-full h-11 pl-10 pr-10 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52] disabled:bg-gray-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      disabled={isSubmitting}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#7fbd52] focus:ring-offset-1 rounded-lg transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                      disabled={isSubmitting}
                      placeholder="Confirm your password"
                      className="w-full h-11 pl-10 pr-10 rounded-xl border border-gray-200 text-xs font-medium focus:outline-none focus:border-[#7fbd52] disabled:bg-gray-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      disabled={isSubmitting}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#7fbd52] focus:ring-offset-1 rounded-lg transition-colors"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600">
                  <input
                    type="checkbox"
                    name="agreeTerms"
                    checked={formData.agreeTerms}
                    onChange={handleChange}
                    required
                    disabled={isSubmitting}
                    className="mt-0.5 accent-[#7fbd52] rounded"
                  />
                  <span className="leading-tight">
                    I agree to the <a href="#terms" className="text-[#6aa340] font-bold hover:underline">Terms of Service</a> and confirm I have read the POPIA Privacy Notice.
                  </span>
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
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="border-t border-gray-100 pt-4 text-center">
              <p className="text-xs text-slate-500">
                Already have an account?{' '}
                <Link to="/login" className="text-[#6aa340] font-bold hover:underline">
                  Sign in here
                </Link>
              </p>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default RegisterPage;
