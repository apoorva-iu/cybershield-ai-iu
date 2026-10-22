import React from 'react';
import { Link } from 'react-router-dom';
import { Container, Section } from './ui';
import { ArrowLeft } from 'lucide-react';

const NotFoundIllustration = () => (
  <svg
    width="220"
    height="180"
    viewBox="0 0 220 180"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    style={{ marginBottom: '24px' }}
  >
    {/* Soft subtle card backdrop */}
    <rect x="10" y="10" width="200" height="160" rx="16" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
    
    {/* App tile style shield outline */}
    <rect x="75" y="36" width="70" height="70" rx="18" fill="rgba(255, 255, 255, 0.04)" stroke="var(--border)" />
    <path
      d="M 110 48 L 132 58 C 132 78 122 92 110 98 C 98 92 88 78 88 58 Z"
      stroke="var(--accent-cyan, #22D3EE)"
      strokeWidth="2.5"
      strokeLinejoin="round"
      fill="none"
    />
    
    {/* Broken link / exclamation marker */}
    <circle cx="110" cy="70" r="4" fill="var(--primary, #0A66C2)" />
    <line x1="110" y1="58" x2="110" y2="64" stroke="var(--primary, #0A66C2)" strokeWidth="2.5" strokeLinecap="round" />

    {/* 404 text beneath */}
    <text x="110" y="142" textAnchor="middle" fill="var(--text)" fontSize="24" fontWeight="800" fontFamily="system-ui, sans-serif" letterSpacing="0.06em">
      404
    </text>
  </svg>
);

export function NotFound() {
  return (
    <Section className="stub-page-section route-transition" style={{ flex: 1, minHeight: '65vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Container style={{ textAlign: 'center', maxWidth: '480px' }}>
        <NotFoundIllustration />
        <h1 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '10px', color: 'var(--text)' }}>
          Page not found
        </h1>
        <p style={{ color: 'var(--text-dim)', marginBottom: '28px', fontSize: '15px', lineHeight: 1.5 }}>
          The link you followed does not exist, or the page was moved.
        </p>
        <Link to="/" className="btn btn-primary" style={{ display: 'inline-flex', gap: '8px', padding: '10px 24px', fontSize: '14.5px' }}>
          <ArrowLeft size={16} />
          <span>Back to home</span>
        </Link>
      </Container>
    </Section>
  );
}

export default NotFound;
