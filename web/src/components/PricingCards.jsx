import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { PLANS } from '../config/plans';
import { useAuth, setReturnTo } from '../auth';
import { startUpgrade, useBillingStatus, formatExpiryDate } from '../lib/billing';

export function PricingCards() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { isPro, expiresAt, paymentsMode, isPaymentsAvailable } = useBillingStatus(session);
  const [inProgress, setInProgress] = useState(false);

  const handleProClick = () => {
    if (!session) {
      setReturnTo('/pricing');
      navigate('/login', { state: { from: '/pricing' } });
      return;
    }
    if (!isPaymentsAvailable) return;
    startUpgrade({
      session,
      onProgress: setInProgress
    });
  };

  return (
    <div>
      <div className="pricing-cards-grid">
        {PLANS.map((plan) => {
          const isHighlight = plan.isPrimary;
          const isProCard = plan.id === 'pro';

          let buttonText = plan.buttonText;
          let isDisabled = false;

          if (isProCard) {
            if (!isPaymentsAvailable) {
              buttonText = 'Payments unavailable right now';
              isDisabled = true;
            } else if (inProgress) {
              buttonText = 'Processing...';
              isDisabled = true;
            } else if (isPro) {
              buttonText = 'Add 30 days for Rs 1';
            }
          }

          let badgeText = plan.status;
          let badgeClass = plan.id === 'free' ? 'badge-available' : 'badge-pro';

          if (isProCard && isPro) {
            badgeText = 'Current plan';
            badgeClass = 'badge-available badge-current';
          } else if (!isProCard && !isPro && session) {
            badgeText = 'Current plan';
            badgeClass = 'badge-available badge-current';
          }

          return (
            <div
              key={plan.id}
              className={`pricing-plan-card ${isHighlight ? 'plan-highlighted' : ''}`}
            >
              <span className={`plan-badge-top ${badgeClass}`}>
                {badgeText}
              </span>

              <h3 className="plan-header-title">{plan.name}</h3>

              <div className="plan-price-wrap">
                <div className="plan-price-val">{plan.priceDisplay}</div>
                <div className="plan-price-sub">
                  {isProCard && isPro && expiresAt ? (
                    <span style={{ color: 'var(--brand, #4DA3FF)', fontWeight: 600 }}>
                      Active until {formatExpiryDate(expiresAt)}
                    </span>
                  ) : (
                    plan.billingNote
                  )}
                </div>
              </div>

              <p className="plan-desc">{plan.description}</p>

              <ul className="plan-features-list">
                {plan.features.map((feat, idx) => (
                  <li key={idx} className="plan-feature-item">
                    <CheckCircle2
                      size={16}
                      color={
                        plan.id === 'free'
                          ? 'var(--risk-ok-text, #34D399)'
                          : 'var(--brand, #4DA3FF)'
                      }
                      aria-hidden="true"
                    />
                    <span>{feat.text}</span>
                  </li>
                ))}
              </ul>

              <div className="plan-card-action">
                {plan.id === 'free' ? (
                  <Link
                    to="/tools"
                    className="btn-card-primary"
                    onClick={() => {
                      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    }}
                  >
                    <span>{plan.buttonText}</span>
                    <ArrowRight size={15} />
                  </Link>
                ) : (
                  <div>
                    <button
                      type="button"
                      className={`btn-card-primary btn-pro-action ${
                        isDisabled ? 'is-disabled' : ''
                      }`}
                      onClick={handleProClick}
                      disabled={isDisabled}
                      style={
                        isDisabled
                          ? { opacity: 0.65, cursor: 'not-allowed', filter: 'grayscale(0.2)' }
                          : undefined
                      }
                    >
                      <span>{buttonText}</span>
                      {!isDisabled && <ArrowRight size={15} />}
                    </button>
                    {paymentsMode === 'test' && (
                      <p
                        className="pricing-test-mode-notice"
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-dim, #94A3B8)',
                          textAlign: 'center',
                          margin: '10px 0 0'
                        }}
                      >
                        Test mode: no real money is charged.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>


    </div>
  );
}

export default PricingCards;
