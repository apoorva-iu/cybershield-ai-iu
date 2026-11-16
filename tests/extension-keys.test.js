'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const assert = require('assert');
const crypto = require('crypto');

process.env.npm_lifecycle_event = 'test:extension-keys';

delete process.env.VT_API_KEY;
delete process.env.URLHAUS_AUTH_KEY;
delete process.env.GOOGLE_PLACES_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.LLM_PROVIDER;

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_key';

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

async function run() {
  console.log('Running Extension Keys & Parity integration tests...\n');

  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.LEDGER_FILE = path.join(__dirname, 'temp_ledger_ext_keys.json');
  if (fs.existsSync(process.env.LEDGER_FILE)) {
    try { fs.unlinkSync(process.env.LEDGER_FILE); } catch {}
  }

  const originalCfg = require('../config');
  const clone = JSON.parse(JSON.stringify(originalCfg));
  clone.runtime.security.verifyRateLimit.perMinute = 100;
  clone.runtime.security.verifyRateLimitSignedIn.perMinute = 200;
  clone.runtime.security.userRateLimit = { windowMs: 60000, max: 200 };
  require.cache[require.resolve('../config')].exports = clone;

  const DB = require('../db');
  const { setQuotaEnabled, resetQuotaMemory } = require('../detectors/quota');
  const { resetExtensionKeysMemory } = require('../detectors/extensionKeys');

  setQuotaEnabled(true);
  resetQuotaMemory();
  resetExtensionKeysMemory();

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

  const futureIso = new Date(Date.now() + 20 * 86400000).toISOString();
  const pastIso = new Date(Date.now() - 86400000).toISOString();
  const stores = {
    profiles: [
      { id: proUserId, display_name: 'Pro User', plan: 'pro', created_at: '2026-01-01T00:00:00.000Z' },
      { id: freeUserId, display_name: 'Free User', plan: 'free', created_at: '2026-01-01T00:00:00.000Z' }
    ],
    user_plans: [
      { user_id: proUserId, plan: 'pro', started_at: new Date(Date.now() - 86400000).toISOString(), expires_at: futureIso },
      { user_id: freeUserId, plan: 'free', started_at: null, expires_at: null }
    ],
    extension_keys: [],
    usage_events: [],
    scans: []
  };

  function makeQueryBuilder(tableName) {
    const getStore = () => stores[tableName] || [];
    const qb = {
      _op: 'select',
      _filters: [],
      _orderCol: null,
      _orderAsc: true,
      _limitVal: null,
      _countExact: false,
      _headOnly: false,
      _updateData: null,

      insert(row) {
        const rows = (Array.isArray(row) ? row : [row]).map(r => ({
          id: r.id || crypto.randomUUID(),
          created_at: r.created_at || new Date().toISOString(),
          ...r
        }));
        getStore().push(...rows);
        return Promise.resolve({ data: rows, error: null });
      },

      select(_cols, opts) {
        this._op = 'select';
        if (opts && opts.count === 'exact') this._countExact = true;
        if (opts && opts.head === true) this._headOnly = true;
        return this;
      },

      update(data) {
        this._op = 'update';
        this._updateData = data;
        return this;
      },

      delete() {
        this._op = 'delete';
        return this;
      },

      eq(col, val) {
        this._filters.push(r => r[col] === val);
        return this;
      },

      is(col, val) {
        this._filters.push(r => r[col] === val);
        return this;
      },

      gte(col, val) {
        this._filters.push(r => String(r[col] || '') >= String(val));
        return this;
      },

      order(col, opts) {
        this._orderCol = col;
        this._orderAsc = !(opts && opts.ascending === false);
        return this;
      },

      limit(n) {
        this._limitVal = n;
        return this;
      },

      maybeSingle() {
        return this.limit(1)._exec(true);
      },

      then(resolve, reject) {
        return this._exec(false).then(resolve, reject);
      },

      async _exec(singleRow) {
        const list = getStore();
        let matched = list.filter(r => this._filters.every(fn => fn(r)));

        if (this._op === 'update') {
          for (const row of matched) {
            Object.assign(row, this._updateData);
          }
          return { data: matched, error: null };
        }

        if (this._op === 'delete') {
          const remaining = list.filter(r => !this._filters.every(fn => fn(r)));
          stores[tableName] = remaining;
          return { data: matched, error: null };
        }

        if (this._orderCol) {
          matched = [...matched].sort((a, b) => {
            const cmp = String(a[this._orderCol] || '').localeCompare(String(b[this._orderCol] || ''));
            return this._orderAsc ? cmp : -cmp;
          });
        }

        const totalCount = matched.length;
        if (typeof this._limitVal === 'number') {
          matched = matched.slice(0, this._limitVal);
        }

        if (this._headOnly) {
          return { data: null, count: totalCount, error: null };
        }

        return {
          data: singleRow ? (matched[0] || null) : matched,
          count: this._countExact ? totalCount : undefined,
          error: null
        };
      }
    };
    return qb;
  }

  DB.setClient({
    auth: {
      async getUser(token) {
        const u = usersByToken[token];
        if (!u) return { data: { user: null }, error: { message: 'Invalid token' } };
        return { data: { user: u }, error: null };
      }
    },
    from(tableName) {
      return makeQueryBuilder(tableName);
    }
  });

  const server = require('../server');
  const baseUrl = `http://127.0.0.1:${port}`;
  const extOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

  try {
    // 1. Free user cannot generate extension key
    const freeGen = await fetch(`${baseUrl}/api/extension/key`, {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt-free-user' }
    });
    assert.strictEqual(freeGen.status, 403, 'Free user should get 403 on POST /api/extension/key');
    const freeGenData = await freeGen.json();
    assert.strictEqual(freeGenData.error, 'pro_required');

    // 2. Pro user creates key -> returned once with cs_ext_ prefix, only hash stored
    const proGen1 = await fetch(`${baseUrl}/api/extension/key`, {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt-pro-user' }
    });
    assert.strictEqual(proGen1.status, 200);
    const proGen1Data = await proGen1.json();
    assert.ok(proGen1Data.key && proGen1Data.key.startsWith('cs_ext_'), 'Key must start with cs_ext_');
    const key1 = proGen1Data.key;

    assert.strictEqual(stores.extension_keys.length, 1);
    const storedHash1 = crypto.createHash('sha256').update(key1).digest('hex');
    assert.strictEqual(stores.extension_keys[0].key_hash, storedHash1, 'Only SHA-256 hash stored');
    assert.strictEqual(stores.extension_keys[0].key, undefined, 'Plain key must never be stored');

    // Status endpoint shows active key without returning plain key or hash
    const statusRes = await fetch(`${baseUrl}/api/extension/key`, {
      headers: { Authorization: 'Bearer jwt-pro-user' }
    });
    assert.strictEqual(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.isPro, true);
    assert.strictEqual(statusData.hasKey, true);
    assert.strictEqual(statusData.key, undefined);
    assert.strictEqual(statusData.key_hash, undefined);

    // 3. Creating second key revokes the first key
    const proGen2 = await fetch(`${baseUrl}/api/extension/key`, {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt-pro-user' }
    });
    assert.strictEqual(proGen2.status, 200);
    const proGen2Data = await proGen2.json();
    const key2 = proGen2Data.key;
    assert.notStrictEqual(key1, key2);
    assert.strictEqual(stores.extension_keys.length, 2);
    assert.ok(stores.extension_keys[0].revoked_at !== null, 'First key must be revoked');
    assert.strictEqual(stores.extension_keys[1].revoked_at, null, 'Second key must be active');

    // 4. Old/revoked key returns 401 "Key not valid, generate a new one"
    const revokedUse = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key1}`
      },
      body: JSON.stringify({ desc: 'Software Engineer position requiring upfront training payment.' })
    });
    assert.strictEqual(revokedUse.status, 401);
    const revokedJson = await revokedUse.json();
    assert.strictEqual(revokedJson.message, 'Key not valid, generate a new one');

    // 5. Invalid key returns 401 "Key not valid, generate a new one"
    const invalidUse = await fetch(`${baseUrl}/api/usage`, {
      headers: {
        Origin: extOrigin,
        Authorization: 'Bearer cs_ext_000000000000000000000000000000000000000000000000'
      }
    });
    assert.strictEqual(invalidUse.status, 401);
    const invalidJson = await invalidUse.json();
    assert.strictEqual(invalidJson.message, 'Key not valid, generate a new one');

    // 6. Active key checks /api/usage (CORS allows chrome-extension:// GET /api/usage)
    const usageRes1 = await fetch(`${baseUrl}/api/usage`, {
      headers: {
        Origin: extOrigin,
        Authorization: `Bearer ${key2}`
      }
    });
    assert.strictEqual(usageRes1.status, 200);
    assert.strictEqual(usageRes1.headers.get('access-control-allow-origin'), extOrigin);
    const usageData1 = await usageRes1.json();
    assert.strictEqual(usageData1.plan, 'pro');
    assert.strictEqual(usageData1.limit, 100);
    assert.strictEqual(usageData1.remaining, 100);

    // 7. Extension POST /api/verify shares quota with web & saves scan with Proof ID
    const extVerifyRes = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json',
        'X-Client': 'extension',
        Authorization: `Bearer ${key2}`
      },
      body: JSON.stringify({
        url: 'https://linkedin.com/jobs/view/123456',
        company: 'Acme Global',
        desc: 'Pay Rs 500 registration fee before onboarding via telegram.'
      })
    });
    assert.strictEqual(extVerifyRes.status, 200);
    assert.strictEqual(extVerifyRes.headers.get('access-control-allow-origin'), extOrigin);
    const extVerifyData = await extVerifyRes.json();
    assert.ok(extVerifyData.proofId && extVerifyData.proofId.startsWith('CS-'), 'Must return Proof ID');
    assert.strictEqual(extVerifyData.saved, true, 'Scan must save to Pro user account');

    // Web check by same user consumes shared quota
    const webVerifyRes = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer jwt-pro-user'
      },
      body: JSON.stringify({
        desc: 'Standard software engineer job posting with clear responsibilities and interview stages.'
      })
    });
    assert.strictEqual(webVerifyRes.status, 200);

    // Confirm shared quota now shows used=2, remaining=98 across web & extension
    const usageRes2 = await fetch(`${baseUrl}/api/usage`, {
      headers: {
        Origin: extOrigin,
        Authorization: `Bearer ${key2}`
      }
    });
    const usageData2 = await usageRes2.json();
    assert.strictEqual(usageData2.used, 2, 'Shared quota must count both extension and web checks');
    assert.strictEqual(usageData2.remaining, 98);

    // 8. Owner can open saved report by Proof ID; another user gets 404
    const ownerReport = await fetch(`${baseUrl}/api/scans/${encodeURIComponent(extVerifyData.proofId)}`, {
      headers: { Authorization: 'Bearer jwt-pro-user' }
    });
    assert.strictEqual(ownerReport.status, 200);
    const ownerReportJson = await ownerReport.json();
    assert.strictEqual(ownerReportJson.proofId, extVerifyData.proofId);

    const otherUserReport = await fetch(`${baseUrl}/api/scans/${encodeURIComponent(extVerifyData.proofId)}`, {
      headers: { Authorization: 'Bearer jwt-free-user' }
    });
    assert.strictEqual(otherUserReport.status, 404, 'Other users must not open another user report');

    // 9. Downgraded / expired Pro user with existing active key gets 403 "Extension is a Pro feature"
    stores.user_plans[0].expires_at = pastIso;
    const expiredProUse = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key2}`
      },
      body: JSON.stringify({ desc: 'Remote clerk position paying high weekly wage.' })
    });
    assert.strictEqual(expiredProUse.status, 403);
    const expiredProJson = await expiredProUse.json();
    assert.strictEqual(expiredProJson.error, 'pro_required');
    assert.strictEqual(expiredProJson.message, 'Extension is a Pro feature');
    assert.strictEqual(expiredProJson.upgradeUrl, '/#/pricing');

    // Restore Pro and test Revoke endpoint
    stores.user_plans[0].expires_at = futureIso;
    const revokeRes = await fetch(`${baseUrl}/api/extension/key`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer jwt-pro-user' }
    });
    assert.strictEqual(revokeRes.status, 200);

    const afterRevokeUse = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key2}`
      },
      body: JSON.stringify({ desc: 'Another job description test.' })
    });
    assert.strictEqual(afterRevokeUse.status, 401);
    const afterRevokeJson = await afterRevokeUse.json();
    assert.strictEqual(afterRevokeJson.message, 'Key not valid, generate a new one');

    // 10. Verify CSP remains strict (no '*' or 'chrome-extension:' in website CSP)
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const csp = healthRes.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("default-src 'self'"), 'CSP must remain strict');
    assert.ok(!csp.includes('chrome-extension:'), 'CSP must not whitelist chrome-extension:');

    console.log('✓ All 10 extension key, Pro gate, shared quota, CORS, CSP & RLS report tests PASSED!');
  } finally {
    setQuotaEnabled(false);
    resetQuotaMemory();
    resetExtensionKeysMemory();
    server.close(() => {
      if (fs.existsSync(process.env.LEDGER_FILE)) {
        try { fs.unlinkSync(process.env.LEDGER_FILE); } catch {}
      }
      process.exit(0);
    });
  }
}

run().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
