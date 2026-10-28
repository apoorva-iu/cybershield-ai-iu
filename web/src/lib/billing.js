/**
 * Billing & Upgrade Integration
 * Single source of truth for payment flows and upgrade initialization.
 * The next step will replace startUpgrade() with the full checkout flow.
 */

export function startUpgrade(options = {}) {
  // If modal already exists in DOM, do not duplicate; focus its close button
  const existing = document.getElementById('cs-upgrade-placeholder-modal');
  if (existing) {
    const existingBtn = existing.querySelector('#cs-upgrade-close-btn');
    if (existingBtn) existingBtn.focus();
    return { close: () => existing.remove() };
  }

  const previousActiveElement = document.activeElement;
  const originalOverflow = document.body.style.overflow;

  // Build modal DOM
  const backdrop = document.createElement('div');
  backdrop.id = 'cs-upgrade-placeholder-modal';
  backdrop.className = 'upgrade-modal-backdrop';
  backdrop.setAttribute('role', 'presentation');

  backdrop.innerHTML = `
    <div
      class="upgrade-modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cs-upgrade-modal-title"
    >
      <button
        type="button"
        class="upgrade-modal-close"
        id="cs-upgrade-close-x"
        aria-label="Close modal"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div class="upgrade-modal-header">
        <h3 id="cs-upgrade-modal-title">Upgrade to Pro</h3>
        <p class="upgrade-modal-message">
          Pro payments are being set up. The checkout opens here soon.
        </p>
      </div>

      <div class="upgrade-modal-actions">
        <button
          type="button"
          class="btn-card-primary"
          id="cs-upgrade-close-btn"
        >
          Close
        </button>
      </div>
    </div>
  `;

  function closeModal() {
    window.removeEventListener('keydown', handleKeyDown);
    if (backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
    document.body.style.overflow = originalOverflow;
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      try {
        previousActiveElement.focus();
      } catch (err) {
        // Ignore focus restore error
      }
    }
    if (typeof options.onClose === 'function') {
      options.onClose();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeModal();
    }
  });

  window.addEventListener('keydown', handleKeyDown);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(backdrop);

  const closeX = backdrop.querySelector('#cs-upgrade-close-x');
  const closeBtn = backdrop.querySelector('#cs-upgrade-close-btn');

  if (closeX) closeX.addEventListener('click', closeModal);
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
    setTimeout(() => {
      try {
        closeBtn.focus();
      } catch (err) {}
    }, 40);
  }

  return { close: closeModal };
}

export default {
  startUpgrade
};

