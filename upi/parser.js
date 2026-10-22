'use strict';
const {
  extractLinks,
  extractEmails,
  extractPhoneNumbers,
  extractAmounts
} = require('../detectors/evidence');

// Fixed reference list of standard Indian bank and PSP handles for factual classification only
const WELL_KNOWN_HANDLES = {
  'okaxis': 'Axis Bank / Google Pay',
  'okhdfcbank': 'HDFC Bank / Google Pay',
  'okicici': 'ICICI Bank / Google Pay',
  'oksbi': 'State Bank of India / Google Pay',
  'ybl': 'Yes Bank / PhonePe',
  'axl': 'Axis Bank / PhonePe',
  'ibl': 'ICICI Bank / PhonePe',
  'paytm': 'Paytm Payments Bank',
  'upi': 'NPCI BHIM',
  'postbank': 'India Post Payments Bank',
  'sbi': 'State Bank of India',
  'hdfcbank': 'HDFC Bank',
  'icici': 'ICICI Bank',
  'axisbank': 'Axis Bank',
  'barodampay': 'Bank of Baroda',
  'kotak': 'Kotak Mahindra Bank',
  'indus': 'IndusInd Bank',
  'federal': 'Federal Bank',
  'idfcbank': 'IDFC FIRST Bank',
  'pnb': 'Punjab National Bank',
  'canara': 'Canara Bank',
  'unionbank': 'Union Bank of India',
  'airtel': 'Airtel Payments Bank',
  'freecharge': 'Freecharge',
  'fbl': 'Federal Bank'
};

const COMMON_EMAIL_DOMAINS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'io', 'co', 'info', 'biz', 'gmail', 'yahoo', 'outlook', 'hotmail'
]);

function extractCandidateUpiIds(text) {
  if (typeof text !== 'string') return [];
  const re = /\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}\b/g;
  const matches = text.match(re) || [];
  const unique = [...new Set(matches.map(m => m.trim()))];

  const upiIds = [];
  for (const m of unique) {
    const parts = m.split('@');
    if (parts.length !== 2) continue;
    const [name, handleRaw] = parts;
    const handle = handleRaw.toLowerCase();
    
    // If the handle looks like a typical website/email domain (e.g. gmail.com) and is not in well-known handles, skip
    const handleParts = handle.split('.');
    const lastPart = handleParts[handleParts.length - 1];
    if (handleParts.length > 1 && COMMON_EMAIL_DOMAINS.has(lastPart) && !WELL_KNOWN_HANDLES[handle]) {
      continue;
    }
    upiIds.push(m);
  }
  return upiIds;
}

function getHandleInfo(upiIds) {
  const seenHandles = new Set();
  const infoList = [];

  for (const upiId of upiIds) {
    const parts = upiId.split('@');
    if (parts.length < 2) continue;
    const handle = parts[1].toLowerCase();
    if (seenHandles.has(handle)) continue;
    seenHandles.add(handle);

    const isWellKnown = Boolean(WELL_KNOWN_HANDLES[handle]);
    const item = {
      handle,
      wellKnown: isWellKnown
    };
    if (isWellKnown) {
      item.issuerHint = WELL_KNOWN_HANDLES[handle];
    }
    infoList.push(item);
  }

  return infoList;
}

function parseDeterministicItems(text) {
  const upiIds = extractCandidateUpiIds(text);
  const handleInfo = getHandleInfo(upiIds);
  const amounts = extractAmounts(text);
  const rawLinks = extractLinks(text);
  const links = rawLinks.slice(0, 3).map(l => l.href);
  const phones = extractPhoneNumbers(text).map(p => p.normalized);
  const emails = extractEmails(text).map(e => e.email);

  return {
    upiIds,
    amounts,
    links,
    rawLinks: rawLinks.slice(0, 3),
    phones,
    emails,
    handleInfo
  };
}

function shouldShowUpiSafetyNote(text) {
  if (typeof text !== 'string') return false;
  return /\b(qr|pin|collect|receive|refund|cashback)\b/i.test(text);
}

module.exports = {
  extractCandidateUpiIds,
  getHandleInfo,
  parseDeterministicItems,
  shouldShowUpiSafetyNote,
  WELL_KNOWN_HANDLES
};

