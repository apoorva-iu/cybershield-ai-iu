'use strict';

const crypto = require('crypto');
const Razorpay = require('razorpay');
const DB = require('../db');
const { LIMITS, getIstMonthWindow } = require('../config/limits');
const {
  getUserPlan,
  countUsageEvents,
  getAnonIdentity,
  memoryUserPlans
} = require('../detectors/quota');

// In-memory fallback for payment_orders (for tests and disconnected Supabase)
// Array of { id, user_id, razorpay_order_id, razorpay_payment_id, amount_paise, currency, status, created_at, paid_at }
const memoryPaymentOrders = [];

let customRazorpayClient = null;

function setCustomRazorpay(client) {
  customRazorpayClient = client;
}

function resetBillingMemory() {
  memoryPaymentOrders.length = 0;
  customRazorpayClient = null;
}

function getRazorpayConfig() {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  const proPricePaise = parseInt(process.env.PRO_PRICE_PAISE || '100', 10) || 100;
  const proDays = parseInt(process.env.PRO_DAYS || '30', 10) || 30;

  return {
    keyId,
    keySecret,
    webhookSecret,
    proPricePaise,
    proDays
  };
}

function getPaymentsMode() {
  const { keyId, keySecret } = getRazorpayConfig();
  if (!keyId || !keySecret) return 'off';
  if (keyId.startsWith('rzp_test_')) return 'test';
  if (keyId.startsWith('rzp_live_')) return 'live';
  return 'off';
}

function isPaymentsAvailable() {
  if (customRazorpayClient) return true;
  const mode = getPaymentsMode();
  return mode === 'test' || mode === 'live';
}

function getRazorpayClient() {
  if (customRazorpayClient) return customRazorpayClient;
  const { keyId, keySecret } = getRazorpayConfig();
  if (!keyId || !keySecret) return null;
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
}

/**
 * Storage Helpers for payment_orders
 */
async function insertPaymentOrder(orderRecord) {
  const order = {
    id: orderRecord.id || crypto.randomUUID(),
    user_id: orderRecord.user_id || null,
    razorpay_order_id: orderRecord.razorpay_order_id,
    razorpay_payment_id: orderRecord.razorpay_payment_id || null,
    amount_paise: orderRecord.amount_paise,
    currency: orderRecord.currency || 'INR',
    status: orderRecord.status || 'created',
    created_at: orderRecord.created_at instanceof Date ? orderRecord.created_at : new Date(orderRecord.created_at || Date.now()),
    paid_at: orderRecord.paid_at ? new Date(orderRecord.paid_at) : null
  };

  memoryPaymentOrders.push(order);

  const client = DB.getClient();
  if (DB.getStatus() === 'connected' && client) {
    try {
      await client.from('payment_orders').insert({
        id: order.id,
        user_id: order.user_id,
        razorpay_order_id: order.razorpay_order_id,
        razorpay_payment_id: order.razorpay_payment_id,
        amount_paise: order.amount_paise,
        currency: order.currency,
        status: order.status,
        created_at: order.created_at.toISOString(),
        paid_at: order.paid_at ? order.paid_at.toISOString() : null
      });
    } catch (err) {
      console.warn('[billing] insertPaymentOrder DB error:', err.message);
    }
  }

  return order;
}

async function findPaymentOrderByRazorpayOrderId(orderId) {
  if (!orderId) return null;

  const client = DB.getClient();
  if (DB.getStatus() === 'connected' && client) {
    try {
      const { data, error } = await client
        .from('payment_orders')
        .select('*')
        .eq('razorpay_order_id', orderId)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn('[billing] findPaymentOrder DB error:', err.message);
    }
  }

  const mem = memoryPaymentOrders.find(o => o.razorpay_order_id === orderId);
  return mem || null;
}

async function updatePaymentOrder(orderId, updates) {
  if (!orderId) return null;

  // Update in memory
  const mem = memoryPaymentOrders.find(o => o.razorpay_order_id === orderId);
  if (mem) {
    Object.assign(mem, updates);
  }

  // Update in DB
  const client = DB.getClient();
  if (DB.getStatus() === 'connected' && client) {
    try {
      const payload = { ...updates };
      if (payload.paid_at instanceof Date) {
        payload.paid_at = payload.paid_at.toISOString();
      }
      await client
        .from('payment_orders')
        .update(payload)
        .eq('razorpay_order_id', orderId);
    } catch (err) {
      console.warn('[billing] updatePaymentOrder DB error:', err.message);
    }
  }

  return mem;
}

async function anonymizeUserPaymentOrders(userId) {
  if (!userId) return;

  // In memory
  for (const o of memoryPaymentOrders) {
    if (o.user_id === userId) {
      o.user_id = null;
    }
  }

  // In DB
  const client = DB.getClient();
  if (DB.getStatus() === 'connected' && client) {
    try {
      await client.from('payment_orders').update({ user_id: null }).eq('user_id', userId);
    } catch (err) {
      console.warn('[billing] anonymizeUserPaymentOrders DB error:', err.message);
    }
  }
}

/**
 * Activates or extends a Pro pass for the given user.
 * - If active Pro pass exists, extends expires_at by PRO_DAYS from current expiry.
 * - Otherwise, started_at = now, expires_at = now + PRO_DAYS.
 */
async function activateProPass(userId) {
  if (!userId) throw new Error('User ID required for Pro pass activation');
  const { proDays } = getRazorpayConfig();
  const proDurationMs = proDays * 24 * 60 * 60 * 1000;
  const now = new Date();

  const currentPlan = await getUserPlan(userId);
  const isCurrentlyPro = currentPlan && currentPlan.plan === 'pro';
  const currentExpiry = currentPlan && currentPlan.expires_at ? new Date(currentPlan.expires_at) : null;
  const isStillActive = isCurrentlyPro && currentExpiry && currentExpiry.getTime() > now.getTime();

  let startedAt;
  let expiresAt;

  if (isStillActive) {
    startedAt = currentPlan.started_at ? new Date(currentPlan.started_at) : now;
    expiresAt = new Date(currentExpiry.getTime() + proDurationMs);
  } else {
    startedAt = now;
    expiresAt = new Date(now.getTime() + proDurationMs);
  }

  const record = {
    user_id: userId,
    plan: 'pro',
    started_at: startedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    updated_at: now.toISOString()
  };

  // Update in memory
  memoryUserPlans.set(userId, record);

  // Update in DB
  const client = DB.getClient();
  if (DB.getStatus() === 'connected' && client) {
    try {
      await client.from('user_plans').upsert(record);
    } catch (err) {
      console.warn('[billing] activateProPass DB error:', err.message);
    }
  }

  return record;
}

/**
 * Creates a Razorpay order. Amount is ALWAYS taken from server config, never from client.
 */
async function createOrder(userId) {
  if (!isPaymentsAvailable()) {
    const err = new Error('Payments are currently unavailable');
    err.code = 'PAYMENTS_UNAVAILABLE';
    err.status = 503;
    throw err;
  }

  const client = getRazorpayClient();
  if (!client) {
    const err = new Error('Payments are currently unavailable');
    err.code = 'PAYMENTS_UNAVAILABLE';
    err.status = 503;
    throw err;
  }

  const { keyId, proPricePaise } = getRazorpayConfig();
  const receipt = `rcpt_${crypto.randomBytes(8).toString('hex')}`;

  const orderOptions = {
    amount: proPricePaise,
    currency: 'INR',
    receipt,
    notes: {
      userId: userId || '',
      plan: 'pro'
    }
  };

  let rzpOrder;
  try {
    rzpOrder = await client.orders.create(orderOptions);
  } catch (err) {
    const safeMsg = (err && (err.description || err.error?.description || err.message)) || 'Razorpay order creation failed';
    const error = new Error(safeMsg);
    error.status = (err && err.statusCode) || 500;
    error.raw = err;
    throw error;
  }

  await insertPaymentOrder({
    id: crypto.randomUUID(),
    user_id: userId || null,
    razorpay_order_id: rzpOrder.id,
    amount_paise: proPricePaise,
    currency: 'INR',
    status: 'created',
    created_at: new Date()
  });

  return {
    orderId: rzpOrder.id,
    amount: proPricePaise,
    currency: 'INR',
    keyId
  };
}

/**
 * Verifies Razorpay payment signature and activates the Pro pass idempotently.
 */
async function verifyOrderPayment({ userId, orderId, paymentId, signature }) {
  if (!isPaymentsAvailable()) {
    const err = new Error('Payments are currently unavailable');
    err.code = 'PAYMENTS_UNAVAILABLE';
    err.status = 503;
    throw err;
  }

  if (!orderId || !paymentId || !signature) {
    const err = new Error('Missing required payment verification fields');
    err.code = 'INVALID_REQUEST';
    err.status = 400;
    throw err;
  }

  const order = await findPaymentOrderByRazorpayOrderId(orderId);
  if (!order) {
    const err = new Error('Payment order not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (order.user_id !== userId) {
    const err = new Error('Forbidden: order does not belong to user');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }

  // IDEMPOTENCY: If already paid, return success without extending again
  if (order.status === 'paid') {
    const currentPlan = await getUserPlan(userId);
    return {
      ok: true,
      alreadyPaid: true,
      plan: 'pro',
      expiresAt: currentPlan.expires_at
    };
  }

  const { keySecret } = getRazorpayConfig();
  if (!keySecret && !customRazorpayClient) {
    const err = new Error('Payments are currently unavailable');
    err.code = 'PAYMENTS_UNAVAILABLE';
    err.status = 503;
    throw err;
  }

  // Signature verification: HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET)
  const dataToSign = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', keySecret || 'mock-secret-for-tests')
    .update(dataToSign)
    .digest('hex');

  const bufExpected = Buffer.from(expectedSignature, 'utf8');
  const bufActual = Buffer.from(signature, 'utf8');

  const isValid =
    bufExpected.length === bufActual.length &&
    crypto.timingSafeEqual(bufExpected, bufActual);

  if (!isValid) {
    const err = new Error('Invalid signature');
    err.code = 'INVALID_SIGNATURE';
    err.status = 400;
    throw err;
  }

  // Activate Pro pass
  const planRecord = await activateProPass(userId);

  // Mark order paid
  await updatePaymentOrder(orderId, {
    status: 'paid',
    razorpay_payment_id: paymentId,
    paid_at: new Date()
  });

  return {
    ok: true,
    plan: 'pro',
    expiresAt: planRecord.expires_at
  };
}

/**
 * Handles incoming Razorpay webhooks with raw body and X-Razorpay-Signature verification.
 */
async function processWebhook({ rawBody, signatureHeader }) {
  const { webhookSecret } = getRazorpayConfig();
  if (!webhookSecret && !customRazorpayClient) {
    const err = new Error('Payments are currently unavailable');
    err.code = 'PAYMENTS_UNAVAILABLE';
    err.status = 503;
    throw err;
  }

  if (!signatureHeader || typeof signatureHeader !== 'string') {
    const err = new Error('Missing webhook signature');
    err.code = 'INVALID_SIGNATURE';
    err.status = 400;
    throw err;
  }

  const bodyBuffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {}));

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret || 'mock-webhook-secret')
    .update(bodyBuffer)
    .digest('hex');

  const bufExpected = Buffer.from(expectedSignature, 'utf8');
  const bufActual = Buffer.from(signatureHeader, 'utf8');

  const isValid =
    bufExpected.length === bufActual.length &&
    crypto.timingSafeEqual(bufExpected, bufActual);

  if (!isValid) {
    const err = new Error('Invalid webhook signature');
    err.code = 'INVALID_SIGNATURE';
    err.status = 400;
    throw err;
  }

  let event;
  try {
    event = JSON.parse(bodyBuffer.toString('utf8'));
  } catch (e) {
    const err = new Error('Invalid webhook payload JSON');
    err.code = 'INVALID_JSON';
    err.status = 400;
    throw err;
  }

  let orderId = null;
  let paymentId = null;

  if (event.event === 'order.paid') {
    orderId = event.payload?.order?.entity?.id || null;
    paymentId = event.payload?.payment?.entity?.id || null;
  } else if (event.event === 'payment.captured') {
    orderId = event.payload?.payment?.entity?.order_id || null;
    paymentId = event.payload?.payment?.entity?.id || null;
  } else {
    // Unknown or non-payment event -> ignore with 200
    return { ok: true, ignored: true };
  }

  if (!orderId) {
    return { ok: true, ignored: true };
  }

  const order = await findPaymentOrderByRazorpayOrderId(orderId);
  if (!order) {
    // "unknown orders -> 200 ignore"
    return { ok: true, ignored: true };
  }

  if (order.status === 'paid') {
    return { ok: true, alreadyPaid: true };
  }

  if (order.user_id) {
    await activateProPass(order.user_id);
  }

  await updatePaymentOrder(orderId, {
    status: 'paid',
    razorpay_payment_id: paymentId || order.razorpay_payment_id,
    paid_at: new Date()
  });

  return { ok: true };
}

/**
 * Returns current billing status for the user.
 */
async function getBillingStatus(userId, req, res) {
  const paymentsMode = getPaymentsMode();

  if (!userId) {
    return {
      plan: 'free',
      expiresAt: null,
      daysLeft: 0,
      checksUsed: 0,
      checksLimit: LIMITS.anonymousLimit,
      paymentsMode
    };
  }

  const userPlanRec = await getUserPlan(userId);
  const now = Date.now();
  const expiresAt = userPlanRec.expires_at ? new Date(userPlanRec.expires_at) : null;
  const isProActive = userPlanRec.plan === 'pro' && expiresAt && now <= expiresAt.getTime();

  if (isProActive) {
    const startedAt = userPlanRec.started_at ? new Date(userPlanRec.started_at) : new Date(now);
    const checksUsed = await countUsageEvents({ userId, sinceDate: startedAt });
    const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now) / (1000 * 60 * 60 * 24)));

    return {
      plan: 'pro',
      expiresAt: expiresAt.toISOString(),
      daysLeft,
      checksUsed,
      checksLimit: LIMITS.proLimit,
      paymentsMode
    };
  }

  // Free plan or expired Pro
  const istWindow = getIstMonthWindow();
  const userChecks = await countUsageEvents({ userId, sinceDate: istWindow.start });
  let anonChecks = 0;
  if (req) {
    try {
      const { anonKeyHash } = getAnonIdentity(req, res || {});
      anonChecks = await countUsageEvents({ anonKeyHash, sinceDate: istWindow.start });
    } catch {}
  }

  return {
    plan: 'free',
    expiresAt: null,
    daysLeft: 0,
    checksUsed: userChecks + anonChecks,
    checksLimit: LIMITS.freeSignedTotal,
    paymentsMode
  };
}

module.exports = {
  getRazorpayConfig,
  getPaymentsMode,
  isPaymentsAvailable,
  getRazorpayClient,
  setCustomRazorpay,
  resetBillingMemory,
  insertPaymentOrder,
  findPaymentOrderByRazorpayOrderId,
  updatePaymentOrder,
  anonymizeUserPaymentOrders,
  activateProPass,
  createOrder,
  verifyOrderPayment,
  processWebhook,
  getBillingStatus,
  memoryPaymentOrders
};
