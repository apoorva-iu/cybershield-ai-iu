import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../api';
import { useAuth } from '../auth';

export const PlanContext = createContext(null);

const DEV_COMPONENT_PLANS = new Map();

/**
 * Dev-only validator: logs a console warning if two components disagree on the active plan.
 */
export function warnIfComponentPlanDisagrees(componentName, plan) {
  const isDev = Boolean(
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) ||
    (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production')
  );

  if (isDev && componentName && plan) {
    DEV_COMPONENT_PLANS.set(componentName, plan);
    for (const [otherName, otherPlan] of DEV_COMPONENT_PLANS.entries()) {
      if (otherName !== componentName && otherPlan !== plan) {
        console.warn(
          `[Plan Disagreement Warning] Component "${componentName}" reports plan "${plan}" but "${otherName}" reports plan "${otherPlan}"!`
        );
      }
    }
  }
}

/**
 * PlanProvider: Single source of truth for plan and quota across the entire app.
 * Loads once from /api/usage after login and refreshes on login, after payment,
 * on tab focus, and on token refresh.
 */
export function PlanProvider({ children }) {
  const { session } = useAuth();

  const [state, setState] = useState({
    plan: null, // null while loading: NEVER show "Free" before plan has loaded!
    isPro: false,
    expiresAt: null,
    daysLeft: 0,
    quota: null,
    usage: null,
    loading: true,
    error: null
  });

  const isFetchingRef = useRef(false);

  const fetchPlan = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const data = await apiFetch('/api/usage');
      if (data) {
        const isPro = Boolean(data.isPro || (data.plan === 'pro' && data.kind === 'pro'));
        const plan = isPro ? 'pro' : 'free';
        const expiresAt = data.expiresAt || null;
        let daysLeft = 0;
        if (expiresAt) {
          const expMs = new Date(expiresAt).getTime();
          if (!isNaN(expMs)) {
            daysLeft = Math.max(0, Math.ceil((expMs - Date.now()) / (1000 * 60 * 60 * 24)));
          }
        }

        const quota = data.quota || {
          limit: data.limit,
          used: data.used,
          remaining: data.remaining,
          resetsAt: data.resetsAt,
          action: data.action,
          unlimited: data.unlimited || false
        };

        setState({
          plan,
          isPro,
          expiresAt,
          daysLeft,
          quota,
          usage: data,
          loading: false,
          error: null
        });
      }
    } catch (err) {
      console.warn('[PlanContext] fetch error:', err.message);
      const isUnauth = err?.status === 401 || !session;
      setState((prev) => ({
        ...prev,
        plan: prev.plan || (isUnauth ? 'free' : null),
        loading: false,
        error: err
      }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [session]);

  // Load once on mount or when session / token changes (login & token refresh)
  useEffect(() => {
    fetchPlan();
  }, [fetchPlan, session?.access_token, session?.user?.id]);

  // Listeners: payment update ('cs:billing-updated'), usage update ('cs:usage-updated'), tab focus, visibilitychange
  useEffect(() => {
    const handleRefresh = () => {
      fetchPlan();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('cs:billing-updated', handleRefresh);
      window.addEventListener('cs:usage-updated', handleRefresh);
      window.addEventListener('focus', handleRefresh);
      document.addEventListener('visibilitychange', handleRefresh);

      return () => {
        window.removeEventListener('cs:billing-updated', handleRefresh);
        window.removeEventListener('cs:usage-updated', handleRefresh);
        window.removeEventListener('focus', handleRefresh);
        document.removeEventListener('visibilitychange', handleRefresh);
      };
    }
  }, [fetchPlan]);

  const value = {
    plan: state.plan,
    isPro: state.isPro,
    expiresAt: state.expiresAt,
    daysLeft: state.daysLeft,
    quota: state.quota,
    usage: state.usage,
    loading: state.loading,
    error: state.error,
    refresh: fetchPlan,
    warnIfDisagrees: warnIfComponentPlanDisagrees
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

/**
 * Hook to consume the single source of truth for plan.
 * Optional componentName triggers dev-only plan disagreement validation.
 */
export function usePlan(componentName) {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('usePlan must be used within a PlanProvider');
  }

  useEffect(() => {
    if (componentName && context.plan) {
      context.warnIfDisagrees(componentName, context.plan);
    }
  }, [componentName, context.plan, context.warnIfDisagrees]);

  return context;
}

export default usePlan;
