'use strict';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_key';
process.env.npm_lifecycle_event = 'test';

const assert = require('assert');
const net = require('net');
const path = require('path');
const fs = require('fs');

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
  // Simple zip reader for test verification
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

async function run() {
  console.log('Running Extension Download integration tests...\n');

  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.LEDGER_FILE = path.join(__dirname, 'temp_ledger_dl_test.json');
  if (fs.existsSync(process.env.LEDGER_FILE)) {
    try { fs.unlinkSync(process.env.LEDGER_FILE); } catch {}
  }

  const proUserId = '11111111-1111-4111-8111-111111111111';
  const freeUserId = '22222222-2222-4222-8222-222222222222';
  const usersByToken = {
    'jwt-pro-user': {
      id: proUserId,
      email: 'pro@example.com',
      user_metadata: { display_name: 'Pro User' },
      created_at: '2026-01-01T00:00:00.000Z'
    },
    'jwt-free-user': {
      id: freeUserId,
      email: 'free@example.com',
      user_metadata: { display_name: 'Free User' },
      created_at: '2026-01-01T00:00:00.000Z'
    }
  };

  const stores = {
    user_plans: [
      { user_id: proUserId, plan: 'pro', started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() },
      { user_id: freeUserId, plan: 'free', started_at: null, expires_at: null }
    ]
  };

  const DB = require('../db');
  const fakeClient = {
    auth: {
      async getUser(token) {
        const u = usersByToken[token];
        if (!u) return { data: { user: null }, error: { message: 'Invalid token' } };
        return { data: { user: u }, error: null };
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
  };
  DB.setClient(fakeClient);

  const server = require('../server');
  const baseUrl = `http://127.0.0.1:${port}`;
  await new Promise(r => setTimeout(r, 1000));

  let passedCount = 0;

  try {
    // 1. Signed-out user returns 401
    const unauthRes = await fetch(`${baseUrl}/api/extension/download`);
    assert.strictEqual(unauthRes.status, 401, 'Signed-out user should receive 401');
    const unauthData = await unauthRes.json();
    assert.strictEqual(unauthData.error, 'Authentication required');
    console.log('PASS - Signed-out user receives 401 Authentication required');
    passedCount++;

    // 2. Free user returns 403 pro_required
    const freeRes = await fetch(`${baseUrl}/api/extension/download`, {
      headers: { Authorization: 'Bearer jwt-free-user' }
    });
    assert.strictEqual(freeRes.status, 403, 'Free user should receive 403');
    const freeData = await freeRes.json();
    assert.strictEqual(freeData.error, 'pro_required');
    console.log('PASS - Free user receives 403 pro_required');
    passedCount++;

    // 3. Pro user receives HTTP 200 with zip stream
    const proRes = await fetch(`${baseUrl}/api/extension/download`, {
      headers: { Authorization: 'Bearer jwt-pro-user' }
    });
    assert.strictEqual(proRes.status, 200, 'Pro user should receive 200 OK');
    assert.strictEqual(proRes.headers.get('content-type'), 'application/zip');
    assert.strictEqual(
      proRes.headers.get('content-disposition'),
      'attachment; filename="cyber-shield-extension.zip"'
    );

    const arrayBuffer = await proRes.arrayBuffer();
    const zipBuf = Buffer.from(arrayBuffer);
    assert.ok(zipBuf.length > 10000, 'Zip file should be non-empty');
    assert.strictEqual(zipBuf.readUInt32LE(0), 0x04034b50, 'File magic bytes should match ZIP');

    const entries = parseZipEntries(zipBuf);
    assert.ok(entries.includes('manifest.json'), 'manifest.json must be at top level of zip');
    assert.ok(!entries.some(e => e.startsWith('cyber-shield-extension/manifest.json')), 'manifest.json must NOT be nested under cyber-shield-extension/');
    assert.ok(entries.includes('popup.html'), 'popup.html must be at top level of zip');
    assert.ok(entries.includes('config.js'), 'config.js must be at top level of zip');
    console.log(`PASS - Pro user downloads zip with manifest.json at top level (${entries.length} entries verified)`);
    passedCount++;

    // 4. Static access to private/ folder is blocked
    const staticRes = await fetch(`${baseUrl}/private/cyber-shield-extension.zip`);
    assert.strictEqual(staticRes.status, 404, 'Direct static access to private folder must return 404');
    console.log('PASS - Direct static access to private folder is protected (404)');
    passedCount++;

    // 5. Frontend error mapping verification
    const extJsx = fs.readFileSync(path.join(__dirname, '../web/src/pages/Extension.jsx'), 'utf8');
    assert.ok(extJsx.includes("The browser extension is part of Pro."), 'Frontend shows Pro upgrade message on 403');
    assert.ok(extJsx.includes("Please sign in to download the extension."), 'Frontend shows Sign in message on 401');
    console.log('PASS - Frontend maps 401 and 403 to polite, clear user messages');
    passedCount++;

    console.log(`\nAll ${passedCount} tests passed successfully!`);
  } finally {
    server.close(() => {
      try { fs.unlinkSync(process.env.LEDGER_FILE); } catch {}
      try { fs.unlinkSync(path.join(__dirname, 'reproduce_download.js')); } catch {}
    });
  }
}

run().catch((err) => {
  console.error('FAIL - Extension download test error:', err);
  process.exit(1);
});
