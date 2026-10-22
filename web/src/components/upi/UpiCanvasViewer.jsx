import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, X, RefreshCw, Trash2, FileText } from 'lucide-react';

export function UpiThumbnail({
  sourceCanvas,
  name,
  size,
  readability,
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
      ? 'upi-readability-good'
      : readability === 'poor'
      ? 'upi-readability-poor'
      : 'upi-readability-none';

  return (
    <div className="upi-thumb-card">
      <div
        className="upi-thumb-preview"
        tabIndex={0}
        role="button"
        aria-label={`View uploaded screenshot ${name}. Press Enter to view full size.`}
        onClick={onOpenViewer}
        onKeyDown={handleKeyDown}
      >
        <canvas ref={thumbRef} className="upi-thumb-canvas" width={96} height={96} />
        <div className="upi-thumb-overlay" aria-hidden="true">
          <ZoomIn size={18} strokeWidth={2} />
        </div>
      </div>

      <div className="upi-thumb-meta">
        <div className="upi-thumb-title" title={name}>{name}</div>
        <div className="upi-thumb-info">
          <span className="upi-thumb-size">{size}</span>
          {readability && (
            <span className={`upi-readability-chip ${badgeClass}`}>
              {readability === 'good' ? 'Clear text' : readability === 'poor' ? 'Low clarity' : 'No text'}
            </span>
          )}
        </div>
        <button
          type="button"
          className="upi-btn-text-danger"
          onClick={onRemove}
          aria-label="Remove screenshot"
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
      className="upi-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Your uploaded screenshot"
      onClick={onClose}
    >
      <div
        className="upi-modal-window"
        ref={modalRef}
        onClick={e => e.stopPropagation()}
      >
        <div className="upi-modal-header">
          <div className="upi-modal-header-left">
            <span className="upi-modal-kicker">Screenshot Preview</span>
            <h3 className="upi-modal-title" title={name}>{name}</h3>
          </div>
          <div className="upi-modal-header-actions">
            {onReplace && (
              <button
                type="button"
                className="upi-btn-subtle"
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
                className="upi-btn-subtle upi-danger"
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
              className="upi-modal-close"
              onClick={onClose}
              aria-label="Close screenshot viewer"
            >
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="upi-modal-body">
          {/* Main interactive canvas viewport */}
          <div
            className={`upi-modal-viewport ${isDragging ? 'is-dragging' : ''}`}
            ref={containerRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <canvas
              ref={canvasRef}
              className="upi-modal-canvas"
              aria-label="Your uploaded screenshot"
            />

            {/* Floating zoom controls */}
            <div className="upi-modal-zoom-bar">
              <button
                type="button"
                className="upi-zoom-btn"
                onClick={handleZoomIn}
                aria-label="Zoom in"
                title="Zoom in"
              >
                <ZoomIn size={16} strokeWidth={1.75} />
              </button>
              <span className="upi-zoom-level" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className="upi-zoom-btn"
                onClick={handleZoomOut}
                aria-label="Zoom out"
                title="Zoom out"
              >
                <ZoomOut size={16} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="upi-zoom-btn"
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
            <div className="upi-modal-extracted-side">
              <div className="upi-extracted-side-head">
                <FileText size={16} strokeWidth={1.75} />
                <span>Extracted text</span>
              </div>
              <div className="upi-extracted-side-content">
                <pre>{extractedText}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

