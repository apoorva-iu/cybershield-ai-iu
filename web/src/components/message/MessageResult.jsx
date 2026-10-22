import React, { useState, useEffect, useMemo } from 'react';
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
import { MessageGauge } from './MessageGauge';

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
      parts.push('AI message analysis');
    }
    if (evidenceSources.linkLookups > 0 || evidenceSources.linkReputation) {
      parts.push('link reputation lookups');
    }
    for (const [key, val] of Object.entries(evidenceSources)) {
      if (['aiPasses', 'aiReading', 'linkLookups', 'linkReputation'].includes(key)) continue;
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

    // Strip numbers, decimals, percentages, etc.
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
    routine_chat: 'Routine communication'
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
          interpretation: item.interpretation || item.reason || item.why || ''
        });
      }
    }
  });

  if (validQuotes.length === 0) {
    return {
      nodes: <span className="msg-raw-text">{text}</span>,
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
      <mark key={`mark-${i}`} className="msg-highlight-quote">
        <span className="msg-quote-text">{text.slice(q.start, q.end)}</span>
        <sup className="msg-quote-badge">[{q.num}]</sup>
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

export function MessageResult({
  result,
  rawInput = '',
  onReset,
  imageCanvases = []
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
  const score = res.score ?? res.riskScore;
  const isUnable = level === 'unable' || res.mode === 'ai_unavailable' || res.reason === 'ai_unavailable';
  const scamType = res.scamType;

  // Headline handling (can be array [title, sentence] or single string)
  let headlineTitle = '';
  let headlineSentence = '';
  if (Array.isArray(res.headline) && res.headline.length > 0) {
    headlineTitle = res.headline[0] || '';
    headlineSentence = res.headline[1] || '';
  } else if (typeof res.headline === 'string' && res.headline.trim()) {
    headlineTitle = res.headline.trim();
  } else {
    headlineTitle = res.primaryConcern || 'Message check complete.';
  }

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
  if (Array.isArray(res.evidenceSources)) {
    for (const s of res.evidenceSources) {
      if (s && typeof s === 'object') {
        sourcesList.push({
          name: s.name,
          state: s.status === 'ran' ? 'ran' : 'skipped',
          note: s.note
        });
      }
    }
  } else if (res.evidenceSources && typeof res.evidenceSources === 'object') {
    if (typeof res.evidenceSources.aiPasses === 'number') {
      sourcesList.push({ name: 'Dual-pass AI analysis', state: res.evidenceSources.aiPasses > 0 ? 'ran' : 'skipped' });
    }
    if (typeof res.evidenceSources.linkLookups === 'number') {
      sourcesList.push({ name: 'External link threat intelligence', state: res.evidenceSources.linkLookups > 0 ? 'ran' : 'skipped' });
    }
  }

  if (sourcesList.length === 0) {
    sourcesList.push({ name: 'Dual-pass AI analysis', state: 'ran' });
    sourcesList.push({ name: 'Deterministic message parser', state: 'ran' });
  }

  const sourcesRanCount = res.evidenceSourceCount ?? sourcesList.filter(s => s.state === 'ran').length;

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
  const links = extracted.links || [];
  const phones = extracted.phones || [];
  const emails = extracted.emails || [];
  const upiIds = extracted.upiIds || [];
  const amounts = extracted.amounts || [];

  const hasExtractedItems =
    links.length > 0 || phones.length > 0 || emails.length > 0 || upiIds.length > 0 || amounts.length > 0;

  // Scam signals chip status from API
  const scamSignalsStatus = res.scamSignals?.status || (level === 'high' ? 'strong' : level === 'medium' ? 'some' : 'none_found');
  const scamSignalsChipText =
    scamSignalsStatus === 'strong'
      ? 'Strong scam signs found'
      : scamSignalsStatus === 'some'
      ? 'Some scam signs found'
      : 'No scam signs found';

  // Sender notice from API
  const senderNote = res.senderNote || 'Anyone can fake the sender name or phone number shown on a message. Always verify through an official channel before acting.';

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
    : Array.isArray(res.signals)
    ? res.signals.map(s => ({ quote: s.quote || s.label, interpretation: s.why }))
    : Array.isArray(res.flaggedPhrases)
    ? res.flaggedPhrases
    : [];
  const highlighted = highlightCheckedText(rawInput, evidenceItems);

  // First image canvas for screenshot printing
  const primaryCanvas = Array.isArray(imageCanvases) ? imageCanvases[0] : imageCanvases;
  const screenshotDataUrl = useMemo(() => {
    if (!primaryCanvas) return null;
    try {
      return primaryCanvas.toDataURL ? primaryCanvas.toDataURL('image/png') : null;
    } catch (e) {
      return null;
    }
  }, [primaryCanvas]);

  // Handlers
  const handleCopyAccess = () => {
    if (!accessCode) return;
    navigator.clipboard?.writeText?.(accessCode);
    setCopiedAccess(true);
    setTimeout(() => setCopiedAccess(false), 2000);
  };

  const handleCopySummary = () => {
    const lines = [
      `Cyber Shield Message Scanner Result`,
      `Level: ${level.toUpperCase()}`,
      score != null ? `Score: ${score}/100` : null,
      confidenceBandStr ? `Confidence: ${confidenceBandStr}` : null,
      `Finding: ${headlineTitle}`,
      headlineSentence ? `Details: ${headlineSentence}` : null,
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
      a.download = (proofId || 'message-proof') + '.json';
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
      document.body.classList.add('msg-printing');
      setIsPrinting(true);
    };
    const onAfterPrint = () => {
      document.body.classList.remove('msg-printing');
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
    const targetTitle = proofId ? `CyberShield-Message-${proofId}` : 'CyberShield-Message-Report';
    document.title = targetTitle;
    document.body.classList.add('msg-printing');

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      document.title = origTitle;
      document.body.classList.remove('msg-printing');
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
      ? 'msg-level-high'
      : level === 'medium'
      ? 'msg-level-medium'
      : level === 'low'
      ? 'msg-level-low'
      : 'msg-level-unable';

  // --------------------------------------------------------------------------
  // SUB-BLOCK: SUMMARY CARD (Rendered on screen and in print)
  // --------------------------------------------------------------------------
  const renderSummaryBlock = () => (
    <div className="msg-result-top">
      <div className="msg-result-header">
        <div className="msg-result-chips">
          <span className={`msg-chip ${levelPillClass}`}>
            {level === 'high' && <ShieldAlert size={14} strokeWidth={2} />}
            {level === 'medium' && <AlertTriangle size={14} strokeWidth={2} />}
            {level === 'low' && <ShieldCheck size={14} strokeWidth={2} />}
            {level === 'unable' && <HelpCircle size={14} strokeWidth={2} />}
            <span>{levelTitle}</span>
          </span>

          <span className={`msg-chip ${levelPillClass}`}>
            <span>{scamSignalsChipText}</span>
          </span>

          {formatScamType(scamType) && (
            <span className="msg-chip msg-chip-type">
              {formatScamType(scamType)}
            </span>
          )}

          {confidenceBandStr && (
            <span className="msg-chip msg-chip-confidence">
              <span>Confidence: {confidenceBandStr}</span>
            </span>
          )}

          {sourcesRanCount > 0 && (
            <div className="msg-popover-anchor">
              <button
                type="button"
                className="msg-chip msg-chip-interactive"
                onClick={() => setShowSourcesPopover(!showSourcesPopover)}
                aria-expanded={showSourcesPopover}
                aria-label={`${sourcesRanCount} evidence sources. Click to view.`}
              >
                <span>{sourcesRanCount} source{sourcesRanCount !== 1 ? 's' : ''}</span>
                <Layers size={12} strokeWidth={2} />
              </button>
              {showSourcesPopover && (
                <div className="msg-popover-bubble" role="tooltip">
                  <div className="msg-popover-title">Evidence Sources Evaluated</div>
                  <ul className="msg-sources-list">
                    {sourcesList.map((s, idx) => (
                      <li key={idx} className={`msg-source-item msg-source-${s.state}`}>
                        <span className="msg-source-dot" />
                        <span>{s.name} ({s.state})</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="msg-popover-close"
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
        <div className="msg-result-gauge-slot">
          <div className="msg-gauge-popover-anchor" ref={scorePopoverRef}>
            <MessageGauge
              level={level}
              score={score}
              isPrinting={isPrinting}
              onToggleInfo={() => setShowScorePopover((prev) => !prev)}
              showInfo={showScorePopover}
            />
            {showScorePopover && (
              <div className="msg-popover-bubble msg-score-popover-bubble" role="tooltip">
                <div className="msg-popover-header">
                  <div className="msg-popover-title">What do these mean?</div>
                  <button
                    type="button"
                    className="msg-popover-close"
                    onClick={() => setShowScorePopover(false)}
                    aria-label="Close"
                  >
                    Close
                  </button>
                </div>
                <p className="msg-popover-text">
                  Risk score: how strong the warning signs in this text are. Confidence: how reliable this reading is, based on how clear and long the text was, how many separate signs agreed, and which lookups ran. A high risk score with medium confidence still means: be careful and confirm through the official app or website.
                </p>
                {cleanedConfidenceFactors.length > 0 && (
                  <div className="msg-popover-factors-wrap">
                    <div className="msg-popover-factors-title">Confidence factors:</div>
                    <ul className="msg-popover-factors-list">
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
      <div className="msg-headline-block">
        <h2 className="msg-headline-text">
          {headlineTitle}
        </h2>
        {level.toLowerCase() === 'high' && (confidenceBandStr === 'Low' || confidenceBandStr === 'Medium') && (
          <p className="msg-confidence-warning-line">
            The warning signs are strong, but this reading may be incomplete. Treat it as a warning and confirm through the official channel.
          </p>
        )}
        {headlineSentence && (
          <p className="msg-headline-secondary">
            {headlineSentence}
          </p>
        )}
        {level === 'low' && (
          <p className="msg-honest-note">
            We found no warning signs in this message. That does not guarantee it is benign. Always confirm unusual requests directly with the sender.
          </p>
        )}
        {senderNote && (
          <div className="msg-sender-advisory">
            <AlertOctagon size={16} strokeWidth={2} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{senderNote}</span>
          </div>
        )}
      </div>

      {/* 3-line Quick Guidance */}
      {topThreeActions.length > 0 && (
        <div className="msg-quick-guidance">
          <div className="msg-guidance-title">What to do now</div>
          <ol className="msg-guidance-list">
            {topThreeActions.map((act, i) => (
              <li key={i}>{act}</li>
            ))}
          </ol>
        </div>
      )}

      {isUnable && !isPrinting && (
        <div className="msg-unable-action-row">
          <button type="button" className="msg-btn-retry" onClick={onReset}>
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
    <div className="msg-tab-panel msg-why-panel">
      <div className="msg-checked-text-card">
        <div className="msg-card-subhead">Analyzed Input & Highlighted Signals</div>
        <div className="msg-highlight-scrollbox">
          {highlighted?.nodes}
        </div>

        {highlighted?.legend && highlighted.legend.length > 0 && (
          <div className="msg-legend-container">
            <div className="msg-legend-title">Flagged Passages</div>
            <ul className="msg-legend-list">
              {highlighted.legend.map((item, idx) => (
                <li key={idx} className="msg-legend-item">
                  <span className="msg-legend-badge">[{item.num}]</span>
                  <span className="msg-legend-quote">"{item.quote}"</span>
                  <span className="msg-legend-reason">— {item.interpretation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Extracted Items */}
      {hasExtractedItems && (
        <div className="msg-extracted-items-section">
          <div className="msg-extracted-title">What we found in this text</div>
          <div className="msg-extracted-chips-row">
            {links.map((l, i) => (
              <span key={`lnk-${i}`} className="msg-found-chip">Link: {l}</span>
            ))}
            {phones.map((p, i) => (
              <span key={`ph-${i}`} className="msg-found-chip">Phone: {p}</span>
            ))}
            {emails.map((e, i) => (
              <span key={`em-${i}`} className="msg-found-chip">Email: {e}</span>
            ))}
            {upiIds.map((u, i) => (
              <span key={`upi-${i}`} className="msg-found-chip">UPI: {u}</span>
            ))}
            {amounts.map((a, i) => (
              <span key={`amt-${i}`} className="msg-found-chip">Amount: {a}</span>
            ))}
          </div>
        </div>
      )}

      {/* Methodology & Score Breakdown */}
      <div className="msg-verdict-methodology">
        <div className="msg-methodology-title">How this verdict was reached</div>
        {sourcesLine && (
          <p className="msg-methodology-desc">{sourcesLine}</p>
        )}

        {sortedBreakdown.length > 0 && (
          <div className="msg-breakdown-disclosure">
            <button
              type="button"
              className="msg-breakdown-toggle-btn"
              onClick={() => setBreakdownOpen(!breakdownOpen)}
              aria-expanded={isBreakdownExpanded}
            >
              <span className="msg-breakdown-toggle-title">How the score was reached</span>
              <ChevronDown
                size={16}
                className={`msg-breakdown-chevron ${isBreakdownExpanded ? 'is-rotated' : ''}`}
              />
            </button>

            {isBreakdownExpanded && (
              <div className="msg-breakdown-content">
                {visibleBreakdown.map((sb, i) => {
                  const pts = Number(sb.points) || 0;
                  const ptsBadge = pts > 0 ? `+${pts}` : `${pts}`;
                  return (
                    <div key={i} className="msg-breakdown-row">
                      <span className="msg-breakdown-badge">{ptsBadge}</span>
                      <span className="msg-breakdown-text">{sb.description || sb.quote || sb.title || 'Risk signal'}</span>
                    </div>
                  );
                })}

                {!isPrinting && !showAllBreakdown && sortedBreakdown.length > 5 && (
                  <button
                    type="button"
                    className="msg-btn-show-all-breakdown"
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
          <ul className="msg-methodology-factors">
            {cleanedConfidenceFactors.map((f, idx) => (
              <li key={idx} className="msg-confidence-factor-item">
                {f.type === 'minus' ? (
                  <Minus size={14} strokeWidth={2.5} className="msg-factor-icon-minus" />
                ) : (
                  <Check size={14} strokeWidth={2.5} className="msg-factor-icon-check" />
                )}
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        )}

        {res.conversationSummary && (
          <div className="msg-explanation-card" style={{ marginTop: '12px' }}>
            <div className="msg-card-subhead">Conversation Context</div>
            <p>{res.conversationSummary}</p>
          </div>
        )}

        {res.explanation && (
          <div className="msg-explanation-card" style={{ marginTop: '12px' }}>
            <div className="msg-card-subhead">Detailed Analysis</div>
            <p>{res.explanation}</p>
          </div>
        )}
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // SUB-BLOCK: CHECKS PANEL
  // --------------------------------------------------------------------------
  const renderChecksPanel = () => (
    <div className="msg-tab-panel">
      {applicableChecks.length > 0 && (
        <div className="msg-checks-grid">
          {applicableChecks.map((c, idx) => {
            const stateClass =
              c.state === 'fail' || c.state === 'flag'
                ? 'msg-check-flag'
                : c.state === 'warn' || c.state === 'warning'
                ? 'msg-check-warning'
                : c.state === 'pass'
                ? 'msg-check-pass'
                : 'msg-check-na';

            return (
              <div key={idx} className={`msg-check-box ${stateClass}`}>
                <div className="msg-check-box-header">
                  <span className="msg-check-name">{c.title || c.key}</span>
                  <span className="msg-check-state-badge">{c.state}</span>
                </div>
                <p className="msg-check-summary">{c.reason || c.findings || c.summary || 'Completed.'}</p>
              </div>
            );
          })}
        </div>
      )}

      {notApplicableChecks.length > 0 && (
        <div className="msg-checks-na-line">
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
      <div className="msg-tab-panel">
        <div className="msg-actions-card">
          <div className="msg-card-subhead">Recommended Actions</div>
          <ul className="msg-actions-full-list">
            {listToRender.map((actionText, idx) => {
              const hasPortal = actionText.includes('cybercrime.gov.in');
              return (
                <li key={idx} className="msg-action-full-item">
                  <ChevronRight size={16} strokeWidth={2} className="msg-action-arrow" />
                  <span>
                    {hasPortal ? (
                      <>
                        {actionText.split('cybercrime.gov.in')[0]}
                        <a
                          href="https://cybercrime.gov.in"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="msg-portal-link"
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

          <div className="msg-helpline-box">
            <div className="msg-helpline-tag">National Cyber Crime Helpline</div>
            <div className="msg-helpline-number">Dial 1930</div>
            <p className="msg-helpline-desc">
              Call 1930 immediately to report financial fraud, suspicious communications, and freeze unauthorized transactions.
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
    <div className="msg-tab-panel">
      <div className="msg-proof-card">
        <div className="msg-card-subhead">Cryptographic Audit Trail</div>
        <p className="msg-proof-intro">
          Every check is anchored to a SHA-256 tamper-evident ledger block to prove results were never altered.
        </p>

        <div className="msg-proof-fields-grid">
          <div className="msg-proof-cell">
            <label>Proof ID</label>
            <div className="msg-proof-val">{proofId || '—'}</div>
          </div>

          <div className="msg-proof-cell">
            <label>Block number</label>
            <div className="msg-proof-val">{blockIndex != null ? blockIndex : '—'}</div>
          </div>

          {!forPrint && (
            <div className="msg-proof-cell msg-proof-cell-full">
              <label>Access Code</label>
              <div className="msg-access-code-row">
                {revealedCode ? (
                  <>
                    <span className="msg-access-code-text">{accessCode || '—'}</span>
                    <button
                      type="button"
                      className="msg-btn-copy-code"
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
                    className="msg-btn-reveal"
                    onClick={() => setRevealedCode(true)}
                  >
                    <Eye size={14} strokeWidth={1.75} />
                    <span>Reveal Access Code</span>
                  </button>
                )}
              </div>
              <div className="msg-proof-tip">
                Keep this code private. It is kept only in page memory and proves record ownership.
              </div>
            </div>
          )}

          {blockHash && (
            <div className="msg-proof-cell msg-proof-cell-full">
              <label>Block hash</label>
              <div className="msg-proof-hash" title={blockHash}>{blockHash}</div>
            </div>
          )}
        </div>

        {isSaved && (
          <div className="msg-saved-history-badge">
            <FileCheck2 size={15} strokeWidth={2} />
            <span>Saved to your history in the dashboard</span>
          </div>
        )}

        {/* Action buttons and optional screenshot checkbox ONLY on screen */}
        {!forPrint && (
          <>
            {screenshotDataUrl && (
              <div className="msg-screenshot-option-row">
                <label className="msg-screenshot-checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeScreenshot}
                    onChange={(e) => setIncludeScreenshot(e.target.checked)}
                  />
                  <span>Include my screenshot in the PDF</span>
                </label>
                <div className="msg-screenshot-checkbox-hint">
                  Screenshots may show other people's names, numbers or messages.
                </div>
              </div>
            )}

            <div className="msg-proof-button-row">
              {proofId && (
                <Link
                  to={`/verify?proof=${encodeURIComponent(proofId)}&code=${encodeURIComponent(accessCode || '')}`}
                  className="msg-btn-action"
                >
                  <ExternalLink size={14} strokeWidth={1.75} />
                  <span>Verify this proof</span>
                </Link>
              )}

              <button
                type="button"
                className="msg-btn-action"
                onClick={handleDownloadReceipt}
                disabled={!receipt}
              >
                <Download size={14} strokeWidth={1.75} />
                <span>Download verification file (.json)</span>
              </button>

              <button
                type="button"
                className="msg-btn-action"
                onClick={handlePrintPdf}
              >
                <Printer size={14} strokeWidth={1.75} />
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                className="msg-btn-action"
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
      <div className="msg-result-card msg-result-card-printing" role="region" aria-label="Message Check Result">
        {/* Runtime style tag to set @page margin without breaking LightningCSS minifier */}
        <style>{'@page { size: A4; margin: 0; }'}</style>

        {/* 1. Summary Block */}
        {renderSummaryBlock()}

        {/* Optional Screenshot directly under summary block */}
        {includeScreenshot && screenshotDataUrl && (
          <div className="msg-print-screenshot-block">
            <img
              src={screenshotDataUrl}
              alt="Screenshot provided by the user"
              className="msg-print-screenshot-img"
            />
            <p className="msg-print-screenshot-caption">Screenshot provided by the user</p>
          </div>
        )}

        {/* 2. Section "Why" */}
        <div className="msg-print-section-heading">Why</div>
        {renderWhyPanel()}

        {/* 3. Section "Checks" */}
        <div className="msg-print-section-heading">Checks ({applicableChecks.length})</div>
        {renderChecksPanel()}

        {/* 4. Section "What to do" (Exact duplicates removed) */}
        <div className="msg-print-section-heading">What to do</div>
        {renderActionsPanel(true)}

        {/* 5. Section "Proof" (Without Access Code or action buttons) */}
        <div className="msg-print-section-heading">Proof</div>
        {renderProofPanel(true)}

        {/* Final disclaimer */}
        <div className="msg-legal-footer">
          Screening aid, not a legal finding.
        </div>
      </div>
    );
  }

  // Normal on-screen tabbed view
  return (
    <div className="msg-result-card" role="region" aria-label="Message Check Result">
      {/* 1. TOP SUMMARY CARD */}
      {renderSummaryBlock()}

      {/* 2. TABBED DEEP DIVE */}
      <div className="msg-tabs-wrapper">
        <div className="msg-tab-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'why'}
            className={`msg-tab-btn ${activeTab === 'why' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('why')}
          >
            Why
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'checks'}
            className={`msg-tab-btn ${activeTab === 'checks' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('checks')}
          >
            Checks ({applicableChecks.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'actions'}
            className={`msg-tab-btn ${activeTab === 'actions' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('actions')}
          >
            What to do
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'proof'}
            className={`msg-tab-btn ${activeTab === 'proof' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('proof')}
          >
            Proof
          </button>
        </div>

        <div className="msg-tab-content">
          {activeTab === 'why' && renderWhyPanel()}
          {activeTab === 'checks' && renderChecksPanel()}
          {activeTab === 'actions' && renderActionsPanel(false)}
          {activeTab === 'proof' && renderProofPanel(false)}
        </div>
      </div>

      {/* Single disclaimer under the result card for all tabs */}
      <div className="msg-legal-footer">
        Screening aid, not a legal finding.
      </div>
    </div>
  );
}

export default MessageResult;

