import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  Download,
  Printer,
  Copy,
  Check,
  Minus,
  Eye,
  Info,
  ChevronRight,
  ChevronDown,
  Layers,
  FileCheck2,
  AlertOctagon,
  Building,
  Mail,
  Link2,
  Loader2,
  Clock
} from 'lucide-react';
import { dedupeSafetyAdvice, getDefaultWhatToDo } from '../lib/dedupeAdvice';
import './unified-scan-result.css';

/* --------------------------------------------------------------------------
   Helpers for Formatting & Labels
   -------------------------------------------------------------------------- */

const CHECK_BADGES = {
  ok: { label: 'Pass', className: 'usr-badge-pass', state: 'pass' },
  pass: { label: 'Pass', className: 'usr-badge-pass', state: 'pass' },
  safe: { label: 'Pass', className: 'usr-badge-pass', state: 'pass' },
  warn: { label: 'Warning', className: 'usr-badge-warn', state: 'warn' },
  warning: { label: 'Warning', className: 'usr-badge-warn', state: 'warn' },
  caution: { label: 'Warning', className: 'usr-badge-warn', state: 'warn' },
  flag: { label: 'Flag', className: 'usr-badge-flag', state: 'flag' },
  fail: { label: 'Flag', className: 'usr-badge-flag', state: 'flag' },
  bad: { label: 'Flag', className: 'usr-badge-flag', state: 'flag' },
  danger: { label: 'Flag', className: 'usr-badge-flag', state: 'flag' },
  not_applicable: { label: 'Unknown', className: 'usr-badge-unknown', state: 'unknown' },
  unknown: { label: 'Unknown', className: 'usr-badge-unknown', state: 'unknown' }
};

const CHECK_PRIORITY = {
  flag: 1,
  fail: 1,
  bad: 1,
  danger: 1,
  warn: 2,
  warning: 2,
  caution: 2,
  unknown: 3,
  unable: 3,
  inconclusive: 3,
  pass: 4,
  ok: 4,
  safe: 4,
  not_applicable: 5
};

function normalizeCheckBadge(state) {
  const s = String(state || 'unknown').toLowerCase();
  return CHECK_BADGES[s] || { label: 'Unknown', className: 'usr-badge-unknown', state: 'unknown' };
}

function parseFindingText(text) {
  if (!text || typeof text !== 'string') return { text: '', quote: null, isQuoteMatch: false };

  // 1. Check for Found: "..." or (matched: "...")
  const foundRegex = /(?:Found|matched):\s*["“]([^"”]+)["”]/i;
  const foundMatch = text.match(foundRegex);
  if (foundMatch) {
    const quote = foundMatch[1].trim();
    const cleanLeading = text.replace(foundRegex, '').replace(/[:\.\-\s]+$/, '').trim();
    return {
      text: cleanLeading || 'Matched in text:',
      quote,
      isQuoteMatch: true
    };
  }

  // 2. Check for general quoted segment of 3+ chars: "..."
  const quoteRegex = /["“]([^"”]{3,})["”]/;
  const quoteMatch = text.match(quoteRegex);
  if (quoteMatch) {
    const quote = quoteMatch[1].trim();
    const cleanLeading = text.replace(quoteRegex, '').replace(/\s{2,}/g, ' ').replace(/[:\.\-\s]+$/, '').trim();
    return {
      text: cleanLeading || 'Matched phrase:',
      quote,
      isQuoteMatch: true
    };
  }

  return {
    text: text.trim(),
    quote: null,
    isQuoteMatch: false
  };
}

function extractScamTypeFromFindings(findings) {
  let detectedType = null;
  const filteredFindings = [];

  for (const f of findings) {
    const rawText = typeof f === 'string' ? f : (f.text || '');
    const scamMatch = rawText.match(/AI (?:detected|identified) (?:scam type|fraud pattern):\s*([a-z0-9_-]+)/i);
    if (scamMatch && scamMatch[1] && scamMatch[1].toLowerCase() !== 'none') {
      detectedType = scamMatch[1].trim();
      continue;
    }
    filteredFindings.push(f);
  }

  return { detectedType, filteredFindings };
}

function formatScamTypeChip(type) {
  if (!type || type === 'none' || type === 'unknown' || type === 'unclear') return null;
  const formatted = formatScamType(type);
  if (formatted) {
    if (/scam|pattern|trap|fraud|impersonation|demand/i.test(formatted)) {
      return formatted;
    }
    return `${formatted} scam`;
  }
  const words = String(type).replace(/[_-]+/g, ' ').trim().split(/\s+/);
  const titled = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return /scam|pattern|trap|fraud/i.test(titled) ? titled : `${titled} scam`;
}

function formatScamType(type) {
  if (!type || type === 'unknown' || type === 'none' || type === 'unclear') return null;
  const map = {
    job_task_scam: 'Job / task offer scam',
    otp_impersonation: 'OTP / bank impersonation',
    delivery_fee: 'Parcel delivery fee scam',
    investment_pump: 'High-yield investment trap',
    lottery_prize: 'Lottery / prize scam',
    loan_advance_fee: 'Instant loan fee demand',
    digital_arrest: 'Law enforcement impersonation',
    family_emergency: 'Urgent family / friend trap',
    routine_chat: 'Routine communication',
    pay_to_receive: 'Pay-to-receive pattern',
    fake_payment_proof: 'Fake payment proof',
    overpayment_trap: 'Refund / overpayment trap',
    advance_fee: 'Advance fee demand',
    unverifiable_receipt: 'Unverifiable receipt',
    routine_payment: 'Routine payment'
  };
  return map[type] || String(type).replace(/_/g, ' ');
}

function formatEvidenceSources(evidenceSources, rawSources = []) {
  const parts = [];
  if (Array.isArray(evidenceSources)) {
    for (const item of evidenceSources) {
      if (typeof item === 'string' && item.trim()) {
        const clean = item.trim().replace(/^sources?\s*used:?\s*/i, '').replace(/\.$/, '');
        if (clean) parts.push(clean);
      } else if (item && typeof item === 'object' && item.name) {
        parts.push(item.name);
      }
    }
  } else if (evidenceSources && typeof evidenceSources === 'object') {
    if (evidenceSources.aiPasses > 0 || evidenceSources.aiReading || evidenceSources.ai) {
      parts.push('AI reading');
    }
    if (evidenceSources.linkLookups > 0 || evidenceSources.linkReputation || evidenceSources.urlhaus || evidenceSources.virustotal) {
      parts.push('link reputation feeds (URLhaus / VirusTotal)');
    }
    if (evidenceSources.rdap) {
      parts.push('RDAP domain age');
    }
    if (evidenceSources.places) {
      parts.push('Google Places');
    }
    if (evidenceSources.upiRegistry || evidenceSources.upiHandle) {
      parts.push('UPI handle registry');
    }
    for (const [k, v] of Object.entries(evidenceSources)) {
      if (['aiPasses', 'aiReading', 'ai', 'linkLookups', 'linkReputation', 'urlhaus', 'virustotal', 'rdap', 'places', 'upiRegistry', 'upiHandle'].includes(k)) continue;
      if (typeof v === 'string' && v.trim()) parts.push(v.trim());
      else if (v === true) parts.push(k.replace(/([A-Z])/g, ' $1').toLowerCase());
    }
  }

  if (parts.length === 0 && Array.isArray(rawSources) && rawSources.length > 0) {
    for (const s of rawSources) {
      if (typeof s === 'string' && s.trim()) parts.push(s.trim());
    }
  }

  if (parts.length === 0) return null;
  return `Sources used: ${parts.join(', ')}.`;
}

function cleanConfidenceFactors(factors) {
  if (!Array.isArray(factors) || factors.length === 0) return [];
  const cleaned = [];

  for (const factor of factors) {
    if (!factor) continue;
    if (typeof factor === 'object') {
      const text = factor.label || factor.text || factor.statement || '';
      const isMinus = factor.effect === 'lowers';
      if (text) cleaned.push({ text, type: isMinus ? 'minus' : 'check' });
      continue;
    }
    if (typeof factor !== 'string') continue;
    if (/self-assessed|self-certainty|model certainty|confidence score/i.test(factor)) continue;

    const isMinus =
      /\(\+?0(?:\.0+)?\)/.test(factor) ||
      /\(-/.test(factor) ||
      /\b(degraded|noisy|unreadable|minimal|limited|short|poor|missing|lacks?|no\s)\b/i.test(factor);

    const text = factor
      .replace(/\s*\([+-]?\d*(?:\.\d+)?%?\)/g, '')
      .replace(/\s*\(\d+\s*(?:characters?|chars?|signals?|items?|passes?)\)/gi, '')
      .replace(/\s*\([^)]*\d+[^)]*\)/g, '')
      .replace(/\b\d+(?:\.\d+)?%/g, '')
      .replace(/[+-]?\b\d+\.\d+\b/g, '')
      .replace(/[+-]\d+\b/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[:,\-\s]+$/, '')
      .trim();

    if (text) cleaned.push({ text, type: isMinus ? 'minus' : 'check' });
  }

  return cleaned;
}

function highlightCheckedText(text, evidence = []) {
  if (!text || typeof text !== 'string') return null;
  const validQuotes = [];

  evidence.forEach((item, idx) => {
    const q = item?.quote || item?.text;
    if (typeof q === 'string' && q.trim()) {
      const pos = text.toLowerCase().indexOf(q.toLowerCase());
      if (pos !== -1) {
        validQuotes.push({
          num: idx + 1,
          start: pos,
          end: pos + q.length,
          quote: q,
          interpretation: item.interpretation || item.reason || item.why || 'Identified pattern in text.'
        });
      }
    }
  });

  if (validQuotes.length === 0) {
    return {
      nodes: <span className="usr-raw-text">{text}</span>,
      legend: []
    };
  }

  validQuotes.sort((a, b) => a.start - b.start);
  const filtered = [];
  let lastEnd = 0;
  for (const q of validQuotes) {
    if (q.start >= lastEnd) {
      filtered.push(q);
      lastEnd = q.end;
    }
  }

  const nodes = [];
  let cursor = 0;
  filtered.forEach((q, i) => {
    if (q.start > cursor) {
      nodes.push(<span key={`txt-${i}`}>{text.slice(cursor, q.start)}</span>);
    }
    nodes.push(
      <mark key={`mark-${i}`} className="usr-highlight-quote">
        <span className="usr-quote-text">{text.slice(q.start, q.end)}</span>
        <sup className="usr-quote-badge">[{q.num}]</sup>
      </mark>
    );
    cursor = q.end;
  });

  if (cursor < text.length) {
    nodes.push(<span key="txt-tail">{text.slice(cursor)}</span>);
  }

  return { nodes, legend: filtered };
}

/* --------------------------------------------------------------------------
   Gauge Sub-Component
   -------------------------------------------------------------------------- */

function UnifiedGauge({ level, score, isPrinting, onToggleInfo, showInfo }) {
  const finalScore = score != null ? Math.min(100, Math.max(0, Number(score))) : 0;
  const [animatedScore, setAnimatedScore] = useState(isPrinting ? finalScore : 0);

  useEffect(() => {
    if (isPrinting) {
      setAnimatedScore(finalScore);
      return;
    }
    if (score != null) {
      const timer = setTimeout(() => setAnimatedScore(finalScore), 80);
      return () => clearTimeout(timer);
    }
  }, [score, isPrinting, finalScore]);

  const isUnable = level === 'unable' || level === 'unknown' || score == null;
  const displayScore = isPrinting ? finalScore : animatedScore;
  const arcLength = 125.66;
  const dashOffset = isUnable ? arcLength : arcLength - (arcLength * displayScore) / 100;

  const colorClass =
    level === 'high' || level === 'bad'
      ? 'usr-gauge-high'
      : level === 'medium' || level === 'warn'
      ? 'usr-gauge-medium'
      : level === 'low' || level === 'ok' || level === 'safe'
      ? 'usr-gauge-low'
      : 'usr-gauge-unable';

  return (
    <div
      className={`usr-gauge-card ${colorClass}`}
      role="meter"
      aria-label={isUnable ? 'Risk score: Unable to verify' : `Risk score: ${score} of 100`}
      aria-valuenow={score ?? 0}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div className="usr-gauge-svg-wrap">
        <svg className="usr-gauge-svg" viewBox="0 0 100 56" aria-hidden="true">
          <path
            className="usr-gauge-bg-path"
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {!isUnable && (
            <path
              className="usr-gauge-score-path"
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={arcLength}
              style={{
                strokeDashoffset: dashOffset,
                transition: isPrinting ? 'none' : 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            />
          )}
        </svg>

        <div className="usr-gauge-center-text">
          <span className="usr-gauge-number">{isUnable ? '—' : animatedScore}</span>
          <span className="usr-gauge-denom">{isUnable ? 'Score unavailable' : '/ 100'}</span>
        </div>
      </div>
      <div className="usr-gauge-caption">
        <span className="usr-gauge-caption-label">Risk score</span>
        {onToggleInfo && (
          <button
            type="button"
            className="usr-gauge-info-btn no-print"
            onClick={(e) => {
              e.stopPropagation();
              onToggleInfo();
            }}
            aria-label="What do these mean?"
            aria-expanded={showInfo}
          >
            <Info size={12} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Subcomponent: UnifiedCheckCard
   -------------------------------------------------------------------------- */

function UnifiedCheckCard({ check, index, isPrinting = false }) {
  const [expanded, setExpanded] = useState(false);
  const state = check.state || 'unknown';
  const badge = normalizeCheckBadge(state);

  let rawFindings = [];
  if (Array.isArray(check.findings) && check.findings.length > 0) {
    rawFindings = check.findings.map(f => (typeof f === 'string' ? { text: f } : f));
  } else if (check.summary) {
    rawFindings = [{ text: check.summary }];
  } else if (check.reason) {
    rawFindings = [{ text: check.reason }];
  }

  // 1. Extract Scam Type if present in findings
  const { detectedType, filteredFindings } = extractScamTypeFromFindings(rawFindings);
  const scamTypeChip = detectedType
    ? formatScamTypeChip(detectedType)
    : (check.scamType ? formatScamTypeChip(check.scamType) : null);

  // 2. Categorize into "Found in the text" and "AI reading"
  const quotedList = [];
  const aiList = [];

  filteredFindings.forEach((f, idx) => {
    const rawText = f.text || '';
    const parsed = parseFindingText(rawText);
    const item = {
      ...f,
      text: parsed.text,
      quote: parsed.quote || f.quote || null,
      severity: f.severity || f.s || (badge.state === 'flag' ? 'warn' : 'info'),
      globalIdx: idx
    };

    if (parsed.isQuoteMatch || f.quote) {
      quotedList.push(item);
    } else {
      const cleanAiText = item.text.replace(/^AI reading:\s*/i, '').trim();
      aiList.push({
        ...item,
        text: cleanAiText || item.text
      });
    }
  });

  const totalFindings = filteredFindings.length;
  const hasMultipleGroups = quotedList.length > 0 && aiList.length > 0 && totalFindings > 2;
  const hasMore = totalFindings > 3;

  const renderFindingRow = (item) => {
    const isVisible = isPrinting || expanded || item.globalIdx < 3;
    if (!isVisible) return null;

    const dotClass =
      item.severity === 'bad' || item.severity === 'fail'
        ? 'usr-dot-flag'
        : item.severity === 'warn'
        ? 'usr-dot-warn'
        : item.severity === 'ok' || item.severity === 'pass'
        ? 'usr-dot-pass'
        : 'usr-dot-info';

    return (
      <li key={item.globalIdx} className="usr-check-finding-row">
        <span className={`usr-finding-dot ${dotClass}`} />
        <span className="usr-finding-text">
          <span>{item.text}</span>
          {item.quote && (
            <span className="usr-finding-quote-chip">&ldquo;{item.quote}&rdquo;</span>
          )}
        </span>
      </li>
    );
  };

  const visibleQuoted = quotedList.filter(item => isPrinting || expanded || item.globalIdx < 3);
  const visibleAi = aiList.filter(item => isPrinting || expanded || item.globalIdx < 3);

  return (
    <div className={`usr-check-box usr-check-state-${badge.state}`}>
      {/* Card Header: Check name on left, Status pill on right */}
      <div className="usr-check-header">
        <div className="usr-check-header-left">
          <span className="usr-check-title">{check.title || check.key || `Check ${index + 1}`}</span>
          {scamTypeChip && (
            <span className="usr-check-scam-chip">{scamTypeChip}</span>
          )}
        </div>
        <span className={`usr-badge ${badge.className}`}>{badge.label}</span>
      </div>

      {/* Thin colour bar under header */}
      <div className={`usr-check-color-bar usr-bar-state-${badge.state}`} />

      {/* Findings Content */}
      <div className="usr-check-findings-wrap">
        {hasMultipleGroups ? (
          <>
            {visibleQuoted.length > 0 && (
              <div className="usr-findings-subgroup">
                <div className="usr-findings-group-title">Found in the text</div>
                <ul className="usr-check-findings-list">
                  {visibleQuoted.map(renderFindingRow)}
                </ul>
              </div>
            )}
            {visibleAi.length > 0 && (
              <div className="usr-findings-subgroup">
                <div className="usr-findings-group-title">AI reading</div>
                <ul className="usr-check-findings-list">
                  {visibleAi.map(renderFindingRow)}
                </ul>
              </div>
            )}
          </>
        ) : (
          <ul className="usr-check-findings-list">
            {filteredFindings
              .map((f, idx) => {
                const parsed = parseFindingText(f.text || '');
                const cleanText = parsed.text.replace(/^AI reading:\s*/i, '').trim();
                return {
                  ...f,
                  text: cleanText || parsed.text,
                  quote: parsed.quote || f.quote || null,
                  severity: f.severity || f.s || 'info',
                  globalIdx: idx
                };
              })
              .map(renderFindingRow)}
          </ul>
        )}
      </div>

      {/* "Show N more" toggle for long cards */}
      {hasMore && !isPrinting && (
        <button
          type="button"
          className="usr-check-toggle-btn no-print"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <span>{expanded ? 'Show less' : `Show ${totalFindings - 3} more`}</span>
          <ChevronDown size={14} className={`usr-chevron ${expanded ? 'is-rotated' : ''}`} />
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main Component: UnifiedScanResult
   -------------------------------------------------------------------------- */

function isPageHostOrUrl(str) {
  if (!str || typeof str !== 'string') return true;
  const s = str.trim().toLowerCase();
  if (!s) return true;
  if (/^https?:\/\//i.test(s) || /^www\./i.test(s)) return true;
  if (s.includes('claude.ai') || s.includes('chatgpt.com') || s.includes('anthropic.com')) return true;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(s)) return true;
  return false;
}

export function UnifiedScanResult({
  result,
  rawInput = '',
  toolKind = null,
  isHistory = false,
  onReset = null,
  downloadReceipt: customDownloadReceipt = null
}) {
  const [activeTab, setActiveTab] = useState('why');
  const [revealedCode, setRevealedCode] = useState(false);
  const [copiedAccess, setCopiedAccess] = useState(false);
  const [copiedProof, setCopiedProof] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedPrevHash, setCopiedPrevHash] = useState(false);
  const [copiedReportHash, setCopiedReportHash] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showScorePopover, setShowScorePopover] = useState(false);
  const [showSourcesPopover, setShowSourcesPopover] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [showAllBreakdown, setShowAllBreakdown] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  // Ledger status: null = not checked, 'checking' = in-progress, { ok, label, detail } = done
  const [ledgerStatus, setLedgerStatus] = useState(null);
  const [ledgerChecking, setLedgerChecking] = useState(false);

  const scorePopoverRef = useRef(null);

  // Sync print events
  useEffect(() => {
    const onBefore = () => setIsPrinting(true);
    const onAfter = () => setIsPrinting(false);
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    return () => {
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
    };
  }, []);

  // Close popover on outside click or Escape
  useEffect(() => {
    if (!showScorePopover) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowScorePopover(false);
    };
    const handlePointerDown = (e) => {
      if (scorePopoverRef.current && !scorePopoverRef.current.contains(e.target)) {
        setShowScorePopover(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [showScorePopover]);

  if (!result) return null;

  const res = result;
  const report = res.report || {};
  const overall = report.overall || {};
  const inp = report.input || {};

  // Tool kind detection: prop > report.tool > inp.kind > res.tool > fallback 'job'
  const resolvedTool = (
    toolKind ||
    res.tool ||
    report.tool ||
    inp.kind ||
    (inp.url || inp.company || inp.recruiterEmail ? 'job' : 'message')
  ).toLowerCase();

  // Normalized risk level
  const rawLevel = String(res.level || overall.level || 'unknown').toLowerCase();
  const level =
    rawLevel === 'bad' ? 'high' :
    rawLevel === 'warn' ? 'medium' :
    rawLevel === 'ok' ? 'low' :
    rawLevel === 'safe' ? 'low' :
    (rawLevel === 'unknown' && resolvedTool === 'job') ? 'unknown' :
    rawLevel;

  const score = typeof res.score === 'number' ? res.score : (typeof overall.score === 'number' ? overall.score : null);

  // Confidence
  const rawConf = typeof res.confidence === 'number' ? res.confidence : (typeof overall.confidence === 'number' ? overall.confidence : 85);
  const confidenceNum = rawConf > 0 && rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf);

  let confidenceBandStr = res.confidenceBand || overall.confidenceBand || null;
  if (!confidenceBandStr && confidenceNum != null) {
    if (confidenceNum >= 75) confidenceBandStr = 'High';
    else if (confidenceNum >= 45) confidenceBandStr = 'Medium';
    else confidenceBandStr = 'Low';
  }

  // Scam type
  const scamType = res.scamType || report.scamType || null;
  const scamTypeFormatted = formatScamType(scamType);

  // Headline
  let headlineTitle = '';
  let headlineSub = '';
  const rawHeadline = res.headline || report.headline || overall.headline || res.primaryConcern || report.primaryConcern;

  if (Array.isArray(rawHeadline)) {
    headlineTitle = rawHeadline[0] || '';
    headlineSub = rawHeadline[1] || '';
  } else if (typeof rawHeadline === 'string') {
    headlineTitle = rawHeadline;
  } else {
    headlineTitle =
      level === 'high' ? 'High risk detected' :
      level === 'medium' ? 'Suspicious patterns detected' :
      level === 'low' ? 'Low risk detected' : 'Unable to verify';
  }

  // Checks
  const rawChecks = Array.isArray(res.checks) && res.checks.length > 0
    ? res.checks
    : (Array.isArray(report.checks) ? report.checks : []);

  const applicableChecks = rawChecks.filter((c) => c && c.state !== 'not_applicable');
  const notApplicableChecks = rawChecks.filter((c) => c && c.state === 'not_applicable');

  // Order checks by importance: Flag first, then Warning, then Unknown, then Pass
  const sortedApplicableChecks = useMemo(() => {
    return [...applicableChecks]
      .map((c, originalIdx) => ({ c, originalIdx }))
      .sort((a, b) => {
        const pA = CHECK_PRIORITY[String(a.c.state).toLowerCase()] || 3;
        const pB = CHECK_PRIORITY[String(b.c.state).toLowerCase()] || 3;
        if (pA !== pB) return pA - pB;
        return a.originalIdx - b.originalIdx;
      })
      .map(item => item.c);
  }, [applicableChecks]);

  // Advice & What to do (Deduplicated via dedupeSafetyAdvice)
  const rawActions = Array.isArray(res.whatToDo) && res.whatToDo.length > 0
    ? res.whatToDo
    : (Array.isArray(report.whatToDo) && report.whatToDo.length > 0
    ? report.whatToDo
    : getDefaultWhatToDo(resolvedTool, level));

  const dedupedActions = useMemo(() => dedupeSafetyAdvice(rawActions), [rawActions]);
  const topThreeActions = dedupedActions.slice(0, 3);

  // Extracted items
  const extracted = res.extractedItems || report.extractedItems || {};
  const upiIds = extracted.upiIds || [];
  const amounts = extracted.amounts || [];
  const links = extracted.links || [];
  const phones = extracted.phones || [];
  const emails = extracted.emails || [];
  const handleInfo = extracted.handleInfo || [];

  const hasExtractedItems =
    upiIds.length > 0 || amounts.length > 0 || links.length > 0 || phones.length > 0 || emails.length > 0;

  // Evidence & Highlighted Text
  const evidenceItems = Array.isArray(res.evidence) && res.evidence.length > 0
    ? res.evidence
    : Array.isArray(report.evidence) && report.evidence.length > 0
    ? report.evidence
    : Array.isArray(res.flaggedPhrases)
    ? res.flaggedPhrases
    : [];

  const textToAnalyze = rawInput || inp.description || inp.desc || (typeof inp === 'string' ? inp : '');
  const highlighted = useMemo(
    () => highlightCheckedText(textToAnalyze, evidenceItems),
    [textToAnalyze, evidenceItems]
  );

  // Sources
  const rawSources = Array.isArray(report.sources) ? report.sources : (Array.isArray(res.sources) ? res.sources : []);
  const evidenceSources = res.evidenceSources || report.evidenceSources || null;
  const sourcesLine = formatEvidenceSources(evidenceSources, rawSources);

  const sourcesList = [];
  if (evidenceSources && typeof evidenceSources === 'object') {
    Object.entries(evidenceSources).forEach(([k, v]) => {
      if (v) sourcesList.push({ name: k.replace(/([A-Z])/g, ' $1'), state: 'ran' });
    });
  } else if (rawSources.length > 0) {
    rawSources.forEach((s) => sourcesList.push({ name: s, state: 'ran' }));
  }
  const sourcesRanCount = sourcesList.length;

  // Score breakdown
  const rawBreakdown = Array.isArray(res.scoreBreakdown)
    ? res.scoreBreakdown
    : Array.isArray(report.scoreBreakdown)
    ? report.scoreBreakdown
    : Array.isArray(overall.scoreBreakdown)
    ? overall.scoreBreakdown
    : [];

  const sortedBreakdown = useMemo(() => {
    return [...rawBreakdown].sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
  }, [rawBreakdown]);

  const isBreakdownExpanded = isPrinting || breakdownOpen;
  const visibleBreakdown = isPrinting || showAllBreakdown ? sortedBreakdown : sortedBreakdown.slice(0, 5);

  const cleanedConfidenceFactors = useMemo(
    () => cleanConfidenceFactors(res.confidenceFactors || overall.confidenceFactors),
    [res.confidenceFactors, overall.confidenceFactors]
  );

  // Proof
  const receipt = res.receipt || res.ledgerProof || null;
  const proofId = res.proofId || receipt?.proofId || report.proofId || '';
  const accessCode = res.accessCode || receipt?.accessCode || null;
  const blockIndex = res.block != null ? res.block : (receipt?.block != null ? receipt.block : null);
  const blockHash = res.blockHash || receipt?.blockHash || null;
  const prevHash = res.prevHash || receipt?.prevHash || null;
  const reportHash = res.reportHash || receipt?.reportHash || null;
  const blockTimestamp = res.blockTimestamp || null;
  const isSaved = res.saved === true || isHistory;
  const timeFormatted = blockTimestamp || res.createdAt || res.timestamp || report.generatedAt || new Date().toISOString();

  // "Check now" — calls /api/proof/verify with proofId + blockHash
  const handleCheckLedger = useCallback(async () => {
    if (!proofId || ledgerChecking) return;
    setLedgerChecking(true);
    setLedgerStatus(null);
    try {
      const payload = blockHash
        ? { proofId, hash: blockHash }
        : { proofId };
      const d = await fetch('/api/proof/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(r => r.json());
      if (d && (d.status === 'intact' || d.ok === true)) {
        setLedgerStatus({ ok: true, label: 'Chain intact', detail: null });
      } else {
        const outcome = d?.status || d?.outcome;
        const label = outcome === 'report_modified' ? 'Report modified'
          : outcome === 'ledger_altered' ? 'Ledger altered'
          : outcome === 'hash_mismatch' ? 'Hash mismatch'
          : outcome === 'not_found' ? 'Not found in ledger'
          : 'Verification failed';
        setLedgerStatus({ ok: false, label, detail: d?.summary || d?.reason || null });
      }
    } catch {
      setLedgerStatus({ ok: false, label: 'Verification failed', detail: 'Network error' });
    } finally {
      setLedgerChecking(false);
    }
  }, [proofId, blockHash, ledgerChecking]);

  // Handlers
  const handleCopyProof = () => {
    if (!proofId) return;
    navigator.clipboard?.writeText?.(proofId);
    setCopiedProof(true);
    setTimeout(() => setCopiedProof(false), 2000);
  };

  const handleCopyHash = () => {
    if (!blockHash) return;
    navigator.clipboard?.writeText?.(blockHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleCopyPrevHash = () => {
    if (!prevHash) return;
    navigator.clipboard?.writeText?.(prevHash);
    setCopiedPrevHash(true);
    setTimeout(() => setCopiedPrevHash(false), 2000);
  };

  const handleCopyReportHash = () => {
    if (!reportHash) return;
    navigator.clipboard?.writeText?.(reportHash);
    setCopiedReportHash(true);
    setTimeout(() => setCopiedReportHash(false), 2000);
  };

  const handleCopyAccess = () => {
    if (!accessCode) return;
    navigator.clipboard?.writeText?.(accessCode);
    setCopiedAccess(true);
    setTimeout(() => setCopiedAccess(false), 2000);
  };

  const handleCopySummary = () => {
    const lines = [
      `Cyber Shield Verification Result`,
      `Tool: ${resolvedTool.toUpperCase()}`,
      `Level: ${level.toUpperCase()}`,
      score != null ? `Score: ${score}/100` : null,
      confidenceBandStr ? `Confidence: ${confidenceBandStr}` : null,
      `Finding: ${headlineTitle}`,
      proofId ? `Proof ID: ${proofId}` : null,
      `Verification link: ${window.location.origin}/verify${proofId ? `?proof=${proofId}` : ''}`,
      `Screening aid, not a legal finding.`
    ].filter(Boolean).join('\n');

    navigator.clipboard?.writeText?.(lines);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleDownloadReceipt = () => {
    if (customDownloadReceipt) {
      customDownloadReceipt();
      return;
    }
    const receiptData = receipt || {
      version: 1,
      proofId,
      timestamp: timeFormatted,
      report,
      subject: { tool: resolvedTool }
    };
    try {
      const blob = new Blob([JSON.stringify(receiptData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${proofId || 'verification'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download receipt', err);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  const levelPillClass =
    level === 'high'
      ? 'usr-level-high'
      : level === 'medium'
      ? 'usr-level-medium'
      : level === 'low'
      ? 'usr-level-low'
      : 'usr-level-unable';

  const toolLabel =
    resolvedTool === 'upi'
      ? 'UPI & Payment Check'
      : resolvedTool === 'message'
      ? 'Message Scanner'
      : 'Job Offer Check';

  /* --------------------------------------------------------------------------
     Sub-render: Summary Block
     -------------------------------------------------------------------------- */
  const renderSummaryBlock = () => (
    <div className="usr-summary-top">
      <div className="usr-summary-header">
        <div className="usr-summary-chips">
          <span className={`usr-chip ${levelPillClass}`}>
            {level === 'high' && <ShieldAlert size={14} strokeWidth={2} />}
            {level === 'medium' && <AlertTriangle size={14} strokeWidth={2} />}
            {level === 'low' && <ShieldCheck size={14} strokeWidth={2} />}
            {level === 'unable' && <HelpCircle size={14} strokeWidth={2} />}
            <span>{level.toUpperCase()} RISK</span>
          </span>

          {scamTypeFormatted && (
            <span className="usr-chip usr-chip-scamtype">{scamTypeFormatted}</span>
          )}

          <span className="usr-chip usr-chip-tool">{toolLabel}</span>

          {confidenceBandStr && (
            <span className="usr-chip usr-chip-confidence">
              <span>Confidence: {confidenceBandStr} ({confidenceNum}%)</span>
            </span>
          )}

          {sourcesRanCount > 0 && (
            <div className="usr-popover-anchor">
              <button
                type="button"
                className="usr-chip usr-chip-interactive no-print"
                onClick={() => setShowSourcesPopover(!showSourcesPopover)}
                aria-expanded={showSourcesPopover}
                aria-label={`${sourcesRanCount} evidence sources. Click to view.`}
              >
                <span>{sourcesRanCount} source{sourcesRanCount !== 1 ? 's' : ''}</span>
                <Layers size={12} strokeWidth={2} />
              </button>
              {showSourcesPopover && (
                <div className="usr-popover-bubble" role="tooltip">
                  <div className="usr-popover-title">Evidence Sources Evaluated</div>
                  <ul className="usr-sources-list">
                    {sourcesList.map((s, idx) => (
                      <li key={idx} className="usr-source-item">
                        <span className="usr-source-dot" />
                        <span>{s.name}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="usr-popover-close"
                    onClick={() => setShowSourcesPopover(false)}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Risk Gauge */}
        <div className="usr-gauge-slot">
          <div className="usr-gauge-popover-anchor" ref={scorePopoverRef}>
            <UnifiedGauge
              level={level}
              score={score}
              isPrinting={isPrinting}
              onToggleInfo={() => setShowScorePopover((prev) => !prev)}
              showInfo={showScorePopover}
            />
            {showScorePopover && (
              <div className="usr-popover-bubble usr-score-popover-bubble" role="tooltip">
                <div className="usr-popover-header">
                  <div className="usr-popover-title">What do these mean?</div>
                  <button
                    type="button"
                    className="usr-popover-close"
                    onClick={() => setShowScorePopover(false)}
                    aria-label="Close"
                  >
                    Close
                  </button>
                </div>
                <p className="usr-popover-text">
                  Risk score: how strong the warning signs are. Confidence: how reliable this reading is, based on input clarity, live evidence feeds, and agreement across signals.
                </p>
                {cleanedConfidenceFactors.length > 0 && (
                  <div className="usr-popover-factors-wrap">
                    <div className="usr-popover-factors-title">Confidence factors:</div>
                    <ul className="usr-popover-factors-list">
                      {cleanedConfidenceFactors.map((f, idx) => (
                        <li key={idx}>
                          <span>{f.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Headline Block */}
      <div className="usr-headline-block">
        <h2 className="usr-headline-title">{headlineTitle}</h2>
        {headlineSub && <p className="usr-headline-sub">{headlineSub}</p>}

        {level === 'high' && (confidenceBandStr === 'Low' || confidenceBandStr === 'Medium') && (
          <div className="usr-confidence-warning-line" role="status">
            <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" />
            <span>Warning signs are strong, but live evidence was partial. Treat this as an urgent warning and confirm directly with official sources.</span>
          </div>
        )}

        {resolvedTool === 'upi' && (scamType === 'fake_payment_proof' || scamType === 'unverifiable_receipt') && (
          <div className="usr-bank-advisory">
            <AlertOctagon size={16} strokeWidth={2} />
            <span>Check your official banking app for the credit. Screenshots and UTR numbers alone cannot prove payment.</span>
          </div>
        )}
      </div>

      {/* Top 3 What to do now */}
      {topThreeActions.length > 0 && (
        <div className="usr-quick-guidance">
          <div className="usr-guidance-title">What to do now</div>
          <ol className="usr-guidance-list">
            {topThreeActions.map((act, i) => (
              <li key={i}>{act}</li>
            ))}
          </ol>
        </div>
      )}

      {level === 'unable' && !isPrinting && onReset && (
        <div className="usr-unable-action-row no-print">
          <button type="button" className="usr-btn-retry" onClick={onReset}>
            Try again with more details
          </button>
        </div>
      )}
    </div>
  );

  /* --------------------------------------------------------------------------
     Sub-render: Why Panel
     -------------------------------------------------------------------------- */
  const cleanCompany = (inp.company && !isPageHostOrUrl(inp.company)) ? String(inp.company).trim() : null;

  const renderWhyPanel = () => (
    <div className="usr-tab-panel">
      {/* Job Offer Details (if job scan) */}
      {(cleanCompany || inp.url || inp.recruiterEmail) && (
        <div className="usr-job-meta-box">
          <div className="usr-card-subhead">Job Offer Details Analyzed</div>
          <div className="usr-job-meta-grid">
            {cleanCompany && (
              <div className="usr-job-meta-item">
                <Building size={14} className="usr-meta-icon" />
                <span className="usr-meta-label">Company:</span>
                <strong className="usr-meta-val">{cleanCompany}</strong>
              </div>
            )}
            {inp.url && (
              <div className="usr-job-meta-item">
                <Link2 size={14} className="usr-meta-icon" />
                <span className="usr-meta-label">Job URL:</span>
                <span className="usr-meta-val mono">{inp.url}</span>
              </div>
            )}
            {inp.recruiterEmail && (
              <div className="usr-job-meta-item">
                <Mail size={14} className="usr-meta-icon" />
                <span className="usr-meta-label">Recruiter:</span>
                <span className="usr-meta-val mono">{inp.recruiterEmail}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Highlighted text or evidence quotes */}
      {textToAnalyze ? (
        <div className="usr-card usr-checked-text-card">
          <div className="usr-card-subhead">Analyzed Input &amp; Highlighted Signals</div>
          <div className="usr-highlight-scrollbox">{highlighted?.nodes}</div>

          {highlighted?.legend && highlighted.legend.length > 0 && (
            <div className="usr-legend-container">
              <div className="usr-legend-title">Flagged Passages</div>
              <ul className="usr-legend-list">
                {highlighted.legend.map((item, idx) => (
                  <li key={idx} className="usr-legend-item">
                    <span className="usr-legend-badge">[{item.num}]</span>
                    <span className="usr-legend-quote">&ldquo;{item.quote}&rdquo;</span>
                    <span className="usr-legend-reason">&mdash; {item.interpretation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : evidenceItems.length > 0 ? (
        <div className="usr-card usr-evidence-excerpts-card">
          <div className="usr-card-subhead">Verified Quoted Evidence</div>
          <div className="usr-evidence-grid">
            {evidenceItems.map((ev, idx) => (
              <div key={idx} className="usr-evidence-box">
                <blockquote className="usr-quote">&ldquo;{ev.quote || ev.text}&rdquo;</blockquote>
                {(ev.interpretation || ev.why || ev.reason) && (
                  <p className="usr-quote-interp">&mdash; {ev.interpretation || ev.why || ev.reason}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Extracted Artifacts */}
      {hasExtractedItems && (
        <div className="usr-extracted-section">
          <div className="usr-extracted-title">Extracted Identity &amp; Payment Signals</div>
          <div className="usr-extracted-chips-row">
            {upiIds.map((u, i) => (
              <span key={`upi-${i}`} className="usr-found-chip mono">UPI: {typeof u === 'string' ? u : u.upiId || u}</span>
            ))}
            {amounts.map((a, i) => (
              <span key={`amt-${i}`} className="usr-found-chip mono">Amount: {typeof a === 'string' ? a : (a.formatted || a.raw || a)}</span>
            ))}
            {links.map((l, i) => (
              <span key={`lnk-${i}`} className="usr-found-chip mono">Link: {typeof l === 'string' ? l : l.url || l}</span>
            ))}
            {phones.map((p, i) => (
              <span key={`ph-${i}`} className="usr-found-chip mono">Phone: {typeof p === 'string' ? p : p.normalized || p}</span>
            ))}
            {emails.map((e, i) => (
              <span key={`em-${i}`} className="usr-found-chip mono">Email: {typeof e === 'string' ? e : e.email || e}</span>
            ))}
          </div>
        </div>
      )}

      {/* UPI Handle Information */}
      {handleInfo.length > 0 && (
        <div className="usr-handle-info-section">
          <div className="usr-handle-info-title">UPI Handle Information</div>
          <ul className="usr-handle-info-list">
            {handleInfo.map((h, i) => (
              <li key={i}>
                <code>@{h.handle}</code>: {h.wellKnown
                  ? `standard bank/payment app handle (${h.issuerHint || 'known provider'}).`
                  : 'handle not in our list of well-known handles. This does not mean it is fake.'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Methodology & Score Breakdown */}
      <div className="usr-methodology-card">
        <div className="usr-card-subhead">How this verdict was reached</div>
        {sourcesLine && <p className="usr-methodology-desc">{sourcesLine}</p>}

        {sortedBreakdown.length > 0 && (
          <div className="usr-breakdown-disclosure">
            <button
              type="button"
              className="usr-breakdown-toggle-btn no-print"
              onClick={() => setBreakdownOpen(!breakdownOpen)}
              aria-expanded={isBreakdownExpanded}
            >
              <span className="usr-breakdown-toggle-title">Score breakdown &amp; weights</span>
              <ChevronDown size={16} className={`usr-chevron ${isBreakdownExpanded ? 'is-rotated' : ''}`} />
            </button>

            {isBreakdownExpanded && (
              <div className="usr-breakdown-content">
                {visibleBreakdown.map((sb, i) => {
                  const pts = Number(sb.points) || 0;
                  const ptsBadge = pts > 0 ? `+${pts}` : `${pts}`;
                  return (
                    <div key={i} className="usr-breakdown-row">
                      <span className="usr-breakdown-badge">{ptsBadge}</span>
                      <span className="usr-breakdown-text">
                        {sb.description || sb.quote || sb.title || 'Risk signal evaluated'}
                      </span>
                    </div>
                  );
                })}

                {!isPrinting && !showAllBreakdown && sortedBreakdown.length > 5 && (
                  <button
                    type="button"
                    className="usr-btn-show-all no-print"
                    onClick={() => setShowAllBreakdown(true)}
                  >
                    Show all ({sortedBreakdown.length})
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {cleanedConfidenceFactors.length > 0 && (
          <ul className="usr-confidence-factors-list">
            {cleanedConfidenceFactors.map((f, idx) => (
              <li key={idx} className="usr-confidence-factor-item">
                {f.type === 'minus' ? (
                  <Minus size={14} strokeWidth={2.5} className="usr-factor-icon-minus" />
                ) : (
                  <Check size={14} strokeWidth={2.5} className="usr-factor-icon-check" />
                )}
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  /* --------------------------------------------------------------------------
     Sub-render: Checks Panel
     -------------------------------------------------------------------------- */
  const renderChecksPanel = () => (
    <div className="usr-tab-panel">
      {sortedApplicableChecks.length > 0 && (
        <div className="usr-checks-grid">
          {sortedApplicableChecks.map((c, idx) => (
            <UnifiedCheckCard
              key={c.key || c.title || idx}
              check={c}
              index={idx}
              isPrinting={isPrinting}
            />
          ))}
        </div>
      )}

      {notApplicableChecks.length > 0 && (
        <div className="usr-checks-na-line">
          Not applicable to this input: {notApplicableChecks.map((c) => c.title || c.key).join(', ')}
        </div>
      )}
    </div>
  );

  /* --------------------------------------------------------------------------
     Sub-render: What to do Panel
     -------------------------------------------------------------------------- */
  const renderActionsPanel = () => (
    <div className="usr-tab-panel">
      <div className="usr-card usr-actions-card">
        <div className="usr-card-subhead">Recommended Actions</div>
        <ul className="usr-actions-full-list">
          {dedupedActions.map((actionText, idx) => {
            const hasPortal = actionText.includes('cybercrime.gov.in');
            return (
              <li key={idx} className="usr-action-full-item">
                <ChevronRight size={16} strokeWidth={2} className="usr-action-arrow" />
                <span>
                  {hasPortal ? (
                    <>
                      {actionText.split('cybercrime.gov.in')[0]}
                      <a
                        href="https://cybercrime.gov.in"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="usr-portal-link"
                      >
                        cybercrime.gov.in
                        <ExternalLink size={12} strokeWidth={1.75} />
                      </a>
                      {actionText.split('cybercrime.gov.in')[1]}
                    </>
                  ) : (
                    actionText
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        {/* 1930 Helpline Box */}
        <div className="usr-helpline-box">
          <div className="usr-helpline-tag">National Cyber Crime Helpline</div>
          <div className="usr-helpline-number">Dial 1930</div>
          <p className="usr-helpline-desc">
            Call 1930 immediately to report financial fraud and freeze fraudulent transactions within the golden hour.
          </p>
        </div>
      </div>
    </div>
  );

  /* --------------------------------------------------------------------------
     Sub-render: Proof Panel
     -------------------------------------------------------------------------- */
  const renderProofPanel = (forPrint = false) => {
    // Helper: shorten a hex hash to first8…last8
    const shortenHash = (h) => {
      if (!h || typeof h !== 'string') return null;
      if (h.length <= 20) return h;
      return `${h.slice(0, 8)}…${h.slice(-8)}`;
    };

    // Format UTC time and IST local time
    const utcStr = timeFormatted
      ? String(timeFormatted).replace('T', ' ').slice(0, 19) + ' UTC'
      : null;
    const istStr = (() => {
      if (!timeFormatted) return null;
      try {
        return new Date(timeFormatted).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true
        }) + ' IST';
      } catch { return null; }
    })();

    return (
      <div className="usr-tab-panel">
        <div className="usr-card usr-proof-card">
          <div className="usr-card-subhead">Cryptographic Audit Trail</div>
          <p className="usr-proof-intro">
            Anchored to a tamper-evident SHA-256 ledger block to prove results were never altered.
          </p>

          {/* Saved badge — blue tinted, AA contrast */}
          {isSaved && (
            <div className="usr-saved-badge">
              <Check size={15} strokeWidth={2.5} className="usr-saved-badge-icon" aria-hidden="true" />
              <span>Saved to your history</span>
            </div>
          )}

          <div className="usr-proof-grid">

            {/* Proof ID */}
            {proofId ? (
              <div className="usr-proof-cell">
                <label>Proof ID</label>
                <div className="usr-proof-val">
                  <span className="mono usr-proof-id-text">{proofId}</span>
                  {!forPrint && (
                    <button
                      type="button"
                      className="usr-btn-copy-code no-print"
                      onClick={handleCopyProof}
                      title="Copy Proof ID"
                    >
                      {copiedProof ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedProof ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {/* Block number */}
            {blockIndex != null ? (
              <div className="usr-proof-cell">
                <label>Block number</label>
                <div className="usr-proof-val mono">#{blockIndex}</div>
              </div>
            ) : proofId ? (
              <div className="usr-proof-cell">
                <label>Block number</label>
                <div className="usr-proof-val usr-proof-na">Not available for this report</div>
              </div>
            ) : null}

            {/* Time */}
            {utcStr && (
              <div className="usr-proof-cell">
                <label>Time</label>
                <div className="usr-proof-val usr-proof-time-wrap">
                  <span>{utcStr}</span>
                  {istStr && <span className="usr-proof-local-time">{istStr}</span>}
                </div>
              </div>
            )}

            {/* Ledger status */}
            {proofId && !forPrint && (
              <div className="usr-proof-cell">
                <label>Ledger status</label>
                <div className="usr-proof-val usr-proof-status-row">
                  {ledgerStatus ? (
                    <span className={`usr-ledger-badge ${ledgerStatus.ok ? 'usr-ledger-ok' : 'usr-ledger-fail'}`}>
                      {ledgerStatus.ok ? <ShieldCheck size={13} /> : <AlertTriangle size={13} />}
                      <span>{ledgerStatus.label}</span>
                    </span>
                  ) : (
                    <>
                      <span className="usr-proof-na">Not checked yet</span>
                      <button
                        type="button"
                        className="usr-btn-check-ledger no-print"
                        onClick={handleCheckLedger}
                        disabled={ledgerChecking}
                        aria-label="Check ledger now"
                      >
                        {ledgerChecking
                          ? <Loader2 size={12} className="usr-spin" />
                          : <Clock size={12} />}
                        <span>{ledgerChecking ? 'Checking…' : 'Check now'}</span>
                      </button>
                    </>
                  )}
                </div>
                {ledgerStatus && !ledgerStatus.ok && ledgerStatus.detail && (
                  <div className="usr-proof-status-detail">{ledgerStatus.detail}</div>
                )}
              </div>
            )}

            {/* Report hash (SHA-256) */}
            {reportHash && (
              <div className="usr-proof-cell usr-proof-cell-full">
                <label>Report hash (SHA-256)</label>
                <div className="usr-proof-val">
                  <span className="usr-proof-hash mono" title={reportHash}>{shortenHash(reportHash)}</span>
                  {!forPrint && (
                    <button
                      type="button"
                      className="usr-btn-copy-code no-print"
                      onClick={handleCopyReportHash}
                      title="Copy full report hash"
                    >
                      {copiedReportHash ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedReportHash ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Block hash */}
            {blockHash && (
              <div className="usr-proof-cell usr-proof-cell-full">
                <label>Block hash</label>
                <div className="usr-proof-val">
                  <span className="usr-proof-hash mono" title={blockHash}>{shortenHash(blockHash)}</span>
                  {!forPrint && (
                    <button
                      type="button"
                      className="usr-btn-copy-code no-print"
                      onClick={handleCopyHash}
                      title="Copy full block hash"
                    >
                      {copiedHash ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedHash ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Previous block hash */}
            {prevHash && (
              <div className="usr-proof-cell usr-proof-cell-full">
                <label>Previous block hash</label>
                <div className="usr-proof-val">
                  <span className="usr-proof-hash mono" title={prevHash}>{shortenHash(prevHash)}</span>
                  {!forPrint && (
                    <button
                      type="button"
                      className="usr-btn-copy-code no-print"
                      onClick={handleCopyPrevHash}
                      title="Copy full previous block hash"
                    >
                      {copiedPrevHash ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedPrevHash ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Access code (live result only, never history) */}
            {!forPrint && accessCode && !isHistory && (
              <div className="usr-proof-cell usr-proof-cell-full">
                <label>Access Code</label>
                <div className="usr-access-code-row">
                  {revealedCode ? (
                    <>
                      <span className="usr-access-code-text mono">{accessCode}</span>
                      <button
                        type="button"
                        className="usr-btn-copy-code no-print"
                        onClick={handleCopyAccess}
                        title="Copy Access Code"
                      >
                        {copiedAccess ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copiedAccess ? 'Copied' : 'Copy'}</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="usr-btn-reveal no-print"
                      onClick={() => setRevealedCode(true)}
                    >
                      <Eye size={13} strokeWidth={1.75} />
                      <span>Reveal Access Code</span>
                    </button>
                  )}
                </div>
                <div className="usr-proof-tip">
                  Keep this code private. It is kept in memory and proves record ownership.
                </div>
              </div>
            )}
          </div>

          {/* Access code note */}
          {(isHistory || (!accessCode && proofId)) && (
            <p className="usr-proof-access-note">
              The Access Code was shown once after the scan and is not stored.
            </p>
          )}

          {/* "Verify this proof" blue button */}
          {proofId && (
            <div className="usr-verify-ledger-row">
              <Link
                to={`/verify?proof=${encodeURIComponent(proofId)}`}
                className="usr-verify-btn"
                title="Verify this proof on the ledger"
                aria-label="Verify this proof on the ledger"
                target={forPrint ? undefined : '_blank'}
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} strokeWidth={1.75} />
                <span>Verify this proof</span>
              </Link>
            </div>
          )}

          {/* Live-only action buttons (History page has action buttons in the top header) */}
          {!forPrint && !isHistory && (
            <div className="usr-proof-actions-row no-print">
              <button
                type="button"
                className="usr-btn-action"
                onClick={handleDownloadReceipt}
                disabled={!receipt && !proofId}
              >
                <Download size={14} strokeWidth={1.75} />
                <span>Download verification file (.json)</span>
              </button>

              <button type="button" className="usr-btn-action" onClick={handlePrintPdf}>
                <Printer size={14} strokeWidth={1.75} />
                <span>Download PDF</span>
              </button>

              <button type="button" className="usr-btn-action" onClick={handleCopySummary}>
                {copiedSummary ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedSummary ? 'Summary copied' : 'Copy summary'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* --------------------------------------------------------------------------
     Print Mode Render (Continuous document matching on-screen layout)
     -------------------------------------------------------------------------- */
  if (isPrinting) {
    return (
      <div className="usr-result-card usr-printing" role="region" aria-label="Scan Result">
        {renderSummaryBlock()}

        <div className="usr-print-section-heading">Why</div>
        {renderWhyPanel()}

        <div className="usr-print-section-heading">Checks ({applicableChecks.length})</div>
        {renderChecksPanel()}

        <div className="usr-print-section-heading">What to do</div>
        {renderActionsPanel()}

        <div className="usr-print-section-heading">Proof</div>
        {renderProofPanel(true)}

        <div className="usr-legal-footer">Screening aid, not a legal finding.</div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
     Screen Render (Tabbed Layout)
     -------------------------------------------------------------------------- */
  return (
    <div className="usr-result-card" role="region" aria-label="Scan Result">
      {/* 1. TOP SUMMARY CARD */}
      {renderSummaryBlock()}

      {/* 2. TABS */}
      <div className="usr-tabs-wrapper">
        <div className="usr-tab-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'why'}
            className={`usr-tab-btn ${activeTab === 'why' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('why')}
          >
            Why
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'checks'}
            className={`usr-tab-btn ${activeTab === 'checks' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('checks')}
          >
            Checks ({applicableChecks.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'actions'}
            className={`usr-tab-btn ${activeTab === 'actions' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('actions')}
          >
            What to do
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'proof'}
            className={`usr-tab-btn ${activeTab === 'proof' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('proof')}
          >
            Proof
          </button>
        </div>

        <div className="usr-tab-content">
          {activeTab === 'why' && renderWhyPanel()}
          {activeTab === 'checks' && renderChecksPanel()}
          {activeTab === 'actions' && renderActionsPanel()}
          {activeTab === 'proof' && renderProofPanel(false)}
        </div>
      </div>

      {/* Footer disclaimer */}
      <div className="usr-legal-footer">Screening aid, not a legal finding.</div>
    </div>
  );
}

export default UnifiedScanResult;
