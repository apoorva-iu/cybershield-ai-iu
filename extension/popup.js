import { API_BASE } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('chip-toggle');
  const openBtn = document.getElementById('open-site-btn');

  // Load toggle state from chrome.storage.local
  if (chrome?.storage?.local) {
    chrome.storage.local.get(['enabled'], (res) => {
      if (toggle) {
        toggle.checked = res.enabled !== false;
      }
    });
  }

  // Save toggle state
  if (toggle) {
    toggle.addEventListener('change', () => {
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ enabled: toggle.checked });
      }
    });
  }

  // Open website button
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      const targetUrl = API_BASE || 'http://localhost:3000';
      if (chrome?.tabs?.create) {
        chrome.tabs.create({ url: targetUrl });
      } else {
        window.open(targetUrl, '_blank');
      }
    });
  }
});

