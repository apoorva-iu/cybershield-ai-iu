'use strict';
const crypto = require('crypto');
const cfg = require('../config');
const DB = require('../db');

const COOKIE_NAME = 'cs_anon';
const memoryStore = new Map(); // id_hash -> { id_hash, ip_hash, count, first_seen, last_seen }
let quotaOverride = null; // null means follow config/env

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
  memoryStore.clear();
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

function getOrSetAnonCookie(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[COOKIE_NAME];
  let rawId = verifySignedId(existing);

  if (!rawId) {
    rawId = crypto.randomBytes(16).toString('hex');
    const signed = signId(rawId);
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const cookieHeader = `${COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`;
    
    // Append or set header
    const prev = res.getHeader('Set-Cookie');
    if (!prev) {
      res.setHeader('Set-Cookie', cookieHeader);
    } else if (Array.isArray(prev)) {
      res.setHeader('Set-Cookie', [...prev, cookieHeader]);
    } else {
      res.setHeader('Set-Cookie', [prev, cookieHeader]);
    }
  }

  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  const idHash = crypto.createHash('sha256').update(rawId).digest('hex');
  const ipHash = crypto.createHash('sha256').update(clientIp + ':' + getIpSalt()).digest('hex');

  return { rawId, idHash, ipHash };
}

async function getUsage(idHash, ipHash) {
  let cookieCount = 0;
  let ipDailyCount = 0;
  const client = DB.getClient();
  const dbConnected = DB.getStatus() === 'connected' && client;
  const now = Date.now();
  const twentyFourHoursAgo = new Date(now - 86400000).toISOString();

  // In-memory lookup first
  if (memoryStore.has(idHash)) {
    const entry = memoryStore.get(idHash);
    cookieCount = entry.count;
  }
  for (const entry of memoryStore.values()) {
    if (entry.ip_hash === ipHash && (now - entry.last_seen_ms) <= 86400000) {
      ipDailyCount += entry.count;
    }
  }

  if (dbConnected) {
    try {
      const table = (cfg.runtime.database && cfg.runtime.database.tables && cfg.runtime.database.tables.anonUsage) || 'anon_usage';
      const { data: idRow, error: idErr } = await client
        .from(table)
        .select('count')
        .eq('id_hash', idHash)
        .limit(1);
      if (!idErr && idRow && idRow[0]) {
        cookieCount = Math.max(cookieCount, idRow[0].count);
      }

      const { data: ipRows, error: ipErr } = await client
        .from(table)
        .select('count')
        .eq('ip_hash', ipHash)
        .gte('last_seen', twentyFourHoursAgo);
      if (!ipErr && Array.isArray(ipRows)) {
        const dbIpSum = ipRows.reduce((acc, r) => acc + (r.count || 0), 0);
        ipDailyCount = Math.max(ipDailyCount, dbIpSum);
      }
    } catch (e) {
      // Fallback to memory
    }
  }

  return { cookieCount, ipDailyCount };
}

let atomicQueue = Promise.resolve();

async function incrementAnonUsage(idHash, ipHash) {
  return new Promise((resolve, reject) => {
    atomicQueue = atomicQueue.then(async () => {
      try {
        const now = Date.now();
        const nowIso = new Date(now).toISOString();

        // Atomic update in memory
        let currentEntry = memoryStore.get(idHash);
        if (!currentEntry) {
          currentEntry = {
            id_hash: idHash,
            ip_hash: ipHash,
            count: 1,
            first_seen_ms: now,
            last_seen_ms: now
          };
        } else {
          currentEntry.count += 1;
          currentEntry.last_seen_ms = now;
          currentEntry.ip_hash = ipHash;
        }
        memoryStore.set(idHash, currentEntry);

        // Update database if connected
        const client = DB.getClient();
        if (DB.getStatus() === 'connected' && client) {
          try {
            const table = (cfg.runtime.database && cfg.runtime.database.tables && cfg.runtime.database.tables.anonUsage) || 'anon_usage';
            await client.from(table).upsert({
              id_hash: idHash,
              ip_hash: ipHash,
              count: currentEntry.count,
              first_seen: new Date(currentEntry.first_seen_ms).toISOString(),
              last_seen: nowIso
            });
          } catch (err) {
            console.warn('[quota] DB upsert failed:', err.message);
          }
        }
        resolve(currentEntry.count);
      } catch (err) {
        reject(err);
      }
    }).catch(err => reject(err));
  });
}

function quotaMiddleware(req, res, next) {
  if (!isQuotaEnabled()) {
    return next();
  }

  // Signed-in users are NEVER blocked by anonymous quota
  if (req.user && req.user.id) {
    return next();
  }

  const { idHash, ipHash } = getOrSetAnonCookie(req, res);
  const qCfg = cfg.runtime.quota || { anonymousLimit: 3, anonymousIpDailyCap: 10 };
  const anonymousLimit = qCfg.anonymousLimit != null ? qCfg.anonymousLimit : 3;
  const ipCap = qCfg.anonymousIpDailyCap != null ? qCfg.anonymousIpDailyCap : 10;

  getUsage(idHash, ipHash).then(({ cookieCount, ipDailyCount }) => {
    if (cookieCount >= anonymousLimit || ipDailyCount >= ipCap) {
      return res.status(429).json({
        error: 'Free scan limit reached. Please sign in to continue.',
        code: 'QUOTA_EXCEEDED',
        requiresLogin: true,
        limit: anonymousLimit,
        used: cookieCount
      });
    }

    // Attach atomic recorder to be called ONLY on scan success
    let recorded = false;
    req.recordQuotaUsage = async () => {
      if (recorded) return;
      recorded = true;
      try {
        await incrementAnonUsage(idHash, ipHash);
      } catch (err) {
        console.warn('[quota] Failed to increment usage:', err.message);
      }
    };

    next();
  }).catch(err => {
    console.warn('[quota] Check error, failing open for safety:', err.message);
    next();
  });
}

async function quotaRoute(req, res) {
  if (!isQuotaEnabled()) {
    return res.json({ enabled: false });
  }

  const qCfg = cfg.runtime.quota || { anonymousLimit: 3 };
  const anonymousLimit = qCfg.anonymousLimit != null ? qCfg.anonymousLimit : 3;

  if (req.user && req.user.id) {
    return res.json({
      enabled: true,
      limit: null,
      used: 0,
      remaining: null,
      requiresLogin: false
    });
  }

  const { idHash, ipHash } = getOrSetAnonCookie(req, res);
  try {
    const { cookieCount } = await getUsage(idHash, ipHash);
    const remaining = Math.max(0, anonymousLimit - cookieCount);
    return res.json({
      enabled: true,
      limit: anonymousLimit,
      used: cookieCount,
      remaining,
      requiresLogin: cookieCount >= anonymousLimit
    });
  } catch (err) {
    return res.json({
      enabled: true,
      limit: anonymousLimit,
      used: 0,
      remaining: anonymousLimit,
      requiresLogin: false
    });
  }
}

module.exports = {
  isQuotaEnabled,
  setQuotaEnabled,
  resetQuotaMemory,
  quotaMiddleware,
  quotaRoute,
  getOrSetAnonCookie,
  getUsage,
  incrementAnonUsage
};

