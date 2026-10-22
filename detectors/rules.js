'use strict';
const upiConfig = require('../config/upi-rules.json');
const messageConfig = require('../config/message-rules.json');

// Normalizes text for OCR noise, spaces and substitutions
function normalizeForMatching(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero width characters
    .replace(/[|_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function evaluateRules(text, kind = 'message') {
  const norm = normalizeForMatching(text);
  const cfg = kind === 'upi' ? upiConfig : messageConfig;
  const rules = cfg.rules || [];
  const benignRules = cfg.benignRules || [];

  const matchedRules = [];
  const findings = [];
  let maxScore = 0;
  let totalScore = 0;

  for (const rule of rules) {
    let matched = false;
    let matchedSnippet = null;

    for (const pat of rule.patterns || []) {
      try {
        const regex = new RegExp(pat, 'i');
        const m = norm.match(regex);
        if (m) {
          matched = true;
          matchedSnippet = m[0];
          break;
        }
      } catch (e) {
        // regex error
      }
    }

    if (matched) {
      matchedRules.push({
        id: rule.id,
        severity: rule.severity,
        score: rule.score || 70,
        reason: rule.reason,
        snippet: matchedSnippet
      });
      findings.push({
        severity: rule.severity === 'high' ? 'warn' : 'info',
        text: `${rule.reason}${matchedSnippet ? ` (matched: "${matchedSnippet.slice(0, 50)}")` : ''}`
      });
      maxScore = Math.max(maxScore, rule.score || 70);
      totalScore += (rule.score || 70) * 0.4;
    }
  }

  // Combined preliminary score
  let score = matchedRules.length > 0 ? Math.min(100, Math.round(maxScore + totalScore * 0.2)) : 0;

  // Evaluate benign rules that reduce score
  const benignMatches = [];
  for (const brule of benignRules) {
    let bmatched = false;
    for (const pat of brule.patterns || []) {
      try {
        const regex = new RegExp(pat, 'i');
        if (regex.test(norm)) {
          bmatched = true;
          break;
        }
      } catch (e) {
        // regex error
      }
    }
    if (bmatched) {
      benignMatches.push(brule);
      findings.push({
        severity: 'info',
        text: `Benign pattern recognized: ${brule.reason}`
      });
      score = Math.max(0, score - (brule.reduction || 30));
    }
  }

  // Mandatory warning for UPI
  if (kind === 'upi') {
    findings.push({
      severity: 'info',
      text: upiConfig.warningNote || 'A UPI PIN is only needed to send money, never to receive it.'
    });
  }

  let level = 'low';
  if (score >= 70) level = 'high';
  else if (score >= 40) level = 'medium';
  else level = 'low';

  return {
    matchedRules,
    benignMatches,
    score,
    level,
    findings
  };
}

module.exports = {
  evaluateRules,
  normalizeForMatching
};

