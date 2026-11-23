import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import { usePlan } from './planContext';

const USAGE_EVENT = 'cs:usage-updated';

/**
 * Dispatches an event so all mounted components using useUsage refresh their state.
 */
export function triggerUsageRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(USAGE_EVENT));
  }
}

/**
 * Formats a reset date (ISO string) into a friendly string like "1 Nov" or "Nov 1".
 */
export function formatResetDate(isoString) {
  if (!isoString) return 'next month';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'next month';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric'
    }).format(d);
  } catch {
    return 'next month';
  }
}

/**
 * Returns user-facing summary text for the usage pill.
 */
export function formatUsageText(usage) {
  if (!usage || usage.unlimited) return null;

  const isPro = usage.kind === 'pro' || usage.plan === 'pro';
  if (isPro) {
    const rem = typeof usage.remaining === 'number' ? usage.remaining : 100;
    const limit = usage.limit || 100;
    return `${rem} of ${limit} checks left`;
  }

  // Free users and visitors: use "free"
  const defaultLimit = usage.kind === 'anonymous' ? (usage.limit || 3) : (usage.limit || 5);
  const rem = typeof usage.remaining === 'number' ? usage.remaining : defaultLimit;
  const limit = usage.limit || defaultLimit;
  return `${rem} of ${limit} free checks left`;
}

export function useUsage() {
  const planCtx = usePlan('useUsage');

  return {
    usage: planCtx.usage,
    loading: planCtx.loading,
    error: planCtx.error,
    refreshUsage: planCtx.refresh,
    usageText: formatUsageText(planCtx.usage)
  };
}

