import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Check, Eye, EyeOff } from 'lucide-react';
import { PageTransition } from '../components/wow';
import {
  useAuth,
  setPendingName,
  triggerWelcomeToastOnce,
  consumeReturnTo,
  isValidReturnPath
} from '../auth';

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  '11111111',
  '00000000',
  'letmein1',
  'welcome1',
  'admin123',
  'iloveyou1',
  'abc12345',
  ' cybershield1',
  'cybershield1'
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function evaluatePassword(pw) {
  const raw = typeof pw === 'string' ? pw : '';
  const minLength = raw.length >= 8;
  const hasLetter = /[A-Za-z]/.test(raw);
  const hasNumber = /[0-9]/.test(raw);
  const isCommon = raw.length > 0 && COMMON_PASSWORDS.has(raw.toLowerCase());
  const notCommon = raw.length > 0 && !isCommon;
  const isValid = minLength && hasLetter && hasNumber && !isCommon;
  return { minLength, hasLetter, hasNumber, isCommon, notCommon, isValid };
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function PasswordChecklist({ evalResult }) {
  const items = [
    { key: 'len', label: 'At least 8 characters', ok: evalResult.minLength },
    { key: 'letter', label: 'Contains a letter', ok: evalResult.hasLetter },
    { key: 'number', label: 'Contains a number', ok: evalResult.hasNumber },
    { key: 'common', label: 'Not a common password (e.g. "password1")', ok: evalResult.notCommon }
  ];

  return (
    <ul className="auth-pw-checklist" aria-label="Password requirements">
      {items.map((item) => (
        <li
          key={item.key}
          className={`auth-pw-check-item ${item.ok ? 'met' : ''}`}
        >
          <span className="auth-pw-check-dot" aria-hidden="true">
            {item.ok ? <Check size={12} /> : null}
          </span>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function classifyNetworkOrRateError(error) {
  const msg = String(error?.message || error?.code || '').toLowerCase();
  if (
    error?.status === 429 ||
    msg.includes('rate limit') ||
    msg.includes('over_email_send_rate_limit') ||
    msg.includes('too many') ||
    msg.includes('security purposes') ||
    msg.includes('429')
  ) {
    return { type: 'rate', message: 'Too many attempts. Please try again in a minute.' };
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('fetch')) {
    return { type: 'network', message: 'Network error. Please check your connection and try again.' };
  }
  return null;
}

export function Login({ mode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    configLoaded,
    authAvailable,
    supabase,
    session,
    callbackError,
    clearCallbackError
  } = useAuth();

  const resolvedView = (() => {
    const searchParams = new URLSearchParams(location.search);
    const modeParam = searchParams.get('mode');
    if (mode === 'signup' || location.pathname === '/signup' || modeParam === 'signup') return 'signup';
    if (mode === 'forgot-password' || location.pathname === '/forgot-password' || modeParam === 'forgot') return 'forgot';
    if (mode === 'reset-password' || location.pathname === '/reset-password' || modeParam === 'reset') return 'reset';
    return 'login';
  })();

  const resolvePostLoginDest = () => {
    const stateFrom = location.state?.from;
    if (isValidReturnPath(stateFrom)) {
      consumeReturnTo();
      return stateFrom.trim();
    }
    const stored = consumeReturnTo();
    return stored || '/dashboard';
  };

  // Redirect away from /login and /signup when already signed in
  useEffect(() => {
    if (session && (resolvedView === 'login' || resolvedView === 'signup')) {
      navigate(resolvePostLoginDest(), { replace: true });
    }
  }, [session, resolvedView, navigate]);

  // Shared form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Eye toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Sub-flows:
  // signupConfirmStep: after signUp when email confirmation is enabled
  const [signupConfirmStep, setSignupConfirmStep] = useState(false);
  // loginSubMode: 'password' | 'email-code-request' | 'email-code-verify'
  const [loginSubMode, setLoginSubMode] = useState('password');
  const [unconfirmedEmail, setUnconfirmedEmail] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  // Cooldown timer (seconds) for Resend buttons
  const [resendCooldown, setResendCooldown] = useState(0);

  // Request states & messages
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);

  // Reset transient state when switching routes
  useEffect(() => {
    setErrorMsg(null);
    setInfoMsg(null);
    setUnconfirmedEmail(false);
    setSignupConfirmStep(false);
    setLoginSubMode('password');
    setOtpCode('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [resolvedView]);

  // Tick down 60-second cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const serviceUnavailable = !configLoaded || !authAvailable;
  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim();
  const isEmailValid = EMAIL_RE.test(trimmedEmail);
  const pwEval = evaluatePassword(password);

  // Requirement 2: On /signup, both "Create your account" and "Sign up with Google" stay disabled
  // until name, valid email, valid password, and the checkbox are all set.
  const isSignupFormValid =
    trimmedName.length >= 1 &&
    trimmedName.length <= 60 &&
    isEmailValid &&
    pwEval.isValid &&
    agreedToTerms;

  const isResetFormValid =
    pwEval.isValid && confirmPassword.length > 0 && password === confirmPassword;

  const handleSwitchAuthMode = (targetMode) => {
    setErrorMsg(null);
    setInfoMsg(null);
    setUnconfirmedEmail(false);
    setSignupConfirmStep(false);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    // Keep email intact when switching between sign-in and sign-up
    const targetUrl = targetMode === 'signup' ? '/login?mode=signup' : '/login';
    navigate(targetUrl, { replace: true });
  };

  const handleGoogleAuth = async () => {
    if (serviceUnavailable || !supabase || googleSubmitting || submitting) return;
    if (resolvedView === 'signup' && !isSignupFormValid) return;

    clearCallbackError();
    setErrorMsg(null);
    setInfoMsg(null);

    if (resolvedView === 'signup' && trimmedName) {
      setPendingName(trimmedName);
    }

    setGoogleSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/'
        }
      });
      if (error) {
        console.error('Google OAuth failed:', error.code || error.status || 'error');
        setErrorMsg('Could not start Google sign-in. Please try again.');
        setGoogleSubmitting(false);
      }
    } catch {
      console.error('Google OAuth unexpected error');
      setErrorMsg('Could not start Google sign-in. Please try again.');
      setGoogleSubmitting(false);
    }
  };

  // SIGN UP SUBMIT
  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (serviceUnavailable || !supabase || submitting || !isSignupFormValid) return;

    clearCallbackError();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);

    setPendingName(trimmedName);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password, // Do not trim passwords
        options: {
          data: { full_name: trimmedName },
          emailRedirectTo: window.location.origin + '/'
        }
      });

      if (error) {
        const netOrRate = classifyNetworkOrRateError(error);
        if (netOrRate) {
          setErrorMsg(netOrRate.message);
          return;
        }
        // Anti-enumeration: for existing addresses or signup errors, show the same generic confirmation screen
        setSignupConfirmStep(true);
        setResendCooldown(60);
        setInfoMsg('If this email can be used, we sent you a message.');
        return;
      }

      if (data?.session) {
        triggerWelcomeToastOnce(data.session.user?.id);
        navigate(resolvePostLoginDest(), { replace: true });
        return;
      }

      setSignupConfirmStep(true);
      setResendCooldown(60);
      setInfoMsg('If this email can be used, we sent you a message.');
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // SIGN UP 6-DIGIT OTP VERIFY
  const handleVerifySignupOtp = async (e) => {
    e.preventDefault();
    if (serviceUnavailable || !supabase || submitting) return;
    const cleanToken = otpCode.trim();
    if (!/^\d{6}$/.test(cleanToken)) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: cleanToken,
        type: 'signup'
      });

      if (error) {
        const netOrRate = classifyNetworkOrRateError(error);
        setErrorMsg(
          netOrRate
            ? netOrRate.message
            : 'Invalid or expired verification code. Please check the code and try again.'
        );
        return;
      }

      if (data?.session) {
        triggerWelcomeToastOnce(data.session.user?.id);
        navigate(resolvePostLoginDest(), { replace: true });
      }
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // RESEND SIGNUP CONFIRMATION
  const handleResendSignup = async () => {
    if (serviceUnavailable || !supabase || resending || resendCooldown > 0 || !isEmailValid) return;
    setErrorMsg(null);
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: trimmedEmail
      });
      if (error) {
        const netOrRate = classifyNetworkOrRateError(error);
        if (netOrRate) {
          setErrorMsg(netOrRate.message);
          return;
        }
      }
      setResendCooldown(60);
      setInfoMsg('If this email can be used, we sent you a message.');
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
    } finally {
      setResending(false);
    }
  };

  // SIGN IN WITH PASSWORD
  const handleLoginPasswordSubmit = async (e) => {
    e.preventDefault();
    if (serviceUnavailable || !supabase || submitting) return;
    if (!isEmailValid || password.length === 0) {
      setErrorMsg('Incorrect email or password.');
      return;
    }

    clearCallbackError();
    setErrorMsg(null);
    setInfoMsg(null);
    setUnconfirmedEmail(false);
    setSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password // Do not trim passwords
      });

      if (error) {
        const netOrRate = classifyNetworkOrRateError(error);
        if (netOrRate) {
          setErrorMsg(netOrRate.message);
          return;
        }
        const msg = String(error.message || error.code || '').toLowerCase();
        if (msg.includes('email not confirmed') || error.code === 'email_not_confirmed') {
          setUnconfirmedEmail(true);
          setErrorMsg('Please confirm your email first');
          return;
        }
        setErrorMsg('Incorrect email or password.');
        return;
      }

      if (data?.session) {
        navigate(resolvePostLoginDest(), { replace: true });
      }
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // EMAIL ME A SIGN-IN CODE INSTEAD (SEND OTP)
  const handleSendLoginCode = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (serviceUnavailable || !supabase || submitting || resending) return;
    if (!isEmailValid) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    clearCallbackError();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + '/'
        }
      });

      if (error) {
        const netOrRate = classifyNetworkOrRateError(error);
        if (netOrRate && netOrRate.type === 'network') {
          setErrorMsg(netOrRate.message);
          return;
        }
        if (netOrRate && netOrRate.type === 'rate') {
          setErrorMsg(netOrRate.message);
          return;
        }
      }

      setLoginSubMode('email-code-verify');
      setResendCooldown(60);
      setInfoMsg('If an account exists for this email, we sent a 6-digit sign-in code.');
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // VERIFY 6-DIGIT EMAIL SIGN-IN CODE
  const handleVerifyLoginCode = async (e) => {
    e.preventDefault();
    if (serviceUnavailable || !supabase || submitting) return;
    const cleanToken = otpCode.trim();
    if (!/^\d{6}$/.test(cleanToken)) {
      setErrorMsg('Please enter the 6-digit sign-in code.');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: cleanToken,
        type: 'email'
      });

      if (error) {
        const netOrRate = classifyNetworkOrRateError(error);
        setErrorMsg(
          netOrRate
            ? netOrRate.message
            : 'Invalid or expired sign-in code. Please try again.'
        );
        return;
      }

      if (data?.session) {
        navigate(resolvePostLoginDest(), { replace: true });
      }
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // FORGOT PASSWORD SUBMIT
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (serviceUnavailable || !supabase || submitting) return;
    if (!isEmailValid) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    clearCallbackError();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      try {
        sessionStorage.setItem('cs_awaiting_recovery', '1');
      } catch {
        // Ignore storage errors
      }
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: window.location.origin + '/'
      });

      if (error) {
        const netOrRate = classifyNetworkOrRateError(error);
        if (netOrRate && netOrRate.type === 'network') {
          setErrorMsg(netOrRate.message);
          return;
        }
      }
      // Always show generic message so accounts cannot be guessed
      setInfoMsg('If an account exists, we sent a reset link.');
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // RESET PASSWORD SUBMIT
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (serviceUnavailable || !supabase || submitting) return;
    if (!pwEval.isValid) {
      setErrorMsg('Please meet all password requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    clearCallbackError();
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password // Do not trim passwords
      });

      if (error) {
        const netOrRate = classifyNetworkOrRateError(error);
        setErrorMsg(
          netOrRate
            ? netOrRate.message
            : 'Could not update your password. Your reset link may have expired.'
        );
        return;
      }

      setInfoMsg('Your password has been updated. Redirecting…');
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 900);
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeError = errorMsg || callbackError;

  return (
    <PageTransition>
      <div className="auth-split-page">
        {/* LEFT COLUMN (Desktop ~50%, hidden under 900px) */}
        <aside className="auth-split-left" aria-label="How Cyber Shield works">
          <div className="auth-left-top">
            <Link to="/" className="logo-link" aria-label="CyberShield Home">
              <Logo size={28} withWordmark={true} isDark={true} />
            </Link>
          </div>

          <div className="auth-left-center">
            <h2 className="auth-left-serif-heading">
              Three steps to a safer application
            </h2>

            <ol className="auth-steps-timeline">
              <li className="auth-step-item">
                <span className="auth-step-circle" aria-hidden="true">
                  1
                </span>
                <div className="auth-step-body">
                  <div className="auth-step-title">Paste the offer</div>
                  <p className="auth-step-desc">
                    Add the link, the recruiter email and the text.
                  </p>
                </div>
              </li>

              <li className="auth-step-item">
                <span className="auth-step-circle" aria-hidden="true">
                  2
                </span>
                <div className="auth-step-body">
                  <div className="auth-step-title">Five checks run together</div>
                  <p className="auth-step-desc">
                    Live evidence on the link, company, recruiter and more.
                  </p>
                </div>
              </li>

              <li className="auth-step-item">
                <span className="auth-step-circle" aria-hidden="true">
                  3
                </span>
                <div className="auth-step-body">
                  <div className="auth-step-title">Get a verdict and a Proof ID</div>
                  <p className="auth-step-desc">
                    You can prove later that the result was not changed.
                  </p>
                </div>
              </li>
            </ol>
          </div>

          <div className="auth-left-bottom" />
        </aside>

        {/* RIGHT COLUMN (Form centered, max-width 420px) */}
        <div className="auth-split-right">
          <div className="auth-form-container">
            <div className="auth-form-logo">
              <Link to="/" className="logo-link" aria-label="CyberShield Home">
                <Logo size={30} withWordmark={true} isDark={true} />
              </Link>
            </div>

            {/* Live region for every error or status message */}
            <div aria-live="polite" className="auth-live-region">
              {activeError && (
                <div className="login-status-alert login-status-error" role="alert">
                  <div>{activeError}</div>
                  {unconfirmedEmail && (
                    <div style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        className="auth-text-action-btn"
                        disabled={resending || resendCooldown > 0}
                        onClick={handleResendSignup}
                      >
                        {resendCooldown > 0
                          ? `Resend confirmation in ${resendCooldown}s`
                          : resending
                            ? 'Sending…'
                            : 'Resend confirmation email'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {infoMsg && (
                <div className="login-status-alert login-status-success" role="status">
                  {infoMsg}
                </div>
              )}
            </div>

            {/* Segmented Sign in / Sign up Mode Switcher at top of card */}
            {(resolvedView === 'login' || resolvedView === 'signup') && !signupConfirmStep && (
              <div className="auth-tab-switch" role="tablist" aria-label="Sign in or Sign up">
                <button
                  type="button"
                  role="tab"
                  id="auth-tab-login"
                  aria-selected={resolvedView === 'login'}
                  aria-controls="auth-view-content"
                  className={`auth-tab-btn ${resolvedView === 'login' ? 'active' : ''}`}
                  onClick={() => handleSwitchAuthMode('login')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  id="auth-tab-signup"
                  aria-selected={resolvedView === 'signup'}
                  aria-controls="auth-view-content"
                  className={`auth-tab-btn ${resolvedView === 'signup' ? 'active' : ''}`}
                  onClick={() => handleSwitchAuthMode('signup')}
                >
                  Create account
                </button>
              </div>
            )}

            {/* ==================== SIGN UP VIEW ==================== */}
            {resolvedView === 'signup' && !signupConfirmStep && (
              <>
                <h1 className="auth-heading">Create your account</h1>
                <p className="auth-subtitle">Free to use, no credit card needed.</p>

                <button
                  type="button"
                  disabled={serviceUnavailable || googleSubmitting || submitting}
                  onClick={handleGoogleAuth}
                  className="login-btn-google"
                >
                  <GoogleIcon />
                  <span>{googleSubmitting ? 'Redirecting…' : 'Sign up with Google'}</span>
                </button>

                <div className="login-or-divider">
                  <span>OR</span>
                </div>

                <form onSubmit={handleSignupSubmit} className="auth-form" noValidate>
                  <div className="auth-field">
                    <label htmlFor="signup-full-name" className="auth-label">
                      Full name
                    </label>
                    <input
                      id="signup-full-name"
                      type="text"
                      maxLength={60}
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      className="login-input-email"
                      disabled={serviceUnavailable || submitting}
                    />
                  </div>

                  <div className="auth-field">
                    <label htmlFor="signup-email" className="auth-label">
                      Email address
                    </label>
                    <input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="login-input-email"
                      disabled={serviceUnavailable || submitting}
                    />
                  </div>

                  <div className="auth-field">
                    <label htmlFor="signup-password" className="auth-label">
                      Create your password
                    </label>
                    <div className="auth-password-wrap">
                      <input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="login-input-email auth-input-with-eye"
                        disabled={serviceUnavailable || submitting}
                      />
                      <button
                        type="button"
                        className="auth-eye-btn"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <PasswordChecklist evalResult={pwEval} />
                  </div>

                  <div className="auth-checkbox-row">
                    <input
                      id="signup-terms-checkbox"
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      disabled={serviceUnavailable || submitting}
                    />
                    <label htmlFor="signup-terms-checkbox" className="auth-checkbox-label">
                      I agree to the{' '}
                      <a
                        href="#/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="auth-inline-legal-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Terms
                      </a>{' '}
                      and{' '}
                      <a
                        href="#/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="auth-inline-legal-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Privacy Policy
                      </a>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={serviceUnavailable || !isSignupFormValid || submitting || googleSubmitting}
                    className="login-btn-magic"
                  >
                    {submitting ? 'Creating account…' : 'Create your account'}
                  </button>
                </form>

                <div className="login-signup-row">
                  <span>Already have an account?</span>{' '}
                  <button
                    type="button"
                    onClick={() => handleSwitchAuthMode('login')}
                    className="login-signup-link login-signup-btn-link"
                  >
                    Sign in
                  </button>
                </div>
              </>
            )}

            {/* ==================== SIGN UP CHECK YOUR EMAIL STEP ==================== */}
            {resolvedView === 'signup' && signupConfirmStep && (
              <>
                <h1 className="auth-heading">Check your email</h1>
                <p className="auth-subtitle">
                  We sent a verification message to <strong>{trimmedEmail}</strong>.
                </p>

                <form onSubmit={handleVerifySignupOtp} className="auth-form" noValidate>
                  <div className="auth-field">
                    <label htmlFor="signup-otp-input" className="auth-label">
                      6-digit verification code
                    </label>
                    <input
                      id="signup-otp-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="login-input-email"
                      disabled={submitting}
                    />
                  </div>

                  <p className="auth-helper-line">
                    or open the link in this same browser
                  </p>

                  <button
                    type="submit"
                    disabled={submitting || otpCode.trim().length !== 6}
                    className="login-btn-magic"
                  >
                    {submitting ? 'Verifying…' : 'Verify code'}
                  </button>
                </form>

                <div className="auth-secondary-actions">
                  <button
                    type="button"
                    className="auth-text-action-btn"
                    disabled={resending || resendCooldown > 0}
                    onClick={handleResendSignup}
                  >
                    {resendCooldown > 0
                      ? `Resend (${resendCooldown}s)`
                      : resending
                        ? 'Resending…'
                        : 'Resend'}
                  </button>
                  <button
                    type="button"
                    className="auth-text-action-btn"
                    onClick={() => {
                      setSignupConfirmStep(false);
                      setOtpCode('');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                  >
                    Use a different email
                  </button>
                </div>
              </>
            )}

            {/* ==================== LOG IN VIEW ==================== */}
            {resolvedView === 'login' && (
              <>
                <h1 className="auth-heading">Welcome back</h1>
                <p className="auth-subtitle">Sign in to your Cyber Shield account.</p>

                <button
                  type="button"
                  disabled={serviceUnavailable || googleSubmitting || submitting}
                  onClick={handleGoogleAuth}
                  className="login-btn-google"
                >
                  <GoogleIcon />
                  <span>{googleSubmitting ? 'Redirecting…' : 'Continue with Google'}</span>
                </button>

                <div className="login-or-divider">
                  <span>OR</span>
                </div>

                {loginSubMode === 'password' && (
                  <form onSubmit={handleLoginPasswordSubmit} className="auth-form" noValidate>
                    <div className="auth-field">
                      <label htmlFor="login-email" className="auth-label">
                        Email address
                      </label>
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="login-input-email"
                        disabled={serviceUnavailable || submitting}
                      />
                    </div>

                    <div className="auth-field">
                      <div className="auth-label-row">
                        <label htmlFor="login-password" className="auth-label">
                          Password
                        </label>
                        <Link to="/forgot-password" className="auth-forgot-link">
                          Forgot password?
                        </Link>
                      </div>
                      <div className="auth-password-wrap">
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Your password"
                          className="login-input-email auth-input-with-eye"
                          disabled={serviceUnavailable || submitting}
                        />
                        <button
                          type="button"
                          className="auth-eye-btn"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          aria-pressed={showPassword}
                          onClick={() => setShowPassword((v) => !v)}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={serviceUnavailable || submitting || googleSubmitting}
                      className="login-btn-magic"
                    >
                      {submitting ? 'Signing in…' : 'Sign in'}
                    </button>

                    <div className="auth-center-links">
                      <button
                        type="button"
                        className="auth-text-action-btn"
                        onClick={() => {
                          setErrorMsg(null);
                          setInfoMsg(null);
                          setLoginSubMode('email-code-request');
                        }}
                      >
                        Email me a sign-in code instead
                      </button>
                      <p className="auth-google-pw-hint">
                        Signed up with Google? Use <Link to="/forgot-password">Forgot password</Link> to add a password.
                      </p>
                    </div>
                  </form>
                )}

                {loginSubMode === 'email-code-request' && (
                  <form onSubmit={handleSendLoginCode} className="auth-form" noValidate>
                    <div className="auth-field">
                      <label htmlFor="login-code-email" className="auth-label">
                        Email address
                      </label>
                      <input
                        id="login-code-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="login-input-email"
                        disabled={serviceUnavailable || submitting}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={serviceUnavailable || submitting || !isEmailValid}
                      className="login-btn-magic"
                    >
                      {submitting ? 'Sending code…' : 'Send sign-in code'}
                    </button>

                    <div className="auth-center-links">
                      <button
                        type="button"
                        className="auth-text-action-btn"
                        onClick={() => {
                          setErrorMsg(null);
                          setInfoMsg(null);
                          setLoginSubMode('password');
                        }}
                      >
                        Sign in with password instead
                      </button>
                    </div>
                  </form>
                )}

                {loginSubMode === 'email-code-verify' && (
                  <form onSubmit={handleVerifyLoginCode} className="auth-form" noValidate>
                    <div className="auth-field">
                      <label htmlFor="login-otp-input" className="auth-label">
                        6-digit sign-in code
                      </label>
                      <input
                        id="login-otp-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="one-time-code"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        className="login-input-email"
                        disabled={submitting}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting || otpCode.trim().length !== 6}
                      className="login-btn-magic"
                    >
                      {submitting ? 'Verifying…' : 'Verify & sign in'}
                    </button>

                    <div className="auth-secondary-actions">
                      <button
                        type="button"
                        className="auth-text-action-btn"
                        disabled={submitting || resendCooldown > 0}
                        onClick={handleSendLoginCode}
                      >
                        {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend code'}
                      </button>
                      <button
                        type="button"
                        className="auth-text-action-btn"
                        onClick={() => {
                          setOtpCode('');
                          setErrorMsg(null);
                          setInfoMsg(null);
                          setLoginSubMode('password');
                        }}
                      >
                        Use password instead
                      </button>
                    </div>
                  </form>
                )}

                <div className="login-signup-row">
                  <span>New here?</span>{' '}
                  <button
                    type="button"
                    onClick={() => handleSwitchAuthMode('signup')}
                    className="login-signup-link login-signup-btn-link"
                  >
                    Create an account
                  </button>
                </div>
              </>
            )}

            {/* ==================== FORGOT PASSWORD VIEW ==================== */}
            {resolvedView === 'forgot' && (
              <>
                <h1 className="auth-heading">Forgot password</h1>
                <p className="auth-subtitle">
                  Enter your email address and we&rsquo;ll send you a reset link.
                </p>

                <form onSubmit={handleForgotSubmit} className="auth-form" noValidate>
                  <div className="auth-field">
                    <label htmlFor="forgot-email" className="auth-label">
                      Email address
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="login-input-email"
                      disabled={serviceUnavailable || submitting}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={serviceUnavailable || submitting || !isEmailValid}
                    className="login-btn-magic"
                  >
                    {submitting ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>

                <div className="login-signup-row">
                  <span>Remembered your password?</span>{' '}
                  <Link to="/login" className="login-signup-link">
                    Sign in
                  </Link>
                </div>
              </>
            )}

            {/* ==================== RESET PASSWORD VIEW ==================== */}
            {resolvedView === 'reset' && (
              <>
                <h1 className="auth-heading">Reset your password</h1>
                <p className="auth-subtitle">
                  Enter and confirm your new password below.
                </p>

                <form onSubmit={handleResetSubmit} className="auth-form" noValidate>
                  <div className="auth-field">
                    <label htmlFor="reset-new-password" className="auth-label">
                      New password
                    </label>
                    <div className="auth-password-wrap">
                      <input
                        id="reset-new-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="login-input-email auth-input-with-eye"
                        disabled={serviceUnavailable || submitting}
                      />
                      <button
                        type="button"
                        className="auth-eye-btn"
                        aria-label={showPassword ? 'Hide new password' : 'Show new password'}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <PasswordChecklist evalResult={pwEval} />
                  </div>

                  <div className="auth-field">
                    <label htmlFor="reset-confirm-password" className="auth-label">
                      Confirm password
                    </label>
                    <div className="auth-password-wrap">
                      <input
                        id="reset-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        className="login-input-email auth-input-with-eye"
                        disabled={serviceUnavailable || submitting}
                      />
                      <button
                        type="button"
                        className="auth-eye-btn"
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        aria-pressed={showConfirmPassword}
                        onClick={() => setShowConfirmPassword((v) => !v)}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={serviceUnavailable || submitting || !isResetFormValid}
                    className="login-btn-magic"
                  >
                    {submitting ? 'Updating…' : 'Update password'}
                  </button>
                </form>

                <div className="login-signup-row">
                  <Link to="/login" className="login-signup-link">
                    Back to sign in
                  </Link>
                </div>
              </>
            )}

            {/* Small Privacy and Terms links */}
            <div className="login-bottom-bar">
              <div className="login-legal-links">
                <Link to="/privacy">Privacy</Link>
                <span aria-hidden="true">&bull;</span>
                <Link to="/terms">Terms</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

export default Login;
