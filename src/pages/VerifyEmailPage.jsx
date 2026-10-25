import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { 
  CheckCircle, 
  AlertCircle, 
  Mail, 
  ArrowRight, 
  Loader2, 
  RefreshCw, 
  ShieldCheck, 
  ShoppingCart, 
  Ticket,
  Terminal,
  ExternalLink,
  Code
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token');
  const emailFromUrl = searchParams.get('email') || '';
  const returnUrl = searchParams.get('returnUrl') || '/checkout';
  
  const navigate = useNavigate();
  const { user, isEmailVerified, verifyEmail, resendVerification, getDevToken } = useAuth();
  const { cartItems } = useCart();

  const [tokenInput, setTokenInput] = useState(tokenFromUrl || '');
  const [customEmail, setCustomEmail] = useState(emailFromUrl);
  const [verifying, setVerifying] = useState(false);
  const [verifiedSuccess, setVerifiedSuccess] = useState(isEmailVerified);
  const [errorMessage, setErrorMessage] = useState('');
  
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState(null);
  
  const [devToken, setDevToken] = useState(null);
  const [loadingDevToken, setLoadingDevToken] = useState(false);

  // Determine development mode safely (Vite dev mode or dev token present)
  const isDevMode = Boolean(import.meta.env.DEV || devToken);
  const activeEmail = user?.email || customEmail;

  // Attempt verification with a specific token string
  const handleVerify = useCallback(async (tokenToVerify) => {
    const rawToken = tokenToVerify || tokenInput;
    if (!rawToken || !rawToken.trim()) {
      setErrorMessage('Please provide a verification token.');
      return;
    }

    setVerifying(true);
    setErrorMessage('');

    try {
      await verifyEmail(rawToken.trim());
      setVerifiedSuccess(true);
    } catch (err) {
      setErrorMessage(err.message || 'Invalid or expired verification token.');
    } finally {
      setVerifying(false);
    }
  }, [tokenInput, verifyEmail]);

  // If token is present in URL query params on load, trigger verification automatically
  useEffect(() => {
    if (tokenFromUrl && !isEmailVerified && !verifiedSuccess) {
      handleVerify(tokenFromUrl);
    }
  }, [tokenFromUrl, isEmailVerified, verifiedSuccess, handleVerify]);

  // In development mode, fetch the dev token for the active email
  const fetchDevToken = useCallback(async (email) => {
    if (!email) return;
    setLoadingDevToken(true);
    try {
      const tok = await getDevToken(email);
      if (tok) {
        setDevToken(tok);
        if (!tokenInput) {
          setTokenInput(tok);
        }
      }
    } catch (err) {
      // Dev token unavailable outside development
    } finally {
      setLoadingDevToken(false);
    }
  }, [getDevToken, tokenInput]);

  // Trigger dev token lookup when user or email is available
  useEffect(() => {
    if (isDevMode && !isEmailVerified && !verifiedSuccess && !tokenFromUrl) {
      const target = user?.email || customEmail;
      if (target) {
        fetchDevToken(target);
      }
    }
  }, [isDevMode, isEmailVerified, verifiedSuccess, user?.email, customEmail, tokenFromUrl, fetchDevToken]);

  // Handle Resend Verification Email
  const handleResend = async () => {
    const targetEmail = activeEmail;
    if (!targetEmail) {
      setErrorMessage('Please enter your account email address first.');
      return;
    }

    setResending(true);
    setResendStatus(null);
    setErrorMessage('');

    try {
      const res = await resendVerification(targetEmail);
      if (res._devVerificationToken) {
        setDevToken(res._devVerificationToken);
        setTokenInput(res._devVerificationToken);
      }
      setResendStatus({
        type: 'success',
        message: (res.emailDelivery?.isMock ?? isDevMode)
          ? 'New single-use token generated in MockEmailProvider! Click the verify button below.'
          : (res.message || 'Verification link dispatched successfully. Please check your inbox.')
      });
    } catch (err) {
      setResendStatus({
        type: 'error',
        message: err.message || 'Failed to resend verification email.'
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="py-12 sm:py-16 bg-[#f8fafc] min-h-[calc(100vh-250px)] flex items-center justify-center px-4">
      <div className="max-w-xl w-full bg-white rounded-3xl border border-gray-200 shadow-xl p-8 sm:p-10 space-y-6">
        
        {/* Brand Icon Header */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#7fbd52]/10 border border-[#7fbd52]/30 flex items-center justify-center text-[#598c34] mx-auto mb-3 shadow-sm">
            {verifiedSuccess || isEmailVerified ? (
              <CheckCircle className="w-7 h-7 text-[#598c34]" />
            ) : verifying ? (
              <Loader2 className="w-7 h-7 text-[#598c34] animate-spin" />
            ) : (
              <Mail className="w-7 h-7 text-[#598c34]" />
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900 font-sans tracking-tight">
            {verifiedSuccess || isEmailVerified
              ? 'Email Verified'
              : verifying
              ? 'Verifying Email...'
              : 'Email Verification Required'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {verifiedSuccess || isEmailVerified
              ? 'Your account is in good standing and ready for ticket purchases.'
              : 'Protecting your ticket reservations and digital gate credentials.'}
          </p>
        </div>

        {/* 1. SUCCESS STATE */}
        {verifiedSuccess || isEmailVerified ? (
          <div className="space-y-5 animate-fade-in text-center">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-left space-y-2">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Verification Completed Authoritatively</span>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Thank you, <strong>{user?.fullName || 'valued customer'}</strong>! Your email address (<strong>{user?.email || activeEmail}</strong>) has been confirmed on the server.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {cartItems && cartItems.length > 0 ? (
                <Link
                  to={returnUrl}
                  className="w-full btn-webticket-primary h-12 text-xs font-bold gap-2 shadow-lg shadow-[#7fbd52]/30 flex items-center justify-center"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Return to Checkout & Complete Booking</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <Link
                  to="/events"
                  className="w-full btn-webticket-primary h-12 text-xs font-bold gap-2 shadow-lg shadow-[#7fbd52]/30 flex items-center justify-center"
                >
                  <Ticket className="w-4 h-4" />
                  <span>Browse Live Events</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}

              <Link
                to="/my-tickets"
                className="w-full btn-webticket-outline h-11 text-xs font-bold flex items-center justify-center gap-2"
              >
                <span>Go to My Tickets</span>
              </Link>
            </div>
          </div>
        ) : verifying ? (
          /* 2. LOADING STATE */
          <div className="py-8 text-center space-y-4 animate-fade-in">
            <Loader2 className="w-10 h-10 text-[#7fbd52] animate-spin mx-auto" />
            <p className="text-xs text-slate-600 font-medium">
              Validating cryptographic token against security server...
            </p>
          </div>
        ) : (
          /* 3. UNVERIFIED / VERIFICATION REQUIRED STATE */
          <div className="space-y-5 animate-fade-in">
            
            {/* Error Notification */}
            {errorMessage && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-xs text-red-700 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="leading-tight">{errorMessage}</span>
              </div>
            )}

            {/* Resend Status Message */}
            {resendStatus && (
              <div className={`p-3.5 rounded-2xl flex items-start gap-2.5 text-xs ${
                resendStatus.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                {resendStatus.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <span className="leading-tight">{resendStatus.message}</span>
              </div>
            )}

            {/* PROMINENT LOCAL DEVELOPMENT MODE BANNER */}
            {isDevMode && (
              <div className="p-4 bg-amber-500/10 border-2 border-dashed border-amber-500/50 rounded-2xl space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] uppercase tracking-wider shadow-sm">
                    <Terminal className="w-3.5 h-3.5" />
                    Development Mode
                  </span>
                  <span className="text-[11px] font-mono font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md border border-amber-300">
                    MockEmailProvider Active
                  </span>
                </div>
                <div className="text-xs text-amber-950 leading-relaxed space-y-1">
                  <p className="font-semibold">
                    🚫 <strong>No real email was sent to Gmail or your personal inbox.</strong>
                  </p>
                  <p className="text-[11px] text-amber-900/90 leading-normal">
                    This local environment uses an in-memory mock provider without outbound SMTP/SES. The generated single-use verification token is ready below for instant local testing.
                  </p>
                </div>
              </div>
            )}

            {/* ONE-CLICK LOCAL VERIFICATION CARD (DEV MODE) */}
            {isDevMode && devToken && (
              <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl space-y-3 shadow-sm animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-emerald-900 font-extrabold text-xs uppercase tracking-wider">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Instant Local Verification</span>
                  </div>
                  <span className="text-[10px] bg-emerald-200 text-emerald-900 font-mono font-bold px-2 py-0.5 rounded-full">
                    Token Ready
                  </span>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-emerald-200 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Generated Verification Token:
                  </span>
                  <p className="font-mono text-[11px] text-slate-800 break-all select-all">
                    {devToken}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTokenInput(devToken);
                    handleVerify(devToken);
                  }}
                  disabled={verifying}
                  className="w-full h-11 bg-[#598c34] hover:bg-[#49732b] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-[#7fbd52]/30 transition-all hover:scale-[1.01]"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying on Server...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>One-Click Verify Account Now</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Dev Token Loading indicator */}
            {isDevMode && loadingDevToken && !devToken && (
              <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-2xl flex items-center gap-3 text-xs text-amber-800">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600 flex-shrink-0" />
                <span>Retrieving local development verification token...</span>
              </div>
            )}

            {/* Information card (Standard / Production) */}
            {!isDevMode && (
              <div className="p-4 bg-slate-50 border border-gray-200 rounded-2xl text-xs space-y-2 text-slate-600">
                <p className="leading-relaxed">
                  A verification link is sent upon account registration. To purchase tickets and receive official digital QR barcodes, your email address must be verified.
                </p>
                {activeEmail && (
                  <div className="pt-2 border-t border-gray-200 flex items-center justify-between font-mono text-[11px] text-slate-700">
                    <span>Account:</span>
                    <strong className="text-slate-900">{activeEmail}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Email input field if not authenticated */}
            {!user?.email && (
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase text-slate-500">
                  Account Email Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="Enter your registered email..."
                    className="flex-1 h-11 px-3.5 rounded-xl border border-gray-200 text-xs font-medium bg-white focus:outline-none focus:border-[#7fbd52]"
                  />
                  {isDevMode && (
                    <button
                      type="button"
                      onClick={() => fetchDevToken(customEmail)}
                      disabled={loadingDevToken || !customEmail.trim()}
                      className="px-3 h-11 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      title="Fetch development token for this email"
                    >
                      {loadingDevToken ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>Load Token</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Manual Token Verification Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerify();
              }}
              className="space-y-3 pt-1"
            >
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Manual Verification Token
                </label>
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste single-use token here..."
                  className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-xs font-mono bg-white focus:outline-none focus:border-[#7fbd52]"
                />
              </div>

              <button
                type="submit"
                disabled={verifying || !tokenInput.trim()}
                className="w-full btn-webticket-primary h-11 text-xs font-bold gap-2 shadow-md shadow-[#7fbd52]/20 flex items-center justify-center disabled:opacity-50"
              >
                {verifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify Email Address</span>
                )}
              </button>
            </form>

            {/* Resend Action */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {isDevMode ? 'Need a fresh test token?' : "Didn't receive the email?"}
              </span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="font-bold text-[#598c34] hover:text-[#49732b] flex items-center gap-1 disabled:opacity-50"
              >
                {resending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{isDevMode ? 'Generate Fresh Token' : 'Resend Email'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Return Link */}
            <div className="text-center pt-2">
              <Link
                to={returnUrl}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium"
              >
                &larr; Return to checkout
              </Link>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};

export default VerifyEmailPage;
