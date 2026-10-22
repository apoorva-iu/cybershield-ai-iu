const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

process.env.PORT = '4005';
process.env.LEDGER_FILE = path.join(__dirname, 'temp_ledger.json');

if (fs.existsSync(process.env.LEDGER_FILE)) fs.unlinkSync(process.env.LEDGER_FILE);

const originalCfg = require('../config');
const clone = JSON.parse(JSON.stringify(originalCfg));
require.cache[require.resolve('../config')].exports = clone;

// Start the server
const server = require('../server.js');

const L = require('../ledger.js');
const cfg = clone;

async function run() {
  const P = cfg.runtime.proof;

  // 1. Create a dummy report and block
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    input: { url: 'http://example.com/job', company: 'Test', recruiterEmail: 'test@example.com', descriptionSha256: null },
    checks: [
      { key: 'url', title: 'Job URL', state: 'ok', score: 0, findings: [] }
    ],
    overall: { level: 'low', score: 0, confidence: 100 },
    sources: []
  };

  const reportHash = L.sha(L.canon(report));
  let accessCode = '';
  for (let i = 0; i < P.accessCodeLength; i++) {
    accessCode += P.alphabet[crypto.randomInt(P.alphabet.length)];
  }
  const proofId = P.proofIdPrefix + reportHash.slice(0, P.proofIdHexLength).toUpperCase();

  const metaSection = { version: report.version, generatedAt: report.generatedAt, sources: report.sources };
  const sections = {
    input: L.sha(L.canon(report.input) + accessCode),
    overall: L.sha(L.canon(report.overall) + accessCode),
    meta: L.sha(L.canon(metaSection) + accessCode)
  };
  report.checks.forEach(c => {
    sections[c.key] = L.sha(L.canon(c) + accessCode);
  });
  
  const proofKey = L.sha(accessCode + reportHash);

  // Mine the block
  const blk = await L.append(reportHash, { level: report.overall.level }, proofKey, sections);

  const receipt = {
    format: P.receiptFormat,
    version: report.version,
    issuer: 'localhost',
    issuedAt: report.generatedAt,
    proofId,
    accessCode,
    block: blk.index,
    blockHash: blk.hash,
    report
  };

  const verifyApi = async (body) => {
    const res = await fetch('http://localhost:4005/api/proof/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  };

  let allPassed = true;
  const test = (name, cond) => {
    if (cond) {
      console.log(`PASS - ${name}`);
    } else {
      console.log(`FAIL - ${name}`);
      allPassed = false;
    }
  };

  // Case 1: correct receipt
  const res1 = await verifyApi({ receipt });
  test('Correct receipt gives "intact"', res1.status === 'intact' && res1.content && res1.content.status === 'verified');

  // Case 2: receipt with one changed finding
  const alteredReceipt = JSON.parse(JSON.stringify(receipt));
  alteredReceipt.report.checks[0].score = 100;
  const res2 = await verifyApi({ receipt: alteredReceipt });
  test('Altered report gives "report_modified" and names section', res2.status === 'report_modified' && res2.content && res2.content.changedSections && res2.content.changedSections.includes('url'));

  // Case 3: wrong access code
  const wrongCodeReceipt = JSON.parse(JSON.stringify(receipt));
  wrongCodeReceipt.accessCode = 'WRONGCODE123';
  const res3 = await verifyApi({ receipt: wrongCodeReceipt });
  test('Wrong access code gives "not_found"', res3.status === 'not_found');

  // New Case: ID+hash intact
  const resHashIntact = await verifyApi({ proofId, hash: blk.hash });
  test('ID+hash intact', resHashIntact.status === 'intact' && resHashIntact.steps && resHashIntact.steps.find(s => s.id === 'b').passed);

  // New Case: wrong hash gives hash_mismatch
  const resHashWrong = await verifyApi({ proofId, hash: 'badhash' });
  test('Wrong hash gives hash_mismatch with steps passed', resHashWrong.status === 'hash_mismatch' && resHashWrong.summary.includes('does not match') && resHashWrong.steps.find(s => s.id === 'c').passed && resHashWrong.steps.find(s => s.id === 'h').passed);

  // Case 5: Feed API tests
  // First, append another block to test sorting and paging
  const report2 = { ...report, input: { ...report.input, url: 'http://example2.com' } };
  const hash2 = L.sha(L.canon(report2));
  await L.append(hash2, { level: 'high' }, L.sha('abc' + hash2), { input: 'hash2' });
  
  const report3 = { ...report, input: { ...report.input, url: 'http://example3.com' } };
  const hash3 = L.sha(L.canon(report3));
  await L.append(hash3, { level: 'medium' }, L.sha('def' + hash3), { input: 'hash3' });

  const fetchFeed = async (query = '') => {
    const res = await fetch('http://localhost:4005/api/ledger/recent' + query);
    return await res.json();
  };

  const disabledFeed = await fetchFeed();
  test('Disabled feed returns empty list and enabled:false', disabledFeed.enabled === false && disabledFeed.items.length === 0 && !disabledFeed.totalBlocks);

  // Enable it in memory
  cfg.runtime.proof.feed.enabled = true;

  const feed1 = await fetchFeed('?limit=2');
  const items = feed1.items;
  
  test('Feed items come newest first', items.length === 2 && items[0].block > items[1].block);
  test('Feed contains no forbidden fields and only allowed fields', Object.keys(items[0]).length === 4 && Object.keys(items[0]).every(k => ['proofId', 'block', 'timestamp', 'blockHash'].includes(k)));

  const feed2 = await fetchFeed('?limit=2&before=' + feed1.nextBefore);
  const items2 = feed2.items;
  test('Feed paging works', items2.length > 0 && items2[0].block < items[1].block);

  // Case 4: manually edited block in the ledger file
  let ledgerData = fs.readFileSync(process.env.LEDGER_FILE, 'utf8');
  ledgerData = ledgerData.replace(/"nonce":\s*\d+/, '"nonce": 999999999');
  fs.writeFileSync(process.env.LEDGER_FILE, ledgerData);

  const res4 = await verifyApi({ receipt });
  test('Manually edited block gives "ledger_altered"', res4.status === 'ledger_altered' && res4.summary.includes('block') && res4.summary.includes('its stored hash does not match its contents'));

  // Clean up
  fs.unlinkSync(process.env.LEDGER_FILE);
  server.close(() => {
    process.exitCode = allPassed ? 0 : 1;
  });
}

setTimeout(run, 1000);
