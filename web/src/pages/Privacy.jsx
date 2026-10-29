import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui';
import { Shield, Lock, AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import './legal.css';

export function Privacy() {
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
              <span> This privacy policy outlines data handling and retention practices for Cyber Shield.</span>
            </div>
          </div>

          <header className="legal-header">
            <div className="legal-badge">
              <Shield size={14} />
              <span>Data Protection &amp; Retention</span>
            </div>
            <h1 className="legal-title">Privacy Policy</h1>
            <p className="legal-subtitle">
              Last updated: October 2026 &bull; Clear, transparent explanation of how your data is processed and stored.
            </p>
          </header>

          <div className="legal-body">
            <section className="legal-section">
              <h2>1. Information We Collect</h2>
              <p>Cyber Shield is built around data minimization. We only collect the minimal information necessary to deliver screening and account features:</p>
              <ul>
                <li>
                  <strong>Account Profile:</strong> When you sign up, we store your email address and display name via Supabase Authentication.
                </li>
                <li>
                  <strong>Scan Inputs (When Saved):</strong> For signed-in users who choose to keep scan history, we store the scan payload (text or OCR turns), risk score, breakdown, and timestamp.
                </li>
                <li>
                  <strong>Usage Counters:</strong> To enforce fair monthly quotas (3 for anonymous, 5 for free signed-in, 100 for Pro), we count successful check events.
                </li>
                <li>
                  <strong>Payment Order Records:</strong> When you test an upgrade, we record the Razorpay order ID, payment status, and activated pass validity window.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>2. Data Retention &amp; Expiration</h2>
              <ul>
                <li>
                  <strong>Anonymous Scans:</strong> Anonymous scans are processed in-memory and are <strong>never retained beyond 30 days</strong>.
                </li>
                <li>
                  <strong>Signed-in Scans:</strong> Stored securely in your personal account history until you choose to delete them individually or delete your entire account.
                </li>
                <li>
                  <strong>Access Code Confidentiality:</strong> The cryptographic Access Code required to view verified ledger receipts is generated strictly in your browser and is <strong>never stored on the server</strong>.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>3. Cryptographic Ledger &amp; Public Hashes</h2>
              <p>
                Our tamper-evident ledger publishes only irreversible cryptographic SHA-256 hashes, risk scores, and high-level check categories.
                <strong>The public ledger never exposes your personal name, applicant credentials, private chat transcripts, or banking details.</strong>
              </p>
            </section>

            <section className="legal-section">
              <h2>4. IP Addresses &amp; Anonymous Identifiers</h2>
              <p>
                To prevent automated abuse and enforce the 3-check anonymous allowance without tracking individuals, IP addresses are transformed immediately into <strong>salted one-way cryptographic hashes</strong>. We never store raw IP addresses in usage event tables.
              </p>
            </section>

            <section className="legal-section">
              <h2>5. Payment Processing via Razorpay</h2>
              <p>
                Payments and checkout flows are handled directly by Razorpay&rsquo;s certified payment gateway.
                <strong>Your credit/debit card numbers, CVVs, and banking credentials never reach or touch Cyber Shield servers.</strong>
              </p>
            </section>

            <section className="legal-section">
              <h2>6. Deleting Your Account and Data</h2>
              <p>
                You retain complete control over your personal data. You can permanently delete your account, personal profile, and all saved scan history at any time:
              </p>
              <ul>
                <li>Visit your dashboard at <Link to="/dashboard/settings">Account Settings</Link> and select &ldquo;Danger zone &rarr; Delete account&rdquo;.</li>
                <li>Or contact us with your account email address.</li>
              </ul>
              <p>
                Upon account deletion, all personal data, saved scans, and profile references are wiped immediately.
              </p>
            </section>

            <section className="legal-section">
              <h2>7. Contact</h2>
              <p>
                For privacy requests, data deletion inquiries, or feedback, please contact:
              </p>
              <p className="legal-contact-box">
                <strong>Privacy Officer:</strong> <code>[Contact email to be added]</code>
              </p>
            </section>
          </div>
        </div>
      </Container>
    </div>
  );
}
export default Privacy;

