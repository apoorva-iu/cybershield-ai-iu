import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container } from '../components/ui';
import { PageTransition } from '../components/wow';
import { CheckCircle2, Sparkles, ChevronDown, ArrowRight } from 'lucide-react';
import { PLAN_LIMITS, getPlans, getPricingFaq } from '../config/plans';
import { useAuth, setReturnTo } from '../auth';
import { startUpgrade } from '../lib/billing';
import './pricing.css';

export function Pricing() {
  const { session } = useAuth();
  const navigate = useNavigate();

  // Accordion: strictly one open at a time (first FAQ item open by default)
  const [openFaqId, setOpenFaqId] = useState('faq-free');

  const plans = getPlans(PLAN_LIMITS);
  const faqItems = getPricingFaq(PLAN_LIMITS);

  const toggleFaq = (id) => {
    setOpenFaqId((prev) => (prev === id ? null : id));
  };

  const handleUpgradeClick = () => {
    if (!session) {
      setReturnTo('/pricing');
      navigate('/login', { state: { from: '/pricing' } });
      return;
    }
    startUpgrade();
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
            </p>
          </div>

          {/* Equal-Height Plan Cards (Two Cards Centred, Max Width ~880px) */}
          <div className="pricing-cards-grid">
            {plans.map((plan) => {
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

                  <h2 className="plan-header-title">{plan.name}</h2>

                  <div className="plan-price-wrap">
                    <div className="plan-price-val">{plan.priceDisplay}</div>
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

                  {/* Action Button */}
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
                        onClick={handleUpgradeClick}
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

          {/* Pricing FAQ Section (Exactly 5 items, one open at a time) */}
          <section className="pricing-faq-section" aria-labelledby="pricing-faq-title">
            <div className="pricing-section-title-wrap">
              <h2 id="pricing-faq-title">Frequently Asked Questions</h2>
              <p>Everything you need to know about checks, accounts, and screening limits.</p>
            </div>

            <div className="pricing-faq-list">
              {faqItems.map((faq) => {
                const isOpen = openFaqId === faq.id;
                return (
                  <div key={faq.id} className="pricing-faq-item">
                    <button
                      type="button"
                      className="pricing-faq-trigger"
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${faq.id}`}
                      onClick={() => toggleFaq(faq.id)}
                    >
                      <span>{faq.question}</span>
                      <ChevronDown size={18} />
                    </button>
                    {isOpen && (
                      <div id={`faq-answer-${faq.id}`} className="pricing-faq-body">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pricing-disclaimer">
              Screening aid, not a legal finding.
            </div>
          </section>
        </Container>
      </div>
    </PageTransition>
  );
}

export default Pricing;
