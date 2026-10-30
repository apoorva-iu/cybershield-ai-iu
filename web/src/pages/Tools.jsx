import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  ArrowRight,
  CheckCircle2,
  BadgeCheck,
  AlertTriangle,
  FileCheck,
  Layers,
  PhoneCall,
  ExternalLink
} from 'lucide-react';
import { TOOLS } from '../tools';
import { ToolCard } from '../components/ToolCard';
import { Container } from '../components/ui';
import { PageTransition } from '../components/wow';
import { apiFetch } from '../api';
import '../tools.css';

export function Tools() {
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch('/api/quota')
      .then((data) => {
        if (active && data && data.enabled) {
          setQuota(data);
        }
      })
      .catch(() => {
        // When the endpoint fails or returns enabled:false show nothing
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageTransition>
      <div className="tools-hub-page">
        <Container>
          {/* Header */}
          <div className="tools-hub-header">
            <div className="tools-hub-meta-row">
              <span className="tools-hub-kicker">Security Tools</span>
              {quota && quota.enabled && (
                <div className="quota-chip" role="status" aria-live="polite">
                  <Shield size={13} aria-hidden="true" />
                  <span>
                    {quota.remaining} of {quota.limit} free checks left
                  </span>
                </div>
              )}
            </div>
            <h1 className="tools-hub-heading">Check any scam in one place</h1>
            <p className="tools-hub-subtitle">
              Paste a job offer, payment request or message. Get a clear verdict, the reasons, and proof you can verify.
            </p>
          </div>

          {/* 3 Equal Columns on Desktop, Stacked on Mobile */}
          <div className="tools-grid-three" role="list" aria-label="Available security tools">
            {TOOLS.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>

          {/* How every check works */}
          <section className="tools-workflow-section" aria-labelledby="workflow-heading">
            <h2 id="workflow-heading" className="tools-section-title">How every check works</h2>
            <div className="tools-workflow-grid">
              <div className="workflow-step-card">
                <div className="workflow-step-num">1</div>
                <h3 className="workflow-step-title">Paste or upload</h3>
                <p className="workflow-step-desc">
                  Paste the message text, job offer URL, or payment request. You can also upload a screenshot directly from your phone or desktop.
                </p>
              </div>

              <div className="workflow-step-card">
                <div className="workflow-step-num">2</div>
                <h3 className="workflow-step-title">AI reading plus live evidence</h3>
                <p className="workflow-step-desc">
                  The text is evaluated alongside live signals: domain age via RDAP, URL threat feeds, company records, and dual-pass AI reading. Checks evaluate together in parallel.
                </p>
              </div>

              <div className="workflow-step-card">
                <div className="workflow-step-num">3</div>
                <h3 className="workflow-step-title">Verdict and Proof ID</h3>
                <p className="workflow-step-desc">
                  Receive an objective assessment, highlighted warning phrases with reasons, action guidance, and an immutable Proof ID anchored to the ledger.
                </p>
              </div>
            </div>
          </section>

          {/* Every result gets a Proof ID banner */}
          <div className="tools-proof-banner" role="region" aria-label="Proof ID verification">
            <div className="proof-banner-icon-col">
              <div className="proof-banner-icon-box" aria-hidden="true">
                <BadgeCheck size={28} color="#4DA3FF" strokeWidth={1.75} />
              </div>
            </div>
            <div className="proof-banner-content">
              <div className="proof-banner-kicker">Cryptographic Guarantee</div>
              <h3 className="proof-banner-title">Every result gets an immutable Proof ID</h3>
              <p className="proof-banner-desc">
                When you run any check, a SHA-256 hash of the input and findings is locked into our verification ledger. You get a Proof ID and a downloadable JSON receipt that anyone can verify independently to prove the verdict was never modified or fabricated.
              </p>
            </div>
            <div className="proof-banner-cta">
              <Link to="/verify" className="btn-proof-verify">
                <span>Verify a proof</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Already paid or shared an OTP? Box */}
          <section className="tools-emergency-box" aria-labelledby="emergency-heading">
            <div className="emergency-header">
              <div className="emergency-badge" aria-hidden="true">
                <AlertTriangle size={18} color="#C62828" strokeWidth={2} />
              </div>
              <div>
                <h2 id="emergency-heading" className="emergency-title">Already paid or shared an OTP?</h2>
                <p className="emergency-subtitle">
                  Act immediately. The first 1 to 2 hours (&ldquo;golden hour&rdquo;) are critical for blocking transfers and recovering funds.
                </p>
              </div>
            </div>

            <div className="emergency-steps-grid">
              <div className="emergency-step">
                <div className="emergency-step-marker">1</div>
                <div>
                  <strong>Call 1930 &amp; your bank immediately</strong>
                  <p>Dial 1930 (National Cyber Crime Reporting Portal helpline in India) or reach your bank&rsquo;s 24/7 fraud reporting desk to request an urgent lien or freeze on the transaction.</p>
                </div>
              </div>

              <div className="emergency-step">
                <div className="emergency-step-marker">2</div>
                <div>
                  <strong>Freeze UPI ID &amp; flag in your payment app</strong>
                  <p>Open Google Pay, PhonePe, or Paytm, go to Transaction History, select the transfer, tap &ldquo;Report Fraud / Dispute&rdquo;, and block the fraudster&rsquo;s UPI handle.</p>
                </div>
              </div>

              <div className="emergency-step">
                <div className="emergency-step-marker">3</div>
                <div>
                  <strong>File a report on cybercrime.gov.in</strong>
                  <p>Log a formal complaint at the official portal (<a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a>) with the transaction reference, screenshot, and incident timeline.</p>
                </div>
              </div>

              <div className="emergency-step">
                <div className="emergency-step-marker">4</div>
                <div>
                  <strong>Save screenshots &amp; your ledger proof</strong>
                  <p>Do not delete messages or chat logs. Export and print your Cyber Shield Proof ID and receipt file as tamper-evident evidence for police and banking dispute officers.</p>
                </div>
              </div>
            </div>
          </section>

        </Container>
      </div>
    </PageTransition>
  );
}

export default Tools;
