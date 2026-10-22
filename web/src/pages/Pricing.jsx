import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui';
import { PageTransition } from '../components/wow';
import {
  CheckCircle2,
  Sparkles,
  ChevronDown,
  X,
  Check,
  ArrowRight,
  ShieldAlert,
  Loader2
} from 'lucide-react';
import { PLANS, COMPARISON_CATEGORIES, PRICING_FAQ } from '../config/plans';
import './pricing.css';

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function Pricing() {
  const [activePlanModal, setActivePlanModal] = useState(null); // 'pro' | 'teams' | null
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [friendlyMessage, setFriendlyMessage] = useState('');
  const [expandedFaq, setExpandedFaq] = useState({ 'faq-billing': true });

  const modalInputRef = useRef(null);

  // Focus modal input on open
  useEffect(() => {
    if (activePlanModal && modalInputRef.current) {
      setTimeout(() => {
        modalInputRef.current?.focus();
      }, 50);
    }
  }, [activePlanModal]);

  // Handle global Escape key to close modal
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
        // Friendly duplicate notification
        setFriendlyMessage(
          data.message ||
            `You're already on the waitlist for the ${
              activePlanModal ? activePlanModal.toUpperCase() : ''
            } plan! We'll notify you as soon as early access opens.`
        );
        setSubmitSuccess(true);
      } else if (!res.ok) {
        setEmailError(data.error || 'Failed to submit. Please try again in a few moments.');
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

  const toggleFaq = (id) => {
    setExpandedFaq((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <PageTransition>
      <div className="pricing-page-wrap">
        <Container>
          {/* Hero Header */}
          <div className="pricing-hero">
            <span className="pricing-eyebrow">
              <Sparkles size={14} />
              Transparent Screening Plans
            </span>
            <h1>Simple, honest plans for every check</h1>
            <p>
              Screen job offers, payment requests, and incoming messages with verifiable evidence.
              Free for everyone today, with expanded throughput and institutional tools planned.
            </p>
          </div>

          {/* Equal-Height Plan Cards */}
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

                  {/* Features List */}
                  <ul className="plan-features-list">
                    {plan.features.map((feat, idx) => (
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

                  {/* Action Button */}
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

          {/* Compare Plans Table */}
          <section className="pricing-compare-section">
            <div className="pricing-section-title-wrap">
              <h2>Compare plan features</h2>
              <p>
                A comprehensive comparison of screening vectors, throughput limits, and
                organizational features.
              </p>
            </div>

            {/* Desktop Table View (>= 768px) */}
            <div className="compare-table-container">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th className="col-feature">Feature</th>
                    <th className="col-plan">Free</th>
                    <th className="col-plan">Pro</th>
                    <th className="col-plan">Teams</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_CATEGORIES.map((cat, catIdx) => (
                    <React.Fragment key={catIdx}>
                      <tr className="category-header-row">
                        <td colSpan={4}>{cat.title}</td>
                      </tr>
                      {cat.rows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="feature-data-row">
                          <td className="col-feature">
                            <div className="feature-meta">
                              <strong>{row.feature}</strong>
                              <span>{row.desc}</span>
                            </div>
                          </td>
                          {['free', 'pro', 'teams'].map((pId) => {
                            const val = row[pId];
                            return (
                              <td key={pId} className="col-plan">
                                {val === true && (
                                  <CheckCircle2 size={18} className="check-icon-active" />
                                )}
                                {val === false && (
                                  <span className="dash-icon-empty">&mdash;</span>
                                )}
                                {val === '-' && (
                                  <span className="dash-icon-empty">&mdash;</span>
                                )}
                                {typeof val === 'string' && val !== '-' && <span>{val}</span>}
                                {typeof val === 'object' && val !== null && (
                                  <span>
                                    {val.text}
                                    {val.planned && (
                                      <span className="tag-planned">Planned</span>
                                    )}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Accordion View (< 768px) */}
            <div className="compare-mobile-accordion">
              {COMPARISON_CATEGORIES.map((cat, catIdx) => (
                <div key={catIdx} className="mobile-category-card">
                  <h3 className="mobile-category-title">{cat.title}</h3>
                  {cat.rows.map((row, rowIdx) => (
                    <div key={rowIdx} className="mobile-feature-item">
                      <strong>{row.feature}</strong>
                      <p>{row.desc}</p>
                      <div className="mobile-plan-values">
                        <div className="mobile-plan-col">
                          <span className="mobile-plan-name">Free</span>
                          {row.free === true ? (
                            <CheckCircle2 size={16} className="check-icon-active" />
                          ) : row.free === false || row.free === '-' ? (
                            <span>&mdash;</span>
                          ) : (
                            <span>{typeof row.free === 'object' ? row.free.text : row.free}</span>
                          )}
                        </div>

                        <div className="mobile-plan-col">
                          <span className="mobile-plan-name">Pro</span>
                          {row.pro === true ? (
                            <CheckCircle2 size={16} className="check-icon-active" />
                          ) : row.pro === false || row.pro === '-' ? (
                            <span>&mdash;</span>
                          ) : (
                            <span>
                              {typeof row.pro === 'object' ? row.pro.text : row.pro}
                              {row.pro?.planned && (
                                <span className="tag-planned">Planned</span>
                              )}
                            </span>
                          )}
                        </div>

                        <div className="mobile-plan-col">
                          <span className="mobile-plan-name">Teams</span>
                          {row.teams === true ? (
                            <CheckCircle2 size={16} className="check-icon-active" />
                          ) : row.teams === false || row.teams === '-' ? (
                            <span>&mdash;</span>
                          ) : (
                            <span>
                              {typeof row.teams === 'object' ? row.teams.text : row.teams}
                              {row.teams?.planned && (
                                <span className="tag-planned">Planned</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {/* Pricing FAQ Section */}
          <section className="pricing-faq-section">
            <div className="pricing-section-title-wrap">
              <h2>Frequently Asked Questions</h2>
              <p>Everything you need to know about pricing, billing, and privacy.</p>
            </div>

            <div className="pricing-faq-list">
              {PRICING_FAQ.map((faq) => {
                const isExpanded = !!expandedFaq[faq.id];
                return (
                  <div key={faq.id} className="pricing-faq-item">
                    <button
                      type="button"
                      className="pricing-faq-trigger"
                      aria-expanded={isExpanded}
                      onClick={() => toggleFaq(faq.id)}
                    >
                      <span>{faq.question}</span>
                      <ChevronDown size={18} />
                    </button>
                    {isExpanded && <div className="pricing-faq-body">{faq.answer}</div>}
                  </div>
                );
              })}
            </div>

            <div className="pricing-disclaimer">
              Screening aid, not a legal finding.
            </div>
          </section>
        </Container>

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
              aria-labelledby="waitlist-modal-title"
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
                <h3 id="waitlist-modal-title">
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
                    <label htmlFor="waitlist-email">Email address</label>
                    <input
                      ref={modalInputRef}
                      id="waitlist-email"
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
    </PageTransition>
  );
}

export default Pricing;
