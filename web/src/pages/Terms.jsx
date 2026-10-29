import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui';
import { FileText, ShieldAlert, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import './legal.css';

export function Terms() {
  return (
    <div className="legal-page">
      <Container>
        <div className="legal-container">
          <div className="legal-breadcrumb">
            <Link to="/" className="legal-back-link">
              <ArrowLeft size={16} />
              <span>Back to home</span>
            </Link>
          </div>

          <div className="legal-draft-banner" role="status">
            <AlertTriangle size={18} className="legal-draft-icon" aria-hidden="true" />
            <div>
              <strong>Draft for review. Not legal advice.</strong>
              <span> These terms describe the intended rules and limitations of Cyber Shield during testing and development.</span>
            </div>
          </div>

          <header className="legal-header">
            <div className="legal-badge">
              <FileText size={14} />
              <span>Legal &amp; Usage Policy</span>
            </div>
            <h1 className="legal-title">Terms of Service</h1>
            <p className="legal-subtitle">
              Last updated: October 2026 &bull; Plain-language terms governing the use of Cyber Shield.
            </p>
          </header>

          <div className="legal-body">
            <section className="legal-section">
              <h2>1. Informational Screening Aid Only</h2>
              <p>
                Cyber Shield is an automated informational screening tool, <strong>not a legal finding, law enforcement verdict, or financial guarantee</strong>.
                Our scans analyze text patterns, message headers, public registries, and payment structures to estimate risk indicators.
              </p>
              <div className="legal-callout">
                <ShieldAlert size={20} className="legal-callout-icon" />
                <p>
                  <strong>What Cyber Shield cannot do:</strong> Cyber Shield cannot confirm whether a physical or digital payment receipt is authentic, who legally owns a UPI ID or VPA, or who actually sent an SMS, WhatsApp, or Telegram message. Results may occasionally be inconclusive (&ldquo;Unable to verify&rdquo;) or inaccurate.
                </p>
              </div>
              <p>
                You must <strong>never rely solely on Cyber Shield for legal, employment, or financial decisions</strong>. Always verify job offers through official corporate careers portals and confirm payment requests directly through verified banking channels or helpline 1930.
              </p>
            </section>

            <section className="legal-section">
              <h2>2. Plans and Access Passes</h2>
              <ul>
                <li>
                  <strong>Free Tier:</strong> Anonymous visitors receive 3 checks per calendar month. Signed-in free users receive a total of 5 checks per calendar month across all tools (Job, UPI, and Message scanners). Monthly quotas reset on the 1st of each calendar month at 00:00 IST.
                </li>
                <li>
                  <strong>Pro Pass:</strong> Pro is offered as a one-time 30-day access pass providing up to 100 checks within the pass window. Payments in this release are processed in <strong>Razorpay Test Mode</strong> for testing and demonstration purposes. No real money or recurring subscriptions are charged during test mode.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>3. Acceptable Use</h2>
              <p>By using Cyber Shield, you agree to use our tools responsibly. You must NOT:</p>
              <ul>
                <li>Use automated scripts, bots, or scrapers to access or extract data from the service.</li>
                <li>Upload or submit another individual&rsquo;s confidential banking passwords, UPI PINs, Aadhaar numbers, or sensitive identity documents without explicit consent.</li>
                <li>Attempt to bypass, defeat, or manipulate rate limits, quota tracking, authentication mechanisms, or payment verification.</li>
                <li>Use the service to facilitate fraud, harassment, impersonation, or unlawful activities.</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>4. Cryptographic Proof &amp; Verification</h2>
              <p>
                Scans may produce an immutable cryptographic Proof ID with a SHA-256 integrity hash stored in our ledger.
                This ledger records that a specific scan was evaluated at a specific timestamp; it does not constitute an endorsement, official certification, or legal warrant.
              </p>
            </section>

            <section className="legal-section">
              <h2>5. Changes to These Terms</h2>
              <p>
                We may revise these Terms of Service from time to time as features and regulatory guidelines evolve.
                Changes take effect upon publication on this page.
              </p>
            </section>

            <section className="legal-section">
              <h2>6. Contact and Inquiries</h2>
              <p>
                If you have questions regarding these terms, feedback, or security inquiries, please reach out to:
              </p>
              <p className="legal-contact-box">
                <strong>Cyber Shield Support:</strong> <code>[Contact email to be added]</code>
              </p>
            </section>
          </div>
        </div>
      </Container>
    </div>
  );
}
export default Terms;

