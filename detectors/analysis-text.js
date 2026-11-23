'use strict';

/**
 * Shared dynamic analysis text generator for Job, UPI, and Message evaluations.
 * Builds input-specific summaries, "why" reasons quoting the input verbatim,
 * and tailored "what to do" advice deduplicated by category.
 */

// Common advice library categorized by scam signature
const ADVICE_CATALOG = {
  upi_pin: 'A UPI PIN is strictly and exclusively to send money out of your account, never to receive funds, accept rewards, or get a refund.',
  collect_request: 'Decline unknown collect requests or payment approvals immediately. Approving a request debits your bank account.',
  bank_statement_verify: 'Verify incoming funds directly in your official banking app. Third-party screenshots, receipts, and SMS claims can be edited.',
  advance_fee: 'Never pay an upfront registration, equipment, training, or processing fee to secure a job or prize. Genuine employers and contests never charge candidates.',
  task_deposit: 'Do not transfer money to "unlock" tasks, higher commission tiers, or investment returns. Walk away from prepaid rating jobs.',
  remote_access_apk: 'Never download application files (.apk) or install remote-access tools (AnyDesk, TeamViewer) from unsolicited messages.',
  official_portal_job: 'Confirm job openings directly on the employer\'s official corporate careers site, not through chat apps.',
  official_portal_org: 'Contact the organization directly using verified helpline numbers published on their official website, not numbers provided in the message.',
  unsolicited_link: 'Do not click unknown or shortened links sent in unsolicited messages.',
  cybercrime: 'Report cyber fraud immediately at cybercrime.gov.in or call national helpline 1930.',
  cybercrime_1930: 'Report cyber fraud immediately at cybercrime.gov.in or call national helpline 1930.',
  cybercrime_portal: 'Report cyber fraud immediately at cybercrime.gov.in or call national helpline 1930.',
  safe_job: 'Confirm job openings directly on the employer\'s official career portal.',
  safe_recruiter: 'Verify recruiter email addresses match the employer\'s official corporate domain.',
  safe_upi: 'Verify recipient details and handle in your banking app before authorizing transfers.'
};

/**
 * Extract quote for a pattern ensuring exact verbatim match from raw text.
 */
function extractExactQuote(text, regex) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const match = text.match(regex);
  if (!match) return null;
  const rawSub = match[0];
  const idx = text.indexOf(rawSub);
  return idx !== -1 ? text.slice(idx, idx + rawSub.length) : null;
}

/**
 * Deduplicate advice list preserving order and matching category semantics.
 */
function dedupeAdviceList(adviceList) {
  const seenCategories = new Set();
  const seenTexts = new Set();
  const deduped = [];

  for (const item of adviceList) {
    if (typeof item !== 'string') continue;
    const clean = item.trim();
    if (!clean || seenTexts.has(clean.toLowerCase())) continue;

    // Detect category to enforce single generic advisory
    let category = null;
    if (clean.includes('1930') || clean.includes('cybercrime.gov.in')) category = 'cybercrime';
    else if (clean.includes('UPI PIN')) category = 'pin';
    else if (clean.includes('official banking app') || clean.includes('banking app directly')) category = 'bank_app';
    else if (clean.includes('remote-access') || clean.includes('.apk')) category = 'apk';
    else if (clean.includes('registration') || clean.includes('upfront registration')) category = 'advance_fee';

    if (category) {
      if (seenCategories.has(category)) continue;
      seenCategories.add(category);
      if (category === 'cybercrime') {
        const completeCybercrime = 'Report cyber fraud immediately at cybercrime.gov.in or call national helpline 1930.';
        seenTexts.add(clean.toLowerCase());
        seenTexts.add(completeCybercrime.toLowerCase());
        deduped.push(completeCybercrime);
        continue;
      }
    }

    seenTexts.add(clean.toLowerCase());
    deduped.push(clean);
  }

  return deduped;
}

/**
 * Generate specific analysis text for an input.
 */
function generateSpecificAnalysisText({
  tool = 'message',
  level = 'low',
  text = '',
  signals = [],
  scamType = null,
  checks = [],
  evidenceSources = {}
}) {
  const cleanText = String(text || '').trim();
  const reasons = [];
  const adviceItems = [];

  // 1. Scan for specific verifiable signals in input
  const pinQuote = extractExactQuote(cleanText, /\b(?:enter|share|type|provide|approve)?\s*(?:your\s*)?(?:upi\s*)?pin\b/i) ||
                   extractExactQuote(cleanText, /\b(?:scan\s*qr(?:\s*code)?|collect\s*request)\b/i);

  const feeQuote = extractExactQuote(cleanText, /\b(?:registration|training|security|equipment|laptop|processing|deposit|activation)\s*(?:fee|charges|amount|deposit|money)\b/i) ||
                   extractExactQuote(cleanText, /\b(?:pay|deposit|transfer|send)\s*(?:inr|rs\.?|₹)?\s*\d+[\d,]*/i);

  const mistakenQuote = extractExactQuote(cleanText, /\b(?:sent\s*(?:you\s*)?by\s*mistake|galti\s*se|refund\s*immediately|return\s*the\s*money)\b/i);

  const proofQuote = extractExactQuote(cleanText, /\b(?:screenshot|payment\s*receipt|transferred|debited|utr\b|transaction\s*id)\b/i);

  const urgencyQuote = extractExactQuote(cleanText, /\b(?:immediately|urgent|within\s*\d+\s*(?:mins?|hours?|day)|turant|jaldi|blocked|suspended|freeze|penalty)\b/i);

  const legalQuote = extractExactQuote(cleanText, /\b(?:police|cbi|arrest|digital\s*arrest|court|fir\b|customs|illegal\s*parcel|trai\b)\b/i);

  const utilityQuote = extractExactQuote(cleanText, /\b(?:electricity|power\s*will\s*be\s*disconnected|bill\s*unpaid|sim\s*block(?:ed)?|connection\s*cut)\b/i);

  const taskQuote = extractExactQuote(cleanText, /\b(?:part\s*time\s*job|review\s*rating|daily\s*task|earn\s*(?:inr|rs\.?|₹)?\s*\d+|\d+k\s*\/\s*day)\b/i);

  const linkQuote = extractExactQuote(cleanText, /https?:\/\/[^\s]+/i) ||
                    extractExactQuote(cleanText, /\b(?:bit\.ly|tinyurl|t\.me|wa\.me|wa\.link)\/[^\s]+/i);

  const apkQuote = extractExactQuote(cleanText, /\b[a-zA-Z0-9_\-]+\.apk\b/i) ||
                   extractExactQuote(cleanText, /\b(?:anydesk|teamviewer|rustdesk)\b/i);

  // 2. Build reasons quoting the input
  if (pinQuote) {
    reasons.push({
      quote: pinQuote,
      why: `Payment trap: "${pinQuote}" - A UPI PIN or QR scan authorizes outgoing funds from your account, never incoming credit.`
    });
    adviceItems.push(ADVICE_CATALOG.upi_pin);
    adviceItems.push(ADVICE_CATALOG.collect_request);
  }

  if (feeQuote) {
    reasons.push({
      quote: feeQuote,
      why: `Advance fee demand: "${feeQuote}" - Legitimate recruiters and authentic organizations never charge upfront fees to candidates.`
    });
    adviceItems.push(ADVICE_CATALOG.advance_fee);
  }

  if (mistakenQuote) {
    reasons.push({
      quote: mistakenQuote,
      why: `Overpayment trap: "${mistakenQuote}" - Unsolicited claims of accidental transfers must be handled through bank reversal, never manual UPI transfers.`
    });
    adviceItems.push(ADVICE_CATALOG.bank_statement_verify);
  }

  if (proofQuote && (tool === 'upi' || urgencyQuote)) {
    reasons.push({
      quote: proofQuote,
      why: `Unverified transfer proof: "${proofQuote}" - Payment screenshots and SMS alerts can be fabricated; verify actual bank balance directly.`
    });
    adviceItems.push(ADVICE_CATALOG.bank_statement_verify);
  }

  if (legalQuote) {
    reasons.push({
      quote: legalQuote,
      why: `Coercive authority threat: "${legalQuote}" - Law enforcement and government agencies do not issue arrest warrants or demands over chat apps.`
    });
    adviceItems.push(ADVICE_CATALOG.official_portal_org);
  }

  if (utilityQuote) {
    reasons.push({
      quote: utilityQuote,
      why: `Urgent service disconnection threat: "${utilityQuote}" - Disconnection notices are sent through official bills, not unsolicited SMS demands.`
    });
    adviceItems.push(ADVICE_CATALOG.official_portal_org);
  }

  if (taskQuote) {
    reasons.push({
      quote: taskQuote,
      why: `Prepaid task compensation lure: "${taskQuote}" - Unrealistic daily payouts for basic review or rating tasks represent prepaid task fraud.`
    });
    adviceItems.push(ADVICE_CATALOG.task_deposit);
  }

  if (apkQuote) {
    reasons.push({
      quote: apkQuote,
      why: `Remote access or APK payload: "${apkQuote}" - Installing unverified apps grants third parties full access to your device and banking credentials.`
    });
    adviceItems.push(ADVICE_CATALOG.remote_access_apk);
  }

  if (linkQuote && !apkQuote) {
    reasons.push({
      quote: linkQuote,
      why: `Unverified link: "${linkQuote}" - Unsolicited links can direct to credential phishing portals or payment traps.`
    });
    adviceItems.push(ADVICE_CATALOG.unsolicited_link);
  }

  if (urgencyQuote && !legalQuote && !utilityQuote) {
    reasons.push({
      quote: urgencyQuote,
      why: `Coercive urgency: "${urgencyQuote}" - Artificial time pressure is used to bypass critical verification.`
    });
  }

  // Fallback if no specific quote matched but tool found warnings
  if (reasons.length === 0) {
    if (level === 'high' || level === 'medium') {
      const firstSnippet = cleanText.slice(0, Math.min(60, cleanText.length));
      reasons.push({
        quote: firstSnippet,
        why: `Unverified communication pattern: "${firstSnippet}..." - Does not match standard verified official communication.`
      });
    }
  }

  // 3. Add cybercrime reporting advice when fraud/high risk is present
  if (level === 'high') {
    adviceItems.push(ADVICE_CATALOG.cybercrime);
  } else if (level === 'medium') {
    if (tool === 'job') adviceItems.push(ADVICE_CATALOG.official_portal_job);
    else adviceItems.push(ADVICE_CATALOG.official_portal_org);
  } else {
    // Low risk advice
    if (tool === 'job') {
      adviceItems.push(ADVICE_CATALOG.safe_job);
      adviceItems.push(ADVICE_CATALOG.safe_recruiter);
    } else {
      adviceItems.push(ADVICE_CATALOG.safe_upi);
    }
  }

  // 4. Build input-specific Headline [Title, Subtitle]
  let headline = [];
  let primaryConcern = '';

  if (level === 'high') {
    if (pinQuote) {
      headline = [
        'UPI PIN Collect Trap Detected',
        `Evidence suggests a deceptive prompt to "${pinQuote}" to receive funds, an impossible financial mechanic designed to debit your bank account.`
      ];
      primaryConcern = `Deceptive request directing you to "${pinQuote}" to receive money.`;
    } else if (feeQuote) {
      headline = [
        'Advance Fee Demand Detected',
        `Evidence suggests an upfront payment demand ("${feeQuote}") before employment, delivery, or prize release.`
      ];
      primaryConcern = `Demands upfront payment ("${feeQuote}") before services or employment.`;
    } else if (mistakenQuote) {
      headline = [
        'Overpayment Reversal Trap',
        `Evidence suggests money was claimed as "${mistakenQuote}". Never return funds via UPI without official bank verification.`
      ];
      primaryConcern = `Claims unverified overpayment ("${mistakenQuote}") demanding immediate return.`;
    } else if (legalQuote) {
      headline = [
        'Coercive Authority Extortion',
        `Evidence suggests coercive pressure ("${legalQuote}") using threats of legal action or arrest to coerce immediate payment.`
      ];
      primaryConcern = `Impersonates authorities with threats ("${legalQuote}") demanding compliance.`;
    } else if (utilityQuote) {
      headline = [
        'Disconnection Alert Phishing',
        `Evidence suggests urgent service termination threats ("${utilityQuote}") to drive unverified contact.`
      ];
      primaryConcern = `Urgent disconnection threat ("${utilityQuote}") demanding immediate payment.`;
    } else if (taskQuote) {
      headline = [
        'Prepaid Task Scam Pattern',
        `Evidence suggests deceptive task earnings ("${taskQuote}") requiring upfront deposits.`
      ];
      primaryConcern = `Prepaid task scheme offering unrealistic returns ("${taskQuote}").`;
    } else if (evidenceSources.confirmedMaliciousLink || (checks.some(c => c.score === 100))) {
      headline = [
        'Confirmed Malicious Link Detected',
        `Evidence suggests destination link ("${linkQuote || 'external link'}") is flagged as malicious by security databases.`
      ];
      primaryConcern = `Confirmed malicious link ("${linkQuote || 'external link'}") flagged by security vendors.`;
    } else {
      const topQuote = reasons[0] ? reasons[0].quote : cleanText.slice(0, 40);
      headline = [
        'High Risk Deceptive Signals Found',
        `Evidence suggests high-risk fraud indicators including "${topQuote}".`
      ];
      primaryConcern = `High-risk deceptive patterns detected citing "${topQuote}".`;
    }
  } else if (level === 'medium') {
    const topQuote = reasons[0] ? reasons[0].quote : cleanText.slice(0, 30);
    headline = [
      'Caution Advised: Unverified Communication',
      `Evidence suggests cautionary signals ("${topQuote}") without confirmed identity. Verify before sharing info.`
    ];
    primaryConcern = `Unverified communication containing warning signs ("${topQuote}").`;
  } else if (level === 'unable') {
    headline = [
      'Unable to Verify Context',
      'Evidence suggests the provided text has insufficient details or context to establish a definitive risk evaluation.'
    ];
    primaryConcern = 'Insufficient context to evaluate risk reliably.';
  } else {
    headline = [
      'Low Risk: Standard Communication',
      'Evidence suggests no deceptive requests, payment traps, or credential collection patterns in this text.'
    ];
    primaryConcern = 'No significant risk patterns detected.';
  }

  return {
    headline,
    primaryConcern,
    reasons,
    whatToDo: dedupeAdviceList(adviceItems)
  };
}

module.exports = {
  generateSpecificAnalysisText,
  dedupeAdviceList,
  extractExactQuote
};
