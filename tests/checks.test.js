const path = require('path');
const fs = require('fs');
const cp = require('child_process');

process.env.LEDGER_FILE = path.join(__dirname, 'temp_ledger.json');

const originalCfg = require('../config');
const C = require('../checks.js');

let allPassed = true;
const test = (name, cond) => {
  if (cond) {
    console.log(`PASS - ${name}`);
  } else {
    console.log(`FAIL - ${name}`);
    allPassed = false;
  }
};

// Case (a): obvious scam
const inpScam = {
  url: 'http://fake-job-scam-offer.xyz/apply',
  company: 'Global Tech',
  email: 'recruiter@gmail.com',
  desc: 'Please pay a $500 fee for equipment. Contact us on WhatsApp to proceed.'
};
const evScam = {
  rdap: { checked: true, createdAt: new Date(Date.now() - 5 * 864e5).toISOString(), registrar: 'Fake' },
  urlhaus: { checked: true, listed: true, threat: 'malware' },
  virustotal: { checked: true, malicious: 5, suspicious: 0, harmless: 0 },
  places: { checked: true, found: false },
  wikidata: { checked: true, found: false }
};

const checksScam = [
  C.checkUrl(inpScam),
  C.checkDesc(inpScam),
  C.checkCompany(inpScam, evScam),
  C.checkRecruiter(inpScam),
  C.checkSecurity(inpScam, evScam)
];
const overallScam = C.combine(checksScam);
test('obvious scam gives "high"', overallScam.level === 'high');

// Case (b): real company
const inpReal = {
  url: 'https://careers.google.com/jobs',
  company: 'Google',
  email: 'recruiter@google.com',
  desc: 'Responsibilities include software engineering. Requirements: 5 years experience. About the role: Full time.'
};
const evReal = {
  rdap: { checked: true, createdAt: new Date(Date.now() - 3650 * 864e5).toISOString(), registrar: 'MarkMonitor' },
  urlhaus: { checked: true, listed: false },
  virustotal: { checked: true, malicious: 0, suspicious: 0, harmless: 90 },
  places: { checked: true, found: true, name: 'Google', website: 'https://google.com/', reviews: 1000 },
  wikidata: { checked: true, found: false }
};
const checksReal = [
  C.checkUrl(inpReal),
  C.checkDesc(inpReal),
  C.checkCompany(inpReal, evReal),
  C.checkRecruiter(inpReal),
  C.checkSecurity(inpReal, evReal)
];
const overallReal = C.combine(checksReal);
test('real company with mock evidence gives "low"', overallReal.level === 'low');

// Case (c): description-only scam
const inpDescOnly = {
  url: '',
  company: '',
  email: '',
  desc: 'Guaranteed a job placement. Just pay a small fee today.'
};
const evNone = {};
const checksDescOnly = [
  C.checkUrl(inpDescOnly),
  C.checkDesc(inpDescOnly),
  C.checkCompany(inpDescOnly, evNone),
  C.checkRecruiter(inpDescOnly),
  C.checkSecurity(inpDescOnly, evNone)
];
const overallDescOnly = C.combine(checksDescOnly);
test('description-only scam with a strong rule match is not "unknown"', overallDescOnly.level !== 'unknown');

// Case (d): malformed Places website does not throw
let didThrow = false;
try {
  C.checkCompany(inpReal, {
    places: { checked: true, found: true, website: 'not-a-valid-url:::///what' }
  });
} catch (e) {
  didThrow = true;
}
test('malformed Places website does not throw', !didThrow);

// Case (f): confidence calculation with expected sources
const checksAll = [
  { key: 'url', score: 10 },
  { key: 'desc', score: 20 },
  { key: 'company', score: 15 },
  { key: 'recruiter', score: 10 },
  { key: 'security', score: 15 }
];
const baseComb = C.combine(checksAll);
const baseConf = baseComb.confidence;

const allAnswered = C.combine(checksAll, { sourcesAnswered: 5, sourcesExpected: 5 });
test('all sources answered keeps the confidence unchanged', allAnswered.confidence === baseConf);

const aiFailed = C.combine(checksAll, { sourcesAnswered: 4, sourcesExpected: 5 });
test('the AI failing lowers it', aiFailed.confidence < baseConf);

const noneAnswered = C.combine(checksAll, { sourcesAnswered: 0, sourcesExpected: 5 });
test('no sources answering gives a low value', noneAnswered.confidence < aiFailed.confidence && noneAnswered.confidence === Math.round(baseConf * 0.5));

// Case (e): config/index.js stops with a message naming the missing file or key
const tmpDir = path.join(__dirname, '..', 'config_tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

const configFiles = fs.readdirSync(path.join(__dirname, '..', 'config')).filter(f => f.endsWith('.json'));
for (const f of configFiles) {
  fs.copyFileSync(path.join(__dirname, '..', 'config', f), path.join(tmpDir, f));
}
// Modify one file
const rPath = path.join(tmpDir, 'runtime.json');
const rt = JSON.parse(fs.readFileSync(rPath, 'utf8'));
delete rt.server;
fs.writeFileSync(rPath, JSON.stringify(rt));

// We need a custom runner for index.js pointing to tmpDir
const runner = `
  const fs = require('fs');
  const path = require('path');
  const originalJoin = path.join;
  path.join = function(...args) {
    if (args.length > 0 && typeof args[0] === 'string' && args[0].endsWith('config')) {
      args[0] = path.join(__dirname, '..', 'config_tmp');
    }
    return originalJoin.apply(path, args);
  };
  require('../config/index.js');
`;
const runnerPath = path.join(__dirname, 'run_config.js');
fs.writeFileSync(runnerPath, runner);

try {
  const out = cp.execSync('node "' + runnerPath + '"', { stdio: 'pipe', encoding: 'utf8' });
  test('config/index.js stops with a message when required key removed', false);
} catch (e) {
  const stderr = e.stderr || '';
  console.log('STDERR is:', stderr);
  test('config/index.js stops with a message when required key removed', stderr.includes('missing the key "server"'));
}

fs.unlinkSync(runnerPath);
fs.rmSync(tmpDir, { recursive: true, force: true });

process.exit(allPassed ? 0 : 1);
