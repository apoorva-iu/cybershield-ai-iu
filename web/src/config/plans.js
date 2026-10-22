/**
 * Central Plan Configuration & Limits
 * Single source of truth for Cyber Shield tiers (Free, Pro, Teams).
 * Unknown or unfinalized limits use `null` and render as "Fair-use limit".
 */

export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    status: 'Available now',
    isAvailable: true,
    isPrimary: true,
    price: 0,
    priceDisplay: '$0',
    billingNote: 'Free forever. No credit card required.',
    description: 'Screen job offers, UPI requests, and messages with verifiable evidence. No account required to start.',
    buttonText: 'Start free',
    buttonLink: '/tools',
    limits: {
      checksWithoutAccount: 3,
      checksPerMonth: null, // Fair-use limit
      historyRetentionDays: 30, // 30 days for anonymous, saved history with free account
      seats: 1,
      maxScreenshotSizeMb: 10,
      priorityQueue: false
    },
    features: [
      { text: 'Job, UPI and Message checks', planned: false },
      { text: 'Text and screenshot input (in-memory OCR)', planned: false },
      { text: 'Reasons and highlighted phrases', planned: false },
      { text: 'Cryptographic Proof ID and Access Code', planned: false },
      { text: 'Independent ledger verification on /verify', planned: false },
      { text: 'Downloadable PDF reports and JSON receipts', planned: false },
      { text: 'Browser extension (Chrome, Edge, Brave)', planned: false },
      { text: '3 free checks without an account, then free account with saved history', planned: false }
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    status: 'Coming soon',
    isAvailable: false,
    isPrimary: false,
    price: null,
    priceDisplay: 'Pricing to be announced',
    billingNote: 'Planned for individual job seekers & power users',
    description: 'Higher check throughput, priority OCR processing, and full history retention for active seekers.',
    buttonText: 'Join waitlist',
    buttonLink: null,
    limits: {
      checksWithoutAccount: null,
      checksPerMonth: null, // Higher check limit (Fair-use limit placeholder until announced)
      historyRetentionDays: 'Unlimited',
      seats: 1,
      maxScreenshotSizeMb: 25,
      priorityQueue: true
    },
    features: [
      { text: 'All Free tier screening capabilities', planned: false },
      { text: 'Higher check limit', planned: true },
      { text: 'Priority processing for screenshot checks', planned: true },
      { text: 'Unlimited saved history', planned: true },
      { text: 'Bulk checking for multiple offers or messages', planned: true },
      { text: 'Batch export of all receipts and reports', planned: true },
      { text: 'Priority email support', planned: true }
    ]
  },
  {
    id: 'teams',
    name: 'Teams',
    status: 'Coming soon',
    isAvailable: false,
    isPrimary: false,
    price: null,
    priceDisplay: 'Pricing to be announced',
    billingNote: 'Planned for campus placement cells & hiring teams',
    description: 'Screening infrastructure, audit trails, and multi-seat management for university placement cells and hiring teams.',
    buttonText: 'Join waitlist',
    buttonLink: null,
    limits: {
      checksWithoutAccount: null,
      checksPerMonth: null, // Fair-use limit
      historyRetentionDays: 'Unlimited',
      seats: 'Multiple seats',
      maxScreenshotSizeMb: 50,
      priorityQueue: true
    },
    features: [
      { text: 'All Pro tier screening capabilities', planned: false },
      { text: 'Multiple seats with workspace permissions', planned: true },
      { text: 'Shared workspace for placement cells / organisations', planned: true },
      { text: 'Admin view of institutional checks', planned: true },
      { text: 'Organisation audit trail on verification ledger', planned: true },
      { text: 'Domain impersonation monitoring & brand alerts', planned: true },
      { text: 'Dedicated onboarding & organization support', planned: true }
    ]
  }
];

/**
 * Renders an honest label for limit values:
 * If null -> "Fair-use limit"
 */
export function renderLimit(val, fallback = 'Fair-use limit') {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

/**
 * Feature comparison matrix
 */
export const COMPARISON_CATEGORIES = [
  {
    title: 'Screening & Detection',
    rows: [
      {
        feature: 'Job scam screening',
        desc: 'Advance fees, fake recruiters, domain age and corporate registry checks',
        free: true,
        pro: true,
        teams: true
      },
      {
        feature: 'UPI payment & collect fraud checks',
        desc: 'Pay-to-receive tricks, handle syntax, collect request mechanics',
        free: true,
        pro: true,
        teams: true
      },
      {
        feature: 'Message & phishing scanner',
        desc: 'SMS, WhatsApp, and email extortion, cutoff threats, and suspicious links',
        free: true,
        pro: true,
        teams: true
      },
      {
        feature: 'In-memory OCR screenshot input',
        desc: 'Extract text directly from mobile/desktop screenshots without storing images',
        free: true,
        pro: true,
        teams: true
      },
      {
        feature: 'Highlighted phrases & reasons',
        desc: 'Transparent plain-language evidence explaining why phrasing is flagged',
        free: true,
        pro: true,
        teams: true
      },
      {
        feature: 'Proof ID & Access Code',
        desc: 'Client-side access credential and immutable SHA-256 canonical hash',
        free: true,
        pro: true,
        teams: true
      },
      {
        feature: 'Independent /verify page',
        desc: 'Ledger verification showing unaltered block timestamps and report hash',
        free: true,
        pro: true,
        teams: true
      },
      {
        feature: 'Downloadable PDF & JSON receipts',
        desc: 'Self-contained audit proof documents with cryptographic hashes',
        free: true,
        pro: true,
        teams: true
      },
      {
        feature: 'Browser extension',
        desc: 'Screen selections directly on job boards and messaging portals',
        free: true,
        pro: true,
        teams: true
      }
    ]
  },
  {
    title: 'Usage Limits & History',
    rows: [
      {
        feature: 'Checks without an account',
        desc: 'Immediate screening without signing in',
        free: '3 checks',
        pro: '-',
        teams: '-'
      },
      {
        feature: 'Monthly check volume',
        desc: 'Screening allocation per calendar month',
        free: 'Fair-use limit',
        pro: { text: 'Higher limit', planned: true },
        teams: { text: 'Fair-use limit', planned: true }
      },
      {
        feature: 'Saved history retention',
        desc: 'Permanent record of verified reports in dashboard',
        free: '30 days (Saved with account)',
        pro: { text: 'Unlimited', planned: true },
        teams: { text: 'Unlimited', planned: true }
      },
      {
        feature: 'Team seats',
        desc: 'Colleagues or coordinators on a shared plan',
        free: '1 user',
        pro: '1 user',
        teams: { text: 'Multiple seats', planned: true }
      }
    ]
  },
  {
    title: 'Advanced & Institutional',
    rows: [
      {
        feature: 'Priority OCR screenshot queue',
        desc: 'Dedicated processing queue for faster screenshot analysis',
        free: false,
        pro: { text: 'Priority queue', planned: true },
        teams: { text: 'Priority queue', planned: true }
      },
      {
        feature: 'Bulk check submissions',
        desc: 'Batch processing of job offers or message batches',
        free: false,
        pro: { text: 'Included', planned: true },
        teams: { text: 'Included', planned: true }
      },
      {
        feature: 'Batch export of receipts',
        desc: 'Download all verification receipts and ledger proofs at once',
        free: false,
        pro: { text: 'Included', planned: true },
        teams: { text: 'Included', planned: true }
      },
      {
        feature: 'Placement cell shared workspace',
        desc: 'Collaborative screening workspace for colleges and universities',
        free: false,
        pro: false,
        teams: { text: 'Included', planned: true }
      },
      {
        feature: 'Institutional admin view',
        desc: 'High-level dashboard of screened offers and aggregate campus metrics',
        free: false,
        pro: false,
        teams: { text: 'Included', planned: true }
      },
      {
        feature: 'Organisation audit trail',
        desc: 'Append-only ledger entries anchored to the institution',
        free: false,
        pro: false,
        teams: { text: 'Included', planned: true }
      },
      {
        feature: 'Domain impersonation monitoring',
        desc: 'Proactive detection of spoofed recruiter domains and typosquats',
        free: false,
        pro: false,
        teams: { text: 'Included', planned: true }
      },
      {
        feature: 'Support channel',
        desc: 'Assistance and inquiry turnaround',
        free: 'Community & GitHub',
        pro: { text: 'Email support', planned: true },
        teams: { text: 'Dedicated support', planned: true }
      }
    ]
  }
];

export const PRICING_FAQ = [
  {
    id: 'faq-billing',
    question: 'How does billing work?',
    answer:
      'The Free tier is available now with no payment or credit card required. Paid plans (Pro and Teams) are currently in development. Pricing will be announced prior to launch, and joining the waitlist is free and does not commit you to purchase.'
  },
  {
    id: 'faq-cancellation',
    question: 'Can I cancel a paid plan once launched?',
    answer:
      'Yes. When Pro and Teams launch, subscriptions will be available on monthly and annual terms that can be cancelled at any time with no lock-in. Your screening history and verification receipts remain yours.'
  },
  {
    id: 'faq-privacy',
    question: 'How is my check data and privacy handled?',
    answer:
      'We process check inputs (text, links, and screenshots) in memory. Screenshots are never saved or stored on our servers. For anonymous checks, data expires after 30 days. Cryptographic verification records store SHA-256 canonical hashes on the ledger, never your raw personal messages, payment details, or credentials.'
  },
  {
    id: 'faq-legal',
    question: 'Is a Cyber Shield result a legal finding?',
    answer:
      'No. Cyber Shield is an informational screening aid, not a legal finding or law enforcement determination. Evidence suggests risk indicators based on public registries, domain age, threat feeds, and text pattern analysis to help you make informed decisions before sharing personal or financial details.'
  }
];

