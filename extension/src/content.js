// Cyber Shield Extension - Content Script
import { API_BASE, KNOWN_JOB_BOARDS } from '../config.js';
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
      width: min(410px, calc(100vw - 24px));
      max-height: min(82vh, calc(100vh - 32px), 680px);
      background: #0B1220;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 12px;
      box-shadow: 0 10px 36px rgba(0, 0, 0, 0.7);
      padding: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      pointer-events: auto;
      animation: csFadeIn 0.18s ease-out;
      box-sizing: border-box;
      font-size: 13px;
      line-height: 1.45;
      color: #E6EDF7;
      color-scheme: dark;
      z-index: 2147483647;
    }

    @keyframes csFadeIn {
      from { opacity: 0; transform: scale(0.97); }
      to { opacity: 1; transform: scale(1); }
    }

    .cs-header {
      flex-shrink: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: #0B1220;
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

    /* Scrollable Middle Body */
    .cs-bubble-body {
      flex: 1 1 auto;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
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
      font-size: 13px;
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
      font-size: 13px;
      color: #94A3B8;
      line-height: 1.4;
    }

    .cs-use-page-desc-wrap {
      display: flex;
      align-items: center;
      justify-content: flex-start;
    }

    .cs-use-page-desc-btn {
      background: rgba(77, 163, 255, 0.12);
      border: 1px solid rgba(77, 163, 255, 0.35);
      color: #60A5FA;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
    }

    .cs-use-page-desc-btn:hover {
      background: rgba(77, 163, 255, 0.22);
      border-color: #93C5FD;
    }

    .cs-textarea-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .cs-edit-textarea {
      width: 100%;
      min-height: 90px;
      max-height: 180px;
      resize: vertical;
      background: #05080F;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      padding: 8px 10px;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.45;
      color: #FFFFFF;
      outline: none;
      transition: border-color 0.15s;
    }

    .cs-edit-textarea:focus {
      border-color: #4DA3FF;
      box-shadow: 0 0 0 1px #4DA3FF;
    }

    .cs-char-counter {
      font-size: 12px;
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
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-top-color: #4DA3FF;
      border-radius: 50%;
      animation: csSpin 0.8s linear infinite;
    }

    @keyframes csSpin {
      to { transform: rotate(360deg); }
    }

    .cs-loading-note {
      font-size: 13px;
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
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 3px 8px;
      border-radius: 4px;
      background: var(--cs-risk-bg, rgba(18, 128, 92, 0.2));
      color: var(--cs-risk-color, #12805C);
    }

    .cs-pill-type {
      font-size: 13px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      color: #E2E8F0;
    }

    .cs-pill-confidence {
      font-size: 13px;
      font-weight: 600;
      padding: 3px 8px;
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
      line-height: 1.4;
    }

    .cs-headline-sub {
      font-size: 13px;
      color: #C9D3E3;
      line-height: 1.4;
    }

    /* Top Findings */
    .cs-findings-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .cs-section-label {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #C9D3E3;
    }

    .cs-finding-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 13px;
      color: #FFFFFF;
      background: rgba(255, 255, 255, 0.03);
      padding: 6px 8px;
      border-radius: 6px;
      line-height: 1.4;
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
      font-size: 12px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 3px;
      margin-right: 4px;
      display: inline-block;
    }

    .cs-badge-bad { background: rgba(198, 40, 40, 0.25); color: #FCA5A5; border: 1px solid rgba(198, 40, 40, 0.4); }
    .cs-badge-warn { background: rgba(183, 121, 31, 0.25); color: #FCD34D; border: 1px solid rgba(183, 121, 31, 0.4); }
    .cs-badge-info, .cs-badge-ok { background: rgba(18, 128, 92, 0.25); color: #4ADE80; border: 1px solid rgba(18, 128, 92, 0.4); }
    .cs-badge-unknown { background: rgba(100, 116, 139, 0.2); color: #9AA8BF; border: 1px solid rgba(148, 163, 184, 0.3); }

    .cs-quote {
      display: block;
      margin: 4px 0;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.04);
      border-left: 2px solid #4DA3FF;
      border-radius: 0 4px 4px 0;
      font-size: 12px;
      color: #E6EDF7;
      font-style: italic;
      word-break: break-word;
    }

    /* Job 5-Check Summary List */
    .cs-checks-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .cs-check-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 5px 8px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      font-size: 12.5px;
    }

    .cs-check-row-title {
      color: #E6EDF7;
      font-weight: 500;
    }

    /* Honest Line */
    .cs-honest-line {
      font-size: 13px;
      color: #C9D3E3;
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.03);
      border-left: 3px solid #4DA3FF;
      border-radius: 0 4px 4px 0;
      line-height: 1.45;
    }

    /* Collapsible What Was Sent */
    .cs-sent-details {
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      padding: 6px 10px;
      background: rgba(0, 0, 0, 0.2);
      font-size: 12px;
    }

    .cs-sent-summary {
      cursor: pointer;
      color: #C9D3E3;
      font-size: 13px;
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
      font-size: 12px;
    }

    .cs-sent-field strong {
      color: #C9D3E3;
    }

    /* Sticky Footer */
    .cs-sticky-footer {
      flex-shrink: 0;
      padding: 10px 14px 12px 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: #0B1220;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Proof ID Row */
    .cs-proof-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.03);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
    }

    .cs-proof-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #4DA3FF;
      font-weight: 600;
      font-size: 12px;
    }

    .cs-copy-btn {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #C9D3E3;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
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
      font-size: 13px;
      font-weight: 500;
      min-height: 36px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: #101B2E;
      color: #FFFFFF;
      cursor: pointer;
      text-align: center;
      transition: background 0.15s, border-color 0.15s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
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
      font-size: 12px;
      color: #94A3B8;
      text-align: center;
      font-style: italic;
    }

    /* Error Box */
    .cs-err-box {
      background: rgba(198, 40, 40, 0.15);
      border: 1px solid rgba(198, 40, 40, 0.3);
      color: #FCA5A5;
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .cs-retry-btn {
      align-self: flex-start;
      background: #C62828;
      border: none;
      color: #FFFFFF;
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .cs-retry-btn:hover {
      background: #991B1B;
    }

    /* Quota Exceeded Box */
    .cs-quota-box {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(148, 163, 184, 0.25);
      color: #E2E8F0;
      padding: 12px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.45;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cs-upgrade-btn {
      align-self: flex-start;
      background: #0A66C2;
      border: none;
      color: #FFFFFF;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
    }

    .cs-upgrade-btn:hover {
      background: #084e96;
    }

    /* Footer */
    .cs-footer {
      font-size: 12px;
      color: #94A3B8;
      text-align: center;
      padding-top: 4px;
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

  function isKnownJobBoardHost() {
    const host = window.location.hostname.toLowerCase();
    const boards = Array.isArray(KNOWN_JOB_BOARDS) ? KNOWN_JOB_BOARDS : [
      'linkedin', 'indeed', 'naukri', 'glassdoor', 'internshala', 'foundit',
      'monster', 'shine', 'timesjobs', 'wellfound', 'instahyre', 'apna',
      'workindia', 'cutshort', 'hirist', 'unstop'
    ];
    return boards.some(b => host === b || host.endsWith('.' + b) || host.includes('.' + b + '.') || host.includes(b));
  }

  function isBoardNameOrHost(name) {
    if (!name || typeof name !== 'string') return true;
    const clean = name.trim().toLowerCase();
    if (!clean) return true;
    if (clean.includes('claude.ai') || clean.includes('chatgpt.com') || clean.includes('anthropic.com')) return true;
    if (/^https?:\/\//i.test(clean) || /^www\./i.test(clean) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(clean)) return true;
    const host = window.location.hostname.toLowerCase();
    if (clean === host || host.includes(clean) || clean.includes(host)) return true;
    const boards = Array.isArray(KNOWN_JOB_BOARDS) ? KNOWN_JOB_BOARDS : [
      'linkedin', 'indeed', 'naukri', 'glassdoor', 'internshala', 'foundit',
      'monster', 'shine', 'timesjobs', 'wellfound', 'instahyre', 'apna',
      'workindia', 'cutshort', 'hirist', 'unstop'
    ];
    return boards.some(b => clean === b || clean.includes(b) || clean === `${b}.com`);
  }

  function extractUrlFromText(text) {
    if (!text || typeof text !== 'string') return '';
    const match = text.match(/\bhttps?:\/\/[^\s<>"'{}|\\^`]+|\bwww\.[^\s<>"'{}|\\^`]+/i);
    if (!match) return '';
    let found = match[0].trim();
    if (found.startsWith('www.')) {
      found = 'https://' + found;
    }
    found = found.replace(/[.,;:!?)]+$/, '');
    return found.slice(0, 2000);
  }

  function getCleanUrl() {
    try {
      const u = new URL(window.location.href);
      u.hash = '';
      const STRIP_KEYS = /^(utm_|ref|refId|trackingId|trk|midToken|tracking_id|source|sessionId|fbclid|gclid|token|key|auth|session|sid|password|pass|secret|code)$/i;
      const toDelete = [];
      for (const k of u.searchParams.keys()) {
        if (STRIP_KEYS.test(k)) {
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

  function getCompany(selectedText = '') {
    // (1) Check JSON-LD for JobPosting -> hiringOrganization
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const json = JSON.parse(script.textContent);
          const items = Array.isArray(json) ? json : (json['@graph'] && Array.isArray(json['@graph']) ? json['@graph'] : [json]);
          for (const item of items) {
            if (item && (item['@type'] === 'JobPosting' || (Array.isArray(item['@type']) && item['@type'].includes('JobPosting')))) {
              const org = item.hiringOrganization;
              if (org) {
                let orgName = '';
                if (typeof org === 'string') orgName = org.trim();
                else if (typeof org.name === 'string') orgName = org.name.trim();
                else if (typeof org.legalName === 'string') orgName = org.legalName.trim();

                if (orgName && !isBoardNameOrHost(orgName)) {
                  return orgName.slice(0, 200);
                }
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) {}

    // (2) Page structured company element / og tags when clearly a company (NEVER og:site_name, NEVER title, NEVER hostname)
    try {
      const metaCompany = document.querySelector('meta[property="og:company_name"], meta[name="company"], meta[property="job:company"]');
      if (metaCompany && metaCompany.content && metaCompany.content.trim()) {
        const c = metaCompany.content.trim();
        if (!isBoardNameOrHost(c)) {
          return c.slice(0, 200);
        }
      }

      const companySelectors = [
        '[itemprop="hiringOrganization"]',
        '[itemprop="hiringOrganization"] [itemprop="name"]',
        '.job-details-jobs-unified-top-card__company-name a',
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name a',
        '.jobs-unified-top-card__company-name',
        '.topcard__flavor--black-link',
        '[data-testid="inlineHeader-companyName"]',
        '.companyName',
        '.jd-header-comp-name a',
        '.jd-header-comp-name',
        '.comp-name',
        '[data-test="employer-name"]',
        '.company_name'
      ];
      for (const sel of companySelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim()) {
          const c = el.textContent.trim();
          if (!isBoardNameOrHost(c) && c.length <= 100 && !c.includes('\n')) {
            return c.slice(0, 200);
          }
        }
      }
    } catch (e) {}

    // (3) Company named in selected text
    if (selectedText && typeof selectedText === 'string') {
      const companyMatch = selectedText.match(/(?:company|hiring organization|employer)\s*:\s*([A-Za-z0-9&.,' -]{2,60})/i)
        || selectedText.match(/(?:at|with|join)\s+([A-Z][A-Za-z0-9&.,' -]{1,40})\s+(?:is hiring|are hiring|for the role)/);
      if (companyMatch && companyMatch[1]) {
        const c = companyMatch[1].trim();
        if (!isBoardNameOrHost(c)) {
          return c.slice(0, 200);
        }
      }
    }

    // Otherwise leave it EMPTY. Never use page title, og:site_name, or hostname!
    return '';
  }

  function getPageJobDescription() {
    const descSelectors = [
      '#job-details',
      '.jobs-description__content',
      '.jobs-box__html-content',
      '.description__text',
      '#jobDescriptionText',
      '.job-desc',
      '[data-test="jobDescriptionText"]',
      '[itemprop="description"]',
      '.job-description'
    ];
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 50) {
        return el.innerText.trim().slice(0, 20000);
      }
    }
    return '';
  }

  function positionBubbleInViewport(bubble, pos) {
    if (!bubble) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bubbleWidth = bubble.offsetWidth || Math.min(380, vw - 32);
    const bubbleHeight = bubble.offsetHeight || Math.min(vh * 0.8, 640);

    let left = pos ? pos.x : 40;
    let top = pos ? pos.y : 40;

    if (left + bubbleWidth > vw - 16) {
      left = Math.max(16, vw - bubbleWidth - 16);
    }
    if (left < 16) left = 16;

    if (top + bubbleHeight > vh - 16) {
      top = Math.max(16, vh - bubbleHeight - 16);
    }
    if (top < 16) top = 16;

    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
  }

  function getEmail(text) {
    const emails = (text || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
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

    bubble.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        hideBubble();
      }
    });

    let currentType = selectedType || 'message';
    let currentText = (text || '').slice(0, 20000);

    const isJobBoard = isKnownJobBoardHost();
    const pageJobDesc = isJobBoard ? getPageJobDescription() : '';
    if (currentType === 'job' && currentText.trim().length < 30 && pageJobDesc) {
      currentText = pageJobDesc;
    }

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

      <div class="cs-bubble-body">
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

          ${(isJobBoard && pageJobDesc) ? `
            <div class="cs-use-page-desc-wrap">
              <button type="button" class="cs-use-page-desc-btn" id="cs-btn-use-pagedesc">
                Use main job posting text (${pageJobDesc.length > 20000 ? '20,000' : pageJobDesc.length.toLocaleString()} chars)
              </button>
            </div>
          ` : ''}

          <div class="cs-textarea-container">
            <textarea
              class="cs-edit-textarea"
              maxlength="20000"
              aria-label="Text to check"
            >${escapeHtml(currentText)}</textarea>
            <div class="cs-char-counter">${currentText.length.toLocaleString()} / 20,000 characters</div>
          </div>
        </div>
      </div>

      <div class="cs-sticky-footer">
        <button type="button" class="cs-action-btn cs-action-btn-primary" id="cs-btn-check">
          Check
        </button>
        <div class="cs-footer">Screening aid, not a legal finding.</div>
      </div>
    `;

    // Close button
    bubble.querySelector('.cs-close-btn').addEventListener('click', hideBubble);

    const textarea = bubble.querySelector('.cs-edit-textarea');
    const counter = bubble.querySelector('.cs-char-counter');
    const segmentButtons = Array.from(bubble.querySelectorAll('.cs-segment-btn'));
    const checkBtn = bubble.querySelector('#cs-btn-check');
    const usePageDescBtn = bubble.querySelector('#cs-btn-use-pagedesc');

    if (usePageDescBtn && pageJobDesc) {
      usePageDescBtn.addEventListener('click', () => {
        textarea.value = pageJobDesc.slice(0, 20000);
        currentText = textarea.value;
        counter.textContent = `${currentText.length.toLocaleString()} / 20,000 characters`;
        textarea.focus();
      });
    }

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
    positionBubbleInViewport(bubble, pos);
    requestAnimationFrame(() => positionBubbleInViewport(bubble, pos));
    textarea.focus();
  }

  function runCheckFlow(text, checkType, pos) {
    const payload = {
      text,
      desc: text,
      url: extractUrlFromText(text),
      company: checkType === 'job' ? getCompany(text) : '',
      email: checkType === 'job' ? getEmail(text) : ''
    };
    lastCheckedPayload = { text, checkType, payload };

    showBubbleLoading(pos);

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'CHECK', checkType, payload }, (res) => {
        if (!activeBubble) return;
        if (!res || !res.ok) {
          if (res && (res.code === 'quota_exceeded' || res.error === 'quota_exceeded')) {
            showBubbleQuotaExceeded(res);
          } else if (res && res.code === 'pro_required') {
            showBubbleProRequired(res);
          } else if (res && (res.code === 'missing_key' || res.code === 'invalid_extension_key' || res.code === 'key_revoked')) {
            showBubbleKeyError(res.error || 'Key was revoked. Add a new key');
          } else {
            showBubbleError(res ? res.error : 'Could not reach Cyber Shield.');
          }
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

      <div class="cs-bubble-body">
        <div class="cs-loading-wrap">
          <div class="cs-loading-title">
            <div class="cs-spinner"></div>
            <span>Checking the evidence...</span>
          </div>
          <p class="cs-loading-note">Checks run in parallel with threat intel and verification services.</p>
        </div>
      </div>

      <div class="cs-sticky-footer">
        <div class="cs-footer">Screening aid, not a legal finding.</div>
      </div>
    `;

    activeBubble.querySelector('.cs-close-btn').addEventListener('click', hideBubble);
    positionBubbleInViewport(activeBubble, activeBubblePos);
    requestAnimationFrame(() => positionBubbleInViewport(activeBubble, activeBubblePos));
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

      <div class="cs-bubble-body">
        <div class="cs-err-box" role="alert">
          <span>${escapeHtml(errorMsg)}</span>
        </div>
      </div>

      <div class="cs-sticky-footer">
        <div class="cs-actions-grid">
          <button type="button" class="cs-action-btn cs-action-btn-primary" id="cs-retry-btn">Retry</button>
          <button type="button" class="cs-action-btn" id="cs-edit-btn">Edit text</button>
        </div>
        <div class="cs-footer">Screening aid, not a legal finding.</div>
      </div>
    `;

    activeBubble.querySelector('.cs-close-btn').addEventListener('click', hideBubble);

    const retryBtn = activeBubble.querySelector('#cs-retry-btn');
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

    const editBtn = activeBubble.querySelector('#cs-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        openReadyBubble(lastCheckedPayload ? lastCheckedPayload.text : '', activeBubblePos);
      });
    }

    positionBubbleInViewport(activeBubble, activeBubblePos);
    requestAnimationFrame(() => positionBubbleInViewport(activeBubble, activeBubblePos));
  }

  function showBubbleQuotaExceeded(quotaRes) {
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

      <div class="cs-bubble-body">
        <div class="cs-quota-box" role="alert">
          <span>Free checks used for this month. Open Cyber Shield to sign in or upgrade.</span>
          <button type="button" class="cs-upgrade-btn" id="cs-open-site-btn">Open Cyber Shield &rarr;</button>
        </div>
      </div>

      <div class="cs-sticky-footer">
        <div class="cs-footer">Screening aid, not a legal finding.</div>
      </div>
    `;

    activeBubble.querySelector('.cs-close-btn').addEventListener('click', hideBubble);

    const openBtn = activeBubble.querySelector('#cs-open-site-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const targetUrl = (quotaRes && quotaRes.action === 'sign_in')
          ? `${API_BASE}/#/login`
          : `${API_BASE}/#/pricing`;
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
        hideBubble();
      });
      openBtn.focus();
    }

    positionBubbleInViewport(activeBubble, activeBubblePos);
    requestAnimationFrame(() => positionBubbleInViewport(activeBubble, activeBubblePos));
  }

  function showBubbleKeyError(errorMsg) {
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

      <div class="cs-bubble-body">
        <div class="cs-err-box" role="alert">
          <span>${escapeHtml(errorMsg || 'Key not valid, generate a new one')}</span>
        </div>
        <div class="cs-quota-box">
          <span>Open the Extension page on Cyber Shield to generate a key, then paste it into the extension popup.</span>
          <a href="${escapeHtml(API_BASE)}/#/extension" target="_blank" rel="noopener noreferrer" class="cs-upgrade-btn" id="cs-ext-key-link">Open Extension Page &rarr;</a>
        </div>
      </div>

      <div class="cs-sticky-footer">
        <div class="cs-footer">Screening aid, not a legal finding.</div>
      </div>
    `;

    activeBubble.querySelector('.cs-close-btn').addEventListener('click', hideBubble);
    positionBubbleInViewport(activeBubble, activeBubblePos);
    requestAnimationFrame(() => positionBubbleInViewport(activeBubble, activeBubblePos));
  }

  function showBubbleProRequired(proRes) {
    if (!activeBubble) return;
    const upgradePath = (proRes && proRes.upgradeUrl) ? proRes.upgradeUrl : '/#/pricing';
    const upgradeUrl = upgradePath.startsWith('http') ? upgradePath : `${API_BASE}${upgradePath}`;

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

      <div class="cs-bubble-body">
        <div class="cs-quota-box" role="alert">
          <span>${escapeHtml((proRes && proRes.error) || 'Extension is a Pro feature')}</span>
          <a href="${escapeHtml(upgradeUrl)}" target="_blank" rel="noopener noreferrer" class="cs-upgrade-btn" id="cs-pro-upgrade-link">Upgrade to Pro &rarr;</a>
        </div>
      </div>

      <div class="cs-sticky-footer">
        <div class="cs-footer">Screening aid, not a legal finding.</div>
      </div>
    `;

    activeBubble.querySelector('.cs-close-btn').addEventListener('click', hideBubble);
    positionBubbleInViewport(activeBubble, activeBubblePos);
    requestAnimationFrame(() => positionBubbleInViewport(activeBubble, activeBubblePos));
  }

  function formatScamTypeBadge(rawType) {
    if (!rawType || typeof rawType !== 'string' || rawType === 'unknown' || rawType === 'none' || rawType === 'unclear') return '';
    const map = {
      pay_to_receive: 'Pay-to-receive pattern',
      fake_payment_proof: 'Fake payment proof',
      overpayment_trap: 'Refund / overpayment trap',
      advance_fee: 'Advance fee demand',
      unverifiable_receipt: 'Unverifiable receipt',
      routine_payment: 'Routine payment',
      job_task_scam: 'Job / task offer scam',
      otp_impersonation: 'OTP / bank impersonation',
      delivery_fee: 'Parcel delivery fee scam',
      investment_pump: 'High-yield investment trap',
      lottery_prize: 'Lottery / prize scam',
      loan_advance_fee: 'Instant loan fee demand',
      digital_arrest: 'Law enforcement impersonation',
      family_emergency: 'Urgent family / friend trap',
      routine_chat: 'Routine communication',
      fake_recruiter: 'Fake recruiter',
      job_scam: 'Job scam',
      upi_collect_fraud: 'Collect request fraud',
      upi_pin_fraud: 'UPI PIN fraud',
      phishing: 'Phishing',
      kyc_fraud: 'KYC fraud',
      lottery_scam: 'Lottery / Reward scam',
      impersonation: 'Impersonation'
    };
    return map[rawType] || rawType.replace(/_/g, ' ');
  }

  const WEBSITE_SL = {
    ok: 'Looks fine',
    safe: 'Looks fine',
    pass: 'Looks fine',
    passed: 'Looks fine',
    warn: 'Warning',
    warning: 'Warning',
    caution: 'Caution',
    bad: 'High risk',
    danger: 'High risk',
    flag: 'Flagged pattern',
    fail: 'Flagged pattern',
    failed: 'Flagged pattern',
    info: 'Info',
    not_applicable: 'Not applicable',
    unknown: 'Unable to verify'
  };

  function getCheckBadgeClass(state) {
    const s = String(state || 'unknown').toLowerCase();
    if (s === 'bad' || s === 'flag' || s === 'fail' || s === 'failed' || s === 'danger') return 'bad';
    if (s === 'warn' || s === 'warning' || s === 'caution') return 'warn';
    if (s === 'ok' || s === 'safe' || s === 'pass' || s === 'passed' || s === 'info') return 'ok';
    return 'unknown';
  }

  function showBubbleResult(data, checkType, payload) {
    if (!activeBubble) return;

    const o = data.report ? (data.report.overall || {}) : {};
    const rawLevel = String(data.level || o.level || 'unable').toLowerCase();
    const isUnable = rawLevel === 'unable' || (checkType !== 'job' && rawLevel === 'unknown') || data.mode === 'ai_unavailable' || data.reason === 'ai_unavailable';

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

        <div class="cs-bubble-body">
          <div class="cs-verdict-card cs-verdict-unable" style="--cs-risk-color: #64748B; --cs-risk-bg: rgba(100, 116, 139, 0.2)">
            <div class="cs-level-row">
              <span class="cs-level-pill">Unable to verify</span>
            </div>
            <div class="cs-headline-title">${escapeHtml(sentence)}</div>
          </div>
        </div>

        <div class="cs-sticky-footer">
          <div class="cs-actions-grid">
            <button type="button" class="cs-action-btn cs-action-btn-primary" id="cs-act-tryagain">Try again</button>
            <button type="button" class="cs-action-btn" id="cs-act-another">Check again</button>
          </div>
          <div class="cs-footer">Screening aid, not a legal finding.</div>
        </div>
      `;

      activeBubble.querySelector('.cs-close-btn').addEventListener('click', hideBubble);

      activeBubble.querySelector('#cs-act-tryagain')?.addEventListener('click', () => {
        runCheckFlow(payload.text, checkType, activeBubblePos);
      });

      activeBubble.querySelector('#cs-act-another')?.addEventListener('click', () => {
        openReadyBubble(payload.text, activeBubblePos);
      });

      positionBubbleInViewport(activeBubble, activeBubblePos);
      requestAnimationFrame(() => positionBubbleInViewport(activeBubble, activeBubblePos));
      return;
    }

    // Normal verdict calculation from API only (matching website labels)
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
    } else if (rawLevel === 'unknown') {
      levelLabel = 'Unable to verify';
      riskColor = '#64748B';
      riskBg = 'rgba(100, 116, 139, 0.2)';
    }

    const rawScore = typeof data.score === 'number' ? data.score : (typeof data.riskScore === 'number' ? data.riskScore : (typeof o.score === 'number' ? o.score : null));
    const showScore = rawScore != null && !isNaN(rawScore) && !isUnable;

    // Confidence formatting: exact same logic as website (band for UPI/Message, percentage for Job)
    const rawBand = data.confidenceBand || (o && o.confidenceBand);
    let confidenceStr = null;
    if (typeof rawBand === 'string' && rawBand.trim()) {
      const b = rawBand.trim().toLowerCase();
      if (b === 'high') confidenceStr = 'Confidence: High';
      else if (b === 'medium') confidenceStr = 'Confidence: Medium';
      else if (b === 'low') confidenceStr = 'Confidence: Low';
    } else {
      const numConf = typeof o.confidence === 'number' ? o.confidence : (typeof data.confidence === 'number' ? data.confidence : null);
      if (numConf != null && !isNaN(numConf)) {
        const pct = numConf > 0 && numConf <= 1 ? Math.round(numConf * 100) : Math.round(numConf);
        confidenceStr = `Confidence: ${pct}%`;
      }
    }

    // Headline title & sentence (exact website wording)
    let headlineTitle = '';
    let headlineSentence = '';
    if (Array.isArray(data.headline) && data.headline.length > 0) {
      headlineTitle = data.headline[0] || '';
      headlineSentence = data.headline[1] || '';
    } else if (typeof data.headline === 'string' && data.headline.trim()) {
      headlineTitle = data.headline.trim();
    } else {
      headlineTitle = data.primaryConcern || 'Check complete.';
    }
    if (checkType === 'upi' && data.primaryConcern) {
      headlineTitle = data.primaryConcern;
      headlineSentence = '';
    }

    // Message scam signals chip (exact wording as MessageResult.jsx)
    let scamSignalsChipText = '';
    if (checkType === 'message') {
      const status = (data.scamSignals && data.scamSignals.status) || (rawLevel === 'high' ? 'strong' : rawLevel === 'medium' ? 'some' : 'none_found');
      scamSignalsChipText = status === 'strong'
        ? 'Strong scam signs found'
        : status === 'some'
        ? 'Some scam signs found'
        : 'No scam signs found';
    }

    // Scam Type
    const scamType = data.scamType || (data.report && data.report.scamType);
    const scamTypeBadge = formatScamTypeBadge(scamType);

    // Reasons & quoted evidence (up to 5 real items, NEVER padded or forced)
    const realReasons = [];
    const seenReasons = new Set();
    const SEV_WEIGHT = { bad: 4, flag: 4, failed: 4, fail: 4, warn: 3, warning: 3, caution: 3, info: 2, unknown: 1, ok: 0, pass: 0, passed: 0 };

    function pushRealReason({ sev, badgeLabel, quote = '', text = '', weight = 0 }) {
      const cleanQuote = typeof quote === 'string' ? quote.trim() : '';
      const cleanText = typeof text === 'string' ? text.trim() : '';
      if (!cleanQuote && !cleanText) return;
      const dedupeKey = `${cleanQuote.toLowerCase()}|${cleanText.toLowerCase()}`;
      if (seenReasons.has(dedupeKey)) return;
      seenReasons.add(dedupeKey);
      realReasons.push({ sev, badgeLabel, quote: cleanQuote, text: cleanText, weight });
    }

    const jobChecks = checkType === 'job'
      ? ((data.report && Array.isArray(data.report.checks)) ? data.report.checks : [])
      : [];

    if (checkType === 'job') {
      jobChecks.forEach(c => {
        const arr = Array.isArray(c && c.findings) ? c.findings : [];
        arr.forEach(f => {
          if (!f || !f.text) return;
          const rawSev = String(f.severity || 'info').toLowerCase();
          const sevKey = rawSev === 'bad' ? 'bad' : (rawSev === 'warn' ? 'warn' : 'info');
          const badgeLabel = WEBSITE_SL[rawSev] || (sevKey === 'bad' ? 'High risk' : (sevKey === 'warn' ? 'Warning' : 'Info'));
          pushRealReason({
            sev: sevKey,
            badgeLabel,
            text: f.text,
            weight: SEV_WEIGHT[rawSev] ?? 1
          });
        });
      });
    } else if (checkType === 'upi') {
      const evidenceArr = Array.isArray(data.evidence)
        ? data.evidence
        : (data.report && Array.isArray(data.report.evidence) ? data.report.evidence : []);
      evidenceArr.forEach(ev => {
        if (!ev) return;
        const sevKey = rawLevel === 'low' ? 'info' : (rawLevel === 'medium' ? 'warn' : 'bad');
        const badgeLabel = rawLevel === 'low' ? 'Info' : (rawLevel === 'medium' ? 'Warning' : 'High risk');
        pushRealReason({
          sev: sevKey,
          badgeLabel,
          quote: ev.quote || ev.text || '',
          text: ev.interpretation || ev.reason || '',
          weight: sevKey === 'bad' ? 5 : (sevKey === 'warn' ? 3 : 1)
        });
      });

      const checks = Array.isArray(data.checks) ? data.checks : (data.report && Array.isArray(data.report.checks) ? data.report.checks : []);
      checks.forEach(c => {
        if (!c || c.state === 'not_applicable') return;
        const st = String(c.state || 'unknown').toLowerCase();
        const sev = getCheckBadgeClass(st);
        const badgeLabel = WEBSITE_SL[st] || st;
        const summary = c.detail || c.summary || c.reason || '';
        const title = c.title || c.key || '';
        pushRealReason({
          sev: sev === 'unknown' ? 'info' : sev,
          badgeLabel,
          text: title && summary ? `${title}: ${summary}` : (summary || title),
          weight: SEV_WEIGHT[st] ?? 1
        });
      });
    } else {
      // Message: signals (with quotes), flaggedPhrases, and applicable checks
      const signalsArr = Array.isArray(data.signals) ? data.signals : [];
      signalsArr.forEach(s => {
        if (!s) return;
        const sevKey = rawLevel === 'low' ? 'info' : (rawLevel === 'medium' ? 'warn' : 'bad');
        const badgeLabel = rawLevel === 'low' ? 'Info' : (rawLevel === 'medium' ? 'Warning' : 'High risk');
        pushRealReason({
          sev: sevKey,
          badgeLabel,
          quote: s.quote || '',
          text: s.why || s.interpretation || s.label || '',
          weight: sevKey === 'bad' ? 5 : (sevKey === 'warn' ? 3 : 1)
        });
      });

      const evidenceArr = Array.isArray(data.evidence) ? data.evidence : [];
      evidenceArr.forEach(ev => {
        if (!ev) return;
        const q = String(ev.quote || ev.text || '').trim();
        // Avoid duplicating signals already added with same quote
        const alreadyHasQuote = q && realReasons.some(r => r.quote.toLowerCase() === q.toLowerCase());
        if (alreadyHasQuote) return;
        const sevKey = rawLevel === 'low' ? 'info' : (rawLevel === 'medium' ? 'warn' : 'bad');
        const badgeLabel = rawLevel === 'low' ? 'Info' : (rawLevel === 'medium' ? 'Warning' : 'High risk');
        pushRealReason({
          sev: sevKey,
          badgeLabel,
          quote: q,
          text: ev.interpretation || ev.reason || '',
          weight: sevKey === 'bad' ? 5 : (sevKey === 'warn' ? 3 : 1)
        });
      });

      if (Array.isArray(data.flaggedPhrases)) {
        data.flaggedPhrases.forEach(p => {
          if (!p) return;
          const q = typeof p === 'string' ? p : (p.phrase || p.text || '');
          const cleanQ = String(q).trim();
          const alreadyHasQuote = cleanQ && realReasons.some(r => r.quote.toLowerCase() === cleanQ.toLowerCase());
          if (alreadyHasQuote) return;
          const pSev = typeof p === 'object' ? String(p.severity || 'bad').toLowerCase() : 'bad';
          const sevKey = (pSev === 'medium' || pSev === 'warn') ? 'warn' : 'bad';
          pushRealReason({
            sev: sevKey,
            badgeLabel: sevKey === 'warn' ? 'Warning' : 'High risk',
            quote: cleanQ,
            text: typeof p === 'object' ? (p.reason || '') : '',
            weight: 4
          });
        });
      }

      const checks = Array.isArray(data.checks) ? data.checks : (data.report && Array.isArray(data.report.checks) ? data.report.checks : []);
      checks.forEach(c => {
        if (!c || c.state === 'not_applicable') return;
        const st = String(c.state || 'unknown').toLowerCase();
        const sev = getCheckBadgeClass(st);
        const badgeLabel = WEBSITE_SL[st] || st;
        const summary = c.reason || c.detail || c.summary || '';
        const title = c.title || c.key || '';
        pushRealReason({
          sev: sev === 'unknown' ? 'info' : sev,
          badgeLabel,
          text: title && summary ? `${title}: ${summary}` : (summary || title),
          weight: SEV_WEIGHT[st] ?? 1
        });
      });
    }

    realReasons.sort((a, b) => b.weight - a.weight);
    const displayReasons = realReasons.slice(0, 5); // Up to 5, never padded!

    // Job 5-check breakdown in short form (URL, description, company, recruiter, security)
    const JOB_CHECK_ORDER = ['url', 'desc', 'company', 'recruiter', 'security'];
    const JOB_CHECK_DEFAULT_TITLES = {
      url: 'Job URL',
      desc: 'Job description',
      company: 'Company verification',
      recruiter: 'Recruiter verification',
      security: 'Security checks'
    };
    const jobCheckRowsHtml = checkType === 'job' ? JOB_CHECK_ORDER.map(key => {
      const c = jobChecks.find(item => item && item.key === key) || { key, title: JOB_CHECK_DEFAULT_TITLES[key], state: 'unknown' };
      const st = String(c.state || 'unknown').toLowerCase();
      const label = WEBSITE_SL[st] || 'Unable to verify';
      const badgeCls = getCheckBadgeClass(st);
      return `
        <div class="cs-check-row">
          <span class="cs-check-row-title">${escapeHtml(c.title || JOB_CHECK_DEFAULT_TITLES[key])}</span>
          <span class="cs-finding-badge cs-badge-${badgeCls}">${escapeHtml(label)}</span>
        </div>
      `;
    }).join('') : '';

    // Honesty line per tool (exact website wording)
    let honestLine = '';
    if (checkType === 'job') {
      const evStatus = data.evidenceStatus || {};
      let sourcesAnswered = 0;
      if (typeof o.sourcesAnswered === 'number') {
        sourcesAnswered = o.sourcesAnswered;
      } else if (typeof data.live === 'number') {
        sourcesAnswered = data.live;
      } else if (typeof o.live === 'number') {
        sourcesAnswered = o.live;
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
      } else if (data.honestLine || data.note) {
        honestLine = data.honestLine || data.note;
      }
    } else {
      honestLine = data.senderNote || 'Anyone can fake the sender name or phone number shown on a message. Always verify through an official channel before acting.';
    }

    const proofId = data.proofId || (data.receipt && data.receipt.proofId) || (data.ledgerProof && data.ledgerProof.proofId) || '';
    const savedReportId = data.scanId || proofId;

    // Format reasons & quoted evidence HTML
    const findingsHtml = displayReasons.map(f => `
      <div class="cs-finding-item">
        <span class="cs-finding-dot cs-sev-${f.sev}"></span>
        <div style="flex: 1; min-width: 0;">
          <span class="cs-finding-badge cs-badge-${f.sev}">${escapeHtml(f.badgeLabel)}</span>
          ${f.quote ? `<blockquote class="cs-quote">&ldquo;${escapeHtml(f.quote)}&rdquo;</blockquote>` : ''}
          ${f.text ? `<span>${escapeHtml(f.text)}</span>` : ''}
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

      <div class="cs-bubble-body">
        <div class="cs-verdict-card" style="--cs-risk-color: ${riskColor}; --cs-risk-bg: ${riskBg}">
          <div class="cs-level-row">
            <div class="cs-badges-cluster">
              <span class="cs-level-pill">${escapeHtml(levelLabel)}</span>
              ${scamSignalsChipText ? `<span class="cs-level-pill">${escapeHtml(scamSignalsChipText)}</span>` : ''}
              ${scamTypeBadge ? `<span class="cs-pill-type">${escapeHtml(scamTypeBadge)}</span>` : ''}
              ${confidenceStr ? `<span class="cs-pill-confidence">${escapeHtml(confidenceStr)}</span>` : ''}
            </div>
            ${showScore ? `<span class="cs-score-val">Risk score: ${rawScore}/100</span>` : ''}
          </div>
          <div class="cs-headline-title">${escapeHtml(headlineTitle)}</div>
          ${headlineSentence ? `<div class="cs-headline-sub">${escapeHtml(headlineSentence)}</div>` : ''}
        </div>

        ${checkType === 'job' ? `
          <div class="cs-findings-section">
            <span class="cs-section-label">5 checks</span>
            <div class="cs-checks-list">
              ${jobCheckRowsHtml}
            </div>
          </div>
        ` : ''}

        ${displayReasons.length > 0 ? `
          <div class="cs-findings-section">
            <span class="cs-section-label">Reasons &amp; evidence</span>
            ${findingsHtml}
          </div>
        ` : ''}

        ${honestLine ? `<div class="cs-honest-line">${escapeHtml(honestLine)}</div>` : ''}

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
      </div>

      <div class="cs-sticky-footer">
        ${proofId ? `
          <div class="cs-proof-row">
            <span>Proof ID: <span class="cs-proof-id">${escapeHtml(proofId)}</span></span>
            <button type="button" class="cs-copy-btn" id="cs-copy-proof" aria-label="Copy Proof ID">Copy</button>
          </div>
        ` : ''}

        <div class="cs-actions-grid">
          ${savedReportId
            ? `<button type="button" class="cs-action-btn cs-action-btn-primary" id="cs-act-open">Open full report</button>`
            : ''
          }
          <button type="button" class="cs-action-btn" id="cs-act-receipt">Download receipt</button>
          <button type="button" class="cs-action-btn" id="cs-act-pdf" aria-label="Download report">Download report</button>
          <button type="button" class="cs-action-btn" id="cs-act-another">Check again</button>
        </div>

        <div class="cs-footer">Screening aid, not a legal finding.</div>
      </div>
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

    // Action: Open full report (opens exact saved report by ID/Proof ID without prefill or re-running)
    const openBtn = activeBubble.querySelector('#cs-act-open');
    if (openBtn && savedReportId) {
      openBtn.addEventListener('click', async () => {
        let extKey = '';
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          try {
            const stored = await chrome.storage.local.get(['extensionKey']);
            extKey = typeof stored?.extensionKey === 'string' ? stored.extensionKey.trim() : '';
          } catch (e) {}
        }
        if (!extKey) {
          showBubbleKeyError('Add your key in the extension popup');
          return;
        }
        const fullUrl = `${API_BASE}/#/dashboard/history/${encodeURIComponent(savedReportId)}?key=${encodeURIComponent(extKey)}`;
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

    // Action: Download report (One-click direct PDF print for Job, UPI, and Message)
    const pdfBtn = activeBubble.querySelector('#cs-act-pdf');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', async () => {
        let extKey = '';
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          try {
            const stored = await chrome.storage.local.get(['extensionKey']);
            extKey = typeof stored?.extensionKey === 'string' ? stored.extensionKey.trim() : '';
          } catch (e) {}
        }
        if (!extKey) {
          showBubbleKeyError('Add your key in the extension popup');
          return;
        }
        if (!savedReportId) {
          showBubbleError("Couldn't load the report, try again");
          return;
        }

        const reportUrl = `${API_BASE}/#/dashboard/history/${encodeURIComponent(savedReportId)}?autoPrint=1&key=${encodeURIComponent(extKey)}`;
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'OPEN_REPORT', url: reportUrl });
        } else {
          window.open(reportUrl, '_blank');
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

    positionBubbleInViewport(activeBubble, activeBubblePos);
    requestAnimationFrame(() => positionBubbleInViewport(activeBubble, activeBubblePos));
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

  window.addEventListener('resize', () => {
    if (activeBubble) {
      positionBubbleInViewport(activeBubble, activeBubblePos);
    }
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
