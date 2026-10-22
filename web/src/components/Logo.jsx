import React, { useId } from 'react';

/**
 * CyberShield Logo Component
 * 
 * Props:
 * - size: number (default 32)
 * - withWordmark: boolean (default true)
 * - isDark: boolean (default true - for dark surfaces like Raycast nav)
 * - className: string
 */
export function Logo({ size = 32, withWordmark = true, isDark = true, className = '' }) {
  const gradientId = useId();

  return (
    <div
      className={`cybershield-logo-wrap ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.max(8, Math.round(size * 0.3)),
        userSelect: 'none',
        lineHeight: 1
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0, display: 'block' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3B8FE0" />
            <stop offset="100%" stopColor="#0A66C2" />
          </linearGradient>
        </defs>

        {/* Rounded-square app tile (rx about 25%) */}
        <rect width="100" height="100" rx="25" fill={`url(#${gradientId})`} />

        {/* 1. Outer shield outline (stroke 4, round joins, opacity 0.4) */}
        <path
          d="M 50 20 L 76 28 C 76 54 64 69 50 80 C 36 69 24 54 24 28 Z"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeOpacity="0.4"
        />

        {/* 2. Middle shield outline (stroke 4, round joins, opacity 0.75) */}
        <path
          d="M 50 28 L 68 34 C 68 53 59 63 50 72 C 41 63 32 53 32 34 Z"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeOpacity="0.75"
        />

        {/* 3. Small solid white center shield */}
        <path
          d="M 50 37 L 60 41 C 60 52 55 58 50 63 C 45 58 40 52 40 41 Z"
          fill="#FFFFFF"
        />
      </svg>

      {withWordmark && (
        <span
          className="cybershield-wordmark"
          style={{
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontWeight: 600,
            fontSize: Math.max(15, Math.round(size * 0.55)),
            letterSpacing: '-0.025em',
            display: 'inline-flex',
            alignItems: 'center'
          }}
        >
          <span style={{ color: isDark ? '#FFFFFF' : '#111827' }}>Cyber</span>
          <span style={{ color: isDark ? '#22D3EE' : '#0A66C2' }}>Shield</span>
        </span>
      )}
    </div>
  );
}
export default Logo;

