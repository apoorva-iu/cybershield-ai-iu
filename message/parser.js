'use strict';

const {
  extractLinks,
  extractEmails,
  extractPhoneNumbers,
  extractAmounts
} = require('../detectors/evidence');

function extractCandidateUpiIds(text) {
  if (typeof text !== 'string') return [];
  const re = /\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}\b/g;
  const matches = text.match(re) || [];
  const unique = [...new Set(matches.map(m => m.trim()))];

  const upiIds = [];
  const commonDomains = new Set(['com', 'net', 'org', 'edu', 'gov', 'mil', 'io', 'co', 'info', 'biz', 'gmail', 'yahoo', 'outlook', 'hotmail']);

  for (const m of unique) {
    const parts = m.split('@');
    if (parts.length !== 2) continue;
    const handle = parts[1].toLowerCase();
    const handleParts = handle.split('.');
    const lastPart = handleParts[handleParts.length - 1];
    if (handleParts.length > 1 && commonDomains.has(lastPart)) {
      continue;
    }
    upiIds.push(m);
  }
  return upiIds;
}

function detectInputType(text, turns) {
  if (Array.isArray(turns) && turns.length > 1) {
    return 'chat';
  }

  if (typeof text !== 'string') {
    return 'other';
  }

  const clean = text.trim();

  // Forwarded message check by structural label
  if (/^(?:\[?\s*forwarded(?:\s+message)?\s*\]?)/i.test(clean) || /\n(?:\[?\s*forwarded(?:\s+message)?\s*\]?)/i.test(clean)) {
    return 'forwarded';
  }

  // Email format check by standard headers (From, Subject, To, Date)
  const hasFrom = /\bfrom:\s*[\w<@.-]+/i.test(clean);
  const hasSubject = /\bsubject:\s*[\w\s]+/i.test(clean);
  const hasTo = /\bto:\s*[\w<@.-]+/i.test(clean);
  if ((hasFrom && hasSubject) || (hasFrom && hasTo) || (hasSubject && hasTo)) {
    return 'email';
  }

  // Multi-turn chat detection by dialogue structure or timestamped bubbles
  const timestampTurns = clean.match(/(?:\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?\]|(?:\d{1,2}:\d{2}(?:\s*[ap]m)?\s*[-–]))\s*[^:\n]+:/gi);
  if (timestampTurns && timestampTurns.length >= 2) {
    return 'chat';
  }

  const speakerLines = clean.match(/^(?:user|sender|recipient|agent|support|me|them|victim|caller|[A-Za-z0-9+_-]{2,20})\s*:\s*\S+/gim);
  if (speakerLines && speakerLines.length >= 2) {
    return 'chat';
  }

  if (clean.length > 0) {
    return 'single_message';
  }

  return 'other';
}

function parseDeterministicItems(text, turns) {
  const safeText = typeof text === 'string' ? text : '';
  const upiIds = extractCandidateUpiIds(safeText);
  const amounts = extractAmounts(safeText);
  const rawLinks = extractLinks(safeText);
  const links = rawLinks.slice(0, 3).map(l => l.href);
  const phones = extractPhoneNumbers(safeText).map(p => p.normalized);
  const emails = extractEmails(safeText).map(e => e.email);
  const inputType = detectInputType(safeText, turns);

  return {
    inputType,
    upiIds,
    amounts,
    links,
    rawLinks: rawLinks.slice(0, 3),
    phones,
    emails
  };
}

module.exports = {
  extractCandidateUpiIds,
  detectInputType,
  parseDeterministicItems
};

