'use strict';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_key';
process.env.RAZORPAY_KEY_SECRET = 'mock_secret_test_123';
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

async function run() {
  console.log('Running Razorpay COOP, CSP & Checkout integration tests...\n');

  const port = await findFreePort();
  process.env.PORT = String(port);
  process.env.LEDGER_FILE = path.join(__dirname, 'temp_ledger_coop_test.json');
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
      }),
      insert: async (data) => {
        if (!stores[table]) stores[table] = [];
        stores[table].push(data);
        return { error: null };
      },
      upsert: async (data) => {
        if (!stores[table]) stores[table] = [];
        const idx = stores[table].findIndex(r => r.user_id === data.user_id);
        if (idx >= 0) stores[table][idx] = { ...stores[table][idx], ...data };
        else stores[table].push(data);
        return { error: null };
      },
      update: (data) => ({
        eq: (col, val) => {
          if (!stores[table]) stores[table] = [];
          const idx = stores[table].findIndex(r => r[col] === val);
          if (idx >= 0) stores[table][idx] = { ...stores[table][idx], ...data };
          return Promise.resolve({ error: null });
        }
      })
    })
  };
  DB.setClient(fakeClient);

  const server = require('../server');
  const baseUrl = `http://127.0.0.1:${port}`;
  await new Promise(r => setTimeout(r, 1000));

  let passed = 0;

  try {
    // 1. Verify COOP Header is same-origin-allow-popups
    const homeRes = await fetch(`${baseUrl}/`);
    const coopHeader = homeRes.headers.get('cross-origin-opener-policy');
    assert.strictEqual(
      coopHeader,
      'same-origin-allow-popups',
      `COOP header must be same-origin-allow-popups, got: ${coopHeader}`
    );
    console.log('PASS - Cross-Origin-Opener-Policy is same-origin-allow-popups (allows popup window reference)');
    passed++;

    // 2. Verify CSP directives allow Razorpay domains in script-src, frame-src, connect-src, form-action
    const cspHeader = homeRes.headers.get('content-security-policy') || '';
    assert.ok(cspHeader, 'Content-Security-Policy header must be present');

    // Parse directives from CSP header string
    const directives = {};
    cspHeader.split(';').forEach(part => {
      const trimmed = part.trim();
      if (!trimmed) return;
      const [name, ...vals] = trimmed.split(/\s+/);
      directives[name] = vals;
    });

    // Check script-src
    assert.ok(directives['script-src'].includes('https://checkout.razorpay.com'), 'script-src allows checkout.razorpay.com');
    assert.ok(directives['script-src'].includes('https://api.razorpay.com'), 'script-src allows api.razorpay.com');
    assert.ok(directives['script-src'].includes('https://*.razorpay.com'), 'script-src allows *.razorpay.com');
    console.log('PASS - script-src allows Razorpay checkout, api, and *.razorpay.com');
    passed++;

    // Check frame-src
    assert.ok(directives['frame-src'].includes('https://checkout.razorpay.com'), 'frame-src allows checkout.razorpay.com');
    assert.ok(directives['frame-src'].includes('https://api.razorpay.com'), 'frame-src allows api.razorpay.com');
    assert.ok(directives['frame-src'].includes('https://*.razorpay.com'), 'frame-src allows *.razorpay.com');
    console.log('PASS - frame-src allows Razorpay checkout, api, and *.razorpay.com');
    passed++;

    // Check connect-src
    assert.ok(directives['connect-src'].includes('https://api.razorpay.com'), 'connect-src allows api.razorpay.com');
    assert.ok(directives['connect-src'].includes('https://checkout.razorpay.com'), 'connect-src allows checkout.razorpay.com');
    assert.ok(directives['connect-src'].includes('https://*.razorpay.com'), 'connect-src allows *.razorpay.com');
    console.log('PASS - connect-src allows Razorpay api, checkout, and *.razorpay.com');
    passed++;

    // Check form-action
    assert.ok(directives['form-action'], 'form-action directive must be explicitly defined');
    assert.ok(directives['form-action'].includes("'self'"), "form-action includes 'self'");
    assert.ok(directives['form-action'].includes('https://api.razorpay.com'), 'form-action allows api.razorpay.com');
    assert.ok(directives['form-action'].includes('https://checkout.razorpay.com'), 'form-action allows checkout.razorpay.com');
    assert.ok(directives['form-action'].includes('https://*.razorpay.com'), 'form-action allows *.razorpay.com');
    console.log('PASS - form-action allows Razorpay form redirects and popups');
    passed++;

    // Check no wildcards for other domains
    const nonRazorpayWildcards = Object.entries(directives).filter(([dir, vals]) => {
      return vals.some(v => (v === '*' || v === 'https:*' || (v.includes('*') && !v.includes('razorpay.com'))));
    });
    assert.strictEqual(nonRazorpayWildcards.length, 0, `No wildcards for other domains allowed, found: ${JSON.stringify(nonRazorpayWildcards)}`);
    console.log('PASS - No wildcards for other domains (only *.razorpay.com)');
    passed++;

    // 3. Verify Payment Creation & Verification Flows
    const { setCustomRazorpay, resetBillingMemory, createOrder, verifyOrderPayment } = require('../billing/service');
    resetBillingMemory();

    // Mock Razorpay instance for Netbanking & Wallet test verification
    let orderCounter = 0;
    const mockRzp = {
      orders: {
        create: async (opts) => ({
          id: `order_test_${++orderCounter}_${Date.now()}`,
          amount: opts.amount,
          currency: opts.currency,
          status: 'created'
        })
      }
    };
    setCustomRazorpay(mockRzp);

    // Create order as free user
    const order = await createOrder(freeUserId);
    assert.ok(order.orderId.startsWith('order_test_'));
    assert.strictEqual(order.amount, 100); // 100 paise
    console.log('PASS - Order creation enforces server price (100 paise)');
    passed++;

    // Netbanking Success verification activates Pro
    const crypto = require('crypto');
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const paymentId = 'pay_netbanking_canara_ok';
    const sig = crypto.createHmac('sha256', secret).update(`${order.orderId}|${paymentId}`).digest('hex');

    const verifySuccess = await verifyOrderPayment({
      userId: freeUserId,
      orderId: order.orderId,
      paymentId,
      signature: sig
    });
    assert.strictEqual(verifySuccess.ok, true);
    assert.strictEqual(verifySuccess.plan, 'pro');
    console.log('PASS - Netbanking/Wallet payment success activates Pro plan');
    passed++;

    // Paying twice does not extend again (idempotent)
    const verifyAgain = await verifyOrderPayment({
      userId: freeUserId,
      orderId: order.orderId,
      paymentId,
      signature: sig
    });
    assert.strictEqual(verifyAgain.alreadyPaid, true);
    assert.strictEqual(verifyAgain.expiresAt, verifySuccess.expiresAt);
    console.log('PASS - Paying twice is idempotent and does not add extra days');
    passed++;

    // Payment failure simulation leaves account Free
    const otherUserId = '33333333-3333-4333-8333-333333333333';
    stores.user_plans.push({ user_id: otherUserId, plan: 'free', started_at: null, expires_at: null });
    const orderFail = await createOrder(otherUserId);
    let failedCleanly = false;
    try {
      await verifyOrderPayment({
        userId: otherUserId,
        orderId: orderFail.orderId,
        paymentId: 'pay_fail_123',
        signature: 'invalid_bad_sig'
      });
    } catch (err) {
      assert.strictEqual(err.code, 'INVALID_SIGNATURE');
      failedCleanly = true;
    }
    assert.ok(failedCleanly, 'Invalid signature rejected');

    const { getUserPlan } = require('../detectors/quota');
    const userPlanAfterFail = await getUserPlan(otherUserId);
    assert.strictEqual(userPlanAfterFail.plan, 'free', 'Account remains Free after payment failure');
    console.log('PASS - Payment failure leaves account Free');
    passed++;

    console.log(`\nAll ${passed} COOP, CSP & Checkout tests passed successfully!`);
  } finally {
    server.close(() => {
      try { fs.unlinkSync(process.env.LEDGER_FILE); } catch {}
    });
  }
}

run().catch(err => {
  console.error('FAIL - Test error:', err);
  process.exit(1);
});
