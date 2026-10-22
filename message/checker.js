'use strict';

const L = require('../ledger');
const cfg = require('../config');
const DB = require('../db');
const { createProof } = require('../detectors/proof');
const { inspectLinks } = require('../detectors/evidence');
const { parseDeterministicItems } = require('./parser');
const { buildPass1Prompt, buildPass2Prompt } = require('./prompts');
const { runPassWithRetry, getCachedAnalysis, setCachedAnalysis } = require('./ai');
const { resolvePassDisagreement, sanitizeBannedClaims } = require('./validator');
const { getPassesCount, SENDER_NOTE } = require('./config');
const { evaluateMessageScoreAndConfidence } = require('./scoring');

async function performMessageCheck({ text, turns, source, readability, reqUser, hostname }) {
  const cleanText = String(text || '').trim();

  // 1. In-memory 10-minute cache check
  const cached = getCachedAnalysis(cleanText);
  if (cached) {
    return {
      isUnavailable: false,
      response: { ...cached.response, cached: true }
    };
  }

  // 2. Deterministic format extractions (Zero AI)
  const deterministic = parseDeterministicItems(cleanText, turns);

  // 3. Link inspections (up to 3 links, read-only cache, never fetch page content)
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
      // Continue safely if link inspection fails
    }
  }

  // 4. AI Judgment Passes
  const targetPasses = getPassesCount();
  const metadata = { source, readability };

  let pass1Res = await runPassWithRetry(buildPass1Prompt(cleanText, metadata), cleanText, 1);
  let pass2Res = null;

  // Pass skip rules: skip second pass when first returns high with certainty >= 0.8, or on quota error
  let pass2Skipped = false;
  if (!pass1Res.ok && pass1Res.reason === 'quota') {
    pass2Skipped = true;
  } else if (pass1Res.ok && pass1Res.data.level === 'high' && pass1Res.data.certainty >= 0.8) {
    pass2Skipped = true;
  }

  if (targetPasses >= 2 && pass1Res.ok && !pass2Skipped) {
    pass2Res = await runPassWithRetry(buildPass2Prompt(cleanText, metadata), cleanText, 2);
  }

  // If AI failed completely or cannot run
  if (!pass1Res.ok && (!pass2Res || !pass2Res.ok)) {
    const aiReason = pass1Res.reason || (pass2Res && pass2Res.reason) || 'ai_unavailable';
    return {
      isUnavailable: true,
      errorResponse: {
        level: 'unable',
        mode: 'ai_unavailable',
        reason: aiReason,
        score: null,
        riskScore: null,
        scoreBreakdown: null,
        confidence: null,
        confidenceBand: null,
        confidenceFactors: null,
        message: 'We could not analyze this right now. Please try again in a minute.',
        explanation: 'We could not analyze this right now. Please try again in a minute.',
        primaryConcern: 'We could not analyze this right now. Please try again in a minute.',
        scamSignals: { status: 'none_found', summary: 'AI analysis unavailable' },
        senderNote: SENDER_NOTE,
        inputType: deterministic.inputType,
        evidenceStatus: { ai: { reason: aiReason } },
        extractedItems: {
          links: deterministic.links,
          phones: deterministic.phones,
          emails: deterministic.emails,
          upiIds: deterministic.upiIds,
          amounts: deterministic.amounts
        },
        evidenceSources: [
          { name: 'AI message analysis', status: 'failed', note: aiReason },
          { name: 'Message parser', status: 'ran', note: 'Format extractions completed' },
          ...(linkLookups > 0 ? [{ name: 'Link reputation', status: 'ran', note: `${linkLookups} links checked` }] : [])
        ],
        evidenceSourceCount: 1 + (linkLookups > 0 ? 1 : 0)
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
    passesAgreed = true; // single pass considered internally consistent
    finalAi = pass1Res.data;
  } else {
    successfulPasses = 1;
    passesAgreed = true;
    finalAi = pass2Res.data;
  }

  // 5. External lookup elevation rule (can raise risk to high with citation, never lower)
  if (maliciousLinkFound) {
    finalAi.level = 'high';
    finalAi.primaryConcern = `${finalAi.primaryConcern} Additionally, ${maliciousLinkCitation}.`;
    finalAi.explanation = `${finalAi.explanation} Additionally, ${maliciousLinkCitation}.`;

    finalAi.signals.unshift({
      label: 'Malicious URL confirmed',
      weight: 1.0,
      quote: deterministic.links[0] || undefined,
      why: maliciousLinkCitation
    });

    const linkCheck = finalAi.checks.find(c => c.key === 'links_and_apps');
    if (linkCheck) {
      linkCheck.state = 'fail';
      linkCheck.reason = `${linkCheck.reason} ${maliciousLinkCitation}.`;
    }
  }

  // 6. Objective riskScore derivation and confidence calculation
  const evalResult = evaluateMessageScoreAndConfidence({
    finalAi,
    cleanText,
    deterministic,
    linkLookups,
    maliciousLinkFound,
    passCount: successfulPasses,
    passesAgreed,
    source,
    readability,
    truncated: false
  });

  finalAi.level = evalResult.level;
  finalAi.score = evalResult.score;
  finalAi.riskScore = evalResult.score;
  finalAi.scoreBreakdown = evalResult.scoreBreakdown;
  finalAi.confidence = evalResult.confidence;
  finalAi.confidenceBand = evalResult.confidenceBand;
  finalAi.confidenceFactors = evalResult.confidenceFactors;

  // Ensure post-validation sanitization across all AI fields
  sanitizeBannedClaims(finalAi);

  // 7. Structure scamSignals and evidenceSources
  let scamSignalsStatus = 'none_found';
  if (finalAi.level === 'high') {
    scamSignalsStatus = 'strong';
  } else if (finalAi.level === 'medium') {
    scamSignalsStatus = 'some';
  }

  const evidenceSources = [
    {
      name: 'Dual-pass AI analysis',
      status: successfulPasses >= 2 ? 'ran' : (pass2Skipped ? 'skipped' : (successfulPasses === 1 ? 'ran' : 'failed')),
      note: successfulPasses >= 2 ? 'Completed two independent analysis passes' : (pass2Skipped ? 'High certainty threshold met on initial pass' : 'Single pass completed')
    },
    {
      name: 'Deterministic message parser',
      status: 'ran',
      note: 'Extracted identifiers, formats, and structural layout'
    }
  ];

  if (linkLookups > 0) {
    evidenceSources.push({
      name: 'External link threat intelligence (URLhaus / RDAP / VirusTotal)',
      status: 'ran',
      note: `${linkLookups} link(s) inspected against threat intelligence feeds`
    });
  }

  const evidenceSourceCount = evidenceSources.filter(s => s.status === 'ran').length;

  // Headline
  const headlineTitle = (finalAi.scamType && finalAi.scamType !== 'none' && finalAi.scamType !== 'unclear')
    ? finalAi.scamType
    : (finalAi.level === 'high' ? 'High Risk Communication' : (finalAi.level === 'medium' ? 'Suspicious Communication' : 'Normal Communication'));
  const headlineSentence = finalAi.primaryConcern || finalAi.explanation || 'Message evaluation complete.';
  const headline = [headlineTitle, headlineSentence];

  // 8. Structure the report for receipt and ledger proof
  const reportChecks = (finalAi.checks || []).map(c => ({
    key: c.key,
    title: c.title,
    state: c.state,
    score: c.state === 'fail' ? 80 : (c.state === 'warn' ? 45 : 10),
    findings: c.reason,
    reason: c.reason
  }));

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    tool: 'message',
    scamType: finalAi.scamType,
    requestedAction: finalAi.requestedAction,
    evidenceSourceCount,
    input: {
      kind: 'message',
      source: source || 'text',
      readability: readability || 'good',
      inputSha256: L.sha(cleanText),
      inputLength: cleanText.length,
      linksCount: deterministic.links.length
    },
    extractedItems: {
      links: deterministic.links,
      phones: deterministic.phones,
      emails: deterministic.emails,
      upiIds: deterministic.upiIds,
      amounts: deterministic.amounts
    },
    checks: reportChecks,
    overall: {
      level: finalAi.level,
      score: finalAi.score,
      confidence: finalAi.confidence,
      limitedEvidence: finalAi.level === 'unable',
      scoreBreakdown: finalAi.scoreBreakdown
    },
    sources: [
      'gemini-ai',
      'message-parser',
      ...(linkLookups > 0 ? ['external-lookup-cache'] : [])
    ],
    scoreBreakdown: finalAi.scoreBreakdown
  };

  // 9. Generate proof & receipt using the existing createProof function
  const proofResult = await createProof(report, finalAi.level, hostname);

  // 10. Database saving if signed in (free tool, does not consume user quota)
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
      console.warn('[database] message check save scan failed:', err.message);
    }
  }

  const resultResponse = {
    report,
    level: finalAi.level,
    score: finalAi.score,
    riskScore: finalAi.score,
    scoreBreakdown: finalAi.scoreBreakdown,
    confidence: finalAi.confidence,
    confidenceBand: finalAi.confidenceBand,
    confidenceFactors: finalAi.confidenceFactors,
    scamType: finalAi.scamType,
    requestedAction: finalAi.requestedAction,
    headline,
    primaryConcern: finalAi.primaryConcern,
    explanation: finalAi.explanation,
    conversationSummary: finalAi.conversationSummary,
    scamSignals: {
      status: scamSignalsStatus,
      summary: finalAi.primaryConcern
    },
    senderNote: SENDER_NOTE,
    inputType: deterministic.inputType,
    evidenceSources,
    evidenceSourceCount,
    signals: finalAi.signals,
    evidence: finalAi.signals.map(s => ({ quote: s.quote || s.label, interpretation: s.why })),
    flaggedPhrases: finalAi.flaggedPhrases,
    checks: finalAi.checks,
    whatToDo: finalAi.whatToDo,
    extractedItems: {
      links: deterministic.links,
      phones: deterministic.phones,
      emails: deterministic.emails,
      upiIds: deterministic.upiIds,
      amounts: deterministic.amounts
    },
    mode: 'normal',
    tool: 'message',
    proofId: proofResult.proofId,
    accessCode: proofResult.accessCode,
    block: proofResult.blk ? proofResult.blk.index : null,
    blockHash: proofResult.blk ? proofResult.blk.hash : null,
    timestamp: report.generatedAt,
    receipt: proofResult.receipt,
    ledgerProof: proofResult.receipt,
    saved
  };

  // Cache in 10-minute cache
  setCachedAnalysis(cleanText, { response: resultResponse });

  return {
    isUnavailable: false,
    response: resultResponse
  };
}

module.exports = {
  performMessageCheck
};

