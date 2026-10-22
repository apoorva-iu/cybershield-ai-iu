import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';
import { Play, Pause, AlertTriangle, CheckCircle2, ShieldCheck, Lock, Hash, FileCheck2, RefreshCw } from 'lucide-react';
import { RiskGauge } from './RiskGauge';

const SCENARIO_DURATION = 14000; // ~14 seconds per scenario cycle

const SCENARIOS = {
  job: {
    id: 'job',
    tabLabel: 'Job offer',
    typeBadge: 'Example job offer',
    steps: [
      { id: 0, title: 'Offer details provided', caption: 'Job description, candidate URL and recruiter email entered' },
      { id: 1, title: 'Extracting key signals', caption: 'Candidate link and recruiter address identified' },
      { id: 2, title: 'Parallel evidence checks', caption: 'RDAP age, threat feeds, Places, and AI text reading run together' },
      { id: 3, title: 'Verdict & flagged phrases', caption: 'Calculated risk rating with flagged phrase reasons' },
      { id: 4, title: 'Proof ID anchored', caption: 'Tamper-evident ledger record & one-time Access Code' }
    ],
    role: 'Operations Coordinator (Remote)',
    company: 'Nexora Global Operations',
    eyebrow: 'SUBMITTED OFFER DETAILS',
    text: 'URGENT: Operations Coordinator required immediately. $85/hr starting compensation. $250 registration fee required prior to home equipment dispatch. Interviews conducted exclusively via Telegram. Apply: http://nexora-global-careers.xyz/apply Contact: hr.nexoraglobal@gmail.com',
    detectedItems: [
      { label: 'Link', val: 'http://nexora-global-careers.xyz/apply' },
      { label: 'Email', val: 'hr.nexoraglobal@gmail.com' }
    ],
    checks: [
      { name: 'Job URL', status: 'bad', detail: 'Domain registered 3 days ago' },
      { name: 'Description', status: 'bad', detail: 'Advance-fee & urgent deposit flag' },
      { name: 'Company', status: 'warn', detail: 'Unverified business presence' },
      { name: 'Recruiter', status: 'warn', detail: 'Free consumer webmail (@gmail.com)' },
      { name: 'Security', status: 'ok', detail: '0 malware detections' }
    ],
    flags: [
      { text: '$250 registration fee required upfront', severity: 'bad' },
      { text: 'Interviews held exclusively via Telegram', severity: 'bad' },
      { text: 'Free webmail: hr.nexoraglobal@gmail.com', severity: 'warn' },
      { text: 'Unencrypted link: http://nexora-global-careers.xyz', severity: 'bad' }
    ],
    guidanceBox: 'What to do: Do not transfer money for equipment or registration fees. Legitimate corporate recruiters do not conduct interviews exclusively on Telegram or hire from personal webmail.',
    level: 'high',
    score: 78,
    verdictTitle: 'High risk',
    verdictSummary: 'Evidence suggests high risk of recruitment fraud',
    proofId: 'CS-8B3FA19D04',
    blockIdx: 24,
    canonicalHash: '4f1a9b3c7d6e820d5718a901ff2b6c19c892ed0f72a4',
    accessCode: '2EKR278DTD8P'
  },
  upi: {
    id: 'upi',
    tabLabel: 'UPI payment',
    typeBadge: 'Example UPI request',
    steps: [
      { id: 0, title: 'Payment request provided', caption: 'Payment message text or collect request screenshot uploaded' },
      { id: 1, title: 'Reading payment text', caption: 'Amounts, transaction note, and UPI handle extracted' },
      { id: 2, title: 'Parallel evidence checks', caption: 'Pay-to-receive checks & handle registry lookups run together' },
      { id: 3, title: 'Verdict & banking guidance', caption: 'Flagged passages with reasons and banking advisory' },
      { id: 4, title: 'Proof ID anchored', caption: 'Tamper-evident ledger record & one-time Access Code' }
    ],
    role: 'Refund collect request',
    company: 'support-refund88@fakeupi',
    eyebrow: 'PAYMENT SCREENSHOT / REQUEST',
    text: 'Approved cashback of Rs 2,500 pending. Open Google Pay, click Pay on the collect request from support-refund88@fakeupi and enter your UPI PIN to receive money in your bank account.',
    screenshotMeta: 'Screenshot • payment-request-sample.png (1080x1920)',
    chatSender: 'Payment Support',
    chatMessage: 'Approved cashback refund of Rs 2,500 pending. Open Google Pay, click Pay on collect request and enter UPI PIN to receive money.',
    detectedItems: [
      { label: 'UPI Handle', val: 'support-refund88@fakeupi' },
      { label: 'Amount', val: 'Rs 2,500' },
      { label: 'Request Type', val: 'Collect request' }
    ],
    checks: [
      { name: 'Pay to receive', status: 'bad', detail: 'Tells user to pay or enter PIN to receive money' },
      { name: 'Handle lookups', status: 'warn', detail: 'Handle not in recognized bank registry' },
      { name: 'Amount & urgency', status: 'bad', detail: 'Artificial urgency with pending cashback claim' },
      { name: 'AI text reading', status: 'bad', detail: 'Deceptive collect-request phrasing detected' },
      { name: 'Threat lists', status: 'ok', detail: '0 known malware associations' }
    ],
    flags: [
      { text: '[1] "enter your UPI PIN to receive money" — You only enter PIN to send funds, never to receive', severity: 'bad' },
      { text: '[2] "click Pay on the collect request" — Collect requests deduct funds from your account', severity: 'bad' }
    ],
    guidanceBox: 'What to do: Decline the collect request. You never need to enter your UPI PIN or approve a request to receive money. Dial 1930 if money was debited.',
    level: 'high',
    score: 84,
    verdictTitle: 'High risk',
    verdictSummary: 'Evidence suggests pay-to-receive fraud attempting to debit your account',
    proofId: 'CS-UPI-7D109E2B',
    blockIdx: 25,
    canonicalHash: '8b2c4e6a01df39274810acfe92847501bcae39401f82',
    accessCode: '7MQP924KLT1X'
  },
  message: {
    id: 'message',
    tabLabel: 'Message',
    typeBadge: 'Example message',
    steps: [
      { id: 0, title: 'Message text provided', caption: 'Delivery update or routine notification text entered' },
      { id: 1, title: 'Reading message details', caption: 'Sender context, reference number, and wording extracted' },
      { id: 2, title: 'Parallel evidence checks', caption: 'Threat feeds, domain checks, and AI language reading run together' },
      { id: 3, title: 'Verdict & honest baseline', caption: 'Objective evaluation: no warning signs detected' },
      { id: 4, title: 'Proof ID anchored', caption: 'Tamper-evident ledger record & one-time Access Code' }
    ],
    role: 'Campus delivery update',
    company: 'Campus Mail Services',
    eyebrow: 'MESSAGE TEXT / NOTICE',
    text: 'Package notification: Your book order #7192 has arrived at the central reception desk. Please collect it with your order number during regular desk hours (9 AM - 5 PM).',
    screenshotMeta: 'Text message • delivery-notice.txt',
    chatSender: 'Mail Room Desk',
    chatMessage: 'Package notification: Your book order #7192 has arrived at central reception desk. Please collect it with your order number during regular desk hours (9 AM - 5 PM).',
    detectedItems: [
      { label: 'Order #', val: '#7192' },
      { label: 'Location', val: 'Reception Desk' }
    ],
    checks: [
      { name: 'Link threat lookup', status: 'ok', detail: 'No external links or redirectors present' },
      { name: 'AI text reading', status: 'ok', detail: 'Neutral informative notification without pressure' },
      { name: 'Sender analysis', status: 'ok', detail: 'Standard internal notice pattern' },
      { name: 'Urgency patterns', status: 'ok', detail: 'No artificial deadlines or threats of cancellation' },
      { name: 'Threat feeds', status: 'ok', detail: '0 malicious detections across intelligence feeds' }
    ],
    flags: [
      { text: 'No payment requests, OTP solicitations, or external links detected', severity: 'ok' },
      { text: 'Routine notification language with no artificial urgency', severity: 'ok' }
    ],
    guidanceBox: 'No warning signs found. That does not prove it is safe. Always verify unexpected notifications with the sender through official channels before sharing details.',
    level: 'low',
    score: 12,
    verdictTitle: 'Low risk',
    verdictSummary: 'No warning signs found. That does not prove it is safe.',
    proofId: 'CS-MSG-5A8E192D',
    blockIdx: 26,
    canonicalHash: '9f241a0b742918df90b38472910fae8294716029dcba',
    accessCode: '3HNP819KZX4Y'
  }
};

const SCENARIO_KEYS = ['job', 'upi', 'message'];

export function DemoPlayer() {
  const [hasVideo, setHasVideo] = useState(false);
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('job');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'proof'

  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { amount: 0.2 });
  const animationFrameRef = useRef(null);
  const lastTimeRef = useRef(null);

  const scenarioData = SCENARIOS[selectedScenarioKey] || SCENARIOS.job;

  // Video fallback check for /demo.mp4
  useEffect(() => {
    fetch('/demo.mp4', { method: 'HEAD' })
      .then((res) => {
        const ct = res.headers.get('content-type') || '';
        if (res.ok && !ct.includes('text/html') && (ct.includes('video') || res.status === 200)) {
          setHasVideo(true);
        }
      })
      .catch(() => setHasVideo(false));
  }, []);

  // Detect prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mq.matches);
    const handler = (e) => setIsReducedMotion(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, []);

  // Detect document visibility
  useEffect(() => {
    const handleVis = () => setIsTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, []);

  // Control playback ticker
  useEffect(() => {
    if (isReducedMotion) {
      setIsPlaying(false);
      setElapsedTime(SCENARIO_DURATION);
      return;
    }
    if (isInView && isTabVisible && !userPaused) {
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [isInView, isTabVisible, userPaused, isReducedMotion]);

  // Main animation ticker with 14s loop per scenario, then advancing to the next scenario
  const tick = useCallback((timestamp) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    const delta = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    setElapsedTime((prev) => {
      const next = prev + delta;
      if (next >= SCENARIO_DURATION) {
        // Advance to next scenario seamlessly
        setSelectedScenarioKey((currentKey) => {
          const currentIndex = SCENARIO_KEYS.indexOf(currentKey);
          return SCENARIO_KEYS[(currentIndex + 1) % SCENARIO_KEYS.length];
        });
        return 0;
      }
      return next;
    });

    animationFrameRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(tick);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      lastTimeRef.current = null;
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, tick]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      setUserPaused(true);
      setIsPlaying(false);
    } else {
      setUserPaused(false);
      setIsPlaying(true);
    }
  };

  // Switching a chip restarts that scenario immediately
  const handleSelectScenario = (key) => {
    if (key === selectedScenarioKey) return;
    setSelectedScenarioKey(key);
    setElapsedTime(0);
  };

  const handleScenarioKeyDown = (e, currentKey) => {
    const currentIndex = SCENARIO_KEYS.indexOf(currentKey);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextKey = SCENARIO_KEYS[(currentIndex + 1) % SCENARIO_KEYS.length];
      handleSelectScenario(nextKey);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevKey = SCENARIO_KEYS[(currentIndex - 1 + SCENARIO_KEYS.length) % SCENARIO_KEYS.length];
      handleSelectScenario(prevKey);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setElapsedTime(pos * SCENARIO_DURATION);
  };

  // Exact scenario timeline (14 seconds):
  // 0 - 2000ms: Input appears (within 2s)
  // 2000 - 3500ms: Five checks show "Running" together (1.5 seconds)
  // 3500 - 5000ms: Verdict appears (by ~4s); gauge mounts and animates in <1s; highlights & what to do now visible
  // 5000 - 14000ms: Proof ID anchored, held with verdict and guidance until 14s, then advances to next scenario
  const isScanning = !isReducedMotion && elapsedTime >= 2000 && elapsedTime < 3500;
  const isVerdictReady = isReducedMotion || elapsedTime >= 3500;
  const isProofReady = isReducedMotion || elapsedTime >= 5000;

  const currentStepIdx = isReducedMotion
    ? 4
    : elapsedTime >= 5000
    ? 4
    : elapsedTime >= 3500
    ? 3
    : elapsedTime >= 2000
    ? 2
    : elapsedTime >= 1000
    ? 1
    : 0;

  const progressPercent = isReducedMotion ? 100 : (elapsedTime / SCENARIO_DURATION) * 100;

  // Video render fallback if /demo.mp4 exists
  if (hasVideo) {
    return (
      <div className="demo-player-container" ref={containerRef}>
        <div className="framer-demo-frame">
          <div className="demo-titlebar">
            <div className="window-dots" aria-hidden="true">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <div className="demo-title">Cyber Shield &mdash; Interactive Walkthrough</div>
            <span className="example-badge">Example</span>
          </div>
          <video
            src="/demo.mp4"
            muted
            playsInline
            controls
            poster="/demo-poster.png"
            style={{ width: '100%', display: 'block', borderRadius: '0 0 24px 24px' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="demo-player-container" ref={containerRef} id="demo-player">
      <div className="framer-demo-frame">
        {/* Frame Top Bar */}
        <div className="framer-frame-topbar">
          <div className="topbar-left">
            <div className="window-dots" aria-hidden="true">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <span className="example-tag-badge">Example</span>
          </div>

          {/* Scenario Switcher Tabs */}
          <div className="topbar-swap-chips" role="tablist" aria-label="Select demo scenario">
            {SCENARIO_KEYS.map((key) => {
              const sc = SCENARIOS[key];
              const isSelected = selectedScenarioKey === key;
              const isScam = sc.level === 'high';
              const activeClass = isSelected ? (isScam ? 'active active-scam' : 'active active-legit') : '';
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  className={`swap-chip-btn ${activeClass}`}
                  onClick={() => handleSelectScenario(key)}
                  onKeyDown={(e) => handleScenarioKeyDown(e, key)}
                >
                  <span className={`chip-indicator ${isScam ? 'bad' : 'ok'}`} />
                  <span>{sc.tabLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Play/Pause Control */}
          <div className="topbar-controls">
            <button
              type="button"
              className="demo-control-btn"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Pause demo animation' : 'Play demo animation'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
          </div>
        </div>

        {/* Progress Bar under topbar */}
        <div
          className="framer-progress-track"
          onClick={handleSeek}
          role="progressbar"
          aria-valuenow={Math.round(progressPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
          title="Click to seek animation progress"
        >
          <div
            className="framer-progress-fill"
            style={{
              transform: `scaleX(${progressPercent / 100})`,
              transformOrigin: 'left center'
            }}
          />
        </div>

        {/* Two-Pane Body Layout */}
        <div className="framer-frame-body">
          {/* =========================================================
              LEFT PANE (65%): Scenario Card, Scan Beam, Chips, Gauge
             ========================================================= */}
          <div className="framer-left-pane">
            <div className="pane-inner-card">
              {/* Header */}
              <div className="offer-preview-header">
                <div>
                  <span className="offer-preview-eyebrow">{scenarioData.eyebrow}</span>
                  <h3 className="offer-preview-title">{scenarioData.role}</h3>
                  <p className="offer-preview-company">{scenarioData.company}</p>
                </div>
                <span className="example-watermark">Example</span>
              </div>

              {/* Main Visual Box (Pasted Text or Screenshot Simulation) */}
              <div className="offer-content-box">
                {/* Cyan Scan Beam (sweeps down during parallel checks) */}
                {isScanning && (
                  <div className="cyan-scan-beam" aria-hidden="true" />
                )}

                {/* Scenario: Job pasted text */}
                {selectedScenarioKey === 'job' && (
                  <p className="offer-raw-text">
                    &ldquo;{scenarioData.text}&rdquo;
                  </p>
                )}

                {/* Scenario: UPI simulated screenshot or text */}
                {selectedScenarioKey === 'upi' && (
                  <div className="demo-screenshot-card">
                    <div className="demo-screenshot-meta">
                      <span className="demo-ocr-reading-tag">
                        {currentStepIdx < 1 ? (
                          <>
                            <RefreshCw size={11} className="spin-icon" />
                            Reading your screenshot...
                          </>
                        ) : (
                          'Screenshot text extracted'
                        )}
                      </span>
                      <span className="demo-meta-filename">{scenarioData.screenshotMeta}</span>
                    </div>
                    <div className="demo-chat-bubble-wrap">
                      <div className="demo-chat-bubble">
                        <div className="demo-bubble-sender">{scenarioData.chatSender}</div>
                        <div className="demo-bubble-body">{scenarioData.chatMessage}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scenario: Message normal delivery notice / friendly chat */}
                {selectedScenarioKey === 'message' && (
                  <div className="demo-screenshot-card">
                    <div className="demo-screenshot-meta">
                      <span className="demo-ocr-reading-tag">
                        {currentStepIdx < 1 ? (
                          <>
                            <RefreshCw size={11} className="spin-icon" />
                            Reading message text...
                          </>
                        ) : (
                          'Message content parsed'
                        )}
                      </span>
                      <span className="demo-meta-filename">{scenarioData.screenshotMeta}</span>
                    </div>
                    <div className="demo-chat-bubble-wrap">
                      <div className="demo-chat-bubble demo-chat-bubble-whatsapp">
                        <div className="demo-bubble-sender">{scenarioData.chatSender}</div>
                        <div className="demo-bubble-body">{scenarioData.chatMessage}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Detected items pills (shown once extracted) */}
                {currentStepIdx >= 1 && scenarioData.detectedItems && (
                  <div className="demo-detected-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '10px 0 6px' }}>
                    {scenarioData.detectedItems.map((item, idx) => (
                      <span key={idx} className="demo-detected-chip" style={{ fontSize: '11px', background: 'rgba(34, 211, 238, 0.1)', color: 'var(--accent-cyan, #22D3EE)', border: '1px solid rgba(34, 211, 238, 0.25)', padding: '2px 8px', borderRadius: '4px' }}>
                        {item.label}: {item.val}
                      </span>
                    ))}
                  </div>
                )}

                {/* Highlighted Warning/Legit Flags (shown when verdict arrives) */}
                {isVerdictReady && (
                  <div className="offer-flags-list" style={{ marginTop: '10px' }}>
                    {scenarioData.flags.map((flag, idx) => (
                      <div key={idx} className={`offer-flag-pill flag-${flag.severity || 'bad'}`}>
                        {flag.severity === 'ok' ? (
                          <CheckCircle2 size={13} className="flag-icon" />
                        ) : (
                          <AlertTriangle size={13} className="flag-icon" />
                        )}
                        <span>{flag.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Guidance / What to do now box (held until scenario ends) */}
                {isVerdictReady && scenarioData.guidanceBox && (
                  <div
                    className="demo-guidance-box"
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      background: scenarioData.level === 'low' ? 'rgba(18, 128, 92, 0.12)' : 'rgba(183, 121, 31, 0.12)',
                      border: scenarioData.level === 'low' ? '1px solid rgba(18, 128, 92, 0.35)' : '1px solid rgba(183, 121, 31, 0.3)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: scenarioData.level === 'low' ? 'var(--risk-ok-text, #34D399)' : '#FCD34D',
                      lineHeight: 1.4
                    }}
                  >
                    {scenarioData.guidanceBox}
                  </div>
                )}
              </div>

              {/* Five Check Chips (Run simultaneously together for <=1.5s) */}
              <div className="five-check-chips-bar" aria-label="Parallel evidence checks">
                {scenarioData.checks.map((chk, idx) => {
                  let chipState = 'pending';
                  if (isScanning) chipState = 'running';
                  if (isVerdictReady) chipState = chk.status;

                  return (
                    <div key={idx} className={`check-chip chip-${chipState}`}>
                      <span className={`chip-dot dot-${chipState}`} />
                      <span className="chip-name">{chk.name}</span>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Verdict Row: Calm skeleton initially, gauge mounted on verdict */}
              <div className="pane-verdict-row">
                <div className="gauge-cell">
                  {isVerdictReady ? (
                    <RiskGauge
                      level={scenarioData.level}
                      score={scenarioData.score}
                      label="Risk Level"
                    />
                  ) : (
                    /* Calm skeleton before verdict arrives - no Unknown gauge */
                    <div
                      className="gauge-skeleton-wrapper"
                      style={{
                        width: '100px',
                        height: '100px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                      aria-hidden="true"
                    >
                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '50%',
                          border: '6px solid rgba(255, 255, 255, 0.08)',
                          borderTopColor: isScanning ? 'var(--accent-cyan, #22D3EE)' : 'rgba(255, 255, 255, 0.16)',
                          transition: 'border-color 0.3s ease',
                          animation: isScanning ? 'spin 1.2s linear infinite' : 'none'
                        }}
                      />
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--text-dim)',
                          letterSpacing: '0.02em'
                        }}
                      >
                        {isScanning ? 'Evaluating' : 'Ready'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="verdict-summary-cell">
                  {isVerdictReady ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="verdict-chip-wrap"
                    >
                      <div className={`verdict-pill pill-${scenarioData.level}`}>
                        <span className="pill-dot" />
                        <strong>{scenarioData.verdictTitle} (Example)</strong>
                      </div>
                      <p className="verdict-note-text">
                        {scenarioData.verdictSummary}
                      </p>
                      {isProofReady && (
                        <div className="proof-id-badge">
                          <span className="proof-id-label">PROOF ID:</span>
                          <span className="proof-id-code mono">{scenarioData.proofId}</span>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <div className="verdict-pending-state">
                      <span className="pending-spinner" />
                      <span className="pending-text">
                        {isScanning
                          ? 'Evaluating live signals in parallel...'
                          : 'Analyzing input details...'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================
              RIGHT PANE (35%): Tabs "Flow steps" and "Proof"
             ========================================================= */}
          <div className="framer-right-pane">
            <div className="right-pane-tabs" role="tablist" aria-label="Walkthrough details">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'log'}
                className={`pane-tab-btn ${activeTab === 'log' ? 'active' : ''}`}
                onClick={() => setActiveTab('log')}
              >
                Flow steps
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'proof'}
                className={`pane-tab-btn ${activeTab === 'proof' ? 'active' : ''}`}
                onClick={() => setActiveTab('proof')}
              >
                Proof
              </button>
            </div>

            <div className="right-pane-content">
              {activeTab === 'log' ? (
                /* Tab 1: Flow Steps - 5 Sequential Steps matching real flow */
                <div className="scan-log-stack" aria-label="Flow steps">
                  {scenarioData.steps.map((step) => {
                    const isDone = currentStepIdx > step.id;
                    const isActive = currentStepIdx === step.id;

                    return (
                      <div
                        key={step.id}
                        className={`log-step-row ${
                          isDone ? 'step-done' : isActive ? 'step-active' : 'step-upcoming'
                        }`}
                      >
                        <div className="step-icon-wrap">
                          {isDone ? (
                            <span className="step-check">&#10003;</span>
                          ) : isActive ? (
                            <span className="step-spinner-circle" />
                          ) : (
                            <span className="step-bullet" />
                          )}
                        </div>
                        <div className="step-info">
                          <strong className="step-title">{step.title}</strong>
                          <span className="step-caption">{step.caption}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Tab 2: Cryptographic Proof Info */
                <div className="proof-tab-stack">
                  <div className="proof-header-block">
                    <FileCheck2 size={20} color="#00E5FF" />
                    <div>
                      <strong>Cryptographic Ledger Proof</strong>
                      <span className="proof-sub">Immutable SHA-256 hash &amp; block</span>
                    </div>
                  </div>

                  <div className="proof-meta-table">
                    <div className="meta-row">
                      <span className="meta-key">Proof ID</span>
                      <span className="meta-val mono">{scenarioData.proofId}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-key">Ledger Block</span>
                      <span className="meta-val mono">#{scenarioData.blockIdx}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-key">Access Code</span>
                      <span className="meta-val mono">{scenarioData.accessCode}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-key">SHA-256 Hash</span>
                      <span className="meta-val mono" title={scenarioData.canonicalHash}>
                        {scenarioData.canonicalHash.slice(0, 16)}...
                      </span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-key">Status</span>
                      <span className="meta-val-badge">INTACT</span>
                    </div>
                  </div>

                  <div className="proof-tamper-note">
                    <Lock size={13} color="#94A3B8" />
                    <span>
                      Anchored to tamper-evident ledger. Any modification to report text is detected on verification. Access Code is never stored.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Frame Disclaimer */}
      <p className="demo-disclaimer">
        Example demonstration for illustration. Screening aid, not a legal finding.
      </p>
    </div>
  );
}

export default DemoPlayer;
