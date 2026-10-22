import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  Edit2,
  FileText   
} from 'lucide-react';
import { apiFetch } from '../api';
import { useAuth } from '../auth';
import { processScreenshotFile } from '../components/upi/imageProcessor';
import { UpiThumbnail, ImageViewerDialog } from '../components/upi/UpiCanvasViewer';
import { UpiResult } from '../components/upi/UpiResult';
import '../components/upi/upi.css';

const TEXT_EXAMPLES = [
  {
    id: 'collect-example',
    title: 'Collect request',
    badge: 'Example',
    text: 'Payment of Rs 1,500 pending on PhonePe. Click here to approve collect request and claim refund.'
  },
  {
    id: 'chat-example',
    title: 'Marketplace chat',
    badge: 'Example',
    text: 'Buyer: Hi, is the sofa still available?\nSeller: Yes, available for Rs 8,000.\nBuyer: I am booking it now. I have sent a Rs 8,000 QR code on WhatsApp.\nSeller: I see a request asking for my UPI PIN.\nBuyer: Yes, enter PIN to verify account and credit will reflect immediately.\nSeller: Wait, UPI PIN is only for sending money.'
  },
  {
    id: 'family-example',
    title: 'Family request',
    badge: 'Example',
    text: 'Hi Dad, please send Rs 500 for my monthly bus pass to rohit@okaxis when you get a chance. Thanks!'
  }
];

const IMAGE_EXAMPLES = [
  {
    id: 'img-example-1',
    title: 'Payment screenshot 1',
    badge: 'Example screenshot',
    url: '/examples/upi-scam.png',
    filename: 'upi-screenshot-sample-1.png'
  },
  {
    id: 'img-example-2',
    title: 'Payment screenshot 2',
    badge: 'Example screenshot',
    url: '/examples/upi-safe.png',
    filename: 'upi-screenshot-sample-2.png'
  }
];

export function UpiCheck() {
  const { session } = useAuth();

  // Input states
  const [inputText, setInputText] = useState('');
  const [source, setSource] = useState('pasted'); // 'pasted' | 'screenshot'

  // Image states
  const [imageFile, setImageFile] = useState(null);
  const [imageCanvas, setImageCanvas] = useState(null);
  const [imageMeta, setImageMeta] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState(null);
  const [ocrData, setOcrData] = useState(null); // { text, readability, truncated, notes, turns }
  const [viewerOpen, setViewerOpen] = useState(false);
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
    setImageFile(null);
    setImageCanvas(null);
    setImageMeta(null);
    setOcrData(null);
    setOcrError(null);
    setCheckError(null);
    setCheckErrorCode(null);
    setResult(null);
    setMobileInputCollapsed(false);
  }, []);

  // Remove image only
  const handleRemoveImage = useCallback(() => {
    setImageFile(null);
    setImageCanvas(null);
    setImageMeta(null);
    setOcrData(null);
    setOcrError(null);
    setSource('pasted');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Process an uploaded or pasted file
  const handleProcessFile = useCallback(async (file) => {
    if (!file) return;
    setOcrError(null);
    setCheckError(null);
    setOcrLoading(true);

    try {
      // 1. Client-side canvas decode & resize (magic bytes check, PNG white background)
      const processed = await processScreenshotFile(file);
      setImageFile(processed.uploadFile);
      setImageCanvas(processed.canvas);
      setImageMeta({
        name: processed.originalName,
        size: processed.sizeFormatted,
        width: processed.width,
        height: processed.height
      });
      setSource('screenshot');

      // 2. Call /api/upi/read-screenshot
      const formData = new FormData();
      formData.append('image', processed.uploadFile);

      const ocrRes = await apiFetch('/api/upi/read-screenshot', {
        method: 'POST',
        body: formData
      });

      if (!ocrRes) {
        throw new Error('Could not read text from screenshot. Empty response.');
      }

      setOcrData(ocrRes);

      if (ocrRes.text) {
        setInputText(ocrRes.text);
      }
    } catch (err) {
      console.error('OCR processing error:', err);
      setOcrError(err.message || 'Could not process screenshot.');
    } finally {
      setOcrLoading(false);
    }
  }, []);

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

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      handleProcessFile(droppedFile);
    }
  };

  // Clipboard paste support (Ctrl+V with image)
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            handleProcessFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleProcessFile]);

  // Load text example
  const handleLoadTextExample = (ex) => {
    handleRemoveImage();
    setInputText(ex.text);
    setSource('pasted');
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
      await handleProcessFile(file);
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
        source: imageCanvas ? 'screenshot' : 'pasted'
      };

      if (ocrData?.turns && Array.isArray(ocrData.turns)) {
        payload.turns = ocrData.turns;
      }

      if (ocrData?.readability) {
        payload.readability = ocrData.readability;
      }

      const res = await apiFetch('/api/upi/check', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!res) {
        throw new Error('No response from payment check service.');
      }

      setResult(res);
      setAccordionOpen(false);

      // On mobile viewports, collapse input to summary bar
      if (window.innerWidth <= 860) {
        setMobileInputCollapsed(true);
      }

      // Smooth scroll to result
      setTimeout(() => {
        resultColRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } catch (err) {
      console.error('UPI check error:', err);
      setCheckErrorCode(err.status || null);
      if (err.status === 404 || err.message?.includes('Network error')) {
        setCheckError('This tool is not available yet.');
      } else if (err.status === 429) {
        setCheckError('Too many checks right now. Please try again in a minute.');
      } else {
        setCheckError(err.message || 'Payment check failed. Please check your input and try again.');
      }
    } finally {
      setCheckLoading(false);
    }
  };

  const isTextValid = inputText.trim().length >= 10 && inputText.trim().length <= 20000;
  const isImageBlocked = imageCanvas && ocrData?.readability === 'none';
  const canSubmit = isTextValid && !isImageBlocked && !ocrLoading && !checkLoading;

  return (
    <div className="upi-page-container">
      {/* 1. COMPACT HEADER */}
      <div className="upi-breadcrumb-row">
        <Link to="/tools" className="upi-breadcrumb-link">
          <ArrowLeft size={16} strokeWidth={2} />
          <span>All tools</span>
        </Link>
      </div>

      <header className="upi-page-header">
        <h1 className="upi-page-title">UPI and Payment Check</h1>
        <p className="upi-page-subtitle">Pay-to-receive, collect requests and refund links</p>
      </header>

      {/* 2. MOBILE COLLAPSED SUMMARY (Shown on mobile after result) */}
      {mobileInputCollapsed && result && (
        <div className="upi-mobile-collapsed-summary">
          <div className="upi-collapsed-text">
            {imageCanvas
              ? `Screenshot (${imageMeta?.name || 'Image'}, ${ocrData?.readability || 'read'})`
              : `${inputText.slice(0, 48).trim()}... (${inputText.length} chars)`}
          </div>
          <button
            type="button"
            className="upi-btn-edit-compact"
            onClick={() => setMobileInputCollapsed(false)}
          >
            <Edit2 size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Edit input
          </button>
        </div>
      )}

      {/* 3. TWO-COLUMN LAYOUT */}
      <div className="upi-two-column-layout">
        {/* LEFT COLUMN: INPUT PANEL */}
        <div className={`upi-input-col upi-sticky-input-col ${mobileInputCollapsed && result ? 'upi-mobile-hidden' : ''}`}>
          <div className="upi-input-card">
            {/* Input Header */}
            <div className="upi-input-header">
              <label htmlFor="upi-text-input" className="upi-input-label">
                {imageCanvas ? 'Text read from your screenshot' : 'Paste message or payment text'}
              </label>
              {(inputText || imageCanvas) && (
                <button
                  type="button"
                  className="upi-btn-clear"
                  onClick={handleReset}
                  aria-label="Clear all input and screenshot"
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
            <div className="upi-textarea-wrap">
              <textarea
                id="upi-text-input"
                className="upi-textarea"
                rows={imageCanvas ? 5 : 6}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste SMS, WhatsApp message, UPI request details, or instructions..."
                maxLength={20000}
                aria-describedby="upi-char-counter"
              />
              <div className="upi-textarea-footer">
                <span
                  id="upi-char-counter"
                  className={`upi-char-counter ${inputText.length > 20000 ? 'is-error' : ''}`}
                >
                  {inputText.length.toLocaleString()} / 20,000 characters
                </span>
              </div>
            </div>

            {/* Screenshot Area */}
            <div className="upi-dropzone-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleProcessFile(e.target.files[0]);
                  }
                }}
              />

              {imageCanvas && imageMeta ? (
                <>
                  <UpiThumbnail
                    sourceCanvas={imageCanvas}
                    name={imageMeta.name}
                    size={imageMeta.size}
                    readability={ocrData?.readability}
                    onOpenViewer={() => setViewerOpen(true)}
                    onRemove={handleRemoveImage}
                  />

                  {ocrLoading && (
                    <div className="upi-ocr-loading" role="status" aria-live="polite">
                      <RefreshCw size={14} className="upi-spin-icon" />
                      <span>Reading text from screenshot...</span>
                    </div>
                  )}

                  {ocrError && (
                    <div className="upi-ocr-error" role="alert">
                      <AlertTriangle size={15} strokeWidth={2} />
                      <span>{ocrError}</span>
                    </div>
                  )}

                  {ocrData && !ocrLoading && (
                    <>
                      {(ocrData.readability === 'poor' || ocrData.truncated) && (
                        <div className="upi-ocr-warning" role="alert">
                          <AlertTriangle size={15} strokeWidth={2} />
                          <span>Some text may be missing. Check the screenshot.</span>
                        </div>
                      )}

                      {(ocrData.readability === 'none' || (ocrData.text && ocrData.text.trim().length < 10)) && (
                        <div className="upi-ocr-error" role="alert">
                          <AlertCircle size={15} strokeWidth={2} />
                          <span>We could not read any message in this image.</span>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div
                  className={`upi-dropzone ${dragActive ? 'is-dragover' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  tabIndex={0}
                  role="button"
                  aria-label="Upload screenshot or payment message. Drag and drop, click, or paste with Ctrl V."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <div className="upi-dropzone-content">
                    <Upload size={22} className="upi-dropzone-icon" />
                    <span className="upi-dropzone-label">Upload a screenshot</span>
                    <span className="upi-dropzone-hint">
                      PNG, JPG or WEBP up to 5 MB. Or drag & drop / paste (Ctrl+V)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Check Action Button */}
            <div className="upi-action-btn-row">
              <button
                type="button"
                className="upi-btn-check"
                disabled={!canSubmit}
                onClick={handleCheck}
                aria-busy={checkLoading}
              >
                {checkLoading ? (
                  <>
                    <RefreshCw size={16} className="upi-spin-icon" />
                    <span>Checking payment request...</span>
                  </>
                ) : (
                  <span>Check payment request</span>
                )}
              </button>
            </div>

            {/* Privacy line */}
            <p className="upi-privacy-notice">
              We do not keep your text or screenshot unless you sign in and the result is saved. Tip: crop out names and numbers first.
            </p>

            {/* Accordion: Try an example */}
            <div className="upi-accordion">
              <button
                type="button"
                className="upi-accordion-trigger"
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
                <div className="upi-accordion-content" role="region" aria-label="Example payment requests">
                  {TEXT_EXAMPLES.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      className="upi-example-chip-btn"
                      onClick={() => handleLoadTextExample(ex)}
                    >
                      <span>{ex.title}</span>
                      <span className="upi-example-tag">{ex.badge}</span>
                    </button>
                  ))}

                  {IMAGE_EXAMPLES.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      className="upi-example-chip-btn"
                      onClick={() => handleLoadImageExample(ex)}
                      disabled={ocrLoading}
                    >
                      <span>{ex.title}</span>
                      <span className="upi-example-tag">{ex.badge}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: RESULT / GUIDE */}
        <div className="upi-result-col" ref={resultColRef}>
          {/* Error Banner */}
          {checkError && (
            <div className="upi-error-card" role="alert">
              <AlertTriangle size={18} strokeWidth={2} />
              <div className="upi-error-content">
                <div className="upi-error-text">{checkError}</div>
                {checkErrorCode === 404 && (
                  <Link to="/tools" className="upi-error-link">
                    Return to Tools
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Active Result or Initial "What you will get" Guide */}
          {result ? (
            <UpiResult
              result={result}
              rawInput={inputText}
              onReset={handleReset}
              imageCanvas={imageCanvas}
            />
          ) : (
            <div className="upi-preview-guide-card">
              <h2 className="upi-guide-title">What you will get</h2>
              <ul className="upi-guide-items-list">
                <li className="upi-guide-item">
                  <CheckCircle2 size={16} className="upi-guide-check-icon" />
                  <span>Risk score (0–100) and clear assessment level</span>
                </li>
                <li className="upi-guide-item">
                  <CheckCircle2 size={16} className="upi-guide-check-icon" />
                  <span>Direct quotes with reasons why any phrase is suspicious</span>
                </li>
                <li className="upi-guide-item">
                  <CheckCircle2 size={16} className="upi-guide-check-icon" />
                  <span>Practical steps to protect your money right now</span>
                </li>
                <li className="upi-guide-item">
                  <CheckCircle2 size={16} className="upi-guide-check-icon" />
                  <span>Tamper-evident proof stored on an immutable ledger</span>
                </li>
              </ul>
              <p className="upi-guide-subtext">
                Never enter your UPI PIN or approve a collect request to receive money.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 4. CANVAS IMAGE VIEWER MODAL DIALOG */}
      {viewerOpen && imageCanvas && (
        <ImageViewerDialog
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          sourceCanvas={imageCanvas}
          name={imageMeta?.name || 'Screenshot'}
          extractedText={ocrData?.text || inputText}
          onReplace={() => {
            setViewerOpen(false);
            fileInputRef.current?.click();
          }}
          onRemove={() => {
            setViewerOpen(false);
            handleRemoveImage();
          }}
        />
      )}
    </div>
  );
}

export default UpiCheck;

