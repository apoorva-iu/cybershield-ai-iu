import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';

export function MessageGauge({
  level = 'unable',
  score = null,
  isPrinting = false,
  onToggleInfo = null,
  showInfo = false
}) {
  const finalScore = score != null ? Math.min(100, Math.max(0, Number(score))) : 0;
  const [animatedScore, setAnimatedScore] = useState(isPrinting ? finalScore : 0);

  useEffect(() => {
    if (isPrinting) {
      setAnimatedScore(finalScore);
      return;
    }
    if (score != null) {
      const timer = setTimeout(() => {
        setAnimatedScore(finalScore);
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [score, isPrinting, finalScore]);

  const isUnable = level === 'unable' || score == null;
  const displayScore = isPrinting ? finalScore : animatedScore;

  // Arc configuration: semi-circle gauge (radius 40, circumference 125.66)
  const arcLength = 125.66;
  const dashOffset = isUnable ? arcLength : arcLength - (arcLength * displayScore) / 100;

  const colorClass =
    level === 'high'
      ? 'msg-gauge-high'
      : level === 'medium'
      ? 'msg-gauge-medium'
      : level === 'low'
      ? 'msg-gauge-low'
      : 'msg-gauge-unable';

  return (
    <div
      className={`msg-gauge-card ${colorClass}`}
      role="meter"
      aria-label={isUnable ? 'Risk score: Unable to verify' : `Risk score: ${score} of 100`}
      aria-valuenow={score ?? 0}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div className="msg-gauge-svg-wrap">
        <svg className="msg-gauge-svg" viewBox="0 0 100 56" aria-hidden="true">
          {/* Background track */}
          <path
            className="msg-gauge-bg-path"
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Animated score arc */}
          {!isUnable && (
            <path
              className="msg-gauge-score-path"
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={arcLength}
              style={{ strokeDashoffset: dashOffset, transition: isPrinting ? 'none' : 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          )}
        </svg>

        <div className="msg-gauge-center-text">
          <span className="msg-gauge-number">
            {isUnable ? '—' : displayScore}
          </span>
          <span className="msg-gauge-denom">{isUnable ? 'Score unavailable' : '/ 100'}</span>
        </div>
      </div>
      <div className="msg-gauge-caption">
        <span className="msg-gauge-caption-label">Risk score</span>
        {onToggleInfo && (
          <button
            type="button"
            className="msg-gauge-info-btn"
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
