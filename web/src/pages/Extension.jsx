import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui';
import { PageTransition } from '../components/wow';
import {
  Download,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Shield,
  Laptop,
  Puzzle,
  FileCheck,
  MousePointer,
  Pin,
  Lock,
  Layers,
  FileText,
  AlertTriangle
} from 'lucide-react';

export function Extension() {
  const [info, setInfo] = useState(null);
  const [activeTabMock, setActiveTabMock] = useState('message');
  const isMobile = typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');

  useEffect(() => {
    fetch('/downloads/extension-info.json')
      .then(res => (res.ok ? res.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const formattedSize = info && typeof info.sizeBytes === 'number'
    ? (info.sizeBytes / 1024).toFixed(1) + ' KB'
    : null;

  return (
    <PageTransition>
      <div className="extension-landing-page">
        <Container>
          {/* Hero Section */}
          <div style={{ maxWidth: '820px', margin: '0 auto 56px', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', gap: '8px', marginBottom: '16px' }}>
              <span
                style={{
                  background: 'rgba(18, 128, 92, 0.2)',
                  color: '#34D399',
                  border: '1px solid rgba(18, 128, 92, 0.4)',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                Free
              </span>
              <span
                style={{
                  background: 'rgba(77, 163, 255, 0.15)',
                  color: '#4DA3FF',
                  border: '1px solid rgba(77, 163, 255, 0.3)',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                Developer preview (v{info?.version || '0.2.0'})
              </span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(32px, 5vw, 48px)',
                fontWeight: 700,
                color: '#FFFFFF',
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                marginBottom: '16px'
              }}
            >
              Cyber Shield for your browser
            </h1>

            <p
              style={{
                fontSize: 'clamp(16px, 2.5vw, 20px)',
                color: '#C9D3E3',
                maxWidth: '680px',
                margin: '0 auto 28px',
                lineHeight: 1.45
              }}
            >
              Select text on any page and check it as a job offer, a UPI or payment request, or a message.
            </p>

            <div style={{ marginBottom: '28px' }}>
              <span
                style={{
                  fontSize: '13px',
                  color: '#94A3B8',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  display: 'inline-block'
                }}
              >
                Screening aid, not a legal finding.
              </span>
            </div>

            {isMobile ? (
              <div
                style={{
                  background: 'var(--surface, #0B1220)',
                  border: '1px solid var(--border, rgba(255,255,255,0.08))',
                  borderRadius: '12px',
                  padding: '24px',
                  maxWidth: '540px',
                  margin: '0 auto',
                  textAlign: 'center'
                }}
              >
                <Laptop size={32} color="#4DA3FF" style={{ margin: '0 auto 12px' }} />
                <p style={{ color: '#C9D3E3', fontSize: '15px', marginBottom: '16px', lineHeight: 1.45 }}>
                  Browser extensions are not supported on mobile browsers. Use the Cyber Shield website and screenshot scanners directly on your phone.
                </p>
                <Link
                  to="/tools"
                  className="btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 24px',
                    borderRadius: '8px',
                    fontWeight: 600
                  }}
                >
                  Explore web tools
                </Link>
              </div>
            ) : (
              <div>
                <a
                  href="/downloads/cyber-shield-extension.zip"
                  download="cyber-shield-extension.zip"
                  className="btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '14px 28px',
                    fontSize: '16px',
                    fontWeight: 600,
                    borderRadius: '10px',
                    textDecoration: 'none',
                    boxShadow: '0 4px 20px rgba(10, 102, 194, 0.4)'
                  }}
                >
                  <Download size={20} />
                  <span>Download for Chrome, Edge and Brave</span>
                </a>

                {info && (
                  <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '10px' }}>
                    Version {info.version}{formattedSize ? ` • ${formattedSize}` : ''} • Unpacked developer package
                  </p>
                )}

                <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '14px' }}>
                  Firefox and Safari: Coming soon.
                </p>
              </div>
            )}
          </div>

          {/* Three Feature Bullets */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '20px',
              maxWidth: '960px',
              margin: '0 auto 64px'
            }}
          >
            <div
              style={{
                background: 'var(--surface, #0B1220)',
                border: '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: '12px',
                padding: '24px'
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(77, 163, 255, 0.12)',
                  border: '1px solid rgba(77, 163, 255, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  color: '#4DA3FF'
                }}
              >
                <Layers size={20} />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#FFFFFF', marginBottom: '8px' }}>
                Choose what you are checking
              </h3>
              <p style={{ fontSize: '14px', color: '#C9D3E3', lineHeight: 1.5 }}>
                Switch effortlessly between Job offer, UPI or payment, and Message before sending. If you are unsure, Message works for any text.
              </p>
            </div>

            <div
              style={{
                background: 'var(--surface, #0B1220)',
                border: '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: '12px',
                padding: '24px'
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(18, 128, 92, 0.15)',
                  border: '1px solid rgba(18, 128, 92, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  color: '#34D399'
                }}
              >
                <Shield size={20} />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#FFFFFF', marginBottom: '8px' }}>
                See the verdict right where you are
              </h3>
              <p style={{ fontSize: '14px', color: '#C9D3E3', lineHeight: 1.5 }}>
                Get calculated risk scores, confidence ratings, and top findings in an in-page overlay without opening a new tab or leaving your work.
              </p>
            </div>

            <div
              style={{
                background: 'var(--surface, #0B1220)',
                border: '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: '12px',
                padding: '24px'
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(183, 121, 31, 0.15)',
                  border: '1px solid rgba(183, 121, 31, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  color: '#FBBF24'
                }}
              >
                <FileCheck size={20} />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#FFFFFF', marginBottom: '8px' }}>
                Download the same receipt as the website
              </h3>
              <p style={{ fontSize: '14px', color: '#C9D3E3', lineHeight: 1.5 }}>
                Save tamper-evident JSON receipt files with cryptographic block proofs, verifiable anytime on our public audit verification tool.
              </p>
            </div>
          </div>

          {/* Interactive Mockup Section */}
          <div
            style={{
              maxWidth: '720px',
              margin: '0 auto 64px',
              background: '#0B1220',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#94A3B8',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '3px 8px',
                    borderRadius: '4px'
                  }}
                >
                  Example
                </span>
                <span style={{ fontSize: '13px', color: '#C9D3E3', fontWeight: 500 }}>
                  In-page selection bubble preview
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Made-up sample</span>
            </div>

            {/* Bubble Frame */}
            <div
              style={{
                background: '#05080F',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#FFFFFF', fontSize: '14px' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: '#0A66C2' }} />
                  Cyber Shield
                </div>
                <span style={{ color: '#64748B', fontSize: '14px' }}>&#x2715;</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#FFFFFF', marginBottom: '6px' }}>
                  Check this text as:
                </label>
                <div
                  style={{
                    display: 'flex',
                    background: '#0B1220',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '3px',
                    gap: '4px'
                  }}
                >
                  {[
                    { id: 'job', label: 'Job offer' },
                    { id: 'upi', label: 'UPI or payment' },
                    { id: 'message', label: 'Message' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTabMock(tab.id)}
                      style={{
                        flex: 1,
                        background: activeTabMock === tab.id ? '#101B2E' : 'transparent',
                        color: activeTabMock === tab.id ? '#4DA3FF' : '#94A3B8',
                        border: activeTabMock === tab.id ? '1px solid rgba(77, 163, 255, 0.35)' : 'none',
                        borderRadius: '6px',
                        padding: '6px 8px',
                        fontSize: '12px',
                        fontWeight: activeTabMock === tab.id ? 600 : 500,
                        cursor: 'pointer'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>
                  Not sure? Message works for any text.
                </div>
              </div>

              <div
                style={{
                  background: '#0B1220',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '12px',
                  color: '#E2E8F0',
                  lineHeight: 1.45
                }}
              >
                {activeTabMock === 'job' && 'Example: "Urgent hiring for Operations Assistant. Weekly salary of $1,200 via courier check. Contact hiring-manager@freemail.example with your resume."'}
                {activeTabMock === 'upi' && 'Example: "Payment of Rs 2,500 pending on PhonePe. Open your app and enter your UPI PIN to receive the credit immediately."'}
                {activeTabMock === 'message' && 'Example: "Important notice: Your service will be suspended in 24 hours due to an unverified detail. Click here to confirm: https://service-update.example"'}
                <div style={{ fontSize: '10.5px', color: '#64748B', textAlign: 'right', marginTop: '6px' }}>
                  142 / 20,000 characters
                </div>
              </div>

              {/* Mock Verdict Card */}
              <div
                style={{
                  background: '#0B1220',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderLeft: '4px solid #C62828',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(198, 40, 40, 0.2)', color: '#F87171' }}>
                      High risk
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: 'rgba(77, 163, 255, 0.15)', color: '#60A5FA' }}>
                      Confidence: High
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#C9D3E3' }}>
                    Risk score: 88/100
                  </span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
                  Strong indicators of {activeTabMock === 'job' ? 'employment advance-fee fraud' : activeTabMock === 'upi' ? 'UPI PIN deception fraud' : 'account phishing'}.
                </div>
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                  Evidence suggests warning signs in this text.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748B' }}>
                <span>Proof ID: CS-EXAMPLE-01</span>
                <span>Screening aid, not a legal finding.</span>
              </div>
            </div>
          </div>

          {/* What the extension can access Section */}
          <div
            style={{
              background: 'var(--surface, #0B1220)',
              border: '1px solid var(--border, rgba(255,255,255,0.08))',
              borderRadius: '16px',
              padding: 'clamp(24px, 4vw, 40px)',
              maxWidth: '900px',
              margin: '0 auto 64px'
            }}
          >
            <h2
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: '#FFFFFF',
                marginBottom: '8px',
                textAlign: 'center'
              }}
            >
              What the extension can access
            </h2>
            <p
              style={{
                color: '#C9D3E3',
                fontSize: '15px',
                textAlign: 'center',
                maxWidth: '680px',
                margin: '0 auto 32px'
              }}
            >
              Designed with strict boundary privacy. Zero background monitoring, no keystroke tracking, and no ambient telemetry.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '20px'
              }}
            >
              <div
                style={{
                  background: '#05080F',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <MousePointer size={18} color="#4DA3FF" />
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
                    Reads only what you select
                  </h3>
                </div>
                <p style={{ fontSize: '13px', color: '#C9D3E3', lineHeight: 1.45 }}>
                  The extension only accesses text that you highlight manually. It never reads full page bodies, passwords, or inputs.
                </p>
              </div>

              <div
                style={{
                  background: '#05080F',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Lock size={18} color="#34D399" />
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
                    Sends only when you click Check
                  </h3>
                </div>
                <p style={{ fontSize: '13px', color: '#C9D3E3', lineHeight: 1.45 }}>
                  Opening the bubble puts it in a ready state. Nothing is transmitted across the network until you explicitly press Check.
                </p>
              </div>

              <div
                style={{
                  background: '#05080F',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <AlertCircle size={18} color="#FBBF24" />
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
                    Screenshots are not read
                  </h3>
                </div>
                <p style={{ fontSize: '13px', color: '#C9D3E3', lineHeight: 1.45 }}>
                  The extension does not capture, read, or upload screenshots. For screenshot analysis, use the screenshot uploaders on the website.
                </p>
              </div>

              <div
                style={{
                  background: '#05080F',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Shield size={18} color="#A78BFA" />
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
                    No account or tracking
                  </h3>
                </div>
                <p style={{ fontSize: '13px', color: '#C9D3E3', lineHeight: 1.45 }}>
                  All extension checks are anonymous. No cookies, session tokens, or personal identifiers are stored or shared.
                </p>
              </div>
            </div>
          </div>

          {/* Installation Steps */}
          <div
            style={{
              background: 'var(--surface, #0B1220)',
              border: '1px solid var(--border, rgba(255,255,255,0.08))',
              borderRadius: '16px',
              padding: 'clamp(24px, 4vw, 40px)',
              maxWidth: '900px',
              margin: '0 auto 64px'
            }}
          >
            <h2
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: '#FFFFFF',
                marginBottom: '8px',
                textAlign: 'center'
              }}
            >
              How to install in 5 steps
            </h2>
            <p
              style={{
                color: '#C9D3E3',
                fontSize: '15px',
                textAlign: 'center',
                marginBottom: '36px'
              }}
            >
              Takes less than two minutes. Developer mode unpacked package. No credit card required.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '24px',
                marginBottom: '32px'
              }}
            >
              {/* Step 1 */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(77, 163, 255, 0.12)',
                    border: '1px solid rgba(77, 163, 255, 0.25)',
                    color: '#4DA3FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '15px',
                    flexShrink: 0
                  }}
                >
                  1
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>
                    Download and unzip
                  </h3>
                  <p style={{ fontSize: '13px', color: '#C9D3E3', lineHeight: 1.45 }}>
                    Download <code>cyber-shield-extension.zip</code> and extract the <code>cyber-shield-extension</code> folder.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(77, 163, 255, 0.12)',
                    border: '1px solid rgba(77, 163, 255, 0.25)',
                    color: '#4DA3FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '15px',
                    flexShrink: 0
                  }}
                >
                  2
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>
                    Open extensions page
                  </h3>
                  <p style={{ fontSize: '13px', color: '#C9D3E3', lineHeight: 1.45 }}>
                    Navigate to <code>chrome://extensions</code> (or <code>edge://extensions</code>, <code>brave://extensions</code>) and switch on <strong>Developer mode</strong> in the top-right.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(77, 163, 255, 0.12)',
                    border: '1px solid rgba(77, 163, 255, 0.25)',
                    color: '#4DA3FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '15px',
                    flexShrink: 0
                  }}
                >
                  3
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>
                    Click "Load unpacked"
                  </h3>
                  <p style={{ fontSize: '13px', color: '#C9D3E3', lineHeight: 1.45 }}>
                    Click <strong>Load unpacked</strong> and select the extracted <code>cyber-shield-extension</code> folder.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(77, 163, 255, 0.12)',
                    border: '1px solid rgba(77, 163, 255, 0.25)',
                    color: '#4DA3FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '15px',
                    flexShrink: 0
                  }}
                >
                  4
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>
                    Pin Cyber Shield
                  </h3>
                  <p style={{ fontSize: '13px', color: '#C9D3E3', lineHeight: 1.45 }}>
                    Click the puzzle icon in your browser toolbar and pin Cyber Shield so its status toggle is easily accessible.
                  </p>
                </div>
              </div>

              {/* Step 5 */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(77, 163, 255, 0.12)',
                    border: '1px solid rgba(77, 163, 255, 0.25)',
                    color: '#4DA3FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '15px',
                    flexShrink: 0
                  }}
                >
                  5
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>
                    Select text &amp; check
                  </h3>
                  <p style={{ fontSize: '13px', color: '#C9D3E3', lineHeight: 1.45 }}>
                    Highlight text on any page, click the floating <strong>Check this</strong> chip, select your check category, and click Check.
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid var(--border, rgba(255,255,255,0.08))',
                paddingTop: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '13px',
                color: '#C9D3E3'
              }}
            >
              <p>
                <strong>Developer preview note:</strong> This version is installed via Developer mode directly from source. It is not currently hosted on a commercial extension store.
              </p>
              <p style={{ color: '#94A3B8' }}>
                <strong>Browser permission prompt:</strong> Your browser may display a prompt stating the extension can read data on websites. It only reads text you actively highlight, and nothing is transmitted until you click Check.
              </p>
            </div>
          </div>

          {/* FAQ Section */}
          <div
            style={{
              maxWidth: '800px',
              margin: '0 auto'
            }}
          >
            <h2
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: '#FFFFFF',
                marginBottom: '28px',
                textAlign: 'center'
              }}
            >
              Frequently asked questions
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: 'var(--surface, #0B1220)',
                  border: '1px solid var(--border, rgba(255,255,255,0.08))',
                  borderRadius: '12px',
                  padding: '20px'
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', marginBottom: '8px' }}>
                  Is it free?
                </h3>
                <p style={{ fontSize: '14px', color: '#C9D3E3', lineHeight: 1.5 }}>
                  Yes, the extension is free to use. Standard per-IP rate limits apply (Job: 6/min, 60/day; UPI: 120/min; Message: 120/min) to prevent abuse and keep verification fast.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--surface, #0B1220)',
                  border: '1px solid var(--border, rgba(255,255,255,0.08))',
                  borderRadius: '12px',
                  padding: '20px'
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', marginBottom: '8px' }}>
                  Does it work on mobile phones?
                </h3>
                <p style={{ fontSize: '14px', color: '#C9D3E3', lineHeight: 1.5 }}>
                  No. Desktop and laptop browsers (Google Chrome, Microsoft Edge, Brave) are supported. Mobile browsers do not support desktop extension APIs. On phones, use the Cyber Shield website and screenshot scanner directly.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--surface, #0B1220)',
                  border: '1px solid var(--border, rgba(255,255,255,0.08))',
                  borderRadius: '12px',
                  padding: '20px'
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', marginBottom: '8px' }}>
                  Can the extension read screenshots?
                </h3>
                <p style={{ fontSize: '14px', color: '#C9D3E3', lineHeight: 1.5 }}>
                  No. The extension only reads text that you highlight and select. It does not capture or process screenshots. To analyze image receipts, transaction screenshots, or chat captures, use the UPI or Message tools on the website.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--surface, #0B1220)',
                  border: '1px solid var(--border, rgba(255,255,255,0.08))',
                  borderRadius: '12px',
                  padding: '20px'
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', marginBottom: '8px' }}>
                  Is the result a legal finding?
                </h3>
                <p style={{ fontSize: '14px', color: '#C9D3E3', lineHeight: 1.5 }}>
                  No. Cyber Shield is an automated screening aid, not a legal finding. Assessments indicate where evidence suggests warning signs or patterns to help you verify before sending money or private details.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>
    </PageTransition>
  );
}

export default Extension;
