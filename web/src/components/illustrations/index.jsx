import React from 'react';

const BaseSvg = ({ children, ...props }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    aria-hidden="true" 
    fill="none" 
    {...props}
  >
    {children}
  </svg>
);

export const HeroIllustration = () => (
  <BaseSvg width="320" height="240" viewBox="0 0 320 240">
    <rect x="40" y="40" width="240" height="160" rx="12" fill="var(--bg)" />
    
    {/* Document */}
    <rect x="80" y="20" width="120" height="160" rx="8" fill="var(--surface)" stroke="var(--brand)" strokeWidth="4" />
    <line x1="100" y1="50" x2="180" y2="50" stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
    <line x1="100" y1="70" x2="160" y2="70" stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
    <line x1="100" y1="90" x2="180" y2="90" stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
    
    {/* Shield */}
    <path d="M220 70L190 60L160 70V110C160 140 190 160 190 160C190 160 220 140 220 110V70Z" fill="var(--brand)" />
    <path d="M180 100L190 110L205 90" stroke="var(--surface)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    
    {/* Magnifier */}
    <circle cx="100" cy="140" r="20" fill="var(--accent)" fillOpacity="0.1" stroke="var(--accent)" strokeWidth="4" />
    <line x1="115" y1="155" x2="135" y2="175" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
  </BaseSvg>
);

export const Step1Illustration = () => (
  <BaseSvg width="120" height="120" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="50" fill="var(--bg)" />
    <rect x="40" y="30" width="40" height="60" rx="4" fill="var(--surface)" stroke="var(--brand)" strokeWidth="4" />
    <path d="M40 50H80" stroke="var(--brand)" strokeWidth="4" />
    <circle cx="60" cy="70" r="8" fill="var(--accent)" />
  </BaseSvg>
);

export const Step2Illustration = () => (
  <BaseSvg width="120" height="120" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="50" fill="var(--bg)" />
    <path d="M40 70L55 85L80 50" stroke="var(--brand)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="80" cy="40" r="12" fill="var(--accent)" opacity="0.2" />
  </BaseSvg>
);

export const Step3Illustration = () => (
  <BaseSvg width="120" height="120" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="50" fill="var(--bg)" />
    <rect x="30" y="40" width="60" height="40" rx="4" fill="var(--surface)" stroke="var(--brand)" strokeWidth="4" />
    <path d="M45 60H75" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
    <path d="M60 45V75" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
  </BaseSvg>
);

export const EmptyScansIllustration = () => (
  <BaseSvg width="160" height="160" viewBox="0 0 160 160">
    <rect x="20" y="40" width="120" height="80" rx="8" fill="var(--bg)" stroke="var(--line)" strokeWidth="4" strokeDasharray="8 8" />
    <circle cx="80" cy="80" r="20" fill="var(--brand)" opacity="0.1" />
    <path d="M70 80H90" stroke="var(--brand)" strokeWidth="4" strokeLinecap="round" />
    <path d="M80 70V90" stroke="var(--brand)" strokeWidth="4" strokeLinecap="round" />
  </BaseSvg>
);

export const LoginIllustration = () => (
  <BaseSvg width="200" height="200" viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="80" fill="var(--bg)" />
    <circle cx="100" cy="75" r="25" fill="var(--brand)" />
    <path d="M50 160C50 135 70 115 100 115C130 115 150 135 150 160" stroke="var(--brand)" strokeWidth="12" strokeLinecap="round" />
    <rect x="130" y="40" width="40" height="40" rx="8" fill="var(--accent)" opacity="0.9" />
    <path d="M140 60L145 65L160 50" stroke="var(--surface)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </BaseSvg>
);

