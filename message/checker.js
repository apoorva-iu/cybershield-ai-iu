'use strict';

const L = require('../ledger');
const cfg = require('../config');
const DB = require('../db');
const { createProof, prepareProof, commitProof, saveScanRow, extractErrorCode } = require('../detectors/proof');
const { inspectLinks } = require('../detectors/evidence');
const { parseDeterministicItems } = require('./parser');
const { buildPass1Prompt, buildPass2Prompt } = require('./prompts');
const { runPassWithRetry, getCachedAnalysis, setCachedAnalysis } = require('./ai');
const { resolvePassDisagreement, sanitizeBannedClaims } = require('./validator');
const { getPassesCount, SENDER_NOTE } = require('./config');
const { evaluateMessageScoreAndConfidence } = require('./scoring');
const { generateSpecificAnalysisText, dedupeAdviceList } = require('../detectors/analysis-text');

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

  let scamTypeLabel = finalAi.scamType;
  if (scamTypeLabel === 'Other scam' || scamTypeLabel === 'other' || scamTypeLabel === 'other_scam') {
    const rawLower = cleanText.toLowerCase();
    if (finalAi.requestedAction === 'move to another chat app' || rawLower.includes('whatsapp') || rawLower.includes('telegram')) {
      scamTypeLabel = 'Suspicious Off-Platform Redirect';
    } else if (finalAi.requestedAction === 'click a link' || rawLower.includes('http') || rawLower.includes('link')) {
      scamTypeLabel = 'Suspicious Link Solicitation';
    } else {
      scamTypeLabel = 'Unverified Outreach Scam';
    }
  }

  // Headline
  const headlineTitle = (scamTypeLabel && scamTypeLabel !== 'none' && scamTypeLabel !== 'unclear')
    ? scamTypeLabel
    : (finalAi.level === 'high' ? 'High Risk Communication' : (finalAi.level === 'medium' ? 'Suspicious Communication' : 'Normal Communication'));
  const headlineSentence = finalAi.primaryConcern || finalAi.explanation || 'Message evaluation complete.';
  const headline = [headlineTitle, headlineSentence];

function buildMessageCheckFindings(c, cleanText, finalAi, { maliciousLinkFound = false } = {}) {
  const existing = Array.isArray(c.findings) ? c.findings : [];
  const findings = [];
  const seenTexts = new Set();

  function addFinding(text, evidence, severity, source = null) {
    if (!text || typeof text !== 'string') return;
    const cleanT = text.trim();
    if (!cleanT || seenTexts.has(cleanT.toLowerCase())) return;

    let validEvidence = null;
    let validSource = source;
    if (evidence && typeof evidence === 'string') {
      const trimmedEv = evidence.trim();
      if (/^(RDAP|VirusTotal|URLhaus|Google Places|Wikidata|Lookup)/i.test(trimmedEv)) {
        validEvidence = trimmedEv;
        validSource = validSource || trimmedEv;
      } else if (cleanText && cleanText.includes(trimmedEv)) {
        validEvidence = trimmedEv;
      }
    }

    if (evidence && !validEvidence) {
      return;
    }

    const sev = String(severity || '').toLowerCase();
    const normalizedSev = (sev === 'fail' || sev === 'flag' || sev === 'bad')
      ? 'flag'
      : (sev === 'warn' || sev === 'warning' || sev === 'caution')
      ? 'caution'
      : 'pass';

    seenTexts.add(cleanT.toLowerCase());
    findings.push({
      text: cleanT,
      evidence: validEvidence,
      source: validSource,
      severity: normalizedSev
    });
  }

  for (const f of existing) {
    addFinding(f.text, f.evidence, f.severity, f.source);
    if (findings.length >= 4) break;
  }

  const signals = Array.isArray(finalAi?.signals) ? finalAi.signals : [];
  const phrases = Array.isArray(finalAi?.flaggedPhrases) ? finalAi.flaggedPhrases : [];

  if (c.key === 'links_and_apps') {
    if (maliciousLinkFound) {
      addFinding('Link or domain flagged as malicious or suspicious by threat intelligence.', 'VirusTotal', 'flag', 'VirusTotal');
    }
    for (const s of signals) {
      if (findings.length >= 4) break;
      if (/(link|url|http|t\.me|telegram|whatsapp|apk|app|download|install)/i.test(s.label + ' ' + s.why + ' ' + (s.quote || ''))) {
        addFinding(s.why || s.label, s.quote, s.weight >= 0.7 ? 'flag' : 'caution');
      }
    }
  } else if (c.key === 'request_or_demand') {
    for (const s of signals) {
      if (findings.length >= 4) break;
      if (/(pay|fee|deposit|money|upi|transfer|fund|task|registration|account|bank|card|recharge|crypto)/i.test(s.label + ' ' + s.why + ' ' + (s.quote || ''))) {
        addFinding(s.why || s.label, s.quote, s.weight >= 0.7 ? 'flag' : 'caution');
      }
    }
  } else if (c.key === 'urgency_and_pressure') {
    for (const s of signals) {
      if (findings.length >= 4) break;
      if (/(urgent|hurry|today|now|expire|immediate|quick|deadline|warning|suspended|limited)/i.test(s.label + ' ' + s.why + ' ' + (s.quote || ''))) {
        addFinding(s.why || s.label, s.quote, s.weight >= 0.7 ? 'flag' : 'caution');
      }
    }
  } else if (c.key === 'message_wording') {
    for (const s of signals) {
      if (findings.length >= 4) break;
      if (/(salary|income|daily|earn|part-time|full-time|offer|hiring|greeting|template|grammar|congratulations)/i.test(s.label + ' ' + s.why + ' ' + (s.quote || ''))) {
        addFinding(s.why || s.label, s.quote, s.weight >= 0.7 ? 'flag' : 'caution');
      }
    }
  } else if (c.key === 'sender_details') {
    for (const s of signals) {
      if (findings.length >= 4) break;
      if (/(phone|number|country code|recruiter|hr|manager|identity|unknown|unverified)/i.test(s.label + ' ' + s.why + ' ' + (s.quote || ''))) {
        addFinding(s.why || s.label, s.quote, s.weight >= 0.7 ? 'flag' : 'caution');
      }
    }
  } else if (c.key === 'conversation_pattern') {
    for (const s of signals) {
      if (findings.length >= 4) break;
      if (/(redirect|off-platform|chat|telegram|whatsapp|group|contact manager|task scam)/i.test(s.label + ' ' + s.why + ' ' + (s.quote || ''))) {
        addFinding(s.why || s.label, s.quote, s.weight >= 0.7 ? 'flag' : 'caution');
      }
    }
  }

  for (const p of phrases) {
    if (findings.length >= 4) break;
    const phraseText = p.text || '';
    if (phraseText && cleanText.includes(phraseText)) {
      if (c.key === 'links_and_apps' && /(http|t\.me|telegram|whatsapp|apk|app)/i.test(phraseText + ' ' + p.reason)) {
        addFinding(p.reason || 'Flagged link or application directive', phraseText, p.severity === 'high' ? 'flag' : 'caution');
      } else if (c.key === 'request_or_demand' && /(pay|fee|deposit|money|upi|task|transfer|recharge)/i.test(phraseText + ' ' + p.reason)) {
        addFinding(p.reason || 'Flagged financial request', phraseText, p.severity === 'high' ? 'flag' : 'caution');
      } else if (c.key === 'urgency_and_pressure' && /(urgent|hurry|today|now|immediately)/i.test(phraseText + ' ' + p.reason)) {
        addFinding(p.reason || 'Urgent pressure indicator', phraseText, p.severity === 'high' ? 'flag' : 'caution');
      }
    }
  }

  if (findings.length === 0) {
    const sev = c.state === 'fail' ? 'flag' : (c.state === 'warn' ? 'caution' : 'pass');
    const quote = (c.quote && cleanText.includes(c.quote)) ? c.quote : null;
    addFinding(c.reason || 'Check evaluated based on submitted text.', quote, sev);
  }

  return findings;
}

  // 8. Structure the report for receipt and ledger proof
  const reportChecks = (finalAi.checks || []).map(c => {
    const checkFindings = buildMessageCheckFindings(c, cleanText, finalAi, { maliciousLinkFound });
    return {
      key: c.key,
      title: c.title,
      state: c.state,
      score: c.state === 'fail' ? 80 : (c.state === 'warn' ? 45 : 10),
      findings: checkFindings,
      summary: c.reason,
      reason: c.reason
    };
  });

  const dynamicAnalysis = generateSpecificAnalysisText({
    tool: 'message',
    level: finalAi.level,
    text: cleanText,
    signals: finalAi.signals,
    scamType: finalAi.scamType,
    checks: reportChecks,
    evidenceSources: { confirmedMaliciousLink: maliciousLinkFound }
  });

  const finalWhatToDo = dedupeAdviceList([
    ...(Array.isArray(finalAi.whatToDo) ? finalAi.whatToDo : []),
    ...(dynamicAnalysis.whatToDo || [])
  ]);

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    tool: 'message',
    scamType: finalAi.scamType || null,
    headline: headline || null,
    primaryConcern: finalAi.primaryConcern || null,
    whatToDo: finalWhatToDo,
    evidence: finalAi.evidence || [],
    ...(finalAi.flaggedPhrases ? { flaggedPhrases: finalAi.flaggedPhrases } : {}),
    evidenceSources: evidenceSources || {},
    evidenceSourceCount: evidenceSourceCount || 1,
    confidenceBand: finalAi.confidenceBand || null,
    confidenceFactors: finalAi.confidenceFactors || [],
    requestedAction: finalAi.requestedAction || null,
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
      primaryConcern: finalAi.primaryConcern,
      scoreBreakdown: finalAi.scoreBreakdown
    },
    sources: [
      'gemini-ai',
      'message-parser',
      ...(linkLookups > 0 ? ['external-lookup-cache'] : [])
    ],
    scoreBreakdown: finalAi.scoreBreakdown
  };

  // 9. Prepare proof
  const prepared = prepareProof(report, finalAi.level);

  // 10. Database saving first (before ledger append)
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
        proof_id: prepared.proofId,
        proof_key: prepared.proofKey,
        level: finalAi.level === 'unable' ? 'unknown' : finalAi.level,
        score: finalAi.score != null ? finalAi.score : null,
        confidence: typeof finalAi.confidence === 'number'
          ? (finalAi.confidence <= 1 ? Math.round(finalAi.confidence * 100) : Math.round(finalAi.confidence))
          : null,
        report,
        limited_evidence: finalAi.level === 'unable',
        user_id: userId,
        expires_at: expiresAt
      };

      saved = await saveScanRow(scanRow);
    } catch (err) {
      console.warn('[database] scan insert failed: ' + extractErrorCode(err));
    }
  }

  // 11. Commit proof & ledger append
  const proofResult = await commitProof(prepared, hostname);

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
    checks: reportChecks,
    whatToDo: finalWhatToDo,
    extractedItems: {
      links: deterministic.links,
      phones: deterministic.phones,
      emails: deterministic.emails,
      upiIds: deterministic.upiIds,
      amounts: deterministic.amounts
    },
    mode: 'normal',
    tool: 'message',
    proofId: prepared.proofId,
    accessCode: prepared.accessCode,
    block: proofResult.blk ? proofResult.blk.index : null,
    blockHash: proofResult.blk ? proofResult.blk.hash : null,
    prevHash: proofResult.blk ? proofResult.blk.prevHash : null,
    reportHash: proofResult.reportHash || (proofResult.blk ? proofResult.blk.reportHash : null),
    timestamp: report.generatedAt,
    receipt: proofResult.receipt,
    ledgerProof: proofResult.receipt,
    saved,
    proofSaved: proofResult.proofSaved,
    proofStatus: proofResult.proofStatus,
    proofPending: !proofResult.proofSaved,
    ...(!proofResult.proofSaved && proofResult.proofReason ? { proofReason: proofResult.proofReason, reason: proofResult.proofReason } : {})
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

