'use strict';

const crypto = require('crypto');
const cfg = require('../config');
const DB = require('../db');
const { LIMITS, TOOLS, SOURCES, getIstMonthWindow } = require('../config/limits');

const COOKIE_NAME = 'cs_anon';
let quotaOverride = null; // null means follow process.env / config

// In-memory fallback stores (used when Supabase is disconnected or in test environments)
// memoryUsageEvents: Array of { id, user_id, anon_key_hash, tool, source, created_at (Date) }
const memoryUsageEvents = [];
// memoryUserPlans: Map of user_id -> { user_id, plan, started_at, expires_at, updated_at }
const memoryUserPlans = new Map();

function getSecret() {
  return process.env.COOKIE_SECRET || process.env.SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || 'cyber-shield-quota-default-salt';
}

function getIpSalt() {
  return process.env.IP_HASH_SALT || getSecret();
}

function isQuotaEnabled() {
  if (quotaOverride !== null) return quotaOverride;
  const envVal = (process.env.QUOTA_ENABLED || '').trim().toLowerCase();
  if (envVal === 'true' || envVal === '1') return true;
  if (envVal === 'false' || envVal === '0') return false;
  return Boolean(cfg.runtime.quota && cfg.runtime.quota.enabled);
}

function setQuotaEnabled(enabled) {
  quotaOverride = enabled === null ? null : Boolean(enabled);
}

function resetQuotaMemory() {
  memoryUsageEvents.length = 0;
  memoryUserPlans.clear();
}

function signId(rawId) {
  const hmac = crypto.createHmac('sha256', getSecret()).update(rawId).digest('base64url');
  return `s:${rawId}.${hmac}`;
}

function verifySignedId(cookieVal) {
  if (!cookieVal || typeof cookieVal !== 'string') return null;
  const match = cookieVal.match(/^s:([a-f0-9]{32})\.([a-zA-Z0-9_-]+)$/);
  if (!match) return null;
  const rawId = match[1];
  const sig = match[2];
  const expectedHmac = crypto.createHmac('sha256', getSecret()).update(rawId).digest('base64url');
  const bufSig = Buffer.from(sig);
  const bufExp = Buffer.from(expectedHmac);
  if (bufSig.length !== bufExp.length || !crypto.timingSafeEqual(bufSig, bufExp)) {
    return null;
  }
  return rawId;
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      cookies[k] = decodeURIComponent(v);
    }
  }
  return cookies;
}

/**
 * Derives anonymous identity.
 * Web: Signed cookie + salted IP hash.
 * Extension: Salted IP hash only (no cookies).
 * Raw IP is NEVER stored.
 */
function getAnonIdentity(req, res) {
  const isExtension =
    (req.headers['x-client'] || '').toLowerCase() === 'extension' ||
    (typeof req.headers.origin === 'string' && req.headers.origin.startsWith('chrome-extension://'));

  const clientIp = (req.headers && req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
  const ipHash = crypto.createHash('sha256').update(clientIp + ':' + getIpSalt()).digest('hex');

  if (isExtension) {
    const anonKeyHash = crypto.createHash('sha256').update('ext:' + ipHash).digest('hex');
    return { anonKeyHash, ipHash, isExtension: true };
  }

  // Web flow: read or set signed cookie
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[COOKIE_NAME];
  let rawId = verifySignedId(existing);

  if (!rawId) {
    rawId = crypto.randomBytes(16).toString('hex');
    const signed = signId(rawId);
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const cookieHeader = `${COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`;

    if (res && typeof res.setHeader === 'function') {
      const prev = res.getHeader('Set-Cookie');
      if (!prev) {
        res.setHeader('Set-Cookie', cookieHeader);
      } else if (Array.isArray(prev)) {
        res.setHeader('Set-Cookie', [...prev, cookieHeader]);
      } else {
        res.setHeader('Set-Cookie', [prev, cookieHeader]);
      }
    }
  }

  const anonKeyHash = crypto.createHash('sha256').update('web:' + rawId + ':' + ipHash).digest('hex');
  return { anonKeyHash, ipHash, isExtension: false, rawId };
}

/**
 * Returns user plan record from DB or in-memory fallback.
 */
async function getUserPlan(userId) {
  if (!userId) return { plan: 'free', started_at: null, expires_at: null };

  const client = DB.getClient();
  if (DB.getStatus() === 'connected' && client) {
    try {
      const { data, error } = await client
        .from('user_plans')
        .select('user_id, plan, started_at, expires_at')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn('[quota] getUserPlan DB error:', err.message);
    }
  }

  if (memoryUserPlans.has(userId)) {
    return memoryUserPlans.get(userId);
  }

  return { plan: 'free', started_at: null, expires_at: null };
}

/**
 * Counts usage events matching filter criteria in the current time window.
 */
async function countUsageEvents({ userId, anonKeyHash, sinceDate }) {
  const sinceIso = sinceDate.toISOString();
  let dbCount = null;

  const client = DB.getClient();
  if (DB.getStatus() === 'connected' && client) {
    try {
      let query = client.from('usage_events').select('*', { count: 'exact', head: true });
      if (userId) {
        query = query.eq('user_id', userId);
      } else if (anonKeyHash) {
        query = query.eq('anon_key_hash', anonKeyHash);
      }
      query = query.gte('created_at', sinceIso);

      const { count, error } = await query;
      if (!error && typeof count === 'number') {
        dbCount = count;
      }
    } catch (err) {
      console.warn('[quota] countUsageEvents DB error:', err.message);
    }
  }

  // Count from in-memory store
  const sinceMs = sinceDate.getTime();
  let memCount = 0;
  for (const ev of memoryUsageEvents) {
    if (ev.created_at.getTime() >= sinceMs) {
      if (userId && ev.user_id === userId) {
        memCount++;
      } else if (anonKeyHash && ev.anon_key_hash === anonKeyHash) {
        memCount++;
      }
    }
  }

  return dbCount !== null ? Math.max(dbCount, memCount) : memCount;
}

/**
 * Inserts a usage event into memory and DB.
 */
async function insertUsageEvent({ id, userId, anonKeyHash, tool, source, createdAt }) {
  const event = {
    id: id || crypto.randomUUID(),
    user_id: userId || null,
    anon_key_hash: userId ? null : (anonKeyHash || null),
    tool: tool || 'job',
    source: source || 'web',
    created_at: createdAt instanceof Date ? createdAt : new Date(createdAt || Date.now())
  };

  // Add to memory
  memoryUsageEvents.push(event);

  // Add to DB
  const client = DB.getClient();
  if (DB.getStatus() === 'connected' && client) {
    try {
      await client.from('usage_events').insert({
        id: event.id,
        user_id: event.user_id,
        anon_key_hash: event.anon_key_hash,
        tool: event.tool,
        source: event.source,
        created_at: event.created_at.toISOString()
      });
    } catch (err) {
      console.warn('[quota] insertUsageEvent DB error:', err.message);
    }
  }

  return event;
}

/**
 * Deletes a reserved usage event (used for atomic rollback on failed check).
 */
async function deleteUsageEvent(eventId) {
  if (!eventId) return;

  // Remove from memory
  const idx = memoryUsageEvents.findIndex(e => e.id === eventId);
  if (idx !== -1) {
    memoryUsageEvents.splice(idx, 1);
  }

  // Remove from DB
  const client = DB.getClient();
  if (DB.getStatus() === 'connected' && client) {
    try {
      await client.from('usage_events').delete().eq('id', eventId);
    } catch (err) {
      console.warn('[quota] deleteUsageEvent DB error:', err.message);
    }
  }
}

/**
 * Purges all quota events and plans for a user on account deletion.
 */
async function deleteUserQuotaData(userId) {
  if (!userId) return;
  memoryUserPlans.delete(userId);
  for (let i = memoryUsageEvents.length - 1; i >= 0; i--) {
    if (memoryUsageEvents[i].user_id === userId) {
      memoryUsageEvents.splice(i, 1);
    }
  }

  const client = DB.getClient();
  if (DB.getStatus() === 'connected' && client) {
    try {
      await client.from('usage_events').delete().eq('user_id', userId);
      await client.from('user_plans').delete().eq('user_id', userId);
    } catch (err) {
      console.warn('[quota] deleteUserQuotaData DB error:', err.message);
    }
  }
}

/**
 * Calculates user/device entitlement.
 * Returns { kind, plan, limit, used, remaining, resetsAt, action, unlimited? }
 */
async function getEntitlement(req, res) {
  const userId = req.user?.id || null;
  const { anonKeyHash } = getAnonIdentity(req, res);

  if (!isQuotaEnabled()) {
    const userPlanRec = userId ? await getUserPlan(userId) : { plan: 'free' };
    return {
      kind: userId ? (userPlanRec.plan === 'pro' ? 'pro' : 'free') : 'anonymous',
      plan: userPlanRec.plan || 'free',
      limit: null,
      used: 0,
      remaining: null,
      resetsAt: null,
      action: null,
      unlimited: true
    };
  }

  const istWindow = getIstMonthWindow();

  if (!userId) {
    // Anonymous user
    const limit = LIMITS.anonymousLimit;
    const used = await countUsageEvents({ anonKeyHash, sinceDate: istWindow.start });
    const remaining = Math.max(0, limit - used);
    const action = remaining === 0 ? 'sign_in' : null;

    return {
      kind: 'anonymous',
      plan: 'free',
      limit,
      used,
      remaining,
      resetsAt: istWindow.resetsAt.toISOString(),
      action
    };
  }

  // Signed-in user: check plan
  const userPlanRec = await getUserPlan(userId);
  const plan = userPlanRec.plan || 'free';
  const now = Date.now();
  const expiresAt = userPlanRec.expires_at ? new Date(userPlanRec.expires_at) : null;
  const isProActive = plan === 'pro' && (!expiresAt || now <= expiresAt.getTime());

  if (isProActive) {
    const limit = LIMITS.proLimit;
    const startedAt = userPlanRec.started_at ? new Date(userPlanRec.started_at) : istWindow.start;
    const used = await countUsageEvents({ userId, sinceDate: startedAt });
    const remaining = Math.max(0, limit - used);
    const action = remaining === 0 ? 'renew' : null;

    return {
      kind: 'pro',
      plan: 'pro',
      limit,
      used,
      remaining,
      resetsAt: expiresAt ? expiresAt.toISOString() : null,
      action
    };
  }

  // Signed-in Free user (or expired Pro pass falling back to Free):
  // "used = (their own usage this month) + (anonymous usage from this same device/IP this month). Allowance = 5."
  const limit = LIMITS.freeSignedTotal;
  const userChecks = await countUsageEvents({ userId, sinceDate: istWindow.start });
  const anonDeviceChecks = await countUsageEvents({ anonKeyHash, sinceDate: istWindow.start });
  const used = userChecks + anonDeviceChecks;
  const remaining = Math.max(0, limit - used);
  const action = remaining === 0 ? 'upgrade' : null;

  return {
    kind: 'free',
    plan: 'free',
    limit,
    used,
    remaining,
    resetsAt: istWindow.resetsAt.toISOString(),
    action
  };
}

/**
 * Quota middleware for screening endpoints:
 * /api/verify (job), /api/upi/check, /api/message/check
 * Atomically reserves a slot; rolls back if check does not count or fails.
 */
async function quotaMiddleware(req, res, next) {
  if (!isQuotaEnabled()) {
    return next();
  }

  // Determine tool
  const path = (req.path || req.originalUrl || '').toLowerCase();
  let tool = 'job';
  if (path.includes('upi')) {
    tool = 'upi';
  } else if (path.includes('message')) {
    tool = 'message';
  }

  const { anonKeyHash } = getAnonIdentity(req, res);
  const source = (req.headers['x-client'] || '').toLowerCase() === 'extension' ? 'extension' : 'web';

  try {
    const entitlement = await getEntitlement(req, res);

    if (entitlement.remaining <= 0) {
      return res.status(429).json({
        error: 'quota_exceeded',
        code: 'QUOTA_EXCEEDED',
        action: entitlement.action,
        used: entitlement.used,
        limit: entitlement.limit,
        resetsAt: entitlement.resetsAt
      });
    }

    // Atomically reserve the slot
    const eventId = crypto.randomUUID();
    await insertUsageEvent({
      id: eventId,
      userId: req.user?.id || null,
      anonKeyHash,
      tool,
      source,
      createdAt: new Date()
    });

    // Re-verify against race conditions
    const updatedEntitlement = await getEntitlement(req, res);
    if (updatedEntitlement.used > updatedEntitlement.limit) {
      // Over capacity: another concurrent request consumed the slot
      await deleteUsageEvent(eventId);
      return res.status(429).json({
        error: 'quota_exceeded',
        code: 'QUOTA_EXCEEDED',
        action: updatedEntitlement.action,
        used: updatedEntitlement.used - 1,
        limit: updatedEntitlement.limit,
        resetsAt: updatedEntitlement.resetsAt
      });
    }

    // Setup atomic rollback if check fails or should not count:
    // "Do NOT count: validation errors (400), rate-limit rejections, AI unavailable / unable results with mode ai_unavailable, or server errors."
    let released = false;
    const rollback = async () => {
      if (released) return;
      released = true;
      try {
        await deleteUsageEvent(eventId);
      } catch (err) {
        console.warn('[quota] rollback error:', err.message);
      }
    };

    req.usageEventId = eventId;
    req.releaseQuotaSlot = rollback;

    // Intercept res.json to inspect result before sending
    const origJson = res.json.bind(res);
    res.json = function (body) {
      const isAiUnavailable =
        body &&
        (body.mode === 'ai_unavailable' ||
          body.reason === 'ai_unavailable' ||
          body.error === 'AI_UNAVAILABLE' ||
          body.isUnavailable === true);

      const shouldRollback =
        res.statusCode === 400 ||
        res.statusCode === 429 ||
        res.statusCode >= 500 ||
        isAiUnavailable;

      if (shouldRollback) {
        rollback();
      }

      return origJson(body);
    };

    // Also guard against socket closure or unhandled response termination
    res.on('close', () => {
      if (res.statusCode >= 400 && !res.writableEnded) {
        rollback();
      }
    });

    res.on('finish', () => {
      if (res.statusCode === 400 || res.statusCode === 429 || res.statusCode >= 500) {
        rollback();
      }
    });

    return next();
  } catch (err) {
    console.warn('[quota] Middleware error, failing open:', err.message);
    return next();
  }
}

/**
 * Route handler for GET /api/usage
 */
async function usageRoute(req, res) {
  try {
    const entitlement = await getEntitlement(req, res);
    return res.json(entitlement);
  } catch (err) {
    console.error('[quota] usageRoute error:', err);
    return res.status(500).json({ error: 'Failed to fetch usage' });
  }
}

/**
 * Route handler for GET /api/quota (backward compatibility for existing tests/pages)
 */
async function quotaRoute(req, res) {
  try {
    const entitlement = await getEntitlement(req, res);
    return res.json({
      enabled: isQuotaEnabled(),
      limit: entitlement.limit,
      used: entitlement.used,
      remaining: entitlement.remaining,
      resetsAt: entitlement.resetsAt,
      action: entitlement.action,
      requiresLogin: entitlement.kind === 'anonymous' && entitlement.remaining === 0,
      unlimited: entitlement.unlimited || false
    });
  } catch (err) {
    console.error('[quota] quotaRoute error:', err);
    return res.status(500).json({ error: 'Failed to fetch quota' });
  }
}

module.exports = {
  isQuotaEnabled,
  setQuotaEnabled,
  resetQuotaMemory,
  signId,
  verifySignedId,
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
};
