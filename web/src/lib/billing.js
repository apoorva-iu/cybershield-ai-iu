/**
 * Billing & Upgrade Integration
 * Single source of truth for payment flows, Razorpay checkout, and billing state.
 */

import { apiFetch } from '../api';
import { setReturnTo } from '../auth';
import { triggerUsageRefresh } from './useUsage';
import { usePlan } from './planContext';
import { useState, useEffect, useCallback } from 'react';

export const BILLING_EVENT = 'cs:billing-updated';
export const PENDING_ORDER_KEY = 'cs_pending_payment_order_id';
export const PENDING_VERIFY_KEY = 'cs_pending_payment_verify';

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

    // Save pending order in sessionStorage before opening Razorpay
    try {
      sessionStorage.setItem(PENDING_ORDER_KEY, order.orderId);
    } catch {}

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
        ondismiss: async function () {
          isUpgradeInProgress = false;
          if (typeof options.onProgress === 'function') {
            options.onProgress(false);
          }
          if (typeof options.onDismiss === 'function') {
            options.onDismiss();
          }

          // Do NOT sign user out. Check if payment was completed:
          try {
            const pendingId = sessionStorage.getItem(PENDING_ORDER_KEY);
            if (pendingId) {
              const check = await apiFetch('/api/billing/check-order', {
                method: 'POST',
                body: JSON.stringify({ orderId: pendingId })
              });
              if (check?.isPro || check?.status === 'paid') {
                sessionStorage.removeItem(PENDING_ORDER_KEY);
                sessionStorage.removeItem(PENDING_VERIFY_KEY);
                triggerUsageRefresh();
                triggerBillingRefresh();
                const expDate = formatExpiryDate(check.expiresAt);
                showNotificationModal({
                  title: 'Pro Activated',
                  message: `Pro active until ${expDate}. Up to 100 checks.`,
                  type: 'success'
                });
                return;
              }
              sessionStorage.removeItem(PENDING_ORDER_KEY);
            }
          } catch {}

          showNotificationModal({
            title: 'Payment Incomplete',
            message: 'Checkout was cancelled. No charges were made.',
            type: 'info'
          });
        }
      },
      handler: async function (paymentResp) {
        try {
          // Save verification fields in sessionStorage so it survives reloads or lost sessions
          try {
            sessionStorage.setItem(PENDING_VERIFY_KEY, JSON.stringify(paymentResp));
          } catch {}

          // Send verification fields to server
          let verifyResult;
          try {
            verifyResult = await apiFetch('/api/billing/verify', {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: paymentResp.razorpay_order_id,
                razorpay_payment_id: paymentResp.razorpay_payment_id,
                razorpay_signature: paymentResp.razorpay_signature
              })
            });
          } catch (vErr) {
            console.warn('[Billing] verify call error, checking order status:', vErr.message);
            // Check payment status step on server
            const check = await apiFetch('/api/billing/check-order', {
              method: 'POST',
              body: JSON.stringify({ orderId: paymentResp.razorpay_order_id || order.orderId })
            });
            if (check?.isPro || check?.status === 'paid') {
              verifyResult = check;
            } else {
              throw vErr;
            }
          }

          // Clear pending items from storage
          try {
            sessionStorage.removeItem(PENDING_ORDER_KEY);
            sessionStorage.removeItem(PENDING_VERIFY_KEY);
          } catch {}

          // Refresh entitlements across UI (Plans, Dashboard, Extension)
          triggerUsageRefresh();
          triggerBillingRefresh();

          const expiryDateFormatted = formatExpiryDate(verifyResult.expiresAt);
          const isTest = verifyResult.paymentsMode === 'test' || order.keyId.startsWith('rzp_test_');

          showNotificationModal({
            title: 'Pro Activated',
            message: `Pro active until ${expiryDateFormatted}. Up to 100 checks.`,
            type: 'success',
            isTestMode: isTest
          });

          if (typeof options.onSuccess === 'function') {
            options.onSuccess(verifyResult);
          }
        } catch (verifyErr) {
          console.error('[Billing] Payment verification failed:', verifyErr);
          // Check payment status step before showing error
          let check = null;
          try {
            check = await apiFetch('/api/billing/check-order', {
              method: 'POST',
              body: JSON.stringify({ orderId: paymentResp?.razorpay_order_id || order.orderId })
            });
          } catch {}

          if (check?.isPro || check?.status === 'paid') {
            try {
              sessionStorage.removeItem(PENDING_ORDER_KEY);
              sessionStorage.removeItem(PENDING_VERIFY_KEY);
            } catch {}
            triggerUsageRefresh();
            triggerBillingRefresh();
            const expDate = formatExpiryDate(check.expiresAt);
            showNotificationModal({
              title: 'Pro Activated',
              message: `Pro active until ${expDate}. Up to 100 checks.`,
              type: 'success'
            });
            return;
          }

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

    if (err?.status === 401 && !session) {
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
 * Recovers pending payment on return or app load.
 * Survives page reloads or lost sessions.
 */
export async function checkAndRecoverPendingPayment() {
  if (typeof window === 'undefined') return false;

  let pendingOrderId = null;
  let pendingVerify = null;

  try {
    pendingOrderId = sessionStorage.getItem(PENDING_ORDER_KEY);
    const rawVerify = sessionStorage.getItem(PENDING_VERIFY_KEY);
    if (rawVerify) pendingVerify = JSON.parse(rawVerify);
  } catch {}

  if (!pendingOrderId && !pendingVerify) {
    return false;
  }

  const orderId = pendingVerify?.razorpay_order_id || pendingOrderId;

  try {
    let result = null;

    // 1. If full payment verification fields exist, call verify endpoint
    if (
      pendingVerify &&
      pendingVerify.razorpay_order_id &&
      pendingVerify.razorpay_payment_id &&
      pendingVerify.razorpay_signature
    ) {
      try {
        result = await apiFetch('/api/billing/verify', {
          method: 'POST',
          body: JSON.stringify(pendingVerify)
        });
      } catch (err) {
        console.warn('[Billing] Recovery verify error:', err.message);
      }
    }

    // 2. Check payment status step if verify didn't resolve
    if (!result?.isPro && orderId) {
      try {
        result = await apiFetch('/api/billing/check-order', {
          method: 'POST',
          body: JSON.stringify({ orderId })
        });
      } catch (err) {
        console.warn('[Billing] Recovery check-order error:', err.message);
      }
    }

    // Clear storage
    try {
      sessionStorage.removeItem(PENDING_ORDER_KEY);
      sessionStorage.removeItem(PENDING_VERIFY_KEY);
    } catch {}

    if (result?.isPro || result?.status === 'paid' || result?.plan === 'pro') {
      triggerUsageRefresh();
      triggerBillingRefresh();
      const expDate = formatExpiryDate(result.expiresAt);
      showNotificationModal({
        title: 'Pro Activated',
        message: `Pro active until ${expDate}. Up to 100 checks.`,
        type: 'success'
      });
      return true;
    } else if (result?.status === 'unknown') {
      showNotificationModal({
        title: 'Payment Verification',
        message: result.message || `Payment status could not be verified automatically. Contact us with your order id: ${orderId}`,
        type: 'warning'
      });
    }
  } catch (err) {
    console.warn('[Billing] checkAndRecoverPendingPayment error:', err);
    try {
      sessionStorage.removeItem(PENDING_ORDER_KEY);
      sessionStorage.removeItem(PENDING_VERIFY_KEY);
    } catch {}
  }

  return false;
}

/**
 * React Hook to track billing status, current plan, expiry, check limits and test mode.
 * Reads directly from the unified PlanContext (single source of truth).
 */
export function useBillingStatus(session) {
  if (session !== undefined) {
    setBillingSession(session);
  }

  const planCtx = usePlan('billing');
  const [paymentsMode, setPaymentsMode] = useState('test');

  useEffect(() => {
    apiFetch('/api/config-public')
      .then((cfg) => {
        if (cfg?.paymentsMode) setPaymentsMode(cfg.paymentsMode);
      })
      .catch(() => {});
  }, []);

  const isPro = planCtx.isPro;
  const isPaymentsAvailable = paymentsMode === 'test' || paymentsMode === 'live';
  const checksUsed = planCtx.quota?.used || 0;
  const checksLimit = planCtx.quota?.limit || (isPro ? 100 : 5);

  const status = {
    plan: planCtx.plan || 'free',
    expiresAt: planCtx.expiresAt,
    daysLeft: planCtx.daysLeft,
    checksUsed,
    checksLimit,
    paymentsMode
  };

  return {
    status,
    isPro,
    plan: planCtx.plan,
    daysLeft: planCtx.daysLeft || 0,
    expiresAt: planCtx.expiresAt,
    checksUsed,
    checksLimit,
    paymentsMode,
    isPaymentsAvailable,
    loading: planCtx.loading,
    refresh: planCtx.refresh
  };
}

export default {
  startUpgrade,
  useBillingStatus,
  formatExpiryDate,
  triggerBillingRefresh,
  showNotificationModal
};
