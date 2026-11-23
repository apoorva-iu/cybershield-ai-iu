'use strict';

/**
 * Deduplicates safety actions and advice lines, collapsing both exact duplicates
 * and semantically equivalent advice (e.g. multiple lines warning about entering a
 * UPI PIN to receive money or duplicate 1930 helpline calls).
 */
export function dedupeSafetyAdvice(list) {
  if (!Array.isArray(list)) return [];

  const CATEGORIES = [
    {
      id: 'upi_pin_or_collect',
      test: (s) =>
        /(?:upi pin|enter.*pin|pin.*(receive|refund|cashback)|collect request|scan.*qr.*receive|approve.*(?:collect|payment).*receive)/i.test(s)
    },
    {
      id: 'bank_statement_verify',
      test: (s) =>
        /(?:bank (?:app|statement)|official (?:app|portal|banking)|verify.*credit|screenshots?.*cannot prove)/i.test(s) &&
        !/cybercrime/i.test(s)
    },
    {
      id: 'cybercrime_reporting',
      test: (s) => /\b1930\b|cybercrime\.gov\.in|national cyber crime helpline/i.test(s)
    },
    {
      id: 'remote_access_apk',
      test: (s) => /(?:remote[- ]access|anydesk|teamviewer|\.apk\b|screen[- ]sharing)/i.test(s)
    },
    {
      id: 'job_advance_fee',
      test: (s) =>
        /(?:advance fee|pay.*(?:interview|equipment|training|registration|job|offer)|never ask.*pay|fee for (?:training|equipment))/i.test(s)
    },
    {
      id: 'job_portal_verify',
      test: (s) =>
        /(?:official career|company.*portal|official website.*careers?|verify.*opening)/i.test(s) &&
        !/cybercrime/i.test(s)
    },
    {
      id: 'credentials_otp',
      test: (s) =>
        /(?:never share.*(?:otp|password|pin)|do not share.*(?:otp|password)|share (?:otp|credentials))/i.test(s) &&
        !/(?:collect request|upi pin)/i.test(s)
    }
  ];

  const seenExact = new Set();
  const seenCategories = new Map(); // catId -> index in cleaned
  const cleaned = [];

  for (const rawItem of list) {
    if (!rawItem || typeof rawItem !== 'string') continue;
    const trimmed = rawItem.trim();
    if (!trimmed) continue;

    // Normalize for exact comparison
    const norm = trimmed
      .toLowerCase()
      .replace(/[.,!?;:]/g, '')
      .replace(/\s+/g, ' ');

    if (seenExact.has(norm)) continue;
    seenExact.add(norm);

    // Identify semantic category
    let matchedCat = null;
    for (const cat of CATEGORIES) {
      if (cat.test(trimmed)) {
        matchedCat = cat.id;
        break;
      }
    }

    if (matchedCat) {
      if (seenCategories.has(matchedCat)) {
        // If the new item is significantly more detailed (> 25 chars longer) than the previous,
        // replace the previous one with the richer description. Otherwise skip.
        if (matchedCat !== 'cybercrime_reporting') {
          const prevIdx = seenCategories.get(matchedCat);
          if (trimmed.length > cleaned[prevIdx].length + 25) {
            cleaned[prevIdx] = trimmed;
          }
        }
        continue;
      }
      seenCategories.set(matchedCat, cleaned.length);
      if (matchedCat === 'cybercrime_reporting') {
        cleaned.push('Report cyber fraud immediately at cybercrime.gov.in or call national helpline 1930.');
        continue;
      }
    }

    cleaned.push(trimmed);
  }

  return cleaned;
}

/**
 * Fallback guidance for older saved scans that lacked whatToDo in their report.
 */
export function getDefaultWhatToDo(toolKind = 'job', level = 'high') {
  const isHigh = level === 'high' || level === 'medium' || level === 'bad' || level === 'warn';

  if (toolKind === 'upi') {
    if (!isHigh) {
      return [
        'Always double-check the recipient name in your UPI app before sending money.',
        'Remember that a UPI PIN is only needed to send money, never to receive it.',
        'Keep payment records in your official banking app.'
      ];
    }
    return [
      'Do not accept the collect request or enter your UPI PIN. A UPI PIN is only required to send money, never to receive funds.',
      'Check your official banking app directly to verify credits. Screenshots and UTR numbers alone cannot prove payment.',
      'Decline unknown payment requests and block suspicious contact handles.',
      'Report cyber fraud immediately at cybercrime.gov.in or call national helpline 1930.'
    ];
  }

  if (toolKind === 'message') {
    if (!isHigh) {
      return [
        'Verify unknown sender numbers before clicking links or sharing details.',
        'Never forward one-time passwords (OTP) or personal verification codes.'
      ];
    }
    return [
      'Do not click unknown links, download attachments, or share OTPs, passwords, or personal details.',
      'Never install remote-access applications (.apk, AnyDesk, TeamViewer) from chat links.',
      'Verify claims directly with the organization via their official portal or public customer care.',
      'Report cyber fraud immediately at cybercrime.gov.in or call national helpline 1930.'
    ];
  }

  // Job scam check
  if (!isHigh) {
    return [
      'Confirm job openings directly on the employer\'s official career portal.',
      'Verify recruiter email addresses match the official corporate domain.'
    ];
  }
  return [
    'Do not transfer money for equipment, registration, training, or background checks. Legitimate employers never charge candidates.',
    'Verify the opening directly on the organization\'s official careers portal, not through messaging apps.',
    'Never download unverified remote-access tools or executable task files from recruiters.',
    'Report cyber fraud immediately at cybercrime.gov.in or call national helpline 1930.'
  ];
}
