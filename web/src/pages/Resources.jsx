import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Container } from '../components/ui';
import { PageTransition } from '../components/wow';
import {
  ShieldAlert,
  PhoneCall,
  MessageSquare,
  Shield,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Lock,
  Sparkles,
  Info,
  Briefcase,
  Wallet,
  ArrowRight
} from 'lucide-react';
import './resources.css';

const FAQ_ITEMS = [
  {
    id: 'faq-legal',
    question: 'Is Cyber Shield a legal finding or law enforcement verdict?',
    answer:
      'No. Cyber Shield is an informational screening aid, not a legal finding or law enforcement determination. Evidence suggests risk indicators from public registry data and AI pattern analysis to help you make informed decisions before sharing personal or financial details.'
  },
  {
    id: 'faq-payment',
    question: 'Can Cyber Shield confirm if money was transferred?',
    answer:
      'No. Cyber Shield can never verify whether bank funds were actually debited, credited, or delivered. It inspects payment requests, VPAs, and screenshots for known fraud patterns (such as pay-to-receive tricks or forged confirmation layouts).'
  },
  {
    id: 'faq-sender',
    question: 'Can Cyber Shield identify who sent an SMS or message?',
    answer:
      'No. Cyber Shield cannot identify the real-world identity or owner of a phone number, messaging handle, or email address. It evaluates message text content, links, and phrasing patterns against known impersonation templates.'
  },
  {
    id: 'faq-languages',
    question: 'Does the scanner work with Hindi and Hinglish?',
    answer:
      'Yes. The AI reading component analyzes messages and screenshots written in English, Hindi, and Hinglish, identifying deceptive phrasing, urgency cues, and fraud terminology commonly used in Indian scams.'
  },
  {
    id: 'faq-screenshot',
    question: 'Do you keep my uploaded screenshot or pasted text?',
    answer:
      'No. Guest checks are processed in temporary memory to extract text, links, and payment identifiers, and are discarded immediately after analysis. If you sign in, only your final screening summary is saved to your account history, and you can delete it anytime.'
  },
  {
    id: 'faq-proof',
    question: 'What is the Proof ID and Access Code?',
    answer:
      'Every completed check generates an immutable Proof ID and a one-time Access Code. The Access Code is shown once on your screen and is never stored on our server. Anyone can use the Proof ID on the Verify page to inspect whether report findings were altered.'
  }
];

export function Resources() {
  const [openFaqId, setOpenFaqId] = useState('faq-legal');
  const location = useLocation();

  // Helper to extract ?section= parameter from hash URL or standard search
  const getSectionFromUrl = () => {
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const params = new URLSearchParams(hash.substring(qIndex));
      const sec = params.get('section');
      if (sec) return sec;
    }
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('section');
  };

  // Scroll to requested section on mount or URL change
  useEffect(() => {
    const targetSection = getSectionFromUrl();
    if (targetSection) {
      const timer = setTimeout(() => {
        const el = document.getElementById(targetSection);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [location.pathname, location.search, location.hash]);

  const toggleFaq = (id) => {
    setOpenFaqId((prev) => (prev === id ? null : id));
  };

  return (
    <PageTransition>
      <div className="resources-page-wrap">
        <Container>
          {/* Centered Hero Header (matches Pricing & Verify pages) */}
          <div className="resources-hero">
            <span className="resources-eyebrow">
              <Sparkles size={14} />
              Knowledge &amp; Verification Guidance
            </span>
            <h1>Fraud Prevention &amp; Safety Resources</h1>
            <p>
              Practical scam guides, emergency reporting hotlines, screening limitations,
              and data transparency across employment, payments, and messaging.
            </p>
          </div>

          <div className="resources-container-stack">
            {/* =========================================================================
                1. SCAM GUIDES
               ========================================================================= */}
            <section id="scam-guides" className="resources-content-card">
              <div className="resources-card-header">
                <span className="resources-card-kicker">
                  <ShieldAlert size={14} />
                  Threat Catalog
                </span>
                <h2>Scam guides</h2>
                <p>Learn the tactics, psychological tricks, and mechanics used across the three major digital fraud vectors in India.</p>
              </div>

              <div className="resources-three-grid">
                {/* Guide 1: Job Scams */}
                <div className="resources-guide-card">
                  <div className="resources-guide-head">
                    <div className="resources-guide-icon guide-icon-job">
                      <Briefcase size={20} />
                    </div>
                    <h3>Job offer scams</h3>
                  </div>
                  <ul className="resources-feature-list">
                    <li>
                      <CheckCircle2 size={15} color="var(--brand, #4DA3FF)" />
                      <span><strong>Advance Fees:</strong> Demand for &ldquo;registration fees&rdquo;, medical clearance, or uniform charges before joining.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="var(--brand, #4DA3FF)" />
                      <span><strong>Telegram Interviews:</strong> Hiring entirely on Telegram or WhatsApp without video calls or official corporate email.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="var(--brand, #4DA3FF)" />
                      <span><strong>Fake Domains:</strong> Lookalike domains created days ago claiming to represent top multinational companies.</span>
                    </li>
                  </ul>
                  <div className="resources-card-cta">
                    <Link to="/tools/job-scam-check" className="resources-inline-link">
                      <span>Screen a job offer</span>
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>

                {/* Guide 2: UPI Scams */}
                <div className="resources-guide-card">
                  <div className="resources-guide-head">
                    <div className="resources-guide-icon guide-icon-upi">
                      <Wallet size={20} />
                    </div>
                    <h3>UPI payment scams</h3>
                  </div>
                  <ul className="resources-feature-list">
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>Pay-to-Receive:</strong> Scammers send a Collect Request and claim you must &ldquo;Enter PIN to receive prize or refund&rdquo;.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>Fake Screenshots:</strong> Manipulated transaction confirmation screens with forged bank logos and fake reference numbers.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>Overpayment Trick:</strong> Claiming to have &ldquo;mistakenly sent extra money&rdquo; and demanding immediate return transfer.</span>
                    </li>
                  </ul>
                  <div className="resources-card-cta">
                    <Link to="/tools/upi-payment-check" className="resources-inline-link">
                      <span>Screen a UPI ID</span>
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>

                {/* Guide 3: Message Scams */}
                <div className="resources-guide-card">
                  <div className="resources-guide-head">
                    <div className="resources-guide-icon guide-icon-msg">
                      <MessageSquare size={20} />
                    </div>
                    <h3>Message &amp; SMS scams</h3>
                  </div>
                  <ul className="resources-feature-list">
                    <li>
                      <CheckCircle2 size={15} color="#A78BFA" />
                      <span><strong>Utility Cut-Off Panic:</strong> Fake warnings that your electricity or gas will be disconnected tonight at 9:30 PM.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="#A78BFA" />
                      <span><strong>Part-Time Tasks:</strong> Promises of ₹3,000–₹8,000 daily for liking YouTube videos or rating Google Maps locations.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="#A78BFA" />
                      <span><strong>Courier / Customs Alert:</strong> Phishing links alleging your parcel has an invalid address or unpaid ₹25 duty fee.</span>
                    </li>
                  </ul>
                  <div className="resources-card-cta">
                    <Link to="/tools/message-scanner" className="resources-inline-link">
                      <span>Screen a message</span>
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            {/* =========================================================================
                2. SAFETY CHECKLIST
               ========================================================================= */}
            <section id="safety-checklist" className="resources-content-card">
              <div className="resources-card-header">
                <span className="resources-card-kicker">
                  <PhoneCall size={14} />
                  Emergency &amp; Prevention
                </span>
                <h2>Safety checklist</h2>
                <p>Critical immediate steps to safeguard your finances and report cyber threats in India.</p>
              </div>

              {/* 1930 Helpline Banner */}
              <div className="resources-helpline-box">
                <div className="resources-helpline-icon">
                  <PhoneCall size={28} />
                </div>
                <div className="resources-helpline-meta">
                  <span className="resources-helpline-tag">National Emergency Helpline</span>
                  <h3>Call 1930 within the Golden Hour</h3>
                  <p>
                    If money was fraudulently debited from your bank account or UPI app, immediately dial
                    <strong> 1930</strong> (Citizen Financial Cyber Fraud Reporting System) to freeze funds before they leave the banking network.
                  </p>
                </div>
                <a href="tel:1930" className="btn-card-primary resources-call-btn">
                  <span>Call 1930</span>
                </a>
              </div>

              {/* Rules Checklist Grid */}
              <div className="resources-two-grid" style={{ marginTop: '20px' }}>
                <div className="resources-check-item">
                  <div className="resources-rule-num">1</div>
                  <div>
                    <strong>UPI PIN is ONLY for sending money</strong>
                    <p>You NEVER need to enter your 4-digit or 6-digit UPI PIN to receive money, refunds, or cashback.</p>
                  </div>
                </div>

                <div className="resources-check-item">
                  <div className="resources-rule-num">2</div>
                  <div>
                    <strong>Legitimate employers never charge candidates</strong>
                    <p>No genuine company asks candidates to pay for interviews, registration, badge delivery, or laptops.</p>
                  </div>
                </div>

                <div className="resources-check-item">
                  <div className="resources-rule-num">3</div>
                  <div>
                    <strong>Check the domain registration age</strong>
                    <p>Scammers launch lookalike domains days before campaigns. Real corporate websites are registered for years.</p>
                  </div>
                </div>

                <div className="resources-check-item">
                  <div className="resources-rule-num">4</div>
                  <div>
                    <strong>Never install APKs or remote desktop apps</strong>
                    <p>Do not install apps from links or APK downloads sent on chat (AnyDesk, TeamViewer, RustDesk, or QuickSupport).</p>
                  </div>
                </div>
              </div>
            </section>

            {/* =========================================================================
                3. FREQUENTLY ASKED QUESTIONS (FAQ)
               ========================================================================= */}
            <section id="faq" className="resources-content-card">
              <div className="resources-card-header">
                <span className="resources-card-kicker">
                  <MessageSquare size={14} />
                  Common Questions
                </span>
                <h2>Frequently asked questions</h2>
                <p>Everything you need to know about checks, findings, privacy, and verification.</p>
              </div>

              <div className="resources-faq-list">
                {FAQ_ITEMS.map((faq) => {
                  const isOpen = openFaqId === faq.id;
                  return (
                    <div key={faq.id} className="resources-faq-item">
                      <button
                        type="button"
                        className="resources-faq-trigger"
                        aria-expanded={isOpen}
                        onClick={() => toggleFaq(faq.id)}
                      >
                        <span>{faq.question}</span>
                        <ChevronDown size={18} className={`faq-chevron ${isOpen ? 'rotated' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="resources-faq-body">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* =========================================================================
                4. PRIVACY & DATA
               ========================================================================= */}
            <section id="privacy-data" className="resources-content-card">
              <div className="resources-card-header">
                <span className="resources-card-kicker">
                  <Shield size={14} />
                  Data Protection
                </span>
                <h2>Privacy &amp; data handling</h2>
                <p>Cyber Shield is built with strict data minimization principles by design.</p>
              </div>

              <div className="resources-two-grid">
                <div className="resources-privacy-card">
                  <div className="resources-privacy-head">
                    <Lock size={20} color="var(--brand, #4DA3FF)" />
                    <h3>In-memory processing</h3>
                  </div>
                  <p>
                    Text and screenshots submitted for screening are evaluated in transient memory.
                    Raw images are never stored on persistent disks or shared with third parties.
                  </p>
                </div>

                <div className="resources-privacy-card">
                  <div className="resources-privacy-head">
                    <Shield size={20} color="var(--risk-ok-text, #34D399)" />
                    <h3>User data control</h3>
                  </div>
                  <p>
                    Saved check history is accessible solely by the signed-in account. You can purge
                    individual checks or delete your entire account and history instantly from Settings.
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-start' }}>
                <Link to="/privacy" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, color: 'var(--accent-cyan, #22D3EE)', textDecoration: 'none' }}>
                  <span>Read complete Privacy Policy &amp; data retention rules &rarr;</span>
                </Link>
              </div>
            </section>

            {/* =========================================================================
                5. LIMITATIONS
               ========================================================================= */}
            <section id="limitations" className="resources-content-card">
              <div className="resources-card-header">
                <span className="resources-card-kicker">
                  <AlertTriangle size={14} />
                  Transparency
                </span>
                <h2>Limitations</h2>
                <p>Clear boundaries on what Cyber Shield can and cannot do.</p>
              </div>

              <div className="resources-two-grid">
                {/* What it CAN do */}
                <div className="resources-limit-card limit-can">
                  <h3 className="limit-title can-title">
                    <CheckCircle2 size={18} color="var(--risk-ok-text, #34D399)" />
                    What Cyber Shield DOES
                  </h3>
                  <ul className="resources-limit-list">
                    <li>Extracts text, domains, and VPAs from pasted text or screenshots.</li>
                    <li>Evaluates public registration records (RDAP) and registry footprints.</li>
                    <li>Highlights manipulative phrasing and explains specific risk indicators.</li>
                    <li>Generates tamper-evident cryptographic Proof IDs for independent verification.</li>
                  </ul>
                </div>

                {/* What it CANNOT do */}
                <div className="resources-limit-card limit-cannot">
                  <h3 className="limit-title cannot-title">
                    <XCircle size={18} color="#F87171" />
                    What Cyber Shield CANNOT do
                  </h3>
                  <ul className="resources-limit-list">
                    <li>Cannot serve as legal evidence or police determination in court.</li>
                    <li>Cannot verify whether bank funds actually moved or reached an account.</li>
                    <li>Cannot unmask the private real-world identity behind an anonymous number.</li>
                    <li>Cannot recover stolen funds (call 1930 immediately for financial recovery).</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* =========================================================================
                6. CONTACT / REPORT
               ========================================================================= */}
            <section id="contact-report" className="resources-content-card">
              <div className="resources-card-header">
                <span className="resources-card-kicker">
                  <ExternalLink size={14} />
                  Official Reporting
                </span>
                <h2>Contact &amp; Report</h2>
                <p>Report cyber incidents to authorized Indian cybercrime authorities and reach out to our team.</p>
              </div>

              <div className="resources-three-grid">
                <div className="resources-contact-card">
                  <h3>National Cybercrime Portal</h3>
                  <p>Official Government of India portal for filing cyber crime and financial fraud complaints online.</p>
                  <a
                    href="https://cybercrime.gov.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="resources-contact-btn"
                  >
                    <span>cybercrime.gov.in</span>
                    <ExternalLink size={14} />
                  </a>
                </div>

                <div className="resources-contact-card">
                  <h3>Chakshu Portal</h3>
                  <p>Department of Telecommunications portal for reporting suspected fraudulent calls, SMS, and WhatsApp messages.</p>
                  <a
                    href="https://sancharsaathi.gov.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="resources-contact-btn"
                  >
                    <span>sancharsaathi.gov.in</span>
                    <ExternalLink size={14} />
                  </a>
                </div>

                <div className="resources-contact-card">
                  <h3>Report False Positive</h3>
                  <p>Found a legitimate offer or merchant incorrectly flagged? Submit details for review by our engineering team.</p>
                  <a
                    href="mailto:support@cybershield.in?subject=Report%20False%20Positive"
                    className="resources-contact-btn"
                  >
                    <span>Contact Support</span>
                    <ArrowRight size={14} />
                  </a>
                </div>
              </div>
            </section>
          </div>


        </Container>
      </div>
    </PageTransition>
  );
}

export default Resources;
