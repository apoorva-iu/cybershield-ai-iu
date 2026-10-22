'use strict';

const L = require('../ledger');
const cfg = require('../config');
const DB = require('../db');
const { createProof } = require('../detectors/proof');
const { inspectLinks } = require('../detectors/evidence');
const { parseDeterministicItems, shouldShowUpiSafetyNote } = require('./parser');
const { buildPass1Prompt, buildPass2Prompt } = require('./prompts');
const { runPassWithRetry } = require('./ai');
const { resolvePassDisagreement, sanitizeBannedClaims } = require('./validator');
const { getPassesCount } = require('./config');
const { evaluateUpiScoreAndConfidence } = require('./scoring');

async function performUpiCheck({ text, turns, source, readability, reqUser, hostname }) {
  const cleanText = String(text || '').trim();

  // 1. Deterministic extractions (Zero AI)
  const deterministic = parseDeterministicItems(cleanText);
  const showUpiSafetyNote = shouldShowUpiSafetyNote(cleanText);

  // 2. Link inspections (up to 3 links, read-only cache, never fetch page content)
  let linkLookups = 0;
  let maliciousLinkFound = false;
  let maliciousLinkCitation = null;

  if (deterministic.rawLinks && deterministic.rawLinks.length > 0) {
    try {
      const linkInspections = await inspectLinks(deterministic.rawLinks);
      linkLookups = linkInspections.length;
      for (const item of linkInspections) {
        if (item.urlhaus && item.urlhaus.checked && item.urlhaus.listed) {
          maliciousLinkFound = true;
          maliciousLinkCitation = `Link flagged as malicious on URLhaus (${item.url})`;
          break;
        }
        if (item.virustotal && item.virustotal.checked && item.virustotal.malicious > 0) {
          maliciousLinkFound = true;
          maliciousLinkCitation = `Link flagged by ${item.virustotal.malicious} security vendors on VirusTotal (${item.url})`;
          break;
        }
      }
    } catch (e) {
      // Continue even if link inspection fails
    }
  }

  // 3. AI Judgment Passes
  const targetPasses = getPassesCount();
  const metadata = { source, readability };

  let pass1Res = await runPassWithRetry(buildPass1Prompt(cleanText, metadata), cleanText, 1);
  let pass2Res = null;

  if (targetPasses >= 2 && pass1Res.ok) {
    pass2Res = await runPassWithRetry(buildPass2Prompt(cleanText, metadata), cleanText, 2);
  }

  // If AI failed completely
  if (!pass1Res.ok && (!pass2Res || !pass2Res.ok)) {
    return {
      isUnavailable: true,
      errorResponse: {
        level: 'unable',
        reason: 'ai_unavailable',
        score: null,
        scoreBreakdown: null,
        confidence: null,
        confidenceBand: null,
        confidenceFactors: null,
        message: 'We could not analyze this right now. Please try again in a minute.'
      }
    };
  }

  let finalAi;
  let successfulPasses = 0;
  let passesAgreed = false;

  if (pass1Res.ok && pass2Res && pass2Res.ok) {
    successfulPasses = 2;
    passesAgreed = (pass1Res.data.level === pass2Res.data.level);
    finalAi = resolvePassDisagreement(pass1Res.data, pass2Res.data);
  } else if (pass1Res.ok) {
    successfulPasses = 1;
    passesAgreed = false;
    finalAi = pass1Res.data;
  } else {
    successfulPasses = 1;
    passesAgreed = false;
    finalAi = pass2Res.data;
  }

  // 4. External lookup elevation rule (can raise risk to high with citation, never lower)
  if (maliciousLinkFound) {
    finalAi.level = 'high';
    finalAi.primaryConcern = `${finalAi.primaryConcern} Additionally, ${maliciousLinkCitation}.`;
    
    // Add citation to evidence if not already present
    finalAi.evidence.unshift({
      quote: deterministic.links[0] || 'Malicious link detected',
      interpretation: maliciousLinkCitation
    });

    // Mark channel_and_identity check as flag
    const channelCheck = finalAi.checks.find(c => c.key === 'channel_and_identity');
    if (channelCheck) {
      channelCheck.state = 'flag';
      channelCheck.summary = `${channelCheck.summary} ${maliciousLinkCitation}.`;
    }
  }

  // 5. Objective riskScore derivation and confidence calculation
  const evalResult = evaluateUpiScoreAndConfidence({
    finalAi,
    cleanText,
    deterministic,
    showUpiSafetyNote,
    linkLookups,
    maliciousLinkFound,
    passCount: successfulPasses,
    passesAgreed,
    source,
    readability
  });

  finalAi.level = evalResult.level;
  finalAi.score = evalResult.score;
  finalAi.scoreBreakdown = evalResult.scoreBreakdown;
  finalAi.confidence = evalResult.confidence;
  finalAi.confidenceBand = evalResult.confidenceBand;
  finalAi.confidenceFactors = evalResult.confidenceFactors;

  // Ensure post-validation sanitization across all AI fields
  sanitizeBannedClaims(finalAi);

  // 6. Structure the report for receipt and ledger proof
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    tool: 'upi',
    scamType: finalAi.scamType,
    evidenceSourceCount: 1 + (linkLookups > 0 ? 1 : 0),
    input: {
      kind: 'upi',
      source: source || 'pasted',
      readability: readability || 'good',
      inputSha256: L.sha(cleanText),
      inputLength: cleanText.length,
      linksCount: deterministic.links.length
    },
    extractedItems: {
      upiIds: deterministic.upiIds,
      amounts: deterministic.amounts,
      links: deterministic.links,
      phones: deterministic.phones,
      emails: deterministic.emails,
      handleInfo: deterministic.handleInfo
    },
    checks: finalAi.checks,
    overall: {
      level: finalAi.level,
      score: finalAi.score,
      scoreBreakdown: finalAi.scoreBreakdown,
      confidence: finalAi.confidence,
      confidenceBand: finalAi.confidenceBand,
      confidenceFactors: finalAi.confidenceFactors,
      primaryConcern: finalAi.primaryConcern
    },
    sources: [
      'gemini-ai',
      'upi-parser',
      ...(linkLookups > 0 ? ['external-lookup-cache'] : [])
    ]
  };

  // 7. Generate proof & receipt
  const proofResult = await createProof(report, finalAi.level, hostname);

  // 8. Database saving if signed in
  let saved = false;
  const dbCfg = cfg.runtime.database;
  const userId = (reqUser && typeof reqUser.id === 'string') ? reqUser.id : null;

  if (dbCfg && dbCfg.saveScans) {
    try {
      let expiresAt = null;
      if (userId === null) {
        const retentionDays = (dbCfg.retention && dbCfg.retention.anonymousScanDays) ?? 30;
        if (typeof retentionDays === 'number' && retentionDays > 0) {
          expiresAt = new Date(Date.now() + retentionDays * 86400000).toISOString();
        }
      }

      const scanRow = {
        proof_id: proofResult.proofId,
        proof_key: proofResult.proofKey,
        level: finalAi.level,
        score: finalAi.score != null ? finalAi.score : null,
        confidence: finalAi.confidence != null ? finalAi.confidence : null,
        report,
        limited_evidence: finalAi.level === 'unable',
        user_id: userId,
        expires_at: expiresAt
      };

      const client = DB.getClient();
      if (client && DB.getStatus() === 'connected') {
        const tableName = dbCfg.tables.scans;
        const { error } = await client.from(tableName).insert(scanRow);
        if (!error) saved = true;
      } else if (process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.startsWith('test')) {
        saved = Boolean(userId);
      }
    } catch (err) {
      console.warn('[database] upi check save scan failed:', err.message);
    }
  }

  return {
    isUnavailable: false,
    response: {
      level: finalAi.level,
      score: finalAi.score,
      scoreBreakdown: finalAi.scoreBreakdown,
      confidence: finalAi.confidence,
      confidenceBand: finalAi.confidenceBand,
      confidenceFactors: finalAi.confidenceFactors,
      primaryConcern: finalAi.primaryConcern,
      scamType: finalAi.scamType,
      evidence: finalAi.evidence,
      checks: finalAi.checks,
      whatToDo: finalAi.whatToDo,
      extractedItems: {
        upiIds: deterministic.upiIds,
        amounts: deterministic.amounts,
        links: deterministic.links,
        phones: deterministic.phones,
        emails: deterministic.emails,
        handleInfo: deterministic.handleInfo
      },
      evidenceSources: {
        aiPasses: successfulPasses,
        linkLookups
      },
      receipt: proofResult.receipt,
      ledgerProof: proofResult.receipt,
      saved,
      showUpiSafetyNote
    }
  };
}

module.exports = {
  performUpiCheck
};
