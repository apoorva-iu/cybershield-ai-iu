import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, X, RefreshCw, Trash2, FileText } from 'lucide-react';

export function MessageThumbnail({
  sourceCanvas,
  name,
  size,
  readability,
  index = 0,
  total = 1,
  onOpenViewer,
  onRemove
}) {
  const thumbRef = useRef(null);

  useEffect(() => {
    if (!thumbRef.current || !sourceCanvas) return;
    const dest = thumbRef.current;
    dest.width = 96;
    dest.height = 96;
    const ctx = dest.getContext('2d');
    ctx.clearRect(0, 0, 96, 96);

    // Center crop / cover draw
    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;
    const scale = Math.max(96 / sw, 96 / sh);
    const nw = sw * scale;
    const nh = sh * scale;
    const ox = (96 - nw) / 2;
    const oy = (96 - nh) / 2;

    ctx.drawImage(sourceCanvas, 0, 0, sw, sh, ox, oy, nw, nh);
  }, [sourceCanvas]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenViewer?.();
    }
  };

  const badgeClass =
    readability === 'good'
      ? 'msg-readability-good'
      : readability === 'poor'
      ? 'msg-readability-poor'
      : 'msg-readability-none';

  return (
    <div className="msg-thumb-card">
      <div
        className="msg-thumb-preview"
        tabIndex={0}
        role="button"
        aria-label={`View uploaded screenshot ${name}. Press Enter to view full size.`}
        onClick={onOpenViewer}
        onKeyDown={handleKeyDown}
      >
        <canvas ref={thumbRef} className="msg-thumb-canvas" width={96} height={96} />
        <div className="msg-thumb-overlay" aria-hidden="true">
          <ZoomIn size={18} strokeWidth={2} />
        </div>
      </div>

      <div className="msg-thumb-meta">
        <div className="msg-thumb-title" title={name}>
          {total > 1 ? `#${index + 1} ` : ''}{name}
        </div>
        <div className="msg-thumb-info">
          <span className="msg-thumb-size">{size}</span>
          {readability && (
            <span className={`msg-readability-chip ${badgeClass}`}>
              {readability === 'good' ? 'Clear text' : readability === 'poor' ? 'Low clarity' : 'No text'}
            </span>
          )}
        </div>
        <button
          type="button"
          className="msg-btn-text-danger"
          onClick={onRemove}
          aria-label={`Remove screenshot ${name}`}
        >
          <Trash2 size={13} strokeWidth={1.75} />
          Remove
        </button>
      </div>
    </div>
  );
}

export function ImageViewerDialog({
  isOpen,
  onClose,
  sourceCanvas,
  name,
  extractedText,
  onReplace,
  onRemove
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const modalRef = useRef(null);
  const firstFocusRef = useRef(null);

  // Reset view
  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Zoom helpers
  const handleZoomIn = () => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)));
  const handleZoomOut = () => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)));

  // Wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom(z => Math.min(4, Math.max(0.5, +(z + delta).toFixed(2))));
  };

  // Mouse pan
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Redraw canvas whenever zoom, pan, or source changes
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !sourceCanvas) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const container = containerRef.current;
    if (!container) return;

    const cw = container.clientWidth || 600;
    const ch = container.clientHeight || 500;
    canvas.width = cw;
    canvas.height = ch;

    ctx.clearRect(0, 0, cw, ch);

    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;
    const fitScale = Math.min((cw * 0.92) / sw, (ch * 0.92) / sh);
    const finalScale = fitScale * zoom;

    const dw = sw * finalScale;
    const dh = sh * finalScale;
    const dx = (cw - dw) / 2 + pan.x;
    const dy = (ch - dh) / 2 + pan.y;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, sw, sh, dx, dy, dw, dh);
  }, [isOpen, zoom, pan, sourceCanvas]);

  // Focus trap and Escape listener
  useEffect(() => {
    if (!isOpen) return;

    handleReset();
    const prevActive = document.activeElement;

    // Focus close button initially
    const timer = setTimeout(() => {
      firstFocusRef.current?.focus();
    }, 50);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (prevActive?.focus) prevActive.focus();
    };
  }, [isOpen, onClose, handleReset]);

  if (!isOpen) return null;

  return (
    <div
      className="msg-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Your uploaded screenshot"
      onClick={onClose}
    >
      <div
        className="msg-modal-window"
        ref={modalRef}
        onClick={e => e.stopPropagation()}
      >
        <div className="msg-modal-header">
          <div className="msg-modal-header-left">
            <span className="msg-modal-kicker">Screenshot Preview</span>
            <h3 className="msg-modal-title" title={name}>{name}</h3>
          </div>
          <div className="msg-modal-header-actions">
            {onReplace && (
              <button
                type="button"
                className="msg-btn-subtle"
                onClick={() => { onClose(); onReplace(); }}
                title="Upload a different screenshot"
              >
                <RefreshCw size={15} strokeWidth={1.75} />
                <span>Replace</span>
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                className="msg-btn-subtle msg-danger"
                onClick={() => { onClose(); onRemove(); }}
                title="Remove this screenshot"
              >
                <Trash2 size={15} strokeWidth={1.75} />
                <span>Remove</span>
              </button>
            )}
            <button
              ref={firstFocusRef}
              type="button"
              className="msg-modal-close"
              onClick={onClose}
              aria-label="Close screenshot viewer"
            >
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="msg-modal-body">
          {/* Main interactive canvas viewport */}
          <div
            className={`msg-modal-viewport ${isDragging ? 'is-dragging' : ''}`}
            ref={containerRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <canvas
              ref={canvasRef}
              className="msg-modal-canvas"
              aria-label="Your uploaded screenshot"
            />

            {/* Floating zoom controls */}
            <div className="msg-modal-zoom-bar">
              <button
                type="button"
                className="msg-zoom-btn"
                onClick={handleZoomIn}
                aria-label="Zoom in"
                title="Zoom in"
              >
                <ZoomIn size={16} strokeWidth={1.75} />
              </button>
              <span className="msg-zoom-level" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className="msg-zoom-btn"
                onClick={handleZoomOut}
                aria-label="Zoom out"
                title="Zoom out"
              >
                <ZoomOut size={16} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="msg-zoom-btn"
                onClick={handleReset}
                aria-label="Fit to window"
                title="Fit to window"
              >
                <Maximize2 size={15} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Desktop side panel showing extracted text */}
          {extractedText && (
            <div className="msg-modal-extracted-side">
              <div className="msg-extracted-side-head">
                <FileText size={16} strokeWidth={1.75} />
                <span>Extracted text</span>
              </div>
              <div className="msg-extracted-side-content">
                <pre>{extractedText}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

