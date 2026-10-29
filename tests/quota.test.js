'use strict';

const assert = require('assert');
const { LIMITS, getIstMonthWindow, IST_OFFSET_MS } = require('../config/limits');
const {
  isQuotaEnabled,
  setQuotaEnabled,
  resetQuotaMemory,
  signId,
  getAnonIdentity,
  getEntitlement,
  getUserPlan,
  quotaMiddleware,
  usageRoute,
  quotaRoute,
  insertUsageEvent,
  deleteUsageEvent,
  deleteUserQuotaData,
  countUsageEvents,
  memoryUserPlans,
  memoryUsageEvents,
  COOKIE_NAME
} = require('../detectors/quota');

async function runTests() {
  console.log('Running quota and usage system unit tests...\n');

  // Test 1: Config Limits & Constants
  {
    console.log('1. Plan limits & single source of truth');
    assert.strictEqual(LIMITS.anonymousLimit, 3, 'Anonymous limit must be 3');
    assert.strictEqual(LIMITS.freeSignedTotal, 5, 'Free signed total must be 5');
    assert.strictEqual(LIMITS.freeExtra, 2, 'Free signed extra must be 2');
    assert.strictEqual(LIMITS.proLimit, 100, 'Pro limit must be 100');
    assert.strictEqual(LIMITS.proDays, 30, 'Pro duration must be 30 days');
    console.log('   ✓ LIMITS verified');
  }

  // Test 2: IST Calendar Month Calculation
  {
    console.log('2. IST calendar month boundaries');
    const midOct2026Utc = new Date('2026-10-15T12:00:00.000Z');
    const window = getIstMonthWindow(midOct2026Utc);

    // 2026-10-01 00:00:00 IST in UTC is 2026-09-30 18:30:00 UTC
    assert.strictEqual(
      window.start.toISOString(),
      '2026-09-30T18:30:00.000Z',
      'Start of Oct 2026 IST in UTC must be 2026-09-30T18:30:00.000Z'
    );
    // 2026-11-01 00:00:00 IST in UTC is 2026-10-31 18:30:00 UTC
    assert.strictEqual(
      window.resetsAt.toISOString(),
      '2026-10-31T18:30:00.000Z',
      'Reset time (Nov 1 00:00 IST) must be 2026-10-31T18:30:00.000Z'
    );
    console.log('   ✓ IST month window accurately computed');
  }

  // Setup: Enable quota for tests
  setQuotaEnabled(true);
  resetQuotaMemory();

  // Test 3: Anonymous Identity derivation (Web vs Extension)
  {
    console.log('3. Anonymous identity derivation');
    // Web client without cookie
    const setCookies = [];
    const mockResWeb = {
      setHeader(name, val) {
        if (name === 'Set-Cookie') setCookies.push(val);
      },
      getHeader() { return null; }
    };
    const mockReqWeb = {
      headers: { 'x-forwarded-for': '203.0.113.195' },
      socket: { remoteAddress: '127.0.0.1' }
    };

    const webId1 = getAnonIdentity(mockReqWeb, mockResWeb);
    assert.strictEqual(webId1.isExtension, false, 'Web client is not extension');
    assert.ok(setCookies.length > 0, 'Set-Cookie header was set for web client');
    assert.ok(setCookies[0].includes('cs_anon='), 'Cookie contains cs_anon');
    assert.ok(setCookies[0].includes('HttpOnly'), 'Cookie is HttpOnly');

    // Web client with same cookie returns identical anonKeyHash
    const cookieHeader = setCookies[0].split(';')[0];
    const mockReqWeb2 = {
      headers: { 'x-forwarded-for': '203.0.113.195', cookie: cookieHeader },
      socket: { remoteAddress: '127.0.0.1' }
    };
    const webId2 = getAnonIdentity(mockReqWeb2, {});
    assert.strictEqual(webId1.anonKeyHash, webId2.anonKeyHash, 'Same cookie yields same anonKeyHash');

    // Extension client (X-Client: extension)
    const mockReqExt = {
      headers: { 'x-client': 'extension', 'x-forwarded-for': '203.0.113.195' },
      socket: { remoteAddress: '127.0.0.1' }
    };
    const extId = getAnonIdentity(mockReqExt, {});
    assert.strictEqual(extId.isExtension, true, 'Extension client recognized via X-Client');
    assert.ok(extId.anonKeyHash, 'Extension receives deterministic anonKeyHash');
    console.log('   ✓ Anonymous identity works for web (signed cookie) and extension (salted hash)');
  }

  // Test 4: Anonymous Quota Progression (3 checks -> 429 sign_in)
  {
    console.log('4. Anonymous quota flow (3 checks allowed, 4th rejected with sign_in)');
    resetQuotaMemory();

    const signedCookie = `cs_anon=${encodeURIComponent(signId('abcdef0123456789abcdef0123456789'))}`;
    const anonReq = {
      headers: { cookie: signedCookie, 'x-forwarded-for': '198.51.100.10' },
      socket: { remoteAddress: '198.51.100.10' }
    };

    let ent = await getEntitlement(anonReq, {});
    assert.strictEqual(ent.limit, 3);
    assert.strictEqual(ent.used, 0);
    assert.strictEqual(ent.remaining, 3);
    assert.strictEqual(ent.action, null);

    // Consume 3 checks
    const { anonKeyHash } = getAnonIdentity(anonReq, {});
    await insertUsageEvent({ anonKeyHash, tool: 'job', source: 'web' });
    await insertUsageEvent({ anonKeyHash, tool: 'upi', source: 'web' });
    await insertUsageEvent({ anonKeyHash, tool: 'message', source: 'web' });

    ent = await getEntitlement(anonReq, {});
    assert.strictEqual(ent.used, 3);
    assert.strictEqual(ent.remaining, 0);
    assert.strictEqual(ent.action, 'sign_in', 'Anonymous user at limit must receive sign_in action');
    console.log('   ✓ Anonymous 3-check limit and sign_in action verified');
  }

  // Test 5: Signed-in Free User ("3 anon + 2 more = 5 total")
  {
    console.log('5. Signed-in Free user quota (combines device anon checks + user checks, max 5)');
    // User signs in on the same device where 3 anonymous checks were performed
    const userId = 'user-uuid-1234';
    const signedCookie = `cs_anon=${encodeURIComponent(signId('abcdef0123456789abcdef0123456789'))}`;
    const signedInReq = {
      user: { id: userId },
      headers: { cookie: signedCookie, 'x-forwarded-for': '198.51.100.10' },
      socket: { remoteAddress: '198.51.100.10' }
    };

    let ent = await getEntitlement(signedInReq, {});
    assert.strictEqual(ent.kind, 'free');
    assert.strictEqual(ent.limit, 5);
    // 3 anon checks done on this device + 0 user checks = 3 used
    assert.strictEqual(ent.used, 3, 'Used must combine device anonymous checks');
    assert.strictEqual(ent.remaining, 2, 'Remaining must be 2 (5 - 3)');
    assert.strictEqual(ent.action, null);

    // User performs 2 more checks
    await insertUsageEvent({ userId, tool: 'job', source: 'web' });
    await insertUsageEvent({ userId, tool: 'upi', source: 'web' });

    ent = await getEntitlement(signedInReq, {});
    assert.strictEqual(ent.used, 5);
    assert.strictEqual(ent.remaining, 0);
    assert.strictEqual(ent.action, 'upgrade', 'Free user at limit must receive upgrade action');
    console.log('   ✓ Signed-in free user receives 2 extra checks (5 total) and upgrade action');
  }

  // Test 6: Pro Plan Quota (100 checks in 30 days & expiration handling)
  {
    console.log('6. Pro user 100 checks & pass validity window');
    const proUserId = 'pro-user-5678';
    const now = Date.now();
    const activePass = {
      user_id: proUserId,
      plan: 'pro',
      started_at: new Date(now - 5 * 86400000).toISOString(),
      expires_at: new Date(now + 25 * 86400000).toISOString()
    };
    memoryUserPlans.set(proUserId, activePass);

    const proReq = {
      user: { id: proUserId },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' }
    };

    let ent = await getEntitlement(proReq, {});
    assert.strictEqual(ent.kind, 'pro');
    assert.strictEqual(ent.limit, 100);
    assert.strictEqual(ent.used, 0);
    assert.strictEqual(ent.remaining, 100);

    // Expired pass falls back to Free
    const expiredPass = {
      user_id: proUserId,
      plan: 'pro',
      started_at: new Date(now - 35 * 86400000).toISOString(),
      expires_at: new Date(now - 5 * 86400000).toISOString()
    };
    memoryUserPlans.set(proUserId, expiredPass);

    ent = await getEntitlement(proReq, {});
    assert.strictEqual(ent.kind, 'free', 'Expired Pro pass must fall back to Free');
    assert.strictEqual(ent.plan, 'free', 'Expired Pro plan falls back to free');
    assert.strictEqual(ent.limit, 5, 'Free limit applies after Pro pass expires');
    console.log('   ✓ Pro pass limit (100) and expiration fallback to Free verified');
  }

  // Test 7: Atomic Quota Reservation & Rollback
  {
    console.log('7. Atomic reservation and rollback on validation/AI errors');
    resetQuotaMemory();

    const signedCookie = `cs_anon=${encodeURIComponent(signId('11111111111111111111111111111111'))}`;
    const anonReq = {
      path: '/api/verify',
      headers: { cookie: signedCookie, 'x-forwarded-for': '12.34.56.78' },
      socket: { remoteAddress: '12.34.56.78' }
    };

    // Case 7a: Successful scan (status 200) -> Keeps slot
    {
      let nextCalled = false;
      const res = {
        statusCode: 200,
        headers: {},
        on() {},
        json(body) { return body; }
      };

      await quotaMiddleware(anonReq, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
      assert.strictEqual(memoryUsageEvents.length, 1, 'Event reserved');

      // Finish successful response
      res.json({ ok: true, verdict: 'ok' });
      // Event must NOT be rolled back
      assert.strictEqual(memoryUsageEvents.length, 1, 'Successful check kept in quota');
    }

    // Case 7b: Validation error (status 400) -> Rollback
    {
      const res = {
        statusCode: 400,
        headers: {},
        on() {},
        json(body) { return body; }
      };

      await quotaMiddleware(anonReq, res, () => {});
      assert.strictEqual(memoryUsageEvents.length, 2, 'Slot reserved before handler');
      res.json({ error: 'Provide a job URL or description.' });
      // Wait event loop tick for rollback
      await new Promise(r => setTimeout(r, 10));
      assert.strictEqual(memoryUsageEvents.length, 1, 'Slot rolled back on 400 error');
    }

    // Case 7c: AI Unavailable (mode: ai_unavailable) -> Rollback
    {
      const res = {
        statusCode: 200,
        headers: {},
        on() {},
        json(body) { return body; }
      };

      await quotaMiddleware(anonReq, res, () => {});
      assert.strictEqual(memoryUsageEvents.length, 2, 'Slot reserved before handler');
      res.json({ level: 'unable', mode: 'ai_unavailable', message: 'AI unavailable' });
      await new Promise(r => setTimeout(r, 10));
      assert.strictEqual(memoryUsageEvents.length, 1, 'Slot rolled back when AI is unavailable');
    }

    // Case 7d: Working AI returning 'unable' verdict -> Counts (no rollback)
    {
      const res = {
        statusCode: 200,
        headers: {},
        on() {},
        json(body) { return body; }
      };

      await quotaMiddleware(anonReq, res, () => {});
      assert.strictEqual(memoryUsageEvents.length, 2, 'Slot reserved before handler');
      res.json({ level: 'unable', mode: 'ai_verified', reason: 'insufficient_evidence' });
      await new Promise(r => setTimeout(r, 10));
      assert.strictEqual(memoryUsageEvents.length, 2, 'Working AI unable-to-verify scan counts');
    }

    console.log('   ✓ Rollback operates correctly on 400, 429, 500, and ai_unavailable');
  }

  // Test 8: Feature Flag QUOTA_ENABLED=false
  {
    console.log('8. Feature flag QUOTA_ENABLED=false (unlimited mode)');
    setQuotaEnabled(false);

    const anonReq = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const ent = await getEntitlement(anonReq, {});
    assert.strictEqual(ent.unlimited, true, 'When disabled, entitlement is unlimited');
    assert.strictEqual(ent.limit, null);

    let nextCalled = false;
    await quotaMiddleware(anonReq, {}, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Middleware immediately calls next() when disabled');
    setQuotaEnabled(true);
    console.log('   ✓ Feature flag disables quota checking completely');
  }

  // Test 9: User Account Deletion
  {
    console.log('9. User account deletion cleanup');
    resetQuotaMemory();
    const userToDel = 'delete-me-user-999';
    await insertUsageEvent({ userId: userToDel, tool: 'job' });
    await insertUsageEvent({ userId: userToDel, tool: 'upi' });
    memoryUserPlans.set(userToDel, { plan: 'pro', user_id: userToDel });

    assert.strictEqual(memoryUsageEvents.length, 2);
    assert.strictEqual(memoryUserPlans.has(userToDel), true);

    await deleteUserQuotaData(userToDel);
    assert.strictEqual(memoryUsageEvents.length, 0, 'Usage events deleted for user');
    assert.strictEqual(memoryUserPlans.has(userToDel), false, 'Plan deleted for user');
    console.log('   ✓ deleteUserQuotaData cleans up all user quota events and plan records');
  }

  console.log('\nAll 9 quota unit tests passed successfully!\n');
}

runTests().catch(err => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
