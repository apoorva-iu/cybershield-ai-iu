import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Upload,
  Image as ImageIcon,
  X,
  AlertTriangle,
  CheckCircle2,
  Shield,
  ArrowLeft,
  Sparkles,
  RotateCcw,
  AlertCircle
} from 'lucide-react';
import { getToolBySlug, TOOLS } from '../tools';
import { apiFetch } from '../api';
import { useAuth } from '../auth';
import { Container } from '../components/ui';
import { PageTransition } from '../components/wow';
import { ToolResult } from '../components/ToolResult';
import { UsagePill } from '../components/UsagePill';
import { QuotaExceededModal } from '../components/QuotaExceededModal';
import { triggerUsageRefresh } from '../lib/useUsage';
import '../tools.css';

/**
 * Robust screenshot pre-processing:
 * 1. Client-side magic bytes validation (PNG, JPG, WEBP).
 * 2. Friendly error for HEIC/AVIF.
 * 3. createImageBitmap with HTMLImageElement fallback.
 * 4. Canvas resize to max 1600px with white background fill.
 * 5. Fallback to original file on failure or enlargement.
 */
export async function processScreenshot(file) {
  if (!file) throw new Error('No file provided.');
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image exceeds 10 MB limit. Please choose a smaller file.');
  }

  // 1. Read first 16 bytes for magic numbers
  const headerBuf = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(headerBuf);

  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // WEBP

  // Check for HEIC / AVIF signature (ftypheic, ftypmif1, ftypavif) or mime types
  const headerStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  const isHeicOrAvif =
    (file.type && /heic|heif|avif/i.test(file.type)) ||
    (headerStr.includes('ftyp') && (headerStr.includes('heic') || headerStr.includes('mif1') || headerStr.includes('avif') || headerStr.includes('msf1')));

  if (isHeicOrAvif) {
    throw new Error('Please convert this image to PNG or JPG first (HEIC and AVIF are not supported yet).');
  }

  if (!isPng && !isJpg && !isWebp) {
    throw new Error('Please upload a PNG, JPG or WEBP image.');
  }

  // 2. Decode using createImageBitmap with fallback to HTMLImageElement
  let bitmap = null;
  let imgObj = null;
  let width = 0;
  let height = 0;

  try {
    if (typeof window.createImageBitmap === 'function') {
      bitmap = await window.createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
    }
  } catch {
    // Fallback to Image element
  }

  if (!bitmap) {
    try {
      imgObj = await new Promise((resolve, reject) => {
        const tempImg = new Image();
        const tempUrl = URL.createObjectURL(file);
        tempImg.onload = () => {
          URL.revokeObjectURL(tempUrl);
          resolve(tempImg);
        };
        tempImg.onerror = () => {
          URL.revokeObjectURL(tempUrl);
          reject(new Error('Image decode error'));
        };
        tempImg.src = tempUrl;
      });
      width = imgObj.naturalWidth || imgObj.width;
      height = imgObj.naturalHeight || imgObj.height;
    } catch {
      throw new Error('This image could not be read. Please take a new screenshot or save as PNG.');
    }
  }

  if (!width || !height) {
    if (bitmap) bitmap.close?.();
    throw new Error('This image could not be read. Please take a new screenshot or save as PNG.');
  }

  // 3. Canvas resize & white background fill
  const maxDim = 1600;
  let targetW = width;
  let targetH = height;
  if (targetW > maxDim || targetH > maxDim) {
    if (targetW > targetH) {
      targetH = Math.round((targetH * maxDim) / targetW);
      targetW = maxDim;
    } else {
      targetW = Math.round((targetW * maxDim) / targetH);
      targetH = maxDim;
    }
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    // Fill with white first so transparent PNGs don't become black
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);

    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      bitmap.close?.();
    } else if (imgObj) {
      ctx.drawImage(imgObj, 0, 0, targetW, targetH);
    }

    const resizedBlob = await new Promise((res) => {
      canvas.toBlob(res, 'image/jpeg', 0.85);
    });

    if (resizedBlob && resizedBlob.size > 0 && resizedBlob.size < file.size) {
      return resizedBlob;
    }
    return file;
  } catch {
    if (bitmap) bitmap.close?.();
    return file;
  }
}

// 5 Examples for UPI tool
const UPI_EXAMPLES = [
  {
    id: 'upi-1',
    label: 'QR code to receive Rs 500 cashback',
    type: 'scam',
    text: 'Scan this QR code in Google Pay or PhonePe to instantly receive your Rs 500 approved cashback into your bank account. Enter your UPI PIN to claim.',
    hasScreenshot: true,
    screenshotPath: '/examples/upi-scam.png',
    thumbLabel: 'Lure QR'
  },
  {
    id: 'upi-2',
    label: 'Pay Rs 99 registration fee to start work',
    type: 'scam',
    text: 'Congratulations! You are selected for the data review role. Pay Rs 99 one-time registration and verification fee to hr-onboard@icici to receive appointment letter.'
  },
  {
    id: 'upi-3',
    label: 'Sent Rs 2000 by mistake, please send back to upi@id',
    type: 'scam',
    text: 'Dear sir, I sent Rs 2000 to your Google Pay by mistake while paying rent. Please refund it immediately to my personal UPI ID refund-fast@oksbi.'
  },
  {
    id: 'upi-4',
    label: 'Electricity bill unpaid, pay now or disconnected',
    type: 'scam',
    text: 'Dear consumer, your electricity power will be disconnected tonight at 9:30 PM by order because previous month bill is unpaid. Pay Rs 150 reconnect charge now via collect request.'
  },
  {
    id: 'upi-5',
    label: 'Dinner split, paid my Rs 350 to rahul@oksbi',
    type: 'safe',
    text: 'Hey! Paid my share of Rs 350 for last night dinner to rahul@oksbi. Thanks for organizing!',
    hasScreenshot: true,
    screenshotPath: '/examples/upi-safe.png',
    thumbLabel: 'Safe Split'
  }
];

// 5 Examples for Message tool
const MESSAGE_EXAMPLES = [
  {
    id: 'msg-1',
    label: 'Part-time job Rs 3000/day, like YouTube videos',
    type: 'scam',
    text: 'Earn Rs 3,000 to Rs 8,000 daily from home by liking YouTube videos and rating hotels. Daily payout via UPI. Contact telegram: @parttime_task to start immediately.',
    hasScreenshot: true,
    screenshotPath: '/examples/message-scam.png',
    thumbLabel: 'Job lure'
  },
  {
    id: 'msg-2',
    label: 'Bank KYC suspended, update at bit.ly/fake',
    type: 'scam',
    text: 'Dear SBI User, your NetBanking account will be blocked today due to expired KYC. Update your Pan and Aadhaar at http://bit.ly/sbi-kyc-update immediately.'
  },
  {
    id: 'msg-3',
    label: 'Customs parcel seized, pay clearance fee',
    type: 'scam',
    text: 'Delhi Customs Notice: A high-value courier parcel under your Aadhaar has been put on hold for illegal contraband. Connect on video call or pay Rs 14,500 clearance duty immediately to avoid arrest warrant.'
  },
  {
    id: 'msg-4',
    label: 'Lottery winner, contact admin on Telegram',
    type: 'scam',
    text: 'Congratulations! Your mobile number won Rs 25,00,000 in Kaun Banega Crorepati lucky draw. Contact manager Mr. Sharma on Telegram @kbc_winner to claim your prize money.'
  },
  {
    id: 'msg-5',
    label: 'OTP for your delivery is 482910. Do not share',
    type: 'safe',
    text: '482910 is your OTP for Flipkart delivery of package #OD8291. Share this OTP with the delivery agent only at the time of delivery. Do not share with anyone else.',
    hasScreenshot: true,
    screenshotPath: '/examples/message-safe.png',
    thumbLabel: 'Safe OTP'
  }
];

export function ToolDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();

  const tool = getToolBySlug(slug);

  // If slug is job or verify, redirect to primary routes
  useEffect(() => {
    if (slug === 'job-scam-check' || slug === 'job') {
      navigate('/tools/job-scam-check', { replace: true });
    } else if (slug === 'verify-proof' || slug === 'verify') {
      navigate('/verify', { replace: true });
    }
  }, [slug, navigate]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [quota, setQuota] = useState(null);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [quotaModalData, setQuotaModalData] = useState(null);

  // Screenshot flow state
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState(null);
  const [readability, setReadability] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const previewUrlRef = useRef(null);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  // Fetch quota on load and after checks
  const fetchQuota = useCallback(async () => {
    try {
      const data = await apiFetch('/api/quota');
      if (data && data.enabled) {
        setQuota(data);
      } else {
        setQuota(null);
      }
    } catch {
      setQuota(null);
    }
  }, []);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  // Handle Ctrl+V paste anywhere on the page for screenshot
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            handleScreenshotFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleScreenshotFile = async (file) => {
    setScreenshotError(null);
    setScreenshotLoading(true);
    setReadability(null);

    // Revoke previous preview
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    try {
      // Keep preview URL alive until explicit clear or replace
      const objectUrl = URL.createObjectURL(file);
      previewUrlRef.current = objectUrl;
      setScreenshotPreview(objectUrl);

      const processedBlob = await processScreenshot(file);

      const formData = new FormData();
      formData.append('image', processedBlob, 'screenshot.jpg');

      const res = await fetch('/api/extract-text', {
        method: 'POST',
        body: formData
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 503 || data?.code === 'AI_UNAVAILABLE') {
          throw new Error('Screenshot reading is not available right now. Paste the text instead.');
        }
        if (res.status === 400) {
          throw new Error(data?.error || 'Invalid screenshot. Please try another image.');
        }
        throw new Error(data?.error || 'Screenshot extraction failed.');
      }

      const returnedText = data?.text || '';
      const r = data?.readability || 'good';
      setReadability(r);
      setInput(returnedText);
      setError(null);
    } catch (err) {
      setScreenshotError(err.message || 'Could not process screenshot.');
    } finally {
      setScreenshotLoading(false);
    }
  };

  const handleRemoveScreenshot = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setScreenshotPreview(null);
    setScreenshotLoading(false);
    setScreenshotError(null);
    setReadability(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      handleScreenshotFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleScreenshotFile(e.target.files[0]);
    }
  };

  const handleExampleClick = (exampleText) => {
    setInput(exampleText);
    setError(null);
    setQuotaExceeded(false);
  };

  const handleLoadExampleScreenshot = async (imagePath, exampleText) => {
    try {
      setScreenshotLoading(true);
      setScreenshotError(null);
      const res = await fetch(imagePath);
      if (!res.ok) throw new Error('Could not load example image.');
      const blob = await res.blob();
      const file = new File([blob], imagePath.split('/').pop(), { type: 'image/png' });
      await handleScreenshotFile(file);
    } catch {
      handleExampleClick(exampleText);
      setScreenshotLoading(false);
    }
  };

  const handleClear = () => {
    setInput('');
    setError(null);
    setResult(null);
    setQuotaExceeded(false);
    handleRemoveScreenshot();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input || input.trim().length < 10 || loading) return;

    setError(null);
    setQuotaExceeded(false);
    setLoading(true);
    setResult(null);

    try {
      const data = await apiFetch('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({
          input: input.trim(),
          kind: tool?.kind || 'auto'
        })
      });

      if (!data) {
        throw new Error('No data received from analysis service.');
      }
      setResult(data);
      triggerUsageRefresh();
      fetchQuota();
    } catch (err) {
      if (err?.code === 'QUOTA_EXCEEDED' || (err?.status === 429 && (err?.data?.error === 'quota_exceeded' || err?.data?.code === 'QUOTA_EXCEEDED'))) {
        setQuotaExceeded(true);
        setQuotaModalData(err.data);
        setIsQuotaModalOpen(true);
      } else if (err?.code === 'QUOTA_EXCEEDED' || err?.status === 429) {
        setQuotaExceeded(true);
        setError(err.message || 'You have reached the free check limit.');
      } else {
        setError(err?.message || 'Analysis failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isUPI = tool?.kind === 'upi';
  const examplesList = isUPI ? UPI_EXAMPLES : MESSAGE_EXAMPLES;

  return (
    <PageTransition>
      <div className="tool-detail-page">
        <Container>
          {/* Top Bar with Back Link & Title */}
          <div className="tool-detail-topbar">
            <div className="tool-topbar-left">
              <Link to="/tools" className="tool-back-link" aria-label="Back to all tools">
                <ArrowLeft size={16} aria-hidden="true" />
                <span>All tools</span>
              </Link>
              <div className="tool-meta-kicker-row">
                <span className="tool-kicker">Security Tool</span>
                <span className="tool-pill-disclaimer">Screening aid, not a legal finding</span>
              </div>
              <h1 className="tool-page-title">{tool?.name || 'Security Check'}</h1>
              <p className="tool-page-desc">
                {tool?.line || 'Screen messages and transactions using multi-rule verification.'}
              </p>
            </div>

            <UsagePill variant="tool" />
          </div>

          {/* 2-Column Desktop Layout (Left = Input & Examples, Right = Pre-check / Result) */}
          <div className="tool-two-col-layout">
            {/* LEFT COLUMN: Input, Screenshot, and Examples */}
            <div className="tool-col-left">
              <div className="scan-card tool-input-card">
                <div className="tool-card-head">
                  <h2 className="tool-card-title">
                    {isUPI ? 'Check payment request or UPI message' : 'Scan suspicious message'}
                  </h2>
                  <p className="tool-card-sub">
                    Paste text or upload a screenshot to extract and screen.
                  </p>
                </div>

                {/* Screenshot Upload Dropzone */}
                <div
                  className={`tool-dropzone ${isDragOver ? 'drag-over' : ''} ${
                    screenshotPreview ? 'has-preview' : ''
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !screenshotPreview && fileInputRef.current?.click()}
                  role="button"
                  tabIndex={screenshotPreview ? -1 : 0}
                  onKeyDown={(e) => {
                    if (!screenshotPreview && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  aria-label="Upload or drop image screenshot"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                  />

                  {screenshotLoading ? (
                    <div className="dropzone-loading">
                      <div className="spinner" aria-hidden="true" />
                      <span>Extracting text with Gemini vision OCR\u2026</span>
                    </div>
                  ) : screenshotPreview ? (
                    <div className="screenshot-preview-container" onClick={(e) => e.stopPropagation()}>
                      <div className="preview-img-wrap">
                        <img
                          src={screenshotPreview}
                          alt="Uploaded screenshot preview"
                          className="screenshot-thumb"
                        />
                        <button
                          type="button"
                          className="btn-remove-screenshot"
                          onClick={handleRemoveScreenshot}
                          title="Remove screenshot"
                          aria-label="Remove screenshot"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="preview-meta">
                        <span className="preview-status-pill">
                          <CheckCircle2 size={13} color="#12805C" aria-hidden="true" />
                          <span>Image read: {readability || 'good'}</span>
                        </span>
                        <span className="preview-tip">You can edit the extracted text below.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="dropzone-idle">
                      <div className="dropzone-icon" aria-hidden="true">
                        <Upload size={22} color="#4DA3FF" strokeWidth={1.75} />
                      </div>
                      <div className="dropzone-text">
                        <strong>Upload or drop a screenshot</strong>
                        <span>PNG, JPG or WEBP (or press Ctrl+V to paste)</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Inline Screenshot Error */}
                {screenshotError && (
                  <div className="tool-inline-error" role="alert">
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
                    <span>{screenshotError}</span>
                  </div>
                )}

                {/* Main Form */}
                <form onSubmit={handleSubmit} className="tool-main-form">
                  <div className="tool-textarea-wrap">
                    <label htmlFor="tool-input-textarea" className="tool-label">
                      {isUPI ? 'Payment message, collect request, or UPI ID' : 'Message text'}
                    </label>
                    <textarea
                      id="tool-input-textarea"
                      className="tool-textarea"
                      rows={5}
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        setError(null);
                      }}
                      placeholder={
                        isUPI
                          ? 'Paste Google Pay / PhonePe message, UPI ID, or collect request text\u2026'
                          : 'Paste SMS, WhatsApp, Telegram, or email content here\u2026'
                      }
                      required
                    />
                    <div className="tool-input-foot">
                      <span>{input.length} characters</span>
                      {input.length > 0 && (
                        <button type="button" className="btn-clear-input" onClick={handleClear}>
                          <RotateCcw size={12} style={{ marginRight: '4px' }} />
                          <span>Clear</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* General Error or Quota Alert */}
                  {error && (
                    <div className="tool-error-alert" role="alert">
                      <AlertTriangle size={16} style={{ flexShrink: 0 }} aria-hidden="true" />
                      <div>
                        <strong>{quotaExceeded ? 'Quota Exceeded' : 'Screening Notice'}</strong>
                        <p>{error}</p>
                        {quotaExceeded && (
                          <div style={{ marginTop: '8px' }}>
                            <Link to="/pricing" className="btn-upgrade-quota">
                              View upgrade options
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="tool-action-row">
                    <button
                      type="submit"
                      disabled={loading || input.trim().length < 10}
                      className="btn-tool-submit"
                    >
                      {loading ? (
                        <>
                          <div className="spinner-sm" aria-hidden="true" />
                          <span>Analyzing evidence\u2026</span>
                        </>
                      ) : (
                        <span>{isUPI ? 'Check payment request' : 'Scan message'}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* 5 Example Chips Card */}
              <div className="scan-card tool-examples-card">
                <div className="examples-header">
                  <Sparkles size={16} color="#4DA3FF" aria-hidden="true" />
                  <h3>Try an example</h3>
                </div>
                <p className="examples-sub">Click to load realistic test scenarios into the scanner:</p>

                <div className="examples-list" role="list">
                  {examplesList.map((ex) => (
                    <div key={ex.id} className="example-item-box" role="listitem">
                      <button
                        type="button"
                        className="example-text-btn"
                        onClick={() => handleExampleClick(ex.text)}
                      >
                        <span className={`example-tag ${ex.type === 'safe' ? 'tag-safe' : 'tag-scam'}`}>
                          {ex.type === 'safe' ? 'Safe' : 'Scam'}
                        </span>
                        <span className="example-label">{ex.label}</span>
                      </button>

                      {ex.hasScreenshot && (
                        <button
                          type="button"
                          className="btn-try-screenshot"
                          onClick={() => handleLoadExampleScreenshot(ex.screenshotPath, ex.text)}
                          title={`Test with real screenshot (${ex.thumbLabel})`}
                          aria-label={`Test with screenshot for ${ex.label}`}
                        >
                          <ImageIcon size={13} aria-hidden="true" />
                          <span>Try screenshot</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Empty State ("What you will get") OR Full Result */}
            <div className="tool-col-right">
              {loading ? (
                <div className="scan-card tool-loading-card" role="status" aria-live="polite">
                  <div className="spinner" aria-hidden="true" />
                  <h3>Running live multi-rule verification\u2026</h3>
                  <p>Evaluating payment patterns, threat feeds, and Gemini reasoning.</p>
                </div>
              ) : result ? (
                <ToolResult
                  result={result}
                  originalInput={input}
                  toolKind={tool?.kind || 'message'}
                />
              ) : (
                <div className="scan-card tool-precheck-card" role="region" aria-label="What you will get">
                  <div className="tool-precheck-header">
                    <div className="tool-precheck-icon-wrap" aria-hidden="true">
                      <Shield size={24} color="#4DA3FF" strokeWidth={1.75} />
                    </div>
                    <div>
                      <h3 className="tool-precheck-title">What you will get</h3>
                      <p className="tool-precheck-subtitle">
                        Independent public evidence before you reply or transfer money.
                      </p>
                    </div>
                  </div>

                  <div className="tool-precheck-list">
                    <div className="tool-precheck-item">
                      <div className="tool-precheck-bullet" aria-hidden="true">
                        <CheckCircle2 size={16} color="var(--risk-ok-text, #4ADE80)" />
                      </div>
                      <div>
                        <strong>Calculated Risk Score &amp; Level</strong>
                        <p>Overall verdict (Low, Medium, High, or Unable to verify) with confidence score.</p>
                      </div>
                    </div>

                    <div className="tool-precheck-item">
                      <div className="tool-precheck-bullet" aria-hidden="true">
                        <CheckCircle2 size={16} color="var(--risk-ok-text, #4ADE80)" />
                      </div>
                      <div>
                        <strong>5 Specific Named Checks</strong>
                        <p>Request pattern, payment instructions, handles, threat intelligence, and pressure tactics.</p>
                      </div>
                    </div>

                    <div className="tool-precheck-item">
                      <div className="tool-precheck-bullet" aria-hidden="true">
                        <CheckCircle2 size={16} color="var(--risk-ok-text, #4ADE80)" />
                      </div>
                      <div>
                        <strong>Suspicious Phrases Highlighted</strong>
                        <p>Exact words flagged in your text with numbered badges and pattern explanations.</p>
                      </div>
                    </div>

                    <div className="tool-precheck-item">
                      <div className="tool-precheck-bullet" aria-hidden="true">
                        <CheckCircle2 size={16} color="var(--risk-ok-text, #4ADE80)" />
                      </div>
                      <div>
                        <strong>Verifiable Proof Receipt</strong>
                        <p>Tamper-evident Proof ID, audit hash, downloadable JSON receipt, and PDF export.</p>
                      </div>
                    </div>
                  </div>

                  <div className="tool-precheck-tip">
                    <p>Paste text or click an example on the left to start screening.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Container>
        <QuotaExceededModal
          isOpen={isQuotaModalOpen}
          onClose={() => setIsQuotaModalOpen(false)}
          data={quotaModalData}
        />
      </div>
    </PageTransition>
  );
}

export default ToolDetail;
