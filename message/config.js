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
  const envPasses = parseInt(env('MESSAGE_PASSES'), 10);
  if (!isNaN(envPasses) && envPasses >= 1) return envPasses;
  const cfgPasses = cfg.runtime.message && cfg.runtime.message.passes;
  if (typeof cfgPasses === 'number' && cfgPasses >= 1) return cfgPasses;
  return 2;
}

const SCAM_TYPES = [
  'Fake KYC or account block',
  'Prize or lottery',
  'Task or part-time job scam',
  'Investment or trading tip',
  'Fake officer or arrest threat',
  'Fake delivery or bill notice',
  'OTP or credential theft',
  'Loan or credit offer scam',
  'Advance or registration fee',
  'Money request from a known contact',
  'Fake customer care',
  'Link or app install lure',
  'Other scam',
  'none',
  'unclear'
];

const REQUESTED_ACTIONS = [
  'pay money',
  'share OTP or PIN or password',
  'click a link',
  'install an app',
  'share documents or details',
  'call a number',
  'move to another chat app',
  'deposit to unlock earnings',
  'none'
];

const INPUT_TYPES = [
  'chat',
  'single_message',
  'email',
  'forwarded',
  'other'
];

const CHECK_KEYS = [
  'message_wording',
  'request_or_demand',
  'links_and_apps',
  'sender_details',
  'urgency_and_pressure',
  'conversation_pattern'
];

const CHECK_TITLES = {
  message_wording: 'Message wording',
  request_or_demand: 'Request or demand',
  links_and_apps: 'Links and apps',
  sender_details: 'Sender details',
  urgency_and_pressure: 'Urgency and pressure',
  conversation_pattern: 'Conversation pattern'
};

const SENDER_NOTE = 'We cannot tell who really sent this message or whether a number belongs to who it claims. Confirm through the organisation\'s official app or website.';

const MANDATORY_WHAT_TO_DO = 'Do not click links, install apps or share OTPs, PINs or documents; confirm through the organisation\'s official app or website, not through this message.';

const CYBERCRIME_ADVICE = 'Report cyber fraud immediately at cybercrime.gov.in or call national helpline 1930.';

const BANNED_CLAIMS_REGEX = /\b(fabricated|fake|forged|edited|genuine)\b/i;
const SAFE_NEUTRAL_STRING = 'Details cannot be verified from a message';

/**
 * ============================================================================
 * MESSAGE RISK SCORING & CONFIDENCE SPECIFICATION AND FORMULA DOCUMENTATION
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
 * Diminishing returns within the same family are applied:
 *    idx = 0 (1st signal in family): 1.0 (100% impact)
 *    idx = 1 (2nd signal in family): 0.4  (40% impact)
 *    idx >= 2 (3rd+ in family):      0.2  (20% impact)
 *
 * Obvious Scam Score Target:
 *    Typical obvious communication scams naturally sum to between 80 and 97.
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
 *       - Truncated text:       -0.05 penalty
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
  OBVIOUS_SCAM_MAX_WITHOUT_100: 97,
  CONDITIONS_FOR_100: {
    minIndependentSignals: 5,
    requireFlaggedLink: true,
    requirePassAgreement: true
  },
  FAMILIES: [
    'wording_and_tone',
    'request_mechanics',
    'links_and_attachments',
    'sender_and_channel',
    'pressure_and_coercion',
    'interaction_pattern',
    'threat_intelligence'
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
  SCAM_TYPES,
  REQUESTED_ACTIONS,
  INPUT_TYPES,
  CHECK_KEYS,
  CHECK_TITLES,
  SENDER_NOTE,
  MANDATORY_WHAT_TO_DO,
  CYBERCRIME_ADVICE,
  BANNED_CLAIMS_REGEX,
  SAFE_NEUTRAL_STRING,
  SCORING_CONFIG,
  CONFIDENCE_CONFIG
};

