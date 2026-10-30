import React, { Suspense, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Briefcase,
  Wallet,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  Lock,
  Zap
} from 'lucide-react';
import { Container } from '../components/ui';
import { Reveal, PageTransition } from '../components/wow';
import '../tools.css';

function BrowserIcon({ size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="18" rx="4" />
      <path d="M 2 9 L 22 9" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="10" cy="6" r="1" fill="currentColor" />
    </svg>
  );
}

// Lazy-load DemoPlayer for optimized bundle and paint
const DemoPlayer = React.lazy(() =>
  import('../components/DemoPlayer').then((m) => ({ default: m.DemoPlayer }))
);

function DemoPlayerSkeleton() {
  return (
    <div className="demo-player-skeleton" role="status" aria-label="Loading interactive demo player">
      <div className="demo-skeleton-bar">
        <span className="skeleton-dot" />
        <span className="skeleton-dot" />
        <span className="skeleton-dot" />
      </div>
      <div className="demo-skeleton-content">
        <div className="demo-skeleton-line" style={{ width: '45%' }} />
        <div className="demo-skeleton-box" />
        <div className="demo-skeleton-line" style={{ width: '65%' }} />
      </div>
    </div>
  );
}

export function Home() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth' });
        }, 80);
      }
    }
  }, [location]);

  const scrollToDemo = () => {
    const el = document.getElementById('demo') || document.getElementById('demo-player') || document.querySelector('.framer-demo-wrapper');
    if (el) {
      const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    }
  };

  return (
    <PageTransition>
      {/* =========================================================================
          1. HERO SECTION & DEMO PLAYER
         ========================================================================= */}
      <section className="hero-framer-dark">
        <div className="hero-dotted-pattern" aria-hidden="true" />

        <Container>
          {/* Small Top Link on the Right Edge */}
          <div className="hero-top-edge-row">
            <Link to="/extension" className="hero-top-edge-link">
              <span>New: Browser extension (developer preview)</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="hero-headline-block">
            <h1 className="hero-huge-title">
              Check any scam before you act
            </h1>

            <p className="hero-huge-subtext">
              Screen job offers, payment requests and messages in seconds, with proof you can verify later.
            </p>

            <div className="hero-btn-row">
              <Link to="/tools" className="btn-framer-white">
                <span>Check a scam</span>
                <ArrowRight size={16} />
              </Link>

              <button
                type="button"
                className="btn-framer-dark-outline"
                onClick={scrollToDemo}
              >
                <span>Watch the demo</span>
              </button>
            </div>

            {/* Quick chips linking to the 3 tools */}
            <div className="hero-tools-chips" role="navigation" aria-label="Quick tools links">
              <Link to="/tools/job-scam-check" className="hero-tool-chip">
                <Briefcase size={14} color="var(--accent-cyan, #22D3EE)" aria-hidden="true" />
                <span>Job offers</span>
              </Link>
              <Link to="/tools/upi-payment-check" className="hero-tool-chip">
                <Wallet size={14} color="var(--accent-cyan, #22D3EE)" aria-hidden="true" />
                <span>UPI and payments</span>
              </Link>
              <Link to="/tools/message-scanner" className="hero-tool-chip">
                <MessageSquare size={14} color="var(--accent-cyan, #22D3EE)" aria-hidden="true" />
                <span>Messages and screenshots</span>
              </Link>
            </div>
          </div>

          {/* Interactive DemoPlayer Section */}
          <div className="framer-demo-wrapper" id="demo">
            <Suspense fallback={<DemoPlayerSkeleton />}>
              <DemoPlayer />
            </Suspense>
          </div>
        </Container>
      </section>

      {/* =========================================================================
          2. HOW EVERY CHECK WORKS (SHORT)
         ========================================================================= */}
      <section className="home-section" id="how-it-works">
        <Container>
          <Reveal>
            <div className="section-header-block">
              <span className="section-eyebrow">Process</span>
              <h2>How every check works</h2>
              <p className="section-subline">
                Three steps from suspicious input to tamper-evident proof.
              </p>
            </div>
          </Reveal>

          <div className="how-steps-grid">
            <div className="how-step-card">
              <div className="how-step-badge-row">
                <span className="how-step-num">1</span>
                <h3 className="how-step-title">Paste or upload</h3>
              </div>
              <p className="how-step-desc">
                Submit job offer details, paste message or payment text, or upload a phone screenshot. Fields are read in memory without saving your private credentials.
              </p>
              <svg className="how-step-svg" width="100%" height="90" viewBox="0 0 280 90" fill="none" aria-hidden="true">
                <rect width="280" height="90" rx="8" fill="var(--bg)" stroke="var(--border)" />
                <rect x="20" y="20" width="160" height="18" rx="4" fill="var(--surface)" stroke="var(--border)" />
                <text x="30" y="33" fill="var(--text-dim)" fontSize="10" fontFamily="system-ui, sans-serif">Paste text or link...</text>
                <rect x="20" y="46" width="240" height="26" rx="4" fill="rgba(34, 211, 238, 0.05)" stroke="rgba(34, 211, 238, 0.25)" strokeDasharray="3 3" />
                <text x="80" y="63" fill="var(--accent-cyan, #22D3EE)" fontSize="11" fontFamily="system-ui, sans-serif" fontWeight="600">&uarr; Drop phone screenshot</text>
              </svg>
            </div>

            <div className="how-step-card">
              <div className="how-step-badge-row">
                <span className="how-step-num">2</span>
                <h3 className="how-step-title">Live evidence &amp; AI reading</h3>
              </div>
              <p className="how-step-desc">
                Domain age via RDAP, URL threat feeds, UPI handle registries, company records, and AI text reading evaluate together in parallel.
              </p>
              <svg className="how-step-svg" width="100%" height="90" viewBox="0 0 280 90" fill="none" aria-hidden="true">
                <rect width="280" height="90" rx="8" fill="var(--bg)" stroke="var(--border)" />
                <rect x="20" y="18" width="115" height="24" rx="4" fill="var(--surface)" stroke="var(--border)" />
                <circle cx="30" cy="30" r="3.5" fill="var(--accent-cyan, #22D3EE)" />
                <text x="40" y="34" fill="var(--text)" fontSize="10" fontFamily="system-ui, sans-serif">RDAP age check</text>
                <rect x="145" y="18" width="115" height="24" rx="4" fill="var(--surface)" stroke="var(--border)" />
                <circle cx="155" cy="30" r="3.5" fill="var(--accent-cyan, #22D3EE)" />
                <text x="165" y="34" fill="var(--text)" fontSize="10" fontFamily="system-ui, sans-serif">Threat intel feeds</text>
                <rect x="20" y="50" width="240" height="24" rx="4" fill="var(--surface)" stroke="var(--border)" />
                <circle cx="30" cy="62" r="3.5" fill="var(--accent-cyan, #22D3EE)" />
                <text x="40" y="66" fill="var(--text)" fontSize="10" fontFamily="system-ui, sans-serif">AI reading: parallel evaluation</text>
              </svg>
            </div>

            <div className="how-step-card">
              <div className="how-step-badge-row">
                <span className="how-step-num">3</span>
                <h3 className="how-step-title">Verdict and Proof ID</h3>
              </div>
              <p className="how-step-desc">
                Receive an objective risk verdict, highlighted phrases with reasons, action guidance, and a tamper-evident Proof ID anchored to the ledger.
              </p>
              <svg className="how-step-svg" width="100%" height="90" viewBox="0 0 280 90" fill="none" aria-hidden="true">
                <rect width="280" height="90" rx="8" fill="var(--bg)" stroke="var(--border)" />
                <rect x="20" y="18" width="90" height="26" rx="6" fill="var(--risk-bad-bg)" stroke="var(--risk-bad)" />
                <text x="32" y="35" fill="var(--risk-bad-text)" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">High risk</text>
                <rect x="120" y="18" width="140" height="26" rx="6" fill="rgba(34, 211, 238, 0.08)" stroke="rgba(34, 211, 238, 0.25)" />
                <text x="130" y="35" fill="var(--accent-cyan, #22D3EE)" fontSize="10.5" fontWeight="700" fontFamily="system-ui, sans-serif">Proof: CS-8B3FA19D</text>
                <text x="20" y="68" fill="var(--text-dim)" fontSize="10" fontFamily="system-ui, sans-serif">Access Code: 2EKR278DTD8P (one-time)</text>
              </svg>
            </div>
          </div>
        </Container>
      </section>

      {/* =========================================================================
          3. VERIFY A REPORT (SHORT, WITH BUTTON)
         ========================================================================= */}
      <section className="home-section proof-section-wrap" id="verify">
        <Container>
          <div className="proof-grid-wrap">
            <Reveal>
              <div style={{ maxWidth: '440px', margin: '0 auto' }}>
                <svg
                  viewBox="0 0 420 270"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '14px', boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}
                  role="img"
                  aria-label="Example cryptographic Proof ID card illustration"
                >
                  <rect width="420" height="270" rx="14" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
                  
                  {/* Top Bar */}
                  <path d="M 0 14 C 0 6.268 6.268 0 14 0 L 406 0 C 413.732 0 420 6.268 420 14 L 420 48 L 0 48 Z" fill="rgba(255, 255, 255, 0.03)" />
                  <line x1="0" y1="48" x2="420" y2="48" stroke="var(--border)" strokeWidth="1" />
                  
                  {/* Shield badge */}
                  <rect x="20" y="14" width="20" height="20" rx="5" fill="var(--primary, #0A66C2)" />
                  <path d="M 30 18 L 35 20 C 35 25 33 28 30 30 C 27 28 25 25 25 20 Z" fill="#FFFFFF" />
                  <text x="48" y="28" fill="var(--text)" fontSize="13" fontWeight="700" fontFamily="system-ui, sans-serif">
                    Cyber Shield Proof Receipt
                  </text>
                  
                  {/* Example tag */}
                  <rect x="336" y="15" width="64" height="18" rx="4" fill="rgba(34, 211, 238, 0.12)" stroke="rgba(34, 211, 238, 0.3)" strokeWidth="0.8" />
                  <text x="348" y="27" fill="var(--accent-cyan, #22D3EE)" fontSize="9.5" fontWeight="700" letterSpacing="0.04em" fontFamily="system-ui, sans-serif">
                    EXAMPLE
                  </text>
                  
                  {/* Proof ID & Hash details */}
                  <text x="24" y="80" fill="var(--text-dim)" fontSize="11" fontWeight="600" textTransform="uppercase" letterSpacing="0.05em" fontFamily="system-ui, sans-serif">
                    PROOF IDENTIFIER
                  </text>
                  <text x="24" y="104" fill="var(--accent-cyan, #22D3EE)" fontSize="20" fontWeight="800" fontFamily="monospace">
                    CS-8B3FA19D04
                  </text>
                  
                  <text x="24" y="136" fill="var(--text-dim)" fontSize="11" fontWeight="600" textTransform="uppercase" letterSpacing="0.05em" fontFamily="system-ui, sans-serif">
                    CANONICAL EVIDENCE HASH (SHA-256)
                  </text>
                  <rect x="24" y="144" width="372" height="30" rx="6" fill="var(--bg)" stroke="var(--border)" />
                  <text x="34" y="163" fill="var(--text-dim)" fontSize="11" fontFamily="monospace">
                    4f1a9b3c7d6e820d5718a901ff2b6c19c892ed0f...
                  </text>
                  
                  {/* Access Code */}
                  <text x="24" y="200" fill="var(--text-dim)" fontSize="11" fontWeight="600" textTransform="uppercase" letterSpacing="0.05em" fontFamily="system-ui, sans-serif">
                    ONE-TIME ACCESS CODE
                  </text>
                  <rect x="24" y="208" width="160" height="28" rx="6" fill="var(--bg)" stroke="var(--border)" />
                  <text x="34" y="226" fill="var(--text)" fontSize="12" fontWeight="700" fontFamily="monospace">
                    2EKR278DTD8P
                  </text>
                  
                  {/* Verified Seal */}
                  <rect x="250" y="208" width="146" height="28" rx="6" fill="var(--risk-ok-bg)" stroke="rgba(18, 128, 92, 0.4)" strokeWidth="0.8" />
                  <circle cx="265" cy="222" r="5" fill="var(--risk-ok)" />
                  <path d="M 262 222 L 264 224 L 268 220" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <text x="276" y="226" fill="var(--risk-ok-text)" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">
                    Ledger Anchored
                  </text>
                  
                  <text x="24" y="254" fill="var(--text-dim)" fontSize="9.5" fontFamily="system-ui, sans-serif">
                    Shown once upon check completion &bull; Tamper-evident verification
                  </text>
                </svg>
              </div>
            </Reveal>

            {/* Right: Short explanation with Verify button */}
            <Reveal>
              <div className="proof-content-col">
                <span className="section-eyebrow">Verification</span>
                <h2 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 12px', color: 'var(--text)' }}>
                  Proof you can verify later
                </h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '15.5px', lineHeight: 1.6, margin: 0 }}>
                  Every check creates a tamper-evident ledger entry with an immutable evidence hash. Use the Verify tool anytime to confirm whether a report was ever modified.
                </p>

                <div className="proof-points-list">
                  <div className="proof-point-item">
                    <span className="proof-point-num">1</span>
                    <div>
                      <strong>Proof ID &amp; cryptographic hash</strong>
                      <p>Every check gets a unique Proof ID and a SHA-256 evidence hash generated at completion.</p>
                    </div>
                  </div>

                  <div className="proof-point-item">
                    <span className="proof-point-num">2</span>
                    <div>
                      <strong>Independent tamper detection</strong>
                      <p>The Verify tool checks receipt files or hashes against the ledger to prove report integrity.</p>
                    </div>
                  </div>

                  <div className="proof-point-item">
                    <span className="proof-point-num">3</span>
                    <div>
                      <strong>Private by design</strong>
                      <p>Ledger entries record only mathematical hashes; your raw text and contact details are never public.</p>
                    </div>
                  </div>
                </div>

                <Link to="/verify" className="btn btn-primary" style={{ display: 'inline-flex', gap: '8px', marginTop: '4px' }}>
                  <span>Verify a report</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* =========================================================================
          4. BROWSER EXTENSION (LARGE MOCKUP, 2-COLUMN)
         ========================================================================= */}
      <section className="home-section section-extension" id="extension">
        <Container>
          <Reveal>
            <div className="extension-hero-grid">
              {/* Left Column: Copy & Details */}
              <div className="extension-text-left">
                <div className="extension-kicker">
                  <BrowserIcon size={14} />
                  <span>Browser Extension &bull; Developer preview</span>
                </div>

                <h2 className="extension-heading">
                  Cyber Shield for your browser
                </h2>

                <p className="extension-oneline">
                  Check a job offer, payment request or message without leaving the page.
                </p>

                <div className="extension-points-list">
                  <div className="ext-point">
                    <CheckCircle2 size={18} color="var(--accent-cyan, #22D3EE)" />
                    <div>
                      <strong>One-click screening</strong>
                      <p>Inspect job postings, payment requests, and incoming messages directly on any page without switching tabs.</p>
                    </div>
                  </div>

                  <div className="ext-point">
                    <Lock size={18} color="var(--accent-cyan, #22D3EE)" />
                    <div>
                      <strong>Private inspection</strong>
                      <p>Evaluates public website signals and selected text. Resumes and private files are never transmitted.</p>
                    </div>
                  </div>

                  <div className="ext-point">
                    <Zap size={18} color="var(--accent-cyan, #22D3EE)" />
                    <div>
                      <strong>Parallel evaluation</strong>
                      <p>Domain age, threat feeds, and text heuristics evaluate simultaneously in parallel.</p>
                    </div>
                  </div>
                </div>

                <div className="extension-cta-wrap">
                  <div className="extension-badge-row">
                    <span className="notify-badge">Pro</span>
                    <span className="notify-sub">Chrome, Edge &amp; Brave (Desktop)</span>
                  </div>
                  <Link
                    to="/extension"
                    className="btn btn-primary extension-get-btn"
                  >
                    <span>Get the extension</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>

              {/* Right Column: Large, Readable SVG Browser Mockup (55% width on desktop) */}
              <div className="extension-graphic-right">
                <div className="extension-mockup-wrapper">
                  <svg
                    viewBox="0 0 640 460"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="extension-svg-preview"
                    role="img"
                    aria-label="Example browser extension preview graphic"
                  >
                    {/* Browser window frame */}
                    <rect width="640" height="460" rx="14" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />

                    {/* Window Titlebar */}
                    <path d="M 0 14 C 0 6.268 6.268 0 14 0 L 626 0 C 633.732 0 640 6.268 640 14 L 640 44 L 0 44 Z" fill="var(--surface)" />
                    <line x1="0" y1="44" x2="640" y2="44" stroke="var(--border)" strokeWidth="1" />

                    {/* Window Controls */}
                    <circle cx="22" cy="22" r="5" fill="var(--risk-bad, #C62828)" />
                    <circle cx="38" cy="22" r="5" fill="var(--risk-warn, #B7791F)" />
                    <circle cx="54" cy="22" r="5" fill="var(--risk-ok, #12805C)" />

                    {/* Browser URL Bar */}
                    <rect x="76" y="8" width="410" height="28" rx="6" fill="var(--bg)" stroke="var(--border)" />
                    <text x="90" y="27" fill="var(--text-dim)" fontSize="13.5" fontFamily="system-ui, sans-serif">
                      https://job-board.example/jobs/view/operations-coordinator
                    </text>

                    {/* Browser Extension Toolbar Icon */}
                    <rect x="498" y="8" width="28" height="28" rx="6" fill="var(--primary, #0A66C2)" />
                    <path d="M 512 12 L 518 15 C 518 21 515 25 512 27 C 509 25 506 21 506 15 Z" fill="#FFFFFF" />

                    {/* Window EXAMPLE badge (clean, non-overlapping) */}
                    <rect x="542" y="11" width="72" height="22" rx="4" fill="rgba(34, 211, 238, 0.12)" stroke="rgba(34, 211, 238, 0.3)" strokeWidth="0.8" />
                    <text x="553" y="26" fill="var(--accent-cyan, #22D3EE)" fontSize="11" fontWeight="700" letterSpacing="0.04em" fontFamily="system-ui, sans-serif">
                      EXAMPLE
                    </text>

                    {/* Schematic Webpage Wireframe */}
                    <rect x="28" y="68" width="200" height="14" rx="3" fill="rgba(255,255,255,0.12)" />
                    <rect x="28" y="94" width="140" height="10" rx="2" fill="rgba(255,255,255,0.06)" />
                    <rect x="28" y="112" width="170" height="10" rx="2" fill="rgba(255,255,255,0.06)" />
                    <rect x="28" y="130" width="120" height="10" rx="2" fill="rgba(255,255,255,0.06)" />
                    <rect x="28" y="158" width="210" height="8" rx="2" fill="rgba(255,255,255,0.04)" />
                    <rect x="28" y="174" width="190" height="8" rx="2" fill="rgba(255,255,255,0.04)" />
                    <rect x="28" y="190" width="160" height="8" rx="2" fill="rgba(255,255,255,0.04)" />
                    <rect x="28" y="206" width="180" height="8" rx="2" fill="rgba(255,255,255,0.04)" />
                    <rect x="28" y="222" width="170" height="8" rx="2" fill="rgba(255,255,255,0.04)" />

                    {/* Floating Extension Popup Overlay */}
                    <g filter="drop-shadow(0px 16px 36px rgba(0,0,0,0.7))">
                      <rect x="264" y="56" width="348" height="380" rx="12" fill="var(--surface)" stroke="rgba(34, 211, 238, 0.4)" strokeWidth="1.2" />

                      {/* Popup Header */}
                      <rect x="264" y="56" width="348" height="50" rx="12" fill="var(--surface)" />
                      <path d="M 264 106 L 612 106" stroke="var(--border)" strokeWidth="1" />

                      <rect x="280" y="69" width="24" height="24" rx="6" fill="var(--primary, #0A66C2)" />
                      <path d="M 292 73 L 297 76 C 297 81 294 84 292 86 C 290 84 287 81 287 76 Z" fill="#FFFFFF" />
                      <text x="312" y="86" fill="var(--text)" fontSize="16" fontWeight="700" fontFamily="system-ui, sans-serif">
                        CyberShield
                      </text>

                      <rect x="526" y="70" width="68" height="22" rx="4" fill="rgba(34, 211, 238, 0.12)" stroke="rgba(34, 211, 238, 0.3)" strokeWidth="0.8" />
                      <text x="537" y="85" fill="var(--accent-cyan, #22D3EE)" fontSize="11" fontWeight="700" letterSpacing="0.04em" fontFamily="system-ui, sans-serif">
                        EXAMPLE
                      </text>

                      {/* Scanned Item Kicker & Title */}
                      <text x="280" y="130" fill="var(--text-dim)" fontSize="12" fontWeight="700" letterSpacing="0.04em" fontFamily="system-ui, sans-serif">
                        DETECTED OFFER
                      </text>
                      <text x="280" y="152" fill="var(--text)" fontSize="15" fontWeight="600" fontFamily="system-ui, sans-serif">
                        Example Career Opportunity
                      </text>

                      {/* Verdict Banner in Popup */}
                      <rect x="280" y="166" width="316" height="42" rx="7" fill="var(--risk-bad-bg)" stroke="var(--risk-bad)" strokeWidth="1" />
                      <circle cx="300" cy="187" r="5" fill="var(--risk-bad)" />
                      <text x="314" y="193" fill="var(--risk-bad-text)" fontSize="16" fontWeight="700" fontFamily="system-ui, sans-serif">
                        High risk
                      </text>

                      {/* Evidence Rows (14px font, 34px height) */}
                      <rect x="280" y="218" width="316" height="34" rx="6" fill="var(--bg)" stroke="var(--border)" />
                      <circle cx="296" cy="235" r="4" fill="var(--risk-bad)" />
                      <text x="310" y="240" fill="var(--text)" fontSize="14" fontFamily="system-ui, sans-serif">
                        Domain registered 3 days ago
                      </text>

                      <rect x="280" y="260" width="316" height="34" rx="6" fill="var(--bg)" stroke="var(--border)" />
                      <circle cx="296" cy="277" r="4" fill="var(--risk-warn)" />
                      <text x="310" y="282" fill="var(--text)" fontSize="14" fontFamily="system-ui, sans-serif">
                        Free consumer webmail address
                      </text>

                      <rect x="280" y="302" width="316" height="34" rx="6" fill="var(--bg)" stroke="var(--border)" />
                      <circle cx="296" cy="319" r="4" fill="var(--risk-bad)" />
                      <text x="310" y="324" fill="var(--text)" fontSize="14" fontFamily="system-ui, sans-serif">
                        Unencrypted HTTP destination
                      </text>

                      {/* Action Button inside Popup */}
                      <rect x="280" y="348" width="316" height="38" rx="7" fill="var(--primary, #0A66C2)" />
                      <text x="368" y="372" fill="#FFFFFF" fontSize="14" fontWeight="600" fontFamily="system-ui, sans-serif">
                        View Full Proof &rarr;
                      </text>

                      {/* Ledger notice */}
                      <text x="330" y="414" fill="var(--text-dim)" fontSize="12" fontFamily="system-ui, sans-serif">
                        Tamper-evident ledger proof
                      </text>
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* =========================================================================
          5. WHAT DO YOU WANT TO CHECK? (FINAL TOOL CARDS & RESOURCE LINK)
         ========================================================================= */}
      <section className="home-section final-tools-section" id="get-started">
        <Container>
          <Reveal>
            <div className="section-header-block" style={{ marginBottom: '32px' }}>
              <h2>What do you want to check?</h2>
              <p className="section-subline" style={{ margin: '10px auto 0' }}>
                Pick a tool. Results in seconds, with proof you can verify later.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="final-tools-grid">
              {/* 1. Job Scam Check */}
              <Link
                to="/tools/job-scam-check"
                className="final-tool-card"
                aria-label="Job Scam Check: Fake job and internship offers"
              >
                <div className="final-tool-card-body">
                  <div className="final-tool-icon-wrap" aria-hidden="true">
                    <Briefcase size={22} color="var(--accent-cyan, #22D3EE)" />
                  </div>
                  <h3 className="final-tool-title">Job Scam Check</h3>
                  <p className="final-tool-desc">Fake job and internship offers</p>
                </div>
                <div className="final-tool-action">
                  <span>Start</span>
                  <ArrowRight size={14} className="final-tool-arrow" aria-hidden="true" />
                </div>
              </Link>

              {/* 2. UPI & Payment Check */}
              <Link
                to="/tools/upi-payment-check"
                className="final-tool-card"
                aria-label="UPI & Payment Check: Payment requests and receipts"
              >
                <div className="final-tool-card-body">
                  <div className="final-tool-icon-wrap" aria-hidden="true">
                    <Wallet size={22} color="var(--accent-cyan, #22D3EE)" />
                  </div>
                  <h3 className="final-tool-title">UPI &amp; Payment Check</h3>
                  <p className="final-tool-desc">Payment requests and receipts</p>
                </div>
                <div className="final-tool-action">
                  <span>Start</span>
                  <ArrowRight size={14} className="final-tool-arrow" aria-hidden="true" />
                </div>
              </Link>

              {/* 3. Message Scanner */}
              <Link
                to="/tools/message-scanner"
                className="final-tool-card"
                aria-label="Message Scanner: SMS, WhatsApp, Telegram, email"
              >
                <div className="final-tool-card-body">
                  <div className="final-tool-icon-wrap" aria-hidden="true">
                    <MessageSquare size={22} color="var(--accent-cyan, #22D3EE)" />
                  </div>
                  <h3 className="final-tool-title">Message Scanner</h3>
                  <p className="final-tool-desc">SMS, WhatsApp, Telegram, email</p>
                </div>
                <div className="final-tool-action">
                  <span>Start</span>
                  <ArrowRight size={14} className="final-tool-arrow" aria-hidden="true" />
                </div>
              </Link>
            </div>

            {/* Clean link to full Resources, Scam Guides & Limitations */}
            <div style={{ textAlign: 'center', marginTop: '28px' }}>
              <Link
                to="/resources"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14.5px',
                  color: 'var(--accent-cyan, #22D3EE)',
                  textDecoration: 'none',
                  fontWeight: 500
                }}
              >
                <span>Have questions or want to learn more? Explore Scam Guides, Limitations &amp; FAQ</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </Reveal>
        </Container>
      </section>
    </PageTransition>
  );
}

export default Home;
