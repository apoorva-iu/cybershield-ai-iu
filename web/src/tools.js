import { Briefcase, Wallet, MessageSquare, Sparkles } from 'lucide-react';

export const TOOLS = [
  {
    id: 'job',
    slug: 'job-scam-check',
    name: 'Job Scam Check',
    status: 'live',
    href: '/tools/job-scam-check',
    iconName: 'briefcase',
    Icon: Briefcase,
    line: 'Fake jobs, internships and registration fees',
    examples: [
      'Example: Telegram data entry job paying Rs 4,500 daily. Requires Rs 1,500 security deposit for onboarding software.',
      'Example: Selected for senior analyst role without interview. Pay Rs 2,500 verification fee to release appointment letter.',
      'Example: Urgent work-from-home review assistant. Deposit Rs 1,000 to unlock initial task package and commissions.'
    ]
  },
  {
    id: 'upi',
    slug: 'upi-payment-check',
    kind: 'upi',
    name: 'UPI and Payment Check',
    status: 'live',
    href: '/tools/upi-payment-check',
    iconName: 'wallet',
    Icon: Wallet,
    line: 'Pay-to-receive, collect requests and refund links',
    examples: [
      'Example: To receive your approved cashback of Rs 2,500, enter your UPI PIN in the Google Pay collect request now.',
      'Example: Sent Rs 15,000 by mistake to your account. Please refund immediately to refund-dept88@fakebank.',
      'Example: Electricity will be disconnected tonight due to unpaid bill. Pay Rs 150 reconnect charge via collect request.'
    ]
  },
  {
    id: 'message',
    slug: 'message-scanner',
    kind: 'message',
    name: 'Message Scanner',
    status: 'live',
    href: '/tools/message-scanner',
    iconName: 'message-square',
    Icon: MessageSquare,
    line: 'SMS, WhatsApp, Telegram or email: paste text or upload a screenshot',
    examples: [
      'Example: Dear customer, your bank account is suspended due to pending KYC. Update Aadhaar at http://bit.ly/fake-kyc-verify immediately.',
      'Example: CBI Notice: A courier parcel under your Aadhaar has been seized for illegal contraband. Connect via video call or arrest warrant issued.',
      'Example: Congratulations! You won Rs 25,00,000 in promotional lucky draw. Send Rs 2,500 processing charges to claim certificate.'
    ]
  }
];

export const UPCOMING_TOOL = {
  name: 'More tools coming',
  line: 'Link checker and document checker are planned.',
  iconName: 'sparkles',
  Icon: Sparkles
};

export function getToolBySlug(slug) {
  if (!slug) return null;
  const s = String(slug).toLowerCase().trim();
  return TOOLS.find((t) => t.slug === s || t.id === s) || null;
}

