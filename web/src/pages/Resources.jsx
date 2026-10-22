import React, { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Container, Card } from '../components/ui';
import { PageTransition } from '../components/wow';
import {
  HelpCircle,
  Briefcase,
  Wallet,
  MessageSquare,
  ShieldAlert,
  PhoneCall,
  CheckCircle2,
  AlertTriangle,
  Lock,
  FileText,
  ExternalLink,
  ChevronDown,
  Shield,
  Info
} from 'lucide-react';
import './resources.css';

const SECTIONS = [
  { id: 'how-it-works', label: 'How it works', icon: HelpCircle },
  { id: 'scam-guides', label: 'Scam guides', icon: ShieldAlert },
  { id: 'safety-checklist', label: 'Safety checklist', icon: PhoneCall },
  { id: 'faq', label: 'FAQ', icon: MessageSquare },
  { id: 'privacy-data', label: 'Privacy & data', icon: Shield },
  { id: 'limitations', label: 'Limitations', icon: AlertTriangle },
  { id: 'contact-report', label: 'Contact / Report', icon: ExternalLink }
];

const FAQ_ITEMS = [
  {
    id: 'faq-legal',
    question: 'Is this a legal finding?',
    answer:
      'No. Cyber Shield is an informational screening aid, not a legal finding or law enforcement determination. Evidence suggests risk indicators from public data and pattern analysis to help you make informed decisions before sharing personal or financial details.'
  },
  {
    id: 'faq-payment',
    question: 'Can it confirm a payment arrived?',
    answer:
      'No. Cyber Shield can never verify whether money was actually transferred, debited, or credited. It only screens payment messages, collect requests, and screenshots for known fraud patterns (such as pay-to-receive tricks).'
  },
  {
    id: 'faq-sender',
    question: 'Can it tell who sent a message?',
    answer:
      'No. Cyber Shield cannot identify the real-world identity or owner of a phone number, messaging handle, or email address. It only evaluates the text content, links, and phrasing patterns within the message.'
  },
  {
    id: 'faq-languages',
    question: 'Does it work with Hindi and Hinglish?',
    answer:
      'Yes. The AI reading component can analyze messages and screenshots written in Hindi, Hinglish, and English, identifying common fraud terminology, threats, and deceptive requests.'
  },
  {
    id: 'faq-screenshot',
    question: 'Do you keep my screenshot?',
    answer:
      'No. We do not keep your text or screenshot unless you sign in and the result is saved. Screenshots are processed in temporary memory to extract text, links, and UPI handles, and are discarded after analysis.'
  },
  {
    id: 'faq-proof',
    question: 'What is the Proof ID and Access Code?',
    answer:
      'Every completed check generates an immutable Proof ID and a one-time Access Code. The Access Code is shown once on your screen and is never stored on our server. You can use it later on the Verify page to inspect whether report sections were altered.'
  }
];

export function Resources() {
  const [activeSection, setActiveSection] = useState('how-it-works');
  const [expandedFaq, setExpandedFaq] = useState({ 'faq-legal': true });
  const location = useLocation();
  const isClickScrollingRef = useRef(false);
  const clickScrollTimerRef = useRef(null);

  // Helper to extract ?section= parameter from hash URL or standard search
  const getSectionFromUrl = () => {
    // 1. Check window.location.hash for ?section= (HashRouter format: #/resources?section=xyz)
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const params = new URLSearchParams(hash.substring(qIndex));
      const sec = params.get('section');
      if (sec) return sec;
    }
    // 2. Fallback to location.search
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('section');
  };

  // Scroll to section smoothly on mount or route change
  useEffect(() => {
    const targetSection = getSectionFromUrl();
    if (targetSection) {
      isClickScrollingRef.current = true;
      setActiveSection(targetSection);

      const timer = setTimeout(() => {
        const el = document.getElementById(targetSection);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (clickScrollTimerRef.current) clearTimeout(clickScrollTimerRef.current);
        clickScrollTimerRef.current = setTimeout(() => {
          isClickScrollingRef.current = false;
        }, 800);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      isClickScrollingRef.current = false;
    }
  }, [location.pathname, location.search, location.hash]);

  // IntersectionObserver for scroll-spy highlighting
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrollingRef.current) return;

        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          // Sort by nearest to top of viewport
          visible.sort((a, b) => {
            return Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top);
          });
          const currentId = visible[0].target.id;
          if (currentId) {
            setActiveSection(currentId);
            window.history.replaceState(null, '', `#/resources?section=${currentId}`);
          }
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: [0, 0.2, 0.5]
      }
    );

    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
      if (clickScrollTimerRef.current) clearTimeout(clickScrollTimerRef.current);
    };
  }, []);

  const handleNavClick = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      isClickScrollingRef.current = true;
      setActiveSection(id);
      window.history.replaceState(null, '', `#/resources?section=${id}`);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });

      if (clickScrollTimerRef.current) clearTimeout(clickScrollTimerRef.current);
      clickScrollTimerRef.current = setTimeout(() => {
        isClickScrollingRef.current = false;
      }, 800);
    }
  };

  const toggleFaq = (id) => {
    setExpandedFaq((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <PageTransition>
      <div className="resources-page-wrap">
        <Container>
          {/* Header Banner */}
          <div className="resources-header-banner">
            <span className="resources-kicker">
              <Info size={14} />
              Platform Knowledge &amp; Guidance
            </span>
            <h1>Resources &amp; Documentation</h1>
            <p>
              A single reference for how Cyber Shield evaluates risk, common scam patterns across
              employment, payments, and messaging, emergency reporting, and technical limitations.
            </p>
          </div>

          {/* Mobile Horizontal Sticky Chip Bar (< 900px) */}
          <div className="resources-mobile-chips-wrap" role="navigation" aria-label="Sections">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`resources-mobile-chip ${isActive ? 'active' : ''}`}
                  onClick={(e) => handleNavClick(e, s.id)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <Icon size={14} />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* Grid Layout (Desktop Sticky Sidebar + Content Stack) */}
          <div className="resources-grid-layout">
            {/* Desktop Sticky Sidebar (>= 900px) */}
            <aside className="resources-sidebar-sticky" aria-label="Page navigation">
              <span className="resources-sidebar-title">Contents</span>
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const isActive = activeSection === s.id;
                return (
                  <a
                    key={s.id}
                    href={`#/resources?section=${s.id}`}
                    className={`resources-nav-item ${isActive ? 'active' : ''}`}
                    onClick={(e) => handleNavClick(e, s.id)}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <Icon size={16} className="resources-nav-icon" />
                    <span>{s.label}</span>
                  </a>
                );
              })}
            </aside>

            {/* Main Content Sections Stack */}
            <div className="resources-content-stack">
              {/* =========================================================================
                  1. HOW IT WORKS
                 ========================================================================= */}
              <section id="how-it-works" className="resources-section">
                <div className="resources-section-header">
                  <span className="resources-kicker">
                    <HelpCircle size={14} />
                    Section 1
                  </span>
                  <h2 className="resources-section-title">How it works</h2>
                  <p className="resources-section-desc">
                    Cyber Shield screens job offers, UPI payment requests, and incoming messages using
                    live evidence and AI reading, anchoring every result with verifiable cryptographic proof.
                  </p>
                </div>

                <div className="resources-cards-stack">
                  {/* Job offers */}
                  <Card>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div
                        style={{
                          background: 'rgba(77, 163, 255, 0.12)',
                          border: '1px solid rgba(77, 163, 255, 0.25)',
                          borderRadius: '8px',
                          padding: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Briefcase size={20} color="var(--brand, #4DA3FF)" />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--ink)' }}>1. Job offers</h3>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Job Scam Check</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', lineHeight: 1.6 }}>
                      <p style={{ margin: 0, color: 'var(--text)' }}>
                        <strong>What you provide:</strong> A job listing URL, pasted offer description, and recruiter email address or messaging handle.
                      </p>
                      <div>
                        <strong style={{ color: 'var(--text)' }}>What we look at:</strong>
                        <ul style={{ margin: '4px 0 0', paddingLeft: '20px', color: 'var(--muted)' }}>
                          <li>
                            <strong>AI reading of the text:</strong> Flags advance registration fees, laptop/equipment deposits, interview-only-on-Telegram patterns, and unrealistic compensation claims.
                          </li>
                          <li>
                            <strong>Link lookups and domain age:</strong> Queries domain registration age via RDAP; flags newly registered domains claiming to represent established brands.
                          </li>
                          <li>
                            <strong>Company and recruiter signals:</strong> Checks business presence in public registries and flags corporate recruiters hiring exclusively from personal free webmail (@gmail, @yahoo).
                          </li>
                          <li>
                            <strong>Highlighted phrases with reasons:</strong> Highlights specific problematic text excerpts and explains why evidence suggests recruitment risk.
                          </li>
                        </ul>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text)' }}>
                        <strong>What you get:</strong> An objective calculated risk verdict, highlighted phrases with specific reasons, clear &ldquo;What to do now&rdquo; guidance, an immutable Proof ID, and a downloadable receipt (.json) and PDF report.
                      </p>
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '10px 14px',
                          fontSize: '12.5px',
                          color: 'var(--muted)'
                        }}
                      >
                        <strong style={{ color: 'var(--text-dim)' }}>Limits:</strong> Cannot verify if a legitimate company name was used by an impostor without contacting the company directly; absence of warning signs does not guarantee an offer is safe.
                      </div>
                    </div>
                  </Card>

                  {/* UPI & payment requests */}
                  <Card>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div
                        style={{
                          background: 'rgba(34, 211, 238, 0.12)',
                          border: '1px solid rgba(34, 211, 238, 0.25)',
                          borderRadius: '8px',
                          padding: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Wallet size={20} color="var(--accent-cyan, #22D3EE)" />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--ink)' }}>2. UPI &amp; payment requests</h3>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>UPI &amp; Payment Check</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', lineHeight: 1.6 }}>
                      <p style={{ margin: 0, color: 'var(--text)' }}>
                        <strong>What you provide:</strong> Payment message copy, collect request text, or an uploaded payment screenshot from your phone or desktop.
                      </p>
                      <div>
                        <strong style={{ color: 'var(--text)' }}>What we look at:</strong>
                        <ul style={{ margin: '4px 0 0', paddingLeft: '20px', color: 'var(--muted)' }}>
                          <li>
                            <strong>In-memory OCR reading:</strong> Extracts text, amounts, transaction notes, and UPI handles from screenshots without saving image files.
                          </li>
                          <li>
                            <strong>Pay-to-receive trick detection:</strong> Flags instructions asking you to enter your UPI PIN or approve a collect request to receive money, refunds, or cashback.
                          </li>
                          <li>
                            <strong>Handle format validation:</strong> Inspects UPI handle structure against recognized Indian banking and PSP conventions.
                          </li>
                          <li>
                            <strong>Highlighted phrases with reasons:</strong> Highlights deceptive passages and explains the mechanics of how the request would debit your account.
                          </li>
                        </ul>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text)' }}>
                        <strong>What you get:</strong> An objective calculated risk verdict, highlighted phrases with specific reasons, immediate banking advisory on what to do now, an immutable Proof ID, and a downloadable receipt and PDF report.
                      </p>
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '10px 14px',
                          fontSize: '12.5px',
                          color: 'var(--muted)'
                        }}
                      >
                        <strong style={{ color: 'var(--text-dim)' }}>Limits:</strong> Cannot confirm that a payment arrived or left an account; cannot determine whose UPI ID it is; cannot recall or reverse a transaction.
                      </div>
                    </div>
                  </Card>

                  {/* Messages & screenshots */}
                  <Card>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <div
                        style={{
                          background: 'rgba(168, 85, 247, 0.12)',
                          border: '1px solid rgba(168, 85, 247, 0.25)',
                          borderRadius: '8px',
                          padding: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <MessageSquare size={20} color="#C084FC" />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--ink)' }}>3. Messages &amp; screenshots</h3>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Message Scanner</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px', lineHeight: 1.6 }}>
                      <p style={{ margin: 0, color: 'var(--text)' }}>
                        <strong>What you provide:</strong> SMS, WhatsApp, Telegram, or email text, or an uploaded screenshot of the conversation.
                      </p>
                      <div>
                        <strong style={{ color: 'var(--text)' }}>What we look at:</strong>
                        <ul style={{ margin: '4px 0 0', paddingLeft: '20px', color: 'var(--muted)' }}>
                          <li>
                            <strong>In-memory OCR extraction:</strong> Extracts message copy, phone numbers, tracking IDs, and embedded links directly in memory.
                          </li>
                          <li>
                            <strong>Threat intelligence &amp; domain checks:</strong> Queries URLs against live threat feeds (URLhaus, VirusTotal) and evaluates domain registration age.
                          </li>
                          <li>
                            <strong>Dual-pass AI reading:</strong> Identifies coercion tactics, urgent electricity/parcel cutoff threats, fake law enforcement summons, and KYC suspension lures across English, Hindi, and Hinglish.
                          </li>
                          <li>
                            <strong>Highlighted phrases with reasons:</strong> Highlights manipulative language with plain-language explanations of deceptive tactics.
                          </li>
                        </ul>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text)' }}>
                        <strong>What you get:</strong> An objective calculated risk verdict, highlighted phrases with reasons, next-step action guidance, an immutable Proof ID, and a downloadable receipt and PDF report.
                      </p>
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '10px 14px',
                          fontSize: '12.5px',
                          color: 'var(--muted)'
                        }}
                      >
                        <strong style={{ color: 'var(--text-dim)' }}>Limits:</strong> Cannot tell who sent a message; cannot confirm whether an attached document, parcel notice, or certificate is genuine; cannot validate official agency notices.
                      </div>
                    </div>
                  </Card>

                  {/* Proof IDs and the Verify page */}
                  <Card>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <div
                        style={{
                          background: 'rgba(34, 211, 238, 0.12)',
                          border: '1px solid rgba(34, 211, 238, 0.25)',
                          borderRadius: '8px',
                          padding: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Shield size={20} color="var(--accent-cyan, #22D3EE)" />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--ink)' }}>Proof IDs and the Verify page</h3>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Tamper-evident verification ledger</span>
                      </div>
                    </div>

                    <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: '0 0 12px' }}>
                      Every completed check generates a SHA-256 canonical hash of the inputs and findings, recorded on an append-only verification ledger. Along with your Proof ID, you receive a one-time Access Code shown on your screen (never stored on our server).
                    </p>
                    <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: '0 0 12px' }}>
                      Anyone with the downloaded receipt file or the Proof ID and hash can visit{' '}
                      <Link to="/verify" style={{ color: 'var(--brand, #4DA3FF)', textDecoration: 'underline' }}>
                        /verify
                      </Link>{' '}
                      to independently verify:
                    </p>
                    <ul style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6, margin: '0 0 14px', paddingLeft: '20px' }}>
                      <li>That the ledger record exists and the cryptographic chain is intact</li>
                      <li>That no section of the issued report has been altered, edited, or fabricated</li>
                      <li>The exact timestamp and block index when the screening occurred</li>
                    </ul>
                  </Card>
                </div>

                <div className="resources-section-footer">
                  Screening aid, not a legal finding.
                </div>
              </section>

              {/* =========================================================================
                  2. SCAM GUIDES
                 ========================================================================= */}
              <section id="scam-guides" className="resources-section">
                <div className="resources-section-header">
                  <span className="resources-kicker">
                    <ShieldAlert size={14} />
                    Section 2
                  </span>
                  <h2 className="resources-section-title">Scam guides (job, UPI, message)</h2>
                  <p className="resources-section-desc">
                    Recognize typical recruitment, payment, and phishing tactics before sharing sensitive personal or financial information.
                  </p>
                </div>

                <div className="resources-cards-stack">
                  <Card>
                    <h3 style={{ fontSize: '17px', marginBottom: '14px', color: 'var(--ink)' }}>Understanding key screening vectors</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                      <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px' }}>
                        <strong style={{ fontSize: '14px', color: 'var(--text)' }}>1. Domain Age &amp; Threat Intelligence</strong>
                        <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5 }}>
                          Newly registered domains (under 30 days old) claiming to belong to long-standing corporations or banks are a primary warning sign.
                        </p>
                      </div>

                      <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px' }}>
                        <strong style={{ fontSize: '14px', color: 'var(--text)' }}>2. Language &amp; Coercive Urgency</strong>
                        <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5 }}>
                          Artificial deadlines, threats of account disconnection, immediate legal arrest warnings, or demands for upfront fees indicate high risk.
                        </p>
                      </div>

                      <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px' }}>
                        <strong style={{ fontSize: '14px', color: 'var(--text)' }}>3. Pay-to-Receive Mechanisms</strong>
                        <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5 }}>
                          Entering a UPI PIN or approving a collect request will always debit funds from your account. Legitimate refunds and cashback arrive automatically.
                        </p>
                      </div>

                      <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px' }}>
                        <strong style={{ fontSize: '14px', color: 'var(--text)' }}>4. Sender Identity &amp; Webmail</strong>
                        <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5 }}>
                          Official organizations communicate through verified corporate domains and authenticated channels rather than generic personal webmail.
                        </p>
                      </div>
                    </div>
                  </Card>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <Card>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <AlertTriangle size={18} color="#C62828" />
                        <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--ink)' }}>1. Fake job registration fees</h3>
                      </div>
                      <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.5, margin: 0 }}>
                        The applicant is asked to pay an upfront &ldquo;registration fee&rdquo;, &ldquo;portal processing charge&rdquo;, or &ldquo;laptop deposit&rdquo; before an interview or equipment dispatch. Legitimate employers never charge candidates to apply.
                      </p>
                    </Card>

                    <Card>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <AlertTriangle size={18} color="#C62828" />
                        <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--ink)' }}>2. Pay-to-receive UPI collect fraud</h3>
                      </div>
                      <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.5, margin: 0 }}>
                        Fraudsters send a collect request claiming it will &ldquo;credit&rdquo; an approved refund, cashback, or OLX buyer payment. Entering your UPI PIN immediately debits your account.
                      </p>
                    </Card>

                    <Card>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <AlertTriangle size={18} color="#C62828" />
                        <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--ink)' }}>3. Urgent parcel or electricity cutoff alerts</h3>
                      </div>
                      <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.5, margin: 0 }}>
                        SMS or WhatsApp messages warning that a delivery is blocked or power will be disconnected tonight due to an unpaid bill, directing you to click an unverified link or pay a nominal fee.
                      </p>
                    </Card>

                    <Card>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <AlertTriangle size={18} color="#B7791F" />
                        <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--ink)' }}>4. Free-email recruiter &amp; chat-only hiring</h3>
                      </div>
                      <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.5, margin: 0 }}>
                        The recruiter claims to represent a recognized enterprise but conducts interviews exclusively over Telegram or WhatsApp and sends messages from personal webmail accounts.
                      </p>
                    </Card>
                  </div>
                </div>

                <div className="resources-section-footer">
                  Screening aid, not a legal finding.
                </div>
              </section>

              {/* =========================================================================
                  3. SAFETY CHECKLIST
                 ========================================================================= */}
              <section id="safety-checklist" className="resources-section">
                <div className="resources-section-header">
                  <span className="resources-kicker">
                    <PhoneCall size={14} />
                    Section 3
                  </span>
                  <h2 className="resources-section-title">Safety checklist</h2>
                  <p className="resources-section-desc">
                    Practical preventative precautions and official national incident reporting channels.
                  </p>
                </div>

                <div className="resources-cards-stack">
                  <Card>
                    <h3 style={{ fontSize: '17px', marginBottom: '12px', color: 'var(--ink)' }}>What to do before taking action</h3>
                    <ul style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.7, margin: 0, paddingLeft: '20px' }}>
                      <li>Never transfer money or pay advance fees to secure employment, prizes, or refunds.</li>
                      <li>Never enter your UPI PIN to receive money or approve unfamiliar collect requests.</li>
                      <li>Verify unexpected messages through official apps or published customer care numbers.</li>
                    </ul>
                  </Card>

                  <Card style={{ borderLeft: '4px solid var(--brand, #4DA3FF)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                      <PhoneCall size={22} color="var(--brand, #4DA3FF)" />
                      <div>
                        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--ink)' }}>National Cyber Crime Reporting (Helpline 1930)</h3>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Citizen Financial Cyber Fraud Reporting System</span>
                      </div>
                    </div>
                    <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 14px' }}>
                      The Citizen Financial Cyber Fraud Reporting and Management System (Helpline 1930) enables immediate reporting to intercept fraudulent bank transfers.
                    </p>
                    <p style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600, margin: '0 0 16px' }}>
                      Official National Cyber Crime Reporting Portal:{' '}
                      <a
                        href="https://cybercrime.gov.in"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--brand, #4DA3FF)', textDecoration: 'underline' }}
                      >
                        cybercrime.gov.in
                      </a>
                    </p>

                    <h4 style={{ fontSize: '14.5px', marginBottom: '10px', color: 'var(--ink)' }}>Immediate steps if you sent funds:</h4>
                    <ol style={{ paddingLeft: '20px', color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.7, margin: 0 }}>
                      <li>Notify your bank immediately to freeze the affected account and request an urgent transaction recall.</li>
                      <li>Call 1930 or file an incident report at <strong>cybercrime.gov.in</strong> as quickly as possible.</li>
                      <li>Save all evidence: chat histories, emails, payment receipts, bank transaction IDs, and website URLs.</li>
                      <li>File a formal complaint with your local cyber police station.</li>
                    </ol>
                  </Card>
                </div>

                <div className="resources-section-footer">
                  Screening aid, not a legal finding.
                </div>
              </section>

              {/* =========================================================================
                  4. FAQ
                 ========================================================================= */}
              <section id="faq" className="resources-section">
                <div className="resources-section-header">
                  <span className="resources-kicker">
                    <MessageSquare size={14} />
                    Section 4
                  </span>
                  <h2 className="resources-section-title">Frequently Asked Questions</h2>
                  <p className="resources-section-desc">
                    Answers to common questions regarding Cyber Shield capabilities, data retention, and cryptographic verification.
                  </p>
                </div>

                <div className="resources-faq-list">
                  {FAQ_ITEMS.map((item) => {
                    const isExpanded = !!expandedFaq[item.id];
                    return (
                      <div key={item.id} className="resources-faq-item">
                        <button
                          type="button"
                          className="resources-faq-trigger"
                          aria-expanded={isExpanded}
                          onClick={() => toggleFaq(item.id)}
                        >
                          <span>{item.question}</span>
                          <ChevronDown size={18} />
                        </button>
                        {isExpanded && <div className="resources-faq-body">{item.answer}</div>}
                      </div>
                    );
                  })}
                </div>

                <div className="resources-section-footer">
                  Screening aid, not a legal finding.
                </div>
              </section>

              {/* =========================================================================
                  5. PRIVACY & DATA
                 ========================================================================= */}
              <section id="privacy-data" className="resources-section">
                <div className="resources-section-header">
                  <span className="resources-kicker">
                    <Shield size={14} />
                    Section 5
                  </span>
                  <h2 className="resources-section-title">Privacy &amp; data</h2>
                  <p className="resources-section-desc">
                    How Cyber Shield handles submitted check data, in-memory processing, and cryptographic verification records.
                  </p>
                </div>

                <div className="resources-cards-stack">
                  <div className="resources-draft-notice">
                    Draft for review, not legal advice
                  </div>

                  <Card>
                    <h3 style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--ink)' }}>Information processed</h3>
                    <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: 0 }}>
                      When you run a check, we process the provided text, links, or uploaded screenshots directly in memory to execute verification checks. We do not keep your text or screenshot unless you sign in and the result is saved. Anonymous scans expire after 30 days.
                    </p>
                  </Card>

                  <Card>
                    <h3 style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--ink)' }}>Check storage, retention, and access</h3>
                    <ul style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.7, margin: 0, paddingLeft: '20px' }}>
                      <li>We do not keep your text or screenshot unless you sign in and the result is saved.</li>
                      <li>Anonymous checks expire after 30 days.</li>
                      <li>The Access Code is generated in page memory and never stored on the server.</li>
                      <li>Only the server can read saved checks.</li>
                    </ul>
                  </Card>

                  <Card>
                    <h3 style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--ink)' }}>Verification and ledger</h3>
                    <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: 0 }}>
                      Checks generate a SHA-256 report hash and an append-only ledger entry. The ledger stores verification hashes and section summaries; it does not publish your private applicant credentials, chat logs, or personal payment details.
                    </p>
                  </Card>
                </div>

                <div className="resources-section-footer">
                  Screening aid, not a legal finding.
                </div>
              </section>

              {/* =========================================================================
                  6. LIMITATIONS
                 ========================================================================= */}
              <section id="limitations" className="resources-section">
                <div className="resources-section-header">
                  <span className="resources-kicker">
                    <AlertTriangle size={14} />
                    Section 6
                  </span>
                  <h2 className="resources-section-title">Limitations</h2>
                  <p className="resources-section-desc">
                    Clear boundaries on what Cyber Shield can and cannot evaluate, and terms governing screening aid usage.
                  </p>
                </div>

                <div className="resources-cards-stack">
                  <Card>
                    <h3 style={{ fontSize: '18px', marginBottom: '16px', color: 'var(--ink)' }}>What a check can and cannot do</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                      <div
                        style={{
                          background: 'rgba(18, 128, 92, 0.08)',
                          border: '1px solid rgba(18, 128, 92, 0.25)',
                          borderRadius: '10px',
                          padding: '16px'
                        }}
                      >
                        <h4
                          style={{
                            margin: '0 0 10px',
                            fontSize: '14.5px',
                            color: 'var(--risk-ok-text, #34D399)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          <CheckCircle2 size={16} /> What a check can do
                        </h4>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: '18px',
                            color: 'var(--text-dim, #C9D3E3)',
                            fontSize: '13px',
                            lineHeight: 1.65
                          }}
                        >
                          <li>Spot warning signs and known scam patterns across jobs, UPI, and messages</li>
                          <li>Highlight suspicious phrases and explain why they are risky</li>
                          <li>Look up domain age via RDAP, redirect hops, and live URL threat feeds</li>
                          <li>Provide actionable steps on what to do now if you suspect fraud</li>
                        </ul>
                      </div>

                      <div
                        style={{
                          background: 'rgba(198, 40, 40, 0.08)',
                          border: '1px solid rgba(198, 40, 40, 0.25)',
                          borderRadius: '10px',
                          padding: '16px'
                        }}
                      >
                        <h4
                          style={{
                            margin: '0 0 10px',
                            fontSize: '14.5px',
                            color: 'var(--risk-bad-text, #F87171)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          <AlertTriangle size={16} /> What a check cannot do
                        </h4>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: '18px',
                            color: 'var(--text-dim, #C9D3E3)',
                            fontSize: '13px',
                            lineHeight: 1.65
                          }}
                        >
                          <li>Cannot confirm that a payment arrived or left an account</li>
                          <li>Cannot tell who sent a message or who created a communication</li>
                          <li>Cannot confirm whose UPI ID it is or who owns an account</li>
                          <li>Cannot confirm that a receipt, document, or certificate is genuine</li>
                          <li>Cannot provide a legal finding or law enforcement determination</li>
                        </ul>
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <h3 style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--ink)' }}>Screening aid disclaimer</h3>
                    <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: '0 0 14px' }}>
                      Cyber Shield is an automated screening aid that evaluates public web signals and text patterns. It does not provide legal advice, legal findings, or binding determinations regarding any individual or organization.
                    </p>
                    <h3 style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--ink)' }}>User responsibility</h3>
                    <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: 0 }}>
                      Users should exercise independent judgment and verify corporate employment opportunities, payment requests, and communications through official portals and verified channels before entering into agreements, authorizing payments, or sharing confidential information.
                    </p>
                  </Card>
                </div>

                <div className="resources-section-footer">
                  Screening aid, not a legal finding.
                </div>
              </section>

              {/* =========================================================================
                  7. CONTACT / REPORT
                 ========================================================================= */}
              <section id="contact-report" className="resources-section">
                <div className="resources-section-header">
                  <span className="resources-kicker">
                    <ExternalLink size={14} />
                    Section 7
                  </span>
                  <h2 className="resources-section-title">Contact / Report</h2>
                  <p className="resources-section-desc">
                    Official incident reporting pathways, platform feedback, and mission details.
                  </p>
                </div>

                <div className="resources-cards-stack">
                  <Card>
                    <h3 style={{ fontSize: '17px', marginBottom: '8px', color: 'var(--ink)' }}>Incident Reporting</h3>
                    <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: '0 0 12px' }}>
                      If you have suffered financial loss or received a fraudulent solicitation, report immediately to official authorities:
                    </p>
                    <ul style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.7, margin: '0 0 14px', paddingLeft: '20px' }}>
                      <li>
                        <strong>National Cyber Crime Helpline:</strong> Call <strong>1930</strong>
                      </li>
                      <li>
                        <strong>Online Reporting Portal:</strong>{' '}
                        <a
                          href="https://cybercrime.gov.in"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--brand, #4DA3FF)', textDecoration: 'underline' }}
                        >
                          cybercrime.gov.in
                        </a>
                      </li>
                    </ul>
                  </Card>

                  <Card>
                    <h3 style={{ fontSize: '17px', marginBottom: '8px', color: 'var(--ink)' }}>Get in touch &amp; Feedback</h3>
                    <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: '0 0 14px' }}>
                      For inquiries, technical feedback, suggesting new threat indicators, or reporting issues with our screening aid, please reach out through our project repository and community channels.
                    </p>
                    <h3 style={{ fontSize: '17px', marginBottom: '8px', color: 'var(--ink)' }}>About Cyber Shield</h3>
                    <p style={{ color: 'var(--muted)', fontSize: '13.5px', lineHeight: 1.6, margin: 0 }}>
                      Fraudsters target individuals using deceptive links, advance-fee recruitment scams, collect-request traps, and phishing alerts. Cyber Shield provides accessible, automated checks to surface objective evidence and cryptographic proof before personal or financial information is shared.
                    </p>
                  </Card>
                </div>

                <div className="resources-section-footer">
                  Screening aid, not a legal finding.
                </div>
              </section>
            </div>
          </div>
        </Container>
      </div>
    </PageTransition>
  );
}

export default Resources;
