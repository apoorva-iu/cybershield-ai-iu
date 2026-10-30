/**
 * Central Plan Configuration & Limits
 * Single source of truth for Cyber Shield tiers (Free, Pro).
 * Exact rupee pricing: Free (₹0) and Pro (₹1).
 */

export const PLAN_LIMITS = {
  freeAnonChecks: 3,
  freeSignedTotal: 5,
  get freeExtra() {
    return this.freeSignedTotal - this.freeAnonChecks;
  },
  freePeriod: 'month',
  proPriceRupees: 1,
  proDays: 30,
  proChecks: 100
};

export function getPlans(limits = PLAN_LIMITS) {
  const freeExtra =
    typeof limits.freeExtra === 'number'
      ? limits.freeExtra
      : limits.freeSignedTotal - limits.freeAnonChecks;

  return [
    {
      id: 'free',
      name: 'Free',
      status: 'Available now',
      isAvailable: true,
      isPrimary: false,
      price: 0,
      priceDisplay: '₹0',
      billingNote: 'Free forever',
      description:
        'Essential screening for individuals checking job offers, payment requests, and incoming messages.',
      buttonText: 'Start free',
      buttonLink: '/tools',
      limits: {
        checksWithoutAccount: limits.freeAnonChecks,
        checksPerMonth: limits.freeSignedTotal,
        historyRetentionDays: 30,
        seats: 1
      },
      features: [
        { text: 'Job, UPI and Message checks' },
        { text: 'Text and screenshot input' },
        { text: 'Reasons and highlighted phrases' },
        { text: 'Proof ID and Access Code, verify any time' },
        { text: 'PDF and JSON download' },
        {
          text: `${limits.freeSignedTotal} checks per month (${limits.freeAnonChecks} without an account, ${freeExtra} more after signing in)`
        }
      ]
    },
    {
      id: 'pro',
      name: 'Pro',
      status: 'Pro',
      isAvailable: true,
      isPrimary: true,
      price: limits.proPriceRupees,
      priceDisplay: `₹${limits.proPriceRupees}`,
      billingNote: `One-time payment. ${limits.proDays} days. No auto-renewal.`,
      description:
        'Expanded check allowance and permanent history retention for active screening.',
      buttonText: `Upgrade for ₹${limits.proPriceRupees}`,
      buttonLink: null,
      limits: {
        checksWithoutAccount: null,
        checksPerMonth: limits.proChecks,
        historyRetentionDays: 'Unlimited',
        seats: 1
      },
      features: [
        { text: 'Everything in Free' },
        { text: `Up to ${limits.proChecks} checks in ${limits.proDays} days` },
        { text: 'Browser extension (Chrome, Edge, Brave)' },
        { text: 'Saved history and receipts for every check' },
        { text: 'Same Proof ID verification and downloads' }
      ]
    }
  ];
}

export const PLANS = getPlans();

export function getPricingFaq(limits = PLAN_LIMITS) {
  const extra =
    typeof limits.freeExtra === 'number'
      ? limits.freeExtra
      : limits.freeSignedTotal - limits.freeAnonChecks;

  return [
    {
      id: 'faq-free',
      question: 'Is Cyber Shield free?',
      answer: `Yes. The Free plan gives you ${limits.freeSignedTotal} checks per month across the Job, UPI and Message tools. Counts reset on the 1st of each month.`
    },
    {
      id: 'faq-account',
      question: 'Do I need an account?',
      answer: `Not to start. You can run ${limits.freeAnonChecks} checks without signing in. Signing in gives you ${extra} more checks that month and saves your history.`
    },
    {
      id: 'faq-pro',
      question: 'What does Pro include?',
      answer: `Pro is a ${limits.proDays}-day pass with up to ${limits.proChecks} checks and access to the browser extension (Chrome, Edge, Brave), for a one-time payment of ₹${limits.proPriceRupees}. It does not renew automatically.`
    },
    {
      id: 'faq-payment',
      question: 'How does payment work?',
      answer:
        'You pay once through a secure checkout. Payments are in test mode while we build, so no real money is charged yet.'
    },
    {
      id: 'faq-legal',
      question: 'Can I rely on a result as proof of a scam?',
      answer:
        'No. Cyber Shield is a screening aid, not a legal finding. It cannot confirm that a receipt is genuine, who owns a UPI ID, or who sent a message. When the evidence is thin it says "Unable to verify" instead of guessing.'
    }
  ];
}

export const PRICING_FAQ = getPricingFaq();

export function renderLimit(val, fallback = 'Fair-use limit') {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

export const COMPARISON_CATEGORIES = [];
