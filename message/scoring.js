'use strict';

/**
 * Objective scoring and confidence engine for message and chat scam checks.
 *
 * All risk scores and confidence ratings are derived algorithmically from:
 * 1. Validated independent signals across distinct families with diminishing returns.
 * 2. Objective context factors (readability, text length, pass agreement, link lookups).
 * 3. Strict ceilings and caps (100 reachable only with 5+ signals, flagged link & dual agreement).
 * 4. Model self-certainty contribution strictly bounded at <= 15%.
 */

const { SCORING_CONFIG, CONFIDENCE_CONFIG } = require('./config');

/**
 * Extract active independent signals from analysis artifacts and checks.
 */
function extractIndependentSignals({
  finalAi,
  deterministic,
  maliciousLinkFound
}) {
  const signals = [];
  const checks = Array.isArray(finalAi && finalAi.checks) ? finalAi.checks : [];

  // Check 1: Message Wording
  const wordingCheck = checks.find(c => c.key === 'message_wording');
  if (wordingCheck) {
    if (wordingCheck.state === 'fail') {
      signals.push({
        id: 'message_wording_fail',
        family: 'wording_and_tone',
        name: 'Deceptive or manipulative message wording',
        description: wordingCheck.reason || 'Message wording exhibits high manipulation or deception patterns',
        weight: 32,
        severity: 1.0
      });
    } else if (wordingCheck.state === 'warn') {
      signals.push({
        id: 'message_wording_warn',
        family: 'wording_and_tone',
        name: 'Suspicious wording tone',
        description: wordingCheck.reason || 'Message wording shows irregular or suspicious styling',
        weight: 32,
        severity: 0.5
      });
    }
  }

  // Check 2: Request or Demand
  const reqCheck = checks.find(c => c.key === 'request_or_demand');
  if (reqCheck) {
    if (reqCheck.state === 'fail') {
      signals.push({
        id: 'request_or_demand_fail',
        family: 'request_mechanics',
        name: 'Critical credential or payment request',
        description: reqCheck.reason || 'Demands sensitive credentials, OTP, PIN, or immediate money transfer',
        weight: 36,
        severity: 1.0
      });
    } else if (reqCheck.state === 'warn') {
      signals.push({
        id: 'request_or_demand_warn',
        family: 'request_mechanics',
        name: 'Unverified action requested',
        description: reqCheck.reason || 'Requests document sharing, app installation, or external contact',
        weight: 36,
        severity: 0.5
      });
    }
  }

  // Action-specific signal
  const act = finalAi && finalAi.requestedAction;
  if (act && act !== 'none') {
    if (act === 'share OTP or PIN or password') {
      signals.push({
        id: 'action_otp_or_pin',
        family: 'request_mechanics',
        name: 'OTP or PIN solicitation',
        description: 'Direct request to disclose one-time passcode, security PIN, or password',
        weight: 36,
        severity: 1.0
      });
    } else if (act === 'pay money' || act === 'deposit to unlock earnings') {
      signals.push({
        id: 'action_payment_demand',
        family: 'request_mechanics',
        name: 'Fund transfer or deposit demand',
        description: 'Solicitation for advance fees, activation deposits, or direct payment',
        weight: 32,
        severity: 1.0
      });
    } else if (act === 'install an app') {
      signals.push({
        id: 'action_app_install',
        family: 'request_mechanics',
        name: 'Application installation lure',
        description: 'Solicitation to download and execute external package or application',
        weight: 30,
        severity: 1.0
      });
    }
  }

  // Check 3: Links and Apps
  const linkCheck = checks.find(c => c.key === 'links_and_apps');
  if (linkCheck) {
    if (linkCheck.state === 'fail') {
      signals.push({
        id: 'links_and_apps_fail',
        family: 'links_and_attachments',
        name: 'High-risk link or APK download',
        description: linkCheck.reason || 'Suspicious URL, URL shortener, or direct APK download link',
        weight: 34,
        severity: 1.0
      });
    } else if (linkCheck.state === 'warn') {
      signals.push({
        id: 'links_and_apps_warn',
        family: 'links_and_attachments',
        name: 'External link caution',
        description: linkCheck.reason || 'Contains external URL requiring verification',
        weight: 34,
        severity: 0.5
      });
    }
  }

  // Check 4: Sender Details
  const senderCheck = checks.find(c => c.key === 'sender_details');
  if (senderCheck) {
    if (senderCheck.state === 'fail') {
      signals.push({
        id: 'sender_details_fail',
        family: 'sender_and_channel',
        name: 'Sender impersonation or identity mismatch',
        description: senderCheck.reason || 'Impersonates institutional authority or uses mismatched communication channel',
        weight: 28,
        severity: 1.0
      });
    } else if (senderCheck.state === 'warn') {
      signals.push({
        id: 'sender_details_warn',
        family: 'sender_and_channel',
        name: 'Unverified sender origin',
        description: senderCheck.reason || 'Sender claims identity without verifiable institutional headers',
        weight: 28,
        severity: 0.5
      });
    }
  }

  // Check 5: Urgency and Pressure
  const urgencyCheck = checks.find(c => c.key === 'urgency_and_pressure');
  if (urgencyCheck) {
    if (urgencyCheck.state === 'fail') {
      signals.push({
        id: 'urgency_and_pressure_fail',
        family: 'pressure_and_coercion',
        name: 'Coercive urgency or panic induction',
        description: urgencyCheck.reason || 'Threatens arrest, legal action, account termination, or immediate penalty',
        weight: 32,
        severity: 1.0
      });
    } else if (urgencyCheck.state === 'warn') {
      signals.push({
        id: 'urgency_and_pressure_warn',
        family: 'pressure_and_coercion',
        name: 'Artificial time pressure',
        description: urgencyCheck.reason || 'Presents strict deadline or urgent response requirement',
        weight: 32,
        severity: 0.5
      });
    }
  }

  // Check 6: Conversation Pattern
  const patternCheck = checks.find(c => c.key === 'conversation_pattern');
  if (patternCheck) {
    if (patternCheck.state === 'fail') {
      signals.push({
        id: 'conversation_pattern_fail',
        family: 'interaction_pattern',
        name: 'Known fraud interaction structure',
        description: patternCheck.reason || 'Follows typical fraud playbook structure',
        weight: 26,
        severity: 1.0
      });
    } else if (patternCheck.state === 'warn') {
      signals.push({
        id: 'conversation_pattern_warn',
        family: 'interaction_pattern',
        name: 'Irregular interaction flow',
        description: patternCheck.reason || 'Unusual conversational progression or unsolicited topic switch',
        weight: 26,
        severity: 0.5
      });
    }
  }

  // Scam type specific interaction signal
  const scamType = finalAi && finalAi.scamType;
  if (scamType && !['none', 'unclear', 'Other scam'].includes(scamType)) {
    signals.push({
      id: 'scam_type_classification',
      family: 'interaction_pattern',
      name: scamType,
      description: `Interaction pattern aligned with ${scamType.toLowerCase()}`,
      weight: 24,
      severity: 1.0
    });
  }

  // Signal 7: External Malicious Link Threat Intelligence
  if (maliciousLinkFound === true) {
    signals.push({
      id: 'malicious_link_threat_intel',
      family: 'threat_intelligence',
      name: 'Malicious URL in security threat feed',
      description: 'Domain or URL flagged in live threat intelligence records',
      weight: 42,
      severity: 1.0
    });
  }

  // Add validated signals from AI if provided
  if (Array.isArray(finalAi && finalAi.signals)) {
    finalAi.signals.forEach((s, idx) => {
      if (s && s.label) {
        signals.push({
          id: `ai_signal_${idx}`,
          family: 'wording_and_tone',
          name: s.label,
          description: s.why || s.label,
          weight: Math.round((s.weight || 0.5) * 25),
          severity: 1.0
        });
      }
    });
  }

  return signals;
}

/**
 * Apply diminishing returns across signal families and compute raw score and breakdown.
 */
function computeScoreBreakdown(signals, level, canReach100) {
  if (signals.length === 0) {
    const defaultScore = level === 'low' ? 0 : (level === 'medium' ? 35 : 70);
    return {
      finalScore: defaultScore,
      scoreBreakdown: defaultScore > 0 ? [{
        signal: 'other_signals',
        family: 'interaction_pattern',
        description: 'Other signals',
        points: defaultScore
      }] : []
    };
  }

  // Group signals by family
  const families = {};
  for (const sig of signals) {
    if (!families[sig.family]) families[sig.family] = [];
    families[sig.family].push(sig);
  }

  // Sort within family by raw impact (weight * severity) descending
  const diminishingCurve = (SCORING_CONFIG && SCORING_CONFIG.DIMINISHING_RETURNS) || [1.0, 0.4, 0.2];
  const items = [];

  for (const fam of Object.keys(families)) {
    const list = families[fam];
    list.sort((a, b) => (b.weight * b.severity) - (a.weight * a.severity));

    list.forEach((sig, index) => {
      const multiplier = index < diminishingCurve.length ? diminishingCurve[index] : diminishingCurve[diminishingCurve.length - 1];
      const rawPoints = Math.round(sig.weight * sig.severity * multiplier);
      items.push({
        signal: sig.id,
        family: sig.family,
        description: sig.description || sig.name,
        rawPoints: Math.max(1, rawPoints)
      });
    });
  }

  const rawSum = items.reduce((acc, it) => acc + it.rawPoints, 0);

  // Determine target score based on level and ceilings
  let targetScore = rawSum;

  if (level === 'high') {
    // Obvious scams without all 3 criteria cap at 97 (typical obvious: 80 - 97)
    const highCeiling = canReach100 ? 100 : 97;
    targetScore = Math.max(70, Math.min(highCeiling, rawSum));
  } else if (level === 'medium') {
    targetScore = Math.max(30, Math.min(69, rawSum));
  } else if (level === 'low') {
    targetScore = Math.max(0, Math.min(29, rawSum));
  }

  // Allocate points proportionally so that sum(items.points) === targetScore exactly
  if (targetScore === 0) {
    return {
      finalScore: 0,
      scoreBreakdown: []
    };
  }

  let allocatedSum = 0;
  const breakdown = items.map(it => {
    const scaled = Math.round((it.rawPoints / rawSum) * targetScore);
    allocatedSum += scaled;
    return {
      signal: it.signal,
      family: it.family,
      description: it.description,
      points: scaled
    };
  });

  // Reconcile any rounding gap against the largest item
  const gap = targetScore - allocatedSum;
  if (gap !== 0) {
    if (breakdown.length > 0) {
      let maxIdx = 0;
      for (let i = 1; i < breakdown.length; i++) {
        if (breakdown[i].points > breakdown[maxIdx].points) maxIdx = i;
      }
      if (breakdown[maxIdx].points + gap >= 0) {
        breakdown[maxIdx].points += gap;
      } else {
        breakdown.push({
          signal: 'other_signals',
          family: 'interaction_pattern',
          description: 'Other signals',
          points: gap
        });
      }
    } else {
      breakdown.push({
        signal: 'other_signals',
        family: 'interaction_pattern',
        description: 'Other signals',
        points: gap
      });
    }
  }

  // Final check: sum of breakdown.points must exactly equal targetScore
  const checkSum = breakdown.reduce((acc, it) => acc + (it.points || 0), 0);
  if (checkSum !== targetScore) {
    breakdown.push({
      signal: 'other_signals',
      family: 'interaction_pattern',
      description: 'Other signals',
      points: targetScore - checkSum
    });
  }

  return {
    finalScore: targetScore,
    scoreBreakdown: breakdown
  };
}

/**
 * Objective confidence calculation.
 */
function computeConfidence({
  finalAi,
  textLength,
  signalsCount,
  signalPointsSum,
  passCount,
  passesAgreed,
  readability,
  source,
  truncated,
  linkLookups,
  maliciousLinkFound
}) {
  const factors = [];

  // Factor 1: OCR Readability & Truncation (up to +0.20)
  const effReadability = (source === 'text' || source === 'pasted' || source === 'shared') ? 'good' : (readability || 'good');
  let readabilityPts = 0.20;
  if (effReadability === 'poor') {
    readabilityPts = 0.06;
    factors.push({
      label: 'Degraded screenshot text',
      effect: 'lowers'
    });
  } else if (effReadability === 'none') {
    readabilityPts = 0.00;
    factors.push({
      label: 'Unreadable screenshot text',
      effect: 'lowers'
    });
  } else {
    factors.push({
      label: 'Clear text transcription',
      effect: 'raises'
    });
  }

  if (truncated === true) {
    readabilityPts = Math.max(0, readabilityPts - 0.05);
    factors.push({
      label: 'Truncated screen text',
      effect: 'lowers'
    });
  }

  // Factor 2: Amount of text context (up to +0.15)
  let textPts = 0.00;
  if (textLength >= 150) {
    textPts = 0.15;
    factors.push({
      label: 'Comprehensive message text context',
      effect: 'raises'
    });
  } else if (textLength >= 60) {
    textPts = 0.10;
    factors.push({
      label: 'Adequate message text context',
      effect: 'raises'
    });
  } else if (textLength >= 20) {
    textPts = 0.05;
    factors.push({
      label: 'Brief message text context',
      effect: 'neutral'
    });
  } else {
    textPts = 0.00;
    factors.push({
      label: 'Minimal message text context',
      effect: 'lowers'
    });
  }

  // Factor 3: Number and weight of independent signals (up to +0.25)
  let signalsPts = 0.00;
  if (signalsCount >= 3 && signalPointsSum >= 40) {
    signalsPts = 0.25;
    factors.push({
      label: 'Multiple corroborated risk signals',
      effect: 'raises'
    });
  } else if (signalsCount >= 2) {
    signalsPts = 0.18;
    factors.push({
      label: 'Multiple independent signals',
      effect: 'raises'
    });
  } else if (signalsCount === 1) {
    signalsPts = 0.10;
    factors.push({
      label: 'Single risk indicator',
      effect: 'neutral'
    });
  } else {
    if (finalAi && finalAi.level === 'low') {
      signalsPts = 0.15;
      factors.push({
        label: 'Consistent benign communication pattern',
        effect: 'raises'
      });
    } else {
      signalsPts = 0.04;
      factors.push({
        label: 'Limited independent signals',
        effect: 'lowers'
      });
    }
  }

  // Factor 4: Agreement between passes (up to +0.20)
  let passesPts = 0.00;
  if (passCount >= 2 && passesAgreed === true) {
    passesPts = 0.20;
    factors.push({
      label: 'Independent analysis passes agreed',
      effect: 'raises'
    });
  } else if (passCount === 1) {
    passesPts = 0.08;
    factors.push({
      label: 'Single reading completed',
      effect: 'neutral'
    });
  } else {
    passesPts = 0.02;
    factors.push({
      label: 'Variance between evaluation passes',
      effect: 'lowers'
    });
  }

  // Factor 5: Completed link lookups (up to +0.12)
  let linksPts = 0.00;
  if (linkLookups > 0) {
    if (maliciousLinkFound) {
      linksPts = 0.12;
      factors.push({
        label: 'External threat database confirmation',
        effect: 'raises'
      });
    } else {
      linksPts = 0.06;
      factors.push({
        label: 'External link lookups completed',
        effect: 'neutral'
      });
    }
  } else {
    linksPts = 0.04;
    factors.push({
      label: 'No external links requiring lookup',
      effect: 'neutral'
    });
  }

  // Factor 6: Model self-certainty (at most 15%)
  const rawAiCertainty = (finalAi && typeof finalAi.certainty === 'number')
    ? finalAi.certainty
    : ((finalAi && typeof finalAi.confidence === 'number') ? finalAi.confidence : 0.5);
  const aiCertaintyPts = Math.min(0.15, Math.max(0, Number((rawAiCertainty * 0.15).toFixed(3))));

  let rawTotal = readabilityPts + textPts + signalsPts + passesPts + linksPts + aiCertaintyPts;
  rawTotal = Math.min(1.0, Math.max(0.10, rawTotal));

  // Cap rule: Cap at 0.9 unless two passes agreed, 3 or more independent signals fired and readability was good
  const canExceedCap = (passesAgreed === true && signalsCount >= 3 && effReadability === 'good');
  if (!canExceedCap && rawTotal > 0.90) {
    rawTotal = 0.90;
    factors.push({
      label: 'Confidence capped without full verification conditions',
      effect: 'lowers'
    });
  }

  const finalConfidence = Number(rawTotal.toFixed(2));

  // Confidence bands: "low" below 0.4, "medium" up to 0.7, "high" above
  let confidenceBand = 'low';
  if (finalConfidence > 0.7) {
    confidenceBand = 'high';
  } else if (finalConfidence >= 0.4) {
    confidenceBand = 'medium';
  } else {
    confidenceBand = 'low';
  }

  return {
    confidence: finalConfidence,
    confidenceBand,
    confidenceFactors: factors
  };
}

/**
 * Main evaluation orchestrator: derives riskScore and objective confidence.
 */
function evaluateMessageScoreAndConfidence({
  finalAi,
  cleanText,
  deterministic,
  linkLookups,
  maliciousLinkFound,
  passCount,
  passesAgreed,
  source,
  readability,
  truncated
}) {
  // Unable or AI unavailable returns null for all score and confidence properties
  if (!finalAi || finalAi.level === 'unable' || finalAi.reason === 'ai_unavailable') {
    return {
      level: 'unable',
      score: null,
      scoreBreakdown: null,
      confidence: null,
      confidenceBand: null,
      confidenceFactors: null
    };
  }

  const activeSignals = extractIndependentSignals({
    finalAi,
    deterministic,
    maliciousLinkFound
  });

  const independentSignalsCount = activeSignals.length;

  // 100 reachable ONLY when at least 5 independent signals, a flagged link lookup, and pass agreement all hold
  const canReach100 = (independentSignalsCount >= 5 && maliciousLinkFound === true && passesAgreed === true);

  const { finalScore, scoreBreakdown } = computeScoreBreakdown(activeSignals, finalAi.level, canReach100);

  const signalPointsSum = scoreBreakdown.reduce((sum, item) => sum + item.points, 0);

  const { confidence, confidenceBand, confidenceFactors } = computeConfidence({
    finalAi,
    textLength: cleanText.length,
    signalsCount: independentSignalsCount,
    signalPointsSum,
    passCount,
    passesAgreed,
    readability,
    source,
    truncated,
    linkLookups,
    maliciousLinkFound
  });

  // Reconcile scoreBreakdown sum to finalScore if any difference exists
  const sum = (scoreBreakdown || []).reduce((s, item) => s + (item.points || 0), 0);
  if (scoreBreakdown && finalScore != null && sum !== finalScore) {
    const gap = finalScore - sum;
    scoreBreakdown.push({
      signal: 'other_signals',
      family: 'interaction_pattern',
      description: 'Other signals',
      points: gap
    });
  }

  return {
    level: finalAi.level,
    score: finalScore,
    scoreBreakdown,
    confidence,
    confidenceBand,
    confidenceFactors
  };
}

module.exports = {
  extractIndependentSignals,
  computeScoreBreakdown,
  computeConfidence,
  evaluateMessageScoreAndConfidence
};

