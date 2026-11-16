'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Extension Popup Security & UI tests...\n');

const htmlPath = path.join(__dirname, '../extension/popup.html');
const jsPath = path.join(__dirname, '../extension/popup.js');
const cssPath = path.join(__dirname, '../extension/popup.css');
const bgPath = path.join(__dirname, '../extension/src/background.js');
const contentPath = path.join(__dirname, '../extension/src/content.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const bg = fs.readFileSync(bgPath, 'utf8');
const content = fs.readFileSync(contentPath, 'utf8');

// 1. Show button completely removed
assert(!html.includes('toggle-key-vis'), 'Show button ID (toggle-key-vis) must be removed from popup.html');
assert(!html.includes('>Show<'), '"Show" button text must be removed from popup.html');
assert(!js.includes('toggle-key-vis'), 'toggle-key-vis references must be removed from popup.js');
console.log('PASS 1: "Show" button completely removed from popup');

// 2. Input type password, autocomplete off, no paste preview
assert(html.includes('type="password"'), 'Key input must be type="password"');
assert(html.includes('autocomplete="off"'), 'Key input must have autocomplete="off"');
assert(html.includes('spellcheck="false"'), 'Key input must have spellcheck="false"');
assert(html.includes('id="ext-key-input"'), 'Key input must have id="ext-key-input"');
console.log('PASS 2: Key input has type="password", autocomplete="off", spellcheck="false"');

// 3. Linked key row with last 4 characters, Replace key button, Remove button
assert(html.includes('id="linked-key-row"'), 'popup.html must have #linked-key-row');
assert(html.includes('id="linked-key-text"'), 'popup.html must have #linked-key-text');
assert(html.includes('id="replace-key-btn"'), 'popup.html must have #replace-key-btn');
assert(html.includes('id="remove-key-btn"'), 'popup.html must have #remove-key-btn');
assert(html.includes('Replace key'), 'popup.html must have "Replace key" button text');
assert(html.includes('Remove'), 'popup.html must have "Remove" button text');
console.log('PASS 3: Linked key row contains masked text, "Replace key" and "Remove" buttons');

// 4. Progress bar elements for Pro checks left
assert(html.includes('id="status-progress-wrap"'), 'popup.html must have #status-progress-wrap');
assert(html.includes('id="status-progress-track"'), 'popup.html must have #status-progress-track');
assert(html.includes('id="status-progress-fill"'), 'popup.html must have #status-progress-fill');
assert(html.includes('id="progress-remaining-text"'), 'popup.html must have #progress-remaining-text');
assert(html.includes('id="progress-percent-text"'), 'popup.html must have #progress-percent-text');
console.log('PASS 4: Status card includes progress bar elements for checks left');

// 5. Short line: "Keep your key private. Revoke it on the website if lost."
assert(
  html.includes('Keep your key private. Revoke it on the website if lost.'),
  'popup.html must include the line "Keep your key private. Revoke it on the website if lost."'
);
console.log('PASS 5: Required security advice line present');

// 6. Validate before saving via GET /api/usage
assert(js.includes('/api/usage'), 'popup.js must call /api/usage to validate keys');
assert(js.includes('Key not valid, generate a new one'), 'popup.js must handle 401 with "Key not valid, generate a new one"');
assert(js.includes('Extension is a Pro feature'), 'popup.js must handle non-pro accounts with Pro message');
console.log('PASS 6: popup.js validates key via /api/usage before saving to chrome.storage.local');

// 7. Handle revoked keys: delete saved key automatically and show "Key was revoked. Add a new key"
assert(js.includes('Key was revoked. Add a new key'), 'popup.js must show "Key was revoked. Add a new key" on 401');
assert(js.includes("chrome.storage.local.remove(['extensionKey'"), 'popup.js must delete saved key on 401');
assert(bg.includes("chrome.storage.local.remove(['extensionKey'"), 'background.js must delete saved key on 401');
assert(bg.includes('Key was revoked. Add a new key'), 'background.js must return "Key was revoked. Add a new key" on 401');
console.log('PASS 7: Revoked keys (401) trigger automatic key deletion and revoked notice');

// 8. Key never displayed again in DOM or console
assert(js.includes('Key linked ••••'), 'popup.js must display masked key with last 4 chars only');
assert(!js.includes('console.log(key'), 'popup.js must not log full key to console');
assert(!js.includes('console.log(rawVal'), 'popup.js must not log key value to console');
console.log('PASS 8: Full key is never displayed again, masked to last 4 chars only');

// 9. CSS styling and tokens
assert(css.includes('--bg: #05080F'), 'popup.css has dark theme --bg');
assert(css.includes('--surface: #0B1220'), 'popup.css has dark theme --surface');
assert(css.includes('.progress-bar-track'), 'popup.css styles .progress-bar-track');
assert(css.includes('.progress-bar-fill'), 'popup.css styles .progress-bar-fill');
assert(css.includes('.linked-key-card'), 'popup.css styles .linked-key-card');
console.log('PASS 9: popup.css defines dark theme tokens, progress bar, and linked key styling');

console.log('\nAll 9 popup security and UI tests passed successfully!');
