import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui';
import { PageTransition } from '../components/wow';
import {
  HelpCircle,
  Briefcase,
  Wallet,
  MessageSquare,
  ShieldCheck,
  Search,
  Cpu,
  FileCheck2,
  Lock,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Layers,
  FileText
} from 'lucide-react';
import './how-it-works.css';

export function HowItWorks() {
  return (
    <PageTransition>
      <div className="how-it-works-page">
        <Container>
          {/* Hero Header */}
          <div className="hiw-hero">
            <span className="hiw-eyebrow">
              <Sparkles size={14} />
              End-to-End Verification Architecture
            </span>
            <h1>How Cyber Shield Works</h1>
            <p>
              From text or screenshot input to verifiable cryptographic proof. Cyber Shield screens
              job offers, UPI payment requests, and incoming messages using independent signals and AI reading.
            </p>
          </div>

          {/* 4-Step Pipeline */}
          <div className="hiw-pipeline-grid">
            <div className="hiw-step-card">
              <div className="hiw-step-num">01</div>
              <div className="hiw-step-icon-wrap">
                <Search size={22} color="var(--brand, #4DA3FF)" />
              </div>
              <h3>Input &amp; OCR Extraction</h3>
              <p>
                Paste a job URL, offer letter text, payment note, or upload a raw screenshot.
                On-device OCR extracts text, links, phone numbers, and UPI IDs without storing image files.
              </p>
            </div>

            <div className="hiw-step-card">
              <div className="hiw-step-num">02</div>
              <div className="hiw-step-icon-wrap">
                <Cpu size={22} color="var(--brand, #4DA3FF)" />
              </div>
              <h3>Multi-Signal Analysis</h3>
              <p>
                Independent verification pipelines evaluate domain age (RDAP), corporate presence
                (Google Places), VPA provider syntax, and threat patterns across English, Hindi, and Hinglish.
              </p>
            </div>

            <div className="hiw-step-card">
              <div className="hiw-step-num">03</div>
              <div className="hiw-step-icon-wrap">
                <Lock size={22} color="var(--brand, #4DA3FF)" />
              </div>
              <h3>Cryptographic Proof ID</h3>
              <p>
                Every screening calculates a SHA-256 evidence fingerprint. You receive a unique
                Proof ID and private Access Code anchoring the report forever on our tamper-evident ledger.
              </p>
            </div>

            <div className="hiw-step-card">
              <div className="hiw-step-num">04</div>
              <div className="hiw-step-icon-wrap">
                <FileCheck2 size={22} color="var(--brand, #4DA3FF)" />
              </div>
              <h3>Actionable Results</h3>
              <p>
                Get an objective calculated risk score, highlighted fraudulent phrases with exact reasons,
                a &ldquo;What to do now&rdquo; safety checklist, and downloadable PDF and JSON receipts.
              </p>
            </div>
          </div>

          {/* Detailed Verification Tools Breakdown */}
          <div className="hiw-tools-section">
            <div className="hiw-section-header">
              <span className="hiw-eyebrow">
                <Layers size={14} />
                Specialized Screening Tools
              </span>
              <h2>What each tool checks</h2>
              <p>Every detection engine is tuned specifically for its risk domain.</p>
            </div>

            <div className="hiw-tools-cards-grid">
              {/* Job Offer Checks */}
              <div className="hiw-tool-detail-card">
                <div className="hiw-tool-card-head">
                  <div className="hiw-tool-icon hiw-icon-job">
                    <Briefcase size={22} />
                  </div>
                  <div>
                    <h3>1. Job Scam Check</h3>
                    <span className="hiw-tool-tag">Employment &amp; Offer Screening</span>
                  </div>
                </div>

                <div className="hiw-tool-content-block">
                  <h4>What you provide:</h4>
                  <p>A job listing URL, pasted offer email or chat, and the recruiter&rsquo;s contact handle.</p>
                </div>

                <div className="hiw-tool-content-block">
                  <h4>What we look at:</h4>
                  <ul className="hiw-check-list">
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>AI Text Reading:</strong> Flags advance registration fees, security deposits, and interview-on-Telegram tricks.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>Domain Age via RDAP:</strong> Flags brand-new websites impersonating well-known companies.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>Recruiter Email Validation:</strong> Highlights corporate recruiters using personal webmail (@gmail, @yahoo).</span>
                    </li>
                  </ul>
                </div>

                <div className="hiw-tool-action">
                  <Link to="/tools/job-scam-check" className="btn-card-primary">
                    <span>Try Job Check</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>

              {/* UPI Payment Checks */}
              <div className="hiw-tool-detail-card">
                <div className="hiw-tool-card-head">
                  <div className="hiw-tool-icon hiw-icon-upi">
                    <Wallet size={22} />
                  </div>
                  <div>
                    <h3>2. UPI Payment Check</h3>
                    <span className="hiw-tool-tag">VPA &amp; Collect Request Screening</span>
                  </div>
                </div>

                <div className="hiw-tool-content-block">
                  <h4>What you provide:</h4>
                  <p>A UPI ID (VPA), recipient phone number, collect request screenshot, or QR code data.</p>
                </div>

                <div className="hiw-tool-content-block">
                  <h4>What we look at:</h4>
                  <ul className="hiw-check-list">
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>VPA Syntax &amp; PSP Verification:</strong> Checks handle structure against NPCI bank provider tables.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>Pay-to-Receive Traps:</strong> Detects deception claiming you must enter your UPI PIN to receive money.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>Fake Confirmation Layouts:</strong> Flags fabricated transaction receipts with misaligned fonts or altered amounts.</span>
                    </li>
                  </ul>
                </div>

                <div className="hiw-tool-action">
                  <Link to="/tools/upi-payment-check" className="btn-card-primary">
                    <span>Try UPI Check</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>

              {/* Message Scanner */}
              <div className="hiw-tool-detail-card">
                <div className="hiw-tool-card-head">
                  <div className="hiw-tool-icon hiw-icon-msg">
                    <MessageSquare size={22} />
                  </div>
                  <div>
                    <h3>3. Message Scanner</h3>
                    <span className="hiw-tool-tag">SMS &amp; Chat Message Screening</span>
                  </div>
                </div>

                <div className="hiw-tool-content-block">
                  <h4>What you provide:</h4>
                  <p>Raw text, WhatsApp/Telegram screenshot, or suspicious SMS message.</p>
                </div>

                <div className="hiw-tool-content-block">
                  <h4>What we look at:</h4>
                  <ul className="hiw-check-list">
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>Threat &amp; Urgency Detection:</strong> Detects fake electricity cut-offs, courier delays, and legal arrest threats.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>Task-Based Scam Patterns:</strong> Identifies &ldquo;like videos for ₹5,000/day&rdquo; prepaid task schemes.</span>
                    </li>
                    <li>
                      <CheckCircle2 size={15} color="var(--risk-ok-text, #34D399)" />
                      <span><strong>Multilingual Evaluation:</strong> Evaluates fraud patterns in English, Hindi, and Hinglish idioms.</span>
                    </li>
                  </ul>
                </div>

                <div className="hiw-tool-action">
                  <Link to="/tools/message-scanner" className="btn-card-primary">
                    <span>Try Message Scanner</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Cryptographic Ledger & Proof Callout */}
          <div className="hiw-proof-banner">
            <div className="hiw-proof-info">
              <span className="hiw-eyebrow">
                <ShieldCheck size={14} />
                Tamper-Evident Verification
              </span>
              <h2>Cryptographic Proof for every check</h2>
              <p>
                Every screening result is fingerprinted using SHA-256 hashing. You can share your
                Proof ID with family, employers, or police, and verify anytime on the Verify page without
                logging in.
              </p>
            </div>
            <Link to="/verify" className="btn-card-primary hiw-proof-btn">
              <span>Open Verify Page</span>
              <ArrowRight size={15} />
            </Link>
          </div>


        </Container>
      </div>
    </PageTransition>
  );
}

export default HowItWorks;

