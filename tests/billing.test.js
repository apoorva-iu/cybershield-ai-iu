'use strict';

const assert = require('assert');
const crypto = require('crypto');
const {
  getRazorpayConfig,
  getPaymentsMode,
  isPaymentsAvailable,
  setCustomRazorpay,
  resetBillingMemory,
  insertPaymentOrder,
  findPaymentOrderByRazorpayOrderId,
  anonymizeUserPaymentOrders,
  activateProPass,
  createOrder,
  verifyOrderPayment,
  processWebhook,
  getBillingStatus,
  memoryPaymentOrders
} = require('../billing/service');

const {
  getEntitlement,
  getUserPlan,
  memoryUserPlans,
  resetQuotaMemory,
  setQuotaEnabled
} = require('../detectors/quota');
const { LIMITS } = require('../config/limits');

async function runBillingTests() {
  console.log('Running billing and Razorpay integration unit tests...\n');

  // Preserve initial environment
  const originalEnv = {
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    PRO_PRICE_PAISE: process.env.PRO_PRICE_PAISE,
    PRO_DAYS: process.env.PRO_DAYS,
    QUOTA_ENABLED: process.env.QUOTA_ENABLED
  };

  setQuotaEnabled(true);
  resetQuotaMemory();
  resetBillingMemory();

  // Test 1: Missing keys -> 503 payments_unavailable and app boots
  {
    console.log('1. Missing keys returns 503 payments_unavailable and app boots');
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;

    assert.strictEqual(getPaymentsMode(), 'off', 'Mode should be off when keys are missing');
    assert.strictEqual(isPaymentsAvailable(), false, 'Payments should be unavailable');

    let orderError = null;
    try {
      await createOrder('user-1');
    } catch (err) {
      orderError = err;
    }
    assert.ok(orderError, 'createOrder must throw when keys are missing');
    assert.strictEqual(orderError.status, 503);
    assert.strictEqual(orderError.code, 'PAYMENTS_UNAVAILABLE');

    let verifyError = null;
    try {
      await verifyOrderPayment({
        userId: 'user-1',
        orderId: 'order_test_1',
        paymentId: 'pay_test_1',
        signature: 'invalid'
      });
    } catch (err) {
      verifyError = err;
    }
    assert.ok(verifyError, 'verify must fail gracefully when keys missing');
    assert.strictEqual(verifyError.status, 503);

    console.log('   ✓ Missing keys returns 503 payments_unavailable');
  }

  // Setup mock Razorpay for unit testing
  const MOCK_KEY_ID = 'rzp_test_mockKeyId12345';
  const MOCK_KEY_SECRET = 'mockSecretKeySecret67890';
  const MOCK_WEBHOOK_SECRET = 'mockWebhookSecret112233';

  process.env.RAZORPAY_KEY_ID = MOCK_KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = MOCK_KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = MOCK_WEBHOOK_SECRET;
  process.env.PRO_PRICE_PAISE = '100';
  process.env.PRO_DAYS = '30';

  const mockCreatedOrders = [];
  const mockRazorpayClient = {
    orders: {
      async create(options) {
        const orderId = `order_mock_${crypto.randomBytes(6).toString('hex')}`;
        const order = {
          id: orderId,
          entity: 'order',
          amount: options.amount,
          currency: options.currency,
          receipt: options.receipt,
          status: 'created'
        };
        mockCreatedOrders.push({ options, order });
        return order;
      }
    }
  };
  setCustomRazorpay(mockRazorpayClient);

  // Test 2: Client cannot change amount (always taken from server config)
  {
    console.log('2. Client cannot change the amount (server config enforced)');
    assert.strictEqual(getPaymentsMode(), 'test', 'Mode should be test for rzp_test_ prefix');
    assert.strictEqual(isPaymentsAvailable(), true, 'Payments should be available');

    const created = await createOrder('user-alice');
    assert.strictEqual(created.amount, 100, 'Order amount must be 100 paise (Rs 1)');
    assert.strictEqual(created.currency, 'INR');
    assert.strictEqual(created.keyId, MOCK_KEY_ID);
    assert.strictEqual(created.keySecret, undefined, 'Secret must never be returned');

    const lastCall = mockCreatedOrders[mockCreatedOrders.length - 1];
    assert.strictEqual(lastCall.options.amount, 100, 'Razorpay client received exact config amount');
    console.log('   ✓ Server config amount (100 paise) strictly enforced');
  }

  // Test 3: Invalid signature rejected with 400 invalid_signature
  {
    console.log('3. Invalid signature rejected (HMAC timing-safe compare)');
    const orderData = await createOrder('user-alice');
    const orderId = orderData.orderId;
    const paymentId = 'pay_mock_123456';
    const fakeSignature = 'bad_forged_signature_0000000000000000000000000000000000000000000000';

    let verifyError = null;
    try {
      await verifyOrderPayment({
        userId: 'user-alice',
        orderId,
        paymentId,
        signature: fakeSignature
      });
    } catch (err) {
      verifyError = err;
    }

    assert.ok(verifyError, 'Invalid signature must throw error');
    assert.strictEqual(verifyError.status, 400);
    assert.strictEqual(verifyError.code, 'INVALID_SIGNATURE');

    // Confirm order remains unactivated
    const orderRecord = await findPaymentOrderByRazorpayOrderId(orderId);
    assert.strictEqual(orderRecord.status, 'created', 'Order status must remain created on bad signature');
    const userPlan = await getUserPlan('user-alice');
    assert.strictEqual(userPlan.plan, 'free', 'Plan must not activate on bad signature');
    console.log('   ✓ Forged signature rejected and status unchanged');
  }

  // Test 4: Another user\'s order rejected with 403 forbidden
  {
    console.log('4. Another user\'s order rejected (403 forbidden)');
    const aliceOrder = await createOrder('user-alice');
    const paymentId = 'pay_mock_789';
    const validSignature = crypto
      .createHmac('sha256', MOCK_KEY_SECRET)
      .update(`${aliceOrder.orderId}|${paymentId}`)
      .digest('hex');

    let crossUserError = null;
    try {
      // Bob tries to verify Alice's order
      await verifyOrderPayment({
        userId: 'user-bob',
        orderId: aliceOrder.orderId,
        paymentId,
        signature: validSignature
      });
    } catch (err) {
      crossUserError = err;
    }

    assert.ok(crossUserError, 'Must reject cross-user order verification');
    assert.strictEqual(crossUserError.status, 403);
    assert.strictEqual(crossUserError.code, 'FORBIDDEN');
    console.log('   ✓ Cross-user verification forbidden');
  }

  // Test 5: Valid signature activates Pro pass & verify called twice extends only once (Idempotency)
  {
    console.log('5. Valid verification activates Pro & idempotent second verify');
    const order = await createOrder('user-alice');
    const paymentId = 'pay_mock_valid_001';
    const validSignature = crypto
      .createHmac('sha256', MOCK_KEY_SECRET)
      .update(`${order.orderId}|${paymentId}`)
      .digest('hex');

    // First verify: activates
    const result1 = await verifyOrderPayment({
      userId: 'user-alice',
      orderId: order.orderId,
      paymentId,
      signature: validSignature
    });

    assert.strictEqual(result1.ok, true);
    assert.strictEqual(result1.plan, 'pro');
    assert.ok(result1.expiresAt);

    const firstExpiry = result1.expiresAt;
    const planAfterFirst = await getUserPlan('user-alice');
    assert.strictEqual(planAfterFirst.plan, 'pro');
    assert.strictEqual(planAfterFirst.expires_at, firstExpiry);

    // Second verify with identical order: must be idempotent, returns alreadyPaid without extending
    const result2 = await verifyOrderPayment({
      userId: 'user-alice',
      orderId: order.orderId,
      paymentId,
      signature: validSignature
    });

    assert.strictEqual(result2.ok, true);
    assert.strictEqual(result2.alreadyPaid, true, 'Second call must flag alreadyPaid');
    const planAfterSecond = await getUserPlan('user-alice');
    assert.strictEqual(planAfterSecond.expires_at, firstExpiry, 'Expires_at must NOT be extended on re-verify');
    console.log('   ✓ Idempotent verification succeeds without extending pass twice');
  }

  // Test 6: Webhook signature verification and idempotency
  {
    console.log('6. Webhook verification (bad signature -> 400, valid -> activated, unknown -> 200 ignored)');
    // 6a: Bad signature
    const payload = JSON.stringify({ event: 'order.paid', payload: { order: { entity: { id: 'order_nonexistent' } } } });
    let badSigError = null;
    try {
      await processWebhook({
        rawBody: Buffer.from(payload),
        signatureHeader: 'bad_signature_header'
      });
    } catch (err) {
      badSigError = err;
    }
    assert.ok(badSigError, 'Bad webhook signature must throw');
    assert.strictEqual(badSigError.status, 400);
    assert.strictEqual(badSigError.code, 'INVALID_SIGNATURE');

    // 6b: Unknown order -> 200 ignored
    const validSigUnknown = crypto
      .createHmac('sha256', MOCK_WEBHOOK_SECRET)
      .update(Buffer.from(payload))
      .digest('hex');

    const unknownResult = await processWebhook({
      rawBody: Buffer.from(payload),
      signatureHeader: validSigUnknown
    });
    assert.strictEqual(unknownResult.ok, true);
    assert.strictEqual(unknownResult.ignored, true, 'Unknown order must be safely ignored');

    // 6c: Valid webhook order.paid event for known order
    const carolOrder = await createOrder('user-carol');
    const webhookPayload = JSON.stringify({
      event: 'order.paid',
      payload: {
        order: { entity: { id: carolOrder.orderId } },
        payment: { entity: { id: 'pay_webhook_999' } }
      }
    });
    const validSigCarol = crypto
      .createHmac('sha256', MOCK_WEBHOOK_SECRET)
      .update(Buffer.from(webhookPayload))
      .digest('hex');

    const webhookResult = await processWebhook({
      rawBody: Buffer.from(webhookPayload),
      signatureHeader: validSigCarol
    });
    assert.strictEqual(webhookResult.ok, true);

    const carolPlan = await getUserPlan('user-carol');
    assert.strictEqual(carolPlan.plan, 'pro', 'User Carol must be activated via webhook');

    // 6d: Repeated webhook is idempotent
    const repeatWebhook = await processWebhook({
      rawBody: Buffer.from(webhookPayload),
      signatureHeader: validSigCarol
    });
    assert.strictEqual(repeatWebhook.alreadyPaid, true, 'Repeated webhook must be idempotent');
    console.log('   ✓ Webhook signature validation, unknown order handling, and idempotency verified');
  }

  // Test 7: Active Pro Pass limit = 100, Expired pass falls back to Free
  {
    console.log('7. Pro limit = 100, and expired pass falls back to Free');
    const now = Date.now();

    // Active Pro
    const activeUserId = 'user-active-pro';
    memoryUserPlans.set(activeUserId, {
      user_id: activeUserId,
      plan: 'pro',
      started_at: new Date(now - 86400000).toISOString(),
      expires_at: new Date(now + 29 * 86400000).toISOString()
    });

    const activeEnt = await getEntitlement({ user: { id: activeUserId }, headers: {} }, {});
    assert.strictEqual(activeEnt.kind, 'pro');
    assert.strictEqual(activeEnt.plan, 'pro');
    assert.strictEqual(activeEnt.limit, 100, 'Active Pro limit must be 100');

    // Expired Pro pass
    const expiredUserId = 'user-expired-pro';
    memoryUserPlans.set(expiredUserId, {
      user_id: expiredUserId,
      plan: 'pro',
      started_at: new Date(now - 35 * 86400000).toISOString(),
      expires_at: new Date(now - 5 * 86400000).toISOString()
    });

    const expiredEnt = await getEntitlement({ user: { id: expiredUserId }, headers: {} }, {});
    assert.strictEqual(expiredEnt.kind, 'free', 'Expired Pro pass must fall back to Free');
    assert.strictEqual(expiredEnt.plan, 'free', 'Plan must report free');
    assert.strictEqual(expiredEnt.limit, 5, 'Free limit (5) must apply to expired Pro');
    console.log('   ✓ Pro limit is 100 and expired pass falls back to Free');
  }

  // Test 8: Billing status endpoint
  {
    console.log('8. Billing status reports plan, daysLeft, checksUsed, checksLimit, paymentsMode');
    const status = await getBillingStatus('user-active-pro');
    assert.strictEqual(status.plan, 'pro');
    assert.strictEqual(status.checksLimit, 100);
    assert.strictEqual(status.paymentsMode, 'test');
    assert.ok(status.daysLeft > 0);

    const expiredStatus = await getBillingStatus('user-expired-pro');
    assert.strictEqual(expiredStatus.plan, 'free');
    assert.strictEqual(expiredStatus.checksLimit, 5);
    assert.strictEqual(expiredStatus.daysLeft, 0);
    console.log('   ✓ Billing status contract verified');
  }

  // Test 9: Account deletion anonymizes payment_orders (user_id = null)
  {
    console.log('9. Account deletion sets payment_orders user_id to null');
    const userToDel = 'user-delete-test';
    const order1 = await createOrder(userToDel);
    assert.strictEqual(order1.orderId, mockCreatedOrders[mockCreatedOrders.length - 1].order.id);

    const beforeDel = await findPaymentOrderByRazorpayOrderId(order1.orderId);
    assert.strictEqual(beforeDel.user_id, userToDel);

    await anonymizeUserPaymentOrders(userToDel);
    const afterDel = await findPaymentOrderByRazorpayOrderId(order1.orderId);
    assert.strictEqual(afterDel.user_id, null, 'user_id must be null after account deletion');
    assert.strictEqual(afterDel.amount_paise, 100, 'amount must be preserved');
    assert.strictEqual(afterDel.status, 'created', 'status must be preserved');
    console.log('   ✓ Account deletion anonymizes payment order user_id');
  }

  // Test 10: Real Razorpay test-mode order creation (if credentials provided)
  {
    console.log('10. Live Razorpay test-mode order creation attempt');
    resetBillingMemory(); // Restore live Razorpay client initialization

    // Check if real keys exist in .env
    const realKeyId = (originalEnv.RAZORPAY_KEY_ID || '').trim();
    const realSecret = (originalEnv.RAZORPAY_KEY_SECRET || '').trim();

    if (realKeyId && realKeyId.startsWith('rzp_test_') && realSecret) {
      process.env.RAZORPAY_KEY_ID = realKeyId;
      process.env.RAZORPAY_KEY_SECRET = realSecret;
      try {
        const liveOrder = await createOrder('user-live-test');
        console.log(`   ✓ REAL TEST-MODE ORDER CREATED SUCCESSFULLY! Order ID: ${liveOrder.orderId}`);
      } catch (err) {
        console.log(`   ⚠ Real order creation failed with: ${err.message}`);
      }
    } else {
      // Keys not configured in environment
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
      let caught = null;
      try {
        await createOrder('user-dummy');
      } catch (e) {
        caught = e;
      }
      assert.strictEqual(caught?.status, 503, 'Without keys, returns 503 payments_unavailable');
      console.log('   ℹ No live Razorpay test keys set in .env; verified 503 payments_unavailable as expected.');
    }
  }

  // Restore env
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  console.log('\nAll 10 billing unit test suites passed successfully!\n');
}

runBillingTests().catch(err => {
  console.error('\nBilling test failed:', err);
  process.exit(1);
});
