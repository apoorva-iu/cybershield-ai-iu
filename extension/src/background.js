// Cyber Shield Extension - Background Service Worker
import { API_BASE } from '../config.js';

// Setup context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['enabled', 'lastCheckType'], (res) => {
    if (res.enabled === undefined) {
      chrome.storage.local.set({ enabled: true });
    }
    if (!res.lastCheckType) {
      chrome.storage.local.set({ lastCheckType: 'message' });
    }
  });

  chrome.contextMenus.create({
    id: 'check-selection-menu',
    title: 'Check selection with Cyber Shield',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'check-selection-menu' && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'RUN_FROM_MENU',
      selectionText: info.selectionText || ''
    }).catch(() => {
      // Content script might not be injected on restricted pages (e.g. chrome://)
    });
  }
});

// Message listener for content script & popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CHECK') {
    const checkType = msg.checkType || 'message';
    const payload = msg.payload || {};
    const rawText = typeof payload.text === 'string' ? payload.text : (typeof payload.desc === 'string' ? payload.desc : '');
    const text = rawText.trim();

    if (text.length < 10) {
      sendResponse({
        ok: false,
        status: 400,
        error: 'Select a little more text (at least 10 characters).'
      });
      return false;
    }

    let endpoint = '';
    let reqBody = {};

    if (checkType === 'job') {
      endpoint = `${API_BASE}/api/verify`;
      reqBody = {
        url: typeof payload.url === 'string' ? payload.url : '',
        company: typeof payload.company === 'string' ? payload.company : '',
        email: typeof payload.email === 'string' ? payload.email : '',
        desc: text.slice(0, 20000)
      };
    } else if (checkType === 'upi') {
      endpoint = `${API_BASE}/api/upi/check`;
      reqBody = {
        input: text.slice(0, 20000),
        source: 'text'
      };
    } else {
      endpoint = `${API_BASE}/api/message/check`;
      reqBody = {
        input: text.slice(0, 20000),
        source: 'text'
      };
    }

    const runRequest = async () => {
      try {
        let res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(reqBody)
        });

        // If upi check returns 400 specifically complaining about source, retry with source: "pasted"
        if (checkType === 'upi' && res.status === 400 && reqBody.source === 'text') {
          try {
            const errClone = await res.clone().json();
            if (errClone && typeof errClone.error === 'string' && errClone.error.includes('source')) {
              reqBody.source = 'pasted';
              res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(reqBody)
              });
            }
          } catch (e) {}
        }

        if (res.status === 429) {
          sendResponse({
            ok: false,
            status: 429,
            error: 'Too many checks right now. Please try again in a minute.'
          });
          return;
        }

        let json = null;
        try {
          json = await res.json();
        } catch (e) {
          json = null;
        }

        if (res.status === 400) {
          sendResponse({
            ok: false,
            status: 400,
            error: 'Select a little more text (at least 10 characters).'
          });
          return;
        }

        if (!res.ok) {
          const errMsg = (json && (json.message || json.error))
            ? String(json.message || json.error)
            : `Check failed (${res.status})`;
          sendResponse({
            ok: false,
            status: res.status,
            error: errMsg
          });
          return;
        }

        sendResponse({
          ok: true,
          status: res.status,
          checkType,
          data: json
        });
      } catch (err) {
        sendResponse({
          ok: false,
          status: 0,
          error: 'Could not reach Cyber Shield.'
        });
      }
    };

    runRequest();
    return true; // Keep channel open for async response
  }

  if (msg.type === 'OPEN_REPORT') {
    if (msg.url) {
      chrome.tabs.create({ url: msg.url });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'OPEN_REPORT_HTML') {
    chrome.storage.local.set({ pendingReport: msg.data }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});
