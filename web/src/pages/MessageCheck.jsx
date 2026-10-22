import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  Edit2,
  Plus
} from 'lucide-react';
import { apiFetch } from '../api';
import { processScreenshotFile } from '../components/message/imageProcessor';
import { MessageThumbnail, ImageViewerDialog } from '../components/message/MessageCanvasViewer';
import { MessageResult } from '../components/message/MessageResult';
import '../components/message/message.css';

const TEXT_EXAMPLES = [
  {
    id: 'bank-kyc-example',
    title: 'Bank account message',
    badge: 'Example',
    text: 'Dear customer, your bank account has been temporarily locked due to suspicious activity. Update your KYC immediately to restore access: https://secure-bank-kyc-update.xyz'
  },
  {
    id: 'wfh-offer-example',
    title: 'Work-from-home offer chat',
    badge: 'Example',
    text: 'Recruiter: Hello! We noticed your profile on LinkedIn. We offer part-time remote work liking YouTube videos and rating hotels. You can earn Rs 2,500 - 5,000 per day. Joining fee is only Rs 500 for onboarding materials.\nCandidate: Is any experience required?\nRecruiter: No experience needed. Pay Rs 500 via UPI to activate your portal account and receive your first batch of tasks.'
  },
  {
    id: 'friend-lunch-example',
    title: 'Friend asking for plans',
    badge: 'Example',
    text: 'Hey! Are you free this Saturday for lunch? We are planning to try that new cafe downtown around 1 PM. Let me know if you can make it!'
  },
  {
    id: 'delivery-fee-example',
    title: 'Delivery notification',
    badge: 'Example',
    text: 'Your package #IN-849201 from SpeedPost is held at the sorting hub due to an incomplete street address. Please pay a re-delivery fee of Rs 48 within 24 hours at https://speedpost-redeliver-fee.online to avoid parcel return.'
  },
  {
    id: 'crypto-tip-example',
    title: 'Group tip message',
    badge: 'Example',
    text: 'VIP Trading Alert: Guaranteed 300% returns in 48 hours on crypto pump pool. Next coin pumping at 8 PM today. Join our private VIP Telegram group now for exclusive signals and account management.'
  }
];

const IMAGE_EXAMPLES = [
  {
    id: 'msg-img-example-1',
    title: 'Message screenshot 1',
    badge: 'Example screenshot',
    url: '/examples/message-scam.png',
    filename: 'message-screenshot-sample-1.png'
  },
  {
    id: 'msg-img-example-2',
    title: 'Message screenshot 2',
    badge: 'Example screenshot',
    url: '/examples/message-safe.png',
    filename: 'message-screenshot-sample-2.png'
  }
];

export function MessageCheck() {

  // Input states
  const [inputText, setInputText] = useState('');
  const [source, setSource] = useState('pasted'); // 'pasted' | 'screenshot'

  // Up to 4 screenshots
  const [screenshots, setScreenshots] = useState([]);
  // Each item: { file, canvas, meta: { name, size, width, height }, ocrData }
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState(null);
  const [activeViewerIdx, setActiveViewerIdx] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Check & result states
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState(null);
  const [checkErrorCode, setCheckErrorCode] = useState(null);
  const [result, setResult] = useState(null);

  // Layout states
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [mobileInputCollapsed, setMobileInputCollapsed] = useState(false);
  const [prefillNote, setPrefillNote] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  const fileInputRef = useRef(null);
  const resultColRef = useRef(null);

  // Read prefill from query parameter in hash route
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const prefillRaw = params.get('prefill');
    if (prefillRaw) {
      try {
        let b64 = prefillRaw.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const decoded = decodeURIComponent(escape(atob(b64)));
        const data = JSON.parse(decoded);
        if (data && typeof data === 'object' && typeof data.input === 'string') {
          setInputText(data.input.slice(0, 20000));
          setSource('pasted');
          setPrefillNote('Filled from the Cyber Shield extension. Review it, then press Check.');
        }
      } catch (err) {
        // Ignore invalid data silently
      }
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  // Reset all
  const handleReset = useCallback(() => {
    setInputText('');
    setPrefillNote('');
    setSource('pasted');
    setScreenshots([]);
    setOcrError(null);
    setCheckError(null);
    setCheckErrorCode(null);
    setResult(null);
    setMobileInputCollapsed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Remove a specific screenshot
  const handleRemoveScreenshot = useCallback((indexToRemove) => {
    setScreenshots((prev) => {
      const updated = prev.filter((_, idx) => idx !== indexToRemove);
      if (updated.length === 0) {
        setSource('pasted');
      }
      // Re-stitch input text from remaining screenshots
      const combined = updated
        .map((s) => s.ocrData?.text || '')
        .filter(Boolean)
        .join('\n\n--- next screenshot ---\n\n');
      setInputText(combined);
      return updated;
    });
  }, []);

  // Process one or more uploaded/pasted files (max 4 total)
  const handleProcessFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setOcrError(null);
    setCheckError(null);
    setOcrLoading(true);

    try {
      const fileList = Array.from(files);
      const remainingSlots = 4 - screenshots.length;
      if (remainingSlots <= 0) {
        throw new Error('Maximum of 4 screenshots allowed. Please remove one first.');
      }

      const filesToProcess = fileList.slice(0, remainingSlots);
      const newScreenshots = [];

      for (const file of filesToProcess) {
        // 1. Client-side canvas decode & resize
        const processed = await processScreenshotFile(file);

        // 2. Call /api/message/read-screenshot
        const formData = new FormData();
        formData.append('image', processed.uploadFile);

        const ocrRes = await apiFetch('/api/message/read-screenshot', {
          method: 'POST',
          body: formData
        });

        if (!ocrRes) {
          throw new Error('Could not read text from screenshot. Empty response.');
        }

        newScreenshots.push({
          file: processed.uploadFile,
          canvas: processed.canvas,
          meta: {
            name: processed.originalName,
            size: processed.sizeFormatted,
            width: processed.width,
            height: processed.height
          },
          ocrData: ocrRes
        });
      }

      setScreenshots((prev) => {
        const merged = [...prev, ...newScreenshots].slice(0, 4);
        const combinedText = merged
          .map((s) => s.ocrData?.text || '')
          .filter(Boolean)
          .join('\n\n--- next screenshot ---\n\n');
        setInputText(combinedText);
        return merged;
      });

      setSource('screenshot');
    } catch (err) {
      console.error('OCR processing error:', err);
      setOcrError(err.message || 'Could not process screenshot.');
    } finally {
      setOcrLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [screenshots.length]);

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleProcessFiles(e.dataTransfer.files);
    }
  };

  // Clipboard paste support (Ctrl+V with image)
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        handleProcessFiles(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleProcessFiles]);

  // Load text example
  const handleLoadTextExample = (ex) => {
    setScreenshots([]);
    setSource('pasted');
    setInputText(ex.text);
    setResult(null);
    setCheckError(null);
    setMobileInputCollapsed(false);
  };

  // Load image example
  const handleLoadImageExample = async (ex) => {
    handleReset();
    setOcrLoading(true);
    try {
      const res = await fetch(ex.url);
      if (!res.ok) {
        throw new Error(`Example image unavailable (${res.status})`);
      }
      const blob = await res.blob();
      const file = new File([blob], ex.filename, { type: blob.type || 'image/png' });
      await handleProcessFiles([file]);
    } catch (err) {
      console.error('Failed to load example image:', err);
      setOcrError(err.message || 'Failed to load example image.');
      setOcrLoading(false);
    }
  };

  // Submit check
  const handleCheck = async () => {
    const trimmed = inputText.trim();
    if (trimmed.length < 10) return;

    setCheckLoading(true);
    setCheckError(null);
    setCheckErrorCode(null);

    try {
      const payload = {
        input: trimmed,
        source: source === 'screenshot' && screenshots.length > 0 ? 'screenshot' : 'pasted'
      };

      // Collect turns if present from OCR
      const combinedTurns = [];
      screenshots.forEach((s) => {
        if (s.ocrData?.turns && Array.isArray(s.ocrData.turns)) {
          combinedTurns.push(...s.ocrData.turns);
        }
      });
      if (combinedTurns.length > 0) {
        payload.turns = combinedTurns;
      }

      // Compute overall readability
      if (screenshots.length > 0) {
        const hasNone = screenshots.some((s) => s.ocrData?.readability === 'none');
        const hasPoor = screenshots.some((s) => s.ocrData?.readability === 'poor');
        payload.readability = hasNone ? 'none' : hasPoor ? 'poor' : 'good';
      }

      const res = await apiFetch('/api/message/check', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!res) {
        throw new Error('No response from message scanner service.');
      }

      setResult(res);
      setAccordionOpen(false);

      if (window.innerWidth <= 860) {
        setMobileInputCollapsed(true);
      }

      setTimeout(() => {
        resultColRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } catch (err) {
      console.error('Message check error:', err);
      setCheckErrorCode(err.status || null);
      if (err.status === 404 || err.message?.includes('Network error')) {
        setCheckError('This tool is not available yet.');
      } else if (err.status === 429) {
        setCheckError('Too many checks right now. Please try again in a minute.');
      } else {
        setCheckError(err.message || 'Message check failed. Please check your input and try again.');
      }
    } finally {
      setCheckLoading(false);
    }
  };

  const isTextValid = inputText.trim().length >= 10 && inputText.trim().length <= 20000;
  const isImageBlocked = screenshots.length > 0 && screenshots.every((s) => s.ocrData?.readability === 'none') && inputText.trim().length < 10;
  const canSubmit = isTextValid && !isImageBlocked && !ocrLoading && !checkLoading;

  const activeViewerScreenshot = activeViewerIdx !== null ? screenshots[activeViewerIdx] : null;

  return (
    <div className="msg-page-container">
      {/* 1. COMPACT BREADCRUMB & HEADER */}
      <div className="msg-breadcrumb-row">
        <Link to="/tools" className="msg-breadcrumb-link">
          <ArrowLeft size={16} strokeWidth={2} />
          <span>All tools</span>
        </Link>
      </div>

      <header className="msg-page-header">
        <h1 className="msg-page-title">Message Scanner</h1>
        <p className="msg-page-subtitle">SMS, WhatsApp, Telegram or email: paste text or upload a screenshot</p>
      </header>

      {/* 2. MOBILE COLLAPSED SUMMARY */}
      {mobileInputCollapsed && result && (
        <div className="msg-mobile-collapsed-summary">
          <div className="msg-collapsed-text">
            {screenshots.length > 0
              ? `${screenshots.length} screenshot(s) analyzed`
              : `${inputText.slice(0, 48).trim()}... (${inputText.length} chars)`}
          </div>
          <button
            type="button"
            className="msg-btn-edit-compact"
            onClick={() => setMobileInputCollapsed(false)}
          >
            <Edit2 size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Edit input
          </button>
        </div>
      )}

      {/* 3. TWO-COLUMN LAYOUT */}
      <div className="msg-two-column-layout">
        {/* LEFT COLUMN: INPUT PANEL */}
        <div className={`msg-input-col msg-sticky-input-col ${mobileInputCollapsed && result ? 'msg-mobile-hidden' : ''}`}>
          <div className="msg-input-card">
            {/* Input Header */}
            <div className="msg-input-header">
              <label htmlFor="msg-text-input" className="msg-input-label">
                {screenshots.length > 0 ? 'Text read from your screenshot(s)' : 'Paste message text'}
              </label>
              {(inputText || screenshots.length > 0) && (
                <button
                  type="button"
                  className="msg-btn-clear"
                  onClick={handleReset}
                  aria-label="Clear all input and screenshots"
                >
                  Clear
                </button>
              )}
            </div>

            {prefillNote && (
              <div
                className="prefill-note"
                role="status"
                style={{
                  background: 'rgba(10, 102, 194, 0.12)',
                  border: '1px solid rgba(77, 163, 255, 0.3)',
                  color: '#4DA3FF',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '13px'
                }}
              >
                {prefillNote}
              </div>
            )}

            {/* Textarea */}
            <div className="msg-textarea-wrap">
              <textarea
                id="msg-text-input"
                className="msg-textarea"
                rows={screenshots.length > 0 ? 5 : 6}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste SMS, WhatsApp message, Telegram chat, or email text..."
                maxLength={20000}
                aria-describedby="msg-char-counter"
              />
              <div className="msg-textarea-footer">
                <span
                  id="msg-char-counter"
                  className={`msg-char-counter ${inputText.length > 20000 ? 'is-error' : ''}`}
                >
                  {inputText.length.toLocaleString()} / 20,000 characters
                </span>
              </div>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleProcessFiles(e.target.files);
                }
              }}
            />

            {/* Screenshots list / dropzone */}
            <div className="msg-dropzone-wrap">
              {screenshots.length > 0 && (
                <div className="msg-thumbs-list">
                  {screenshots.map((s, idx) => (
                    <MessageThumbnail
                      key={idx}
                      index={idx}
                      total={screenshots.length}
                      sourceCanvas={s.canvas}
                      name={s.meta.name}
                      size={s.meta.size}
                      readability={s.ocrData?.readability}
                      onOpenViewer={() => setActiveViewerIdx(idx)}
                      onRemove={() => handleRemoveScreenshot(idx)}
                    />
                  ))}
                </div>
              )}

              {ocrLoading && (
                <div className="msg-ocr-loading" role="status" aria-live="polite">
                  <RefreshCw size={14} className="msg-spin-icon" />
                  <span>Reading text from screenshot(s)...</span>
                </div>
              )}

              {ocrError && (
                <div className="msg-ocr-error" role="alert">
                  <AlertTriangle size={15} strokeWidth={2} />
                  <span>{ocrError}</span>
                </div>
              )}

              {/* Add more button or initial Dropzone */}
              {screenshots.length > 0 && screenshots.length < 4 ? (
                <button
                  type="button"
                  className="msg-btn-add-more"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={ocrLoading}
                >
                  <Plus size={15} />
                  <span>Add another screenshot ({screenshots.length}/4)</span>
                </button>
              ) : screenshots.length === 0 ? (
                <div
                  className={`msg-dropzone ${dragActive ? 'is-dragover' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  tabIndex={0}
                  role="button"
                  aria-label="Upload screenshots. Drag and drop, click, or paste with Ctrl V."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <div className="msg-dropzone-content">
                    <Upload size={22} className="msg-dropzone-icon" />
                    <span className="msg-dropzone-label">Upload screenshot(s)</span>
                    <span className="msg-dropzone-hint">
                      PNG, JPG or WEBP up to 5 MB (up to 4 screenshots). Or drag & drop / paste (Ctrl+V)
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Check Action Button */}
            <div className="msg-action-btn-row">
              <button
                type="button"
                className="msg-btn-check"
                disabled={!canSubmit}
                onClick={handleCheck}
                aria-busy={checkLoading}
              >
                {checkLoading ? (
                  <>
                    <RefreshCw size={16} className="msg-spin-icon" />
                    <span>Checking message...</span>
                  </>
                ) : (
                  <span>Check message</span>
                )}
              </button>
            </div>

            {/* Privacy notice */}
            <p className="msg-privacy-notice">
              We do not keep your text or screenshots unless you sign in and the result is saved. Tip: crop out personal names and contact details first.
            </p>

            {/* Accordion: Try an example */}
            <div className="msg-accordion">
              <button
                type="button"
                className="msg-accordion-trigger"
                onClick={() => setAccordionOpen(!accordionOpen)}
                aria-expanded={accordionOpen}
              >
                <span>Try an example</span>
                <ChevronDown
                  size={18}
                  style={{
                    transform: accordionOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s ease'
                  }}
                />
              </button>

              {accordionOpen && (
                <div className="msg-accordion-content" role="region" aria-label="Example messages">
                  {TEXT_EXAMPLES.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      className="msg-example-chip-btn"
                      onClick={() => handleLoadTextExample(ex)}
                    >
                      <span>{ex.title}</span>
                      <span className="msg-example-tag">{ex.badge}</span>
                    </button>
                  ))}

                  {IMAGE_EXAMPLES.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      className="msg-example-chip-btn"
                      onClick={() => handleLoadImageExample(ex)}
                      disabled={ocrLoading}
                    >
                      <span>{ex.title}</span>
                      <span className="msg-example-tag">{ex.badge}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: RESULT / GUIDE */}
        <div className="msg-result-col" ref={resultColRef}>
          {/* Error Banner */}
          {checkError && (
            <div className="msg-error-card" role="alert">
              <AlertTriangle size={18} strokeWidth={2} />
              <div className="msg-error-content">
                <div className="msg-error-text">{checkError}</div>
                {checkErrorCode === 404 && (
                  <Link to="/tools" className="msg-error-link">
                    Return to Tools
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Active Result or Initial "What you will get" Guide */}
          {result ? (
            <MessageResult
              result={result}
              rawInput={inputText}
              onReset={handleReset}
              imageCanvases={screenshots.map((s) => s.canvas)}
            />
          ) : (
            <div className="msg-preview-guide-card">
              <h2 className="msg-guide-title">What you will get</h2>
              <ul className="msg-guide-items-list">
                <li className="msg-guide-item">
                  <CheckCircle2 size={16} className="msg-guide-check-icon" />
                  <span>Risk score (0–100) and clear assessment level</span>
                </li>
                <li className="msg-guide-item">
                  <CheckCircle2 size={16} className="msg-guide-check-icon" />
                  <span>Direct quotes with reasons why any phrase is suspicious</span>
                </li>
                <li className="msg-guide-item">
                  <CheckCircle2 size={16} className="msg-guide-check-icon" />
                  <span>Practical steps to protect your personal information</span>
                </li>
                <li className="msg-guide-item">
                  <CheckCircle2 size={16} className="msg-guide-check-icon" />
                  <span>Tamper-evident proof stored on an immutable ledger</span>
                </li>
              </ul>
              <p className="msg-guide-subtext">
                Anyone can fake the sender name or phone number shown on a message. Always verify through an official channel before acting.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 4. CANVAS IMAGE VIEWER MODAL DIALOG */}
      {activeViewerScreenshot && (
        <ImageViewerDialog
          isOpen={activeViewerIdx !== null}
          onClose={() => setActiveViewerIdx(null)}
          sourceCanvas={activeViewerScreenshot.canvas}
          name={activeViewerScreenshot.meta?.name || 'Screenshot'}
          extractedText={activeViewerScreenshot.ocrData?.text || ''}
          onRemove={() => {
            const idx = activeViewerIdx;
            setActiveViewerIdx(null);
            handleRemoveScreenshot(idx);
          }}
        />
      )}
    </div>
  );
}

export default MessageCheck;
