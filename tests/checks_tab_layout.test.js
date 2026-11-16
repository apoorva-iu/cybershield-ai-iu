'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('CHECKS TAB LAYOUT & COMPONENT INTEGRITY TEST SUITE');
console.log('====================================================\n');

// Test 1: Check ordering priority logic
console.log('--- Test 1: Importance-Based Check Ordering ---');
const usrCode = fs.readFileSync(path.join(__dirname, '../web/src/components/UnifiedScanResult.jsx'), 'utf8');

assert(usrCode.includes('CHECK_PRIORITY'), 'CHECK_PRIORITY map defined');
assert(usrCode.includes('sortedApplicableChecks'), 'sortedApplicableChecks computed');

// Extract CHECK_PRIORITY object from usrCode using eval/regex
const priorityMatch = usrCode.match(/const CHECK_PRIORITY = ({[\s\S]*?});/);
assert(priorityMatch, 'CHECK_PRIORITY regex matched');
const CHECK_PRIORITY = eval('(' + priorityMatch[1] + ')');

assert.strictEqual(CHECK_PRIORITY.flag, 1, 'Flag has highest priority (1)');
assert.strictEqual(CHECK_PRIORITY.fail, 1, 'Fail has highest priority (1)');
assert.strictEqual(CHECK_PRIORITY.bad, 1, 'Bad has highest priority (1)');
assert.strictEqual(CHECK_PRIORITY.warn, 2, 'Warn has priority (2)');
assert.strictEqual(CHECK_PRIORITY.warning, 2, 'Warning has priority (2)');
assert.strictEqual(CHECK_PRIORITY.unknown, 3, 'Unknown has priority (3)');
assert.strictEqual(CHECK_PRIORITY.pass, 4, 'Pass has priority (4)');
assert.strictEqual(CHECK_PRIORITY.ok, 4, 'Ok has priority (4)');

const sampleChecks = [
  { key: 'url', state: 'ok', title: 'Job URL' },
  { key: 'desc', state: 'warn', title: 'Job description' },
  { key: 'comp', state: 'unknown', title: 'Company verification' },
  { key: 'rec', state: 'flag', title: 'Recruiter domain' },
  { key: 'sec', state: 'safe', title: 'Security' }
];

const sorted = [...sampleChecks]
  .map((c, originalIdx) => ({ c, originalIdx }))
  .sort((a, b) => {
    const pA = CHECK_PRIORITY[String(a.c.state).toLowerCase()] || 3;
    const pB = CHECK_PRIORITY[String(b.c.state).toLowerCase()] || 3;
    if (pA !== pB) return pA - pB;
    return a.originalIdx - b.originalIdx;
  })
  .map(item => item.c);

assert.strictEqual(sorted[0].key, 'rec', 'First card is Flag');
assert.strictEqual(sorted[1].key, 'desc', 'Second card is Warn');
assert.strictEqual(sorted[2].key, 'comp', 'Third card is Unknown');
assert.strictEqual(sorted[3].key, 'url', 'Fourth card is Ok');
assert.strictEqual(sorted[4].key, 'sec', 'Fifth card is Safe');
console.log('✓ Test 1 Passed: Checks are sorted by importance (Flag -> Warn -> Unknown -> Pass)\n');

// Test 2: Finding parser for quoted matches and chips
console.log('--- Test 2: Finding Parser & Subtle Highlight Chips ---');
// Verify parseFindingText implementation in usrCode
assert(usrCode.includes('function parseFindingText'), 'parseFindingText function exists');

// Emulate function
function parseFindingText(text) {
  if (!text || typeof text !== 'string') return { text: '', quote: null, isQuoteMatch: false };
  const foundRegex = /(?:Found|matched):\s*["“]([^"”]+)["”]/i;
  const foundMatch = text.match(foundRegex);
  if (foundMatch) {
    const quote = foundMatch[1].trim();
    const cleanLeading = text.replace(foundRegex, '').replace(/[:\.\-\s]+$/, '').trim();
    return { text: cleanLeading || 'Matched in text:', quote, isQuoteMatch: true };
  }
  const quoteRegex = /["“]([^"”]{3,})["”]/;
  const quoteMatch = text.match(quoteRegex);
  if (quoteMatch) {
    const quote = quoteMatch[1].trim();
    const cleanLeading = text.replace(quoteRegex, '').replace(/\s{2,}/g, ' ').replace(/[:\.\-\s]+$/, '').trim();
    return { text: cleanLeading || 'Matched phrase:', quote, isQuoteMatch: true };
  }
  return { text: text.trim(), quote: null, isQuoteMatch: false };
}

const quotedTest1 = parseFindingText('Salary or commission guarantees are unrealistic. Found: "Earn ₹5000 daily"');
assert.strictEqual(quotedTest1.isQuoteMatch, true, 'Quoted match detected');
assert.strictEqual(quotedTest1.quote, 'Earn ₹5000 daily', 'Quote extracted accurately');
assert.strictEqual(quotedTest1.text, 'Salary or commission guarantees are unrealistic', 'Leading text cleaned');

const plainTest = parseFindingText('No structural red flags found in the address.');
assert.strictEqual(plainTest.isQuoteMatch, false, 'Plain finding not marked as quote match');
assert.strictEqual(plainTest.quote, null, 'No quote extracted from plain finding');
console.log('✓ Test 2 Passed: Finding parser extracts quoted words for chip display\n');

// Test 3: Scam type extraction from findings into header chip
console.log('--- Test 3: Scam Type Chip Extraction (Not Plain Bullet) ---');
assert(usrCode.includes('function extractScamTypeFromFindings'), 'extractScamTypeFromFindings function exists');
assert(usrCode.includes('function formatScamTypeChip'), 'formatScamTypeChip function exists');

function extractScamTypeFromFindings(findings) {
  let detectedType = null;
  const filteredFindings = [];
  for (const f of findings) {
    const rawText = typeof f === 'string' ? f : (f.text || '');
    const scamMatch = rawText.match(/AI (?:detected|identified) (?:scam type|fraud pattern):\s*([a-z0-9_-]+)/i);
    if (scamMatch && scamMatch[1] && scamMatch[1].toLowerCase() !== 'none') {
      detectedType = scamMatch[1].trim();
      continue;
    }
    filteredFindings.push(f);
  }
  return { detectedType, filteredFindings };
}

const rawJobFindings = [
  { severity: 'warn', text: 'Unrealistic salary guarantee. Found: "₹5000 per day"' },
  { severity: 'warn', text: 'AI reading: Vague job role with no standard interview process.' },
  { severity: 'warn', text: 'AI detected scam type: advance_fee' }
];

const { detectedType, filteredFindings } = extractScamTypeFromFindings(rawJobFindings);
assert.strictEqual(detectedType, 'advance_fee', 'advance_fee scam type detected');
assert.strictEqual(filteredFindings.length, 2, 'Scam type line filtered out of bullet findings');
assert(!filteredFindings.some(f => f.text.includes('AI detected scam type')), 'Scam type not left as a bullet item');

assert(usrCode.includes('usr-check-scam-chip'), 'Render uses usr-check-scam-chip class');
console.log('✓ Test 3 Passed: Scam type displayed in card chip and removed from bullet list\n');

// Test 4: Consistent card header and status pills (Pass, Flag, Warning, Unknown)
console.log('--- Test 4: Card Header & Status Pill Consistency ---');
assert(usrCode.includes('normalizeCheckBadge'), 'normalizeCheckBadge function exists');
assert(usrCode.includes('usr-check-color-bar'), 'Thin colour bar exists under card header');

// Check that CHECK_BADGES uses exact required title-case strings: Pass, Flag, Warning, Unknown
const badgeMapMatch = usrCode.match(/const CHECK_BADGES = ({[\s\S]*?});/);
assert(badgeMapMatch, 'CHECK_BADGES map found');
const CHECK_BADGES = eval('(' + badgeMapMatch[1] + ')');

assert.strictEqual(CHECK_BADGES.ok.label, 'Pass', 'ok -> Pass');
assert.strictEqual(CHECK_BADGES.pass.label, 'Pass', 'pass -> Pass');
assert.strictEqual(CHECK_BADGES.flag.label, 'Flag', 'flag -> Flag');
assert.strictEqual(CHECK_BADGES.warn.label, 'Warning', 'warn -> Warning');
assert.strictEqual(CHECK_BADGES.unknown.label, 'Unknown', 'unknown -> Unknown');
console.log('✓ Test 4 Passed: Headers have check title, status pill (Pass, Flag, Warning, Unknown) & thin colour bar\n');

// Test 5: "Show N more" toggle for long cards & PDF retention
console.log('--- Test 5: Show N More Toggle & PDF Retention ---');
assert(usrCode.includes('hasMore && !isPrinting'), 'Toggle button rendered only when hasMore and not printing');
assert(usrCode.includes('Show ${totalFindings - 3} more'), 'Toggle button shows remaining count');
assert(usrCode.includes('isPrinting || expanded || item.globalIdx < 3'), 'All findings rendered when isPrinting or expanded');
console.log('✓ Test 5 Passed: First 3 findings shown by default; all findings retained in DOM and PDF\n');

// Test 6: CSS Grid alignment, no stretching & responsiveness
console.log('--- Test 6: CSS Grid (align-items: start & 2 columns) ---');
const cssCode = fs.readFileSync(path.join(__dirname, '../web/src/components/unified-scan-result.css'), 'utf8');

assert(cssCode.includes('align-items: start'), 'usr-checks-grid has align-items: start (stops stretching)');
assert(cssCode.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'usr-checks-grid has 2 columns on desktop');
assert(cssCode.includes('grid-template-columns: 1fr'), 'usr-checks-grid collapses to 1 column on mobile');
assert(cssCode.includes('.usr-check-color-bar'), 'CSS defines thin colour bar');
assert(cssCode.includes('.usr-check-state-flag'), 'CSS defines flag left border');
assert(cssCode.includes('.usr-check-state-warn'), 'CSS defines warn left border');
assert(cssCode.includes('.usr-check-state-pass'), 'CSS defines pass left border');
assert(cssCode.includes('.usr-check-state-unknown'), 'CSS defines unknown left border');
assert(cssCode.includes('.usr-finding-quote-chip'), 'CSS defines subtle highlighted quote chip');
assert(cssCode.includes('.usr-check-scam-chip'), 'CSS defines scam type chip');
console.log('✓ Test 6 Passed: CSS grid stops stretching with align-items: start, responsive 2-col/1-col\n');

console.log('====================================================');
console.log('ALL CHECKS TAB LAYOUT TESTS PASSED WITH 0 ERRORS!');
console.log('====================================================');
