import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, X } from 'lucide-react';
import { formatResetDate } from '../lib/useUsage';

/**
 * On 429 quota_exceeded show a clear modal:
 * - sign_in: "You've used your 3 free checks. Sign in to get 2 more this month."
 *   Buttons: Sign in / Not now.
 * - upgrade: "You've used all 5 free checks this month. They reset on <date>."
 *   Buttons: See Pro (-> #/pricing) / Close.
 * - renew: "Your Pro checks are used up." with the same buttons.
 * Never lose the user's pasted text or screenshot when the modal opens.
 */
export function QuotaExceededModal({ isOpen, onClose, data }) {
  const navigate = useNavigate();
  const primaryBtnRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      primaryBtnRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const action = data?.action || 'sign_in';
  const resetsAt = data?.resetsAt;
  const formattedDate = formatResetDate(resetsAt);

  let title = 'Free checks limit reached';
  let message = "You've used your 3 free checks. Sign in to get 2 more this month.";
  let primaryLabel = 'Sign in';
  let secondaryLabel = 'Not now';
  let onPrimary = () => {
    onClose();
    navigate('/login');
  };

  if (action === 'upgrade') {
    title = 'Monthly checks limit reached';
    message = `You've used all 5 free checks this month. They reset on ${formattedDate}.`;
    primaryLabel = 'See Pro';
    secondaryLabel = 'Close';
    onPrimary = () => {
      onClose();
      navigate('/pricing');
    };
  } else if (action === 'renew') {
    title = 'Pro pass completed';
    message = 'Your Pro checks are used up.';
    primaryLabel = 'See Pro';
    secondaryLabel = 'Close';
    onPrimary = () => {
      onClose();
      navigate('/pricing');
    };
  }

  return (
    <div
      className="quota-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="quota-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quota-modal-title"
        aria-describedby="quota-modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="quota-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="quota-modal-icon-wrap" aria-hidden="true">
          <ShieldAlert size={28} color="var(--accent-blue, #0A66C2)" />
        </div>

        <h2 id="quota-modal-title" className="quota-modal-title">
          {title}
        </h2>

        <p id="quota-modal-desc" className="quota-modal-desc">
          {message}
        </p>

        <div className="quota-modal-actions">
          <button
            type="button"
            className="quota-modal-secondary-btn"
            onClick={onClose}
          >
            {secondaryLabel}
          </button>
          <button
            ref={primaryBtnRef}
            type="button"
            className="quota-modal-primary-btn"
            onClick={onPrimary}
          >
            {primaryLabel} &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuotaExceededModal;

