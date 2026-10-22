'use strict';
const cfg = require('../config');

const env = k => (process.env[k] || '').trim();

function getVisionModel() {
  return env('LLM_VISION_MODEL') || (cfg.runtime.llm && cfg.runtime.llm.geminiModelDefault) || 'gemini-flash-lite-latest';
}

function getAnalysisModel() {
  return env('LLM_ANALYSIS_MODEL') || (cfg.runtime.llm && cfg.runtime.llm.geminiModelDefault) || 'gemini-flash-lite-latest';
}

function getPassesCount() {
  const envPasses = parseInt(env('UPI_PASSES'), 10);
  if (!isNaN(envPasses) && envPasses >= 1) return envPasses;
  const cfgPasses = cfg.runtime.upi && cfg.runtime.upi.passes;
  if (typeof cfgPasses === 'number' && cfgPasses >= 1) return cfgPasses;
  return 2;
}

/**
 * ============================================================================
 * UPI RISK SCORING & CONFIDENCE SPECIFICATION AND FORMULA DOCUMENTATION
 * ============================================================================
 *
 * 1. RISK SCORE FORMULA (0 - 100):
 * --------------------------------
 * Risk score is derived strictly from validated signals across independent
 * families. It is never an unvalidated copy of model self-ratings.
 *
 * Each active signal i in family f contributes:
 *    points_i = round(weight_i * severity_i * diminishing_factor_{f, idx})
 *
 * Where diminishing returns within the same family are applied:
 *    idx = 0 (1st signal in family): 1.0 (100% impact)
 *    idx = 1 (2nd signal in family): 0.4  (40% impact)
 *    idx >= 2 (3rd+ in family):      0.2  (20% impact)
 *
 * Obvious Scam Score Target:
 *    Typical obvious payment traps naturally sum to between 80 and 97.
 *
 * Strict 100-Point Ceiling Rule:
 *    Score 100 is ONLY reachable when ALL THREE conditions hold simultaneously:
 *      (a) At least 5 independent signals fired (signalsCount >= 5)
 *      (b) A flagged external link lookup occurred (maliciousLinkFound === true)
 *      (c) Dual analysis passes agreed on level (passesAgreed === true)
 *    If any of these conditions fails, the score is strictly capped at 97.
 *
 * Score Breakdown Guarantee:
 *    The points in scoreBreakdown are scaled proportionally to reconcile with
 *    the final score so that:
 *      sum(item.points for item in scoreBreakdown) === finalScore
 *
 * 2. OBJECTIVE CONFIDENCE FORMULA (0.00 - 1.00):
 * ----------------------------------------------
 * Confidence is calculated from objective evidence corroboration, with the AI's
 * raw self-certainty contributing AT MOST 15% (0.15).
 *
 * Objective Factors:
 *   (a) OCR Readability (up to +0.20):
 *       - Clear text / good OCR: +0.20
 *       - Degraded / poor OCR:  +0.06
 *       - Unreadable:           +0.00
 *   (b) Context Text Length (up to +0.15):
 *       - >= 150 characters:    +0.15
 *       - >= 60 characters:     +0.10
 *       - >= 20 characters:     +0.05
 *       - < 20 characters:      +0.00
 *   (c) Independent Signals Weight & Count (up to +0.25):
 *       - >= 3 signals & points >= 40: +0.25
 *       - >= 2 signals:               +0.18
 *       - 1 signal:                   +0.10
 *       - 0 signals (low risk):       +0.15
 *   (d) Pass Agreement (up to +0.20):
 *       - 2 passes agreed on level:   +0.20
 *       - Single pass completed:      +0.08
 *       - 2 passes differed:          +0.02
 *   (e) Completed Link Lookups (up to +0.12):
 *       - Malicious link confirmed:   +0.12
 *       - Clean links looked up:      +0.06
 *       - No links in text:           +0.04
 *   (f) AI Self-Certainty (up to +0.15):
 *       - ai_raw_confidence * 0.15 (capped at 0.15)
 *
 * Confidence Cap Rule:
 *   Capped at 0.90 UNLESS:
 *     (a) Two passes agreed, AND
 *     (b) 3 or more independent signals fired, AND
 *     (c) Readability was good.
 *
 * Confidence Bands:
 *   - "low":    confidence < 0.4
 *   - "medium": 0.4 <= confidence <= 0.7
 *   - "high":   confidence > 0.7
 *
 * For "unable" or "ai_unavailable":
 *   confidence, confidenceBand, confidenceFactors, score, and scoreBreakdown
 *   all evaluate to null.
 * ============================================================================
 */

const SCORING_CONFIG = {
  DIMINISHING_RETURNS: [1.0, 0.4, 0.2],
  OBVIOUS_SCAM_MIN: 80,
  OBVIOUS_SCAM_MAX_WITHOUT_100_CONDITIONS: 97,
  CONDITIONS_FOR_100: {
    minIndependentSignals: 5,
    requireFlaggedLink: true,
    requirePassAgreement: true
  },
  FAMILIES: [
    'payment_mechanics',
    'proof_authenticity',
    'urgency_and_pressure',
    'identity_and_channel',
    'threat_intelligence',
    'textual_evidence'
  ]
};

const CONFIDENCE_CONFIG = {
  MAX_AI_SELF_CERTAINTY_WEIGHT: 0.15,
  CAP_THRESHOLD: 0.90,
  CAP_EXEMPTION: {
    requirePassAgreement: true,
    minSignalsCount: 3,
    requiredReadability: 'good'
  },
  BANDS: {
    LOW_BELOW: 0.4,
    MEDIUM_UP_TO: 0.7
  }
};

module.exports = {
  getVisionModel,
  getAnalysisModel,
  getPassesCount,
  env,
  SCORING_CONFIG,
  CONFIDENCE_CONFIG
};
