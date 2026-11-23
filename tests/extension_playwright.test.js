'use strict';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_key';
process.env.npm_lifecycle_event = 'test';

const assert = require('assert');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

function parseZipEntries(buffer) {
  const entries = [];
  let idx = 0;
  while (idx < buffer.length - 4) {
    if (buffer.readUInt32LE(idx) === 0x04034b50) { // Local file header
      const nameLen = buffer.readUInt16LE(idx + 26);
      const extraLen = buffer.readUInt16LE(idx + 28);
      const name = buffer.toString('utf8', idx + 30, idx + 30 + nameLen);
      entries.push(name);
      idx += 30 + nameLen + extraLen;
    } else {
      idx++;
    }
  }
  return entries;
}

function getChromiumPath() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1208', 'chrome-win64', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1117', 'chrome-win', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

async function run() {
  console.log('--- STARTING EXTENSION PLAYWRIGHT & RENDER VERIFICATION SUITE ---\n');

  // =========================================================================
  // TEST 1: Extension Zip packaging with PUBLIC_URL (Render environment)
  // =========================================================================
  console.log('[TEST 1] Packaging extension in Render environment (PUBLIC_URL)...');
  const renderPublicUrl = 'https://cybershield-ai-iu.onrender.com';
  execSync(`node scripts/zip-extension.js`, {
    env: { ...process.env, PUBLIC_URL: renderPublicUrl },
    stdio: 'pipe'
  });

  const zipPath = path.resolve('private/cyber-shield-extension.zip');
  assert.ok(fs.existsSync(zipPath), 'cyber-shield-extension.zip must exist in private/');

  const zipBuf = fs.readFileSync(zipPath);
  assert.strictEqual(zipBuf.readUInt32LE(0), 0x04034b50, 'File magic bytes must match ZIP');

  const zipEntries = parseZipEntries(zipBuf);
  assert.ok(zipEntries.includes('manifest.json'), 'Zip must contain manifest.json at root level');
  assert.ok(zipEntries.includes('dist/background.js'), 'Zip must contain dist/background.js');
  assert.ok(zipEntries.includes('dist/content.js'), 'Zip must contain dist/content.js');
  assert.ok(zipEntries.includes('popup.html'), 'Zip must contain popup.html at root level');
  assert.ok(zipEntries.includes('config.js'), 'Zip must contain config.js at root level');
  assert.ok(!zipEntries.some(e => e.startsWith('cyber-shield-extension/manifest.json')), 'manifest.json must NOT be nested');

  // Verify manifest host permissions in extension/dist
  const distManifest = JSON.parse(fs.readFileSync(path.resolve('extension/dist/manifest.json'), 'utf8'));
  assert.ok(
    distManifest.host_permissions.includes('https://cybershield-ai-iu.onrender.com/*'),
    'Manifest must include Render host permission'
  );
  assert.ok(
    distManifest.host_permissions.includes('http://localhost:3000/*'),
    'Manifest must include localhost host permission'
  );
  console.log('✓ Test 1 passed: Extension zip built for Render with manifest.json at root.\n');

  // =========================================================================
  // TEST 2: Download route security & Pro gating with mock server
  // =========================================================================
  console.log('[TEST 2] Verifying download route authentication, Pro gate and folder security...');
  const proUserId = '11111111-1111-4111-8111-111111111111';
  const freeUserId = '22222222-2222-4222-8222-222222222222';
  const usersByToken = {
    'jwt-pro': { id: proUserId, email: 'pro@test.com' },
    'jwt-free': { id: freeUserId, email: 'free@test.com' }
  };
  const stores = {
    user_plans: [
      { user_id: proUserId, plan: 'pro', started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() },
      { user_id: freeUserId, plan: 'free', started_at: null, expires_at: null }
    ]
  };

  const DB = require('../db');
  DB.setClient({
    auth: {
      async getUser(token) {
        const u = usersByToken[token];
        return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'Invalid token' } };
      }
    },
    from: (table) => ({
      select: () => ({
        eq: (col, val) => ({
          limit: () => ({
            maybeSingle: async () => {
              const row = (stores[table] || []).find(r => r[col] === val);
              return { data: row || null, error: null };
            }
          })
        })
      })
    })
  });

  const appPort = await findFreePort();
  process.env.PORT = String(appPort);
  const appServer = require('../server');
  await new Promise(r => setTimeout(r, 600));
  const serverBaseUrl = `http://127.0.0.1:${appPort}`;

  // Unauth -> 401
  const unauthRes = await fetch(`${serverBaseUrl}/api/extension/download`);
  assert.strictEqual(unauthRes.status, 401, 'Signed-out user must receive 401');

  // Free -> 403 pro_required
  const freeRes = await fetch(`${serverBaseUrl}/api/extension/download`, {
    headers: { Authorization: 'Bearer jwt-free' }
  });
  assert.strictEqual(freeRes.status, 403, 'Free user must receive 403');
  const freeData = await freeRes.json();
  assert.strictEqual(freeData.error, 'pro_required');

  // Pro -> 200 with zip
  const proRes = await fetch(`${serverBaseUrl}/api/extension/download`, {
    headers: { Authorization: 'Bearer jwt-pro' }
  });
  assert.strictEqual(proRes.status, 200, 'Pro user must receive 200 OK');
  assert.strictEqual(proRes.headers.get('content-type'), 'application/zip');
  assert.strictEqual(proRes.headers.get('content-disposition'), 'attachment; filename="cyber-shield-extension.zip"');

  // Static access to private folder is blocked -> 404
  const staticRes = await fetch(`${serverBaseUrl}/private/cyber-shield-extension.zip`);
  assert.strictEqual(staticRes.status, 404, 'Direct static access to private folder must return 404');
  console.log('✓ Test 2 passed: Download route correctly gates Pro users and blocks folder exposure.\n');

  // =========================================================================
  // TEST 3: Chromium E2E (Playwright) - Selection Chip & Scanning
  // =========================================================================
  console.log('[TEST 3] Running Playwright Chromium tests with Cyber Shield extension loaded...');

  let checkApiInvoked = false;
  let receivedAuth = null;
  let receivedCheckPayload = null;

  // Local test server for web page and backend mock
  const testServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/api/message/check' && req.method === 'POST') {
      checkApiInvoked = true;
      receivedAuth = req.headers['authorization'];
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try { receivedCheckPayload = JSON.parse(body); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          level: 'medium',
          score: 68,
          confidence: 'high',
          headline: ['Suspicious Payment Request', 'This message asks for advance payments.'],
          scamSignals: { status: 'some' },
          primaryConcern: 'Advance fee scam detected'
        }));
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Cyber Shield Content Test Page</title></head>
        <body>
          <h1>Cyber Shield Verification Page</h1>
          <p id="short-text">Hi.</p>
          <p id="target-text">We are offering you an exclusive Work-from-Home position with weekly salary of 45,000 INR. Send registration fee to activate.</p>
        </body>
      </html>
    `);
  });

  await new Promise(r => testServer.listen(0, '0.0.0.0', r));
  const testPort = testServer.address().port;

  // Prepare unpacked extension in isolated temporary directory
  const extDistPath = path.resolve('extension/dist');
  const tempExtDir = path.join(process.env.TEMP, 'pw_ext_' + Date.now());
  fs.cpSync(extDistPath, tempExtDir, { recursive: true });

  // Point API_BASE in bundled background & content to 127.0.0.1:testPort
  for (const js of ['background.js', 'content.js']) {
    const f = path.join(tempExtDir, js);
    if (fs.existsSync(f)) {
      let code = fs.readFileSync(f, 'utf8');
      code = code.replace(/https:\/\/cybershield-ai-iu\.onrender\.com/g, `http://127.0.0.1:${testPort}`);
      code = code.replace(/http:\/\/localhost:3000/g, `http://127.0.0.1:${testPort}`);
      fs.writeFileSync(f, code, 'utf8');
    }
  }

  // Update manifest host_permissions to allow testPort
  const tempManifest = path.join(tempExtDir, 'manifest.json');
  const mObj = JSON.parse(fs.readFileSync(tempManifest, 'utf8'));
  mObj.host_permissions = [`http://127.0.0.1:${testPort}/*`];
  fs.writeFileSync(tempManifest, JSON.stringify(mObj, null, 2), 'utf8');

  const userDataDir = path.join(process.env.TEMP, 'pw_user_' + Date.now());
  fs.mkdirSync(userDataDir, { recursive: true });

  const chromiumExecutable = getChromiumPath();
  assert.ok(chromiumExecutable, 'Chromium or Chrome executable must exist');

  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    executablePath: chromiumExecutable,
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${tempExtDir}`,
      `--load-extension=${tempExtDir}`
    ]
  });

  try {
    const page = await browserContext.newPage();
    // Navigate to localhost:testPort so page origin (localhost) != API_BASE (127.0.0.1)
    await page.goto(`http://localhost:${testPort}/`);
    await new Promise(r => setTimeout(r, 1000));

    // Verify shadow DOM host exists
    const hostExists = await page.evaluate(() => !!document.getElementById('cybershield-extension-host'));
    assert.ok(hostExists, 'Content script must inject #cybershield-extension-host');

    // 3A: Short selection (< 10 chars) -> Chip should NOT appear
    await page.evaluate(() => {
      const el = document.getElementById('short-text');
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 100, clientY: 50 }));
    });
    await new Promise(r => setTimeout(r, 150));

    const shortChip = await page.evaluate(() => {
      const host = document.getElementById('cybershield-extension-host');
      return host.shadowRoot.querySelector('.cs-chip');
    });
    assert.strictEqual(shortChip, null, 'Chip must not appear for selections shorter than 10 characters');
    console.log('  ✓ 3A: Selection < 10 characters does not trigger chip.');

    // 3B: Normal selection (>= 10 chars) -> Chip appears
    await page.evaluate(() => {
      const el = document.getElementById('target-text');
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 250, clientY: 100 }));
    });
    await new Promise(r => setTimeout(r, 200));

    const chipData = await page.evaluate(() => {
      const host = document.getElementById('cybershield-extension-host');
      const chip = host.shadowRoot.querySelector('.cs-chip');
      if (!chip) return null;
      return {
        text: chip.textContent.trim(),
        visible: window.getComputedStyle(chip).display !== 'none'
      };
    });
    assert.ok(chipData, 'Chip element must be present in shadow DOM');
    assert.strictEqual(chipData.visible, true, 'Chip element must be visible');
    assert.ok(chipData.text.includes('Check this'), 'Chip must display "Check this" label');
    console.log('  ✓ 3B: Selection >= 10 characters renders visible Cyber Shield chip.');

    // 3C: Click chip without key -> Bubble opens, Check click shows "Add your key in the extension popup"
    await page.evaluate(() => {
      const host = document.getElementById('cybershield-extension-host');
      const chip = host.shadowRoot.querySelector('.cs-chip');
      chip.click();
    });
    await new Promise(r => setTimeout(r, 200));

    const bubbleOpen = await page.evaluate(() => {
      const host = document.getElementById('cybershield-extension-host');
      return !!host.shadowRoot.querySelector('.cs-bubble');
    });
    assert.ok(bubbleOpen, 'Clicking chip must open verdict/ready bubble dialog');

    await page.evaluate(() => {
      const host = document.getElementById('cybershield-extension-host');
      const checkBtn = host.shadowRoot.querySelector('#cs-btn-check');
      checkBtn.click();
    });

    await page.waitForFunction(() => {
      const host = document.getElementById('cybershield-extension-host');
      const errBox = host && host.shadowRoot && host.shadowRoot.querySelector('.cs-err-box');
      return errBox && errBox.textContent.trim().length > 0;
    }, { timeout: 6000 });

    const missingKeyError = await page.evaluate(() => {
      const host = document.getElementById('cybershield-extension-host');
      const errBox = host.shadowRoot.querySelector('.cs-err-box');
      return errBox ? errBox.textContent.trim() : null;
    });
    assert.strictEqual(
      missingKeyError,
      'Add your key in the extension popup',
      'Without key, bubble must prompt "Add your key in the extension popup"'
    );
    console.log('  ✓ 3C: Unkeyed check displays "Add your key in the extension popup".');

    // 3D: Link valid Pro key and run check -> API called with Bearer and verdict rendered
    const client = await browserContext.newCDPSession(page);
    const targets = await client.send('Target.getTargets');
    const extTarget = targets.targetInfos.find(t => t.url.startsWith('chrome-extension://'));
    assert.ok(extTarget, 'Cyber Shield extension target must be loaded in Chromium');
    const extId = new URL(extTarget.url).hostname;

    // Set valid Pro key in extension storage via popup page
    const popupPage = await browserContext.newPage();
    await popupPage.goto(`chrome-extension://${extId}/popup.html`);
    await popupPage.evaluate((testKey) => {
      return new Promise(resolve => {
        chrome.storage.local.set({ extensionKey: testKey, enabled: true }, resolve);
      });
    }, 'CS-PLAYWRIGHT-TEST-KEY-999');
    await popupPage.close();

    // Re-select text to open fresh bubble
    await page.evaluate(() => {
      const el = document.getElementById('target-text');
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 250, clientY: 100 }));
    });
    await new Promise(r => setTimeout(r, 200));

    // Click chip
    await page.evaluate(() => {
      const host = document.getElementById('cybershield-extension-host');
      const chip = host.shadowRoot.querySelector('.cs-chip');
      chip.click();
    });
    await new Promise(r => setTimeout(r, 200));

    // Click Check button
    await page.evaluate(() => {
      const host = document.getElementById('cybershield-extension-host');
      const checkBtn = host.shadowRoot.querySelector('#cs-btn-check');
      checkBtn.click();
    });

    // Wait for verdict
    await page.waitForFunction(() => {
      const host = document.getElementById('cybershield-extension-host');
      const pill = host && host.shadowRoot && host.shadowRoot.querySelector('.cs-level-pill');
      return pill && pill.textContent.trim().length > 0;
    }, { timeout: 6000 });

    const verdictResult = await page.evaluate(() => {
      const host = document.getElementById('cybershield-extension-host');
      const pill = host.shadowRoot.querySelector('.cs-level-pill');
      const headline = host.shadowRoot.querySelector('.cs-headline-title');
      return {
        level: pill ? pill.textContent.trim() : null,
        headline: headline ? headline.textContent.trim() : null
      };
    });

    assert.ok(checkApiInvoked, 'Backend check API must be invoked');
    assert.strictEqual(
      receivedAuth,
      'Bearer CS-PLAYWRIGHT-TEST-KEY-999',
      'Extension must pass extensionKey as Bearer token'
    );
    assert.strictEqual(verdictResult.level, 'Medium risk', 'Verdict badge must display "Medium risk"');
    assert.strictEqual(
      verdictResult.headline,
      'Suspicious Payment Request',
      'Verdict title must display API headline'
    );
    console.log('  ✓ 3D: Check with valid key passes Bearer token and renders verdict correctly.\n');

  } finally {
    await browserContext.close();
    testServer.close();
    appServer.close();
    try { fs.rmSync(tempExtDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }

  // =========================================================================
  // TEST 4: Wording checks (No "Brave", correct button & subtexts)
  // =========================================================================
  console.log('[TEST 4] Verifying wording across website pages and configs...');
  const filesToCheck = [
    path.resolve('web/src/pages/Extension.jsx'),
    path.resolve('web/src/pages/Dashboard.jsx'),
    path.resolve('web/src/pages/Home.jsx'),
    path.resolve('web/src/config/plans.js'),
    path.resolve('extension/README.md')
  ];

  for (const f of filesToCheck) {
    const text = fs.readFileSync(f, 'utf8');
    assert.ok(!text.includes('Brave'), `${path.basename(f)} must not contain "Brave"`);
  }

  const extPage = fs.readFileSync(path.resolve('web/src/pages/Extension.jsx'), 'utf8');
  assert.ok(
    extPage.includes('Download for Chrome and Edge'),
    'Extension page button must be "Download for Chrome and Edge"'
  );
  assert.ok(
    extPage.includes('Works in Chrome and Edge on Windows, macOS and Linux.'),
    'Extension page must state "Works in Chrome and Edge on Windows, macOS and Linux."'
  );
  console.log('✓ Test 4 passed: Wording verified with no references to Brave and exact tested browser copy.\n');

  console.log('=========================================================================');
  console.log('ALL EXTENSION DOWNLOAD, SCANNING & PLAYWRIGHT TESTS PASSED SUCCESSFULLY!');
  console.log('=========================================================================');
}

run().catch(err => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
