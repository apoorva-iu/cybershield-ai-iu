'use strict';

/**
 * Objective scoring and confidence engine for UPI and payment evaluations.
 *
 * All risk scores and confidence ratings are derived algorithmically from:
 * 1. Validated independent signals across distinct families with diminishing returns.
 * 2. Objective context factors (readability, text length, pass agreement, link lookups).
 * 3. Strict ceilings and caps (100 reachable only with 5+ signals, flagged link & dual agreement).
 * 4. Model self-certainty contribution strictly bounded at <= 15%.
 */

const { SCORING_CONFIG, CONFIDENCE_CONFIG } = require('./config');

/**
 * Extract active independent signals from analysis artifacts.
 */
function extractIndependentSignals({
  finalAi,
  deterministic,
  showUpiSafetyNote,
  maliciousLinkFound
}) {
  const signals = [];
  const checks = Array.isArray(finalAi && finalAi.checks) ? finalAi.checks : [];

  // Check 1: Payment Direction
  const dirCheck = checks.find(c => c.key === 'payment_direction');
  if (dirCheck) {
    if (dirCheck.state === 'flag') {
      signals.push({
        id: 'payment_direction_flag',
        family: 'payment_mechanics',
        name: 'Payment direction flagged',
        description: 'Payment direction indicates outbound funds or collect manipulation',
        weight: 34,
        severity: 1.0
      });
    } else if (dirCheck.state === 'warning') {
      signals.push({
        id: 'payment_direction_warn',
        family: 'payment_mechanics',
        name: 'Payment direction warning',
        description: 'Ambiguous or unverified payment flow direction',
        weight: 34,
        severity: 0.5
      });
    }
  }

  // Signal 2: Pay-to-receive or PIN trap (from deterministic parser or scamType)
  const isPayToReceive = showUpiSafetyNote === true || (finalAi && finalAi.scamType === 'pay_to_receive');
  if (isPayToReceive) {
    signals.push({
      id: 'pay_to_receive_or_pin',
      family: 'payment_mechanics',
      name: 'Pay-to-receive or PIN request trap',
      description: 'PIN requested to receive money or collect request presented as refund/deposit',
      weight: 28,
      severity: 1.0
    });
  }

  // Check 3: Proof Authenticity
  const proofCheck = checks.find(c => c.key === 'proof_authenticity');
  if (proofCheck) {
    if (proofCheck.state === 'flag') {
      signals.push({
        id: 'proof_authenticity_flag',
        family: 'proof_authenticity',
        name: 'Payment proof flagged',
        description: 'Transaction screenshot or receipt details cannot be verified against official bank records',
        weight: 32,
        severity: 1.0
      });
    } else if (proofCheck.state === 'warning') {
      signals.push({
        id: 'proof_authenticity_warn',
        family: 'proof_authenticity',
        name: 'Payment proof warning',
        description: 'External payment claims cannot be verified against bank statements',
        weight: 32,
        severity: 0.5
      });
    }
  }

  // Signal 4: Unverified proof pattern classification
  if (finalAi && finalAi.scamType === 'fake_payment_proof') {
    signals.push({
      id: 'fake_proof_pattern',
      family: 'proof_authenticity',
      name: 'Unverified transfer proof pattern',
      description: 'Communication pattern typical of unverified transfer proof with delivery pressure',
      weight: 24,
      severity: 1.0
    });
  }

  // Check 5: Urgency and Coercive Pressure
  const urgencyCheck = checks.find(c => c.key === 'urgency_and_pressure');
  if (urgencyCheck) {
    if (urgencyCheck.state === 'flag') {
      signals.push({
        id: 'urgency_and_pressure_flag',
        family: 'urgency_and_pressure',
        name: 'Urgency and pressure flagged',
        description: 'Coercive urgency, immediate release demands, or deadline pressure',
        weight: 28,
        severity: 1.0
      });
    } else if (urgencyCheck.state === 'warning') {
      signals.push({
        id: 'urgency_and_pressure_warn',
        family: 'urgency_and_pressure',
        name: 'Elevated urgency warning',
        description: 'Prompt payment or expedited action demanded',
        weight: 28,
        severity: 0.5
      });
    }
  }

  // Signal 6: Overpayment trap or advance fee pattern
  if (finalAi && (finalAi.scamType === 'overpayment_trap' || finalAi.scamType === 'advance_fee')) {
    signals.push({
      id: 'coercive_pattern',
      family: 'urgency_and_pressure',
      name: finalAi.scamType === 'overpayment_trap' ? 'Accidental transfer reversal trap' : 'Advance registration fee pattern',
      description: finalAi.scamType === 'overpayment_trap'
        ? 'Claim that funds were sent by mistake demanding immediate manual return'
        : 'Requirement to pay upfront fees prior to receiving employment or rewards',
      weight: 25,
      severity: 1.0
    });
  }

  // Check 7: Channel and Identity
  const channelCheck = checks.find(c => c.key === 'channel_and_identity');
  if (channelCheck) {
    if (channelCheck.state === 'flag') {
      signals.push({
        id: 'channel_and_identity_flag',
        family: 'identity_and_channel',
        name: 'Channel or identity flagged',
        description: 'Impersonation of official institutions or suspicious communication channel',
        weight: 26,
        severity: 1.0
      });
    } else if (channelCheck.state === 'warning') {
      signals.push({
        id: 'channel_and_identity_warn',
        family: 'identity_and_channel',
        name: 'Channel or identity warning',
        description: 'Unconfirmed sender identity or unofficial contact method',
        weight: 26,
        severity: 0.5
      });
    }
  }

  // Signal 8: Unverified UPI handle
  const handleInfo = deterministic && Array.isArray(deterministic.handleInfo) ? deterministic.handleInfo : [];
  if (handleInfo.some(h => h.wellKnown === false)) {
    signals.push({
      id: 'unverified_handle',
      family: 'identity_and_channel',
      name: 'Unrecognized UPI handle',
      description: 'Recipient address uses a handle not recognized on standard banking PSP lists',
      weight: 18,
      severity: 0.6
    });
  }

  // Signal 9: External Malicious Link
  if (maliciousLinkFound === true) {
    signals.push({
      id: 'malicious_link_flag',
      family: 'threat_intelligence',
      name: 'Malicious URL in security threat feed',
      description: 'Link flagged as suspicious or malicious on threat intelligence databases',
      weight: 40,
      severity: 1.0
    });
  }

  // Signal 10: Verified verbatim evidence excerpts
  const evidence = Array.isArray(finalAi && finalAi.evidence) ? finalAi.evidence : [];
  if (evidence.length >= 2) {
    signals.push({
      id: 'evidence_quotes_multiple',
      family: 'textual_evidence',
      name: 'Multiple verified incriminating excerpts',
      description: `Corroborated by ${evidence.length} verified verbatim text excerpts`,
      weight: 20,
      severity: 1.0
    });
  } else if (evidence.length === 1) {
    signals.push({
      id: 'evidence_quotes_single',
      family: 'textual_evidence',
      name: 'Verified incriminating excerpt',
      description: `Corroborated by verified text excerpt "${evidence[0].quote.slice(0, 32)}..."`,
      weight: 20,
      severity: 0.5
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
        family: 'contextual_risk',
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
          family: 'contextual_risk',
          description: 'Other signals',
          points: gap
        });
      }
    } else {
      breakdown.push({
        signal: 'other_signals',
        family: 'contextual_risk',
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
      family: 'contextual_risk',
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
  linkLookups,
  maliciousLinkFound
}) {
  const factors = [];

  // Factor 1: OCR Readability (up to +0.20)
  const effReadability = (source === 'pasted' || source === 'shared') ? 'good' : (readability || 'good');
  let readabilityPts = 0.20;
  if (effReadability === 'poor') {
    readabilityPts = 0.06;
    factors.push({
      label: 'Degraded screenshot text',
      text: 'Degraded screenshot text',
      effect: 'lowers'
    });
  } else if (effReadability === 'none') {
    readabilityPts = 0.00;
    factors.push({
      label: 'Unreadable screenshot text',
      text: 'Unreadable screenshot text',
      effect: 'lowers'
    });
  } else {
    factors.push({
      label: 'Clear screenshot text',
      text: 'Clear screenshot text',
      effect: 'raises'
    });
  }

  // Factor 2: Amount of text context (up to +0.15)
  let textPts = 0.00;
  if (textLength >= 60) {
    textPts = (textLength >= 150) ? 0.15 : 0.10;
    factors.push({
      label: 'Enough text to judge',
      text: 'Enough text to judge',
      effect: 'raises'
    });
  } else if (textLength >= 20) {
    textPts = 0.05;
    factors.push({
      label: 'Brief message text context',
      text: 'Brief message text context',
      effect: 'neutral'
    });
  } else {
    textPts = 0.00;
    factors.push({
      label: 'Minimal message text context',
      text: 'Minimal message text context',
      effect: 'lowers'
    });
  }

  // Factor 3: Number and weight of independent signals (up to +0.25)
  let signalsPts = 0.00;
  if (signalsCount >= 3 && signalPointsSum >= 40) {
    signalsPts = 0.25;
    factors.push({
      label: 'Several independent signals',
      text: 'Several independent signals',
      effect: 'raises'
    });
  } else if (signalsCount >= 2) {
    signalsPts = 0.18;
    factors.push({
      label: 'Several independent signals',
      text: 'Several independent signals',
      effect: 'raises'
    });
  } else if (signalsCount === 1) {
    signalsPts = 0.10;
    factors.push({
      label: 'Single independent signal',
      text: 'Single independent signal',
      effect: 'neutral'
    });
  } else {
    if (finalAi && finalAi.level === 'low') {
      signalsPts = 0.15;
      factors.push({
        label: 'Consistent normal payment pattern across checks',
        text: 'Consistent normal payment pattern across checks',
        effect: 'raises'
      });
    } else {
      signalsPts = 0.04;
      factors.push({
        label: 'Limited independent signals',
        text: 'Limited independent signals',
        effect: 'lowers'
      });
    }
  }

  // Factor 4: Agreement between passes (up to +0.20)
  let passesPts = 0.00;
  if (passCount >= 2 && passesAgreed === true) {
    passesPts = 0.20;
    factors.push({
      label: 'Two readings agreed',
      text: 'Two readings agreed',
      effect: 'raises'
    });
  } else if (passCount === 1) {
    passesPts = 0.08;
    factors.push({
      label: 'Single reading completed',
      text: 'Single reading completed',
      effect: 'neutral'
    });
  } else {
    passesPts = 0.02;
    factors.push({
      label: 'Variance between readings',
      text: 'Variance between readings',
      effect: 'lowers'
    });
  }

  // Factor 5: Completed link lookups (up to +0.12)
  let linksPts = 0.00;
  if (linkLookups > 0) {
    if (maliciousLinkFound) {
      linksPts = 0.12;
      factors.push({
        label: 'Threat feed flagged suspicious link',
        text: 'Threat feed flagged suspicious link',
        effect: 'raises'
      });
    } else {
      linksPts = 0.06;
      factors.push({
        label: 'External links checked',
        text: 'External links checked',
        effect: 'neutral'
      });
    }
  } else {
    linksPts = 0.04;
    factors.push({
      label: 'No links to look up',
      text: 'No links to look up',
      effect: 'neutral'
    });
  }

  // Factor 6: Model self-certainty (at most 15%)
  // Contributes to rawTotal mathematically, but self-assessed certainty line is omitted from factors
  const rawAiConf = (finalAi && typeof finalAi.confidence === 'number') ? finalAi.confidence : 0.5;
  const aiCertaintyPts = Math.min(0.15, Math.max(0, Number((rawAiConf * 0.15).toFixed(3))));

  let rawTotal = readabilityPts + textPts + signalsPts + passesPts + linksPts + aiCertaintyPts;
  rawTotal = Math.min(1.0, Math.max(0.10, rawTotal));

  // Cap rule: Cap at 0.9 unless two passes agreed, 3 or more independent signals fired and readability was good
  const canExceedCap = (passesAgreed === true && signalsCount >= 3 && effReadability === 'good');
  if (!canExceedCap && rawTotal > 0.90) {
    rawTotal = 0.90;
    factors.push({
      label: 'Confidence capped without full verification conditions',
      text: 'Confidence capped without full verification conditions',
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
function evaluateUpiScoreAndConfidence({
  finalAi,
  cleanText,
  deterministic,
  showUpiSafetyNote,
  linkLookups,
  maliciousLinkFound,
  passCount,
  passesAgreed,
  source,
  readability
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
    showUpiSafetyNote,
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
    linkLookups,
    maliciousLinkFound
  });

  // Reconcile scoreBreakdown sum to finalScore if any difference exists
  const sum = (scoreBreakdown || []).reduce((s, item) => s + (item.points || 0), 0);
  if (scoreBreakdown && finalScore != null && sum !== finalScore) {
    const gap = finalScore - sum;
    scoreBreakdown.push({
      signal: 'other_signals',
      family: 'contextual_risk',
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
  evaluateUpiScoreAndConfidence
};

