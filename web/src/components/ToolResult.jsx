import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Eye,
  EyeOff,
  Download,
  Printer,
  ExternalLink,
  Lock,
  BadgeCheck,
  Tag,
  AlertCircle
} from 'lucide-react';
import { CountUp } from './wow';
import { useAuth } from '../auth';

// State to human readable labels & badge styling
const CHECK_BADGES = {
  ok: { label: 'PASS', className: 'check-badge-pass' },
  warn: { label: 'SUSPICIOUS', className: 'check-badge-suspicious' },
  danger: { label: 'HIGH_RISK', className: 'check-badge-high' },
  bad: { label: 'HIGH_RISK', className: 'check-badge-high' },
  not_applicable: { label: 'NOT_APPLICABLE', className: 'check-badge-na' },
  unknown: { label: 'UNKNOWN', className: 'check-badge-na' }
};

const RISK_CONFIG = {
  low: {
    label: 'LOW RISK',
    badgeClass: 'risk-badge-low',
    verdictClass: 'v-low',
    barColor: '#12805C',
    title: 'Low Risk Detected'
  },
  medium: {
    label: 'MEDIUM RISK',
    badgeClass: 'risk-badge-medium',
    verdictClass: 'v-medium',
    barColor: '#B7791F',
    title: 'Suspicious Patterns'
  },
  high: {
    label: 'HIGH RISK',
    badgeClass: 'risk-badge-high',
    verdictClass: 'v-high',
    barColor: '#C62828',
    title: 'High Risk Scam'
  },
  unable: {
    label: 'UNABLE TO VERIFY',
    badgeClass: 'risk-badge-unable',
    verdictClass: 'v-unknown',
    barColor: '#5F6F6C',
    title: 'Unable to Verify'
  }
};

/**
 * Renders text with soft-colored highlights matching the risk level,
 * numbered badges [1], [2], and an explanatory legend underneath.
 */
function HighlightedContent({ text, flaggedPhrases = [], level = 'low' }) {
  if (!text) return null;

  if (!flaggedPhrases || flaggedPhrases.length === 0) {
    return (
      <div className="tool-text-highlight-box">
        <div className="tool-clean-text-body">{text}</div>
        <div className="tool-legend-clean-note">
          <CheckCircle2 size={14} color="var(--risk-ok-text, #4ADE80)" aria-hidden="true" />
          <span>No suspicious phrases or high-risk keywords detected in this input.</span>
        </div>
      </div>
    );
  }

  // Find intervals of flagged phrases
  const lowerText = text.toLowerCase();
  const rawMatches = [];

  for (const item of flaggedPhrases) {
    if (!item || !item.text) continue;
    const pText = String(item.text).trim();
    if (!pText) continue;
    const pLower = pText.toLowerCase();

    let startIdx = 0;
    while ((startIdx = lowerText.indexOf(pLower, startIdx)) !== -1) {
      const endIdx = startIdx + pLower.length;
      rawMatches.push({
        start: startIdx,
        end: endIdx,
        phrase: text.slice(startIdx, endIdx),
        why: item.why || item.reason || 'Identified scam pattern or pressure tactic.'
      });
      startIdx = endIdx;
    }
  }

  // Sort by start index
  rawMatches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Eliminate overlaps
  const filteredMatches = [];
  let lastEnd = 0;
  for (const m of rawMatches) {
    if (m.start >= lastEnd) {
      filteredMatches.push(m);
      lastEnd = m.end;
    }
  }

  if (filteredMatches.length === 0) {
    return (
      <div className="tool-text-highlight-box">
        <div className="tool-clean-text-body">{text}</div>
      </div>
    );
  }

  // Assign numbers [1], [2] to distinct occurrences
  const legendItems = [];
  const segments = [];
  let cur = 0;

  filteredMatches.forEach((m, idx) => {
    const num = idx + 1;
    legendItems.push({
      number: num,
      phrase: m.phrase,
      why: m.why
    });

    if (m.start > cur) {
      segments.push({ type: 'text', content: text.slice(cur, m.start) });
    }
    segments.push({
      type: 'highlight',
      number: num,
      content: text.slice(m.start, m.end)
    });
    cur = m.end;
  });

  if (cur < text.length) {
    segments.push({ type: 'text', content: text.slice(cur) });
  }

  const highlightClass =
    level === 'high' || level === 'bad'
      ? 'tool-hl-high'
      : level === 'medium' || level === 'warn'
      ? 'tool-hl-medium'
      : 'tool-hl-low';

  return (
    <div className="tool-text-highlight-box">
      <div className="tool-text-display-content" aria-label="Checked message content with highlights">
        {segments.map((s, idx) => {
          if (s.type === 'text') {
            return <span key={idx}>{s.content}</span>;
          }
          return (
            <mark key={idx} className={`tool-phrase-mark ${highlightClass}`}>
              <span>{s.content}</span>
              <sup className="tool-phrase-badge" aria-label={`Flagged pattern number ${s.number}`}>
                [{s.number}]
              </sup>
            </mark>
          );
        })}
      </div>

      {/* Numbered Legend */}
      <div className="tool-highlight-legend">
        <h4 className="tool-legend-title">Pattern signals explained:</h4>
        <ol className="tool-legend-list">
          {legendItems.map((item) => (
            <li key={item.number} className="tool-legend-item">
              <span className="tool-legend-num">[{item.number}]</span>
              <strong className="tool-legend-phrase">&ldquo;{item.phrase}&rdquo;:</strong>{' '}
              <span className="tool-legend-why">{item.why}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function ToolResult({
  result: d,
  originalInput = '',
  toolKind = 'message',
  downloadReceipt: customDownloadReceipt
}) {
  const { session } = useAuth();
  const [copiedProof, setCopiedProof] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [revealCode, setRevealCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!d) return null;

  const report = d.report || {};
  const overall = report.overall || {};

  const rawLevel = String(overall.level || d.level || 'unknown').toLowerCase();
  const isUnable = rawLevel === 'unable' || rawLevel === 'unknown';
  const levelKey = isUnable ? 'unable' : rawLevel;
  const risk = RISK_CONFIG[levelKey] || RISK_CONFIG.unable;

  const score = typeof overall.score === 'number' ? overall.score : (typeof d.score === 'number' ? d.score : null);
  const confidence = typeof overall.confidence === 'number' ? overall.confidence : (typeof d.confidence === 'number' ? d.confidence : 85);
  const evidenceCount = report.evidenceSourceCount || (report.sources ? report.sources.length : 1);

  // Animated gauge math
  const gaugeDashOffset =
    score == null ? 125.6 : 125.6 - (125.6 * Math.min(100, Math.max(0, score))) / 100;

  // Headline
  let headlineTitle = risk.title;
  let headlineSub = 'Evidence suggests this input requires careful review.';
  if (Array.isArray(d.headline)) {
    headlineTitle = d.headline[0] || headlineTitle;
    headlineSub = d.headline[1] || headlineSub;
  } else if (typeof d.headline === 'string') {
    headlineTitle = d.headline;
  }

  // Checks (ensure 5 checks are rendered cleanly)
  const checks = Array.isArray(report.checks) && report.checks.length > 0
    ? report.checks
    : (Array.isArray(d.checks) ? d.checks : []);

  // Extracted items (UPI IDs, links, phones, amounts, etc.)
  const ext = report.extractedItems || d.extractedItems || {};
  const extractedChips = [];
  if (Array.isArray(ext.upiIds)) {
    ext.upiIds.forEach((u) => extractedChips.push({ val: u, label: 'UPI ID' }));
  }
  if (Array.isArray(ext.links)) {
    ext.links.forEach((l) => extractedChips.push({ val: l, label: 'Link' }));
  }
  if (Array.isArray(ext.phones)) {
    ext.phones.forEach((p) => extractedChips.push({ val: p, label: 'Phone' }));
  }
  if (Array.isArray(ext.emails)) {
    ext.emails.forEach((e) => extractedChips.push({ val: e, label: 'Email' }));
  }
  if (Array.isArray(ext.amounts)) {
    ext.amounts.forEach((a) => extractedChips.push({ val: a, label: 'Amount' }));
  }

  // Save to history in localStorage
  useEffect(() => {
    if (!d || !d.proofId) return;
    try {
      const stored = localStorage.getItem('cs_recent_checks');
      const list = stored ? JSON.parse(stored) : [];
      if (!list.some((item) => item.proofId === d.proofId)) {
        list.unshift({
          proofId: d.proofId,
          tool: toolKind,
          level: rawLevel,
          score,
          headline: headlineTitle,
          createdAt: d.timestamp || new Date().toISOString()
        });
        localStorage.setItem('cs_recent_checks', JSON.stringify(list.slice(0, 50)));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [d, toolKind, rawLevel, score, headlineTitle]);

  const handleDownloadReceipt = () => {
    if (customDownloadReceipt) {
      customDownloadReceipt();
      return;
    }
    const receiptData = d.receipt || {
      version: 1,
      proofId: d.proofId,
      timestamp: d.timestamp,
      report,
      subject: { tool: toolKind === 'upi' ? 'UPI and Payment Check' : 'Message Scanner' }
    };
    const blob = new Blob([JSON.stringify(receiptData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${d.proofId || 'verification'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const shortHash = d.blockHash
    ? `${d.blockHash.slice(0, 8)}...${d.blockHash.slice(-8)}`
    : (report.input?.inputSha256
    ? `${report.input.inputSha256.slice(0, 8)}...${report.input.inputSha256.slice(-8)}`
    : '\u2014');

  const accessCodeVal = d.accessCode || '\u2014';

  return (
    <div className="scan-page tool-result-wrapper">
      {/* Extracted items banner */}
      {extractedChips.length > 0 && (
        <div className="extracted-items-bar" aria-label="Extracted items found in text">
          <span className="extracted-bar-label">
            <Tag size={13} aria-hidden="true" />
            <span>Found in input:</span>
          </span>
          <div className="extracted-chips-list">
            {extractedChips.map((chip, idx) => (
              <span key={idx} className="extracted-chip">
                <span className="extracted-chip-val">{chip.val}</span>
                <span className="extracted-chip-type">({chip.label})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* UPI Education Disclaimer note */}
      {toolKind === 'upi' && (
        <div className="upi-critical-notice" role="note">
          <AlertCircle size={16} color="#B7791F" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <p>
            <strong>Crucial UPI Safety Rule:</strong> A UPI ID or QR code can <strong>NEVER</strong> be used to receive money into your bank account. Scanning a QR or entering your UPI PIN <strong>always DEDUCTS money</strong> from your account.
          </p>
        </div>
      )}

      {/* Verdict Card (Exact Scan Page Parity) */}
      <motion.div
        className={`verdict ${risk.verdictClass}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="v-left">
          <div className="verdict-top-chips">
            <span className={`risk-badge-pill ${risk.badgeClass}`}>{risk.label}</span>
            {d.scamType && d.scamType !== 'none' && (
              <span className="v-scam-type-chip">{d.scamType}</span>
            )}
            <span className="v-kind-chip">
              {toolKind === 'upi' ? 'UPI & Payment Check' : 'Message Scanner'}
            </span>
          </div>

          <h2 className="lvl">{headlineTitle}</h2>
          <p>{headlineSub}</p>

          <div className="v-chips">
            <span className="v-chip">
              Confidence <CountUp value={confidence} />%
            </span>
            <span className="v-chip">
              {evidenceCount} evidence source{evidenceCount === 1 ? '' : 's'} checked
            </span>
          </div>
        </div>

        <div className="v-right">
          <div
            className="gauge-wrap"
            role="img"
            aria-label={score == null ? 'No score' : 'Risk score of ' + score}
          >
            <svg className="gauge" viewBox="0 0 100 50" aria-hidden="true">
              <path
                className="gauge-bg"
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                strokeWidth="12"
                strokeLinecap="round"
              />
              {score != null && (
                <path
                  className="gauge-val"
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray="125.6"
                  style={{ strokeDashoffset: gaugeDashOffset, stroke: risk.barColor }}
                />
              )}
            </svg>
            <div className="score-num">
              <CountUp value={score} />
            </div>
          </div>
          <div className="score-cap">Risk score of 100</div>
        </div>
      </motion.div>

      {/* Checked Text with Soft Highlighted Phrases and Numbered Legend */}
      <div className="scan-card tool-content-card">
        <h3 className="tool-card-section-title">Checked content &amp; pattern signals</h3>
        <HighlightedContent
          text={originalInput}
          flaggedPhrases={d.flaggedPhrases || report.flaggedPhrases}
          level={rawLevel}
        />
      </div>

      {/* 5 Named Checks Cards */}
      {checks.length > 0 && (
        <div className="tool-checks-section">
          <h3 className="tool-card-section-title" style={{ marginBottom: '16px' }}>Detailed checks</h3>
          <div className="report-grid">
            {checks.map((c, i) => {
              if (!c) return null;
              const state = c.state || 'unknown';
              const badgeInfo = CHECK_BADGES[state] || CHECK_BADGES.unknown;
              const findings = Array.isArray(c.findings) ? c.findings : [];
              const isNA = state === 'not_applicable';

              const scoreVal =
                typeof c.score === 'number' ? Math.min(100, Math.max(0, c.score)) : null;
              const fillWidth = scoreVal == null ? 0 : Math.max(4, scoreVal);

              return (
                <div className="check" id={`tool-check-${i}`} key={i}>
                  <div className="chead">
                    <h3>{c.title || c.key || `Check ${i + 1}`}</h3>
                    <span className={`pill ${badgeInfo.className}`}>{badgeInfo.label}</span>
                  </div>

                  {!isNA && (
                    <div
                      className={`meter m-${state}`}
                      role="progressbar"
                      aria-valuenow={scoreVal ?? 0}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-label={scoreVal == null ? 'No evidence' : `Risk ${scoreVal} of 100`}
                    >
                      {scoreVal != null && (
                        <i style={{ width: `${fillWidth}%`, '--fill-width': `${fillWidth}%` }} />
                      )}
                    </div>
                  )}

                  {isNA ? (
                    <div className="na-check-explanation">
                      <span>Nothing to examine in this input.</span>
                    </div>
                  ) : (
                    <ul className="notes">
                      {findings.map((f, j) => (
                        <li key={j}>
                          <b className={`d-${f?.severity || 'info'}`} aria-hidden="true" />
                          <span>{f?.text || ''}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Honest disclaimer line */}
      <p className="small" style={{ margin: '20px 0 24px', color: 'var(--text-dim, #C9D3E3)' }}>
        Screening aid, not a legal finding. Independent verification available via Proof ID.
      </p>

      {/* Proof Card (Full Job-Scan Parity) */}
      <div className="scan-card proof-card">
        <div className="proof-card-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Tamper-evident receipt</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-dim, #C9D3E3)' }}>
              Cryptographically anchored to the Cyber Shield audit ledger.
            </p>
          </div>
          <span className="proof-anchored-badge">
            <BadgeCheck size={14} aria-hidden="true" />
            <span>Ledger anchored</span>
          </span>
        </div>

        <div className="proof-grid">
          <div className="proof-item">
            <label>Proof ID</label>
            <div className="val">
              <span className="mono">{d.proofId || '\u2014'}</span>
              {d.proofId && (
                <button
                  type="button"
                  className="copy-btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(d.proofId);
                    setCopiedProof(true);
                    setTimeout(() => setCopiedProof(false), 2000);
                  }}
                  aria-label="Copy Proof ID"
                >
                  {copiedProof ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedProof ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="proof-item">
            <label>Block Number</label>
            <div className="val">{d.block != null ? d.block : '\u2014'}</div>
          </div>

          <div className="proof-item">
            <label>Audit Hash</label>
            <div className="val">
              <span className="mono">{shortHash}</span>
              {d.blockHash && (
                <button
                  type="button"
                  className="copy-btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(d.blockHash);
                    setCopiedHash(true);
                    setTimeout(() => setCopiedHash(false), 2000);
                  }}
                  aria-label="Copy Block Hash"
                >
                  {copiedHash ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedHash ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="proof-item">
            <label>Access Code</label>
            <div className="val access-code-val-row">
              <span className="mono">
                {revealCode ? accessCodeVal : '••••••••••••'}
              </span>
              <div className="access-code-actions">
                {d.accessCode && (
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => setRevealCode(!revealCode)}
                    aria-label={revealCode ? 'Hide access code' : 'Reveal access code'}
                  >
                    {revealCode ? <EyeOff size={12} /> : <Eye size={12} />}
                    <span>{revealCode ? 'Hide' : 'Reveal'}</span>
                  </button>
                )}
                {d.accessCode && (
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={async () => {
                      await navigator.clipboard.writeText(d.accessCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    aria-label="Copy access code"
                  >
                    {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </div>
            </div>
            <div className="proof-warn">Save this code now. It is shown only once.</div>
          </div>
        </div>

        {/* Saved to history status chip */}
        <div className="scan-history-status-wrap" aria-live="polite" style={{ marginTop: '16px' }}>
          {session ? (
            <Link to="/dashboard/history" className="saved-history-chip">
              &#10003; Saved to your history
            </Link>
          ) : (
            <Link to="/login" className="signin-history-link">
              Sign in to keep a permanent history of your checks
            </Link>
          )}
        </div>

        {/* Ledger verification link */}
        {d.proofId && (
          <div className="proof-verify-direct-row">
            <Link to={`/verify?id=${encodeURIComponent(d.proofId)}`} className="proof-ledger-link">
              <span>Verify this proof on the ledger</span>
              <ExternalLink size={14} aria-hidden="true" />
            </Link>
          </div>
        )}

        {/* Action Buttons: Download JSON & Save PDF */}
        <div className="proof-btns">
          <button
            type="button"
            className="primary"
            onClick={() => window.print()}
          >
            <Printer size={15} style={{ marginRight: '6px' }} aria-hidden="true" />
            <span>Print / Save PDF</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleDownloadReceipt}
          >
            <Download size={15} style={{ marginRight: '6px' }} aria-hidden="true" />
            <span>Download JSON receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ToolResult;

