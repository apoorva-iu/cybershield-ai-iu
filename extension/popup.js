import { API_BASE } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  const baseUrl = (API_BASE || 'http://localhost:3000').replace(/\/+$/, '');
  const toggle = document.getElementById('chip-toggle');
  const openBtn = document.getElementById('open-site-btn');

  // Status card elements
  const statusCard = document.getElementById('account-status-card');
  const statusPlan = document.getElementById('status-plan');
  const statusBadge = document.getElementById('status-badge');
  const statusDetail = document.getElementById('status-detail');
  const statusProgressWrap = document.getElementById('status-progress-wrap');
  const statusProgressTrack = document.getElementById('status-progress-track');
  const statusProgressFill = document.getElementById('status-progress-fill');
  const progressRemainingText = document.getElementById('progress-remaining-text');
  const progressPercentText = document.getElementById('progress-percent-text');
  const statusActions = document.getElementById('status-actions');
  const statusActionLink = document.getElementById('status-action-link');

  // Linked key status row
  const linkedKeyRow = document.getElementById('linked-key-row');
  const linkedKeyText = document.getElementById('linked-key-text');
  const replaceKeyBtn = document.getElementById('replace-key-btn');
  const removeKeyBtn = document.getElementById('remove-key-btn');

  // Key input card
  const keyInputCard = document.getElementById('key-input-card');
  const keyInput = document.getElementById('ext-key-input');
  const saveKeyBtn = document.getElementById('save-key-btn');
  const cancelReplaceBtn = document.getElementById('cancel-replace-btn');
  const keyFeedback = document.getElementById('key-feedback');

  function openExternalUrl(url) {
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  }

  function showFeedback(msg, isError = false) {
    if (!keyFeedback) return;
    keyFeedback.textContent = msg;
    keyFeedback.className = isError ? 'key-feedback is-error' : 'key-feedback';
    keyFeedback.hidden = !msg;
  }

  function clearKeyInputDOM() {
    if (keyInput) {
      keyInput.value = '';
      keyInput.removeAttribute('value');
    }
  }

  function showLinkedKeyState(last4) {
    clearKeyInputDOM();
    if (keyFeedback) keyFeedback.hidden = true;
    if (linkedKeyText) {
      linkedKeyText.textContent = `Key linked ••••${last4 || ''}`;
    }
    if (linkedKeyRow) linkedKeyRow.hidden = false;
    if (keyInputCard) keyInputCard.hidden = true;
    if (cancelReplaceBtn) cancelReplaceBtn.hidden = true;
  }

  function showInputFormState(isReplacing = false) {
    clearKeyInputDOM();
    if (linkedKeyRow) linkedKeyRow.hidden = true;
    if (keyInputCard) keyInputCard.hidden = false;
    if (cancelReplaceBtn) cancelReplaceBtn.hidden = !isReplacing;
    if (keyInput) {
      keyInput.focus();
    }
  }

  function renderMissingKeyState() {
    showInputFormState(false);
    if (statusProgressWrap) statusProgressWrap.hidden = true;
    if (statusCard) statusCard.className = 'status-card';
    if (statusPlan) statusPlan.textContent = 'Add your key';
    if (statusBadge) statusBadge.hidden = true;
    if (statusDetail) {
      statusDetail.textContent = 'Paste your Pro extension key below to link your account.';
    }
    if (statusActions) statusActions.hidden = false;
    if (statusActionLink) {
      statusActionLink.textContent = 'Get extension key →';
      statusActionLink.dataset.targetUrl = `${baseUrl}/#/extension`;
    }
  }

  function renderRevokedKeyState(msg = 'Key was revoked. Add a new key') {
    // Automatically delete saved key
    if (chrome?.storage?.local) {
      chrome.storage.local.remove(['extensionKey', 'extensionKeyLast4']);
    }
    showInputFormState(false);
    if (statusProgressWrap) statusProgressWrap.hidden = true;
    if (statusCard) statusCard.className = 'status-card is-error';
    if (statusPlan) statusPlan.textContent = msg;
    if (statusBadge) {
      statusBadge.textContent = 'Revoked';
      statusBadge.className = 'status-badge err';
      statusBadge.hidden = false;
    }
    if (statusDetail) {
      statusDetail.textContent = 'Your extension key is no longer valid.';
    }
    if (statusActions) statusActions.hidden = false;
    if (statusActionLink) {
      statusActionLink.textContent = 'Generate new key →';
      statusActionLink.dataset.targetUrl = `${baseUrl}/#/extension`;
    }
    showFeedback(msg, true);
  }

  function renderProUsage(data) {
    if (statusCard) statusCard.className = 'status-card is-pro';
    if (statusPlan) statusPlan.textContent = 'Pro plan';
    if (statusBadge) {
      statusBadge.textContent = 'Active';
      statusBadge.className = 'status-badge pro';
      statusBadge.hidden = false;
    }
    if (statusActions) statusActions.hidden = true;

    if (data.unlimited || data.limit == null) {
      if (statusDetail) {
        statusDetail.textContent = 'Linked to your Pro account • Unlimited checks available';
      }
      if (statusProgressWrap) {
        statusProgressWrap.hidden = false;
        if (statusProgressFill) statusProgressFill.style.width = '100%';
        if (statusProgressTrack) {
          statusProgressTrack.setAttribute('aria-valuenow', '100');
          statusProgressTrack.setAttribute('aria-valuemax', '100');
        }
        if (progressRemainingText) progressRemainingText.textContent = 'Unlimited checks';
        if (progressPercentText) progressPercentText.textContent = '100%';
      }
    } else {
      const limit = typeof data.limit === 'number' ? data.limit : 100;
      const remaining = typeof data.remaining === 'number'
        ? data.remaining
        : Math.max(0, limit - (data.used || 0));
      const pct = Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)));

      if (statusDetail) {
        statusDetail.textContent = `${remaining} of ${limit} checks left this month`;
      }
      if (statusProgressWrap) {
        statusProgressWrap.hidden = false;
        if (statusProgressFill) statusProgressFill.style.width = `${pct}%`;
        if (statusProgressTrack) {
          statusProgressTrack.setAttribute('aria-valuenow', String(remaining));
          statusProgressTrack.setAttribute('aria-valuemax', String(limit));
        }
        if (progressRemainingText) progressRemainingText.textContent = `${remaining} checks remaining`;
        if (progressPercentText) progressPercentText.textContent = `${pct}% left`;
      }
    }
  }

  async function refreshAccountStatus(key) {
    const cleanKey = typeof key === 'string' ? key.trim() : '';
    if (!cleanKey) {
      renderMissingKeyState();
      return;
    }

    if (statusCard) statusCard.className = 'status-card';
    if (statusPlan) statusPlan.textContent = 'Checking key...';
    if (statusBadge) statusBadge.hidden = true;
    if (statusDetail) statusDetail.textContent = 'Verifying your plan and checks left...';
    if (statusActions) statusActions.hidden = true;
    if (statusProgressWrap) statusProgressWrap.hidden = true;

    try {
      const res = await fetch(`${baseUrl}/api/usage`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          'X-Client': 'extension'
        }
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        renderRevokedKeyState('Key was revoked. Add a new key');
        return;
      }

      if (res.status === 403 || (res.ok && data.plan !== 'pro')) {
        if (statusProgressWrap) statusProgressWrap.hidden = true;
        if (statusCard) statusCard.className = 'status-card is-warn';
        if (statusPlan) statusPlan.textContent = 'Free plan';
        if (statusBadge) {
          statusBadge.textContent = 'Pro needed';
          statusBadge.className = 'status-badge free';
          statusBadge.hidden = false;
        }
        if (statusDetail) statusDetail.textContent = 'Extension is a Pro feature.';
        if (statusActions) statusActions.hidden = false;
        if (statusActionLink) {
          statusActionLink.textContent = 'Upgrade to Pro →';
          statusActionLink.dataset.targetUrl = `${baseUrl}/#/pricing`;
        }
        return;
      }

      if (!res.ok) {
        if (statusProgressWrap) statusProgressWrap.hidden = true;
        if (statusCard) statusCard.className = 'status-card is-error';
        if (statusPlan) statusPlan.textContent = 'Status unavailable';
        if (statusBadge) statusBadge.hidden = true;
        if (statusDetail) {
          statusDetail.textContent = data.message || 'Could not reach Cyber Shield.';
        }
        if (statusActions) statusActions.hidden = true;
        return;
      }

      renderProUsage(data);
    } catch (err) {
      if (statusProgressWrap) statusProgressWrap.hidden = true;
      if (statusCard) statusCard.className = 'status-card is-error';
      if (statusPlan) statusPlan.textContent = 'Offline';
      if (statusBadge) statusBadge.hidden = true;
      if (statusDetail) {
        statusDetail.textContent = 'Could not reach Cyber Shield right now.';
      }
      if (statusActions) statusActions.hidden = true;
    }
  }

  if (statusActionLink) {
    statusActionLink.addEventListener('click', (e) => {
      e.preventDefault();
      openExternalUrl(statusActionLink.dataset.targetUrl || `${baseUrl}/#/extension`);
    });
  }

  // Load saved extension state and validate key
  if (chrome?.storage?.local) {
    chrome.storage.local.get(['enabled', 'extensionKey', 'extensionKeyLast4'], (res) => {
      if (toggle) {
        toggle.checked = res.enabled !== false;
      }
      const savedKey = typeof res.extensionKey === 'string' ? res.extensionKey.trim() : '';
      if (savedKey) {
        const last4 = res.extensionKeyLast4 || savedKey.slice(-4);
        showLinkedKeyState(last4);
        refreshAccountStatus(savedKey);
      } else {
        renderMissingKeyState();
      }
    });
  } else {
    renderMissingKeyState();
  }

  // Save key button (Validate before saving)
  if (saveKeyBtn && keyInput) {
    saveKeyBtn.addEventListener('click', async () => {
      const rawVal = keyInput.value.trim();
      if (!rawVal) {
        showFeedback('Paste your cs_ext_... key first.', true);
        return;
      }
      if (!rawVal.startsWith('cs_ext_')) {
        showFeedback('Key must start with cs_ext_', true);
        return;
      }

      saveKeyBtn.disabled = true;
      saveKeyBtn.textContent = 'Validating...';
      showFeedback('Checking key with Cyber Shield...', false);

      try {
        const res = await fetch(`${baseUrl}/api/usage`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${rawVal}`,
            'X-Client': 'extension'
          }
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
          clearKeyInputDOM();
          saveKeyBtn.disabled = false;
          saveKeyBtn.textContent = 'Save key';
          showFeedback('Key not valid, generate a new one', true);

          if (statusProgressWrap) statusProgressWrap.hidden = true;
          if (statusCard) statusCard.className = 'status-card is-error';
          if (statusPlan) statusPlan.textContent = 'Key not valid, generate a new one';
          if (statusBadge) {
            statusBadge.textContent = 'Invalid';
            statusBadge.className = 'status-badge err';
            statusBadge.hidden = false;
          }
          if (statusDetail) {
            statusDetail.textContent = 'This extension key is invalid or revoked.';
          }
          if (statusActions) statusActions.hidden = false;
          if (statusActionLink) {
            statusActionLink.textContent = 'Generate a new key →';
            statusActionLink.dataset.targetUrl = `${baseUrl}/#/extension`;
          }
          return;
        }

        if (res.status === 403 || (res.ok && data.plan !== 'pro')) {
          clearKeyInputDOM();
          saveKeyBtn.disabled = false;
          saveKeyBtn.textContent = 'Save key';
          showFeedback('Extension is a Pro feature.', true);

          if (statusProgressWrap) statusProgressWrap.hidden = true;
          if (statusCard) statusCard.className = 'status-card is-warn';
          if (statusPlan) statusPlan.textContent = 'Free plan';
          if (statusBadge) {
            statusBadge.textContent = 'Pro needed';
            statusBadge.className = 'status-badge free';
            statusBadge.hidden = false;
          }
          if (statusDetail) {
            statusDetail.textContent = 'Extension is a Pro feature. Upgrade to Pro on the website.';
          }
          if (statusActions) statusActions.hidden = false;
          if (statusActionLink) {
            statusActionLink.textContent = 'Upgrade to Pro →';
            statusActionLink.dataset.targetUrl = `${baseUrl}/#/pricing`;
          }
          return;
        }

        if (!res.ok) {
          saveKeyBtn.disabled = false;
          saveKeyBtn.textContent = 'Save key';
          showFeedback(data.message || `Validation failed (${res.status})`, true);
          return;
        }

        // Key is valid and active Pro! Extract only last 4 chars
        const last4 = rawVal.slice(-4);

        const onSavedSuccess = () => {
          clearKeyInputDOM();
          saveKeyBtn.disabled = false;
          saveKeyBtn.textContent = 'Save key';
          showFeedback('', false);
          showLinkedKeyState(last4);
          renderProUsage(data);
        };

        if (chrome?.storage?.local) {
          chrome.storage.local.set({
            extensionKey: rawVal,
            extensionKeyLast4: last4
          }, onSavedSuccess);
        } else {
          onSavedSuccess();
        }
      } catch (err) {
        saveKeyBtn.disabled = false;
        saveKeyBtn.textContent = 'Save key';
        showFeedback('Could not connect to Cyber Shield server.', true);
      }
    });

    keyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveKeyBtn.click();
      }
    });
  }

  // Replace key button
  if (replaceKeyBtn) {
    replaceKeyBtn.addEventListener('click', () => {
      showInputFormState(true);
    });
  }

  // Cancel replace button
  if (cancelReplaceBtn) {
    cancelReplaceBtn.addEventListener('click', () => {
      if (chrome?.storage?.local) {
        chrome.storage.local.get(['extensionKeyLast4', 'extensionKey'], (res) => {
          const last4 = res.extensionKeyLast4 || (res.extensionKey ? res.extensionKey.slice(-4) : '');
          if (last4) {
            showLinkedKeyState(last4);
          } else {
            showInputFormState(false);
          }
        });
      } else {
        showInputFormState(false);
      }
    });
  }

  // Remove key button
  if (removeKeyBtn) {
    removeKeyBtn.addEventListener('click', () => {
      clearKeyInputDOM();
      if (chrome?.storage?.local) {
        chrome.storage.local.remove(['extensionKey', 'extensionKeyLast4'], () => {
          renderMissingKeyState();
          showFeedback('Key removed.', false);
        });
      } else {
        renderMissingKeyState();
        showFeedback('Key removed.', false);
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
      openExternalUrl(baseUrl);
    });
  }
});
