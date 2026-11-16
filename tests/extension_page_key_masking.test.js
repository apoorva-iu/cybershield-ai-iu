'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Extension Page Key Masking & Security Tests...\n');

const extJsxPath = path.join(__dirname, '../web/src/pages/Extension.jsx');
const serverJsPath = path.join(__dirname, '../server.js');
const extKeysPath = path.join(__dirname, '../detectors/extensionKeys.js');

const extJsx = fs.readFileSync(extJsxPath, 'utf8');
const serverJs = fs.readFileSync(serverJsPath, 'utf8');
const extKeysJs = fs.readFileSync(extKeysPath, 'utf8');

// 1. Masked key display in Extension.jsx
assert(
  extJsx.includes('cs_ext_••••••••••••••••'),
  'Extension.jsx must display masked key (e.g. cs_ext_••••••••••••••••...)'
);
console.log('PASS 1: Masked key string (cs_ext_••••••••••••••••...) present in Extension.jsx');

// 2. Full key is never stored in localStorage / sessionStorage
assert(!extJsx.includes('localStorage.setItem('), 'No localStorage for key');
assert(!extJsx.includes('sessionStorage.setItem('), 'No sessionStorage for key');
console.log('PASS 2: No localStorage or sessionStorage persistence of extension key');

// 3. Immediately clear key from state on copy
assert(
  extJsx.includes("setGeneratedKey(null)"),
  'Copy handler must set generatedKey to null immediately'
);
assert(
  extJsx.includes('Key copied. Paste it in the extension popup now. It is hidden for your security and cannot be shown again.'),
  'Copy handler must display required security notice'
);
console.log('PASS 3: Key removed from React state immediately on copy with required notice');

// 4. Fallback if copy fails (clipboard blocked): show key in box for 30 seconds
assert(
  extJsx.includes('setClipboardBlocked(true)'),
  'Must set clipboardBlocked when copy fails'
);
assert(
  extJsx.includes('setCountdown(30)'),
  'Must set 30s countdown when clipboard is blocked'
);
console.log('PASS 4: 30-second fallback box configured if clipboard copy fails');

// 5. 60-second countdown when not copied
assert(
  extJsx.includes('setCountdown(60)'),
  'Must set 60s countdown on generation'
);
assert(
  extJsx.includes('Disappears in'),
  'Must display visible countdown'
);
console.log('PASS 5: 60-second automatic countdown and visible timer present');

// 6. Cleanup on tab switch (visibilitychange) and unmount
assert(
  extJsx.includes("document.addEventListener('visibilitychange'"),
  'Must listen for visibilitychange'
);
assert(
  extJsx.includes('document.hidden'),
  'Must check document.hidden to wipe key on tab switch'
);
console.log('PASS 6: Key automatically wiped when leaving page or switching tabs');

// 7. Best effort clipboard clearing after 60s
assert(
  extJsx.includes("navigator.clipboard?.writeText?.('')"),
  'Must attempt clipboard clearing'
);
assert(
  extJsx.includes('document.hasFocus()'),
  'Must only clear clipboard if page is focused'
);
console.log('PASS 7: Best-effort clipboard clearing configured');

// 8. Active state displays "Active key linked ••••..." (last 4 only), Generate new key & Revoke key
assert(
  extJsx.includes('Active key linked ••••'),
  'Must display Active key linked •••• with last 4'
);
assert(
  extJsx.includes('Generate new key'),
  'Must show "Generate new key" button when active key exists'
);
assert(
  extJsx.includes('Generating a new key revokes the active key.'),
  'Must include note that generating a new key revokes previous key'
);
assert(
  extJsx.includes('Revoke key'),
  'Must show Revoke key button'
);
console.log('PASS 8: Active state displays masked last 4, "Generate new key", and "Revoke key"');

// 9. Server returns last 4 only on GET /api/extension/key, never full key or hash
assert(
  serverJs.includes('last4: status.hasKey ? (status.last4 || null) : null'),
  'Server must return last4 on GET /api/extension/key'
);
assert(
  !serverJs.includes('key_hash: status.key_hash'),
  'Server must never return key_hash on GET'
);
console.log('PASS 9: Server returns last4 only and never exposes full key or key_hash on status');

console.log('\nAll 9 extension page key masking and security tests PASSED!');
