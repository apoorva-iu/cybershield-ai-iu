import React, { useEffect, useState } from 'react';
import './RiskGauge.css';

// level: 'low' | 'medium' | 'high' | 'unknown'
// score: 0 to 100
export const RiskGauge = ({ level = 'unknown', score = 0, label = 'Risk Level' }) => {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    // animated sweep
    const timeout = setTimeout(() => {
      setAnimatedScore(score);
    }, 100);
    return () => clearTimeout(timeout);
  }, [score]);

  // Map levels to stroke colors and names
  const colors = {
    low: 'var(--risk-low)',
    medium: 'var(--risk-medium)',
    high: 'var(--risk-high)',
    unknown: 'var(--risk-unknown)'
  };
  
  const displayLabels = {
    low: 'Low Risk',
    medium: 'Medium Risk',
    high: 'High Risk',
    unknown: 'Unknown'
  };

  const strokeColor = colors[level] || colors.unknown;
  const displayText = displayLabels[level] || displayLabels.unknown;

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  return (
    <div 
      className="risk-gauge-container" 
      role="meter" 
      aria-label={`${label}: ${displayText}, Score: ${score}`}
      aria-valuenow={score}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div className="risk-gauge-svg-wrapper">
        <svg className="risk-gauge-svg" width="100" height="100" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle 
            className="risk-gauge-bg"
            cx="50" cy="50" r={radius} 
            strokeWidth="8"
            fill="none"
          />
          {/* Progress circle */}
          <circle 
            className="risk-gauge-progress"
            cx="50" cy="50" r={radius} 
            strokeWidth="8"
            fill="none"
            stroke={strokeColor}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
          {/* Animated ticks or dots could go here, simplified to the score text for now */}
          <text x="50" y="55" className="risk-gauge-score-text" fill={strokeColor}>
            {score}
          </text>
        </svg>
      </div>
      <div className="risk-gauge-label">
        <span className="risk-gauge-title">{label}</span>
        <span className="risk-gauge-value" style={{ color: strokeColor }}>{displayText}</span>
      </div>
    </div>
  );
};

