'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

// Ensure test mode
process.env.npm_lifecycle_event = 'test:auth';

// Avoid any external network calls during this test
const dotenv = require('dotenv');
dotenv.config = () => {};

delete process.env.VT_API_KEY;
delete process.env.URLHAUS_AUTH_KEY;
delete process.env.GOOGLE_PLACES_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.LLM_PROVIDER;

process.env.SUPABASE_URL = 'https://javnaahgfkxforvvndag.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_do_not_expose';

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

async function run() {
  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.LEDGER_FILE = path.join(__dirname, 'temp_ledger_auth.json');
  if (fs.existsSync(process.env.LEDGER_FILE)) {
    try { fs.unlinkSync(process.env.LEDGER_FILE); } catch (e) {}
  }

  // Clone config so we can modify runtime flags for testing
  const originalCfg = require('../config');
  const clone = JSON.parse(JSON.stringify(originalCfg));
  clone.runtime.security.verifyRateLimit.perMinute = 100;
  clone.runtime.security.verifyRateLimit.perDay = 1000;
  clone.runtime.security.verifyRateLimitSignedIn.perMinute = 200;
  clone.runtime.security.verifyRateLimitSignedIn.perDay = 2000;
  clone.runtime.security.userRateLimit = { windowMs: 60000, max: 200 };
  clone.runtime.security.profileUpdateRateLimit = { windowMs: 60000, max: 50 };
  require.cache[require.resolve('../config')].exports = clone;

  const usersByToken = {
    'valid-token-user-1': {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'alice@example.com',
      user_metadata: { display_name: 'Alice' },
      created_at: '2026-01-01T00:00:00.000Z'
    },
    'valid-token-user-2': {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'bob@example.com',
      user_metadata: { display_name: 'Bob' },
      created_at: '2026-01-02T00:00:00.000Z'
    }
  };

  let scansStore = [];
  let profilesStore = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      display_name: 'Alice',
      avatar_url: null,
      plan: 'free',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      display_name: 'Bob',
      avatar_url: null,
      plan: 'free',
      created_at: '2026-01-02T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z'
    }
  ];

  function makeQueryBuilder(tableName) {
    const getStore = () => (tableName === 'profiles' ? profilesStore : scansStore);
    const setStore = (next) => {
      if (tableName === 'profiles') profilesStore = next;
      else scansStore = next;
    };

    const qb = {
      _op: 'select',
      _filters: [],
      _orderCol: null,
      _orderAsc: true,
      _rangeFrom: null,
      _rangeTo: null,
      _limitVal: null,
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

      select() {
        return this;
      },

      update(fields) {
        this._op = 'update';
        this._updateData = fields;
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

      not(col, op, val) {
        if (op === 'is' && val === null) {
          this._filters.push(r => r[col] !== null && r[col] !== undefined);
        }
        return this;
      },

      lt(col, val) {
        this._filters.push(r => r[col] != null && String(r[col]) < String(val));
        return this;
      },

      order(col, { ascending = true } = {}) {
        this._orderCol = col;
        this._orderAsc = ascending;
        return this;
      },

      range(from, to) {
        this._rangeFrom = from;
        this._rangeTo = to;
        return this;
      },

      limit(n) {
        this._limitVal = n;
        return this;
      },

      then(resolve, reject) {
        try {
          const store = getStore();
          const matches = (r) => this._filters.every(fn => fn(r));

          if (this._op === 'update') {
            const updated = [];
            for (const r of store) {
              if (matches(r)) {
                Object.assign(r, this._updateData);
                updated.push({ ...r });
              }
            }
            return Promise.resolve({ data: updated, error: null }).then(resolve, reject);
          }

          if (this._op === 'delete') {
            const removed = [];
            const kept = [];
            for (const r of store) {
              if (matches(r)) removed.push({ ...r });
              else kept.push(r);
            }
            setStore(kept);
            return Promise.resolve({ data: removed, count: removed.length, error: null }).then(resolve, reject);
          }

          let res = store.filter(matches).map(r => ({ ...r }));
          const totalCount = res.length;

          if (this._orderCol) {
            const c = this._orderCol;
            const asc = this._orderAsc;
            res.sort((a, b) => (asc ? (a[c] > b[c] ? 1 : -1) : (a[c] < b[c] ? 1 : -1)));
          }
          if (this._rangeFrom !== null && this._rangeTo !== null) {
            res = res.slice(this._rangeFrom, this._rangeTo + 1);
          } else if (this._limitVal !== null) {
            res = res.slice(0, this._limitVal);
          }
          return Promise.resolve({ data: res, count: totalCount, error: null }).then(resolve, reject);
        } catch (err) {
          return Promise.reject(err).then(resolve, reject);
        }
      }
    };
    return qb;
  }

  const adminDeletedUserIds = [];
  const fakeClient = {
    auth: {
      async getUser(token) {
        const u = usersByToken[token];
        if (!u) return { data: { user: null }, error: { message: 'invalid token' } };
        return { data: { user: u }, error: null };
      },
      admin: {
        async deleteUser(userId) {
          adminDeletedUserIds.push(userId);
          for (const [tk, usr] of Object.entries(usersByToken)) {
            if (usr.id === userId) delete usersByToken[tk];
          }
          return { data: {}, error: null };
        }
      }
    },
    from(tableName) {
      return makeQueryBuilder(tableName);
    }
  };

  const DB = require('../db');
  DB.setClient(fakeClient);

  const server = require('../server.js');
  await new Promise(resolve => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
  });

  const api = async (method, urlPath, body, token) => {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token !== undefined) headers['Authorization'] = token;
    const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data, headers: res.headers };
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

  try {
    // 1. An anonymous scan is unchanged with a 30-day expiry
    scansStore = [];
    const anonRes = await api('POST', '/api/verify', {
      desc: 'Responsibilities include backend engineering. Requirements: 5 years Node.js experience.'
    });
    const anonRow = scansStore[0];
    const retentionDays = clone.runtime.database.retention.anonymousScanDays;
    const expectedExpiryMs = Date.now() + retentionDays * 86400000;
    const actualExpiryMs = anonRow && anonRow.expires_at ? new Date(anonRow.expires_at).getTime() : 0;
    test(
      'anonymous scan is unchanged with a 30-day expiry',
      Boolean(
        anonRes.status === 200 &&
        anonRes.data &&
        anonRes.data.saved === true &&
        anonRow &&
        anonRow.user_id === null &&
        anonRow.expires_at != null &&
        Math.abs(actualExpiryMs - expectedExpiryMs) < 10000
      )
    );

    // 2. A valid token saves user_id, a null expiry and saved true
    scansStore = [];
    const authRes = await api(
      'POST',
      '/api/verify',
      {
        company: 'Acme Corp',
        desc: 'Responsibilities include software engineering. Requirements: 5 years experience. About the role: Full time.'
      },
      'Bearer valid-token-user-1'
    );
    const authRow = scansStore[0];
    test(
      'valid token saves user_id, a null expiry and saved true',
      Boolean(
        authRes.status === 200 &&
        authRes.data &&
        authRes.data.saved === true &&
        authRow &&
        authRow.user_id === usersByToken['valid-token-user-1'].id &&
        authRow.expires_at === null &&
        !JSON.stringify(authRow).includes(authRes.data.accessCode)
      )
    );

    // 3. An INVALID token on /api/verify still returns an anonymous scan (not 401)
    const invalidTokenVerify = await api(
      'POST',
      '/api/verify',
      { desc: 'Job offer checked with an expired or invalid token.' },
      'Bearer expired-or-invalid-token'
    );
    const invalidTokenRow = scansStore[scansStore.length - 1];
    test(
      'invalid token on /api/verify still returns an anonymous scan (not 401)',
      Boolean(
        invalidTokenVerify.status === 200 &&
        invalidTokenVerify.data &&
        invalidTokenVerify.data.report &&
        invalidTokenRow &&
        invalidTokenRow.user_id === null &&
        invalidTokenRow.expires_at != null
      )
    );

    // 4. An invalid token on /api/me returns 401
    const invalidTokenMe = await api('GET', '/api/me', undefined, 'Bearer expired-or-invalid-token');
    const missingTokenMe = await api('GET', '/api/me');
    test(
      'invalid or missing token on /api/me returns 401',
      Boolean(invalidTokenMe.status === 401 && missingTokenMe.status === 401)
    );

    // 5. History shows only the owner's scans (and includes confidence, company, host)
    const user2Res = await api(
      'POST',
      '/api/verify',
      { desc: 'Please pay a $500 fee for training equipment via WhatsApp.' },
      'Bearer valid-token-user-2'
    );
    const hist1 = await api('GET', '/api/scans?page=1&limit=10', undefined, 'Bearer valid-token-user-1');
    const hist1Str = JSON.stringify(hist1.data);
    const item1 = hist1.data && hist1.data.items && hist1.data.items[0];
    test(
      'history shows only owner scans with confidence, company, host and no accessCode',
      Boolean(
        hist1.status === 200 &&
        hist1.data &&
        hist1.data.total === 1 &&
        hist1.data.items.length === 1 &&
        item1.id === authRow.id &&
        item1.proofId === authRes.data.proofId &&
        item1.company === 'Acme Corp' &&
        'confidence' in item1 &&
        'host' in item1 &&
        !('accessCode' in item1) &&
        !hist1Str.includes(authRes.data.accessCode) &&
        !hist1Str.includes(user2Res.data.proofId)
      )
    );

    // 6. Another user's scan returns 404 on read and delete
    const ownRead = await api('GET', `/api/scans/${authRow.id}`, undefined, 'Bearer valid-token-user-1');
    const otherRead = await api('GET', `/api/scans/${authRow.id}`, undefined, 'Bearer valid-token-user-2');
    const otherDelete = await api('DELETE', `/api/scans/${authRow.id}`, undefined, 'Bearer valid-token-user-2');
    test(
      'another user scan returns 404 on read and delete',
      Boolean(
        ownRead.status === 200 &&
        ownRead.data &&
        ownRead.data.id === authRow.id &&
        otherRead.status === 404 &&
        otherDelete.status === 404
      )
    );

    // 7. PATCH validation rejects bad names (including 61 chars) and extra fields
    const patch60 = await api('PATCH', '/api/me', { display_name: 'X'.repeat(60) }, 'Bearer valid-token-user-1');
    const patch61 = await api('PATCH', '/api/me', { display_name: 'X'.repeat(61) }, 'Bearer valid-token-user-1');
    const patchValid = await api('PATCH', '/api/me', { display_name: 'Alice Smith' }, 'Bearer valid-token-user-1');
    const patchEmpty = await api('PATCH', '/api/me', { display_name: '   ' }, 'Bearer valid-token-user-1');
    const patchBadChars = await api('PATCH', '/api/me', { display_name: '<script>alert(1)</script>' }, 'Bearer valid-token-user-1');
    const patchExtraField = await api('PATCH', '/api/me', { display_name: 'Alice', plan: 'pro' }, 'Bearer valid-token-user-1');
    test(
      'PATCH validation accepts 60 chars and rejects 61 chars, bad names, and extra fields',
      Boolean(
        patch60.status === 200 &&
        patch60.data.display_name.length === 60 &&
        patch61.status === 400 &&
        patchValid.status === 200 &&
        patchValid.data.display_name === 'Alice Smith' &&
        patchEmpty.status === 400 &&
        patchBadChars.status === 400 &&
        patchExtraField.status === 400
      )
    );

    // 8. config-public never contains a secret and returns exact fields
    const cfgPub1 = await api('GET', '/api/config-public');
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_accidental_leak';
    const cfgPub2 = await api('GET', '/api/config-public');
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
    const keys1 = cfgPub1.data ? Object.keys(cfgPub1.data).sort() : [];
    const str1 = JSON.stringify(cfgPub1.data);
    const str2 = JSON.stringify(cfgPub2.data);
    test(
      'config-public returns exact fields and never contains a secret',
      Boolean(
        cfgPub1.status === 200 &&
        JSON.stringify(keys1) === JSON.stringify(['authEnabled', 'etherscanLink', 'supabasePublishableKey', 'supabaseUrl']) &&
        cfgPub1.data.authEnabled === true &&
        cfgPub1.data.etherscanLink === clone.runtime.etherscanLink &&
        !str1.includes('sb_secret') &&
        !str2.includes('sb_secret') &&
        cfgPub2.data.authEnabled === false
      )
    );

    // 9. db:purge keeps rows with a null expiry and deletes only expired rows
    const { purgeExpired } = require('../scripts/purge-expired');
    scansStore.push({
      id: 'expired-anon-row',
      user_id: null,
      proof_id: 'CS-EXPIRED001',
      proof_key: '0'.repeat(64),
      level: 'low',
      score: 10,
      confidence: 80,
      report: {},
      expires_at: new Date(Date.now() - 86400000).toISOString()
    });
    const nullExpiryCountBefore = scansStore.filter(r => r.expires_at === null).length;
    const { removed } = await purgeExpired(fakeClient, 'scans');
    const nullExpiryCountAfter = scansStore.filter(r => r.expires_at === null).length;
    const expiredStillPresent = scansStore.some(r => r.id === 'expired-anon-row');
    test(
      'db:purge keeps rows with a null expiry and removes expired rows',
      Boolean(
        removed === 1 &&
        !expiredStillPresent &&
        nullExpiryCountBefore >= 2 &&
        nullExpiryCountAfter === nullExpiryCountBefore
      )
    );

    // 10. Existing page loads and CSP headers match connect-src ('self' + SUPABASE_URL) and img-src ('self' + https://lh3.googleusercontent.com) with no wildcards
    const homeRes = await fetch(`http://127.0.0.1:${port}/`);
    const homeHtml = await homeRes.text();
    const cspHeader = homeRes.headers.get('content-security-policy') || '';
    test(
      'existing page loads and CSP has connect-src with SUPABASE_URL and img-src with Google avatars and no wildcards',
      Boolean(
        homeRes.status === 200 &&
        homeHtml.includes('<div id="root">') &&
        cspHeader.includes("connect-src 'self' https://javnaahgfkxforvvndag.supabase.co") &&
        cspHeader.includes("img-src 'self' https://lh3.googleusercontent.com") &&
        !cspHeader.includes('*')
      )
    );

    // 11. GET /api/me returns display_name strictly from the profile row
    const me1 = await api('GET', '/api/me', undefined, 'Bearer valid-token-user-1');
    profilesStore.find(p => p.id === usersByToken['valid-token-user-2'].id).display_name = null;
    const me2 = await api('GET', '/api/me', undefined, 'Bearer valid-token-user-2');
    test(
      'GET /api/me returns display_name from the profile',
      Boolean(
        me1.status === 200 &&
        me1.data.display_name === 'Alice Smith' &&
        me2.status === 200 &&
        me2.data.display_name === null
      )
    );

    // 12. DELETE /api/me removes saved scans, profile, and auth.users row, keeps ledger privacy, and stops token from working
    const user2Id = '22222222-2222-4222-8222-222222222222';
    const delRes = await api('DELETE', '/api/me', undefined, 'Bearer valid-token-user-2');
    const user2ScansAfter = scansStore.filter(s => s.user_id === user2Id);
    const user2ProfileAfter = profilesStore.filter(p => p.id === user2Id);
    const afterDelMe = await api('GET', '/api/me', undefined, 'Bearer valid-token-user-2');
    const afterDelScans = await api('GET', '/api/scans', undefined, 'Bearer valid-token-user-2');
    const ledgerVerifyRes = await api('POST', '/api/proof/verify', {
      proofId: user2Res.data.proofId,
      hash: user2Res.data.blockHash
    });
    const rawLedgerText = fs.existsSync(process.env.LEDGER_FILE)
      ? fs.readFileSync(process.env.LEDGER_FILE, 'utf8')
      : '';
    test(
      'DELETE /api/me deletes scans, profile, and auth.users, keeps ledger privacy, and invalidates token',
      Boolean(
        delRes.status === 200 &&
        delRes.data &&
        delRes.data.deleted === true &&
        user2ScansAfter.length === 0 &&
        user2ProfileAfter.length === 0 &&
        adminDeletedUserIds.includes(user2Id) &&
        afterDelMe.status === 401 &&
        afterDelScans.status === 401 &&
        ledgerVerifyRes.status === 200 &&
        ledgerVerifyRes.data.status === 'intact' &&
        !rawLedgerText.includes(user2Id) &&
        !rawLedgerText.includes('bob@example.com') &&
        !rawLedgerText.includes(user2Res.data.accessCode)
      )
    );

    // 13. CORS allows listed origins, same-origin, and no-Origin, and omits CORS headers for unlisted origins (even if allowedOrigins is empty)
    const corsAllowed = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: 'http://localhost:5173' }
    });
    const corsBlocked = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: 'https://evil.example.com' }
    });
    const corsSameOrigin = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: `http://127.0.0.1:${port}` }
    });
    const savedAllowed = clone.runtime.security.allowedOrigins;
    clone.runtime.security.allowedOrigins = [];
    const corsEmptyBlocked = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: 'https://evil.example.com' }
    });
    const corsEmptyNoOrigin = await fetch(`http://127.0.0.1:${port}/api/health`);
    clone.runtime.security.allowedOrigins = savedAllowed;
    test(
      'CORS allows listed and same-origin requests and blocks unlisted origins even when allowedOrigins is empty',
      Boolean(
        corsAllowed.headers.get('access-control-allow-origin') === 'http://localhost:5173' &&
        corsBlocked.headers.get('access-control-allow-origin') === null &&
        corsSameOrigin.headers.get('access-control-allow-origin') === `http://127.0.0.1:${port}` &&
        corsEmptyBlocked.headers.get('access-control-allow-origin') === null &&
        corsEmptyNoOrigin.status === 200
      )
    );

    // 14. Malformed JSON returns 400 {error: "Invalid JSON"}
    const badJsonRes = await fetch(`http://127.0.0.1:${port}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json'
    });
    const badJsonData = await badJsonRes.json().catch(() => null);
    test(
      'Malformed JSON returns 400 {error: "Invalid JSON"}',
      Boolean(badJsonRes.status === 400 && badJsonData && badJsonData.error === 'Invalid JSON')
    );

    // 15. Extension origin is allowed on POST /api/verify and denied on /api/me
    const extOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const extVerifyRes = await fetch(`http://127.0.0.1:${port}/api/verify`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ desc: 'Remote data entry job with weekly pay' })
    });
    const extVerifyData = await extVerifyRes.json().catch(() => null);

    const extPreflightRes = await fetch(`http://127.0.0.1:${port}/api/verify`, {
      method: 'OPTIONS',
      headers: {
        Origin: extOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });

    const extMeGetRes = await fetch(`http://127.0.0.1:${port}/api/me`, {
      headers: {
        Origin: extOrigin,
        Authorization: 'Bearer valid-token-user-1'
      }
    });

    const extMeOptionsRes = await fetch(`http://127.0.0.1:${port}/api/me`, {
      method: 'OPTIONS',
      headers: {
        Origin: extOrigin,
        'Access-Control-Request-Method': 'GET'
      }
    });

    const extScansRes = await fetch(`http://127.0.0.1:${port}/api/scans`, {
      headers: {
        Origin: extOrigin,
        Authorization: 'Bearer valid-token-user-1'
      }
    });

    const extProofRes = await fetch(`http://127.0.0.1:${port}/api/proof/verify`, {
      method: 'POST',
      headers: {
        Origin: extOrigin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ hash: 'dummy' })
    });

    test(
      'the extension origin is allowed on POST /api/verify and denied on /api/me',
      Boolean(
        extVerifyRes.status === 200 &&
        extVerifyData &&
        extVerifyData.receipt &&
        extVerifyRes.headers.get('access-control-allow-origin') === extOrigin &&
        extVerifyRes.headers.get('access-control-allow-credentials') !== 'true' &&
        extPreflightRes.status === 204 &&
        extPreflightRes.headers.get('access-control-allow-origin') === extOrigin &&
        extMeGetRes.headers.get('access-control-allow-origin') === null &&
        extMeOptionsRes.headers.get('access-control-allow-origin') === null &&
        extScansRes.headers.get('access-control-allow-origin') === null &&
        extProofRes.headers.get('access-control-allow-origin') === null
      )
    );

  } finally {
    server.close(() => {
      if (fs.existsSync(process.env.LEDGER_FILE)) {
        try { fs.unlinkSync(process.env.LEDGER_FILE); } catch (e) {}
      }
      process.exitCode = allPassed ? 0 : 1;
    });
  }
}

run().catch(err => {
  console.error('FAIL -', err);
  process.exitCode = 1;
});
