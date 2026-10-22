'use strict';
// Loads and validates every config file at startup. Stops with a clear message if anything is wrong.
const fs = require('fs');
const path = require('path');

const REQUIRED = {
  'samples.json': ['legit', 'scam'],
  'lists.json': ['freeMail','disposableMail','jobBoards','shorteners','badTlds','siteBuilders','chatAndFormHosts','secondLevelSuffixes','companySuffixWords','brandHints'],
  'rules.json': ['descriptionRules','shortDescriptionLength','shortDescriptionPenalty','goodSectionKeywords','goodSectionsMin','goodSectionsScoreCeiling','goodSectionsReduction','hiringWordsPattern','roleMailboxPattern','emailPattern','ipPattern','foundSnippetLength'],
  'scoring.json': ['levels','checkWeights','combine','url','company','recruiter','security','ai', 'verdicts', 'confidence'],
  'runtime.json': ['server','http','limits','evidence','diagnose', 'llm', 'ledger', 'proof', 'security', 'database']
};

function fail(msg) { console.error('\n[config] ' + msg + '\n'); process.exit(1); }
function deepFreeze(o) { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); }

const cfg = {};
for (const [file, keys] of Object.entries(REQUIRED)) {
  const full = path.join(__dirname, file);
  let data;
  try { data = JSON.parse(fs.readFileSync(full, 'utf8')); }
  catch (e) { fail('Cannot read or parse config/' + file + ': ' + e.message); }
  for (const k of keys) if (!(k in data)) fail('config/' + file + ' is missing the key "' + k + '"');
  
  if (file === 'runtime.json') {
    const db = data.database;
    if (!db) fail('config/runtime.json is missing the key "database"');
    if (!db.tables) fail('config/runtime.json is missing the key "database.tables"');
    if (!('scans' in db.tables)) fail('config/runtime.json is missing the key "database.tables.scans"');
    if (!('ledgerBlocks' in db.tables)) fail('config/runtime.json is missing the key "database.tables.ledgerBlocks"');
    if (!('profiles' in db.tables)) fail('config/runtime.json is missing the key "database.tables.profiles"');
    if (!db.retention) fail('config/runtime.json is missing the key "database.retention"');
    if (!('anonymousScanDays' in db.retention)) fail('config/runtime.json is missing the key "database.retention.anonymousScanDays"');
    if (!('saveScans' in db)) fail('config/runtime.json is missing the key "database.saveScans"');
    if (!('requiredAtStartup' in db)) fail('config/runtime.json is missing the key "database.requiredAtStartup"');
    const sec = data.security;
    if (!sec || !sec.verifyRateLimitSignedIn) fail('config/runtime.json is missing the key "security.verifyRateLimitSignedIn"');
  }
  
  cfg[file.replace('.json', '')] = data;
}
for (const [i, r] of cfg.rules.descriptionRules.entries()) {
  try { new RegExp(r.pattern, r.flags || ''); }
  catch (e) { fail('config/rules.json descriptionRules[' + i + '] (' + r.id + ') has an invalid pattern: ' + e.message); }
}
module.exports = deepFreeze(cfg);
