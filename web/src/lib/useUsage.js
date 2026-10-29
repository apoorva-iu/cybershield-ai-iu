import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';

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

  if (usage.kind === 'anonymous') {
    const rem = typeof usage.remaining === 'number' ? usage.remaining : 3;
    if (rem === 3) {
      return '3 free checks, sign in for 2 more';
    }
    const unit = rem === 1 ? 'check' : 'checks';
    return `${rem} free ${unit}, sign in for 2 more`;
  }

  if (usage.kind === 'free') {
    const rem = typeof usage.remaining === 'number' ? usage.remaining : 5;
    const limit = usage.limit || 5;
    return `${rem} of ${limit} checks left this month`;
  }

  if (usage.kind === 'pro') {
    const rem = typeof usage.remaining === 'number' ? usage.remaining : 100;
    const limit = usage.limit || 100;
    return `${rem} of ${limit} checks left`;
  }

  return null;
}

export function useUsage() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshUsage = useCallback(async () => {
    try {
      const data = await apiFetch('/api/usage');
      if (data) {
        setUsage(data);
        setError(null);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUsage();

    const handleUpdate = () => {
      refreshUsage();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(USAGE_EVENT, handleUpdate);
      window.addEventListener('focus', handleUpdate);
      return () => {
        window.removeEventListener(USAGE_EVENT, handleUpdate);
        window.removeEventListener('focus', handleUpdate);
      };
    }
  }, [refreshUsage]);

  return {
    usage,
    loading,
    error,
    refreshUsage,
    usageText: formatUsageText(usage)
  };
}

