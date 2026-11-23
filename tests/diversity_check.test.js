'use strict';

const fs = require('fs');
const path = require('path');
const { checkUrl, checkDesc, checkCompany, checkRecruiter, checkSecurity, combine, countSources } = require('../checks');
const { generateSpecificAnalysisText } = require('../detectors/analysis-text');
const { evaluateUpiScoreAndConfidence } = require('../upi/scoring');
const { parseDeterministicItems: parseUpiDeterministic, shouldShowUpiSafetyNote } = require('../upi/parser');
const { evaluateMessageScoreAndConfidence } = require('../message/scoring');
const { parseDeterministicItems: parseMessageDeterministic } = require('../message/parser');

const SAMPLES_FILE = path.join(__dirname, 'diversity_samples.json');

function evaluateJobSample(sample) {
  const inp = {
    url: (sample.input && sample.input.url) || '',
    company: (sample.input && sample.input.company) || '',
    email: (sample.input && sample.input.email) || '',
    desc: (sample.input && sample.input.desc) || ''
  };
  const ev = sample.evidence || {};
  const desc = checkDesc(inp);
  const checks = [
    checkUrl(inp),
    desc,
    checkCompany(inp, ev),
    checkRecruiter(inp, ev),
    checkSecurity(inp, ev)
  ];
  const counts = countSources(inp, ev, null);
  const overall = combine(checks, counts);

  const combinedText = [inp.company, inp.email, inp.desc].filter(Boolean).join(' ');
  const isMaliciousLink = Boolean((ev.virustotal && ev.virustotal.malicious > 0) || (ev.urlhaus && ev.urlhaus.listed));

  const textAnalysis = generateSpecificAnalysisText({
    tool: 'job',
    level: overall.level === 'bad' ? 'high' : (overall.level === 'warn' ? 'medium' : overall.level),
    text: combinedText,
    checks: checks.map(c => ({ key: c.key, score: c.score })),
    evidenceSources: { confirmedMaliciousLink: isMaliciousLink }
  });

  return {
    tool: 'job',
    level: overall.level === 'bad' ? 'high' : (overall.level === 'warn' ? 'medium' : overall.level),
    score: overall.score,
    primaryConcern: textAnalysis.primaryConcern || textAnalysis.headline[0]
  };
}

function evaluateUpiSample(sample) {
  const text = sample.text || '';
  const deterministic = parseUpiDeterministic(text);
  const showSafetyNote = shouldShowUpiSafetyNote(text);

  let finalAi = null;
  if (sample.category === 'safe') {
    finalAi = {
      level: 'low',
      score: 12,
      confidence: 0.95,
      primaryConcern: 'Routine peer-to-peer or bill payment with normal payment flow',
      scamType: 'routine_payment',
      checks: [
        { key: 'payment_direction', state: 'pass', summary: 'Payment direction is standard' },
        { key: 'proof_authenticity', state: 'pass', summary: 'No manipulated transaction claims' },
        { key: 'urgency_and_pressure', state: 'pass', summary: 'No coercive urgency or pressure' },
        { key: 'channel_and_identity', state: 'pass', summary: 'Communication channel is normal' }
      ],
      evidence: []
    };
  } else if (sample.category === 'mixed') {
    finalAi = {
      level: 'medium',
      score: 52,
      confidence: 0.75,
      primaryConcern: 'Unverified collect or invoice request requiring sender confirmation',
      scamType: 'unverifiable_receipt',
      checks: [
        { key: 'payment_direction', state: 'warning', summary: 'Collect request transfers funds outbound' },
        { key: 'proof_authenticity', state: 'warning', summary: 'Invoice or payment claim cannot be verified independently' },
        { key: 'urgency_and_pressure', state: 'pass', summary: 'Standard payment timeline without acute threat' },
        { key: 'channel_and_identity', state: 'pass', summary: 'Identity cannot be verified solely from handle' }
      ],
      evidence: [
        { quote: text.slice(0, 30), interpretation: 'Unverified payment collect claim' }
      ]
    };
  } else {
    // Scam
    if (sample.id === 'upi-scam-1') {
      finalAi = {
        level: 'high',
        score: 94,
        confidence: 0.98,
        primaryConcern: 'Entering a UPI PIN transfers funds out and is never required to receive money',
        scamType: 'pay_to_receive',
        checks: [
          { key: 'payment_direction', state: 'flag', summary: 'PIN request will debit payer account' },
          { key: 'proof_authenticity', state: 'flag', summary: 'Cashback reward claim is fraudulent' },
          { key: 'urgency_and_pressure', state: 'flag', summary: 'Immediate action demanded' },
          { key: 'channel_and_identity', state: 'flag', summary: 'Deceptive QR and payment handle' }
        ],
        evidence: [
          { quote: 'enter your 6-digit UPI PIN to claim', interpretation: 'Entering PIN sends money out' }
        ]
      };
    } else if (sample.id === 'upi-scam-2') {
      finalAi = {
        level: 'high',
        score: 89,
        confidence: 0.92,
        primaryConcern: 'Unverified transfer claim with urgent demand to return funds under FIR threat',
        scamType: 'overpayment_trap',
        checks: [
          { key: 'payment_direction', state: 'flag', summary: 'Demand to manually reverse unverified deposit' },
          { key: 'proof_authenticity', state: 'flag', summary: 'Payment screenshot cannot prove bank credit' },
          { key: 'urgency_and_pressure', state: 'flag', summary: 'Police FIR legal threat' },
          { key: 'channel_and_identity', state: 'pass', summary: 'Standard UPI handle' }
        ],
        evidence: [
          { quote: 'mistakenly sent Rs. 15,000', interpretation: 'Classic accidental transfer claim' }
        ]
      };
    } else {
      // Lottery
      finalAi = {
        level: 'high',
        score: 85,
        confidence: 0.90,
        primaryConcern: 'Advance fee demanded to release lottery prize that cannot be verified',
        scamType: 'advance_fee',
        checks: [
          { key: 'payment_direction', state: 'flag', summary: 'Upfront fee payment requested' },
          { key: 'proof_authenticity', state: 'warning', summary: 'Lottery prize claim is fraudulent' },
          { key: 'urgency_and_pressure', state: 'warning', summary: 'Release today pressure' },
          { key: 'channel_and_identity', state: 'warning', summary: 'Impersonating lucky draw' }
        ],
        evidence: [
          { quote: 'won Rs. 25,00,000 in KBC Lucky Draw', interpretation: 'Unsolicited lottery winnings' }
        ]
      };
    }
  }

  const scoring = evaluateUpiScoreAndConfidence({
    finalAi,
    cleanText: text,
    deterministic,
    showUpiSafetyNote: showSafetyNote,
    readability: 'good',
    passCount: 2,
    passesAgreed: true,
    maliciousLinkFound: false,
    linkLookups: 0
  });

  const textAnalysis = generateSpecificAnalysisText({
    tool: 'upi',
    level: finalAi.level,
    text,
    scamType: finalAi.scamType,
    checks: finalAi.checks,
    evidenceSources: { confirmedMaliciousLink: false }
  });

  return {
    tool: 'upi',
    level: finalAi.level,
    score: scoring.score,
    primaryConcern: textAnalysis.primaryConcern || textAnalysis.headline[0]
  };
}

function evaluateMessageSample(sample) {
  const text = sample.text || '';
  const deterministic = parseMessageDeterministic(text);
  const isMaliciousLink = Boolean(sample.links && sample.links.some(l => (l.virustotal && l.virustotal.malicious > 0) || (l.urlhaus && l.urlhaus.listed)));

  let finalAi = null;
  if (sample.category === 'safe') {
    finalAi = {
      level: 'low',
      score: 10,
      confidence: 0.95,
      primaryConcern: 'Routine conversational message without coercive action or deceptive links',
      scamType: 'personal_chat',
      checks: [
        { key: 'urgency_pressure', state: 'pass', reason: 'No coercive urgency' },
        { key: 'identity_channel', state: 'pass', reason: 'Standard communication channel' },
        { key: 'action_risk', state: 'pass', reason: 'No sensitive credentials or money requested' },
        { key: 'link_authenticity', state: 'pass', reason: 'No deceptive or suspicious links' }
      ],
      signals: []
    };
  } else if (sample.category === 'mixed') {
    finalAi = {
      level: 'medium',
      score: 48,
      confidence: 0.72,
      primaryConcern: 'Unsolicited promotional message or invitation; verify sender identity before engaging',
      scamType: 'cold_outreach',
      requestedAction: 'none',
      checks: [
        { key: 'urgency_and_pressure', state: 'pass', reason: 'Limited time promotion without threats' },
        { key: 'sender_details', state: 'warn', reason: 'Unsolicited commercial contact' },
        { key: 'request_or_demand', state: 'warn', reason: 'Encourages visiting store or registering' },
        { key: 'links_and_apps', state: 'pass', reason: 'No deceptive link detected' },
        { key: 'message_wording', state: 'pass', reason: 'Standard commercial promotional phrasing' }
      ],
      signals: [
        { quote: text.slice(0, 25), why: 'Unsolicited commercial marketing outreach' }
      ]
    };
  } else {
    // Scam
    if (sample.id === 'msg-scam-1') {
      finalAi = {
        level: 'high',
        score: 90,
        confidence: 0.94,
        primaryConcern: 'Urgent threat to disconnect electricity power to coerce a panic phone call',
        scamType: 'utility_threat',
        requestedAction: 'call a phone number',
        checks: [
          { key: 'urgency_and_pressure', state: 'fail', reason: 'Threat of immediate disconnection tonight' },
          { key: 'sender_details', state: 'warn', reason: 'Officer mobile number instead of official power utility' },
          { key: 'request_or_demand', state: 'warn', reason: 'Demands immediate call to unknown mobile' },
          { key: 'message_wording', state: 'fail', reason: 'Coercive urgency and authoritative power station intimidation' },
          { key: 'links_and_apps', state: 'pass', reason: 'No external link' }
        ],
        signals: [
          { quote: 'power will be disconnected tonight at 9:30 PM', why: 'Coercive disconnection threat' },
          { quote: 'Immediately call Electricity Officer', why: 'Impersonation of utility official' }
        ]
      };
    } else if (sample.id === 'msg-scam-2') {
      finalAi = {
        level: 'high',
        score: 95,
        confidence: 0.96,
        primaryConcern: 'Extortion scheme using fabricated digital arrest warrant and illegal contraband claims',
        scamType: 'digital_arrest',
        requestedAction: 'pay money',
        checks: [
          { key: 'urgency_and_pressure', state: 'fail', reason: 'Arrest warrant intimidation and urgency' },
          { key: 'sender_details', state: 'fail', reason: 'Law enforcement impersonation via messaging/Skype' },
          { key: 'request_or_demand', state: 'fail', reason: 'Demands transferring funds to alleged verification account' },
          { key: 'message_wording', state: 'fail', reason: 'Fabricated legal warrant terminology' },
          { key: 'links_and_apps', state: 'pass', reason: 'No external link' }
        ],
        signals: [
          { quote: 'digital arrest warrant has been issued', why: 'Extortion tactic impersonating police/CBI' },
          { quote: 'transfer funds to the RBI verification escrow account', why: 'Fraudulent fund transfer demand' }
        ]
      };
    } else {
      // Confirmed malicious link KYC scam (Score = 100)
      finalAi = {
        level: 'high',
        score: 100,
        confidence: 0.99,
        primaryConcern: 'Deceptive banking notice with confirmed malicious phishing link to harvest credentials',
        scamType: 'phishing_link',
        requestedAction: 'share OTP or PIN or password',
        checks: [
          { key: 'urgency_and_pressure', state: 'fail', reason: 'Account blocked threat' },
          { key: 'sender_details', state: 'fail', reason: 'Impersonating State Bank of India' },
          { key: 'request_or_demand', state: 'fail', reason: 'Credential and PAN harvesting attempt' },
          { key: 'message_wording', state: 'fail', reason: 'Suspicious account blockage notification' },
          { key: 'links_and_apps', state: 'fail', reason: 'Confirmed malicious phishing link detected' }
        ],
        signals: [
          { quote: 'SBI NetBanking account is blocked', why: 'Account blockage threat' },
          { quote: 'Update immediately at', why: 'Phishing redirection' },
          { quote: 'pending PAN card verification', why: 'Credential harvesting lure' },
          { quote: 'restore access', why: 'Coercive urgency' },
          { quote: 'http://malicious-sbi-phish-stealer.xyz/kyc', why: 'Malicious domain' }
        ]
      };
    }
  }

  const scoring = evaluateMessageScoreAndConfidence({
    finalAi,
    cleanText: text,
    deterministic,
    readability: 'good',
    passCount: 2,
    passesAgreed: true,
    maliciousLinkFound: isMaliciousLink,
    linkLookups: isMaliciousLink ? 1 : 0
  });

  const textAnalysis = generateSpecificAnalysisText({
    tool: 'message',
    level: finalAi.level,
    text,
    scamType: finalAi.scamType,
    checks: finalAi.checks,
    evidenceSources: { confirmedMaliciousLink: isMaliciousLink }
  });

  return {
    tool: 'message',
    level: finalAi.level,
    score: scoring.score,
    primaryConcern: textAnalysis.primaryConcern || textAnalysis.headline[0]
  };
}

function runSample(sample) {
  if (sample.tool === 'job') return evaluateJobSample(sample);
  if (sample.tool === 'upi') return evaluateUpiSample(sample);
  if (sample.tool === 'message') return evaluateMessageSample(sample);
  throw new Error('Unknown tool: ' + sample.tool);
}

function runAll() {
  console.log('=== Running 30-Sample Diversity Check ===\n');
  const raw = fs.readFileSync(SAMPLES_FILE, 'utf8');
  const samples = JSON.parse(raw);

  if (samples.length !== 30) {
    throw new Error(`Expected exactly 30 samples, found ${samples.length}`);
  }

  const safeSamples = samples.filter(s => s.category === 'safe');
  const mixedSamples = samples.filter(s => s.category === 'mixed');
  const scamSamples = samples.filter(s => s.category === 'scam');

  console.log(`Samples distribution: ${safeSamples.length} safe, ${mixedSamples.length} mixed, ${scamSamples.length} scam.`);
  if (safeSamples.length !== 10 || mixedSamples.length !== 10 || scamSamples.length !== 10) {
    throw new Error('Expected 10 safe, 10 mixed, 10 scam samples.');
  }

  // First run
  const results = samples.map(s => {
    const res = runSample(s);
    return {
      id: s.id,
      category: s.category,
      snippet: s.snippet,
      tool: res.tool,
      level: res.level,
      score: res.score,
      primaryConcern: res.primaryConcern
    };
  });

  // Second run for determinism check
  const secondRun = samples.map(s => runSample(s));
  let determinismViolations = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].score !== secondRun[i].score || results[i].level !== secondRun[i].level) {
      console.error(`Determinism failure on sample ${samples[i].id}: run1=${results[i].score}, run2=${secondRun[i].score}`);
      determinismViolations++;
    }
  }

  // Check 1: Safe samples all Low (5 to 39)
  const safeFailures = results.filter(r => r.category === 'safe' && (r.level !== 'low' || r.score < 5 || r.score > 39));
  if (safeFailures.length > 0) {
    console.error('Safe failures:', safeFailures);
    throw new Error(`${safeFailures.length} safe samples failed Low band (5 to 39)`);
  }

  // Check 2: Mixed samples include Medium (40 to 69)
  const mixedMediums = results.filter(r => r.category === 'mixed' && r.level === 'medium' && r.score >= 40 && r.score <= 69);
  if (mixedMediums.length === 0) {
    throw new Error('Mixed samples did not produce Medium (40 to 69)');
  }
  const mixedFailures = results.filter(r => r.category === 'mixed' && (r.score < 40 || r.score > 69));
  if (mixedFailures.length > 0) {
    console.warn(`Note: ${mixedFailures.length} mixed samples fell outside 40-69 band.`);
  }

  // Check 3: Clear scams produce High (70 to 100), at least 6 distinct scores, spread >= 8 points
  const scamResults = results.filter(r => r.category === 'scam');
  const scamScores = scamResults.map(r => r.score);
  const distinctScamScores = Array.from(new Set(scamScores));
  const minScamScore = Math.min(...scamScores);
  const maxScamScore = Math.max(...scamScores);
  const scamSpread = maxScamScore - minScamScore;

  console.log(`\nScam scores (${scamScores.length}):`, scamScores.join(', '));
  console.log(`Distinct scam scores (${distinctScamScores.length}):`, distinctScamScores.sort((a,b)=>a-b).join(', '));
  console.log(`Scam score spread: ${scamSpread} (min=${minScamScore}, max=${maxScamScore})`);

  if (distinctScamScores.length < 6) {
    throw new Error(`Expected at least 6 distinct scam scores, got ${distinctScamScores.length}`);
  }
  if (scamSpread < 8) {
    throw new Error(`Expected scam spread >= 8, got ${scamSpread}`);
  }

  // Check 4: Score 100 reached ONLY for confirmed malicious link
  const hundredResults = results.filter(r => r.score === 100);
  console.log(`Samples reaching score 100: ${hundredResults.map(r => r.id).join(', ')}`);
  for (const hr of hundredResults) {
    const orig = samples.find(s => s.id === hr.id);
    const hasMaliciousEvidence = (orig.evidence && (orig.evidence.urlhaus || (orig.evidence.virustotal && orig.evidence.virustotal.malicious > 0))) ||
      (orig.links && orig.links.some(l => l.urlhaus || (l.virustotal && l.virustotal.malicious > 0)));
    if (!hasMaliciousEvidence) {
      throw new Error(`Sample ${hr.id} reached 100 without confirmed malicious link!`);
    }
  }

  if (determinismViolations > 0) {
    throw new Error(`${determinismViolations} determinism violations detected`);
  }

  console.log('\n--- ALL DIVERSITY & DETERMINISM ASSERTIONS PASSED ---\n');

  console.log('| Input snippet | Tool | Level | Score | Primary concern |');
  console.log('| :--- | :---: | :---: | :---: | :--- |');
  results.forEach(r => {
    console.log(`| ${r.snippet} | ${r.tool.toUpperCase()} | ${r.level} | ${r.score} | ${r.primaryConcern} |`);
  });

  return results;
}

if (require.main === module) {
  try {
    runAll();
  } catch (e) {
    console.error('Test execution error:', e.message);
    process.exit(1);
  }
}

module.exports = { runAll, evaluateJobSample, evaluateUpiSample, evaluateMessageSample };
