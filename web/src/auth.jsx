import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { apiFetch, setAuthToken, setOnUnauthorized } from './api';
import { addToast } from './components/Toast';

export function getDisplayName(profile, session) {
  const custom = typeof profile?.display_name === 'string' ? profile.display_name.trim() : '';
  if (custom) {
    return custom;
  }
  const email = String(profile?.email || session?.user?.email || '').trim();
  if (email.includes('@')) {
    const localPart = email.split('@')[0].trim();
    if (localPart.length > 0) {
      return localPart.charAt(0).toUpperCase() + localPart.slice(1);
    }
  }
  return 'Account';
}

export function getShortDisplayName(displayName, maxChars = 14) {
  const str = String(displayName || 'Account');
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + '\u2026';
}

export function UserAvatar({ profile, session, size = 22, className = '' }) {
  const avatarUrl =
    (typeof profile?.avatar_url === 'string' && profile.avatar_url.trim()) ||
    (typeof session?.user?.user_metadata?.avatar_url === 'string' &&
      session.user.user_metadata.avatar_url.trim()) ||
      null;

  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const displayName = getDisplayName(profile, session);
  const initial = (displayName.charAt(0) || 'A').toUpperCase();

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={className}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0
        }}
      />
    );
  }

  return (
    <span
      className={`avatar-initial-badge ${className}`.trim()}
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${Math.max(10, Math.round(size * 0.5))}px`,
        fontWeight: 700,
        background: 'rgba(34, 211, 238, 0.16)',
        color: 'var(--accent-cyan, #22D3EE)',
        border: '1px solid rgba(34, 211, 238, 0.32)',
        flexShrink: 0,
        lineHeight: 1
      }}
    >
      {initial}
    </span>
  );
}

export function getPendingName() {
  try {
    const val = localStorage.getItem('pendingName');
    return typeof val === 'string' ? val.trim() : '';
  } catch {
    return '';
  }
}

export function setPendingName(name) {
  try {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed) {
      localStorage.setItem('pendingName', trimmed);
    } else {
      localStorage.removeItem('pendingName');
    }
  } catch {
    // Ignore storage errors
  }
}

export function clearPendingName() {
  try {
    localStorage.removeItem('pendingName');
  } catch {
    // Ignore storage errors
  }
}

export function isValidReturnPath(path) {
  if (typeof path !== 'string') return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;
  if (
    trimmed.startsWith('/login') ||
    trimmed.startsWith('/signup') ||
    trimmed.startsWith('/forgot-password') ||
    trimmed.startsWith('/reset-password')
  ) {
    return false;
  }
  return true;
}

export function setReturnTo(path) {
  try {
    if (isValidReturnPath(path)) {
      sessionStorage.setItem('cs_return_to', path.trim());
    }
  } catch {
    // Ignore storage errors
  }
}

export function consumeReturnTo() {
  try {
    const val = sessionStorage.getItem('cs_return_to');
    sessionStorage.removeItem('cs_return_to');
    if (isValidReturnPath(val)) {
      return val.trim();
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function triggerWelcomeToastOnce(userId) {
  const key = `cs_welcomed_${userId || 'new'}`;
  try {
    if (localStorage.getItem(key) === '1') return;
    localStorage.setItem(key, '1');
  } catch {
    // Ignore storage errors
  }
  setTimeout(() => {
    addToast('Account created. Welcome!');
  }, 80);
}

function maybeWelcomeBrandNewUser(user, profile) {
  const userId = profile?.id || user?.id;
  if (!userId) return;
  const createdStr = user?.created_at || profile?.created_at;
  if (!createdStr) return;
  const createdMs = new Date(createdStr).getTime();
  if (!Number.isNaN(createdMs) && Date.now() - createdMs < 90000) {
    triggerWelcomeToastOnce(userId);
  }
}

const AuthContext = createContext({
  configLoaded: false,
  authReady: false,
  authAvailable: false,
  supabase: null,
  session: null,
  profile: null,
  callbackError: null,
  clearCallbackError: () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  updateDisplayName: async () => {}
});

// Capture initial URL parameters before any router or client mutations (consumed once)
const initialSearchParams = new URLSearchParams(window.location.search);
let initialCode = initialSearchParams.get('code');
const initialType = initialSearchParams.get('type');
let initialAuthError =
  initialSearchParams.get('error_description') || initialSearchParams.get('error');

// Singleton startup promise so /api/config-public is fetched strictly once
let startupInitPromise = null;
let supabaseInstance = null;

async function initAuthConfigOnce() {
  if (startupInitPromise) {
    return startupInitPromise;
  }

  startupInitPromise = (async () => {
    let cfg;
    try {
      cfg = await apiFetch('/api/config-public');
    } catch (err) {
      console.error('Auth setup failed: could not fetch /api/config-public.', err?.message || '');
      return { authAvailable: false, supabase: null, config: null };
    }

    if (!cfg || typeof cfg !== 'object') {
      console.error('Auth setup failed: /api/config-public returned an empty or non-object response.');
      return { authAvailable: false, supabase: null, config: null };
    }

    if (cfg.authEnabled === false) {
      console.error('Auth setup failed: authEnabled is false.');
      return { authAvailable: false, supabase: null, config: cfg };
    }

    if (typeof cfg.supabaseUrl !== 'string' || cfg.supabaseUrl.trim() === '') {
      console.error('Auth setup failed: supabaseUrl is missing or empty.');
      return { authAvailable: false, supabase: null, config: cfg };
    }

    if (typeof cfg.supabasePublishableKey !== 'string' || cfg.supabasePublishableKey.trim() === '') {
      console.error('Auth setup failed: supabasePublishableKey is missing or empty.');
      return { authAvailable: false, supabase: null, config: cfg };
    }

    if (!supabaseInstance) {
      supabaseInstance = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true
        }
      });
    }

    return {
      authAvailable: true,
      supabase: supabaseInstance,
      config: cfg
    };
  })();

  return startupInitPromise;
}

function getSkipStorageKey(userId) {
  return `cs_name_prompt_skipped_${userId || 'current'}`;
}

function isPromptSkippedInSession(userId) {
  try {
    return sessionStorage.getItem(getSkipStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

function markPromptSkippedInSession(userId) {
  try {
    sessionStorage.setItem(getSkipStorageKey(userId), '1');
  } catch {
    // Ignore sessionStorage errors in restricted environments
  }
}

function clearPromptSkippedInSession(userId) {
  try {
    sessionStorage.removeItem(getSkipStorageKey(userId));
    sessionStorage.removeItem(getSkipStorageKey('current'));
  } catch {
    // Ignore sessionStorage errors
  }
}

function consumeAwaitingRecoveryFlag() {
  try {
    const val = sessionStorage.getItem('cs_awaiting_recovery');
    if (val === '1') {
      sessionStorage.removeItem('cs_awaiting_recovery');
      return true;
    }
  } catch {
    // Ignore sessionStorage errors
  }
  return false;
}

function FirstLoginNameDialog({ onSave, onSkip }) {
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const dialogRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSkip]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const trimmed = nameInput.trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
      setErrorMsg('Please enter a name between 1 and 60 characters.');
      return;
    }
    setErrorMsg(null);
    setSaving(true);
    try {
      await onSave(trimmed);
    } catch {
      setErrorMsg('Could not save your display name right now. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="name-prompt-overlay" role="presentation" onClick={onSkip}>
      <div
        className="name-prompt-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-prompt-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="name-prompt-title" className="name-prompt-title">
          What should we call you?
        </h2>
        <form onSubmit={handleSubmit} className="name-prompt-form">
          <label htmlFor="name-prompt-input" className="sr-only">
            Display name
          </label>
          <input
            ref={inputRef}
            id="name-prompt-input"
            type="text"
            maxLength={60}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your display name"
            className="login-input-email"
            disabled={saving}
            autoComplete="name"
          />
          <div aria-live="polite">
            {errorMsg && (
              <div className="login-status-alert login-status-error" role="alert">
                {errorMsg}
              </div>
            )}
          </div>
          <div className="name-prompt-actions">
            <button
              type="submit"
              className="login-btn-magic"
              disabled={saving}
            >
              {saving ? 'Saving\u2026' : 'Save'}
            </button>
            <button
              type="button"
              className="name-prompt-skip-link"
              onClick={onSkip}
              disabled={saving}
            >
              Skip
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AuthProvider({ children }) {
  const [configLoaded, setConfigLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authAvailable, setAuthAvailable] = useState(false);
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [callbackLoading, setCallbackLoading] = useState(
    Boolean(initialCode || initialAuthError)
  );
  const [callbackError, setCallbackError] = useState(null);

  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const recoveryDetectedRef = useRef(
    initialType === 'recovery' || window.location.hash.startsWith('#/reset-password')
  );

  const fetchMe = useCallback(async (accessToken, authUser) => {
    if (!accessToken) {
      setProfile(null);
      setShowNamePrompt(false);
      return null;
    }
    setAuthToken(accessToken);
    try {
      let me = await apiFetch('/api/me');
      if (me && typeof me === 'object') {
        let hasDisplayName =
          typeof me.display_name === 'string' && me.display_name.trim().length > 0;
        const pending = getPendingName();

        if (!hasDisplayName && pending) {
          const validPending = pending.slice(0, 60).trim();
          clearPendingName();
          if (validPending.length >= 1) {
            try {
              const patched = await apiFetch('/api/me', {
                method: 'PATCH',
                body: JSON.stringify({ display_name: validPending })
              });
              me = {
                ...me,
                ...(patched && typeof patched === 'object' ? patched : {}),
                display_name: validPending
              };
              hasDisplayName = true;
            } catch {
              // If PATCH fails, fall through to prompt
            }
          }
        } else if (pending) {
          clearPendingName();
        }

        setProfile(me);
        maybeWelcomeBrandNewUser(authUser, me);

        const resolvedId = me.id || authUser?.id;
        if (!hasDisplayName && !isPromptSkippedInSession(resolvedId) && !recoveryDetectedRef.current) {
          setShowNamePrompt(true);
        } else {
          setShowNamePrompt(false);
        }
        return me;
      }
    } catch (err) {
      console.error('Failed to fetch /api/me:', err?.message || 'Unknown error');
    }
    return null;
  }, []);

  useEffect(() => {
    let mounted = true;
    let subscription = null;

    async function setup() {
      const codeOnBoot = initialCode;
      const authErrOnBoot = initialAuthError;
      initialCode = null;
      initialAuthError = null;

      const { authAvailable: available, supabase: client } = await initAuthConfigOnce();
      if (!mounted) return;

      setAuthAvailable(available);
      setSupabase(client);
      setConfigLoaded(true);

      if (authErrOnBoot) {
        window.history.replaceState({}, document.title, window.location.pathname + '#/login');
        setCallbackError('Sign-in was cancelled or could not be completed. Please try again.');
        setCallbackLoading(false);
        setAuthReady(true);
        navigateRef.current('/login', { replace: true });
        return;
      }

      if (!available || !client) {
        if (codeOnBoot) {
          window.history.replaceState({}, document.title, window.location.pathname + '#/login');
          setCallbackError('Sign-in service is currently unavailable. Please try again later.');
          setCallbackLoading(false);
          navigateRef.current('/login', { replace: true });
        }
        setAuthReady(true);
        return;
      }

      const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
        if (!mounted) return;
        const token = nextSession?.access_token || null;
        setAuthToken(token);
        setSession(nextSession || null);

        if (event === 'PASSWORD_RECOVERY') {
          recoveryDetectedRef.current = true;
          setShowNamePrompt(false);
          window.history.replaceState({}, document.title, window.location.pathname + '#/reset-password');
          setCallbackLoading(false);
          setAuthReady(true);
          navigateRef.current('/reset-password', { replace: true });
        }

        if (token) {
          fetchMe(token, nextSession?.user);
        } else {
          setProfile(null);
          setShowNamePrompt(false);
        }
      });
      subscription = listener?.subscription;

      try {
        let { data, error } = await client.auth.getSession();

        // Fallback if ?code= is still in the URL and session was not yet exchanged
        if (!data?.session && !error && codeOnBoot) {
          const currentParams = new URLSearchParams(window.location.search);
          const stillHasCode = currentParams.get('code');
          if (stillHasCode) {
            const exchanged = await client.auth.exchangeCodeForSession(stillHasCode);
            data = exchanged.data;
            error = exchanged.error;
          }
        }

        if (!mounted) return;

        if (codeOnBoot) {
          if (error || !data?.session) {
            console.error('Auth callback failed:', error?.message || 'No session returned after code exchange.');
            window.history.replaceState({}, document.title, window.location.pathname + '#/login');
            setCallbackError('Your sign-in link has expired or could not be verified. Please try signing in again.');
            setCallbackLoading(false);
            setAuthReady(true);
            navigateRef.current('/login', { replace: true });
            return;
          }

          const activeSession = data.session;
          setAuthToken(activeSession.access_token);
          setSession(activeSession);

          const isRecovery =
            recoveryDetectedRef.current || consumeAwaitingRecoveryFlag();
          if (isRecovery) {
            recoveryDetectedRef.current = true;
            await fetchMe(activeSession.access_token, activeSession?.user);
            window.history.replaceState({}, document.title, window.location.pathname + '#/reset-password');
            setCallbackLoading(false);
            setAuthReady(true);
            navigateRef.current('/reset-password', { replace: true });
            return;
          }

          await fetchMe(activeSession.access_token, activeSession?.user);
          const dest = consumeReturnTo() || '/dashboard';
          window.history.replaceState({}, document.title, window.location.pathname + '#' + dest);
          setCallbackLoading(false);
          setAuthReady(true);
          navigateRef.current(dest, { replace: true });
          return;
        }

        if (data?.session) {
          setAuthToken(data.session.access_token);
          setSession(data.session);
          await fetchMe(data.session.access_token, data.session?.user);
        } else {
          setAuthToken(null);
          setSession(null);
          setProfile(null);
          setShowNamePrompt(false);
        }
        if (mounted) {
          setAuthReady(true);
        }
      } catch (err) {
        console.error('Unexpected error during auth session initialization:', err?.message || '');
        if (mounted) {
          setAuthReady(true);
          if (codeOnBoot) {
            window.history.replaceState({}, document.title, window.location.pathname + '#/login');
            setCallbackError('An unexpected error occurred while completing sign-in. Please try again.');
            setCallbackLoading(false);
            navigateRef.current('/login', { replace: true });
          }
        }
      }
    }

    setup();

    return () => {
      mounted = false;
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [fetchMe]);

  const updateDisplayName = useCallback(async (newDisplayName) => {
    const trimmed = String(newDisplayName || '').trim();
    const updated = await apiFetch('/api/me', {
      method: 'PATCH',
      body: JSON.stringify({ display_name: trimmed })
    });
    setProfile((prev) => ({
      ...(prev || {}),
      ...(updated && typeof updated === 'object' ? updated : {}),
      display_name: trimmed
    }));
    setShowNamePrompt(false);
    return updated;
  }, []);

  const handleSkipNamePrompt = useCallback(() => {
    const userId = profile?.id || session?.user?.id;
    markPromptSkippedInSession(userId);
    setShowNamePrompt(false);
  }, [profile, session]);

  const signOut = useCallback(async () => {
    const userId = profile?.id || session?.user?.id;
    clearPromptSkippedInSession(userId);
    setAuthToken(null);
    setSession(null);
    setProfile(null);
    setShowNamePrompt(false);
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Error signing out:', err?.message || '');
      }
    }
  }, [supabase, profile, session]);

  // On a 401 response from any user API route, sign out with a message
  useEffect(() => {
    setOnUnauthorized((msg) => {
      const notice = msg || 'Your session expired. Please sign in again.';
      signOut();
      setCallbackError(notice);
      addToast(notice);
      navigateRef.current('/login', { replace: true });
    });
    return () => setOnUnauthorized(null);
  }, [signOut]);

  const clearCallbackError = useCallback(() => {
    setCallbackError(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.access_token) {
      return fetchMe(session.access_token, session?.user);
    }
    return null;
  }, [session, fetchMe]);

  if (callbackLoading) {
    return (
      <div
        className="login-fullscreen-wrap"
        role="status"
        aria-live="polite"
        aria-label="Completing sign-in"
      >
        <div className="login-column-380">
          <div className="login-card-main">
            <div className="spinner" style={{ margin: '8px auto' }} />
            <h1 className="login-h1">Completing sign-in&hellip;</h1>
            <p className="login-purpose-text">
              Please wait while we verify your session.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        configLoaded,
        authReady,
        authAvailable,
        supabase,
        session,
        profile,
        callbackError,
        clearCallbackError,
        signOut,
        refreshProfile,
        updateDisplayName
      }}
    >
      {children}
      {session && showNamePrompt && (
        <FirstLoginNameDialog
          onSave={updateDisplayName}
          onSkip={handleSkipNamePrompt}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
