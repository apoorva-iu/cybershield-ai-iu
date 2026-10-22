'use strict';

const {
  SCAM_TYPES,
  REQUESTED_ACTIONS,
  CHECK_KEYS,
  CHECK_TITLES,
  MANDATORY_WHAT_TO_DO,
  CYBERCRIME_ADVICE,
  BANNED_CLAIMS_REGEX,
  SAFE_NEUTRAL_STRING
} = require('./config');

const LEVEL_ORDER = {
  'low': 1,
  'medium': 2,
  'high': 3,
  'unable': 0
};

const VALID_LEVELS = new Set(['low', 'medium', 'high', 'unable']);
const VALID_CHECK_STATES = new Set(['pass', 'warn', 'fail', 'not_applicable']);

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

function normalizeWhitespace(str) {
  return typeof str === 'string' ? str.replace(/\s+/g, ' ').trim() : '';
}

function isExactSubstring(sub, full) {
  if (typeof sub !== 'string' || typeof full !== 'string') return false;
  const normSub = normalizeWhitespace(sub).toLowerCase();
  const normFull = normalizeWhitespace(full).toLowerCase();
  return normSub.length > 0 && normFull.includes(normSub);
}

function filterSignalsQuotes(signals, rawInput) {
  if (!Array.isArray(signals)) return [];
  const valid = [];
  const seenQuotes = new Set();

  for (const sig of signals) {
    if (!sig || typeof sig !== 'object') continue;
    const label = String(sig.label || '').trim();
    const why = String(sig.why || '').trim();
    const weight = typeof sig.weight === 'number' ? Math.max(0, Math.min(1, sig.weight)) : 0.5;

    let quote = null;
    if (typeof sig.quote === 'string' && sig.quote.trim()) {
      if (isExactSubstring(sig.quote, rawInput)) {
        const normQ = normalizeWhitespace(sig.quote).toLowerCase();
        if (!seenQuotes.has(normQ)) {
          seenQuotes.add(normQ);
          quote = sig.quote.trim();
        }
      }
    }

    valid.push({
      label: label || 'Suspicious communication signal',
      weight,
      quote: quote || undefined,
      why: why || 'Identified during message security evaluation'
    });
  }

  return valid;
}

function filterFlaggedPhrases(phrases, rawInput) {
  if (!Array.isArray(phrases)) return [];
  const valid = [];
  const seen = new Set();

  for (const item of phrases) {
    if (!item || typeof item.text !== 'string') continue;
    const txt = item.text.trim();
    if (!txt) continue;

    if (isExactSubstring(txt, rawInput)) {
      const normTxt = normalizeWhitespace(txt).toLowerCase();
      if (!seen.has(normTxt)) {
        seen.add(normTxt);
        const severity = item.severity === 'high' ? 'high' : 'warning';
        valid.push({
          text: txt,
          reason: String(item.reason || 'Flagged phrase in message').trim(),
          severity
        });
      }
    }
  }

  return valid;
}

function validateChecks(checksInput, rawInput) {
  const checksMap = new Map();

  if (Array.isArray(checksInput)) {
    for (const c of checksInput) {
      if (c && typeof c.key === 'string' && CHECK_KEYS.includes(c.key)) {
        const state = VALID_CHECK_STATES.has(c.state) ? c.state : 'not_applicable';
        let quote = undefined;
        if (typeof c.quote === 'string' && c.quote.trim()) {
          if (isExactSubstring(c.quote, rawInput)) {
            quote = c.quote.trim();
          }
        }
        checksMap.set(c.key, {
          key: c.key,
          title: CHECK_TITLES[c.key] || c.title || c.key,
          state,
          reason: String(c.reason || 'Evaluation completed.').trim(),
          quote
        });
      }
    }
  }

  return CHECK_KEYS.map(key => {
    if (checksMap.has(key)) {
      return checksMap.get(key);
    }
    return {
      key,
      title: CHECK_TITLES[key] || key,
      state: 'not_applicable',
      reason: 'No specific observations noted for this check in the submitted text.'
    };
  });
}

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
        check(c.reason, `checks[${idx}].reason`);
        check(c.title, `checks[${idx}].title`);
      }
    });
  }

  if (Array.isArray(data.whatToDo)) {
    data.whatToDo.forEach((act, idx) => {
      check(act, `whatToDo[${idx}]`);
    });
  }

  if (Array.isArray(data.signals)) {
    data.signals.forEach((sig, idx) => {
      if (sig) {
        check(sig.why, `signals[${idx}].why`);
        check(sig.label, `signals[${idx}].label`);
      }
    });
  }

  if (Array.isArray(data.flaggedPhrases)) {
    data.flaggedPhrases.forEach((fp, idx) => {
      if (fp) {
        check(fp.reason, `flaggedPhrases[${idx}].reason`);
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
      if (c && typeof c.reason === 'string') {
        c.reason = sanitize(c.reason);
      }
    }
  }

  if (Array.isArray(data.whatToDo)) {
    data.whatToDo = data.whatToDo.map(act => (typeof act === 'string' ? sanitize(act) : act));
  }

  if (Array.isArray(data.signals)) {
    for (const sig of data.signals) {
      if (sig) {
        if (typeof sig.why === 'string') sig.why = sanitize(sig.why);
        if (typeof sig.label === 'string') sig.label = sanitize(sig.label);
      }
    }
  }

  if (Array.isArray(data.flaggedPhrases)) {
    for (const fp of data.flaggedPhrases) {
      if (fp && typeof fp.reason === 'string') {
        fp.reason = sanitize(fp.reason);
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

function validatePassResult(result, rawInput) {
  if (!result || typeof result !== 'object') {
    return { ok: false, reason: 'Result is not an object' };
  }

  const level = String(result.level || '').toLowerCase();
  if (!VALID_LEVELS.has(level)) {
    return { ok: false, reason: `Invalid level: ${result.level}` };
  }

  const score = (result.riskScore === null || result.riskScore === undefined)
    ? ((result.score === null || result.score === undefined) ? null : Number(result.score))
    : Number(result.riskScore);

  if (!isBandConsistent(level, score)) {
    return { ok: false, reason: `Score ${score} inconsistent with level ${level}` };
  }

  const certainty = typeof result.certainty === 'number'
    ? Math.max(0, Math.min(1, result.certainty))
    : (typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : 0.5);

  const rawScamType = String(result.scamType || '').trim();
  const scamType = SCAM_TYPES.includes(rawScamType) ? rawScamType : (level === 'low' ? 'none' : 'Other scam');

  const rawAction = String(result.requestedAction || '').trim();
  const requestedAction = REQUESTED_ACTIONS.includes(rawAction) ? rawAction : (level === 'low' ? 'none' : 'none');

  const filteredSignals = filterSignalsQuotes(result.signals, rawInput);
  const filteredPhrases = filterFlaggedPhrases(result.flaggedPhrases, rawInput);
  const validatedChecks = validateChecks(result.checks, rawInput);

  let whatToDo = Array.isArray(result.whatToDo)
    ? result.whatToDo.map(s => String(s || '').trim()).filter(Boolean)
    : [];

  // Guarantee mandatory advice in whatToDo
  if (!whatToDo.some(w => w.includes('Do not click links'))) {
    whatToDo.unshift(MANDATORY_WHAT_TO_DO);
  }
  if (level === 'high' && !whatToDo.some(w => w.includes('1930') || w.includes('cybercrime.gov.in'))) {
    whatToDo.push(CYBERCRIME_ADVICE);
  }

  const conversationSummary = String(result.conversationSummary || '').trim();
  const explanation = String(result.explanation || '').trim();
  const primaryConcern = explanation || (conversationSummary ? `${conversationSummary}.` : 'Message evaluation completed.');

  return {
    ok: true,
    data: {
      level,
      score,
      riskScore: score,
      certainty,
      confidence: certainty,
      scamType,
      requestedAction,
      signals: filteredSignals,
      checks: validatedChecks,
      flaggedPhrases: filteredPhrases,
      conversationSummary: conversationSummary || 'Submitted communication analyzed.',
      explanation: explanation || 'Evidence suggests standard communication without red flags.',
      primaryConcern,
      whatToDo
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
    if (p2.certainty >= 0.7) return p2;
    return { ...p1, explanation: 'Communication context was too ambiguous or brief to verify risk reliably.' };
  }
  if (p2.level === 'unable') {
    if (p1.certainty >= 0.7) return p1;
    return { ...p2, explanation: 'Communication context was too ambiguous or brief to verify risk reliably.' };
  }

  // Merge signals without duplicate quotes
  const seenQuotes = new Set();
  const mergedSignals = [];
  for (const item of [...(p1.signals || []), ...(p2.signals || [])]) {
    const q = item.quote ? normalizeWhitespace(item.quote).toLowerCase() : null;
    if (!q || !seenQuotes.has(q)) {
      if (q) seenQuotes.add(q);
      mergedSignals.push(item);
    }
  }

  // Merge flagged phrases
  const seenPhrases = new Set();
  const mergedPhrases = [];
  for (const fp of [...(p1.flaggedPhrases || []), ...(p2.flaggedPhrases || [])]) {
    const txt = normalizeWhitespace(fp.text).toLowerCase();
    if (!seenPhrases.has(txt)) {
      seenPhrases.add(txt);
      mergedPhrases.push(fp);
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
  const severityOrder = { 'fail': 4, 'warn': 3, 'pass': 2, 'not_applicable': 1 };
  const mergedChecks = CHECK_KEYS.map(key => {
    const c1 = (p1.checks || []).find(c => c.key === key);
    const c2 = (p2.checks || []).find(c => c.key === key);
    if (!c1 && !c2) {
      return { key, title: CHECK_TITLES[key] || key, state: 'not_applicable', reason: 'Not applicable.' };
    }
    if (!c1) return c2;
    if (!c2) return c1;

    const s1 = severityOrder[c1.state] || 1;
    const s2 = severityOrder[c2.state] || 1;
    const bestState = s1 >= s2 ? c1.state : c2.state;
    const reason = c1.reason && c1.reason.length > (c2.reason || '').length ? c1.reason : (c2.reason || c1.reason);
    return {
      key,
      title: CHECK_TITLES[key] || c1.title || key,
      state: bestState,
      reason,
      quote: c1.quote || c2.quote
    };
  });

  const o1 = LEVEL_ORDER[p1.level] || 0;
  const o2 = LEVEL_ORDER[p2.level] || 0;
  const diff = Math.abs(o1 - o2);

  const scamType = (p1.scamType && p1.scamType !== 'none' && p1.scamType !== 'unclear') ? p1.scamType : p2.scamType;
  const requestedAction = (p1.requestedAction && p1.requestedAction !== 'none') ? p1.requestedAction : p2.requestedAction;

  // Case 1: Same level
  if (diff === 0) {
    const avgScore = (p1.score != null && p2.score != null)
      ? Math.round((p1.score + p2.score) / 2)
      : (p1.score ?? p2.score);
    const avgCertainty = Number(((p1.certainty + p2.certainty) / 2).toFixed(2));

    return {
      level: p1.level,
      score: avgScore,
      riskScore: avgScore,
      certainty: avgCertainty,
      confidence: avgCertainty,
      scamType,
      requestedAction,
      signals: mergedSignals,
      checks: mergedChecks,
      flaggedPhrases: mergedPhrases,
      conversationSummary: p1.conversationSummary || p2.conversationSummary,
      explanation: p1.explanation || p2.explanation,
      primaryConcern: p1.primaryConcern || p2.primaryConcern,
      whatToDo: mergedWhatToDo
    };
  }

  // Case 2: 1 level apart (e.g. low vs medium, or medium vs high)
  if (diff === 1) {
    const higherPass = o1 > o2 ? p1 : p2;
    const lowerConfidence = Math.max(0.1, Number((Math.min(p1.certainty, p2.certainty) - 0.15).toFixed(2)));
    const higherScore = Math.max(p1.score || 0, p2.score || 0);

    return {
      level: higherPass.level,
      score: higherScore,
      riskScore: higherScore,
      certainty: lowerConfidence,
      confidence: lowerConfidence,
      scamType: higherPass.scamType || scamType,
      requestedAction: higherPass.requestedAction || requestedAction,
      signals: mergedSignals,
      checks: mergedChecks,
      flaggedPhrases: mergedPhrases,
      conversationSummary: higherPass.conversationSummary,
      explanation: `${higherPass.explanation} (Note: Variance observed between evaluation passes; elevated risk selected for caution.)`,
      primaryConcern: higherPass.primaryConcern,
      whatToDo: mergedWhatToDo
    };
  }

  // Case 3: 2 levels apart (low vs high)
  const highPass = p1.level === 'high' ? p1 : p2;
  return {
    level: 'high',
    score: Math.max(70, highPass.score || 70),
    riskScore: Math.max(70, highPass.score || 70),
    certainty: 0.40,
    confidence: 0.40,
    scamType: highPass.scamType || scamType,
    requestedAction: highPass.requestedAction || requestedAction,
    signals: mergedSignals,
    checks: mergedChecks,
    flaggedPhrases: mergedPhrases,
    conversationSummary: highPass.conversationSummary,
    explanation: `${highPass.explanation} (Note: Independent analysis passes disagreed on overall risk level; high risk retained for user protection.)`,
    primaryConcern: highPass.primaryConcern,
    whatToDo: mergedWhatToDo
  };
}

module.exports = {
  isBandConsistent,
  isExactSubstring,
  filterSignalsQuotes,
  filterFlaggedPhrases,
  validateChecks,
  validatePassResult,
  resolvePassDisagreement,
  BANNED_CLAIMS_REGEX,
  SAFE_NEUTRAL_STRING,
  containsBannedClaims,
  findBannedClaims,
  sanitizeBannedClaims,
  VALID_LEVELS,
  VALID_CHECK_STATES,
  REQUIRED_CHECK_KEYS: CHECK_KEYS
};

