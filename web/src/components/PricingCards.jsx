import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { PLANS } from '../config/plans';
import { useAuth, setReturnTo } from '../auth';
import { startUpgrade } from '../lib/billing';

export function PricingCards() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const handleProClick = () => {
    if (!session) {
      setReturnTo('/pricing');
      navigate('/login', { state: { from: '/pricing' } });
      return;
    }
    startUpgrade();
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
                  plan.id === 'free' ? 'badge-available' : 'badge-pro'
                }`}
              >
                {plan.status}
              </span>

              <h3 className="plan-header-title">{plan.name}</h3>

              <div className="plan-price-wrap">
                <div className="plan-price-val">{plan.priceDisplay}</div>
                <div className="plan-price-sub">{plan.billingNote}</div>
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
                  <Link to="/tools" className="btn-card-primary">
                    <span>{plan.buttonText}</span>
                    <ArrowRight size={15} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn-card-primary btn-pro-action"
                    onClick={handleProClick}
                  >
                    <span>{plan.buttonText}</span>
                    <ArrowRight size={15} />
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
    </div>
  );
}

export default PricingCards;
