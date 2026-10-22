import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowRight, X, Check, Loader2 } from 'lucide-react';
import { PLANS } from '../config/plans';

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function PricingCards() {
  const [activePlanModal, setActivePlanModal] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [friendlyMessage, setFriendlyMessage] = useState('');

  const modalInputRef = useRef(null);

  useEffect(() => {
    if (activePlanModal && modalInputRef.current) {
      setTimeout(() => {
        modalInputRef.current?.focus();
      }, 50);
    }
  }, [activePlanModal]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && activePlanModal) {
        closeModal();
      }
    };
    if (activePlanModal) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [activePlanModal]);

  const openModal = (planId) => {
    setActivePlanModal(planId);
    setEmailInput('');
    setEmailError('');
    setSubmitSuccess(false);
    setFriendlyMessage('');
  };

  const closeModal = () => {
    setActivePlanModal(null);
    setEmailInput('');
    setEmailError('');
    setIsSubmitting(false);
    setSubmitSuccess(false);
    setFriendlyMessage('');
  };

  const handleWaitlistSubmit = async (e) => {
    e.preventDefault();
    setEmailError('');
    setFriendlyMessage('');

    const trimmed = emailInput.trim();
    if (!trimmed) {
      setEmailError('Please enter your email address.');
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError('Please enter a valid email address (e.g. name@example.com).');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, plan: activePlanModal })
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setFriendlyMessage(
          data.message ||
            `You're already on the waitlist for the ${
              activePlanModal ? activePlanModal.toUpperCase() : ''
            } plan! We'll notify you as soon as early access opens.`
        );
        setSubmitSuccess(true);
      } else if (!res.ok) {
        setEmailError(data.error || 'Failed to submit. Please try again.');
      } else {
        setSubmitSuccess(true);
        setFriendlyMessage(data.message || "You're on the waitlist! We'll be in touch soon.");
      }
    } catch (err) {
      setEmailError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="pricing-cards-grid">
        {PLANS.map((plan) => {
          const isHighlight = plan.isPrimary;
          return (
            <div
              key={plan.id}
              className={`pricing-plan-card ${isHighlight ? 'plan-highlighted' : ''}`}
            >
              <span
                className={`plan-badge-top ${
                  plan.isAvailable ? 'badge-available' : 'badge-soon'
                }`}
              >
                {plan.status}
              </span>

              <h3 className="plan-header-title">{plan.name}</h3>

              <div className="plan-price-wrap">
                {plan.isAvailable ? (
                  <div className="plan-price-val">{plan.priceDisplay}</div>
                ) : (
                  <div className="plan-price-announced">{plan.priceDisplay}</div>
                )}
                <div className="plan-price-sub">{plan.billingNote}</div>
              </div>

              <p className="plan-desc">{plan.description}</p>

              <ul className="plan-features-list">
                {plan.features.slice(0, 4).map((feat, idx) => (
                  <li key={idx} className="plan-feature-item">
                    <CheckCircle2
                      size={16}
                      color={
                        plan.isAvailable
                          ? 'var(--risk-ok-text, #34D399)'
                          : 'var(--brand, #4DA3FF)'
                      }
                    />
                    <span>
                      {feat.text}
                      {feat.planned && <span className="tag-planned">Planned</span>}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="plan-card-action">
                {plan.isAvailable ? (
                  <Link to="/tools" className="btn-card-primary">
                    <span>{plan.buttonText}</span>
                    <ArrowRight size={15} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn-card-secondary"
                    onClick={() => openModal(plan.id)}
                  >
                    <span>{plan.buttonText}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--muted)', marginTop: '24px' }}>
        Screening aid, not a legal finding.
      </p>

      {/* Waitlist Modal */}
      {activePlanModal && (
        <div
          className="waitlist-modal-backdrop"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="waitlist-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="waitlist-modal-title-cards"
          >
            <button
              type="button"
              className="waitlist-modal-close"
              onClick={closeModal}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>

            <div className="waitlist-modal-header">
              <h3 id="waitlist-modal-title-cards">
                Join the {activePlanModal === 'pro' ? 'Pro' : 'Teams'} waitlist
              </h3>
              <p>
                We will notify you as soon as early access opens. No payment or credit card
                required.
              </p>
            </div>

            {submitSuccess ? (
              <div className="waitlist-success-box">
                <div className="waitlist-success-icon">
                  <Check size={24} />
                </div>
                <h4>You&apos;re on the list!</h4>
                <p>{friendlyMessage}</p>
                <button
                  type="button"
                  className="btn-card-primary"
                  onClick={closeModal}
                  style={{ width: '100%', maxWidth: '200px' }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form className="waitlist-form" onSubmit={handleWaitlistSubmit} noValidate>
                <div className="waitlist-input-group">
                  <label htmlFor="waitlist-cards-email">Email address</label>
                  <input
                    ref={modalInputRef}
                    id="waitlist-cards-email"
                    type="email"
                    className="waitlist-input"
                    placeholder="you@example.com"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      if (emailError) setEmailError('');
                    }}
                    disabled={isSubmitting}
                    required
                  />
                </div>

                {emailError && <p className="waitlist-error-msg">{emailError}</p>}

                <button
                  type="submit"
                  className="btn-card-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="spinner" />
                      <span>Joining waitlist&hellip;</span>
                    </>
                  ) : (
                    <span>Join waitlist</span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PricingCards;
