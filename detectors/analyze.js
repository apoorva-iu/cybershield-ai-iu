'use strict';
const cfg = require('../config');
const L = require('../ledger');
const DB = require('../db');
const { createProof } = require('./proof');
const { evaluateRules } = require('./rules');
const { extractLinks, inspectLinks, extractEmails, extractPhoneNumbers, extractUpiIds, extractAmounts } = require('./evidence');
const { analyzeTextWithGemini } = require('./gemini');

const upiConfig = require('../config/upi-rules.json');

function detectKind(text) {
  const t = text.trim();
  // If mostly a UPI ID
  const upiIdRe = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
  if (upiIdRe.test(t)) return 'upi';

  // If clearly about UPI
  const upiKeywordsRe = /\b(upi|bhim|gpay|google\s*pay|phonepe|paytm|vpa|collect\s*request|request\s*money|upi\s*pin|scan\s*qr|cashback|scratch\s*card)\b/i;
  if (upiKeywordsRe.test(t)) return 'upi';

  return 'message';
}

function detectJobOffer(text) {
  const roleRe = /\b(role|position|vacancy|hiring|job|opening|fresher|internship|software\s*engineer|data\s*entry|developer|manager|executive|sales|associate)\b/i;
  const salaryRe = /\b(salary|lpa|ctc|per\s*month|\b\d+k\s*\/\s*month|inr\s*\d+|\b\d+\s*lpa|stipend)\b/i;
  const companyRe = /\b(company|technologies|pvt\s*ltd|ltd|inc|corp|solutions|services|enterprises|organization)\b/i;
  const actionRe = /\b(apply|interview|resume|cv|application|registration\s*fee|training\s*fee|apply\s*here)\b/i;

  let hits = 0;
  if (roleRe.test(text)) hits++;
  if (salaryRe.test(text)) hits++;
  if (companyRe.test(text)) hits++;
  if (actionRe.test(text)) hits++;

  return hits >= 3 ? 'job' : null;
}

function getWhatToDo(kind) {
  const common = [
    'Do not click unknown links or share OTP, passwords, or UPI PIN.',
    'Report cyber fraud immediately at cybercrime.gov.in.',
    'Call 1930 quickly if money was sent or compromised.'
  ];

  if (kind === 'upi') {
    return [
      'A UPI PIN is only needed to send money, never to receive it.',
      'Decline unknown collect requests or payment approvals.',
      ...common
    ];
  }

  return [
    'Verify official notices directly on the organization\'s official portal.',
    'Never download remote-access apps (.apk, AnyDesk, TeamViewer) from chat links.',
    ...common
  ];
}

function buildChecks(kind, {
  text,
  ruleResult,
  techFindings,
  techScore,
  linkInspections,
  extractedLinks,
  emails,
  phoneNumbers,
  upiIds,
  amounts,
  aiResult,
  aiScore,
  scamType
}) {
  const matchedRules = (ruleResult && ruleResult.matchedRules) || [];
  const benignMatches = (ruleResult && ruleResult.benignMatches) || [];
  const matchedRuleIds = matchedRules.map(r => r.id);

  if (kind === 'upi') {
    // 1. Request pattern
    const reqScam = matchedRules.find(r => [
      'upi_collect_request_prompt',
      'upi_sent_by_mistake',
      'upi_fake_screenshot_claim'
    ].includes(r.id));
    const reqBenign = benignMatches.find(b => [
      'upi_benign_paid_thanks',
      'upi_benign_plain_sms_notification',
      'upi_benign_split_reminder',
      'upi_benign_no_action_refund'
    ].includes(b.id));

    let check1;
    if (reqScam) {
      check1 = {
        key: 'request_pattern',
        title: 'Request pattern',
        state: 'danger',
        score: reqScam.score || 80,
        findings: [{ severity: 'warn', text: reqScam.reason }]
      };
    } else if (reqBenign) {
      check1 = {
        key: 'request_pattern',
        title: 'Request pattern',
        state: 'ok',
        score: 0,
        findings: [{ severity: 'info', text: reqBenign.reason }]
      };
    } else if (/\b(collect|request|refund|cashback|transfer|paid|receive|send|credit|debit|bill|share|gpay|phonepe|paytm)\b/i.test(text)) {
      check1 = {
        key: 'request_pattern',
        title: 'Request pattern',
        state: 'ok',
        score: 0,
        findings: [{ severity: 'info', text: 'Standard payment transfer reference with no deceptive request patterns identified.' }]
      };
    } else {
      check1 = {
        key: 'request_pattern',
        title: 'Request pattern',
        state: 'not_applicable',
        score: null,
        findings: [{ severity: 'info', text: 'No collect request, refund claim, or payment transfer pattern detected in text.' }]
      };
    }

    // 2. Payment instructions
    const pinScam = matchedRules.find(r => ['upi_enter_pin_to_receive', 'upi_scan_qr_to_receive'].includes(r.id));
    const hasPinRef = /\b(pin|password|qr|approve|authorize|scan)\b/i.test(text);
    let check2;
    if (pinScam) {
      check2 = {
        key: 'payment_instructions',
        title: 'Payment instructions',
        state: 'danger',
        score: pinScam.score || 90,
        findings: [
          { severity: 'warn', text: pinScam.reason },
          { severity: 'info', text: 'A UPI PIN is only needed to send money, never to receive it.' }
        ]
      };
    } else if (hasPinRef) {
      check2 = {
        key: 'payment_instructions',
        title: 'Payment instructions',
        state: 'ok',
        score: 0,
        findings: [
          { severity: 'info', text: 'Standard payment instructions.' },
          { severity: 'info', text: 'A UPI PIN is only needed to send money, never to receive it.' }
        ]
      };
    } else {
      check2 = {
        key: 'payment_instructions',
        title: 'Payment instructions',
        state: 'not_applicable',
        score: null,
        findings: [
          { severity: 'info', text: 'No payment instructions or PIN requests found in text.' },
          { severity: 'info', text: 'A UPI PIN is only needed to send money, never to receive it.' }
        ]
      };
    }

    // 3. UPI ID and handle
    let check3;
    if (upiIds.length === 0) {
      check3 = {
        key: 'upi_handle',
        title: 'UPI ID and handle',
        state: 'not_applicable',
        score: null,
        findings: [{ severity: 'info', text: 'No UPI ID or VPA handle found in the input.' }]
      };
    } else {
      check3 = {
        key: 'upi_handle',
        title: 'UPI ID and handle',
        state: 'ok',
        score: 0,
        findings: upiIds.map(u => ({
          severity: 'info',
          text: `UPI ID format recognized (${u.upiId}). Note: A UPI handle does not verify recipient identity or ownership.`
        }))
      };
    }

    // 4. Links and QR
    const hasLinksOrQr = extractedLinks.length > 0 || /\b(qr|barcode|scan)\b/i.test(text);
    let check4;
    if (!hasLinksOrQr) {
      check4 = {
        key: 'links_qr',
        title: 'Links and QR',
        state: 'not_applicable',
        score: null,
        findings: [{ severity: 'info', text: 'No external links or QR code references found in text.' }]
      };
    } else {
      const linkFindingItems = techFindings.filter(f => f.text.toLowerCase().includes('url') || f.text.toLowerCase().includes('domain') || f.text.toLowerCase().includes('link'));
      const qrScam = matchedRules.find(r => ['upi_cashback_reward_link', 'upi_scan_qr_to_receive'].includes(r.id));
      if (techScore >= 70 || qrScam) {
        check4 = {
          key: 'links_qr',
          title: 'Links and QR',
          state: 'danger',
          score: Math.max(techScore, qrScam ? qrScam.score : 80),
          findings: qrScam ? [{ severity: 'warn', text: qrScam.reason }, ...linkFindingItems] : linkFindingItems
        };
      } else if (techScore >= 40) {
        check4 = {
          key: 'links_qr',
          title: 'Links and QR',
          state: 'warn',
          score: techScore,
          findings: linkFindingItems
        };
      } else {
        check4 = {
          key: 'links_qr',
          title: 'Links and QR',
          state: 'ok',
          score: 0,
          findings: linkFindingItems.length > 0 ? linkFindingItems : [{ severity: 'info', text: 'Links and QR references examined with no active security flags reported.' }]
        };
      }
    }

    // 5. Urgency and pressure
    const urgScam = matchedRules.find(r => ['upi_urgent_pressure', 'upi_kyc_threat', 'upi_round_amounts_urgency'].includes(r.id));
    const hasUrgKeywords = /(?:within\s+\d+\s*(?:min|hour)|urgent|immediately|turant|jaldi|blocked|suspended|freeze|police|penalty)/i.test(text);
    let check5;
    if (urgScam) {
      check5 = {
        key: 'urgency_pressure',
        title: 'Urgency and pressure',
        state: 'danger',
        score: urgScam.score || 70,
        findings: [{ severity: 'warn', text: urgScam.reason }]
      };
    } else if (hasUrgKeywords) {
      check5 = {
        key: 'urgency_pressure',
        title: 'Urgency and pressure',
        state: 'warn',
        score: 55,
        findings: [{ severity: 'warn', text: 'Time pressure or urgent demand phrasing detected in message.' }]
      };
    } else {
      check5 = {
        key: 'urgency_pressure',
        title: 'Urgency and pressure',
        state: 'not_applicable',
        score: null,
        findings: [{ severity: 'info', text: 'No artificial urgency, countdown deadlines, or account threats detected.' }]
      };
    }

    return [check1, check2, check3, check4, check5];
  }

  // kind === 'message'
  // 1. Message wording
  const wordingScam = matchedRules.find(r => [
    'msg_otp_credential_request',
    'msg_task_job_scam',
    'msg_remote_access_apps',
    'msg_lottery_prizes',
    'msg_digital_arrest_officer_threat',
    'msg_investment_crypto_tips'
  ].includes(r.id));
  const wordingBenign = benignMatches.find(b => [
    'msg_benign_casual_chat',
    'msg_benign_delivery_notice',
    'msg_benign_transactional_otp'
  ].includes(b.id));

  let check1;
  if (wordingScam) {
    check1 = {
      key: 'message_wording',
      title: 'Message wording',
      state: 'danger',
      score: wordingScam.score || 85,
      findings: [{ severity: 'warn', text: wordingScam.reason }]
    };
  } else if (wordingBenign) {
    check1 = {
      key: 'message_wording',
      title: 'Message wording',
      state: 'ok',
      score: 0,
      findings: [{ severity: 'info', text: wordingBenign.reason }]
    };
  } else if (aiScore >= 70 && aiResult && aiResult.data && aiResult.data.reasoning) {
    check1 = {
      key: 'message_wording',
      title: 'Message wording',
      state: 'danger',
      score: aiScore,
      findings: [{ severity: 'warn', text: `AI reading: ${aiResult.data.reasoning}` }]
    };
  } else {
    check1 = {
      key: 'message_wording',
      title: 'Message wording',
      state: 'ok',
      score: 0,
      findings: [{ severity: 'info', text: 'Message wording is conversational with no deceptive hooks detected.' }]
    };
  }

  // 2. Links
  let check2;
  if (extractedLinks.length === 0) {
    check2 = {
      key: 'links',
      title: 'Links',
      state: 'not_applicable',
      score: null,
      findings: [{ severity: 'info', text: 'No external links or URLs found in text.' }]
    };
  } else {
    const linkFindingItems = techFindings.filter(f => f.text.toLowerCase().includes('url') || f.text.toLowerCase().includes('domain') || f.text.toLowerCase().includes('link'));
    if (techScore >= 70 || matchedRuleIds.includes('msg_suspicious_links_apk')) {
      check2 = {
        key: 'links',
        title: 'Links',
        state: 'danger',
        score: techScore || 85,
        findings: linkFindingItems.length > 0 ? linkFindingItems : [{ severity: 'warn', text: 'Malicious, lookalike, or APK download link detected.' }]
      };
    } else if (techScore >= 40) {
      check2 = {
        key: 'links',
        title: 'Links',
        state: 'warn',
        score: techScore,
        findings: linkFindingItems
      };
    } else {
      check2 = {
        key: 'links',
        title: 'Links',
        state: 'ok',
        score: 0,
        findings: linkFindingItems.length > 0 ? linkFindingItems : [{ severity: 'info', text: 'External links checked against threat databases with no malicious flags.' }]
      };
    }
  }

  // 3. Sender details (phones and emails)
  let check3;
  if (phoneNumbers.length === 0 && emails.length === 0) {
    check3 = {
      key: 'sender_details',
      title: 'Sender details (phones and emails)',
      state: 'not_applicable',
      score: null,
      findings: [{ severity: 'info', text: 'No sender phone numbers or email addresses found in text.' }]
    };
  } else {
    const contactFindings = techFindings.filter(f => f.text.toLowerCase().includes('email') || f.text.toLowerCase().includes('contact') || f.text.toLowerCase().includes('number'));
    const careScam = matchedRules.find(r => r.id === 'msg_suspicious_customer_care');
    const hasDisposable = emails.some(e => e.isDisposable);
    if (careScam || hasDisposable) {
      check3 = {
        key: 'sender_details',
        title: 'Sender details (phones and emails)',
        state: 'warn',
        score: 65,
        findings: careScam ? [{ severity: 'warn', text: careScam.reason }, ...contactFindings] : contactFindings
      };
    } else {
      check3 = {
        key: 'sender_details',
        title: 'Sender details (phones and emails)',
        state: 'ok',
        score: 0,
        findings: contactFindings.length > 0 ? contactFindings : [{ severity: 'info', text: 'Contact numbers and email domains formatted as expected.' }]
      };
    }
  }

  // 4. Urgency and pressure
  const urgMsgScam = matchedRules.find(r => ['msg_fake_utility_courier_notice', 'msg_kyc_pan_blocked', 'msg_digital_arrest_officer_threat'].includes(r.id));
  const hasMsgUrg = /(?:tonight|within\s+\d+|immediately|urgently|turant|jaldi|disconnected|cut\s+off|shutdown|arrest|blocked|suspended|deactivated)/i.test(text);
  let check4;
  if (urgMsgScam) {
    check4 = {
      key: 'urgency_pressure',
      title: 'Urgency and pressure',
      state: 'danger',
      score: 80,
      findings: [{ severity: 'warn', text: urgMsgScam.reason }]
    };
  } else if (hasMsgUrg) {
    check4 = {
      key: 'urgency_pressure',
      title: 'Urgency and pressure',
      state: 'warn',
      score: 60,
      findings: [{ severity: 'warn', text: 'Urgency cues or impending deadline pressure detected.' }]
    };
  } else {
    check4 = {
      key: 'urgency_pressure',
      title: 'Urgency and pressure',
      state: 'not_applicable',
      score: null,
      findings: [{ severity: 'info', text: 'No artificial urgency, time pressure, or account threats detected.' }]
    };
  }

  // 5. Known scam pattern
  let check5;
  if (matchedRules.length > 0) {
    check5 = {
      key: 'known_scam_pattern',
      title: 'Known scam pattern',
      state: 'danger',
      score: 90,
      findings: matchedRules.map(r => ({ severity: 'warn', text: r.reason }))
    };
  } else if (aiScore >= 70 && scamType !== 'none') {
    check5 = {
      key: 'known_scam_pattern',
      title: 'Known scam pattern',
      state: 'danger',
      score: aiScore,
      findings: [{ severity: 'warn', text: `AI identified fraud pattern: ${scamType}` }]
    };
  } else {
    check5 = {
      key: 'known_scam_pattern',
      title: 'Known scam pattern',
      state: 'not_applicable',
      score: null,
      findings: [{ severity: 'info', text: 'No known cyber fraud or scam signatures identified in text.' }]
    };
  }

  return [check1, check2, check3, check4, check5];
}

async function handleAnalyze(req, res) {
  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const allowedKeys = ['input', 'kind'];
  for (const k of Object.keys(req.body)) {
    if (!allowedKeys.includes(k)) {
      return res.status(400).json({ error: 'Unknown field: ' + k });
    }
  }

  const rawInput = req.body.input;
  if (typeof rawInput !== 'string' || rawInput.trim().length < 10) {
    return res.status(400).json({ error: 'Please paste more text.' });
  }

  if (rawInput.length > 20000) {
    return res.status(400).json({ error: 'Input too long (maximum 20,000 characters)' });
  }

  const kindParam = (req.body.kind || 'auto').trim().toLowerCase();
  if (!['auto', 'upi', 'message'].includes(kindParam)) {
    return res.status(400).json({ error: 'Invalid kind: must be auto, upi, or message' });
  }

  const text = rawInput.trim();
  const detectedKind = kindParam === 'auto' ? detectKind(text) : kindParam;
  const suggestedTool = detectJobOffer(text);

  // 1. Shared entity extraction
  const extractedLinks = extractLinks(text);
  const emails = extractEmails(text);
  const phoneNumbers = extractPhoneNumbers(text);
  const upiIds = extractUpiIds(text);
  const amounts = extractAmounts(text);

  // 2. Rules evaluation
  const ruleResult = evaluateRules(text, detectedKind);
  const ruleAlreadyFlagged = ruleResult.level === 'high';

  // 3. Technical inspections
  const linkInspections = await inspectLinks(extractedLinks, ruleAlreadyFlagged);

  // 4. AI reading with prompt injection defense
  const aiResult = await analyzeTextWithGemini(detectedKind, text);

  // Calculate scores and technical findings
  const techFindings = [];
  let techScore = 0;

  for (const link of linkInspections) {
    if (link.isShortener) {
      techFindings.push({ severity: 'info', text: `Shortened URL detected: ${link.url}` });
      techScore = Math.max(techScore, 40);
    }
    if (link.isPunycode) {
      techFindings.push({ severity: 'warn', text: `Punycode (internationalized) domain detected: ${link.host}` });
      techScore = Math.max(techScore, 65);
    }
    if (link.isApk) {
      techFindings.push({ severity: 'warn', text: `Direct application (.apk) download link detected: ${link.url}` });
      techScore = Math.max(techScore, 85);
    }
    if (link.brandLookalike && link.brandLookalike.suspicious) {
      techFindings.push({ severity: 'warn', text: `${link.brandLookalike.reason}` });
      techScore = Math.max(techScore, 80);
    }
    if (link.urlhaus && link.urlhaus.checked && link.urlhaus.listed) {
      techFindings.push({ severity: 'warn', text: `URL listed in URLhaus malware database: ${link.urlhaus.threat || 'malicious'}` });
      techScore = Math.max(techScore, 95);
    }
    if (link.virustotal && link.virustotal.checked && link.virustotal.malicious > 0) {
      techFindings.push({ severity: 'warn', text: `VirusTotal detected ${link.virustotal.malicious} security vendor flag(s)` });
      techScore = Math.max(techScore, 85);
    }
    if (link.rdap && link.rdap.checked && link.rdap.createdAt) {
      const regAgeDays = Math.round((Date.now() - new Date(link.rdap.createdAt).getTime()) / 86400000);
      if (regAgeDays < 30) {
        techFindings.push({ severity: 'warn', text: `Domain registered recently (${regAgeDays} days ago): ${link.host}` });
        techScore = Math.max(techScore, 60);
      }
    }
  }

  for (const email of emails) {
    if (email.isDisposable) {
      techFindings.push({ severity: 'warn', text: `Disposable email address detected: ${email.email}` });
      techScore = Math.max(techScore, 70);
    } else if (email.isFree) {
      techFindings.push({ severity: 'info', text: `Free webmail provider (${email.domain}) used for contact: ${email.email}` });
    }
  }

  for (const phone of phoneNumbers) {
    techFindings.push({ severity: 'info', text: `Contact number: ${phone.normalized}. Format validated. No spam database queried.` });
  }

  for (const upi of upiIds) {
    techFindings.push({ severity: 'info', text: `UPI ID format recognized (${upi.upiId}). Note: A UPI handle does not verify recipient identity or ownership.` });
  }

  if (techFindings.length === 0) {
    techFindings.push({ severity: 'info', text: 'No external links, suspicious contacts or files detected in text.' });
  }

  // Combine scores
  const ruleScore = ruleResult.score || 0;
  const aiScore = (aiResult && aiResult.ok) ? aiResult.data.risk : 0;
  let finalScore = Math.max(ruleScore, techScore);
  if (aiResult && aiResult.ok) {
    finalScore = Math.max(finalScore, aiScore);
  }

  // Confidence & Limited Evidence
  let limitedEvidence = false;
  if (text.length < 35 && ruleResult.matchedRules.length === 0 && extractedLinks.length === 0) {
    limitedEvidence = true;
  }

  let finalLevel = 'low';
  if (limitedEvidence && ruleScore === 0) {
    finalLevel = 'unable';
  } else if (finalScore >= 70) {
    finalLevel = 'high';
  } else if (finalScore >= 40) {
    finalLevel = 'medium';
  } else {
    finalLevel = 'low';
  }

  // Ensure final level never lower than what the strongest rule justifies
  if (ruleResult.level === 'high' && finalLevel !== 'high') {
    finalLevel = 'high';
    finalScore = Math.max(finalScore, 75);
  }

  // Evidence status & sources
  const sources = ['Rule engine'];
  const evidenceStatus = {
    rules: 'ok',
    rdap: extractedLinks.some(l => linkInspections.some(i => i.rdap && i.rdap.checked)) ? 'ok' : 'no link',
    urlhaus: extractedLinks.some(l => linkInspections.some(i => i.urlhaus && i.urlhaus.checked)) ? 'ok' : 'no link',
    virustotal: extractedLinks.some(l => linkInspections.some(i => i.virustotal && i.virustotal.checked)) ? 'ok' : 'no link',
    ai: aiResult.ok ? 'ok' : (aiResult.reason || 'unavailable')
  };

  if (extractedLinks.length > 0) sources.push('Link inspection');
  if (aiResult.ok) sources.push('AI reading');

  // Flagged phrases
  const flaggedPhrases = [];
  if (ruleResult.matchedRules.length > 0) {
    for (const r of ruleResult.matchedRules) {
      if (r.snippet && text.toLowerCase().includes(r.snippet.toLowerCase())) {
        flaggedPhrases.push({ text: r.snippet, reason: r.reason });
      }
    }
  }
  if (aiResult.ok && Array.isArray(aiResult.data.flaggedPhrases)) {
    for (const p of aiResult.data.flaggedPhrases) {
      if (!flaggedPhrases.some(fp => fp.text.toLowerCase() === p.text.toLowerCase())) {
        flaggedPhrases.push(p);
      }
    }
  }

  // Scam type
  let scamType = 'none';
  if (aiResult.ok && aiResult.data.scamType && aiResult.data.scamType !== 'none') {
    scamType = aiResult.data.scamType;
  } else if (ruleResult.matchedRules.length > 0) {
    scamType = ruleResult.matchedRules[0].reason;
  }

  // Headlines
  const headlines = {
    high: ['High Risk Scam Detected', 'Evidence suggests this message exhibits patterns common in financial fraud.'],
    medium: ['Suspicious Patterns Detected', 'Evidence suggests caution is warranted before responding or transacting.'],
    low: ['Low Risk Detected', 'Evidence suggests this message does not exhibit known scam patterns.'],
    unable: ['Unable to Verify', 'Evidence suggests the input provides insufficient context to reliably assess risk.']
  };
  const headline = headlines[finalLevel] || headlines.low;

  // Build the 5 structured check objects required for each tool
  const checks = buildChecks(detectedKind, {
    text,
    ruleResult,
    techFindings,
    techScore,
    linkInspections,
    extractedLinks,
    emails,
    phoneNumbers,
    upiIds,
    amounts,
    aiResult,
    aiScore,
    scamType
  });

  const extractedItems = {
    upiIds: upiIds.map(u => u.upiId),
    links: extractedLinks,
    phones: phoneNumbers.map(p => p.normalized),
    emails: emails.map(e => e.email),
    amounts
  };

  let evidenceSourceCount = 1; // Rule engine
  if (extractedLinks.length > 0) evidenceSourceCount++;
  if (phoneNumbers.length > 0 || emails.length > 0 || upiIds.length > 0) evidenceSourceCount++;
  if (aiResult && aiResult.ok) evidenceSourceCount++;

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    tool: detectedKind,
    scamType,
    evidenceSourceCount,
    extractedItems,
    input: {
      kind: detectedKind,
      inputSha256: L.sha(text),
      inputLength: text.length,
      linksCount: extractedLinks.length
    },
    checks,
    overall: {
      level: finalLevel,
      score: finalScore,
      // overall.confidence is on a 0 to 100 integer scale across all tools and tests (e.g. 85 for standard, 40 for limited evidence)
      confidence: limitedEvidence ? 40 : 85,
      limitedEvidence
    },
    sources
  };

  // Create proof using shared proof creator
  const proofResult = await createProof(report, finalLevel, req.hostname);


  // Save to DB
  let saved = false;
  const dbCfg = cfg.runtime.database;
  const userId = (req.user && typeof req.user.id === 'string') ? req.user.id : null;

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
        level: finalLevel,
        score: finalScore,
        confidence: report.overall.confidence,
        report,
        limited_evidence: limitedEvidence,
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
      console.warn('[database] analyze save scan failed:', err.message);
    }
  }

  // Record quota if anonymous
  if (req.recordQuotaUsage) {
    await req.recordQuotaUsage();
  }

  return res.json({
    report,
    level: finalLevel,
    headline,
    evidenceStatus,
    detectedKind,
    scamType,
    flaggedPhrases,
    whatToDo: getWhatToDo(detectedKind),
    suggestedTool,
    extractedText: null,
    proofId: proofResult.proofId,
    accessCode: proofResult.accessCode,
    block: proofResult.blk ? proofResult.blk.index : null,
    blockHash: proofResult.blk ? proofResult.blk.hash : null,
    timestamp: proofResult.blk ? proofResult.blk.timestamp : null,
    receipt: proofResult.receipt,
    saved
  });
}

module.exports = {
  handleAnalyze,
  detectKind,
  detectJobOffer,
  getWhatToDo
};

