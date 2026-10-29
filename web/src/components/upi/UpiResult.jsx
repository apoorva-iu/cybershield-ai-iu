import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  AlertOctagon
} from 'lucide-react';
import { UpiGauge } from './UpiGauge';

function formatEvidenceSources(evidenceSources) {
  if (!evidenceSources) return null;
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
  } else if (typeof evidenceSources === 'object') {
    if (evidenceSources.aiPasses > 0 || evidenceSources.aiReading) {
      parts.push('AI reading');
    }
    if (evidenceSources.linkLookups > 0 || evidenceSources.linkReputation) {
      parts.push('link lookups');
    }
    if (evidenceSources.upiRegistry || evidenceSources.upiHandle) {
      parts.push('UPI handle lookups');
    }
    for (const [key, val] of Object.entries(evidenceSources)) {
      if (['aiPasses', 'aiReading', 'linkLookups', 'linkReputation', 'upiRegistry', 'upiHandle'].includes(key)) continue;
      if (typeof val === 'string' && val.trim()) {
        parts.push(val.trim());
      } else if (val === true || (typeof val === 'number' && val > 0)) {
        parts.push(key.replace(/([A-Z])/g, ' $1').toLowerCase());
      }
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
      if (text) {
        cleaned.push({
          text,
          type: isMinus ? 'minus' : 'check'
        });
      }
      continue;
    }

    if (typeof factor !== 'string') continue;
    // Omit model self-assessed certainty line
    if (/self-assessed|self-certainty|model certainty|confidence score/i.test(factor)) {
      continue;
    }

    // Determine icon: check or minus
    const isMinus =
      /\(\+?0(?:\.0+)?\)/.test(factor) ||
      /\(-/.test(factor) ||
      /\b(degraded|noisy|unreadable|minimal|limited|short|poor|missing|lacks?|no\s)\b/i.test(factor);

    // Strip numbers, decimals, percentages, +0.20, (+0.20), (180 characters), etc.
    let text = factor
      .replace(/\s*\([+-]?\d*(?:\.\d+)?%?\)/g, '')
      .replace(/\s*\(\d+\s*(?:characters?|chars?|signals?|items?|passes?)\)/gi, '')
      .replace(/\s*\([^)]*\d+[^)]*\)/g, '')
      .replace(/\b\d+(?:\.\d+)?%/g, '')
      .replace(/[+-]?\b\d+\.\d+\b/g, '')
      .replace(/[+-]\d+\b/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[:,\-\s]+$/, '')
      .trim();

    if (text) {
      cleaned.push({
        text,
        type: isMinus ? 'minus' : 'check'
      });
    }
  }

  return cleaned;
}

function formatScamType(type) {
  if (!type || type === 'unknown' || type === 'none') return null;
  const map = {
    pay_to_receive: 'Pay-to-receive pattern',
    fake_payment_proof: 'Fake payment proof',
    overpayment_trap: 'Refund / overpayment trap',
    advance_fee: 'Advance fee demand',
    unverifiable_receipt: 'Unverifiable receipt',
    routine_payment: 'Routine payment'
  };
  return map[type] || type.replace(/_/g, ' ');
}

function dedupeActions(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const res = [];
  for (const item of list) {
    if (!item || typeof item !== 'string') continue;
    const norm = item.trim().toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      res.push(item.trim());
    }
  }
  return res;
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
          interpretation: item.interpretation || item.reason || ''
        });
      }
    }
  });

  if (validQuotes.length === 0) {
    return {
      nodes: <span className="upi-raw-text">{text}</span>,
      legend: []
    };
  }

  // Sort by start index
  validQuotes.sort((a, b) => a.start - b.start);

  // Filter overlapping ranges
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
      <mark key={`mark-${i}`} className="upi-highlight-quote">
        <span className="upi-quote-text">{text.slice(q.start, q.end)}</span>
        <sup className="upi-quote-badge">[{q.num}]</sup>
      </mark>
    );
    cursor = q.end;
  });

  if (cursor < text.length) {
    nodes.push(<span key="txt-tail">{text.slice(cursor)}</span>);
  }

  return {
    nodes,
    legend: filtered
  };
}

export function UpiResult({
  result,
  rawInput = '',
  onReset,
  imageCanvas = null
}) {
  const [activeTab, setActiveTab] = useState('why');
  const [revealedCode, setRevealedCode] = useState(false);
  const [copiedAccess, setCopiedAccess] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showScorePopover, setShowScorePopover] = useState(false);
  const [showSourcesPopover, setShowSourcesPopover] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [showAllBreakdown, setShowAllBreakdown] = useState(false);
  const scorePopoverRef = useRef(null);

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

  const res = result || {};
  const level = res.level || 'unable';
  const score = res.score;
  const isUnable = level === 'unable' || res.mode === 'ai_unavailable' || res.reason === 'ai_unavailable';
  const scamType = res.scamType;
  const headline = res.primaryConcern || res.headline || 'Payment check complete.';

  // Confidence band formatting: taken ONLY from the API's confidenceBand (hide when null)
  const rawBand = res.confidenceBand;
  let confidenceBandStr = null;
  if (typeof rawBand === 'string' && rawBand.trim()) {
    const b = rawBand.trim().toLowerCase();
    if (b === 'high') confidenceBandStr = 'High';
    else if (b === 'medium') confidenceBandStr = 'Medium';
    else if (b === 'low') confidenceBandStr = 'Low';
  }

  // Evidence sources list
  const sourcesList = [];
  if (res.evidenceSources) {
    if (typeof res.evidenceSources.aiPasses === 'number') {
      sourcesList.push({ name: 'Dual-pass AI analysis', state: res.evidenceSources.aiPasses > 0 ? 'ran' : 'skipped' });
    }
    if (typeof res.evidenceSources.linkLookups === 'number') {
      sourcesList.push({ name: 'External link reputation (URLhaus / RDAP)', state: res.evidenceSources.linkLookups > 0 ? 'ran' : 'skipped' });
    }
  }
  if (sourcesList.length === 0) {
    sourcesList.push({ name: 'AI message analysis', state: 'ran' });
    sourcesList.push({ name: 'UPI handle verification', state: 'ran' });
  }

  const sourcesRanCount = sourcesList.filter(s => s.state === 'ran').length;

  // Actions list
  const whatToDoList = Array.isArray(res.whatToDo) ? res.whatToDo : [];
  const topThreeActions = whatToDoList.slice(0, 3);
  const dedupedActions = useMemo(() => dedupeActions(whatToDoList), [whatToDoList]);

  // Checks: count excludes not-applicable checks
  const rawChecks = Array.isArray(res.checks)
    ? res.checks
    : Array.isArray(res.report?.checks)
    ? res.report.checks
    : [];

  const applicableChecks = rawChecks.filter((c) => c && c.state !== 'not_applicable');
  const notApplicableChecks = rawChecks.filter((c) => c && c.state === 'not_applicable');

  // Score breakdown
  const rawBreakdown = Array.isArray(res.scoreBreakdown)
    ? res.scoreBreakdown
    : Array.isArray(res.report?.scoreBreakdown)
    ? res.report.scoreBreakdown
    : [];

  const sortedBreakdown = useMemo(() => {
    return [...rawBreakdown].sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
  }, [rawBreakdown]);

  const isBreakdownExpanded = isPrinting || breakdownOpen;
  const visibleBreakdown = (isPrinting || showAllBreakdown)
    ? sortedBreakdown
    : sortedBreakdown.slice(0, 5);

  // Sources line and cleaned confidence factors
  const sourcesLine = formatEvidenceSources(res.evidenceSources);
  const cleanedConfidenceFactors = useMemo(
    () => cleanConfidenceFactors(res.confidenceFactors),
    [res.confidenceFactors]
  );

  // Extracted items
  const extracted = res.extractedItems || res.report?.extractedItems || {};
  const upiIds = extracted.upiIds || [];
  const amounts = extracted.amounts || [];
  const links = extracted.links || [];
  const phones = extracted.phones || [];
  const emails = extracted.emails || [];
  const handleInfo = extracted.handleInfo || [];

  const hasExtractedItems =
    upiIds.length > 0 || amounts.length > 0 || links.length > 0 || phones.length > 0 || emails.length > 0;
  const showUpiDisclaimer = Boolean((upiIds && upiIds.length > 0) || res.showUpiSafetyNote);

  // Proof data
  const receipt = res.receipt || res.ledgerProof || null;
  const proofId = receipt?.proofId || res.proofId;
  const accessCode = receipt?.accessCode || res.accessCode;
  const blockIndex = receipt?.block ?? res.block;
  const blockHash = receipt?.blockHash || res.blockHash;
  const isSaved = res.saved === true;

  // Highlight checked text
  const evidenceItems = Array.isArray(res.evidence)
    ? res.evidence
    : Array.isArray(res.flaggedPhrases)
    ? res.flaggedPhrases
    : [];
  const highlighted = highlightCheckedText(rawInput, evidenceItems);

  // In-memory screenshot data URL
  const screenshotDataUrl = useMemo(() => {
    if (!imageCanvas) return null;
    try {
      return imageCanvas.toDataURL ? imageCanvas.toDataURL('image/png') : null;
    } catch (e) {
      return null;
    }
  }, [imageCanvas]);

  // Handlers
  const handleCopyAccess = () => {
    if (!accessCode) return;
    navigator.clipboard?.writeText?.(accessCode);
    setCopiedAccess(true);
    setTimeout(() => setCopiedAccess(false), 2000);
  };

  const handleCopySummary = () => {
    const lines = [
      `Cyber Shield UPI Check Result`,
      `Level: ${level.toUpperCase()}`,
      score != null ? `Score: ${score}/100` : null,
      confidenceBandStr ? `Confidence: ${confidenceBandStr}` : null,
      `Finding: ${headline}`,
      proofId ? `Proof ID: ${proofId}` : null,
      `Verification link: ${window.location.origin}/verify${proofId ? `?proof=${proofId}` : ''}`,
      `Screening aid, not a legal finding.`
    ].filter(Boolean).join('\n');

    navigator.clipboard?.writeText?.(lines);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleDownloadReceipt = () => {
    if (!receipt) return;
    try {
      const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (proofId || 'upi-proof') + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download receipt', err);
    }
  };

  const handlePrintPdf = () => {
    setIsPrinting(true);
  };

  // Synchronize browser native print events (Ctrl+P)
  useEffect(() => {
    const onBeforePrint = () => {
      document.body.classList.add('upi-printing');
      setIsPrinting(true);
    };
    const onAfterPrint = () => {
      document.body.classList.remove('upi-printing');
      setIsPrinting(false);
    };

    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  // Print lifecycle when triggered by "Download PDF" button
  useEffect(() => {
    if (!isPrinting) return;

    const origTitle = document.title;
    const targetTitle = proofId ? `CyberShield-UPI-${proofId}` : 'CyberShield-UPI-Report';
    document.title = targetTitle;
    document.body.classList.add('upi-printing');

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      document.title = origTitle;
      document.body.classList.remove('upi-printing');
      window.removeEventListener('afterprint', cleanup);
      setIsPrinting(false);
    };

    window.addEventListener('afterprint', cleanup);
    const timer = setTimeout(cleanup, 60000);

    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        try {
          if (document.fonts?.ready) {
            await document.fonts.ready;
          }
        } catch (e) {}
        window.print();
      });
    });

    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [isPrinting, proofId]);

  // Honest Titles
  const levelTitle =
    level === 'high'
      ? 'High risk'
      : level === 'medium'
      ? 'Medium risk'
      : level === 'low'
      ? 'Low risk'
      : 'Unable to verify';

  const levelPillClass =
    level === 'high'
      ? 'upi-level-high'
      : level === 'medium'
      ? 'upi-level-medium'
      : level === 'low'
      ? 'upi-level-low'
      : 'upi-level-unable';

  // --------------------------------------------------------------------------
  // SUB-BLOCK: SUMMARY CARD (Rendered on screen and in print)
  // --------------------------------------------------------------------------
  const renderSummaryBlock = () => (
    <div className="upi-result-top">
      <div className="upi-result-header">
        <div className="upi-result-chips">
          <span className={`upi-chip ${levelPillClass}`}>
            {level === 'high' && <ShieldAlert size={14} strokeWidth={2} />}
            {level === 'medium' && <AlertTriangle size={14} strokeWidth={2} />}
            {level === 'low' && <ShieldCheck size={14} strokeWidth={2} />}
            {level === 'unable' && <HelpCircle size={14} strokeWidth={2} />}
            <span>{levelTitle}</span>
          </span>

          {formatScamType(scamType) && (
            <span className="upi-chip upi-chip-type">
              {formatScamType(scamType)}
            </span>
          )}

          {confidenceBandStr && (
            <span className="upi-chip upi-chip-confidence">
              <span>Confidence: {confidenceBandStr}</span>
            </span>
          )}

          {sourcesRanCount > 0 && (
            <div className="upi-popover-anchor">
              <button
                type="button"
                className="upi-chip upi-chip-interactive"
                onClick={() => setShowSourcesPopover(!showSourcesPopover)}
                aria-expanded={showSourcesPopover}
                aria-label={`${sourcesRanCount} evidence sources. Click to view.`}
              >
                <span>{sourcesRanCount} source{sourcesRanCount !== 1 ? 's' : ''}</span>
                <Layers size={12} strokeWidth={2} />
              </button>
              {showSourcesPopover && (
                <div className="upi-popover-bubble" role="tooltip">
                  <div className="upi-popover-title">Evidence Sources Evaluated</div>
                  <ul className="upi-sources-list">
                    {sourcesList.map((s, idx) => (
                      <li key={idx} className={`upi-source-item upi-source-${s.state}`}>
                        <span className="upi-source-dot" />
                        <span>{s.name} ({s.state})</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="upi-popover-close"
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
        <div className="upi-result-gauge-slot">
          <div className="upi-gauge-popover-anchor" ref={scorePopoverRef}>
            <UpiGauge
              level={level}
              score={score}
              onToggleInfo={() => setShowScorePopover((prev) => !prev)}
              showInfo={showScorePopover}
            />
            {showScorePopover && (
              <div className="upi-popover-bubble upi-score-popover-bubble" role="tooltip">
                <div className="upi-popover-header">
                  <div className="upi-popover-title">What do these mean?</div>
                  <button
                    type="button"
                    className="upi-popover-close"
                    onClick={() => setShowScorePopover(false)}
                    aria-label="Close"
                  >
                    Close
                  </button>
                </div>
                <p className="upi-popover-text">
                  Risk score: how strong the warning signs in this text are. Confidence: how reliable this reading is, based on how clear and long the text was, how many separate signs agreed, and which lookups ran. A high risk score with medium confidence still means: be careful and confirm through the official app or website.
                </p>
                {cleanedConfidenceFactors.length > 0 && (
                  <div className="upi-popover-factors-wrap">
                    <div className="upi-popover-factors-title">Confidence factors:</div>
                    <ul className="upi-popover-factors-list">
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

      {/* Headline */}
      <div className="upi-headline-block">
        <h2 className="upi-headline-text">
          {headline}
        </h2>
        {level.toLowerCase() === 'high' && (confidenceBandStr === 'Low' || confidenceBandStr === 'Medium') && (
          <p className="upi-confidence-warning-line">
            The warning signs are strong, but this reading may be incomplete. Treat it as a warning and confirm through the official channel.
          </p>
        )}
        {level === 'low' && (
          <p className="upi-honest-note">
            We found no warning signs in this text. That does not prove it is safe.
          </p>
        )}
        {(scamType === 'fake_payment_proof' || (level === 'unable' && scamType === 'unverifiable_receipt')) && (
          <div className="upi-bank-advisory">
            <AlertOctagon size={16} strokeWidth={2} />
            <span>Check your own bank or UPI app for the credit. Screenshots and UTR numbers alone cannot prove payment.</span>
          </div>
        )}
      </div>

      {/* 3-line Quick Guidance */}
      {topThreeActions.length > 0 && (
        <div className="upi-quick-guidance">
          <div className="upi-guidance-title">What to do now</div>
          <ol className="upi-guidance-list">
            {topThreeActions.map((act, i) => (
              <li key={i}>{act}</li>
            ))}
          </ol>
        </div>
      )}

      {isUnable && !isPrinting && (
        <div className="upi-unable-action-row">
          <button type="button" className="upi-btn-retry" onClick={onReset}>
            Try again with more context
          </button>
        </div>
      )}
    </div>
  );

  // --------------------------------------------------------------------------
  // SUB-BLOCK: WHY PANEL
  // --------------------------------------------------------------------------
  const renderWhyPanel = () => (
    <div className="upi-tab-panel upi-why-panel">
      <div className="upi-checked-text-card">
        <div className="upi-card-subhead">Analyzed Input & Highlighted Signals</div>
        <div className="upi-highlight-scrollbox">
          {highlighted?.nodes}
        </div>

        {highlighted?.legend && highlighted.legend.length > 0 && (
          <div className="upi-legend-container">
            <div className="upi-legend-title">Flagged Passages</div>
            <ul className="upi-legend-list">
              {highlighted.legend.map((item, idx) => (
                <li key={idx} className="upi-legend-item">
                  <span className="upi-legend-badge">[{item.num}]</span>
                  <span className="upi-legend-quote">"{item.quote}"</span>
                  <span className="upi-legend-reason">— {item.interpretation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Extracted Items ("What we found in this text") */}
      {hasExtractedItems && (
        <div className="upi-extracted-items-section">
          <div className="upi-extracted-title">What we found in this text</div>
          <div className="upi-extracted-chips-row">
            {upiIds.map((u, i) => (
              <span key={`upi-${i}`} className="upi-found-chip">UPI: {u}</span>
            ))}
            {amounts.map((a, i) => (
              <span key={`amt-${i}`} className="upi-found-chip">Amount: {a}</span>
            ))}
            {links.map((l, i) => (
              <span key={`lnk-${i}`} className="upi-found-chip">Link: {l}</span>
            ))}
            {phones.map((p, i) => (
              <span key={`ph-${i}`} className="upi-found-chip">Phone: {p}</span>
            ))}
            {emails.map((e, i) => (
              <span key={`em-${i}`} className="upi-found-chip">Email: {e}</span>
            ))}
          </div>
        </div>
      )}

      {/* Neutral handle info */}
      {handleInfo.length > 0 && (
        <div className="upi-handle-info-section">
          <div className="upi-handle-info-title">UPI Handle Information</div>
          <ul className="upi-handle-info-list">
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

      {/* UPI Safety Box */}
      {result.showUpiSafetyNote && (
        <div className="upi-safety-box" role="alert">
          <AlertTriangle size={18} strokeWidth={2} />
          <div>
            <strong>Important UPI Safety Rule:</strong> A UPI PIN is only needed to send money, never to receive it.
            Scanning a QR code or approving a collect request sends funds out of your account.
          </div>
        </div>
      )}

      {/* 6. "How this verdict was reached" */}
      <div className="upi-verdict-methodology">
        <div className="upi-methodology-title">How this verdict was reached</div>
        {sourcesLine && (
          <p className="upi-methodology-desc">{sourcesLine}</p>
        )}

        {/* Score breakdown disclosure */}
        {sortedBreakdown.length > 0 && (
          <div className="upi-breakdown-disclosure">
            <button
              type="button"
              className="upi-breakdown-toggle-btn"
              onClick={() => setBreakdownOpen(!breakdownOpen)}
              aria-expanded={isBreakdownExpanded}
            >
              <span className="upi-breakdown-toggle-title">How the score was reached</span>
              <ChevronDown
                size={16}
                className={`upi-breakdown-chevron ${isBreakdownExpanded ? 'is-rotated' : ''}`}
              />
            </button>

            {isBreakdownExpanded && (
              <div className="upi-breakdown-content">
                {visibleBreakdown.map((sb, i) => {
                  const pts = Number(sb.points) || 0;
                  const ptsBadge = pts > 0 ? `+${pts}` : `${pts}`;
                  return (
                    <div key={i} className="upi-breakdown-row">
                      <span className="upi-breakdown-badge">{ptsBadge}</span>
                      <span className="upi-breakdown-text">{sb.description || sb.quote || sb.title || 'Risk signal'}</span>
                    </div>
                  );
                })}

                {!isPrinting && !showAllBreakdown && sortedBreakdown.length > 5 && (
                  <button
                    type="button"
                    className="upi-btn-show-all-breakdown"
                    onClick={() => setShowAllBreakdown(true)}
                  >
                    Show all ({sortedBreakdown.length})
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Confidence factors */}
        {cleanedConfidenceFactors.length > 0 && (
          <ul className="upi-methodology-factors">
            {cleanedConfidenceFactors.map((f, idx) => (
              <li key={idx} className="upi-confidence-factor-item">
                {f.type === 'minus' ? (
                  <Minus size={14} strokeWidth={2.5} className="upi-factor-icon-minus" />
                ) : (
                  <Check size={14} strokeWidth={2.5} className="upi-factor-icon-check" />
                )}
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        )}

        {result.conversationSummary && (
          <div className="upi-explanation-card" style={{ marginTop: '12px' }}>
            <div className="upi-card-subhead">Conversation Context</div>
            <p>{result.conversationSummary}</p>
          </div>
        )}

        {result.explanation && (
          <div className="upi-explanation-card" style={{ marginTop: '12px' }}>
            <div className="upi-card-subhead">Detailed Analysis</div>
            <p>{result.explanation}</p>
          </div>
        )}
      </div>

      {/* 7. UPI ID disclaimer (only when UPI IDs were found or showUpiSafetyNote is true) */}
      {showUpiDisclaimer && (
        <div className="upi-upi-id-disclaimer">
          We cannot confirm that a UPI ID is real or whose it is. Check the name your UPI app shows before you pay.
        </div>
      )}
    </div>
  );

  // --------------------------------------------------------------------------
  // SUB-BLOCK: CHECKS PANEL
  // --------------------------------------------------------------------------
  const renderChecksPanel = () => (
    <div className="upi-tab-panel">
      {applicableChecks.length > 0 && (
        <div className="upi-checks-grid">
          {applicableChecks.map((c, idx) => {
            const stateClass =
              c.state === 'flag'
                ? 'upi-check-flag'
                : c.state === 'warning'
                ? 'upi-check-warning'
                : c.state === 'pass'
                ? 'upi-check-pass'
                : 'upi-check-na';

            return (
              <div key={idx} className={`upi-check-box ${stateClass}`}>
                <div className="upi-check-box-header">
                  <span className="upi-check-name">{c.title || c.key}</span>
                  <span className="upi-check-state-badge">{c.state}</span>
                </div>
                <p className="upi-check-summary">{c.summary || 'Completed.'}</p>
              </div>
            );
          })}
        </div>
      )}

      {notApplicableChecks.length > 0 && (
        <div className="upi-checks-na-line">
          Not checked for this input: {notApplicableChecks.map((c) => c.title || c.key).join(', ')}
        </div>
      )}
    </div>
  );

  // --------------------------------------------------------------------------
  // SUB-BLOCK: WHAT TO DO PANEL
  // --------------------------------------------------------------------------
  const renderActionsPanel = (useDeduped = false) => {
    const listToRender = useDeduped ? dedupedActions : whatToDoList;
    return (
      <div className="upi-tab-panel">
        <div className="upi-actions-card">
          <div className="upi-card-subhead">Recommended Actions</div>
          <ul className="upi-actions-full-list">
            {listToRender.map((actionText, idx) => {
              const hasPortal = actionText.includes('cybercrime.gov.in');
              return (
                <li key={idx} className="upi-action-full-item">
                  <ChevronRight size={16} strokeWidth={2} className="upi-action-arrow" />
                  <span>
                    {hasPortal ? (
                      <>
                        {actionText.split('cybercrime.gov.in')[0]}
                        <a
                          href="https://cybercrime.gov.in"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="upi-portal-link"
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

          <div className="upi-helpline-box">
            <div className="upi-helpline-tag">National Cyber Crime Helpline</div>
            <div className="upi-helpline-number">Dial 1930</div>
            <p className="upi-helpline-desc">
              Call 1930 immediately to report financial fraud and freeze fraudulent transactions within the golden hour.
            </p>
          </div>
        </div>
      </div>
    );
  };

  // --------------------------------------------------------------------------
  // SUB-BLOCK: PROOF PANEL (With buttons on screen, without in print)
  // --------------------------------------------------------------------------
  const renderProofPanel = (forPrint = false) => (
    <div className="upi-tab-panel">
      <div className="upi-proof-card">
        <div className="upi-card-subhead">Cryptographic Audit Trail</div>
        <p className="upi-proof-intro">
          Every check is anchored to a SHA-256 tamper-evident ledger block to prove results were never altered.
        </p>

        <div className="upi-proof-fields-grid">
          <div className="upi-proof-cell">
            <label>Proof ID</label>
            <div className="upi-proof-val">{proofId || '—'}</div>
          </div>

          <div className="upi-proof-cell">
            <label>Block number</label>
            <div className="upi-proof-val">{blockIndex != null ? blockIndex : '—'}</div>
          </div>

          {!forPrint && (
            <div className="upi-proof-cell upi-proof-cell-full">
              <label>Access Code</label>
              <div className="upi-access-code-row">
                {revealedCode ? (
                  <>
                    <span className="upi-access-code-text">{accessCode || '—'}</span>
                    <button
                      type="button"
                      className="upi-btn-copy-code"
                      onClick={handleCopyAccess}
                      title="Copy Access Code"
                    >
                      {copiedAccess ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedAccess ? 'Copied' : 'Copy'}</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="upi-btn-reveal"
                    onClick={() => setRevealedCode(true)}
                  >
                    <Eye size={14} strokeWidth={1.75} />
                    <span>Reveal Access Code</span>
                  </button>
                )}
              </div>
              <div className="upi-proof-tip">
                Keep this code private. It is kept only in page memory and proves record ownership.
              </div>
            </div>
          )}

          {blockHash && (
            <div className="upi-proof-cell upi-proof-cell-full">
              <label>Block hash</label>
              <div className="upi-proof-hash" title={blockHash}>{blockHash}</div>
            </div>
          )}
        </div>

        {isSaved && (
          <div className="upi-saved-history-badge">
            <FileCheck2 size={15} strokeWidth={2} />
            <span>Saved to your history in the dashboard</span>
          </div>
        )}

        {/* Action buttons and optional screenshot checkbox ONLY on screen */}
        {!forPrint && (
          <>
            {screenshotDataUrl && (
              <div className="upi-screenshot-option-row">
                <label className="upi-screenshot-checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeScreenshot}
                    onChange={(e) => setIncludeScreenshot(e.target.checked)}
                  />
                  <span>Include my screenshot in the PDF</span>
                </label>
                <div className="upi-screenshot-checkbox-hint">
                  Screenshots may show other people's names and numbers.
                </div>
              </div>
            )}

            <div className="upi-proof-button-row">
              {proofId && (
                <Link
                  to={`/verify?proof=${encodeURIComponent(proofId)}&code=${encodeURIComponent(accessCode || '')}`}
                  className="upi-btn-action"
                >
                  <ExternalLink size={14} strokeWidth={1.75} />
                  <span>Verify this proof</span>
                </Link>
              )}

              <button
                type="button"
                className="upi-btn-action"
                onClick={handleDownloadReceipt}
                disabled={!receipt}
              >
                <Download size={14} strokeWidth={1.75} />
                <span>Download verification file (.json)</span>
              </button>

              <button
                type="button"
                className="upi-btn-action"
                onClick={handlePrintPdf}
              >
                <Printer size={14} strokeWidth={1.75} />
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                className="upi-btn-action"
                onClick={handleCopySummary}
              >
                {copiedSummary ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedSummary ? 'Summary copied' : 'Copy summary'}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // CONDITIONAL RENDER: PRINTING CONTINUOUS DOCUMENT vs NORMAL TABBED VIEW
  // --------------------------------------------------------------------------
  if (!result) return null;

  if (isPrinting) {
    return (
      <div className="upi-result-card upi-result-card-printing" role="region" aria-label="UPI Check Result">
        {/* Runtime style tag to set @page margin without breaking LightningCSS minifier */}
        <style>{'@page { size: A4; margin: 0; }'}</style>

        {/* 1. Summary Block */}
        {renderSummaryBlock()}

        {/* Optional Screenshot directly under summary block */}
        {includeScreenshot && screenshotDataUrl && (
          <div className="upi-print-screenshot-block">
            <img
              src={screenshotDataUrl}
              alt="Screenshot provided by the user"
              className="upi-print-screenshot-img"
            />
            <p className="upi-print-screenshot-caption">Screenshot provided by the user</p>
          </div>
        )}

        {/* 2. Section "Why" */}
        <div className="upi-print-section-heading">Why</div>
        {renderWhyPanel()}

        {/* 3. Section "Checks" */}
        <div className="upi-print-section-heading">Checks ({applicableChecks.length})</div>
        {renderChecksPanel()}

        {/* 4. Section "What to do" (Exact duplicates removed) */}
        <div className="upi-print-section-heading">What to do</div>
        {renderActionsPanel(true)}

        {/* 5. Section "Proof" (Without Access Code or action buttons) */}
        <div className="upi-print-section-heading">Proof</div>
        {renderProofPanel(true)}

        {/* Final disclaimer */}
        <div className="upi-legal-footer">
          Screening aid, not a legal finding.
        </div>
      </div>
    );
  }

  // Normal on-screen tabbed view
  return (
    <div className="upi-result-card" role="region" aria-label="UPI Check Result">
      {/* 1. TOP SUMMARY CARD */}
      {renderSummaryBlock()}

      {/* 2. TABBED DEEP DIVE */}
      <div className="upi-tabs-wrapper">
        <div className="upi-tab-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'why'}
            className={`upi-tab-btn ${activeTab === 'why' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('why')}
          >
            Why
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'checks'}
            className={`upi-tab-btn ${activeTab === 'checks' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('checks')}
          >
            Checks ({applicableChecks.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'actions'}
            className={`upi-tab-btn ${activeTab === 'actions' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('actions')}
          >
            What to do
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'proof'}
            className={`upi-tab-btn ${activeTab === 'proof' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('proof')}
          >
            Proof
          </button>
        </div>

        <div className="upi-tab-content">
          {activeTab === 'why' && renderWhyPanel()}
          {activeTab === 'checks' && renderChecksPanel()}
          {activeTab === 'actions' && renderActionsPanel(false)}
          {activeTab === 'proof' && renderProofPanel(false)}
        </div>
      </div>

      {/* Single disclaimer under the result card for all tabs */}
      <div className="upi-legal-footer">
        Screening aid, not a legal finding.
      </div>
    </div>
  );
}
