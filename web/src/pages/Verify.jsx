import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  AlertCircle,
  UploadCloud,
  FileCode,
  Hash,
  Clipboard,
  Trash2,
  ShieldCheck,
  Info,
  RotateCcw,
  ArrowRight,
  Lock
} from 'lucide-react';
import { apiFetch } from '../api';
import { Container } from '../components/ui';
import { PageTransition } from '../components/wow';
import '../verify.css';

const SL = { ok: 'Looks fine', warn: 'Warning', bad: 'High risk', unknown: 'Unable to verify' };

export function Verify() {
  const [bcMode, setBcMode] = useState('file'); // 'file', 'code', or 'hash'
  const [bcUploadedReceipt, setBcUploadedReceipt] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(null);
  const [form, setForm] = useState({ proofIdHash: '', blockHash: '', proofIdCode: '', accessCode: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);
  const tabReceiptRef = useRef(null);
  const tabHashRef = useRef(null);
  const dropZoneRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();

  // Deep-link check for ?proof=xxx&hash=xxx or ?proof=xxx&code=xxx
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const pId = params.get('proof');
    const bHash = params.get('hash');
    const bCode = params.get('code');

    if (pId) {
      if (bCode) {
        setBcMode('code');
        setForm(f => ({ ...f, proofIdCode: pId, accessCode: bCode }));
        runVerification('code', { proofIdCode: pId, accessCode: bCode });
      } else if (bHash) {
        setBcMode('hash');
        setForm(f => ({ ...f, proofIdHash: pId, blockHash: bHash }));
        runVerification('hash', { proofIdHash: pId, blockHash: bHash });
      }
    }
  }, [location.search]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setForm(prev => ({ ...prev, [id]: value }));
  };

  const handlePaste = async (field) => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setForm(prev => ({ ...prev, [field]: text.trim() }));
        }
      }
    } catch {
      // Clipboard access denied or unavailable
    }
  };

  const handleClear = () => {
    setForm({ proofIdHash: '', blockHash: '', proofIdCode: '', accessCode: '' });
    setBcUploadedReceipt(null);
    setFileName('');
    setFileSize(null);
    setError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json') && file.type && file.type !== 'application/json') {
      setError('Please select a valid receipt .json file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Not a JSON object');
        }
        setBcUploadedReceipt(parsed);
        setFileName(file.name);
        setFileSize(file.size);
        setError(null);
      } catch {
        setError('Invalid file: Could not parse receipt JSON.');
        setBcUploadedReceipt(null);
        setFileName('');
        setFileSize(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setError('Could not read the selected file.');
    };
    reader.readAsText(file);
  };

  const handleRemoveFile = (e) => {
    e.stopPropagation();
    setBcUploadedReceipt(null);
    setFileName('');
    setFileSize(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (dropZoneRef.current) dropZoneRef.current.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    if (dropZoneRef.current) dropZoneRef.current.classList.add('dragover');
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    if (dropZoneRef.current) dropZoneRef.current.classList.remove('dragover');
  };

  const handleDropZoneKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleTabKeyDown = (e, currentTab) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentTab === 'receipt') {
        setBcMode('hash');
        setError(null);
        tabHashRef.current?.focus();
      } else {
        setBcMode('file');
        setError(null);
        tabReceiptRef.current?.focus();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentTab === 'hash') {
        setBcMode('file');
        setError(null);
        tabReceiptRef.current?.focus();
      } else {
        setBcMode('hash');
        setError(null);
        tabHashRef.current?.focus();
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      setBcMode('file');
      setError(null);
      tabReceiptRef.current?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setBcMode('hash');
      setError(null);
      tabHashRef.current?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runVerification(bcMode, form);
  };

  const runVerification = async (mode, currentForm) => {
    if (loading) return;
    setError(null);
    setResult(null);

    let payload = {};
    if (mode === 'hash') {
      const pid = currentForm?.proofIdHash?.trim();
      const hash = currentForm?.blockHash?.trim();
      if (!pid || !hash) {
        setError('Please enter both Proof ID and Block Hash.');
        return;
      }
      payload = { proofId: pid, hash };
    } else if (mode === 'code') {
      const pid = currentForm?.proofIdCode?.trim();
      const code = currentForm?.accessCode?.trim();
      if (!pid || !code) {
        setError('Please enter both Proof ID and Access Code.');
        return;
      }
      payload = { proofId: pid, accessCode: code };
    } else if (mode === 'file') {
      if (!bcUploadedReceipt) {
        setError('Please select a receipt file first.');
        return;
      }
      const receiptToSend = { ...bcUploadedReceipt };
      if (currentForm?.accessCode?.trim()) {
        receiptToSend.accessCode = currentForm.accessCode.trim();
      }
      payload = { receipt: receiptToSend };
    }

    setLoading(true);

    try {
      const d = await apiFetch('/api/proof/verify', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setResult(d);
    } catch (x) {
      setError(x?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const isReceiptTab = bcMode === 'file' || bcMode === 'code';

  const proofIdHashInvalid =
    form.proofIdHash.trim().length > 0 &&
    !form.proofIdHash.trim().toUpperCase().startsWith('CS-');

  const proofIdCodeInvalid =
    form.proofIdCode.trim().length > 0 &&
    !form.proofIdCode.trim().toUpperCase().startsWith('CS-');

  return (
    <PageTransition>
      <div className="verify-page">
        <Container>
          <div className="verify-card-wrap">
            <div className="verify-card">
              <header className="verify-header">
                <h1 className="verify-title">Verify a report</h1>
                <p className="verify-subtitle">
                  Check that a Cyber Shield result was never changed. Works for job, UPI and message results.
                </p>
              </header>

              {!result ? (
                <>
                  {/* Segmented Control Method Switcher */}
                  <div
                    className="verify-segmented-control"
                    role="tablist"
                    aria-label="Verification method"
                  >
                    <button
                      ref={tabReceiptRef}
                      type="button"
                      role="tab"
                      id="tab-receipt"
                      aria-selected={isReceiptTab}
                      aria-controls="panel-receipt"
                      tabIndex={isReceiptTab ? 0 : -1}
                      className={`verify-segment-btn ${isReceiptTab ? 'active' : ''}`}
                      onClick={() => {
                        setBcMode('file');
                        setError(null);
                      }}
                      onKeyDown={(e) => handleTabKeyDown(e, 'receipt')}
                    >
                      <FileCode size={16} aria-hidden="true" />
                      <span>Receipt file</span>
                    </button>
                    <button
                      ref={tabHashRef}
                      type="button"
                      role="tab"
                      id="tab-hash"
                      aria-selected={bcMode === 'hash'}
                      aria-controls="panel-hash"
                      tabIndex={bcMode === 'hash' ? 0 : -1}
                      className={`verify-segment-btn ${bcMode === 'hash' ? 'active' : ''}`}
                      onClick={() => {
                        setBcMode('hash');
                        setError(null);
                      }}
                      onKeyDown={(e) => handleTabKeyDown(e, 'hash')}
                    >
                      <Hash size={16} aria-hidden="true" />
                      <span>Proof ID and hash</span>
                    </button>
                  </div>

                  {/* One-line explanation of what it proves */}
                  <p className="verify-method-explanation">
                    {bcMode === 'hash'
                      ? 'Proves the record exists in the ledger and was not touched.'
                      : 'Proves the full report was not changed.'}
                  </p>

                  <form id="bc-form" autoComplete="off" onSubmit={handleSubmit}>
                    {/* Panel 1: Receipt File Mode */}
                    {bcMode === 'file' && (
                      <div id="panel-receipt" role="tabpanel" aria-labelledby="tab-receipt">
                        {!bcUploadedReceipt ? (
                          <div
                            ref={dropZoneRef}
                            className="verify-drop-zone"
                            role="button"
                            tabIndex={0}
                            aria-label="Drop receipt JSON file here or click to browse"
                            onClick={() => fileInputRef.current?.click()}
                            onKeyDown={handleDropZoneKeyDown}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                          >
                            <div className="verify-drop-content">
                              <UploadCloud size={36} className="verify-drop-icon" aria-hidden="true" />
                              <p className="verify-drop-prompt">
                                <strong>Click to choose a file</strong> or drag and drop here
                              </p>
                              <p className="verify-drop-hint">
                                Accepts your downloaded <code>.json</code> receipt file
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="verify-file-chip">
                            <div className="verify-file-info">
                              <FileCode size={24} className="verify-file-icon" aria-hidden="true" />
                              <div className="verify-file-meta">
                                <span className="verify-file-name" title={fileName}>{fileName}</span>
                                <span className="verify-file-size">{formatFileSize(fileSize)}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="verify-remove-file-btn"
                              onClick={handleRemoveFile}
                              aria-label="Remove uploaded receipt file"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              <span>Remove</span>
                            </button>
                          </div>
                        )}

                        <input
                          type="file"
                          id="bc-file"
                          ref={fileInputRef}
                          accept=".json,application/json"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleFile(e.target.files[0]);
                            }
                          }}
                        />

                        {/* Optional Access Code Field */}
                        <div className="verify-field-group">
                          <div className="verify-label-row">
                            <label htmlFor="accessCode" className="verify-label">
                              Access Code <span className="verify-optional-tag">(Optional)</span>
                            </label>
                          </div>
                          <div className="verify-input-wrap">
                            <input
                              id="accessCode"
                              type="text"
                              className="verify-input"
                              placeholder="e.g. 2EKR278DTD8P"
                              value={form.accessCode}
                              onChange={handleChange}
                              autoComplete="off"
                              spellCheck="false"
                            />
                            <button
                              type="button"
                              className="verify-paste-btn"
                              onClick={() => handlePaste('accessCode')}
                              aria-label="Paste Access Code"
                            >
                              <Clipboard size={12} aria-hidden="true" />
                              <span>Paste</span>
                            </button>
                          </div>
                          <p className="verify-hint">
                            Needed only if you want to check the receipt against the Access Code shown once after your check.
                          </p>
                        </div>

                        <div className="verify-submode-toggle">
                          <button
                            type="button"
                            className="verify-link-btn"
                            onClick={() => {
                              setBcMode('code');
                              setError(null);
                            }}
                          >
                            Or verify with Proof ID &amp; Access Code without receipt file &rarr;
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Panel 1b: Access Code Submode */}
                    {bcMode === 'code' && (
                      <div id="panel-code" role="tabpanel" aria-labelledby="tab-receipt">
                        <div className="verify-field-group">
                          <div className="verify-label-row">
                            <label htmlFor="proofIdCode" className="verify-label">
                              Proof ID
                            </label>
                          </div>
                          <div className="verify-input-wrap">
                            <input
                              id="proofIdCode"
                              type="text"
                              className={`verify-input ${proofIdCodeInvalid ? 'has-error' : ''}`}
                              placeholder="e.g. CS-8B3FA19D"
                              value={form.proofIdCode}
                              onChange={handleChange}
                              autoComplete="off"
                              spellCheck="false"
                            />
                            <button
                              type="button"
                              className="verify-paste-btn"
                              onClick={() => handlePaste('proofIdCode')}
                              aria-label="Paste Proof ID"
                            >
                              <Clipboard size={12} aria-hidden="true" />
                              <span>Paste</span>
                            </button>
                          </div>
                          {proofIdCodeInvalid && (
                            <p className="verify-field-error">
                              <AlertCircle size={13} aria-hidden="true" />
                              <span>Proof IDs start with CS- (e.g. CS-8B3FA19D)</span>
                            </p>
                          )}
                        </div>

                        <div className="verify-field-group">
                          <div className="verify-label-row">
                            <label htmlFor="accessCode" className="verify-label">
                              Access Code
                            </label>
                          </div>
                          <div className="verify-input-wrap">
                            <input
                              id="accessCode"
                              type="text"
                              className="verify-input"
                              placeholder="e.g. 2EKR278DTD8P"
                              value={form.accessCode}
                              onChange={handleChange}
                              autoComplete="off"
                              spellCheck="false"
                            />
                            <button
                              type="button"
                              className="verify-paste-btn"
                              onClick={() => handlePaste('accessCode')}
                              aria-label="Paste Access Code"
                            >
                              <Clipboard size={12} aria-hidden="true" />
                              <span>Paste</span>
                            </button>
                          </div>
                          <p className="verify-hint">
                            The one-time code displayed upon completing your scan.
                          </p>
                        </div>

                        <div className="verify-submode-toggle">
                          <button
                            type="button"
                            className="verify-link-btn"
                            onClick={() => {
                              setBcMode('file');
                              setError(null);
                            }}
                          >
                            &larr; Use receipt file instead
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Panel 2: Proof ID & Hash Mode */}
                    {bcMode === 'hash' && (
                      <div id="panel-hash" role="tabpanel" aria-labelledby="tab-hash">
                        <div className="verify-field-group">
                          <div className="verify-label-row">
                            <label htmlFor="proofIdHash" className="verify-label">
                              Proof ID
                            </label>
                          </div>
                          <div className="verify-input-wrap">
                            <input
                              id="proofIdHash"
                              type="text"
                              className={`verify-input ${proofIdHashInvalid ? 'has-error' : ''}`}
                              placeholder="e.g. CS-8B3FA19D"
                              value={form.proofIdHash}
                              onChange={handleChange}
                              autoComplete="off"
                              spellCheck="false"
                            />
                            <button
                              type="button"
                              className="verify-paste-btn"
                              onClick={() => handlePaste('proofIdHash')}
                              aria-label="Paste Proof ID"
                            >
                              <Clipboard size={12} aria-hidden="true" />
                              <span>Paste</span>
                            </button>
                          </div>
                          {proofIdHashInvalid && (
                            <p className="verify-field-error">
                              <AlertCircle size={13} aria-hidden="true" />
                              <span>Proof IDs start with CS- (e.g. CS-8B3FA19D)</span>
                            </p>
                          )}
                        </div>

                        <div className="verify-field-group">
                          <div className="verify-label-row">
                            <label htmlFor="blockHash" className="verify-label">
                              Block Hash
                            </label>
                          </div>
                          <div className="verify-input-wrap">
                            <input
                              id="blockHash"
                              type="text"
                              className="verify-input"
                              placeholder="e.g. 4f1a9b3c7d6e820d5718a901ff2b6c19c892ed0f4438b97d19a4..."
                              value={form.blockHash}
                              onChange={handleChange}
                              autoComplete="off"
                              spellCheck="false"
                            />
                            <button
                              type="button"
                              className="verify-paste-btn"
                              onClick={() => handlePaste('blockHash')}
                              aria-label="Paste Block Hash"
                            >
                              <Clipboard size={12} aria-hidden="true" />
                              <span>Paste</span>
                            </button>
                          </div>
                        </div>

                        {/* "Where do I find these?" Disclosure */}
                        <details className="verify-disclosure">
                          <summary>
                            <HelpCircle size={15} aria-hidden="true" />
                            <span>Where do I find these?</span>
                          </summary>
                          <div className="verify-disclosure-content">
                            <p>
                              You can find the Proof ID and Block Hash on the <strong>Proof tab</strong> of any Cyber Shield scan result, or inside your downloaded receipt <code>.json</code> file.
                            </p>
                          </div>
                        </details>
                      </div>
                    )}

                    {/* Error Banner with aria-live */}
                    {error && (
                      <div className="verify-error-box" role="alert" aria-live="polite">
                        <AlertCircle size={18} aria-hidden="true" />
                        <span>{error}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="verify-form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary verify-submit-btn"
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <span className="verify-btn-spinner" aria-hidden="true" />
                            <span>Verifying...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={16} aria-hidden="true" />
                            <span>Verify</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleClear}
                        disabled={loading}
                      >
                        Clear form
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                /* Verification Result View */
                <div aria-live="polite">
                  <BcReportView
                    result={result}
                    bcMode={bcMode}
                    bcUploadedReceipt={bcUploadedReceipt}
                    onReset={handleClear}
                  />
                </div>
              )}
            </div>
          </div>
        </Container>
      </div>
    </PageTransition>
  );
}

function BcReportView({ result: res, bcMode, bcUploadedReceipt, onReset }) {
  const status = res?.status;
  const summary = res?.summary || 'Unexpected answer from the server';
  const verifiedAt = res?.verifiedAt || null;
  const subject = res?.subject || null;
  const steps = Array.isArray(res?.steps) ? res.steps : [];
  const content = res?.content || null;
  const contentStatus = content?.status || null;
  const changedSections = Array.isArray(content?.changedSections) ? content.changedSections : [];
  const report = bcUploadedReceipt?.report || res?.report || null;
  const rawTool = subject?.tool || report?.tool;
  const toolName = rawTool
    ? rawTool === 'upi' || rawTool === 'upi-payment-check'
      ? 'UPI & Payment Check'
      : rawTool === 'message' || rawTool === 'message-scanner'
      ? 'Message Scanner'
      : rawTool === 'job' || rawTool === 'job-scam-check'
      ? 'Job Scam Check'
      : String(rawTool)
    : null;

  const STATUS_CONFIG = {
    intact: {
      class: 'status-intact',
      icon: CheckCircle2,
      title: 'Intact',
      explanation: 'Nothing was changed'
    },
    report_modified: {
      class: 'status-warn',
      icon: AlertTriangle,
      title: 'Report modified',
      explanation: 'The report was changed after it was issued'
    },
    ledger_altered: {
      class: 'status-bad',
      icon: XCircle,
      title: 'Ledger altered',
      explanation: 'The tamper-evident ledger was altered'
    },
    hash_mismatch: {
      class: 'status-warn',
      icon: AlertTriangle,
      title: 'Hash mismatch',
      explanation: 'This hash does not match that Proof ID'
    },
    not_found: {
      class: 'status-unknown',
      icon: HelpCircle,
      title: 'Not found',
      explanation: 'No matching record was found'
    }
  };

  const bannerConfig = STATUS_CONFIG[status] || {
    class: 'status-unknown',
    icon: HelpCircle,
    title: status ? String(status) : 'Verification report',
    explanation: 'Status evaluated'
  };

  const BannerIcon = bannerConfig.icon;

  const ALL_STEPS = [
    { id: 'a', title: 'Record found for this Proof ID' },
    { id: 'b', title: 'Provided hash matches stored record' },
    { id: 'c', title: 'Block hash matches contents' },
    { id: 'd', title: 'Proof-of-work meets difficulty' },
    { id: 'e', title: 'Links correctly to previous block' },
    { id: 'f', title: 'Subsequent blocks link correctly' },
    { id: 'g', title: 'Full chain is intact' },
    { id: 'h', title: 'Anchor status' }
  ];

  const expectedSteps = ALL_STEPS.filter(
    s => s.id !== 'b' || bcMode === 'hash' || steps.some(x => x?.id === 'b')
  );
  const extraSteps = steps.filter(s => s?.id && !expectedSteps.some(e => e.id === s.id));
  const displaySteps = [...expectedSteps, ...extraSteps];

  const hasSensitiveData = (data) => {
    if (!data || typeof data !== 'object') return false;
    try {
      const jsonStr = JSON.stringify(data);
      return /"accessCode"\s*:|"receipt"\s*:/i.test(jsonStr);
    } catch {
      return true;
    }
  };
  const showRawAnswer = Boolean(import.meta.env.DEV && !hasSensitiveData(res));

  return (
    <div className="verify-result-card">
      {/* 1. Prominent Status Banner (Words + Icon) */}
      <div className={`verify-status-banner ${bannerConfig.class}`}>
        <BannerIcon size={28} className="verify-banner-icon" aria-hidden="true" />
        <div className="verify-banner-body">
          <h2 className="verify-banner-title">{bannerConfig.title}</h2>
          <div className="verify-banner-explanation">{bannerConfig.explanation}</div>
          <p className="verify-banner-summary">{summary}</p>

          {/* Report Modified: List NAMES of changed sections only (never original values!) */}
          {status === 'report_modified' && changedSections.length > 0 && (
            <div className="verify-modified-sections">
              <div className="verify-modified-label">Modified sections:</div>
              <div className="verify-chips-row">
                {changedSections.map((sec, i) => (
                  <span key={i} className="verify-chip">
                    {sec}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Subject Summary Card */}
      {(subject || verifiedAt) && (
        <div className="verify-meta-card">
          {toolName && (
            <div className="verify-meta-item">
              <span className="verify-meta-label">Tool</span>
              <span className="verify-meta-val">{toolName}</span>
            </div>
          )}
          {subject?.proofId && (
            <div className="verify-meta-item">
              <span className="verify-meta-label">Proof ID</span>
              <span className="verify-meta-val mono">{subject.proofId}</span>
            </div>
          )}
          {subject?.timestamp && (
            <div className="verify-meta-item">
              <span className="verify-meta-label">Issued Date</span>
              <span className="verify-meta-val">
                {subject.timestamp.replace('T', ' ').slice(0, 19)} UTC
              </span>
            </div>
          )}
          {subject?.block != null && (
            <div className="verify-meta-item">
              <span className="verify-meta-label">Block</span>
              <span className="verify-meta-val mono">#{subject.block}</span>
            </div>
          )}
          {verifiedAt && (
            <div className="verify-meta-item">
              <span className="verify-meta-label">Verified At</span>
              <span className="verify-meta-val">
                {verifiedAt.replace('T', ' ').slice(0, 19)} UTC
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3. Vertical Stepper */}
      <div className="verify-stepper-wrap">
        <h3 className="verify-stepper-title">Verification Steps</h3>
        <div className="verify-stepper">
          {displaySteps.map((stepDef) => {
            const s = steps.find((x) => x?.id === stepDef.id);
            const isEvaluated = Boolean(s);
            const passed = s?.passed;
            const markerClass = !isEvaluated ? 'neutral' : passed ? 'passed' : 'failed';
            const badgeClass = !isEvaluated ? 'neutral' : passed ? 'passed' : 'failed';
            const badgeLabel = !isEvaluated ? 'Not evaluated' : passed ? 'Passed' : 'Failed';
            const title = s?.title || stepDef.title;
            const detail = s?.detail || 'Not evaluated';

            return (
              <div key={stepDef.id} className="verify-step-item">
                <div className={`verify-step-marker ${markerClass}`} aria-hidden="true">
                  {!isEvaluated ? '–' : passed ? '✓' : '✕'}
                </div>
                <div className="verify-step-content">
                  <div className="verify-step-header">
                    <span className="verify-step-name">{title}</span>
                    <span className={`verify-step-badge ${badgeClass}`}>{badgeLabel}</span>
                  </div>
                  <div className="verify-step-detail">{detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Report Checks (When verified from receipt) */}
      {contentStatus === 'verified' && report && Array.isArray(report.checks) && report.checks.length > 0 && (
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px', color: 'var(--text)' }}>
            Verified Report Contents
          </h3>
          <div className="report-grid">
            {report.checks.map((c, i) => {
              if (!c) return null;
              const state = c?.state || 'unknown';
              const scoreVal = typeof c?.score === 'number' ? Math.min(100, Math.max(0, c.score)) : null;
              const fillWidth = scoreVal == null ? 0 : Math.max(4, scoreVal);
              const findings = Array.isArray(c?.findings) ? c.findings : [];
              return (
                <div key={i} className="check">
                  <div className="chead">
                    <h3>{c?.title || c?.key || `Check ${i + 1}`}</h3>
                    <span className={`pill s-${state}`}>{SL[state] || state}</span>
                  </div>
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
                  <ul className="notes">
                    {findings.map((n, j) => (
                      <li key={j}>
                        <b className={`d-${n?.severity || n?.type || 'info'}`} />
                        <span>{n?.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. "What this proves and what it does not" Box */}
      <div className="verify-proves-box">
        <div className="verify-proves-header">
          <Info size={18} className="verify-proves-icon" aria-hidden="true" />
          <h4>What this proves and what it does not</h4>
        </div>
        <p>
          It proves this report is exactly what Cyber Shield issued. It does not prove that the person, message or payment in it is genuine or fraudulent.
        </p>
      </div>

      {/* 6. Action Buttons */}
      <div className="verify-result-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onReset}
        >
          <RotateCcw size={16} aria-hidden="true" />
          <span>Verify another</span>
        </button>

        <Link
          to="/tools"
          className="btn btn-secondary"
        >
          <span>Check something new</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {/* Dev Mode Raw Output */}
      {showRawAnswer && (
        <details className="raw-answer" style={{ marginTop: '16px' }}>
          <summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--text-dim)', fontWeight: 600 }}>
            Raw answer
          </summary>
          <pre style={{ marginTop: '12px', padding: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(res, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export default Verify;
