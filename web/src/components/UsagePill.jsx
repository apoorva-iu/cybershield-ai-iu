import React from 'react';
import { Shield } from 'lucide-react';
import { useUsage } from '../lib/useUsage';

export function UsagePill({ variant = 'tool', className = '', showIcon = true }) {
  const { usage, usageText, loading } = useUsage();

  if (loading && !usage) return null;
  if (!usage || !usageText) return null;

  const isWarning = usage.remaining !== null && usage.remaining <= 1;

  if (variant === 'header') {
    return (
      <div
        className={`account-usage-pill ${isWarning ? 'is-warning' : ''} ${className}`.trim()}
        role="status"
        aria-live="polite"
      >
        {showIcon && <Shield size={13} className="usage-pill-icon" aria-hidden="true" />}
        <span className="usage-pill-text">{usageText}</span>
      </div>
    );
  }

  return (
    <div
      className={`tool-quota-badge ${isWarning ? 'is-warning' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      {showIcon && <Shield size={14} className="usage-pill-icon" aria-hidden="true" />}
      <span className="usage-pill-text">{usageText}</span>
    </div>
  );
}

export default UsagePill;

