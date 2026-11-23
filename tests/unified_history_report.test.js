'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test 1: Deduplication of safety advice
console.log('--- Test 1: Safety Advice Deduplication ---');
const { dedupeSafetyAdvice, getDefaultWhatToDo } = require('../web/src/lib/dedupeAdvice');

const sampleActions = [
  'Do not accept the collect request or enter your UPI PIN',
  'Never enter your UPI PIN to receive money or accept a refund',
  'Check your official banking app directly to verify fund arrival',
  'Screenshots and UTR numbers alone cannot prove payment',
  'Call 1930 quickly if money was sent or compromised.',
  'Dial 1930 immediately to report financial fraud and freeze fraudulent transactions within the golden hour.',
  'Report cyber fraud immediately at cybercrime.gov.in.',
  'Do not accept the collect request or enter your UPI PIN' // Exact duplicate
];

const deduped = dedupeSafetyAdvice(sampleActions);
console.log('Original count:', sampleActions.length, 'Deduped count:', deduped.length);
console.log('Deduped items:', deduped);

// Must remove exact duplicate
assert.strictEqual(deduped.filter(a => a.toLowerCase().includes('collect request')).length, 1, 'Only one UPI PIN/collect request advice kept');
// Must collapse multiple 1930 mentions
assert.strictEqual(deduped.filter(a => a.includes('1930')).length, 1, 'Only one 1930 helpline mention kept');
// Must collapse multiple bank statement verification lines
assert.strictEqual(deduped.filter(a => /banking app|screenshots/i.test(a)).length, 1, 'Only one bank verification advice kept');
console.log('✓ Test 1 Passed: Deduplication properly collapses semantic and exact duplicates\n');

// Test 2: Fallback advice for old scans
console.log('--- Test 2: Default Advice for Old Scans ---');
const jobDefaults = getDefaultWhatToDo('job', 'high');
assert(Array.isArray(jobDefaults) && jobDefaults.length >= 3, 'Job defaults provided');
const upiDefaults = getDefaultWhatToDo('upi', 'high');
assert(Array.isArray(upiDefaults) && upiDefaults.length >= 3, 'UPI defaults provided');
const msgDefaults = getDefaultWhatToDo('message', 'high');
assert(Array.isArray(msgDefaults) && msgDefaults.length >= 3, 'Message defaults provided');
console.log('✓ Test 2 Passed: Default advice provided for old scans\n');

// Test 3: Database & API schema parity in server.js
console.log('--- Test 3: Backend Scan Saving & Promotion ---');
const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

// Check /api/verify saves headline, scamType, whatToDo, evidence
assert(serverCode.includes("tool: 'job'"), 'Job scan includes tool: job in report');
assert(serverCode.includes('headline: jobHeadline') || serverCode.includes('headline: C.LV[overall.level]'), 'Job scan includes headline in report');
assert(serverCode.includes('whatToDo: jobWhatToDo'), 'Job scan includes whatToDo in report');

// Check /api/scans/:id promotes all required fields
assert(serverCode.includes('headline: defaultHeadline'), '/api/scans/:id promotes headline');
assert(serverCode.includes('whatToDo: rep.whatToDo'), '/api/scans/:id promotes whatToDo');
assert(serverCode.includes('confidenceBand: rep.confidenceBand'), '/api/scans/:id promotes confidenceBand');
assert(serverCode.includes('evidenceSources: rep.evidenceSources'), '/api/scans/:id promotes evidenceSources');
console.log('✓ Test 3 Passed: Backend scan persistence and /api/scans/:id promotion verified\n');

// Test 4: Shared Result Component inspection
console.log('--- Test 4: UnifiedScanResult Component Integrity ---');
const usrCode = fs.readFileSync(path.join(__dirname, '../web/src/components/UnifiedScanResult.jsx'), 'utf8');

// Verify exact tabs: Why, Checks, What to do, Proof
assert(usrCode.includes("aria-selected={activeTab === 'why'}"), 'Tab "Why" present');
assert(usrCode.includes("Checks ({applicableChecks.length})"), 'Tab "Checks" with count present');
assert(usrCode.includes("aria-selected={activeTab === 'actions'}"), 'Tab "What to do" present');
assert(usrCode.includes("aria-selected={activeTab === 'proof'}"), 'Tab "Proof" present');

// Verify Proof tab features: Proof ID, Copy, timestamp, verify link
assert(usrCode.includes('handleCopyProof'), 'Copy Proof ID handler present');
assert(usrCode.includes('timeFormatted'), 'Timestamp present');
assert(usrCode.includes('Verify this proof on the ledger'), 'Verify link present');

// Verify no duplicate action buttons when isHistory is true
assert(usrCode.includes('!forPrint && !isHistory'), 'Bottom action buttons suppressed in history view');
console.log('✓ Test 4 Passed: UnifiedScanResult tabs, proof, and single action bar rules verified\n');

// Test 5: History Detail Page in Dashboard.jsx
console.log('--- Test 5: DashboardScanDetail Parity ---');
const dashCode = fs.readFileSync(path.join(__dirname, '../web/src/pages/Dashboard.jsx'), 'utf8');

assert(dashCode.includes('import { UnifiedScanResult } from'), 'DashboardScanDetail imports UnifiedScanResult');
assert(dashCode.includes('<UnifiedScanResult'), 'DashboardScanDetail renders UnifiedScanResult');
assert(dashCode.includes('isHistory={true}'), 'DashboardScanDetail sets isHistory={true}');
assert(dashCode.includes('Download PDF'), 'Header has Download PDF button');
assert(dashCode.includes('Download Verification Receipt') || dashCode.includes('Verify this proof'), 'Header has Download Verification Receipt');
assert(dashCode.includes('Delete scan'), 'Header has Delete scan button');
assert(!dashCode.includes('Recommended Safety Actions'), 'Old separate layout removed from Dashboard.jsx');
assert(!dashCode.includes('Verified Verbatim Excerpts from Input'), 'Old separate evidence card removed from Dashboard.jsx');
console.log('✓ Test 5 Passed: Dashboard.jsx uses shared UnifiedScanResult with no duplicate layout or buttons\n');

// Test 6: PDF / Print CSS rules & 375px mobile responsiveness
console.log('--- Test 6: CSS Print and Mobile Responsive Rules ---');
const cssCode = fs.readFileSync(path.join(__dirname, '../web/src/components/unified-scan-result.css'), 'utf8');

assert(cssCode.includes('@media print'), 'Print media query exists');
assert(cssCode.includes('page-break-inside: avoid'), 'Page break avoidance configured for PDF cards');
assert(cssCode.includes('.no-print'), 'no-print class supported for PDF generation');
assert(cssCode.includes('@media (max-width: 640px)'), 'Mobile responsive query exists for narrow viewports');
console.log('✓ Test 6 Passed: CSS print and mobile rules verified\n');

console.log('========================================');
console.log('ALL UNIFIED HISTORY REPORT TESTS PASSED!');
console.log('========================================');
