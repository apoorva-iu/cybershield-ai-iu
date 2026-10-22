// Cyber Shield Extension - Content Script
import { API_BASE } from '../config.js';
import { downloadReceipt } from '../shared/receipt-export.js';

(function() {
  // Never run on the Cyber Shield website itself
  try {
    const apiOrigin = new URL(API_BASE).origin;
    if (window.location.origin === apiOrigin) {
      return;
    }
  } catch (e) {}

  // Prevent duplicate injection
  if (document.getElementById('cybershield-extension-host')) {
    return;
  }

  // Create closed Shadow DOM host attached to documentElement
  const host = document.createElement('div');
  host.id = 'cybershield-extension-host';
  host.style.all = 'initial';
  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);

  // Inject Shadow DOM styles
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    :host {
      all: initial;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .cs-wrap {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      color: #FFFFFF;
      z-index: 2147483647;
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    }

    /* Selection Chip */
    .cs-chip {
      position: fixed;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #0B1220;
      color: #FFFFFF;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 20px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
      pointer-events: auto;
      transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
      user-select: none;
    }

    .cs-chip:hover {
      background: #101B2E;
      border-color: #4DA3FF;
      transform: translateY(-1px);
    }

    .cs-chip:focus-visible {
      outline: 2px solid #4DA3FF;
      outline-offset: 2px;
    }

    .cs-chip-icon {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    /* Verdict Bubble Dialog */
    .cs-bubble {
      position: fixed;
      width: 360px;
      max-height: 85vh;
      overflow-y: auto;
      background: #0B1220;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 12px;
      box-shadow: 0 10px 36px rgba(0, 0, 0, 0.7);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: auto;
      animation: csFadeIn 0.18s ease-out;
    }

    @keyframes csFadeIn {
      from { opacity: 0; transform: scale(0.97); }
      to { opacity: 1; transform: scale(1); }
    }

    .cs-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .cs-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #FFFFFF;
    }

    .cs-close-btn {
      background: transparent;
      border: none;
      color: #C9D3E3;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 4px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .cs-close-btn:hover {
      color: #FFFFFF;
      background: rgba(255, 255, 255, 0.08);
    }

    .cs-close-btn:focus-visible {
      outline: 2px solid #4DA3FF;
      outline-offset: 1px;
    }

    /* Ready State Styles */
    .cs-ready-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cs-prompt-label {
      font-size: 13px;
      font-weight: 600;
      color: #FFFFFF;
    }

    .cs-segment-control {
      display: flex;
      background: #05080F;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 3px;
      gap: 3px;
    }

    .cs-segment-btn {
      flex: 1;
      background: transparent;
      border: none;
      color: #94A3B8;
      padding: 7px 6px;
      font-size: 12px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
      transition: background 0.15s, color 0.15s;
      outline: none;
    }

    .cs-segment-btn:hover {
      color: #FFFFFF;
      background: rgba(255, 255, 255, 0.05);
    }

    .cs-segment-btn[aria-checked="true"] {
      background: #101B2E;
      color: #4DA3FF;
      font-weight: 600;
      border: 1px solid rgba(77, 163, 255, 0.35);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .cs-segment-btn:focus-visible {
      outline: 2px solid #4DA3FF;
      outline-offset: 1px;
    }

    .cs-hint-line {
      font-size: 11.5px;
      color: #94A3B8;
      line-height: 1.4;
    }

    .cs-textarea-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .cs-edit-textarea {
      width: 100%;
      min-height: 84px;
      max-height: 160px;
      resize: vertical;
      background: #05080F;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      padding: 8px 10px;
      font-family: inherit;
      font-size: 12px;
      line-height: 1.4;
      color: #FFFFFF;
      outline: none;
      transition: border-color 0.15s;
    }

    .cs-edit-textarea:focus {
      border-color: #4DA3FF;
      box-shadow: 0 0 0 1px #4DA3FF;
    }

    .cs-char-counter {
      font-size: 11px;
      color: #94A3B8;
      text-align: right;
    }

    /* Loading State */
    .cs-loading-wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 0;
    }

    .cs-loading-title {
      font-size: 14px;
      font-weight: 600;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cs-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-top-color: #4DA3FF;
      border-radius: 50%;
      animation: csSpin 0.8s linear infinite;
    }

    @keyframes csSpin {
      to { transform: rotate(360deg); }
    }

    .cs-loading-note {
      font-size: 12px;
      color: #C9D3E3;
      line-height: 1.4;
    }

    /* Verdict Result Card */
    .cs-verdict-card {
      background: #05080F;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-left: 4px solid var(--cs-risk-color, #12805C);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .cs-verdict-unable {
      border-left: 4px solid #64748B;
      background: #070B14;
    }

    .cs-level-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }

    .cs-badges-cluster {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .cs-level-pill {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--cs-risk-bg, rgba(18, 128, 92, 0.2));
      color: var(--cs-risk-color, #12805C);
    }

    .cs-pill-type {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      color: #E2E8F0;
    }

    .cs-pill-confidence {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(77, 163, 255, 0.12);
      color: #60A5FA;
      border: 1px solid rgba(77, 163, 255, 0.25);
    }

    .cs-score-val {
      font-size: 13px;
      font-weight: 600;
      color: #C9D3E3;
    }

    .cs-headline-title {
      font-size: 14px;
      font-weight: 700;
      color: #FFFFFF;
      line-height: 1.35;
    }

    .cs-headline-sub {
      font-size: 12px;
      color: #C9D3E3;
      line-height: 1.35;
    }

    /* Top Findings */
    .cs-findings-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .cs-section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #C9D3E3;
    }

    .cs-finding-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 12px;
      color: #FFFFFF;
      background: rgba(255, 255, 255, 0.03);
      padding: 6px 8px;
      border-radius: 6px;
    }

    .cs-finding-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      margin-top: 5px;
      flex-shrink: 0;
    }

    .cs-sev-bad { background: #C62828; }
    .cs-sev-warn { background: #B7791F; }
    .cs-sev-info, .cs-sev-ok { background: #12805C; }

    .cs-finding-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 3px;
      margin-right: 4px;
      display: inline-block;
    }

    .cs-badge-bad { background: rgba(198, 40, 40, 0.25); color: #F87171; border: 1px solid rgba(198, 40, 40, 0.4); }
    .cs-badge-warn { background: rgba(183, 121, 31, 0.25); color: #FBBF24; border: 1px solid rgba(183, 121, 31, 0.4); }
    .cs-badge-info { background: rgba(18, 128, 92, 0.25); color: #34D399; border: 1px solid rgba(18, 128, 92, 0.4); }

    /* Honest Line */
    .cs-honest-line {
      font-size: 12px;
      color: #C9D3E3;
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.03);
      border-left: 3px solid #4DA3FF;
      border-radius: 0 4px 4px 0;
      line-height: 1.4;
    }

    /* Proof ID Row */
    .cs-proof-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.03);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
    }

    .cs-proof-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #4DA3FF;
      font-weight: 600;
    }

    .cs-copy-btn {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #C9D3E3;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }

    .cs-copy-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #FFFFFF;
    }

    .cs-copy-btn:focus-visible {
      outline: 2px solid #4DA3FF;
    }

    /* Actions Grid */
    .cs-actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .cs-action-btn {
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 500;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: #101B2E;
      color: #FFFFFF;
      cursor: pointer;
      text-align: center;
      transition: background 0.15s, border-color 0.15s;
    }

    .cs-action-btn:hover {
      background: #182740;
      border-color: #4DA3FF;
    }

    .cs-action-btn:focus-visible {
      outline: 2px solid #4DA3FF;
      outline-offset: 1px;
    }

    .cs-action-btn-primary {
      background: #0A66C2;
      border-color: #0A66C2;
      grid-column: 1 / -1;
      font-weight: 600;
    }

    .cs-action-btn-primary:hover {
      background: #095196;
      border-color: #095196;
    }

    .cs-pdf-hint {
      grid-column: 1 / -1;
      font-size: 11px;
      color: #94A3B8;
      text-align: center;
      font-style: italic;
    }

    /* Collapsible What Was Sent */
    .cs-sent-details {
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      padding: 6px 10px;
      background: rgba(0, 0, 0, 0.2);
      font-size: 11px;
    }

    .cs-sent-summary {
      cursor: pointer;
      color: #C9D3E3;
      font-weight: 500;
      outline: none;
    }

    .cs-sent-summary:focus-visible {
      color: #4DA3FF;
    }

    .cs-sent-content {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: #94A3B8;
      word-break: break-all;
    }

    .cs-sent-field strong {
      color: #C9D3E3;
    }

    /* Error Box */
    .cs-err-box {
      background: rgba(198, 40, 40, 0.15);
      border: 1px solid rgba(198, 40, 40, 0.3);
      color: #FCA5A5;
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .cs-retry-btn {
      align-self: flex-start;
      background: #C62828;
      border: none;
      color: #FFFFFF;
      padding: 5px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .cs-retry-btn:hover {
      background: #991B1B;
    }

    /* Footer */
    .cs-footer {
      font-size: 11px;
      color: #94A3B8;
      text-align: center;
      padding-top: 4px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
  `;
  shadow.appendChild(styleEl);

  const container = document.createElement('div');
  container.className = 'cs-wrap';
  shadow.appendChild(container);

  let activeChip = null;
  let activeBubble = null;
  let currentSelectionText = '';
  let lastCheckedPayload = null;
  let activeBubblePos = { x: 40, y: 40 };

  function hideChip() {
    if (activeChip) {
      activeChip.remove();
      activeChip = null;
    }
  }

  function hideBubble() {
    if (activeBubble) {
      activeBubble.remove();
      activeBubble = null;
    }
  }

  function isInputOrEditable(node) {
    if (!node) return false;
    let curr = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (curr && curr !== document.documentElement) {
      const tag = curr.tagName ? curr.tagName.toLowerCase() : '';
      if (['input', 'textarea', 'select'].includes(tag)) return true;
      if (curr.isContentEditable) return true;
      if (curr.getAttribute && curr.getAttribute('contenteditable') === 'true') return true;
      curr = curr.parentElement;
    }
    return false;
  }

  function getCleanUrl() {
    try {
      const u = new URL(window.location.href);
      u.hash = '';
      const SENSITIVE_KEYS = /^(token|key|auth|session|sid|password|pass|secret|code)$/i;
      const toDelete = [];
      for (const k of u.searchParams.keys()) {
        if (SENSITIVE_KEYS.test(k)) {
          toDelete.push(k);
        }
      }
      for (const k of toDelete) {
        u.searchParams.delete(k);
      }
      return u.toString().slice(0, 2000);
    } catch (e) {
      return window.location.href.split('#')[0].slice(0, 2000);
    }
  }

  function getCompany() {
    const ogSite = document.querySelector('meta[property="og:site_name"]');
    if (ogSite && ogSite.content && ogSite.content.trim()) {
      return ogSite.content.trim().slice(0, 200);
    }
    return window.location.hostname.replace(/^www\./i, '').slice(0, 200);
  }

  function getEmail(text) {
    const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    if (emails.length === 1) {
      return emails[0].slice(0, 200);
    }
    return '';
  }

  function toBase64Url(str) {
    try {
      const b64 = btoa(unescape(encodeURIComponent(str)));
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
      return '';
    }
  }

  function handleSelectionCheck(e) {
    // If clicking inside extension UI, don't trigger
    if (e && e.target && host.contains(e.target)) {
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      hideChip();
      return;
    }

    const text = sel.toString().trim();
    if (text.length < 30) {
      hideChip();
      return;
    }

    // Check if selection is inside an editable field
    const anchor = sel.anchorNode;
    const focus = sel.focusNode;
    if (isInputOrEditable(anchor) || isInputOrEditable(focus)) {
      hideChip();
      return;
    }

    // Check enabled preference from chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['enabled'], (res) => {
        if (res.enabled === false) {
          hideChip();
          return;
        }
        showSelectionChip(sel, text);
      });
    } else {
      showSelectionChip(sel, text);
    }
  }

  function showSelectionChip(sel, text) {
    hideChip();
    currentSelectionText = text;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return;
    }

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cs-chip';
    chip.setAttribute('aria-label', 'Check the selected text with Cyber Shield');

    chip.innerHTML = `
      <svg class="cs-chip-icon" viewBox="0 0 100 100" fill="none">
        <rect width="100" height="100" rx="25" fill="#0A66C2" />
        <path d="M 50 20 L 76 28 C 76 54 64 69 50 80 C 36 69 24 54 24 28 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
        <path d="M 50 28 L 68 34 C 68 53 59 63 50 72 C 41 63 32 53 32 34 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
        <path d="M 50 37 L 60 41 C 60 52 55 58 50 63 C 45 58 40 52 40 41 Z" fill="#FFFFFF" />
      </svg>
      <span>Check this</span>
    `;

    // Position chip near selection end and keep inside viewport
    const chipWidth = 115;
    const chipHeight = 34;
    let left = rect.right + 6;
    let top = rect.bottom + 6;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left + chipWidth > vw - 12) left = Math.max(12, rect.right - chipWidth);
    if (top + chipHeight > vh - 12) top = Math.max(12, rect.top - chipHeight - 6);
    if (left < 12) left = 12;
    if (top < 12) top = 12;

    chip.style.left = `${Math.round(left)}px`;
    chip.style.top = `${Math.round(top)}px`;

    chip.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openReadyBubble(currentSelectionText, { x: left, y: top });
    });

    container.appendChild(chip);
    activeChip = chip;
  }

  // Opens the bubble in READY state: nothing is sent yet
  function openReadyBubble(initialText, pos) {
    hideChip();
    hideBubble();

    activeBubblePos = pos || { x: 40, y: 40 };

    // Get remembered last check type from storage (default: 'message')
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['lastCheckType'], (res) => {
        const checkType = res.lastCheckType || 'message';
        renderReadyBubble(initialText, activeBubblePos, checkType);
      });
    } else {
      renderReadyBubble(initialText, activeBubblePos, 'message');
    }
  }

  function renderReadyBubble(text, pos, selectedType) {
    hideBubble();

    const bubble = document.createElement('div');
    bubble.className = 'cs-bubble';
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-label', 'Check selected text');

    const bubbleWidth = 360;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = pos.x;
    let top = pos.y;
    if (left + bubbleWidth > vw - 16) left = Math.max(16, vw - bubbleWidth - 16);
    if (top + 340 > vh - 16) top = Math.max(16, vh - 360);
    if (left < 16) left = 16;
    if (top < 16) top = 16;

    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;

    let currentType = selectedType || 'message';
    let currentText = (text || '').slice(0, 20000);

    bubble.innerHTML = `
      <div class="cs-header">
        <div class="cs-brand">
          <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="25" fill="#0A66C2" />
            <path d="M 50 20 L 76 28 C 76 54 64 69 50 80 C 36 69 24 54 24 28 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
            <path d="M 50 28 L 68 34 C 68 53 59 63 50 72 C 41 63 32 53 32 34 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
            <path d="M 50 37 L 60 41 C 60 52 55 58 50 63 C 45 58 40 52 40 41 Z" fill="#FFFFFF" />
          </svg>
          <span>Cyber Shield</span>
        </div>
        <button type="button" class="cs-close-btn" aria-label="Close">&#x2715;</button>
      </div>

      <div class="cs-ready-section">
        <div class="cs-prompt-label">Check this text as:</div>

        <div class="cs-segment-control" role="radiogroup" aria-label="Check this text as">
          <button
            type="button"
            role="radio"
            class="cs-segment-btn"
            data-value="job"
            aria-checked="${currentType === 'job'}"
            tabindex="${currentType === 'job' ? '0' : '-1'}"
          >
            Job offer
          </button>
          <button
            type="button"
            role="radio"
            class="cs-segment-btn"
            data-value="upi"
            aria-checked="${currentType === 'upi'}"
            tabindex="${currentType === 'upi' ? '0' : '-1'}"
          >
            UPI or payment
          </button>
          <button
            type="button"
            role="radio"
            class="cs-segment-btn"
            data-value="message"
            aria-checked="${currentType === 'message'}"
            tabindex="${currentType === 'message' ? '0' : '-1'}"
          >
            Message
          </button>
        </div>

        <div class="cs-hint-line">Not sure? Message works for any text.</div>

        <div class="cs-textarea-container">
          <textarea
            class="cs-edit-textarea"
            maxlength="20000"
            aria-label="Text to check"
          >${escapeHtml(currentText)}</textarea>
          <div class="cs-char-counter">${currentText.length.toLocaleString()} / 20,000 characters</div>
        </div>

        <button type="button" class="cs-action-btn cs-action-btn-primary" id="cs-btn-check">
          Check
        </button>
      </div>

      <div class="cs-footer">Screening aid, not a legal finding.</div>
    `;

    // Close button
    bubble.querySelector('.cs-close-btn').addEventListener('click', hideBubble);

    const textarea = bubble.querySelector('.cs-edit-textarea');
    const counter = bubble.querySelector('.cs-char-counter');
    const segmentButtons = Array.from(bubble.querySelectorAll('.cs-segment-btn'));
    const checkBtn = bubble.querySelector('#cs-btn-check');

    // Textarea input event
    textarea.addEventListener('input', () => {
      currentText = textarea.value.slice(0, 20000);
      counter.textContent = `${currentText.length.toLocaleString()} / 20,000 characters`;
    });

    // Segmented radio control keyboard & click interaction
    function setType(newType) {
      currentType = newType;
      segmentButtons.forEach(btn => {
        const isMatch = btn.getAttribute('data-value') === newType;
        btn.setAttribute('aria-checked', String(isMatch));
        btn.setAttribute('tabindex', isMatch ? '0' : '-1');
      });
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ lastCheckType: newType });
      }
    }

    segmentButtons.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        setType(btn.getAttribute('data-value'));
      });

      btn.addEventListener('keydown', (e) => {
        let nextIndex = index;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          nextIndex = (index + 1) % segmentButtons.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          nextIndex = (index - 1 + segmentButtons.length) % segmentButtons.length;
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setType(btn.getAttribute('data-value'));
          return;
        } else {
          return;
        }
        segmentButtons[nextIndex].focus();
        setType(segmentButtons[nextIndex].getAttribute('data-value'));
      });
    });

    // Check button click
    checkBtn.addEventListener('click', () => {
      const trimmed = currentText.trim();
      if (trimmed.length < 10) {
        showBubbleError('Select a little more text (at least 10 characters).');
        return;
      }
      runCheckFlow(trimmed, currentType, pos);
    });

    container.appendChild(bubble);
    activeBubble = bubble;
    textarea.focus();
  }

  function runCheckFlow(text, checkType, pos) {
    const payload = {
      text,
      desc: text,
      url: getCleanUrl(),
      company: getCompany(),
      email: getEmail(text)
    };
    lastCheckedPayload = { text, checkType, payload };

    showBubbleLoading(pos);

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'CHECK', checkType, payload }, (res) => {
        if (!activeBubble) return;
        if (!res || !res.ok) {
          showBubbleError(res ? res.error : 'Could not reach Cyber Shield.');
        } else {
          showBubbleResult(res.data, checkType, payload);
        }
      });
    } else {
      showBubbleError('Extension runtime unavailable.');
    }
  }

  function showBubbleLoading(pos) {
    if (!activeBubble) return;

    activeBubble.innerHTML = `
      <div class="cs-header">
        <div class="cs-brand">
          <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="25" fill="#0A66C2" />
            <path d="M 50 20 L 76 28 C 76 54 64 69 50 80 C 36 69 24 54 24 28 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
            <path d="M 50 28 L 68 34 C 68 53 59 63 50 72 C 41 63 32 53 32 34 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
            <path d="M 50 37 L 60 41 C 60 52 55 58 50 63 C 45 58 40 52 40 41 Z" fill="#FFFFFF" />
          </svg>
          <span>Cyber Shield</span>
        </div>
        <button type="button" class="cs-close-btn" aria-label="Close">&#x2715;</button>
      </div>

      <div class="cs-loading-wrap">
        <div class="cs-loading-title">
          <div class="cs-spinner"></div>
          <span>Checking the evidence...</span>
        </div>
        <p class="cs-loading-note">Checks run in parallel with threat intel and verification services.</p>
      </div>

      <div class="cs-footer">Screening aid, not a legal finding.</div>
    `;

    activeBubble.querySelector('.cs-close-btn').addEventListener('click', hideBubble);
  }

  function showBubbleError(errorMsg) {
    if (!activeBubble) return;

    activeBubble.innerHTML = `
      <div class="cs-header">
        <div class="cs-brand">
          <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="25" fill="#0A66C2" />
            <path d="M 50 20 L 76 28 C 76 54 64 69 50 80 C 36 69 24 54 24 28 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
            <path d="M 50 28 L 68 34 C 68 53 59 63 50 72 C 41 63 32 53 32 34 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
            <path d="M 50 37 L 60 41 C 60 52 55 58 50 63 C 45 58 40 52 40 41 Z" fill="#FFFFFF" />
          </svg>
          <span>Cyber Shield</span>
        </div>
        <button type="button" class="cs-close-btn" aria-label="Close">&#x2715;</button>
      </div>

      <div class="cs-err-box" role="alert">
        <span>${escapeHtml(errorMsg)}</span>
        <button type="button" class="cs-retry-btn">Retry</button>
      </div>

      <div class="cs-footer">Screening aid, not a legal finding.</div>
    `;

    activeBubble.querySelector('.cs-close-btn').addEventListener('click', hideBubble);

    const retryBtn = activeBubble.querySelector('.cs-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (lastCheckedPayload) {
          runCheckFlow(lastCheckedPayload.text, lastCheckedPayload.checkType, activeBubblePos);
        } else {
          openReadyBubble('', activeBubblePos);
        }
      });
      retryBtn.focus();
    }
  }

  function formatScamTypeBadge(rawType) {
    if (!rawType || typeof rawType !== 'string') return '';
    const map = {
      fake_recruiter: 'Fake recruiter',
      job_scam: 'Job scam',
      advance_fee: 'Advance fee',
      fake_payment_proof: 'Fake payment proof',
      unverifiable_receipt: 'Unverifiable receipt',
      upi_collect_fraud: 'Collect request fraud',
      upi_pin_fraud: 'UPI PIN fraud',
      phishing: 'Phishing',
      kyc_fraud: 'KYC fraud',
      lottery_scam: 'Lottery / Reward scam',
      impersonation: 'Impersonation'
    };
    return map[rawType] || rawType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  function showBubbleResult(data, checkType, payload) {
    if (!activeBubble) return;

    const o = data.report ? (data.report.overall || {}) : {};
    const rawLevel = String(data.level || o.level || 'unable').toLowerCase();
    const isUnable = rawLevel === 'unable' || data.mode === 'ai_unavailable' || data.reason === 'ai_unavailable';

    // If level is "unable" or mode is "ai_unavailable", display friendly grey card with no score
    if (isUnable) {
      const sentence = data.message ||
        (Array.isArray(data.headline) ? (data.headline[1] || data.headline[0]) : data.headline) ||
        data.primaryConcern ||
        'We could not verify this text right now. Please try again or check the full report.';

      activeBubble.innerHTML = `
        <div class="cs-header">
          <div class="cs-brand">
            <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
              <rect width="100" height="100" rx="25" fill="#0A66C2" />
              <path d="M 50 20 L 76 28 C 76 54 64 69 50 80 C 36 69 24 54 24 28 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
              <path d="M 50 28 L 68 34 C 68 53 59 63 50 72 C 41 63 32 53 32 34 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
              <path d="M 50 37 L 60 41 C 60 52 55 58 50 63 C 45 58 40 52 40 41 Z" fill="#FFFFFF" />
            </svg>
            <span>Cyber Shield</span>
          </div>
          <button type="button" class="cs-close-btn" aria-label="Close">&#x2715;</button>
        </div>

        <div class="cs-verdict-card cs-verdict-unable" style="--cs-risk-color: #64748B; --cs-risk-bg: rgba(100, 116, 139, 0.2)">
          <div class="cs-level-row">
            <span class="cs-level-pill">Unable to verify</span>
          </div>
          <div class="cs-headline-title">${escapeHtml(sentence)}</div>
        </div>

        <div class="cs-actions-grid">
          <button type="button" class="cs-action-btn cs-action-btn-primary" id="cs-act-tryagain">Try again</button>
          <button type="button" class="cs-action-btn" id="cs-act-another">Check again</button>
        </div>

        <div class="cs-footer">Screening aid, not a legal finding.</div>
      `;

      activeBubble.querySelector('.cs-close-btn').addEventListener('click', hideBubble);

      activeBubble.querySelector('#cs-act-tryagain')?.addEventListener('click', () => {
        runCheckFlow(payload.text, checkType, activeBubblePos);
      });

      activeBubble.querySelector('#cs-act-another')?.addEventListener('click', () => {
        openReadyBubble(payload.text, activeBubblePos);
      });

      return;
    }

    // Normal verdict calculation from API only
    let levelLabel = 'Low risk';
    let riskColor = '#12805C';
    let riskBg = 'rgba(18, 128, 92, 0.2)';

    if (rawLevel === 'high' || rawLevel === 'bad' || rawLevel === 'critical') {
      levelLabel = 'High risk';
      riskColor = '#C62828';
      riskBg = 'rgba(198, 40, 40, 0.2)';
    } else if (rawLevel === 'medium' || rawLevel === 'warn' || rawLevel === 'med') {
      levelLabel = 'Medium risk';
      riskColor = '#B7791F';
      riskBg = 'rgba(183, 121, 31, 0.2)';
    }

    const rawScore = typeof data.score === 'number' ? data.score : (typeof data.riskScore === 'number' ? data.riskScore : (typeof o.score === 'number' ? o.score : null));
    const showScore = rawScore != null && !isNaN(rawScore) && !isUnable;

    // Confidence band formatting: taken ONLY from API's confidenceBand
    const rawBand = data.confidenceBand || (o && o.confidenceBand);
    let confidenceBandStr = null;
    if (typeof rawBand === 'string' && rawBand.trim()) {
      const b = rawBand.trim().toLowerCase();
      if (b === 'high') confidenceBandStr = 'High';
      else if (b === 'medium') confidenceBandStr = 'Medium';
      else if (b === 'low') confidenceBandStr = 'Low';
    }

    // Headline sentence
    let headlineSentence = '';
    if (Array.isArray(data.headline) && data.headline.length > 0) {
      headlineSentence = data.headline[1] || data.headline[0];
    } else if (typeof data.headline === 'string' && data.headline.trim()) {
      headlineSentence = data.headline.trim();
    } else {
      headlineSentence = data.primaryConcern || 'Check complete.';
    }

    // Scam Type
    const scamType = data.scamType || (data.report && data.report.scamType);
    const scamTypeBadge = formatScamTypeBadge(scamType);

    // Collect top 3 findings/phrases with clear text labels (not color alone)
    const topFindings = [];

    if (checkType === 'job') {
      const checks = (data.report && Array.isArray(data.report.checks)) ? data.report.checks : [];
      const allFindings = [];
      checks.forEach(c => {
        const arr = Array.isArray(c.findings) ? c.findings : [];
        arr.forEach(f => {
          allFindings.push({
            severity: f.severity || 'info',
            text: f.text || ''
          });
        });
      });
      const SEV_WEIGHT = { bad: 3, warn: 2, info: 1, ok: 0 };
      allFindings.sort((a, b) => (SEV_WEIGHT[b.severity] || 0) - (SEV_WEIGHT[a.severity] || 0));
      allFindings.slice(0, 3).forEach(f => {
        const sev = f.severity === 'bad' ? 'bad' : (f.severity === 'warn' ? 'warn' : 'info');
        const badgeLabel = sev === 'bad' ? 'High risk' : (sev === 'warn' ? 'Warning' : 'Info');
        topFindings.push({ sev, badgeLabel, text: f.text });
      });
    } else if (checkType === 'upi') {
      const checks = Array.isArray(data.checks) ? data.checks : (data.report && Array.isArray(data.report.checks) ? data.report.checks : []);
      const failed = checks.filter(c => c && (c.state === 'failed' || c.failed || c.state === 'warning'));
      const list = failed.length > 0 ? failed : checks.filter(c => c && c.state !== 'not_applicable');
      list.slice(0, 3).forEach(c => {
        const isFail = c.state === 'failed' || c.failed;
        const sev = isFail ? 'bad' : (c.state === 'warning' ? 'warn' : 'info');
        const badgeLabel = isFail ? 'Failed' : (c.state === 'warning' ? 'Warning' : 'Passed');
        topFindings.push({ sev, badgeLabel, text: c.detail || c.label || c.name || '' });
      });
    } else {
      // Message
      if (Array.isArray(data.flaggedPhrases) && data.flaggedPhrases.length > 0) {
        data.flaggedPhrases.slice(0, 3).forEach(p => {
          topFindings.push({
            sev: 'bad',
            badgeLabel: 'High risk',
            text: typeof p === 'string' ? p : (p.phrase || p.text || '')
          });
        });
      } else if (Array.isArray(data.signals) && data.signals.length > 0) {
        data.signals.slice(0, 3).forEach(s => {
          topFindings.push({
            sev: 'bad',
            badgeLabel: 'High risk',
            text: s.quote || s.label || s.why || ''
          });
        });
      } else if (Array.isArray(data.checks)) {
        const failed = data.checks.filter(c => c && (c.state === 'failed' || c.failed));
        const list = failed.length > 0 ? failed : data.checks.filter(c => c && c.state !== 'not_applicable');
        list.slice(0, 3).forEach(c => {
          const isFail = c.state === 'failed' || c.failed;
          const sev = isFail ? 'bad' : 'info';
          const badgeLabel = isFail ? 'Failed' : 'Passed';
          topFindings.push({ sev, badgeLabel, text: c.detail || c.label || '' });
        });
      }
    }

    // One honest line
    let honestLine = '';
    if (checkType === 'job') {
      const evStatus = data.evidenceStatus || {};
      let sourcesAnswered = 0;
      if (typeof o.sourcesAnswered === 'number') {
        sourcesAnswered = o.sourcesAnswered;
      } else if (data.report && Array.isArray(data.report.sources)) {
        sourcesAnswered = data.report.sources.length;
      }
      const sourcesExpected = o.sourcesExpected || 5;
      let aiStatusText = '';
      if (evStatus.ai && evStatus.ai !== 'ok') {
        aiStatusText = ' • AI reading unavailable';
      }
      honestLine = `${sourcesAnswered} of ${sourcesExpected} checks had evidence${aiStatusText}`;
    } else if (checkType === 'upi') {
      if (data.showUpiSafetyNote === true || (typeof data.explanation === 'string' && data.explanation.toLowerCase().includes('pin'))) {
        honestLine = 'A UPI PIN is only needed to send money, never to receive it.';
      }
    } else {
      honestLine = data.senderNote || 'Anyone can fake the sender name or phone number shown on a message. Always verify through an official channel before acting.';
    }

    const proofId = data.proofId || (data.receipt && data.receipt.proofId) || (data.ledgerProof && data.ledgerProof.proofId);

    // Format findings HTML
    const findingsHtml = topFindings.map(f => `
      <div class="cs-finding-item">
        <span class="cs-finding-dot cs-sev-${f.sev}"></span>
        <div>
          <span class="cs-finding-badge cs-badge-${f.sev}">${escapeHtml(f.badgeLabel)}</span>
          <span>${escapeHtml(f.text)}</span>
        </div>
      </div>
    `).join('');

    // Pre-shorten description for "What was sent" display
    const shortText = payload.text.length > 80 ? payload.text.slice(0, 80) + '...' : payload.text;
    const shortUrl = payload.url.length > 50 ? payload.url.slice(0, 50) + '...' : (payload.url || 'None');

    activeBubble.innerHTML = `
      <div class="cs-header">
        <div class="cs-brand">
          <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="25" fill="#0A66C2" />
            <path d="M 50 20 L 76 28 C 76 54 64 69 50 80 C 36 69 24 54 24 28 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
            <path d="M 50 28 L 68 34 C 68 53 59 63 50 72 C 41 63 32 53 32 34 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />
            <path d="M 50 37 L 60 41 C 60 52 55 58 50 63 C 45 58 40 52 40 41 Z" fill="#FFFFFF" />
          </svg>
          <span>Cyber Shield</span>
        </div>
        <button type="button" class="cs-close-btn" aria-label="Close">&#x2715;</button>
      </div>

      <div class="cs-verdict-card" style="--cs-risk-color: ${riskColor}; --cs-risk-bg: ${riskBg}">
        <div class="cs-level-row">
          <div class="cs-badges-cluster">
            <span class="cs-level-pill">${escapeHtml(levelLabel)}</span>
            ${scamTypeBadge ? `<span class="cs-pill-type">${escapeHtml(scamTypeBadge)}</span>` : ''}
            ${confidenceBandStr ? `<span class="cs-pill-confidence">Confidence: ${escapeHtml(confidenceBandStr)}</span>` : ''}
          </div>
          ${showScore ? `<span class="cs-score-val">Risk score: ${rawScore}/100</span>` : ''}
        </div>
        <div class="cs-headline-title">${escapeHtml(headlineSentence)}</div>
      </div>

      ${topFindings.length > 0 ? `
        <div class="cs-findings-section">
          <span class="cs-section-label">Top findings</span>
          ${findingsHtml}
        </div>
      ` : ''}

      ${honestLine ? `<div class="cs-honest-line">${escapeHtml(honestLine)}</div>` : ''}

      ${proofId ? `
        <div class="cs-proof-row">
          <span>Proof ID: <span class="cs-proof-id">${escapeHtml(proofId)}</span></span>
          <button type="button" class="cs-copy-btn" id="cs-copy-proof">Copy</button>
        </div>
      ` : ''}

      <div class="cs-actions-grid">
        <button type="button" class="cs-action-btn cs-action-btn-primary" id="cs-act-open">Open full report</button>
        <button type="button" class="cs-action-btn" id="cs-act-receipt">Download receipt</button>
        ${checkType === 'job'
          ? `<button type="button" class="cs-action-btn" id="cs-act-pdf">Download PDF</button>`
          : `<div class="cs-pdf-hint">PDF is available on the full report page.</div>`
        }
        <button type="button" class="cs-action-btn" id="cs-act-another">Check again</button>
      </div>

      <details class="cs-sent-details">
        <summary class="cs-sent-summary">What was sent</summary>
        <div class="cs-sent-content">
          ${checkType === 'job' ? `
            <div class="cs-sent-field"><strong>URL:</strong> ${escapeHtml(shortUrl)}</div>
            <div class="cs-sent-field"><strong>Company:</strong> ${escapeHtml(payload.company || 'None')}</div>
            <div class="cs-sent-field"><strong>Email:</strong> ${escapeHtml(payload.email || 'None')}</div>
          ` : `
            <div class="cs-sent-field"><strong>Check type:</strong> ${checkType === 'upi' ? 'UPI or payment' : 'Message'}</div>
          `}
          <div class="cs-sent-field"><strong>Text:</strong> ${escapeHtml(shortText)}</div>
        </div>
      </details>

      <div class="cs-footer">Screening aid, not a legal finding.</div>
    `;

    // Wire events
    activeBubble.querySelector('.cs-close-btn')?.addEventListener('click', hideBubble);

    const copyBtn = activeBubble.querySelector('#cs-copy-proof');
    if (copyBtn && proofId) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText?.(proofId).then(() => {
          copyBtn.textContent = 'Copied';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        });
      });
    }

    // Action: Open full report
    const openBtn = activeBubble.querySelector('#cs-act-open');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        let fullUrl = '';
        if (checkType === 'job') {
          const prefillObj = {
            url: payload.url || '',
            company: payload.company || '',
            email: payload.email || '',
            desc: (payload.text || '').slice(0, 20000)
          };
          fullUrl = `${API_BASE}/#/tools/job-scam-check?prefill=${toBase64Url(JSON.stringify(prefillObj))}`;
        } else if (checkType === 'upi') {
          const prefillObj = {
            input: (payload.text || '').slice(0, 20000)
          };
          fullUrl = `${API_BASE}/#/tools/upi-payment-check?prefill=${toBase64Url(JSON.stringify(prefillObj))}`;
        } else {
          const prefillObj = {
            input: (payload.text || '').slice(0, 20000)
          };
          fullUrl = `${API_BASE}/#/tools/message-scanner?prefill=${toBase64Url(JSON.stringify(prefillObj))}`;
        }

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'OPEN_REPORT', url: fullUrl });
        } else {
          window.open(fullUrl, '_blank');
        }
      });
    }

    // Action: Download receipt
    const receiptBtn = activeBubble.querySelector('#cs-act-receipt');
    if (receiptBtn) {
      receiptBtn.addEventListener('click', () => {
        downloadReceipt(data, checkType);
      });
    }

    // Action: Download PDF (Job offer only)
    const pdfBtn = activeBubble.querySelector('#cs-act-pdf');
    if (pdfBtn && checkType === 'job') {
      pdfBtn.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'OPEN_REPORT_HTML', data });
        } else {
          window.open(chrome.runtime.getURL('report.html#' + encodeURIComponent(JSON.stringify(data))), '_blank');
        }
      });
    }

    // Action: Check again (back to ready state)
    const anotherBtn = activeBubble.querySelector('#cs-act-another');
    if (anotherBtn) {
      anotherBtn.addEventListener('click', () => {
        openReadyBubble(payload.text, activeBubblePos);
      });
    }

    // Focus close button initially
    activeBubble.querySelector('.cs-close-btn')?.focus();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  // Global listeners
  document.addEventListener('mouseup', handleSelectionCheck);
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      hideChip();
      hideBubble();
    } else {
      handleSelectionCheck(e);
    }
  });

  window.addEventListener('scroll', () => {
    hideChip();
  }, { passive: true });

  document.addEventListener('mousedown', (e) => {
    // If clicking outside Shadow DOM host, hide chip
    if (!host.contains(e.target)) {
      hideChip();
    }
  });

  // Listener for background messages (e.g. right-click menu)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'RUN_FROM_MENU') {
        const text = (msg.selectionText || window.getSelection()?.toString() || '').trim();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        openReadyBubble(text, { x: Math.max(20, vw / 2 - 180), y: Math.max(40, vh / 4) });
      }
    });
  }
})();
