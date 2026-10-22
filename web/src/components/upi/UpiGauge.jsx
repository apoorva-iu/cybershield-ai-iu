import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';

export function UpiGauge({
  level = 'unable',
  score = null,
  onToggleInfo = null,
  showInfo = false
}) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (score != null) {
      const timer = setTimeout(() => {
        setAnimatedScore(Math.min(100, Math.max(0, Number(score))));
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [score]);

  const isUnable = level === 'unable' || score == null;

  // Arc configuration: semi-circle gauge (radius 40, circumference 125.66)
  const arcLength = 125.66;
  const dashOffset = isUnable ? arcLength : arcLength - (arcLength * animatedScore) / 100;

  const colorClass =
    level === 'high'
      ? 'upi-gauge-high'
      : level === 'medium'
      ? 'upi-gauge-medium'
      : level === 'low'
      ? 'upi-gauge-low'
      : 'upi-gauge-unable';

  return (
    <div
      className={`upi-gauge-card ${colorClass}`}
      role="meter"
      aria-label={isUnable ? 'Risk score: Unable to verify' : `Risk score: ${score} of 100`}
      aria-valuenow={score ?? 0}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div className="upi-gauge-svg-wrap">
        <svg className="upi-gauge-svg" viewBox="0 0 100 56" aria-hidden="true">
          {/* Background track */}
          <path
            className="upi-gauge-bg-path"
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Animated score arc */}
          {!isUnable && (
            <path
              className="upi-gauge-score-path"
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={arcLength}
              style={{ strokeDashoffset: dashOffset, transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          )}
        </svg>

        <div className="upi-gauge-center-text">
          <span className="upi-gauge-number">
            {isUnable ? '—' : animatedScore}
          </span>
          <span className="upi-gauge-denom">{isUnable ? 'Score unavailable' : '/ 100'}</span>
        </div>
      </div>
      <div className="upi-gauge-caption">
        <span className="upi-gauge-caption-label">Risk score</span>
        {onToggleInfo && (
          <button
            type="button"
            className="upi-gauge-info-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleInfo();
            }}
            aria-label="What do these mean?"
            aria-expanded={showInfo}
          >
            <Info size={12} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
