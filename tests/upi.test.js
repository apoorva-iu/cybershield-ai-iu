'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');

// Set test mode environment
process.env.npm_lifecycle_event = 'test:upi';

// Clear sensitive keys during unit tests
delete process.env.VT_API_KEY;
delete process.env.URLHAUS_AUTH_KEY;
delete process.env.GOOGLE_PLACES_KEY;

const {
  isBandConsistent,
  filterEvidenceQuotes,
  validatePassResult,
  resolvePassDisagreement,
  findBannedClaims,
  sanitizeBannedClaims,
  SAFE_NEUTRAL_STRING,
  BANNED_CLAIMS_REGEX
} = require('../upi/validator');

const {
  extractCandidateUpiIds,
  getHandleInfo,
  parseDeterministicItems,
  shouldShowUpiSafetyNote
} = require('../upi/parser');

const {
  detectImageMimeAndMagic,
  setCustomVisionRunner
} = require('../upi/vision');

const {
  setCustomRunner,
  runPassWithRetry
} = require('../upi/ai');

const { buildPass1Prompt, buildPass2Prompt } = require('../upi/prompts');
const {
  extractIndependentSignals,
  computeScoreBreakdown,
  computeConfidence,
  evaluateUpiScoreAndConfidence
} = require('../upi/scoring');

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(err => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

async function runTests() {
  console.log('--- Starting UPI Module Unit Tests ---\n');
  let passed = 0;
  let failed = 0;

  function assert(title, condition, detail = '') {
    if (condition) {
      console.log(`  [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${title} ${detail ? '- ' + detail : ''}`);
      failed++;
    }
  }

  // TEST SUITE 1: Band Consistency Validator
  console.log('\n[Suite 1] Band Consistency Validator');
  assert('Low band requires score 0-29', isBandConsistent('low', 0) && isBandConsistent('low', 29) && !isBandConsistent('low', 30) && !isBandConsistent('low', -1));
  assert('Medium band requires score 30-69', isBandConsistent('medium', 30) && isBandConsistent('medium', 69) && !isBandConsistent('medium', 29) && !isBandConsistent('medium', 70));
  assert('High band requires score 70-100', isBandConsistent('high', 70) && isBandConsistent('high', 100) && !isBandConsistent('high', 69) && !isBandConsistent('high', 101));
  assert('Unable band accepts null score', isBandConsistent('unable', null) && isBandConsistent('unable', 50));
  assert('Invalid level fails band check', !isBandConsistent('unknown_level', 50));

  // TEST SUITE 2: Exact Substring Quote Enforcement
  console.log('\n[Suite 2] Exact Substring Quote Enforcement');
  const sampleInput = 'Please pay ₹500 to my UPI ID merchant@okaxis for the dinner bill.';
  const quotesToTest = [
    { quote: 'merchant@okaxis', interpretation: 'Payment recipient' },
    { quote: 'dinner bill', interpretation: 'Reason for payment' },
    { quote: 'I invented this quote', interpretation: 'Hallucination' },
    { quote: 'please pay ₹500', interpretation: 'Case insensitive match' }
  ];
  const filtered = filterEvidenceQuotes(quotesToTest, sampleInput);
  assert('Keeps exact substring quotes', filtered.some(f => f.quote === 'merchant@okaxis'));
  assert('Keeps case-insensitive exact substring quotes', filtered.some(f => f.quote.toLowerCase() === 'please pay ₹500'));
  assert('Drops non-matching hallucinated quotes', !filtered.some(f => f.quote === 'I invented this quote'));
  assert('Returns exact expected length', filtered.length === 3);

  // TEST SUITE 3: Strict Schema Validation
  console.log('\n[Suite 3] Strict Schema Validation');
  const validOutputObj = {
    level: 'low',
    score: 15,
    confidence: 0.9,
    primaryConcern: 'Routine payment scenario with no red flags.',
    scamType: 'routine_payment',
    evidence: [{ quote: 'dinner bill', interpretation: 'Routine dinner' }],
    checks: [
      { key: 'payment_direction', title: 'Payment direction', state: 'pass', summary: 'Normal transfer' },
      { key: 'proof_authenticity', title: 'Proof authenticity', state: 'not_applicable', summary: 'None' },
      { key: 'urgency_and_pressure', title: 'Urgency and pressure', state: 'pass', summary: 'No pressure' },
      { key: 'channel_and_identity', title: 'Channel and identity', state: 'pass', summary: 'Known handle' }
    ],
    whatToDo: ['Confirm payment with recipient.']
  };
  const valRes = validatePassResult(validOutputObj, sampleInput);
  assert('Valid AI output object passes validation', valRes.ok === true && valRes.data.level === 'low');

  const invalidLevelObj = { ...validOutputObj, level: 'dangerous' };
  assert('Invalid level fails validation', validatePassResult(invalidLevelObj, sampleInput).ok === false);

  const mismatchedScoreObj = { ...validOutputObj, level: 'low', score: 85 };
  assert('Score inconsistent with level fails validation', validatePassResult(mismatchedScoreObj, sampleInput).ok === false);

  // TEST SUITE 4: 2-Pass Disagreement Resolution
  console.log('\n[Suite 4] 2-Pass Disagreement Resolution');
  const pLow = {
    level: 'low', score: 10, confidence: 0.8,
    primaryConcern: 'Normal interaction', scamType: 'routine_payment',
    evidence: [{ quote: 'dinner bill', interpretation: 'dinner' }],
    checks: [{ key: 'payment_direction', state: 'pass', summary: 'ok' }],
    whatToDo: ['Check status']
  };
  const pMed = {
    level: 'medium', score: 40, confidence: 0.7,
    primaryConcern: 'Unverified claims', scamType: 'unknown',
    evidence: [{ quote: 'merchant@okaxis', interpretation: 'handle' }],
    checks: [{ key: 'payment_direction', state: 'warning', summary: 'warn' }],
    whatToDo: ['Verify in bank app']
  };
  const pHigh = {
    level: 'high', score: 90, confidence: 0.95,
    primaryConcern: 'Deceptive collect request', scamType: 'pay_to_receive',
    evidence: [{ quote: 'Please pay', interpretation: 'payment' }],
    checks: [{ key: 'payment_direction', state: 'flag', summary: 'scam' }],
    whatToDo: ['Decline request']
  };
  const pUnable = {
    level: 'unable', score: null, confidence: 0,
    primaryConcern: 'Context insufficient', scamType: 'unknown',
    evidence: [], checks: [], whatToDo: []
  };

  // Case 4a: Same level
  const sameRes = resolvePassDisagreement(pLow, { ...pLow, score: 20, confidence: 0.9 });
  assert('Same level retains level and averages score/confidence', sameRes.level === 'low' && sameRes.score === 15 && sameRes.confidence === 0.85);

  // Case 4b: 1 level apart (low vs medium)
  const oneStepRes = resolvePassDisagreement(pLow, pMed);
  assert('1 step apart picks higher level (medium)', oneStepRes.level === 'medium');
  assert('1 step apart lowers confidence by 0.15', oneStepRes.confidence === 0.55);

  // Case 4c: 2 levels apart (low vs high)
  const twoStepRes = resolvePassDisagreement(pLow, pHigh);
  assert('2 steps apart picks high level', twoStepRes.level === 'high');
  assert('2 steps apart sets confidence to 0.5 and adds note', twoStepRes.confidence === 0.5 && twoStepRes.primaryConcern.includes('Multi-pass evaluation noted differing risk assessments'));

  // Case 4d: Unable handling
  const unableResHighConf = resolvePassDisagreement(pUnable, { ...pHigh, confidence: 0.85 });
  assert('Unable with high-confidence pass uses high-confidence pass', unableResHighConf.level === 'high');
  const unableResLowConf = resolvePassDisagreement(pUnable, { ...pMed, confidence: 0.5 });
  assert('Unable with low-confidence pass resolves to unable', unableResLowConf.level === 'unable');

  // TEST SUITE 5: AI Retry and Fallback Logic
  console.log('\n[Suite 5] AI Retry and Fallback Logic');
  let attemptCount = 0;
  setCustomRunner(async (prompt, sys, ctx) => {
    attemptCount++;
    if (attemptCount === 1) {
      // First attempt returns invalid score band
      return { level: 'low', score: 95, confidence: 0.8, primaryConcern: 'bad band', scamType: 'unknown' };
    }
    // Second attempt returns valid
    return { level: 'low', score: 20, confidence: 0.8, primaryConcern: 'good band', scamType: 'routine_payment' };
  });

  const retrySuccess = await runPassWithRetry('test prompt', sampleInput, 1);
  assert('Retries once on band mismatch and succeeds on valid attempt 2', retrySuccess.ok === true && retrySuccess.data.level === 'low' && attemptCount === 2);

  // Test fallback to unable if attempt 2 also fails
  setCustomRunner(async () => {
    return { level: 'low', score: 99, confidence: 0.8 };
  });
  const fallbackUnable = await runPassWithRetry('test prompt', sampleInput, 1);
  assert('Falls back to unable if second attempt also has band mismatch', fallbackUnable.ok === true && fallbackUnable.data.level === 'unable');

  // Reset custom runner
  setCustomRunner(null);

  // TEST SUITE 6: Deterministic Parser
  console.log('\n[Suite 6] Deterministic Parser');
  const upiText = 'Pay 500 Rs to test.user@okaxis or alternate@ybl or unknown@randompsp. Links: https://legit.com, contact +91 9876543210 or help@legit.com. Enter PIN to receive refund.';
  const parsedItems = parseDeterministicItems(upiText);
  assert('Extracts valid UPI IDs', parsedItems.upiIds.includes('test.user@okaxis') && parsedItems.upiIds.includes('alternate@ybl'));
  assert('Handles neutral handle classification', parsedItems.handleInfo.some(h => h.handle === 'okaxis' && h.wellKnown === true));
  assert('Marks unknown handle as not well-known', parsedItems.handleInfo.some(h => h.handle === 'randompsp' && h.wellKnown === false));
  assert('Extracts amounts', parsedItems.amounts.length > 0);
  assert('Extracts phone numbers', parsedItems.phones.includes('+919876543210'));
  assert('Extracts emails', parsedItems.emails.includes('help@legit.com'));
  assert('Triggers showUpiSafetyNote on PIN/refund/receive', shouldShowUpiSafetyNote(upiText) === true);
  assert('Does not trigger showUpiSafetyNote on plain rent message', shouldShowUpiSafetyNote('Here is the rent for this month.') === false);

  // TEST SUITE 7: Image Magic Bytes & Vision Validation
  console.log('\n[Suite 7] Image Magic Bytes & Vision Validation');
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  const jpgHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
  const webpHeader = Buffer.from('RIFF1234WEBPVP8 ');
  const fakeFile = Buffer.from('This is a text file posing as an image.');

  assert('Accepts valid PNG magic bytes', detectImageMimeAndMagic(pngHeader, 'image/png').ok === true);
  assert('Accepts valid JPG magic bytes', detectImageMimeAndMagic(jpgHeader, 'image/jpeg').ok === true);
  assert('Accepts valid WEBP magic bytes', detectImageMimeAndMagic(webpHeader, 'image/webp').ok === true);
  assert('Rejects non-image file spoofing mime type', detectImageMimeAndMagic(fakeFile, 'image/png').ok === false);

  // TEST SUITE 8: Code Scan Tests (Strict Constraint Enforcement)
  console.log('\n[Suite 8] Code Scan Tests (No Scam Keywords, No Regex Rules, No Test Strings)');
  const upiDir = path.join(__dirname, '..', 'upi');
  const files = fs.readdirSync(upiDir).filter(f => f.endsWith('.js'));

  // Test example strings that must NEVER be hardcoded in upi/*
  const forbiddenTestStrings = [
    'Hey I sent 5000 by mistake',
    'accidental transfer',
    'Please approve the collect request',
    'Here is the payment screenshot, release crypto',
    'I have paid the registration fee',
    'Scan this QR code to receive',
    'Enter your UPI PIN to claim reward'
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(upiDir, file), 'utf8');

    // 8a: Ensure no test strings exist in upi/*
    for (const forbidden of forbiddenTestStrings) {
      assert(
        `File upi/${file} does not contain test string "${forbidden.slice(0, 25)}..."`,
        !content.includes(forbidden)
      );
    }

    // 8b: Ensure no scam keyword list arrays exist in upi/*
    // Example: const scamKeywords = ['refund', 'urgent', 'fake']
    const hasKeywordListArray = /const\s+\w*(?:scam|fraud|phish|bad)\w*\s*=\s*\[/i.test(content);
    assert(`File upi/${file} has no scam keyword arrays`, !hasKeywordListArray);

    // 8c: Ensure no scam regex rules exist in upi/*
    // Example: /(?:fake|urgent|scam|fraud|lottery|reward)/
    const hasScamRegexRule = /\/(?:\?[^/]+)?(?:\b)?(?:scam|fraud|lottery|prize|extortion|threat|digital_arrest)/i.test(content);
    assert(`File upi/${file} has no scam pattern regexes`, !hasScamRegexRule);
  }

  // TEST SUITE 9: HTTP API & Proof Verification Integration
  console.log('\n[Suite 9] HTTP API & Proof Verification Integration');
  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.LEDGER_FILE = path.join(__dirname, 'temp_ledger_upi_test.json');
  if (fs.existsSync(process.env.LEDGER_FILE)) fs.unlinkSync(process.env.LEDGER_FILE);

  const server = require('../server.js');
  const baseUrl = `http://localhost:${port}`;

  // Wait briefly for server ready
  await new Promise(r => setTimeout(r, 600));

  try {
    // 9a: Input validation on POST /api/upi/check
    const shortRes = await fetch(`${baseUrl}/api/upi/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'short' })
    });
    assert('POST /api/upi/check rejects input < 10 chars with 400', shortRes.status === 400);

    const unknownFieldRes = await fetch(`${baseUrl}/api/upi/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'Valid length input string for check.', malicious_field: true })
    });
    assert('POST /api/upi/check rejects unknown fields with 400', unknownFieldRes.status === 400);

    // 9b: Successful mock check with proof creation
    setCustomRunner(async (prompt, sys, ctx) => {
      return {
        level: 'low',
        score: 15,
        confidence: 0.9,
        primaryConcern: 'Routine split bill payment without suspicious elements.',
        scamType: 'routine_payment',
        evidence: [{ quote: '₹500 for dinner', interpretation: 'Normal bill amount' }],
        checks: [
          { key: 'payment_direction', title: 'Payment direction', state: 'pass', summary: 'Standard payment' },
          { key: 'proof_authenticity', title: 'Proof authenticity', state: 'not_applicable', summary: 'No proof presented' },
          { key: 'urgency_and_pressure', title: 'Urgency and pressure', state: 'pass', summary: 'No artificial urgency' },
          { key: 'channel_and_identity', title: 'Channel and identity', state: 'pass', summary: 'Identified contact' }
        ],
        whatToDo: ['Pay directly in your UPI app.']
      };
    });

    const checkRes = await fetch(`${baseUrl}/api/upi/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: 'Hi here is ₹500 for dinner split to friend@okaxis.',
        source: 'pasted'
      })
    });

    assert('POST /api/upi/check responds with 200', checkRes.status === 200);
    const checkData = await checkRes.json();
    assert('Returns valid response structure with level', checkData.level === 'low');
    assert('Returns receipt and ledgerProof', Boolean(checkData.receipt && checkData.ledgerProof));
    assert('Returns extractedItems with handleInfo', Array.isArray(checkData.extractedItems.handleInfo));
    assert('Returns scoreBreakdown summing to score', Array.isArray(checkData.scoreBreakdown) && checkData.scoreBreakdown.reduce((s, it) => s + it.points, 0) === checkData.score);
    assert('Returns objective confidence and band', typeof checkData.confidence === 'number' && typeof checkData.confidenceBand === 'string');

    // 9c: Verify receipt with POST /api/proof/verify
    const verifyRes = await fetch(`${baseUrl}/api/proof/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt: checkData.receipt })
    });
    assert('POST /api/proof/verify responds with 200', verifyRes.status === 200);
    const verifyData = await verifyRes.json();
    assert('Receipt verifies as intact', verifyData.status === 'intact');

    // 9d: Tamper with report in receipt -> report_modified
    const tamperedReceipt = JSON.parse(JSON.stringify(checkData.receipt));
    tamperedReceipt.report.overall.level = 'high';
    const tamperRes = await fetch(`${baseUrl}/api/proof/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt: tamperedReceipt })
    });
    const tamperData = await tamperRes.json();
    assert('Tampered receipt verifies as report_modified', tamperData.status === 'report_modified');

    // 9e: Non-existent receipt code -> not_found
    const notFoundRes = await fetch(`${baseUrl}/api/proof/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofId: 'NONEXISTENT123', accessCode: 'ABCDEFGH' })
    });
    const notFoundData = await notFoundRes.json();
    assert('Non-existent proof returns not_found', notFoundData.status === 'not_found');

    // 9f: Vision endpoint mock testing
    setCustomVisionRunner(async (buf, mime) => {
      return {
        text: 'Transcribed screenshot: Paid ₹1000 to shop@okaxis',
        readability: 'good',
        truncated: false,
        notes: '',
        turns: [{ side: 'them', text: 'Paid ₹1000 to shop@okaxis' }]
      };
    });

    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="screenshot.png"\r\nContent-Type: image/png\r\n\r\n`),
      pngHeader,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const visionRes = await fetch(`${baseUrl}/api/upi/read-screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: multipartBody
    });

    assert('POST /api/upi/read-screenshot succeeds with 200 on valid image', visionRes.status === 200);
    const visionData = await visionRes.json();
    assert('Transcribed text returned faithfully', visionData.text.includes('Transcribed screenshot'));

    // Vision failure returns 503 AI_UNAVAILABLE
    setCustomVisionRunner(async () => {
      throw new Error('AI offline');
    });

    const visionFailRes = await fetch(`${baseUrl}/api/upi/read-screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: multipartBody
    });
    assert('POST /api/upi/read-screenshot returns 503 AI_UNAVAILABLE on failure', visionFailRes.status === 503);

  } finally {
    setCustomRunner(null);
    setCustomVisionRunner(null);
    if (fs.existsSync(process.env.LEDGER_FILE)) {
      try { fs.unlinkSync(process.env.LEDGER_FILE); } catch (e) {}
    }
    server.close();
  }

  // TEST SUITE 10: Objective Risk Scoring and Confidence Engine
  console.log('\n[Suite 10] Objective Risk Scoring and Confidence Engine');

  // 10a: At least 5 distinct confidence values across 20 varied mocked inputs
  const variedResults = [];
  for (let i = 1; i <= 20; i++) {
    const chars = 15 + i * 12;
    const text = 'Payment check scenario details '.repeat(Math.ceil(chars / 25)).slice(0, chars);
    const readability = (i % 3 === 0) ? 'poor' : 'good';
    const passCount = (i % 4 === 0) ? 1 : 2;
    const passesAgreed = (i % 2 === 0);
    const finalAiMock = {
      level: (i === 6 || i === 13) ? 'low' : (i % 5 === 0 ? 'medium' : 'high'),
      checks: [
        { key: 'payment_direction', state: (i > 3 ? 'flag' : 'pass') },
        { key: 'proof_authenticity', state: (i > 7 ? 'flag' : 'pass') },
        { key: 'urgency_and_pressure', state: (i > 11 ? 'flag' : 'pass') },
        { key: 'channel_and_identity', state: (i > 15 ? 'warning' : 'pass') }
      ],
      confidence: 0.45 + (i * 0.025),
      scamType: i > 5 ? 'pay_to_receive' : 'routine_payment',
      evidence: i > 8 ? [{ quote: 'Payment check', interpretation: 'test' }] : []
    };
    const res = evaluateUpiScoreAndConfidence({
      finalAi: finalAiMock,
      cleanText: text,
      deterministic: { handleInfo: [{ handle: 'testbank', wellKnown: (i % 5 !== 0) }] },
      showUpiSafetyNote: i > 5,
      linkLookups: i > 10 ? 1 : 0,
      maliciousLinkFound: i === 12,
      passCount,
      passesAgreed,
      source: (i % 3 === 0) ? 'screenshot' : 'pasted',
      readability
    });
    variedResults.push(res);
  }

  const distinctConfs = new Set(variedResults.map(r => r.confidence));
  assert('Produces at least 5 distinct confidence values across 20 varied mocked inputs', distinctConfs.size >= 5, `Got ${distinctConfs.size} distinct values: ${Array.from(distinctConfs).join(', ')}`);

  // 10b: Null for unable or ai_unavailable
  const unableMock = {
    level: 'unable',
    reason: 'unverifiable_receipt',
    score: null,
    confidence: null,
    checks: [],
    evidence: []
  };
  const unableEval = evaluateUpiScoreAndConfidence({
    finalAi: unableMock,
    cleanText: 'Short text',
    deterministic: {},
    showUpiSafetyNote: false,
    linkLookups: 0,
    maliciousLinkFound: false,
    passCount: 2,
    passesAgreed: true,
    source: 'pasted',
    readability: 'good'
  });
  assert('Unable returns null for confidence', unableEval.confidence === null);
  assert('Unable returns null for confidenceBand', unableEval.confidenceBand === null);
  assert('Unable returns null for confidenceFactors', unableEval.confidenceFactors === null);
  assert('Unable returns null for score', unableEval.score === null);
  assert('Unable returns null for scoreBreakdown', unableEval.scoreBreakdown === null);

  // 10c: Confidence Cap Rule
  const fullSignalAi = {
    level: 'high',
    checks: [
      { key: 'payment_direction', state: 'flag' },
      { key: 'proof_authenticity', state: 'flag' },
      { key: 'urgency_and_pressure', state: 'flag' },
      { key: 'channel_and_identity', state: 'flag' }
    ],
    confidence: 1.0,
    scamType: 'pay_to_receive',
    evidence: [{ quote: 'Payment check', interpretation: 'evidence 1' }, { quote: 'scenario details', interpretation: 'evidence 2' }]
  };

  const capPoorReadability = evaluateUpiScoreAndConfidence({
    finalAi: fullSignalAi,
    cleanText: 'Payment check scenario details '.repeat(10),
    deterministic: {},
    showUpiSafetyNote: true,
    linkLookups: 1,
    maliciousLinkFound: false,
    passCount: 2,
    passesAgreed: true,
    source: 'screenshot',
    readability: 'poor'
  });
  assert('Confidence capped at <= 0.90 when readability is poor', capPoorReadability.confidence <= 0.90, `Got: ${capPoorReadability.confidence}`);

  const capDisagreedPasses = evaluateUpiScoreAndConfidence({
    finalAi: fullSignalAi,
    cleanText: 'Payment check scenario details '.repeat(10),
    deterministic: {},
    showUpiSafetyNote: true,
    linkLookups: 1,
    maliciousLinkFound: false,
    passCount: 2,
    passesAgreed: false,
    source: 'pasted',
    readability: 'good'
  });
  assert('Confidence capped at <= 0.90 when passes disagree', capDisagreedPasses.confidence <= 0.90, `Got: ${capDisagreedPasses.confidence}`);

  const capLowSignals = evaluateUpiScoreAndConfidence({
    finalAi: {
      level: 'high',
      checks: [
        { key: 'payment_direction', state: 'flag' },
        { key: 'proof_authenticity', state: 'pass' },
        { key: 'urgency_and_pressure', state: 'pass' },
        { key: 'channel_and_identity', state: 'pass' }
      ],
      confidence: 1.0,
      scamType: 'unknown',
      evidence: []
    },
    cleanText: 'Payment check scenario details '.repeat(10),
    deterministic: {},
    showUpiSafetyNote: false,
    linkLookups: 0,
    maliciousLinkFound: false,
    passCount: 2,
    passesAgreed: true,
    source: 'pasted',
    readability: 'good'
  });
  assert('Confidence capped at <= 0.90 when fewer than 3 signals fire', capLowSignals.confidence <= 0.90, `Got: ${capLowSignals.confidence}`);

  const capExemption = evaluateUpiScoreAndConfidence({
    finalAi: fullSignalAi,
    cleanText: 'Payment check scenario details '.repeat(10),
    deterministic: {},
    showUpiSafetyNote: true,
    linkLookups: 1,
    maliciousLinkFound: true,
    passCount: 2,
    passesAgreed: true,
    source: 'pasted',
    readability: 'good'
  });
  assert('Confidence exceeds 0.90 when two passes agreed, 3+ signals fired, and readability was good', capExemption.confidence > 0.90, `Got: ${capExemption.confidence}`);

  // 10d: Obvious scam score lands between 80 and 97, NOT 100
  const obviousScamEval = evaluateUpiScoreAndConfidence({
    finalAi: {
      level: 'high',
      checks: [
        { key: 'payment_direction', state: 'flag' },
        { key: 'urgency_and_pressure', state: 'flag' },
        { key: 'channel_and_identity', state: 'warning' },
        { key: 'proof_authenticity', state: 'pass' }
      ],
      confidence: 0.95,
      scamType: 'pay_to_receive',
      evidence: [{ quote: 'Payment check', interpretation: 'suspicious' }, { quote: 'scenario details', interpretation: 'collect' }]
    },
    cleanText: 'Payment check scenario details '.repeat(5),
    deterministic: { handleInfo: [{ handle: 'badpsp', wellKnown: false }] },
    showUpiSafetyNote: true,
    linkLookups: 0,
    maliciousLinkFound: false,
    passCount: 2,
    passesAgreed: true,
    source: 'pasted',
    readability: 'good'
  });
  assert('Obvious scam riskScore lands between 80 and 97', obviousScamEval.score >= 80 && obviousScamEval.score <= 97, `Got: ${obviousScamEval.score}`);
  assert('Obvious scam without flagged link does not return exactly 100', obviousScamEval.score !== 100, `Got: ${obviousScamEval.score}`);

  // 10e: Score 100 reachable ONLY when 5+ signals, flagged link, and pass agreement all hold
  const missingPassAgreement = evaluateUpiScoreAndConfidence({
    finalAi: fullSignalAi,
    cleanText: 'Payment check scenario details '.repeat(8),
    deterministic: { handleInfo: [{ handle: 'badpsp', wellKnown: false }] },
    showUpiSafetyNote: true,
    linkLookups: 1,
    maliciousLinkFound: true,
    passCount: 2,
    passesAgreed: false, // Disagreed
    source: 'pasted',
    readability: 'good'
  });
  assert('Score 100 NOT reachable when passes disagree (capped at 97)', missingPassAgreement.score <= 97, `Got: ${missingPassAgreement.score}`);

  const missingFlaggedLink = evaluateUpiScoreAndConfidence({
    finalAi: fullSignalAi,
    cleanText: 'Payment check scenario details '.repeat(8),
    deterministic: { handleInfo: [{ handle: 'badpsp', wellKnown: false }] },
    showUpiSafetyNote: true,
    linkLookups: 1,
    maliciousLinkFound: false, // Not flagged
    passCount: 2,
    passesAgreed: true,
    source: 'pasted',
    readability: 'good'
  });
  assert('Score 100 NOT reachable without flagged link (capped at 97)', missingFlaggedLink.score <= 97, `Got: ${missingFlaggedLink.score}`);

  const reaching100 = evaluateUpiScoreAndConfidence({
    finalAi: fullSignalAi,
    cleanText: 'Payment check scenario details '.repeat(8),
    deterministic: { handleInfo: [{ handle: 'badpsp', wellKnown: false }] },
    showUpiSafetyNote: true,
    linkLookups: 1,
    maliciousLinkFound: true, // Flagged link
    passCount: 2,
    passesAgreed: true, // Agreed
    source: 'pasted',
    readability: 'good'
  });
  assert('Score reaches 100 when 5+ signals, flagged link, and pass agreement all hold', reaching100.score === 100, `Got: ${reaching100.score}`);

  // 10f: Score breakdown sums exactly to score
  assert('Score breakdown sums to score for obvious scam', obviousScamEval.scoreBreakdown.reduce((s, it) => s + it.points, 0) === obviousScamEval.score);
  assert('Score breakdown sums to 100 for 100-score result', reaching100.scoreBreakdown.reduce((s, it) => s + it.points, 0) === 100);

  // TEST SUITE 11: Wording Policy and Banned Claims Enforcement
  console.log('\n[Suite 11] Wording Policy and Banned Claims Enforcement');

  // 11a: Unit check for banned words
  const bannedWords = ['fabricated', 'fake', 'forged', 'edited', 'genuine'];
  for (const word of bannedWords) {
    assert(`Regex flags banned word "${word}"`, BANNED_CLAIMS_REGEX.test(`This screenshot is ${word}`));
  }

  // 11b: Detection across all AI fields
  const sampleWithBanned = {
    primaryConcern: 'This receipt is fake.',
    explanation: 'Payment proof appears fabricated.',
    checks: [
      { key: 'proof_authenticity', title: 'Proof authenticity', state: 'flag', summary: 'Screenshot was forged.' }
    ],
    whatToDo: ['Ignore this edited slip.'],
    evidence: [{ quote: '₹500', interpretation: 'Claimed genuine transfer.' }],
    scoreBreakdown: [{ signal: 'proof', family: 'proof_authenticity', description: 'Fake proof', points: 30 }]
  };
  const violations = findBannedClaims(sampleWithBanned);
  assert('findBannedClaims detects violations in all fields', violations.length >= 5);

  // 11c: Sanitization replaces with safe neutral string
  const sanitized = sanitizeBannedClaims(JSON.parse(JSON.stringify(sampleWithBanned)));
  assert('primaryConcern sanitized to neutral string', sanitized.primaryConcern === SAFE_NEUTRAL_STRING);
  assert('explanation sanitized to neutral string', sanitized.explanation === SAFE_NEUTRAL_STRING);
  assert('check summary sanitized to neutral string', sanitized.checks[0].summary === SAFE_NEUTRAL_STRING);
  assert('whatToDo sanitized to neutral string', sanitized.whatToDo[0] === SAFE_NEUTRAL_STRING);
  assert('evidence interpretation sanitized to neutral string', sanitized.evidence[0].interpretation === SAFE_NEUTRAL_STRING);
  assert('scoreBreakdown description sanitized to neutral string', sanitized.scoreBreakdown[0].description === SAFE_NEUTRAL_STRING);

  // 11d: Mocked AI output with banned claims retries on attempt 1 with error context
  let passAttemptsSeen = [];
  setCustomRunner(async (prompt, sys, ctx) => {
    passAttemptsSeen.push(ctx.attempt);
    if (ctx.attempt === 1) {
      return {
        level: 'high',
        score: 80,
        confidence: 0.9,
        primaryConcern: 'This payment slip is fake.',
        checks: [
          { key: 'payment_direction', title: 'Payment direction', state: 'pass', summary: 'Normal' },
          { key: 'proof_authenticity', title: 'Proof authenticity', state: 'flag', summary: 'Fake receipt.' },
          { key: 'urgency_and_pressure', title: 'Urgency and pressure', state: 'pass', summary: 'None' },
          { key: 'channel_and_identity', title: 'Channel and identity', state: 'pass', summary: 'Identified' }
        ],
        whatToDo: ['Do not accept fake receipts.']
      };
    }
    // Attempt 2: returns safe wording
    assert('Prompt on attempt 2 includes wording policy correction', prompt.includes('CORRECTION REQUIRED') && /wording policy/i.test(prompt));
    return {
      level: 'high',
      score: 80,
      confidence: 0.9,
      primaryConcern: 'Payment cannot be verified without bank confirmation.',
      checks: [
        { key: 'payment_direction', title: 'Payment direction', state: 'pass', summary: 'Normal' },
        { key: 'proof_authenticity', title: 'Proof authenticity', state: 'flag', summary: 'Receipt details cannot be verified from an image.' },
        { key: 'urgency_and_pressure', title: 'Urgency and pressure', state: 'pass', summary: 'None' },
        { key: 'channel_and_identity', title: 'Channel and identity', state: 'pass', summary: 'Identified' }
      ],
      whatToDo: ['Receipt details cannot be verified from an image.']
    };
  });

  const retryRes = await runPassWithRetry('Payment slip test', 'Payment slip test', 1);
  assert('AI runner retried once on banned claim', passAttemptsSeen.length === 2 && passAttemptsSeen[0] === 1 && passAttemptsSeen[1] === 2);
  assert('Run pass returned ok after successful retry', retryRes.ok === true);
  assert('No banned words remain in retried output', !BANNED_CLAIMS_REGEX.test(retryRes.data.primaryConcern));

  // 11e: If attempt 2 still contains banned words, post-validation replaces with safe neutral string
  setCustomRunner(async (prompt, sys, ctx) => {
    return {
      level: 'high',
      score: 85,
      confidence: 0.9,
      primaryConcern: 'Persistent fake receipt assertion.',
      checks: [
        { key: 'payment_direction', title: 'Payment direction', state: 'pass', summary: 'Normal' },
        { key: 'proof_authenticity', title: 'Proof authenticity', state: 'flag', summary: 'Persistent fake assertion.' },
        { key: 'urgency_and_pressure', title: 'Urgency and pressure', state: 'pass', summary: 'None' },
        { key: 'channel_and_identity', title: 'Channel and identity', state: 'pass', summary: 'Identified' }
      ],
      whatToDo: ['Persistent fake assertion in advice.']
    };
  });

  const persistentRes = await runPassWithRetry('Payment slip test 2', 'Payment slip test 2', 1);
  assert('Attempt 2 persistent banned claims replaced with safe neutral string', persistentRes.data.primaryConcern === SAFE_NEUTRAL_STRING);
  assert('Check summary persistent banned claim replaced', persistentRes.data.checks[1].summary === SAFE_NEUTRAL_STRING);
  assert('whatToDo persistent banned claim replaced', persistentRes.data.whatToDo[0] === SAFE_NEUTRAL_STRING);

  setCustomRunner(null);

  // TEST SUITE 12: Score Breakdown Sum Verification Across 20 Varied Inputs
  console.log('\n[Suite 12] Score Breakdown Sum Verification Across 20 Varied Inputs');
  let sumChecksPassed = 0;
  for (let i = 1; i <= 20; i++) {
    const chars = 20 + i * 15;
    const cleanText = 'Payment scenario transaction data '.repeat(Math.ceil(chars / 30)).slice(0, chars);
    const mockLevel = (i % 3 === 0) ? 'low' : ((i % 2 === 0) ? 'medium' : 'high');
    const mockSignalsAi = {
      level: mockLevel,
      checks: [
        { key: 'payment_direction', state: (i > 5 ? 'flag' : 'pass') },
        { key: 'proof_authenticity', state: (i > 10 ? 'flag' : (i > 4 ? 'warning' : 'pass')) },
        { key: 'urgency_and_pressure', state: (i > 12 ? 'flag' : 'pass') },
        { key: 'channel_and_identity', state: (i > 15 ? 'warning' : 'pass') }
      ],
      confidence: 0.5 + (i * 0.02),
      scamType: (i > 6 ? 'pay_to_receive' : 'routine_payment'),
      evidence: (i > 8 ? [{ quote: 'Payment scenario', interpretation: 'Context' }] : [])
    };

    const evalOut = evaluateUpiScoreAndConfidence({
      finalAi: mockSignalsAi,
      cleanText,
      deterministic: { handleInfo: [{ handle: 'axis', wellKnown: true }] },
      showUpiSafetyNote: (i % 2 === 0),
      linkLookups: (i % 4 === 0 ? 1 : 0),
      maliciousLinkFound: (i === 16),
      passCount: 2,
      passesAgreed: (i % 2 === 0),
      source: 'pasted',
      readability: 'good'
    });

    if (evalOut.scoreBreakdown && evalOut.score != null) {
      const breakdownSum = evalOut.scoreBreakdown.reduce((sum, item) => sum + item.points, 0);
      const diff = Math.abs(breakdownSum - evalOut.score);
      if (diff <= 1) {
        sumChecksPassed++;
      }
    } else if (evalOut.score === 0 && (!evalOut.scoreBreakdown || evalOut.scoreBreakdown.length === 0)) {
      sumChecksPassed++;
    }
  }
  assert('Score breakdown sums to riskScore (within 1) across 20 varied inputs', sumChecksPassed === 20, `Passed: ${sumChecksPassed}/20`);

  // TEST SUITE 13: Plain Wording and Confidence Factors Validation
  console.log('\n[Suite 13] Plain Wording and Confidence Factors Validation');
  const sampleConfidenceEval = evaluateUpiScoreAndConfidence({
    finalAi: {
      level: 'high',
      checks: [
        { key: 'payment_direction', state: 'flag' },
        { key: 'proof_authenticity', state: 'flag' },
        { key: 'urgency_and_pressure', state: 'pass' },
        { key: 'channel_and_identity', state: 'pass' }
      ],
      confidence: 0.88,
      scamType: 'pay_to_receive',
      evidence: [{ quote: 'Payment scenario', interpretation: 'Flagged' }]
    },
    cleanText: 'Payment scenario details with enough characters for analysis.'.repeat(3),
    deterministic: { handleInfo: [{ handle: 'okaxis', wellKnown: true }] },
    showUpiSafetyNote: true,
    linkLookups: 0,
    maliciousLinkFound: false,
    passCount: 2,
    passesAgreed: true,
    source: 'pasted',
    readability: 'good'
  });

  const factors = sampleConfidenceEval.confidenceFactors;
  assert('confidenceFactors is an array', Array.isArray(factors) && factors.length > 0);

  let allEffectsValid = true;
  let allWithoutDigits = true;
  let noSelfCertaintyPresent = true;

  for (const factor of factors) {
    if (!['raises', 'lowers', 'neutral'].includes(factor.effect)) {
      allEffectsValid = false;
    }
    if (/\d/.test(factor.label) || /\d/.test(factor.text)) {
      allWithoutDigits = false;
    }
    if (/self-assessed|self-certainty|model certainty/i.test(factor.label || factor.text)) {
      noSelfCertaintyPresent = false;
    }
  }

  assert('All confidence factors contain effect field with raises, lowers, or neutral', allEffectsValid);
  assert('All confidence factor labels and text contain zero digits or numeric points', allWithoutDigits);
  assert('No model self-assessed certainty line present in confidence factors', noSelfCertaintyPresent);

  // Check presence of specific plain statements
  const factorLabels = factors.map(f => f.label);
  assert('Contains plain statement "Clear screenshot text"', factorLabels.includes('Clear screenshot text'));
  assert('Contains plain statement "Enough text to judge"', factorLabels.includes('Enough text to judge'));
  assert('Contains plain statement "Several independent signals"', factorLabels.includes('Several independent signals'));
  assert('Contains plain statement "Two readings agreed"', factorLabels.includes('Two readings agreed'));
  assert('Contains plain statement "No links to look up"', factorLabels.includes('No links to look up'));

  // TEST SUITE 14: Server Strings Jargon Verification
  console.log('\n[Suite 14] Server Strings Jargon Verification');
  const upiFiles = fs.readdirSync(upiDir).filter(f => f.endsWith('.js'));
  let jargonFound = false;
  for (const file of upiFiles) {
    const fileContent = fs.readFileSync(path.join(upiDir, file), 'utf8');
    if (/first-principle|first principle/i.test(fileContent)) {
      jargonFound = true;
      console.error(`Found first-principle jargon in upi/${file}`);
    }
  }
  assert('No first-principles jargon in any upi/*.js files', !jargonFound);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

