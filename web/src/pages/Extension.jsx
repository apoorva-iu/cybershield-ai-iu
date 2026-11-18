import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui';
import { PageTransition } from '../components/wow';
import { useAuth } from '../auth';
import { useBillingStatus, startUpgrade } from '../lib/billing';
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
  AlertTriangle,
  ArrowRight,
  Key,
  Copy,
  Check,
  Trash2
} from 'lucide-react';

export function Extension() {
  const { session } = useAuth();
  const { isPro, isPaymentsAvailable } = useBillingStatus(session);
  const [info, setInfo] = useState(null);
  const [activeTabMock, setActiveTabMock] = useState('message');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  // Extension key state (Pro users only)
  const [hasExtKey, setHasExtKey] = useState(false);
  const [extKeyLast4, setExtKeyLast4] = useState(null);
  const [extKeyCreatedAt, setExtKeyCreatedAt] = useState(null);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [clipboardBlocked, setClipboardBlocked] = useState(false);
  const [copiedKeyNotice, setCopiedKeyNotice] = useState(null);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState(null);
  const [keyNotice, setKeyNotice] = useState(null);

  const isMobile = typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');

  useEffect(() => {
    fetch('/downloads/extension-info.json')
      .then(res => (res.ok ? res.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    if (!isPro || !session?.access_token) {
      setHasExtKey(false);
      setExtKeyLast4(null);
      setExtKeyCreatedAt(null);
      setGeneratedKey(null);
      return;
    }
    let mounted = true;
    fetch('/api/extension/key', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!mounted || !data) return;
        setHasExtKey(Boolean(data.hasKey));
        setExtKeyLast4(data.last4 || null);
        setExtKeyCreatedAt(data.createdAt || null);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [isPro, session?.access_token]);

  // Automatic countdown & cleanup when user leaves page, switches tabs, or unmounts
  useEffect(() => {
    if (!generatedKey) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev == null || prev <= 1) {
          setGeneratedKey(null);
          setClipboardBlocked(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setGeneratedKey(null);
        setClipboardBlocked(false);
        setCountdown(null);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setGeneratedKey(null);
    };
  }, [generatedKey]);

  const handleGenerateKey = async () => {
    if (!session?.access_token || keyLoading) return;
    try {
      setKeyLoading(true);
      setKeyError(null);
      setKeyNotice(null);
      setCopiedKeyNotice(null);
      setClipboardBlocked(false);
      const res = await fetch('/api/extension/key', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Could not generate extension key');
      }
      const fullKey = data.key || null;
      const last4 = data.last4 || (fullKey ? fullKey.slice(-4) : '');
      setGeneratedKey(fullKey);
      setExtKeyLast4(last4);
      setHasExtKey(true);
      setExtKeyCreatedAt(data.createdAt || new Date().toISOString());
      setCountdown(60);
    } catch (err) {
      setKeyError(err.message);
    } finally {
      setKeyLoading(false);
    }
  };

  const handleCopyKey = async () => {
    if (!generatedKey) return;
    const keyToCopy = generatedKey;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(keyToCopy);

      // Immediately remove key from page and React state
      setGeneratedKey(null);
      setCountdown(null);
      setClipboardBlocked(false);
      setCopiedKeyNotice(
        'Key copied. Paste it in the extension popup now. It is hidden for your security and cannot be shown again.'
      );

      // Best effort: clear clipboard after 60 seconds if page is focused
      setTimeout(() => {
        if (typeof document !== 'undefined' && document.hasFocus && document.hasFocus()) {
          try {
            navigator.clipboard?.writeText?.('');
          } catch (e) {}
        }
      }, 60000);
    } catch (err) {
      // If copy fails (clipboard blocked), show the key in a box for 30 seconds with a message, then hide it
      setClipboardBlocked(true);
      setCountdown(30);
    }
  };

  const handleRevokeKey = async () => {
    if (!session?.access_token || keyLoading) return;
    try {
      setKeyLoading(true);
      setKeyError(null);
      setCopiedKeyNotice(null);
      setClipboardBlocked(false);
      const res = await fetch('/api/extension/key', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Could not revoke extension key');
      }
      setGeneratedKey(null);
      setCountdown(null);
      setHasExtKey(false);
      setExtKeyLast4(null);
      setExtKeyCreatedAt(null);
      setKeyNotice('Extension key revoked. Generate a new one whenever you need it.');
    } catch (err) {
      setKeyError(err.message);
    } finally {
      setKeyLoading(false);
    }
  };

  const handleUpgradeClick = async () => {
    try {
      setUpgradeLoading(true);
      await startUpgrade({
        session,
        onSuccess: () => {
          window.location.reload();
        }
      });
    } catch (err) {
      console.error('Upgrade error:', err);
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setDownloadError(null);
      const token = session?.access_token;
      if (!token) {
        throw new Error('Please sign in to download the extension.');
      }
      const res = await fetch('/api/extension/download', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403 || errData.error === 'pro_required') {
          throw new Error('The browser extension is part of Pro.');
        }
        if (res.status === 401 || errData.error === 'Authentication required' || errData.error === 'Invalid or expired token') {
          throw new Error('Please sign in to download the extension.');
        }
        throw new Error(errData.error || errData.message || 'Failed to download extension');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cyber-shield-extension.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setDownloadError(err.message);
    } finally {
      setDownloading(false);
    }
  };

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
                  background: 'rgba(77, 163, 255, 0.18)',
                  color: 'var(--brand, #4DA3FF)',
                  border: '1px solid rgba(77, 163, 255, 0.4)',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                Pro
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
                Developer preview (v{info?.version || '0.3.0'})
              </span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(32px, 5vw, 48px)',
                fontWeight: 700,
                color: 'var(--text)',
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
                color: 'var(--text-dim)',
                maxWidth: '680px',
                margin: '0 auto 28px',
                lineHeight: 1.45
              }}
            >
              Select text on any page and check it as a job offer, a payment request or a message, without leaving the page.
            </p>

            {isMobile ? (
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '24px',
                  maxWidth: '540px',
                  margin: '0 auto',
                  textAlign: 'center'
                }}
              >
                <Laptop size={32} color="var(--primary)" style={{ margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--text-dim)', fontSize: '15px', marginBottom: '16px', lineHeight: 1.45 }}>
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
            ) : isPro ? (
              <div>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '14px 28px',
                    fontSize: '16px',
                    fontWeight: 600,
                    borderRadius: '10px',
                    border: 'none',
                    cursor: downloading ? 'wait' : 'pointer',
                    boxShadow: '0 4px 20px rgba(10, 102, 194, 0.4)'
                  }}
                >
                  <Download size={20} />
                  <span>{downloading ? 'Downloading...' : 'Download for Chrome, Edge and Brave'}</span>
                </button>

                {downloadError && (
                  <p style={{ fontSize: '13px', color: '#F87171', marginTop: '10px' }}>
                    {downloadError}
                  </p>
                )}

                {info && (
                  <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '10px' }}>
                    Version {info.version}{formattedSize ? ` • ${formattedSize}` : ''} • Unpacked developer package
                  </p>
                )}

                {/* Pro-only Extension Account Link Key Card */}
                <div
                  className="extension-key-card"
                  style={{
                    background: 'var(--surface, #0B1220)',
                    border: '1px solid var(--border, rgba(255,255,255,0.08))',
                    borderRadius: '14px',
                    padding: '24px',
                    maxWidth: '540px',
                    width: '100%',
                    boxSizing: 'border-box',
                    margin: '24px auto 0',
                    textAlign: 'center',
                    boxShadow: '0 8px 28px rgba(0, 0, 0, 0.35)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Key size={18} color="var(--brand, #4DA3FF)" />
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text, #E6EDF7)', margin: 0, textAlign: 'center' }}>
                      Link your extension
                    </h3>
                  </div>

                  {hasExtKey && !generatedKey && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                      <span
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 600,
                          color: 'var(--risk-ok-text, #4ADE80)',
                          background: 'var(--risk-ok-bg, rgba(18, 128, 92, 0.16))',
                          border: '1px solid rgba(18, 128, 92, 0.3)',
                          padding: '3px 12px',
                          borderRadius: '9999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <CheckCircle2 size={13} />
                        Active key linked ••••{extKeyLast4 || ''}
                      </span>
                    </div>
                  )}

                  {copiedKeyNotice && (
                    <div
                      style={{
                        background: 'rgba(74, 222, 128, 0.12)',
                        border: '1px solid rgba(74, 222, 128, 0.35)',
                        borderRadius: '8px',
                        padding: '12px 14px',
                        margin: '0 auto 16px',
                        maxWidth: '460px',
                        textAlign: 'center',
                        fontSize: '13px',
                        color: 'var(--risk-ok-text, #4ADE80)',
                        lineHeight: 1.45
                      }}
                      role="status"
                    >
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>Key copied. Paste it in the extension popup now.</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim, #9AA8BF)' }}>
                        It is hidden for your security and cannot be shown again.
                      </div>
                    </div>
                  )}

                  <p style={{ fontSize: '13.5px', color: 'var(--text-dim, #9AA8BF)', margin: '0 auto 16px', lineHeight: 1.45, textAlign: 'center', maxWidth: '460px' }}>
                    {hasExtKey
                      ? 'Your browser extension shares your Pro quota and saves check reports directly to your dashboard history.'
                      : 'Generate a personal key to share your Pro quota and save extension reports to your dashboard history.'}
                  </p>

                  {/* Masked generated key state */}
                  {generatedKey && !clipboardBlocked && (
                    <div
                      style={{
                        background: 'var(--bg, #05080F)',
                        border: '1px solid rgba(77, 163, 255, 0.35)',
                        borderRadius: '8px',
                        padding: '14px',
                        margin: '0 auto 16px',
                        maxWidth: '460px',
                        width: '100%',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--risk-warn-text, #FCD34D)', marginBottom: '8px', textAlign: 'center' }}>
                        One-time key masked for your security:
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '10px',
                          width: '100%'
                        }}
                      >
                        <code
                          style={{
                            display: 'block',
                            width: '100%',
                            maxWidth: '100%',
                            fontSize: '12.5px',
                            color: 'var(--text, #E6EDF7)',
                            wordBreak: 'break-all',
                            overflowWrap: 'anywhere',
                            whiteSpace: 'pre-wrap',
                            textAlign: 'center',
                            padding: '8px 10px',
                            background: 'var(--surface-2, rgba(255, 255, 255, 0.03))',
                            borderRadius: '6px',
                            border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            boxSizing: 'border-box',
                            letterSpacing: '0.04em'
                          }}
                        >
                          cs_ext_••••••••••••••••{extKeyLast4 || generatedKey.slice(-4)}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopyKey}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '8px 20px',
                            fontSize: '13px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            background: 'rgba(77, 163, 255, 0.16)',
                            border: '1px solid rgba(77, 163, 255, 0.4)',
                            color: 'var(--text, #E6EDF7)',
                            cursor: 'pointer'
                          }}
                        >
                          <Copy size={14} />
                          <span>Copy key</span>
                        </button>
                        {countdown != null && (
                          <span style={{ fontSize: '11.5px', color: 'var(--text-dim, #9AA8BF)', marginTop: '2px' }}>
                            Disappears in {countdown}s
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Fallback if clipboard was blocked by browser permissions */}
                  {generatedKey && clipboardBlocked && (
                    <div
                      style={{
                        background: 'var(--bg, #05080F)',
                        border: '1px solid rgba(248, 113, 113, 0.4)',
                        borderRadius: '8px',
                        padding: '14px',
                        margin: '0 auto 16px',
                        maxWidth: '460px',
                        width: '100%',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--risk-bad-text, #FCA5A5)', marginBottom: '8px', textAlign: 'center' }}>
                        Clipboard write blocked by browser. Copy manually now:
                      </div>
                      <code
                        style={{
                          display: 'block',
                          width: '100%',
                          maxWidth: '100%',
                          fontSize: '12px',
                          color: 'var(--text, #E6EDF7)',
                          wordBreak: 'break-all',
                          overflowWrap: 'anywhere',
                          whiteSpace: 'pre-wrap',
                          textAlign: 'center',
                          padding: '8px 10px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          borderRadius: '6px',
                          border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          boxSizing: 'border-box',
                          userSelect: 'all'
                        }}
                      >
                        {generatedKey}
                      </code>
                      {countdown != null && (
                        <span style={{ fontSize: '11.5px', color: 'var(--risk-bad-text, #FCA5A5)', marginTop: '8px' }}>
                          Disappears automatically in {countdown}s
                        </span>
                      )}
                    </div>
                  )}

                  {!generatedKey && hasExtKey && extKeyCreatedAt && (
                    <p style={{ fontSize: '12.5px', color: 'var(--text-dim, #9AA8BF)', margin: '0 auto 14px', textAlign: 'center', maxWidth: '440px' }}>
                      Active key created on {new Date(extKeyCreatedAt).toLocaleDateString()}. Plain keys are never stored — generate a new one if you lost it.
                    </p>
                  )}

                  {keyError && (
                    <p style={{ fontSize: '13px', color: 'var(--risk-bad-text, #FCA5A5)', margin: '0 auto 12px', textAlign: 'center' }} role="alert">
                      {keyError}
                    </p>
                  )}

                  {keyNotice && (
                    <p style={{ fontSize: '13px', color: 'var(--text-dim, #9AA8BF)', margin: '0 auto 12px', textAlign: 'center' }} role="status">
                      {keyNotice}
                    </p>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%'
                    }}
                  >
                    {!generatedKey && (
                      <>
                        <button
                          type="button"
                          onClick={handleGenerateKey}
                          disabled={keyLoading}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '10px 20px',
                            fontSize: '14px',
                            fontWeight: 600,
                            borderRadius: '8px',
                            background: 'var(--primary)',
                            color: 'var(--primary-btn-text, #FFFFFF)',
                            border: 'none',
                            cursor: keyLoading ? 'wait' : 'pointer'
                          }}
                        >
                          <Key size={15} />
                          <span>{keyLoading ? 'Generating...' : (hasExtKey ? 'Generate new key' : 'Generate extension key')}</span>
                        </button>

                        {hasExtKey && (
                          <span style={{ fontSize: '11.5px', color: 'var(--text-dim, #9AA8BF)', textAlign: 'center' }}>
                            Generating a new key revokes the active key.
                          </span>
                        )}
                      </>
                    )}

                    {hasExtKey && !generatedKey && (
                      <button
                        type="button"
                        onClick={handleRevokeKey}
                        disabled={keyLoading}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 16px',
                          fontSize: '13px',
                          fontWeight: 600,
                          borderRadius: '8px',
                          background: 'transparent',
                          color: 'var(--risk-bad-text, #FCA5A5)',
                          border: '1px solid rgba(248, 113, 113, 0.4)',
                          cursor: keyLoading ? 'wait' : 'pointer',
                          marginTop: '4px'
                        }}
                      >
                        <Trash2 size={14} />
                        <span>Revoke key</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="extension-pro-locked-card"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '32px 28px',
                  maxWidth: '500px',
                  margin: '0 auto',
                  textAlign: 'center',
                  boxShadow: 'var(--shadow-base)'
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'rgba(77, 163, 255, 0.15)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    color: 'var(--primary)'
                  }}
                >
                  <Lock size={22} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>
                  The browser extension is part of Pro.
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-dim)', margin: '0 0 24px', lineHeight: 1.5 }}>
                  Screen job offers, payment requests, and messages right on any webpage with 100 checks every 30 days.
                </p>
                {session ? (
                  <button
                    type="button"
                    className="btn-card-primary"
                    onClick={handleUpgradeClick}
                    disabled={upgradeLoading || !isPaymentsAvailable}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      height: '48px',
                      borderRadius: '9999px',
                      fontSize: '15px',
                      fontWeight: 600,
                      background: 'var(--primary)',
                      color: 'var(--primary-btn-text, #FFFFFF)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <span>{upgradeLoading ? 'Opening checkout...' : 'Upgrade for ₹1'}</span>
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <Link
                    to="/login?from=/extension"
                    className="btn-card-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      width: '100%',
                      height: '48px',
                      borderRadius: '9999px',
                      fontSize: '15px',
                      fontWeight: 600,
                      background: 'var(--primary)',
                      color: 'var(--primary-btn-text, #FFFFFF)',
                      border: 'none',
                      textDecoration: 'none'
                    }}
                  >
                    <span>Sign in</span>
                    <ArrowRight size={16} />
                  </Link>
                )}
                {info && (
                  <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '14px', marginBottom: 0 }}>
                    Version {info.version}{formattedSize ? ` • ${formattedSize}` : ''} • Chrome, Edge &amp; Brave
                  </p>
                )}
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
                background: 'var(--surface)',
                border: '1px solid var(--border)',
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
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  color: 'var(--primary)'
                }}
              >
                <Layers size={20} />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                Choose what you are checking
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Switch effortlessly between Job offer, UPI or payment, and Message before sending. If you are unsure, Message works for any text.
              </p>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
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
              <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                See the verdict right where you are
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Get calculated risk scores, confidence ratings, and top findings in an in-page overlay without opening a new tab or leaving your work.
              </p>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
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
              <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                Download the same receipt as the website
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Save tamper-evident JSON receipt files with cryptographic block proofs, verifiable anytime on our public audit verification tool.
              </p>
            </div>
          </div>

          {/* Interactive Mockup Section */}
          <div
            style={{
              maxWidth: '720px',
              margin: '0 auto 64px',
              background: '#0C2145',
              border: '1px solid #1F4A8A',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(6, 20, 43, 0.5)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: 'rgba(77, 163, 255, 0.2)',
                    color: '#C9DAF5',
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
                <span style={{ fontSize: '13px', color: '#C9DAF5', fontWeight: 500 }}>
                  In-page selection bubble preview
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#C9DAF5' }}>Made-up sample</span>
            </div>

            {/* Bubble Frame */}
            <div
              style={{
                background: '#06142B',
                border: '1px solid #1F4A8A',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#FFFFFF', fontSize: '14px' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: '#0B63CE' }} />
                  Cyber Shield
                </div>
                <span style={{ color: '#C9DAF5', fontSize: '14px' }}>&#x2715;</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#FFFFFF', marginBottom: '6px' }}>
                  Check this text as:
                </label>
                <div
                  style={{
                    display: 'flex',
                    background: '#0C2145',
                    border: '1px solid #1F4A8A',
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
                        background: activeTabMock === tab.id ? '#12305F' : 'transparent',
                        color: activeTabMock === tab.id ? '#4DA3FF' : '#C9DAF5',
                        border: activeTabMock === tab.id ? '1px solid #4DA3FF' : 'none',
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
                <div style={{ fontSize: '11px', color: '#C9DAF5', marginTop: '6px' }}>
                  Not sure? Message works for any text.
                </div>
              </div>

              <div
                style={{
                  background: '#0C2145',
                  border: '1px solid #1F4A8A',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '12px',
                  color: '#FFFFFF',
                  lineHeight: 1.45
                }}
              >
                {activeTabMock === 'job' && 'Example: "Urgent hiring for Operations Assistant. Weekly salary of $1,200 via courier check. Contact hiring-manager@freemail.example with your resume."'}
                {activeTabMock === 'upi' && 'Example: "Payment of Rs 2,500 pending on PhonePe. Open your app and enter your UPI PIN to receive the credit immediately."'}
                {activeTabMock === 'message' && 'Example: "Important notice: Your service will be suspended in 24 hours due to an unverified detail. Click here to confirm: https://service-update.example"'}
                <div style={{ fontSize: '10.5px', color: '#C9DAF5', textAlign: 'right', marginTop: '6px' }}>
                  142 / 20,000 characters
                </div>
              </div>

              {/* Mock Verdict Card */}
              <div
                style={{
                  background: '#0C2145',
                  border: '1px solid #1F4A8A',
                  borderLeft: '4px solid #EF4444',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', color: '#FCA5A5' }}>
                      High risk
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: 'rgba(77, 163, 255, 0.2)', color: '#93C5FD' }}>
                      Confidence: High
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#C9DAF5' }}>
                    Risk score: 88/100
                  </span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
                  Strong indicators of {activeTabMock === 'job' ? 'employment advance-fee fraud' : activeTabMock === 'upi' ? 'UPI PIN deception fraud' : 'account phishing'}.
                </div>
                <div style={{ fontSize: '11px', color: '#C9DAF5' }}>
                  Evidence suggests warning signs in this text.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#C9DAF5' }}>
                <span>Proof ID: CS-EXAMPLE-01</span>
              </div>
            </div>
          </div>

          {/* What the extension can access Section */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
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
                color: 'var(--text)',
                marginBottom: '8px',
                textAlign: 'center'
              }}
            >
              What the extension can access
            </h2>
            <p
              style={{
                color: 'var(--text-dim)',
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
                  background: '#0C2145',
                  border: '1px solid #1F4A8A',
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
                <p style={{ fontSize: '13px', color: '#C9DAF5', lineHeight: 1.45 }}>
                  The extension only accesses text that you highlight manually. It never reads full page bodies, passwords, or inputs.
                </p>
              </div>

              <div
                style={{
                  background: '#0C2145',
                  border: '1px solid #1F4A8A',
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
                <p style={{ fontSize: '13px', color: '#C9DAF5', lineHeight: 1.45 }}>
                  Opening the bubble puts it in a ready state. Nothing is transmitted across the network until you explicitly press Check.
                </p>
              </div>

              <div
                style={{
                  background: '#0C2145',
                  border: '1px solid #1F4A8A',
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
                <p style={{ fontSize: '13px', color: '#C9DAF5', lineHeight: 1.45 }}>
                  The extension does not capture, read, or upload screenshots. For screenshot analysis, use the screenshot uploaders on the website.
                </p>
              </div>

              <div
                style={{
                  background: '#0C2145',
                  border: '1px solid #1F4A8A',
                  borderRadius: '10px',
                  padding: '20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Shield size={18} color="#4DA3FF" />
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
                    No account or tracking
                  </h3>
                </div>
                <p style={{ fontSize: '13px', color: '#C9DAF5', lineHeight: 1.45 }}>
                  All extension checks are anonymous. No cookies, session tokens, or personal identifiers are stored or shared.
                </p>
              </div>
            </div>
          </div>

          {/* Installation Steps */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
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
                color: 'var(--text)',
                marginBottom: '8px',
                textAlign: 'center'
              }}
            >
              How to install in 5 steps
            </h2>
            <p
              style={{
                color: 'var(--text-dim)',
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
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary)',
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
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                    Download and unzip
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.45 }}>
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
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary)',
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
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                    Open extensions page
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.45 }}>
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
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary)',
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
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                    Click "Load unpacked"
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.45 }}>
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
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary)',
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
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                    Pin Cyber Shield
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.45 }}>
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
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary)',
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
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                    Select text &amp; check
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.45 }}>
                    Highlight text on any page, click the floating <strong>Check this</strong> chip, select your check category, and click Check.
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '13px',
                color: 'var(--text-dim)'
              }}
            >
              <p>
                <strong>Developer preview note:</strong> This version is installed via Developer mode directly from source. It is not currently hosted on a commercial extension store.
              </p>
              <p style={{ color: 'var(--text-dim)' }}>
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
                color: 'var(--text)',
                marginBottom: '28px',
                textAlign: 'center'
              }}
            >
              Frequently asked questions
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '20px'
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  Which plan includes the extension?
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  The browser extension is included with the Pro plan. Pro gives you 100 checks every 30 days and access to the extension for Chrome, Edge, and Brave.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '20px'
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  Does it work on mobile phones?
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  No. Desktop and laptop browsers (Google Chrome, Microsoft Edge, Brave) are supported. Mobile browsers do not support desktop extension APIs. On phones, use the Cyber Shield website and screenshot scanner directly.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '20px'
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  Can the extension read screenshots?
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  No. The extension only reads text that you highlight and select. It does not capture or process screenshots. To analyze image receipts, transaction screenshots, or chat captures, use the UPI or Message tools on the website.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '20px'
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  Is the result a legal finding?
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
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
