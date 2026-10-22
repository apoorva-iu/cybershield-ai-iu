'use strict';

const LEVEL_ORDER = {
  'low': 1,
  'medium': 2,
  'high': 3,
  'unable': 0
};

const VALID_LEVELS = new Set(['low', 'medium', 'high', 'unable']);
const VALID_CHECK_STATES = new Set(['pass', 'flag', 'warning', 'not_applicable']);

const REQUIRED_CHECK_KEYS = [
  'payment_direction',
  'proof_authenticity',
  'urgency_and_pressure',
  'channel_and_identity'
];

function isBandConsistent(level, score) {
  if (level === 'unable') {
    return score === null || (typeof score === 'number' && score >= 0 && score <= 100);
  }
  if (typeof score !== 'number' || isNaN(score)) return false;
  if (level === 'low') return score >= 0 && score <= 29;
  if (level === 'medium') return score >= 30 && score <= 69;
  if (level === 'high') return score >= 70 && score <= 100;
  return false;
}

function filterEvidenceQuotes(evidence, rawInput) {
  if (!Array.isArray(evidence) || typeof rawInput !== 'string') return [];
  const normalizedInput = rawInput.toLowerCase();
  const valid = [];
  const seenQuotes = new Set();

  for (const item of evidence) {
    if (!item || typeof item.quote !== 'string') continue;
    const q = item.quote.trim();
    if (!q) continue;

    // Must be exact verbatim substring (case-insensitive search against input)
    if (normalizedInput.includes(q.toLowerCase())) {
      if (!seenQuotes.has(q.toLowerCase())) {
        seenQuotes.add(q.toLowerCase());
        valid.push({
          quote: q,
          interpretation: String(item.interpretation || '').trim()
        });
      }
    }
    // If not an exact substring, drop that quote
  }
  return valid;
}

function validatePassResult(result, rawInput) {
  if (!result || typeof result !== 'object') {
    return { ok: false, reason: 'Result is not an object' };
  }

  const level = String(result.level || '').toLowerCase();
  if (!VALID_LEVELS.has(level)) {
    return { ok: false, reason: `Invalid level: ${result.level}` };
  }

  const score = (result.score === null || result.score === undefined) ? null : Number(result.score);
  if (!isBandConsistent(level, score)) {
    return { ok: false, reason: `Score ${score} inconsistent with level ${level}` };
  }

  const confidence = typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : 0.5;
  const primaryConcern = String(result.primaryConcern || '').trim();
  const scamType = String(result.scamType || 'unknown').trim();
  const filteredEvidence = filterEvidenceQuotes(result.evidence, rawInput);

  // Validate checks
  const checksMap = new Map();
  if (Array.isArray(result.checks)) {
    for (const c of result.checks) {
      if (c && typeof c.key === 'string') {
        const state = VALID_CHECK_STATES.has(c.state) ? c.state : 'not_applicable';
        checksMap.set(c.key, {
          key: c.key,
          title: String(c.title || c.key),
          state,
          summary: String(c.summary || '')
        });
      }
    }
  }

  const checks = REQUIRED_CHECK_KEYS.map(key => {
    if (checksMap.has(key)) {
      return checksMap.get(key);
    }
    const defaultTitles = {
      payment_direction: 'Payment direction',
      proof_authenticity: 'Proof authenticity',
      urgency_and_pressure: 'Urgency and pressure',
      channel_and_identity: 'Channel and identity'
    };
    return {
      key,
      title: defaultTitles[key] || key,
      state: 'not_applicable',
      summary: 'No specific observations for this check.'
    };
  });

  const whatToDo = Array.isArray(result.whatToDo)
    ? result.whatToDo.map(s => String(s || '').trim()).filter(Boolean)
    : [];

  return {
    ok: true,
    data: {
      level,
      score,
      confidence,
      primaryConcern: primaryConcern || 'Payment evaluation completed.',
      scamType: scamType || 'unknown',
      evidence: filteredEvidence,
      checks,
      whatToDo: whatToDo.length > 0 ? whatToDo : [
        'Verify transaction status directly inside your official banking or UPI app.',
        'Never enter your UPI PIN to receive money, refunds, or rewards.',
        'Do not share OTPs, passwords, or approve unknown collect requests.'
      ]
    }
  };
}

function resolvePassDisagreement(p1, p2) {
  if (!p2) return p1;
  if (!p1) return p2;

  // Handle unable states
  if (p1.level === 'unable' && p2.level === 'unable') {
    return p1;
  }
  if (p1.level === 'unable') {
    if (p2.confidence >= 0.7) return p2;
    return { ...p1, primaryConcern: 'Context insufficient to verify payment authenticity.' };
  }
  if (p2.level === 'unable') {
    if (p1.confidence >= 0.7) return p1;
    return { ...p2, primaryConcern: 'Context insufficient to verify payment authenticity.' };
  }

  // Merge evidence without duplicate quotes
  const seenQuotes = new Set();
  const mergedEvidence = [];
  for (const item of [...(p1.evidence || []), ...(p2.evidence || [])]) {
    const q = item.quote.toLowerCase();
    if (!seenQuotes.has(q)) {
      seenQuotes.add(q);
      mergedEvidence.push(item);
    }
  }

  // Merge whatToDo
  const seenActions = new Set();
  const mergedWhatToDo = [];
  for (const act of [...(p1.whatToDo || []), ...(p2.whatToDo || [])]) {
    if (!seenActions.has(act)) {
      seenActions.add(act);
      mergedWhatToDo.push(act);
    }
  }

  // Merge checks
  const mergedChecks = REQUIRED_CHECK_KEYS.map(key => {
    const c1 = (p1.checks || []).find(c => c.key === key);
    const c2 = (p2.checks || []).find(c => c.key === key);
    if (!c1 && !c2) {
      return { key, title: key, state: 'not_applicable', summary: 'Not applicable.' };
    }
    if (!c1) return c2;
    if (!c2) return c1;

    // Pick more severe state: flag > warning > pass > not_applicable
    const severity = { 'flag': 4, 'warning': 3, 'pass': 2, 'not_applicable': 1 };
    const bestState = (severity[c1.state] || 1) >= (severity[c2.state] || 1) ? c1.state : c2.state;
    const summary = c1.summary && c1.summary.length > c2.summary.length ? c1.summary : (c2.summary || c1.summary);
    return {
      key,
      title: c1.title || c2.title,
      state: bestState,
      summary
    };
  });

  const o1 = LEVEL_ORDER[p1.level] || 0;
  const o2 = LEVEL_ORDER[p2.level] || 0;
  const diff = Math.abs(o1 - o2);

  // Case 1: Same level
  if (diff === 0) {
    const avgScore = (p1.score != null && p2.score != null)
      ? Math.round((p1.score + p2.score) / 2)
      : (p1.score ?? p2.score);
    const avgConfidence = Number(((p1.confidence + p2.confidence) / 2).toFixed(2));
    const scamType = (p1.scamType && p1.scamType !== 'unknown') ? p1.scamType : p2.scamType;

    return {
      level: p1.level,
      score: avgScore,
      confidence: avgConfidence,
      primaryConcern: p1.primaryConcern || p2.primaryConcern,
      scamType,
      evidence: mergedEvidence,
      checks: mergedChecks,
      whatToDo: mergedWhatToDo
    };
  }

  // Case 2: 1 level apart (e.g. low vs medium, or medium vs high)
  if (diff === 1) {
    const higherPass = o1 > o2 ? p1 : p2;
    const lowerConfidence = Math.max(0.1, Number((Math.min(p1.confidence, p2.confidence) - 0.15).toFixed(2)));
    const higherScore = Math.max(p1.score || 0, p2.score || 0);

    return {
      level: higherPass.level,
      score: higherScore,
      confidence: lowerConfidence,
      primaryConcern: higherPass.primaryConcern,
      scamType: higherPass.scamType,
      evidence: mergedEvidence,
      checks: mergedChecks,
      whatToDo: mergedWhatToDo
    };
  }

  // Case 3: 2 levels apart (low vs high)
  const highPass = p1.level === 'high' ? p1 : p2;
  return {
    level: 'high',
    score: Math.max(70, highPass.score || 70),
    confidence: 0.5,
    primaryConcern: `${highPass.primaryConcern} (Note: Multi-pass evaluation noted differing risk assessments; high risk selected for safety.)`,
    scamType: highPass.scamType,
    evidence: mergedEvidence,
    checks: mergedChecks,
    whatToDo: mergedWhatToDo
  };
}

const BANNED_CLAIMS_REGEX = /\b(fabricated|fake|forged|edited|genuine)\b/i;
const SAFE_NEUTRAL_STRING = 'Receipt details cannot be verified from an image';

function containsBannedClaims(str) {
  return typeof str === 'string' && BANNED_CLAIMS_REGEX.test(str);
}

function findBannedClaims(data) {
  if (!data || typeof data !== 'object') return [];
  const violations = [];

  function check(val, field) {
    if (typeof val === 'string' && containsBannedClaims(val)) {
      violations.push({ field, text: val });
    }
  }

  check(data.primaryConcern, 'primaryConcern');
  check(data.explanation, 'explanation');
  check(data.conversationSummary, 'conversationSummary');

  if (Array.isArray(data.checks)) {
    data.checks.forEach((c, idx) => {
      if (c) {
        check(c.summary, `checks[${idx}].summary`);
        check(c.title, `checks[${idx}].title`);
      }
    });
  }

  if (Array.isArray(data.whatToDo)) {
    data.whatToDo.forEach((act, idx) => {
      check(act, `whatToDo[${idx}]`);
    });
  }

  if (Array.isArray(data.evidence)) {
    data.evidence.forEach((ev, idx) => {
      if (ev) {
        check(ev.interpretation, `evidence[${idx}].interpretation`);
      }
    });
  }

  if (Array.isArray(data.scoreBreakdown)) {
    data.scoreBreakdown.forEach((sb, idx) => {
      if (sb) {
        check(sb.description, `scoreBreakdown[${idx}].description`);
      }
    });
  }

  return violations;
}

function sanitizeBannedClaims(data) {
  if (!data || typeof data !== 'object') return data;

  function sanitize(val) {
    if (typeof val === 'string' && containsBannedClaims(val)) {
      return SAFE_NEUTRAL_STRING;
    }
    return val;
  }

  if (typeof data.primaryConcern === 'string') {
    data.primaryConcern = sanitize(data.primaryConcern);
  }
  if (typeof data.explanation === 'string') {
    data.explanation = sanitize(data.explanation);
  }
  if (typeof data.conversationSummary === 'string') {
    data.conversationSummary = sanitize(data.conversationSummary);
  }

  if (Array.isArray(data.checks)) {
    for (const c of data.checks) {
      if (c && typeof c.summary === 'string') {
        c.summary = sanitize(c.summary);
      }
    }
  }

  if (Array.isArray(data.whatToDo)) {
    data.whatToDo = data.whatToDo.map(act => (typeof act === 'string' ? sanitize(act) : act));
  }

  if (Array.isArray(data.evidence)) {
    for (const ev of data.evidence) {
      if (ev && typeof ev.interpretation === 'string') {
        ev.interpretation = sanitize(ev.interpretation);
      }
    }
  }

  if (Array.isArray(data.scoreBreakdown)) {
    for (const sb of data.scoreBreakdown) {
      if (sb && typeof sb.description === 'string') {
        sb.description = sanitize(sb.description);
      }
    }
  }

  return data;
}

module.exports = {
  isBandConsistent,
  filterEvidenceQuotes,
  validatePassResult,
  resolvePassDisagreement,
  BANNED_CLAIMS_REGEX,
  SAFE_NEUTRAL_STRING,
  containsBannedClaims,
  findBannedClaims,
  sanitizeBannedClaims,
  REQUIRED_CHECK_KEYS,
  VALID_LEVELS
};

