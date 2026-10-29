/**
 * Billing & Upgrade Integration
 * Single source of truth for payment flows, Razorpay checkout, and billing state.
 */

import { apiFetch } from '../api';
import { setReturnTo } from '../auth';
import { triggerUsageRefresh } from './useUsage';
import { useState, useEffect, useCallback } from 'react';

export const BILLING_EVENT = 'cs:billing-updated';

let cachedSession = null;
let isUpgradeInProgress = false;
let razorpayScriptPromise = null;

/**
 * Cache current auth session reference so billing functions can inspect auth status.
 */
export function setBillingSession(session) {
  cachedSession = session || null;
}

/**
 * Dispatches an event so all components observing billing refresh their state.
 */
export function triggerBillingRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BILLING_EVENT));
  }
}

/**
 * Formats an ISO expiration date string into human-readable text like "28 Nov 2026".
 */
export function formatExpiryDate(isoString) {
  if (!isoString) return 'in 30 days';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'in 30 days';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);
  } catch {
    return 'in 30 days';
  }
}

/**
 * Dynamically loads Razorpay checkout script ON DEMAND only.
 * Never called on normal page loads.
 */
export function loadRazorpayScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window unavailable'));
  if (typeof window.Razorpay === 'function') {
    return Promise.resolve(window.Razorpay);
  }
  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise((resolve, reject) => {
    // Check if script tag is already in DOM
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Razorpay));
      existing.addEventListener('error', (e) => reject(new Error('Failed to load Razorpay script')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      if (typeof window.Razorpay === 'function') {
        resolve(window.Razorpay);
      } else {
        reject(new Error('Razorpay SDK failed to initialize'));
      }
    };
    script.onerror = () => {
      razorpayScriptPromise = null;
      reject(new Error('Network error loading Razorpay checkout script'));
    };
    document.head.appendChild(script);
  });

  return razorpayScriptPromise;
}

/**
 * Renders an accessible notification modal (Success / Notice / Error).
 */
export function showNotificationModal({
  title,
  message,
  type = 'info',
  isTestMode = false,
  onClose
}) {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById('cs-billing-modal');
  if (existing) existing.remove();

  const previousActive = document.activeElement;
  const originalOverflow = document.body.style.overflow;

  const backdrop = document.createElement('div');
  backdrop.id = 'cs-billing-modal';
  backdrop.className = 'upgrade-modal-backdrop';
  backdrop.setAttribute('role', 'presentation');

  const isSuccess = type === 'success';
  const iconColor = isSuccess ? '#34D399' : type === 'warning' ? '#F59E0B' : '#4DA3FF';

  backdrop.innerHTML = `
    <div
      class="upgrade-modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cs-billing-modal-title"
    >
      <button
        type="button"
        class="upgrade-modal-close"
        id="cs-billing-close-x"
        aria-label="Close dialog"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div class="upgrade-modal-header">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            ${
              isSuccess
                ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
                : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
            }
          </svg>
          <h3 id="cs-billing-modal-title" style="margin:0;">${title}</h3>
        </div>
        <p class="upgrade-modal-message">${message}</p>
        ${
          isTestMode
            ? '<p style="font-size:12.5px; color:var(--brand, #4DA3FF); margin:12px 0 0; background:rgba(77,163,255,0.1); padding:6px 10px; border-radius:6px; border:1px solid rgba(77,163,255,0.25);">Test mode: no real money is charged.</p>'
            : ''
        }
      </div>

      <div class="upgrade-modal-actions">
        <button
          type="button"
          class="btn-card-primary"
          id="cs-billing-close-btn"
        >
          Got it
        </button>
      </div>
    </div>
  `;

  function cleanup() {
    window.removeEventListener('keydown', handleKey);
    if (backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
    document.body.style.overflow = originalOverflow;
    if (previousActive && typeof previousActive.focus === 'function') {
      try {
        previousActive.focus();
      } catch {}
    }
    if (typeof onClose === 'function') onClose();
  }

  function handleKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    }
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) cleanup();
  });

  window.addEventListener('keydown', handleKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(backdrop);

  const closeX = backdrop.querySelector('#cs-billing-close-x');
  const closeBtn = backdrop.querySelector('#cs-billing-close-btn');
  if (closeX) closeX.addEventListener('click', cleanup);
  if (closeBtn) {
    closeBtn.addEventListener('click', cleanup);
    setTimeout(() => {
      try {
        closeBtn.focus();
      } catch {}
    }, 40);
  }

  return { close: cleanup };
}

/**
 * Initiates upgrade or pass extension flow.
 * - Redirects to /login if user is signed out.
 * - Calls POST /api/billing/create-order.
 * - Lazy-loads Razorpay SDK.
 * - Opens checkout modal and handles verification or cancellation.
 */
export async function startUpgrade(options = {}) {
  // If payment is currently active, ignore duplicate clicks
  if (isUpgradeInProgress) {
    return { busy: true };
  }

  const session = options.session || cachedSession;
  const userEmail =
    options.email ||
    session?.user?.email ||
    options.user?.email ||
    '';

  // 1. Signed out: redirect to sign-in and return to #/pricing afterwards
  if (!session && !userEmail) {
    // Check if session token exists in localStorage (e.g. Supabase auth token)
    let hasLocalAuth = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          hasLocalAuth = true;
          break;
        }
      }
    } catch {}

    if (!hasLocalAuth) {
      setReturnTo('/pricing');
      if (typeof window !== 'undefined') {
        window.location.hash = '#/login?returnTo=/pricing';
      }
      return { redirected: true };
    }
  }

  isUpgradeInProgress = true;
  if (typeof options.onProgress === 'function') {
    options.onProgress(true);
  }

  try {
    // 2. Call create-order on backend
    const order = await apiFetch('/api/billing/create-order', { method: 'POST' });
    if (!order || !order.orderId || !order.keyId) {
      throw new Error('Invalid order response from server');
    }

    // 3. Lazy-load Razorpay checkout script ONLY at this moment
    const RazorpaySdk = await loadRazorpayScript();

    // 4. Initialize Razorpay Checkout
    const rzpOptions = {
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Cyber Shield',
      description: 'Pro: 30-day pass',
      prefill: {
        email: userEmail
      },
      theme: {
        color: '#0A66C2' // accent blue token
      },
      modal: {
        ondismiss: function () {
          isUpgradeInProgress = false;
          if (typeof options.onProgress === 'function') {
            options.onProgress(false);
          }
          if (typeof options.onDismiss === 'function') {
            options.onDismiss();
          }
          showNotificationModal({
            title: 'Payment Incomplete',
            message: 'Checkout was cancelled. No charges were made.',
            type: 'info'
          });
        }
      },
      handler: async function (paymentResp) {
        try {
          // Send verification fields to server
          const verifyResult = await apiFetch('/api/billing/verify', {
            method: 'POST',
            body: JSON.stringify({
              razorpay_order_id: paymentResp.razorpay_order_id,
              razorpay_payment_id: paymentResp.razorpay_payment_id,
              razorpay_signature: paymentResp.razorpay_signature
            })
          });

          // Refresh entitlements across UI
          triggerUsageRefresh();
          triggerBillingRefresh();

          const expiryDateFormatted = formatExpiryDate(verifyResult.expiresAt);
          const isTest = verifyResult.paymentsMode === 'test' || order.keyId.startsWith('rzp_test_');

          showNotificationModal({
            title: 'Pro Activated',
            message: `Pro is active until ${expiryDateFormatted}. Up to 100 checks.`,
            type: 'success',
            isTestMode: isTest
          });

          if (typeof options.onSuccess === 'function') {
            options.onSuccess(verifyResult);
          }
        } catch (verifyErr) {
          console.error('[Billing] Payment verification failed:', verifyErr);
          // Calm error message: "If money was debited it will be applied after verification. Contact us with your order id."
          // Do NOT set Pro locally!
          const orderIdToShow = paymentResp?.razorpay_order_id || order.orderId;
          showNotificationModal({
            title: 'Verification In Progress',
            message: `If money was debited it will be applied after verification. Contact us with your order id: ${orderIdToShow}`,
            type: 'warning'
          });
          if (typeof options.onError === 'function') {
            options.onError(verifyErr);
          }
        } finally {
          isUpgradeInProgress = false;
          if (typeof options.onProgress === 'function') {
            options.onProgress(false);
          }
        }
      }
    };

    const rzp = new RazorpaySdk(rzpOptions);

    rzp.on('payment.failed', function (failureData) {
      isUpgradeInProgress = false;
      if (typeof options.onProgress === 'function') {
        options.onProgress(false);
      }
      const failReason = failureData?.error?.description || 'Payment was not completed.';
      showNotificationModal({
        title: 'Payment Failed',
        message: `${failReason} No charges were completed. You can try again.`,
        type: 'error'
      });
      if (typeof options.onError === 'function') {
        options.onError(failureData?.error);
      }
    });

    rzp.open();
  } catch (err) {
    isUpgradeInProgress = false;
    if (typeof options.onProgress === 'function') {
      options.onProgress(false);
    }

    if (err?.status === 401) {
      setReturnTo('/pricing');
      if (typeof window !== 'undefined') {
        window.location.hash = '#/login?returnTo=/pricing';
      }
      return { redirected: true };
    }

    const isUnavailable =
      err?.status === 503 ||
      String(err?.message || '').toLowerCase().includes('payments_unavailable');

    showNotificationModal({
      title: isUnavailable ? 'Payments Unavailable' : 'Unable to Start Checkout',
      message: isUnavailable
        ? 'Payments are temporarily unavailable right now. Please try again later.'
        : (err?.message || 'Could not initiate payment session. Please try again.'),
      type: isUnavailable ? 'info' : 'error'
    });

    if (typeof options.onError === 'function') {
      options.onError(err);
    }
  }
}

/**
 * React Hook to track billing status, current plan, expiry, check limits and test mode.
 * Auto-refreshes on cs:usage-updated, cs:billing-updated, and window focus.
 */
export function useBillingStatus(session) {
  if (session !== undefined) {
    setBillingSession(session);
  }

  const [status, setStatus] = useState({
    plan: 'free',
    expiresAt: null,
    daysLeft: 0,
    checksUsed: 0,
    checksLimit: 5,
    paymentsMode: 'test'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      // If user is authenticated, query /api/billing/status
      const data = await apiFetch('/api/billing/status');
      if (data) {
        setStatus(data);
        setError(null);
      }
    } catch (err) {
      // If unauthenticated (401), fetch public config for paymentsMode
      if (err?.status === 401) {
        try {
          const pub = await apiFetch('/api/config-public');
          setStatus((prev) => ({
            ...prev,
            plan: 'free',
            paymentsMode: pub?.paymentsMode || 'test'
          }));
        } catch {}
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    const onUpdate = () => fetchStatus();

    if (typeof window !== 'undefined') {
      window.addEventListener(BILLING_EVENT, onUpdate);
      window.addEventListener('cs:usage-updated', onUpdate);
      window.addEventListener('focus', onUpdate);
      return () => {
        window.removeEventListener(BILLING_EVENT, onUpdate);
        window.removeEventListener('cs:usage-updated', onUpdate);
        window.removeEventListener('focus', onUpdate);
      };
    }
  }, [fetchStatus, session]);

  const isPro = status.plan === 'pro';
  const isPaymentsAvailable = status.paymentsMode === 'test' || status.paymentsMode === 'live';

  return {
    status,
    isPro,
    daysLeft: status.daysLeft || 0,
    expiresAt: status.expiresAt,
    checksUsed: status.checksUsed || 0,
    checksLimit: status.checksLimit || (isPro ? 100 : 5),
    paymentsMode: status.paymentsMode || 'test',
    isPaymentsAvailable,
    loading,
    refresh: fetchStatus
  };
}

export default {
  startUpgrade,
  useBillingStatus,
  formatExpiryDate,
  triggerBillingRefresh,
  showNotificationModal
};
