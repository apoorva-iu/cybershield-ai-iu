// Cyber Shield backend: runs all checks server-side, calls the live APIs, anchors every report.
require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const C = require('./checks');
const L = require('./ledger');
const DB = require('./db');
const { analyzeDescription, analyzeDescriptionWithStatus } = require('./llm');
const { createProof } = require('./detectors/proof');
const { quotaMiddleware, usageRoute, quotaRoute, deleteUserQuotaData, getUserPlan } = require('./detectors/quota');
const createDetectorRouter = require('./detectors/routes');
const createUpiRouter = require('./upi/routes');
const createMessageRouter = require('./message/routes');
const createBillingRouter = require('./billing/routes');
const { getPaymentsMode, anonymizeUserPaymentOrders, processWebhook } = require('./billing/service');

DB.init().catch(err => {
  console.error('\n[Database] ' + err.message + '\n');
  if (module.exports.close) module.exports.close();
  process.exitCode = 1;
});

const RT = cfg.runtime, H = RT.http, LIM = RT.limits, EV = RT.evidence;
const env = k => (process.env[k] || '').trim();
const app = express();
// Keep trustProxy false for local runs; set TRUST_PROXY=1 (or security.trustProxy in config/runtime.json) when deployed behind a proxy.
const trustProxyEnv = env('TRUST_PROXY').toLowerCase();
const trustProxySetting = trustProxyEnv === '1' || trustProxyEnv === 'true'
  ? 1
  : (trustProxyEnv === '0' || trustProxyEnv === 'false' ? false : RT.security.trustProxy);
if (trustProxySetting) app.set('trust proxy', trustProxySetting === true ? 1 : trustProxySetting);
const helmetCfg = JSON.parse(JSON.stringify(RT.security.helmet));
if (helmetCfg && helmetCfg.contentSecurityPolicy && helmetCfg.contentSecurityPolicy.directives) {
  const sbUrl = env('SUPABASE_URL');
  const d = helmetCfg.contentSecurityPolicy.directives;
  const currentConnect = Array.isArray(d['connect-src']) ? d['connect-src'] : ["'self'"];
  if (sbUrl && !currentConnect.includes(sbUrl)) {
    currentConnect.push(sbUrl);
  }
  d['connect-src'] = currentConnect;
}
app.use(helmet(helmetCfg));
// Extension origins (chrome-extension://<id>) are permitted on allowed routes (POST /api/verify, POST /api/upi/check, POST /api/message/check).
const EXTENSION_ORIGIN_RE = /^chrome-extension:\/\/[a-z0-9_-]+$/i;

// Add production origin(s) to security.allowedOrigins in config/runtime.json.
app.use(cors((req, cb) => {
  const origin = req.header('Origin');
  if (!origin) return cb(null, { origin: false });
  const allowed = Array.isArray(RT.security.allowedOrigins) ? RT.security.allowedOrigins : [];
  const host = req.header('Host');
  const isSameOrigin = Boolean(host && (origin === 'http://' + host || origin === 'https://' + host));
  if (allowed.includes(origin) || isSameOrigin) {
    return cb(null, { origin });
  }

  // Extension origins (chrome-extension://<id>) are allowed ONLY for configured extension routes
  // (POST /api/verify, POST /api/upi/check, POST /api/message/check)
  // (no credentials, no cookies, no custom auth; never on /api/me, /api/scans, /api/proof/verify,
  // /api/upi/read-screenshot, /api/message/read-screenshot, etc.)
  if (typeof origin === 'string' && EXTENSION_ORIGIN_RE.test(origin)) {
    const reqPath = (req.path || '').replace(/\/+$/, '') || '/';
    const isPreflight = req.method === 'OPTIONS';
    const requestedMethod = (req.header('access-control-request-method') || 'POST').toUpperCase();
    const extensionRoutes = Array.isArray(RT.security.extensionAllowedRoutes)
      ? RT.security.extensionAllowedRoutes
      : ['/api/verify', '/api/upi/check', '/api/message/check'];
    const isAllowedExtensionRoute = extensionRoutes.includes(reqPath) && (
      req.method === 'POST' || (isPreflight && requestedMethod === 'POST')
    );
    if (isAllowedExtensionRoute) {
      return cb(null, {
        origin,
        methods: ['POST'],
        credentials: false
      });
    }
  }

  return cb(null, { origin: false });
}));

// Razorpay webhook: express.raw for this route only to verify HMAC signature
app.post('/api/billing/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const signatureHeader = req.headers['x-razorpay-signature'];
    const result = await processWebhook({
      rawBody: req.body,
      signatureHeader
    });
    return res.status(200).json(result);
  } catch (err) {
    if (err.code === 'PAYMENTS_UNAVAILABLE') {
      return res.status(503).json({ error: 'payments_unavailable' });
    }
    if (err.code === 'INVALID_SIGNATURE') {
      return res.status(400).json({ error: 'invalid_signature' });
    }
    if (err.code === 'INVALID_JSON') {
      return res.status(400).json({ error: 'invalid_json' });
    }
    console.error('[billing] webhook processing error:', err.message);
    return res.status(500).json({ error: 'Webhook processing error' });
  }
});

app.use(express.json({ limit: LIM.jsonBody }));
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400 && 'body' in err))) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  return next(err);
});
app.use(express.static(path.join(__dirname, 'public')));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const safeMessage = e => e ? ((e.name || 'Error') + ': ' + (e.code || 'unknown')) : 'Unknown Error';

/* One HTTP helper: timeout, plus a retry when the network itself fails. */
async function http(url, opt = {}, ms = H.defaultTimeoutMs) {
  let last;
  for (let a = 0; a <= H.retries; a++) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try { return await fetch(url, { ...opt, signal: c.signal }); }
    catch (e) { last = e; if (e && e.name === 'AbortError') break; if (a < H.retries) await sleep(H.retryDelayMs); }
    finally { clearTimeout(t); }
  }
  throw last;
}
function errReason(e) {
  if (e && e.name === 'AbortError') return 'timeout';
  const code = e && ((e.cause && e.cause.code) || e.code);
  return 'network error' + (code ? ' (' + code + ')' : '');
}
function statusReason(r) {
  if (r.status === 429) return 'http 429 (rate limit or quota)';
  if (r.status === 401 || r.status === 403) return 'http ' + r.status + ' (key rejected or not allowed)';
  return 'http ' + r.status;
}
function fail(name, reason) {
  console.warn('[evidence] ' + name + ' failed: ' + reason);   // never logs keys or URLs
  return { checked: false, reason };
}
const skipped = reason => ({ checked: false, reason });

/* ---------- live evidence ---------- */
let rdapBoot = { at: 0, map: null };
async function rdapBase(tld) {
  const R = EV.rdap;
  try {
    if (!rdapBoot.map || Date.now() - rdapBoot.at > R.bootstrapCacheMs) {
      const r = await http(R.bootstrapUrl, {}, R.timeoutMs);
      if (!r.ok) throw new Error('bootstrap ' + r.status);
      const map = new Map();
      for (const [tlds, urls] of (await r.json()).services || []) for (const t of tlds) map.set(t.toLowerCase(), urls);
      rdapBoot = { at: Date.now(), map };
    }
    const urls = rdapBoot.map.get(tld);
    if (urls && urls.length) return (urls.find(u => u.startsWith('https')) || urls[0]).replace(/\/?$/, '/') + 'domain/';
  } catch (e) { console.warn('[evidence] rdap bootstrap failed, using fallback: ' + safeMessage(e)); }
  return R.fallbackUrl;
}
async function rdap(domain) {
  try {
    const base = await rdapBase(domain.split('.').pop().toLowerCase());
    const r = await http(base + domain, { headers: { Accept: 'application/rdap+json' } }, EV.rdap.timeoutMs);
    if (!r.ok) return fail('rdap', statusReason(r));
    const d = await r.json();
    const reg = (d.events || []).find(e => e.eventAction === 'registration');
    const ent = (d.entities || []).find(e => (e.roles || []).includes('registrar'));
    const fn = ent && ent.vcardArray && (ent.vcardArray[1].find(x => x[0] === 'fn') || [])[3];
    return reg ? { checked: true, createdAt: reg.eventDate, registrar: fn } : fail('rdap', 'this registry does not publish a registration date');
  } catch (e) { return fail('rdap', errReason(e)); }
}
async function urlhaus(url) {
  if (!env('URLHAUS_AUTH_KEY')) return skipped('no key');
  try {
    const r = await http(EV.urlhaus.url, {
      method: 'POST',
      headers: { 'Auth-Key': env('URLHAUS_AUTH_KEY'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url })
    }, EV.urlhaus.timeoutMs);
    if (!r.ok) return fail('urlhaus', statusReason(r));
    const d = await r.json();
    if (d.query_status === 'ok') return { checked: true, listed: true, threat: d.threat };
    if (d.query_status === 'no_results') return { checked: true, listed: false };
    return fail('urlhaus', 'unexpected answer: ' + d.query_status);
  } catch (e) { return fail('urlhaus', errReason(e)); }
}
async function virustotal(url, allowSubmit = true) {
  if (!env('VT_API_KEY')) return skipped('no key');
  try {
    const h = { 'x-apikey': env('VT_API_KEY') };
    const id = Buffer.from(url).toString('base64url');
    let r = await http(EV.virustotal.urlBase + '/' + id, { headers: h }, EV.virustotal.timeoutMs);
    if (r.status === 404 && !allowSubmit) return { checked: true, malicious: 0, suspicious: 0, harmless: 0, note: 'reachable, url not in database' };
    if (r.status === 404) {
      // unseen URL: submit it, wait briefly, then read the analysis
      const sub = await http(EV.virustotal.urlBase, { method: 'POST', headers: { ...h, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ url }) }, EV.virustotal.timeoutMs);
      if (!sub.ok) return fail('virustotal', 'submit ' + statusReason(sub));
      await sleep(EV.virustotal.submitWaitMs);
      r = await http(EV.virustotal.urlBase + '/' + id, { headers: h }, EV.virustotal.timeoutMs);
    }
    if (!r.ok) return fail('virustotal', statusReason(r));
    const s = (await r.json()).data.attributes.last_analysis_stats;
    if (!s || (s.malicious + s.suspicious + s.harmless + s.undetected) === 0) return fail('virustotal', 'submitted for scanning, result not ready yet (scan again in a minute)');
    return { checked: true, malicious: s.malicious, suspicious: s.suspicious, harmless: s.harmless };
  } catch (e) { return fail('virustotal', errReason(e)); }
}

const wikiCache = new Map();
function setWikiCache(key, data, W) {
  const now = Date.now();
  const maxEntries = W.maxCacheEntries || 500;
  for (const [k, v] of wikiCache) {
    if (now - v.at >= W.cacheMs) wikiCache.delete(k);
  }
  if (wikiCache.has(key)) wikiCache.delete(key);
  while (wikiCache.size >= maxEntries) {
    const oldestKey = wikiCache.keys().next().value;
    if (oldestKey === undefined) break;
    wikiCache.delete(oldestKey);
  }
  wikiCache.set(key, { at: now, data });
}
async function wikidata(company) {
  const W = EV.wikidata;
  if (!W.enabled || !company) return skipped('disabled');
  const hit = wikiCache.get(company);
  if (hit) {
    if (Date.now() - hit.at < W.cacheMs) {
      wikiCache.delete(company);
      wikiCache.set(company, hit);
      return hit.data;
    }
    wikiCache.delete(company);
  }
  try {
    const h = { headers: { 'User-Agent': W.userAgent } };
    const r1 = await http(W.apiUrl + '?action=wbsearchentities&search=' + encodeURIComponent(company) + '&language=en&limit=1&format=json', h, W.timeoutMs);
    if (!r1.ok) return fail('wikidata', statusReason(r1));
    const d1 = await r1.json();
    let res;
    if (!d1.search || !d1.search.length) res = { checked: true, found: false };
    else {
      const id = d1.search[0].id;
      const r2 = await http(W.apiUrl + '?action=wbgetentities&ids=' + id + '&props=claims&format=json', h, W.timeoutMs);
      if (!r2.ok) return fail('wikidata', statusReason(r2));
      const d2 = await r2.json();
      const p856 = d2.entities && d2.entities[id] && d2.entities[id].claims && d2.entities[id].claims.P856;
      const site = p856 && p856[0] && p856[0].mainsnak && p856[0].mainsnak.datavalue && p856[0].mainsnak.datavalue.value;
      res = { checked: true, found: true, website: site || null };
    }
    setWikiCache(company, res, W);
    return res;
  } catch (e) { return fail('wikidata', errReason(e)); }
}

async function places(company) {
  if (!company) return skipped('no company name');
  if (!env('GOOGLE_PLACES_KEY')) return skipped('no key');
  const P = EV.places;
  try {
    const r = await http(P.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env('GOOGLE_PLACES_KEY'), 'X-Goog-FieldMask': P.fieldMask },
      body: JSON.stringify({ textQuery: company, maxResultCount: P.maxResultCount })
    }, P.timeoutMs);
    if (!r.ok) {
      let msg = ''; try { msg = ((await r.json()).error || {}).message || ''; } catch (e) { }
      return fail('places', statusReason(r) + (msg ? ': ' + msg.slice(0, LIM.errorMessageChars) : ''));
    }
    const p = ((await r.json()).places || [])[0];
    if (!p) return { checked: true, found: false };
    const words = s => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= P.minNameWordLength);
    const shared = words(company).some(w => words(p.displayName && p.displayName.text).includes(w));
    if (!shared) return { checked: true, found: false, unreliable: true };
    return { checked: true, found: true, name: p.displayName && p.displayName.text, address: p.formattedAddress,
      website: p.websiteUri, rating: p.rating, reviews: p.userRatingCount, status: p.businessStatus };
  } catch (e) { return fail('places', errReason(e)); }
}

/* ---------- routes ---------- */
app.get('/api/health', (req, res) => {
  if (!RT.security.publicHealth) return res.json({ ok: true, db: DB.getStatus() });
  return res.json({ ok: true, db: DB.getStatus() });
});


const deletedUserIds = new Map();
function pruneDeletedUserIds(now = Date.now()) {
  for (const [id, expiresAt] of deletedUserIds) {
    if (now >= expiresAt) deletedUserIds.delete(id);
  }
}
function markUserDeleted(userId) {
  const now = Date.now();
  pruneDeletedUserIds(now);
  const ttlMs = (RT.security && RT.security.deletedUserTtlMs) || 3600000;
  deletedUserIds.set(userId, now + ttlMs);
}
function isUserDeleted(userId) {
  const now = Date.now();
  pruneDeletedUserIds(now);
  const exp = deletedUserIds.get(userId);
  return exp !== undefined && now < exp;
}

async function verifyBearerToken(authHeader) {
  if (typeof authHeader !== 'string') return { ok: false };
  const m = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (!m) return { ok: false };
  const token = m[1];
  const maxTokenLen = (RT.security && RT.security.maxLengths && RT.security.maxLengths.token) || 4096;
  if (!token || token.length > maxTokenLen) return { ok: false };
  const client = DB.getClient();
  if (!client || !client.auth || typeof client.auth.getUser !== 'function') {
    return { ok: false };
  }
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data || !data.user || typeof data.user.id !== 'string' || !data.user.id) {
      return { ok: false };
    }
    if (isUserDeleted(data.user.id)) {
      return { ok: false };
    }
    return {
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email || null,
        user_metadata: data.user.user_metadata || {},
        created_at: data.user.created_at || null
      }
    };
  } catch (err) {
    return { ok: false };
  }
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers && req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const result = await verifyBearerToken(authHeader);
  if (!result.ok) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = result.user;
  return next();
}

async function optionalAuth(req, res, next) {
  const origin = req.header('Origin');
  if (typeof origin === 'string' && EXTENSION_ORIGIN_RE.test(origin)) {
    req.user = null;
    return next();
  }
  const authHeader = req.headers && req.headers.authorization;
  if (!authHeader) {
    req.user = null;
    return next();
  }
  const result = await verifyBearerToken(authHeader);
  req.user = result.ok ? result.user : null;
  return next();
}

function getUserIdFromRequest(req) {
  return (req && req.user && typeof req.user.id === 'string' && req.user.id) ? req.user.id : null;
}

const userRateCfg = RT.security.userRateLimit;
const profileUpdateRateCfg = RT.security.profileUpdateRateLimit;
const signedInVerifyRateCfg = RT.security.verifyRateLimitSignedIn;

const userLimiter = rateLimit({
  windowMs: userRateCfg.windowMs,
  max: userRateCfg.max,
  keyGenerator: (req) => (req.user && req.user.id) ? 'user:' + req.user.id : 'anon',
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' })
});

const profileUpdateLimiter = rateLimit({
  windowMs: profileUpdateRateCfg.windowMs,
  max: profileUpdateRateCfg.max,
  keyGenerator: (req) => (req.user && req.user.id) ? 'profile:' + req.user.id : 'anon',
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many profile updates. Please wait a minute and try again.' })
});

const verifyLimiterMin = rateLimit({
  windowMs: 60000,
  max: RT.security.verifyRateLimit.perMinute,
  skip: (req) => Boolean(req.user && req.user.id),
  handler: (req, res) => res.status(429).json({ error: "Too many scans. Please wait a minute and try again." })
});
const verifyLimiterDay = rateLimit({
  windowMs: 86400000,
  max: RT.security.verifyRateLimit.perDay,
  skip: (req) => Boolean(req.user && req.user.id),
  handler: (req, res) => res.status(429).json({ error: "Too many scans. Please wait a minute and try again." })
});

const verifySignedInLimiterMin = rateLimit({
  windowMs: 60000,
  max: signedInVerifyRateCfg.perMinute,
  keyGenerator: (req) => req.user.id,
  skip: (req) => !(req.user && req.user.id),
  validate: false,
  handler: (req, res) => res.status(429).json({ error: "Too many scans. Please wait a minute and try again." })
});
const verifySignedInLimiterDay = rateLimit({
  windowMs: 86400000,
  max: signedInVerifyRateCfg.perDay,
  keyGenerator: (req) => req.user.id,
  skip: (req) => !(req.user && req.user.id),
  validate: false,
  handler: (req, res) => res.status(429).json({ error: "Too many scans. Please wait a minute and try again." })
});

app.post('/api/verify', optionalAuth, quotaMiddleware, verifyLimiterMin, verifyLimiterDay, verifySignedInLimiterMin, verifySignedInLimiterDay, async (req, res) => {
  if (typeof req.body !== 'object' || req.body === null) return res.status(400).json({ error: 'Invalid JSON body' });
  const allowedKeys = ['url', 'company', 'email', 'desc'];
  for (const k of Object.keys(req.body)) if (!allowedKeys.includes(k)) return res.status(400).json({ error: 'Unknown field: ' + k });
  const b = req.body || {};
  const len = RT.security.maxLengths;
  if ((b.url && typeof b.url !== 'string') || (b.url && b.url.length > len.url)) return res.status(400).json({ error: 'URL too long or invalid' });
  if ((b.company && typeof b.company !== 'string') || (b.company && b.company.length > len.company)) return res.status(400).json({ error: 'Company too long or invalid' });
  if ((b.email && typeof b.email !== 'string') || (b.email && b.email.length > len.email)) return res.status(400).json({ error: 'Email too long or invalid' });
  if ((b.desc && typeof b.desc !== 'string') || (b.desc && b.desc.length > len.desc)) return res.status(400).json({ error: 'Description too long or invalid' });

  const inp = {
    url: String(b.url || '').trim(),
    company: String(b.company || '').trim(),
    email: String(b.email || '').trim(),
    desc: String(b.desc || '').trim() // don't slice, already checked length
  };
if (!inp.url && !inp.desc.trim()) return res.status(400).json({ error: 'Provide a job URL or a job description.' });

  const p = C.parseUrl(inp.url);
  const valid = p && !p.bad;
  const full = valid ? p.u.href : inp.url;
  const noLink = skipped('no valid link');
  const [rd, uh, vt, pl, aiOut, wd] = await Promise.all([
    valid ? rdap(p.reg) : noLink,
    valid ? urlhaus(full) : noLink,
    valid ? virustotal(full) : noLink,
    places(inp.company),
    inp.desc.trim() ? analyzeDescriptionWithStatus(inp.desc) : { result: null, status: 'no description' },
    wikidata(inp.company)
  ]);
  const ai = aiOut ? aiOut.result : null;
  const ev = { rdap: rd, urlhaus: uh, virustotal: vt, places: pl, wikidata: wd };

  const desc = C.checkDesc(inp);
  if (ai && desc.score != null) {
    desc.score = Math.max(desc.score, ai.risk);
    desc.state = C.stateOf(desc.score);
    ai.reasons.forEach(t => desc.notes.push({ s: ai.risk >= cfg.scoring.ai.warnAtRisk ? 'warn' : 'info', t: 'AI reading: ' + t }));
    if (ai.scamType && ai.scamType !== 'none') desc.notes.push({ s: 'warn', t: 'AI detected scam type: ' + ai.scamType });
  }
  const checks = [C.checkUrl(inp), desc, C.checkCompany(inp, ev), C.checkRecruiter(inp), C.checkSecurity(inp, ev)];
  const { answered: sourcesAnswered, expected: sourcesExpected } = C.countSources(inp, ev, ai);
  const overall = C.combine(checks, { sourcesAnswered, sourcesExpected });
  const used = [rd.checked && 'RDAP', uh.checked && 'URLhaus', vt.checked && 'VirusTotal', pl.checked && 'Google Places', ai && 'AI reading', wd.checked && 'Wikidata'].filter(Boolean);
  const evidenceStatus = Object.fromEntries(Object.entries({ rdap: rd, urlhaus: uh, virustotal: vt, places: pl, wikidata: wd }).map(([k, v]) => [k, v.checked ? 'ok' : v.reason || 'failed']));
  const numLive = used.length;
  if (numLive < RT.evidence.minLiveSources) overall.limitedEvidence = true;
  evidenceStatus.ai = ai ? 'ok' : ((aiOut && aiOut.status) || (inp.desc.trim() ? 'no key' : 'no description'));

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    input: { url: inp.url, company: inp.company, recruiterEmail: inp.email, descriptionSha256: inp.desc.trim() ? L.sha(inp.desc.trim()) : null },
    checks: checks.map(c => ({ key: c.key, title: c.title, state: c.state, score: c.score, findings: c.notes.map(n => ({ severity: n.s, text: n.t })) })),
    overall: {
      level: overall.level,
      score: overall.score,
      confidence: overall.confidence,
      limitedEvidence: !!overall.limitedEvidence,
      sourcesAnswered: overall.sourcesAnswered,
      sourcesExpected: overall.sourcesExpected
    },
    sources: used
  };

  const {
    reportHash,
    proofId,
    accessCode,
    proofKey,
    blk,
    proofSaved,
    proofReason,
    receipt
  } = await createProof(report, overall.level, req.hostname);

  let saved = false;
  const dbCfg = cfg.runtime.database;
  if (dbCfg && dbCfg.saveScans) {
    try {
      const userId = getUserIdFromRequest(req);
      let expiresAt = null;
      if (userId === null) {
        const retentionDays = (dbCfg.retention && dbCfg.retention.anonymousScanDays) ?? 30;
        if (typeof retentionDays === 'number' && retentionDays > 0) {
          expiresAt = new Date(Date.now() + retentionDays * 86400000).toISOString();
        }
      }

      const scanRow = {
        proof_id: proofId,
        proof_key: proofKey,
        level: overall.level,
        score: overall.score != null ? overall.score : null,
        confidence: overall.confidence != null ? overall.confidence : null,
        report,
        limited_evidence: !!(report.overall && report.overall.limitedEvidence),
        user_id: userId,
        expires_at: expiresAt
      };

      const client = DB.getClient();
      if (!client) {
        console.warn('[database] save scan failed: database disconnected');
      } else {
        const tableName = dbCfg.tables.scans;
        const { error } = await client.from(tableName).insert(scanRow);
        if (error) {
          const safeReason = error.code || (error.message && error.message.replace(/https?:\/\/\S+/gi, '[url]')) || 'insert failed';
          console.warn('[database] save scan failed: ' + safeReason);
        } else {
          saved = true;
        }
      }
    } catch (err) {
      const safeReason = (err && (err.code || err.message)) ? String(err.code || err.message).replace(/https?:\/\/\S+/gi, '[url]') : 'insert error';
      console.warn('[database] save scan failed: ' + safeReason);
    }
  }

  if (req.recordQuotaUsage) {
    await req.recordQuotaUsage();
  }

  res.json({
    report,
    level: overall.level,
    headline: C.LV[overall.level],
    live: overall.live,
    evidenceStatus,
    proofId,
    accessCode,
    block: blk ? blk.index : null,
    blockHash: blk ? blk.hash : null,
    timestamp: blk ? blk.timestamp : null,
    receipt,
    saved,
    proofSaved,
    ...(!proofSaved && proofReason ? { proofReason, reason: proofReason } : {})
  });
});

app.get('/api/usage', optionalAuth, usageRoute);
app.get('/api/quota', optionalAuth, quotaRoute);

// Direct URL for static zip must return 404
app.get('/downloads/cyber-shield-extension.zip', (req, res) => {
  return res.status(404).json({ error: 'Not found' });
});

// Pro-gated extension zip download endpoint
app.get('/api/extension/download', requireAuth, userLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const userPlanRec = await getUserPlan(userId);
    const plan = userPlanRec.plan || 'free';
    const now = Date.now();
    const expiresAt = userPlanRec.expires_at ? new Date(userPlanRec.expires_at) : null;
    const isProActive = plan === 'pro' && (!expiresAt || now <= expiresAt.getTime());

    if (!isProActive) {
      return res.status(403).json({ error: 'pro_required' });
    }

    const zipPath = path.join(__dirname, 'private', 'cyber-shield-extension.zip');
    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({ error: 'Extension package not found' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="cyber-shield-extension.zip"');
    const stream = fs.createReadStream(zipPath);
    stream.pipe(res);
  } catch (err) {
    console.error('[extension/download] Error:', err);
    return res.status(500).json({ error: 'Failed to download extension package' });
  }
});

app.use(createDetectorRouter(optionalAuth));
app.use(createUpiRouter(optionalAuth));
app.use(createMessageRouter(optionalAuth));
app.use(createBillingRouter(requireAuth));


/* ---------- diagnose: open http://localhost:PORT/api/diagnose in the browser (local machine only) ---------- */
app.set('json spaces', 2);
app.get('/api/diagnose', async (req, res) => {
  const D = RT.diagnose;
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found' });
  const local = RT.security.diagnoseLocalAddresses.includes(req.socket.remoteAddress);
  if (!D.enabled || !local) return res.status(404).json({ error: 'Not found' });
  const timed = async (fn) => { const t = Date.now(); const q = await fn(); const ok = !!(q && q.checked) || !!(q && q.createdAt); return { ok, detail: ok ? 'working' : (q && q.reason) || 'failed', ms: Date.now() - t }; };
  const [rd, uh, vt, pl] = await Promise.all([
    timed(() => rdap(D.rdapDomain)),
    timed(() => urlhaus(D.urlhausUrl)),
    timed(() => virustotal(D.virustotalUrl, false)),
    timed(() => places(D.placesQuery))
  ]);
  res.json({
    keysPresent: { virustotal: !!env('VT_API_KEY'), urlhaus: !!env('URLHAUS_AUTH_KEY'), googlePlaces: !!env('GOOGLE_PLACES_KEY'), llm: !!(env('LLM_PROVIDER') === 'gemini' ? env('GEMINI_API_KEY') : env('ANTHROPIC_API_KEY')), llmProvider: env('LLM_PROVIDER') || null },
    liveTests: { rdap: rd, urlhaus: uh, virustotal: vt, googlePlaces: pl }
  });
});

const proofLimiter = rateLimit({
  windowMs: cfg.runtime.proof.rateLimit.windowMs,
  max: cfg.runtime.proof.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
});


app.post('/api/proof/verify', optionalAuth, proofLimiter, async (req, res) => {
  if (typeof req.body !== 'object' || req.body === null) return res.status(400).json({ error: 'Invalid JSON body' });
  const allowedKeys = ['proofId', 'accessCode', 'hash', 'receipt'];
  for (const k of Object.keys(req.body)) if (!allowedKeys.includes(k)) return res.status(400).json({ error: 'Unknown field: ' + k });
  
  const b = req.body || {};
  const len = RT.security.maxLengths;
  if (b.proofId && (typeof b.proofId !== 'string' || b.proofId.length > len.proofId)) return res.status(400).json({ error: 'Invalid proofId' });
  if (b.accessCode && (typeof b.accessCode !== 'string' || b.accessCode.length > len.accessCode)) return res.status(400).json({ error: 'Invalid accessCode' });
  if (b.hash && (typeof b.hash !== 'string' || b.hash.length > len.hash)) return res.status(400).json({ error: 'Invalid hash' });
  

  let proofId, accessCode, report, hashProvided;
  const isReceipt = !!b.receipt;

  if (isReceipt) {
    const r = b.receipt;
    if (typeof r !== 'object' || r.format !== cfg.runtime.proof.receiptFormat || !r.proofId || !r.accessCode || !r.report) {
      return res.json({ status: "not_found" });
    }
    const size = JSON.stringify(r).length;
    if (size > 100000) return res.json({ status: "not_found" });

    proofId = r.proofId;
    accessCode = r.accessCode;
    report = r.report;
  } else {
    proofId = b.proofId;
    accessCode = b.accessCode;
    hashProvided = b.hash;
  }

  const P = cfg.runtime.proof;
  const store = L.getStorage();
  let chain;
  try {
    chain = await store.getAll();
  } catch (err) {
    return res.status(503).json({ error: 'Ledger storage unavailable' });
  }
  const block = typeof proofId === 'string' ? chain.find(blk => (P.proofIdPrefix + blk.reportHash.slice(0, P.proofIdHexLength).toUpperCase()) === proofId) : null;

  const steps = [];
  const addStep = (id, title, passed, detail) => {
    steps.push({ id, title, passed, detail });
    return passed;
  };

  const verifiedAt = new Date().toISOString();
  let tool = 'Job Scam Check';
  const rawTool = (report && (report.tool || (report.input && report.input.kind))) || (block && block.meta && (block.meta.tool || block.meta.kind));
  if (rawTool === 'upi' || rawTool === 'upi-payment-check') {
    tool = 'UPI and Payment Check';
  } else if (rawTool === 'message' || rawTool === 'message-scanner') {
    tool = 'Message Scanner';
  } else if (rawTool === 'job' || rawTool === 'job-scam-check') {
    tool = 'Job Scam Check';
  }

  const subject = block ? {
    proofId,
    block: block.index,
    timestamp: block.timestamp,
    tool
  } : null;

  let overallStatus = "intact";
  let summary = "The ledger record is intact and verified.";
  let content = null;

  const failLedger = (summaryText) => res.json({ status: "ledger_altered", verifiedAt, subject, steps, content, summary: summaryText });

  if (typeof proofId !== 'string' || (!accessCode && !hashProvided)) {
    return res.json({ status: "not_found", verifiedAt, subject: null, steps, content: null, summary: "Invalid input." });
  }

  if (!addStep('a', 'Record found for this Proof ID', !!block, block ? `Found block ${block.index}` : 'No matching block found')) {
    return res.json({ status: "not_found", verifiedAt, subject: null, steps, content: null, summary: "No record found for this Proof ID." });
  }

  if (accessCode) {
    const expectedProofKey = L.sha(accessCode + block.reportHash);
    const bufExpected = Buffer.from(expectedProofKey, 'hex');
    const bufActual = Buffer.from(block.proofKey || '', 'hex');
    if (bufExpected.length !== bufActual.length || !crypto.timingSafeEqual(bufExpected, bufActual)) {
      return res.json({ status: "not_found", verifiedAt, subject, steps, content: null, summary: "Access code is incorrect." });
    }
  }

  if (hashProvided) {
    const matchesBlock = block.hash === hashProvided;
    const matchesReport = block.reportHash.startsWith(hashProvided);
    addStep('b', 'Provided hash matches stored record', matchesBlock || matchesReport, matchesBlock ? 'Matched block hash' : (matchesReport ? 'Matched report hash' : 'Hash does not match'));
  }


  const computedBlockHash = L.sha([block.index, block.timestamp, block.reportHash, block.prevHash, block.nonce].join('|'));
  if (!addStep('c', 'Block hash matches contents', computedBlockHash === block.hash, computedBlockHash === block.hash ? 'Hash is correct' : 'Hash mismatch')) {
    return failLedger(`block ${block.index}: its stored hash does not match its contents`);
  }

  const DIFF = cfg.runtime.ledger.difficulty;
  if (!addStep('d', 'Proof-of-work meets difficulty', block.hash.startsWith(DIFF), block.hash.startsWith(DIFF) ? `Starts with ${DIFF}` : `Does not start with ${DIFF}`)) {
    return failLedger(`block ${block.index}: proof-of-work is insufficient`);
  }

  if (block.index > 0) {
    const prevBlock = chain[block.index - 1];
    const linksOk = prevBlock && block.prevHash === prevBlock.hash;
    if (!addStep('e', 'Links correctly to previous block', !!linksOk, linksOk ? `Linked to block ${block.index - 1}` : 'Link is broken')) {
      return failLedger(`block ${block.index}: its link to block ${block.index - 1} is wrong`);
    }
  } else {
    addStep('e', 'Links correctly to previous block', true, 'Genesis block');
  }

  let fPassed = true;
  let fBrokenAt = null;
  let fCount = 0;
  for (let i = block.index + 1; i < chain.length; i++) {
    const cur = chain[i];
    const prev = chain[i - 1];
    if (!cur || !prev || cur.prevHash !== prev.hash) {
      fPassed = false;
      fBrokenAt = i;
      break;
    }
    fCount++;
  }
  if (!addStep('f', 'Subsequent blocks link correctly', fPassed, fPassed ? `Checked ${fCount} blocks after this one` : `Broken at block ${fBrokenAt}`)) {
    return failLedger(`block ${fBrokenAt}: its link to block ${fBrokenAt - 1} is wrong`);
  }

  const v = L.verify(chain);
  if (!addStep('g', 'Full chain is intact', v.ok, v.ok ? `Checked ${v.blocks} blocks` : `Broken at block ${v.at}`)) {
    const brokenBlock = chain[v.at];
    let brokenPart = '';
    if (brokenBlock) {
      const computed = L.sha([brokenBlock.index, brokenBlock.timestamp, brokenBlock.reportHash, brokenBlock.prevHash, brokenBlock.nonce].join('|'));
      if (computed !== brokenBlock.hash) brokenPart = `its stored hash does not match its contents`;
      else if (!brokenBlock.hash.startsWith(DIFF)) brokenPart = `proof-of-work is insufficient`;
      else brokenPart = `its link to block ${v.at - 1} is wrong`;
    }
    return failLedger(`block ${v.at}: ${brokenPart}`);
  }

  const anchorStatus = block.txHash ? 'anchored' : (L.chainEnabled() ? 'pending' : 'not anchored');
  addStep('h', 'Anchor status', true, anchorStatus);

  if (accessCode || isReceipt) {
    if (!isReceipt) {
      content = { status: "not_checked", changedSections: [] };
    } else {
      const computedHash = L.sha(L.canon(report));
      if (computedHash === block.reportHash) {
        content = { status: "verified", changedSections: [] };
      } else {
        const changedSections = [];
        const computeSection = (sectionData) => L.sha(L.canon(sectionData) + accessCode);
        const blockSec = block.sections || {};

        if (blockSec.input !== computeSection(report.input)) changedSections.push('input');
        if (blockSec.overall !== computeSection(report.overall)) changedSections.push('overall');
        if (blockSec.meta !== computeSection({ version: report.version, generatedAt: report.generatedAt, sources: report.sources })) changedSections.push('meta');
        if (blockSec.extractedItems && blockSec.extractedItems !== computeSection(report.extractedItems)) changedSections.push('extractedItems');

        if (report.checks && Array.isArray(report.checks)) {
          report.checks.forEach(c => {
            if (blockSec[c.key] !== computeSection(c)) changedSections.push(c.key);
          });
        }
        Object.keys(blockSec).forEach(k => {
          if (k !== 'input' && k !== 'overall' && k !== 'meta' && k !== 'extractedItems' && (!report.checks || !report.checks.find(c => c.key === k))) {
            if (!changedSections.includes(k)) changedSections.push(k);
          }
        });

        if (changedSections.length === 0) {
          changedSections.push('report');
        }
        
        content = { status: "modified", changedSections };
        overallStatus = "report_modified";
        summary = "The ledger record is intact but the report contents have been modified.";
      }
    }
  }

  const stepB = steps.find(s => s.id === 'b');
  if (stepB && !stepB.passed) {
    overallStatus = "hash_mismatch";
    summary = "The hash you entered does not match the record for this Proof ID. The ledger record itself is intact.";
  }

  res.json({
    status: overallStatus,
    verifiedAt,
    subject,
    steps,
    content,
    summary
  });
});


app.get('/api/samples', (req, res) => res.json(cfg.samples));
app.get('/api/config-public', (req, res) => {
  const rawUrl = env('SUPABASE_URL');
  const rawPubKey = env('SUPABASE_PUBLISHABLE_KEY');
  const safeUrl = rawUrl.startsWith('sb_secret') ? '' : rawUrl;
  const safePubKey = rawPubKey.startsWith('sb_secret') ? '' : rawPubKey;
  const authEnabled = Boolean(safeUrl && safePubKey);
  res.json({
    etherscanLink: cfg.runtime.etherscanLink,
    authEnabled,
    supabaseUrl: safeUrl,
    supabasePublishableKey: safePubKey,
    paymentsMode: getPaymentsMode()
  });
});

const DISPLAY_NAME_RE = new RegExp(RT.security.displayNamePattern, 'u');
const SCAN_ID_RE = new RegExp(RT.security.scanIdPattern);

app.get('/api/me', requireAuth, userLimiter, async (req, res) => {
  const client = DB.getClient();
  if (!client) return res.status(503).json({ error: 'Database unavailable' });
  const profilesTable = cfg.runtime.database.tables.profiles;
  try {
    const { data, error } = await client
      .from(profilesTable)
      .select('id, display_name, avatar_url, plan, created_at')
      .eq('id', req.user.id)
      .limit(1);
    if (error) return res.status(503).json({ error: 'Could not load profile' });
    const row = Array.isArray(data) ? data[0] : data;
    return res.json({
      id: req.user.id,
      email: req.user.email || null,
      display_name: row && row.display_name !== undefined ? row.display_name : null,
      avatar_url: row && row.avatar_url !== undefined ? row.avatar_url : (req.user.user_metadata && req.user.user_metadata.avatar_url) || null,
      plan: (row && row.plan) || 'free',
      created_at: (row && row.created_at) || req.user.created_at || null
    });
  } catch (err) {
    return res.status(503).json({ error: 'Could not load profile' });
  }
});

app.patch('/api/me', requireAuth, profileUpdateLimiter, async (req, res) => {
  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  const keys = Object.keys(req.body);
  if (keys.length !== 1 || keys[0] !== 'display_name') {
    return res.status(400).json({ error: 'Only display_name can be updated' });
  }
  if (typeof req.body.display_name !== 'string') {
    return res.status(400).json({ error: 'display_name must be a string' });
  }
  const maxLen = RT.security.maxLengths.displayName;
  const trimmed = req.body.display_name.trim();
  if (trimmed.length < 1 || trimmed.length > maxLen) {
    return res.status(400).json({ error: `display_name must be between 1 and ${maxLen} characters` });
  }
  if (!DISPLAY_NAME_RE.test(trimmed)) {
    return res.status(400).json({ error: 'display_name contains invalid characters' });
  }

  const client = DB.getClient();
  if (!client) return res.status(503).json({ error: 'Database unavailable' });
  const profilesTable = cfg.runtime.database.tables.profiles;
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await client
      .from(profilesTable)
      .update({ display_name: trimmed, updated_at: nowIso })
      .eq('id', req.user.id)
      .select('id, display_name, avatar_url, plan, created_at, updated_at');
    if (error) return res.status(503).json({ error: 'Could not update profile' });
    const row = Array.isArray(data) ? data[0] : data;
    return res.json({
      id: req.user.id,
      email: req.user.email || null,
      display_name: row && row.display_name !== undefined ? row.display_name : trimmed,
      avatar_url: (row && row.avatar_url) || null,
      plan: (row && row.plan) || 'free',
      created_at: (row && row.created_at) || req.user.created_at || null
    });
  } catch (err) {
    return res.status(503).json({ error: 'Could not update profile' });
  }
});

app.delete('/api/me', requireAuth, userLimiter, async (req, res) => {
  const client = DB.getClient();
  if (!client) return res.status(503).json({ error: 'Database unavailable' });
  const scansTable = cfg.runtime.database.tables.scans;
  const profilesTable = cfg.runtime.database.tables.profiles;
  try {
    const { error: scansErr } = await client.from(scansTable).delete().eq('user_id', req.user.id);
    if (scansErr) return res.status(503).json({ error: 'Could not delete user scans' });
    const { error: profErr } = await client.from(profilesTable).delete().eq('id', req.user.id);
    if (profErr) return res.status(503).json({ error: 'Could not delete user profile' });
    try {
      await deleteUserQuotaData(req.user.id);
      await anonymizeUserPaymentOrders(req.user.id);
    } catch (quotaErr) {
      console.warn('[quota/billing] cleanup on delete user warning:', quotaErr.message);
    }
    if (!client.auth || !client.auth.admin || typeof client.auth.admin.deleteUser !== 'function') {
      return res.status(503).json({ error: 'Could not delete auth user' });
    }
    const { error: authErr } = await client.auth.admin.deleteUser(req.user.id);
    if (authErr) return res.status(503).json({ error: 'Could not delete auth user' });
    markUserDeleted(req.user.id);
    return res.json({ ok: true, deleted: true });
  } catch (err) {
    return res.status(503).json({ error: 'Could not delete account' });
  }
});

app.get('/api/scans', requireAuth, userLimiter, async (req, res) => {
  const histCfg = RT.security.scansHistory;
  let page = parseInt(req.query.page, 10);
  if (isNaN(page) || page < 1) page = 1;
  let limit = parseInt(req.query.limit, 10);
  if (isNaN(limit) || limit < 1) limit = histCfg.defaultLimit;
  if (limit > histCfg.maxLimit) limit = histCfg.maxLimit;

  const validLevels = Object.keys(cfg.scoring.verdicts);
  let levelFilter = null;
  if (req.query.level !== undefined && req.query.level !== '') {
    const lv = String(req.query.level).trim().toLowerCase();
    if (!validLevels.includes(lv)) {
      return res.status(400).json({ error: 'Invalid level filter' });
    }
    levelFilter = lv;
  }

  const client = DB.getClient();
  if (!client) return res.status(503).json({ error: 'Database unavailable' });
  const scansTable = cfg.runtime.database.tables.scans;
  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let q = client
      .from(scansTable)
      .select('id, created_at, level, score, confidence, proof_id, report', { count: 'exact' })
      .eq('user_id', req.user.id);
    if (levelFilter) {
      q = q.eq('level', levelFilter);
    }
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) return res.status(503).json({ error: 'Could not load scans' });

    const items = (Array.isArray(data) ? data : []).map(r => {
      const inp = (r.report && r.report.input) || {};
      const parsedUrl = inp.url ? C.parseUrl(inp.url) : null;
      const host = (parsedUrl && !parsedUrl.bad && parsedUrl.host) ? parsedUrl.host : null;
      const company = (typeof inp.company === 'string' && inp.company.trim()) ? inp.company.trim() : null;
      const confidence = r.confidence != null
        ? r.confidence
        : ((r.report && r.report.overall && r.report.overall.confidence != null) ? r.report.overall.confidence : null);
      return {
        id: r.id,
        createdAt: r.created_at,
        level: r.level,
        score: r.score != null ? r.score : null,
        confidence,
        proofId: r.proof_id,
        headline: (Array.isArray(C.LV[r.level]) ? C.LV[r.level][0] : C.LV[r.level]) || null,
        company,
        host
      };
    });

    return res.json({
      items,
      page,
      limit,
      total: typeof count === 'number' ? count : items.length
    });
  } catch (err) {
    return res.status(503).json({ error: 'Could not load scans' });
  }
});

app.get('/api/scans/:id', requireAuth, userLimiter, async (req, res) => {
  const maxScanIdLen = RT.security.maxLengths.scanId;
  const scanId = String(req.params.id || '').trim();
  if (!scanId || scanId.length > maxScanIdLen || !SCAN_ID_RE.test(scanId)) {
    return res.status(404).json({ error: 'Scan not found' });
  }
  const client = DB.getClient();
  if (!client) return res.status(503).json({ error: 'Database unavailable' });
  const scansTable = cfg.runtime.database.tables.scans;
  try {
    const { data, error } = await client
      .from(scansTable)
      .select('id, created_at, user_id, proof_id, level, score, confidence, report, limited_evidence')
      .eq('id', scanId)
      .eq('user_id', req.user.id)
      .limit(1);
    if (error) return res.status(503).json({ error: 'Could not load scan' });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    return res.json({
      id: row.id,
      createdAt: row.created_at,
      level: row.level,
      score: row.score != null ? row.score : null,
      confidence: row.confidence != null ? row.confidence : null,
      limitedEvidence: !!row.limited_evidence,
      proofId: row.proof_id,
      headline: C.LV[row.level] || null,
      report: row.report
    });
  } catch (err) {
    return res.status(503).json({ error: 'Could not load scan' });
  }
});

app.delete('/api/scans/:id', requireAuth, userLimiter, async (req, res) => {
  const maxScanIdLen = RT.security.maxLengths.scanId;
  const scanId = String(req.params.id || '').trim();
  if (!scanId || scanId.length > maxScanIdLen || !SCAN_ID_RE.test(scanId)) {
    return res.status(404).json({ error: 'Scan not found' });
  }
  const client = DB.getClient();
  if (!client) return res.status(503).json({ error: 'Database unavailable' });
  const scansTable = cfg.runtime.database.tables.scans;
  try {
    const { data, error } = await client
      .from(scansTable)
      .delete()
      .eq('id', scanId)
      .eq('user_id', req.user.id)
      .select('id');
    if (error) return res.status(503).json({ error: 'Could not delete scan' });
    const deletedRows = Array.isArray(data) ? data : (data ? [data] : []);
    if (deletedRows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }
    return res.json({ ok: true, deleted: true, id: scanId });
  } catch (err) {
    return res.status(503).json({ error: 'Could not delete scan' });
  }
});

app.get('/api/ledger/recent', async (req, res) => {
  const F = cfg.runtime.proof.feed;
  if (!F || !F.enabled) {
    return res.json({ enabled: false, items: [] });
  }

  let limit = parseInt(req.query.limit, 10);
  if (isNaN(limit) || limit <= 0) limit = F.defaultLimit;
  if (limit > F.maxLimit) limit = F.maxLimit;

  let before = parseInt(req.query.before, 10);
  if (isNaN(before) || before < 0) before = null;

  const P = cfg.runtime.proof;
  const store = L.getStorage();
  let c = [];
  try {
    c = await store.getAll();
  } catch (err) {
    return res.status(503).json({ enabled: true, error: 'Ledger storage unavailable', items: [] });
  }
  
  const feedItems = [];
  for (let i = c.length - 1; i >= 0; i--) {
    const b = c[i];
    if (before !== null && b.index >= before) continue;
    if (!b.proofKey) continue;
    
    feedItems.push({
      proofId: P.proofIdPrefix + b.reportHash.slice(0, P.proofIdHexLength).toUpperCase(),
      block: b.index,
      timestamp: b.timestamp,
      blockHash: b.hash
    });
    
    if (feedItems.length > limit) {
      break;
    }
  }

  let nextBefore = null;
  if (feedItems.length > limit) {
    feedItems.pop();
    nextBefore = feedItems[feedItems.length - 1].block;
  }

  res.json({
    enabled: true,
    status: L.verify(c),
    totalBlocks: c.length,
    items: feedItems,
    nextBefore
  });
});

app.get('/api/ledger', async (req, res) => {
  const store = L.getStorage();
  let c = [];
  try {
    c = await store.getAll();
  } catch (err) {
    return res.status(503).json({ error: 'Ledger storage unavailable' });
  }
  res.json({ status: L.verify(c), totalBlocks: c.length });
});

// Waitlist Rate Limiter & In-Memory Fallback
const waitlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a bit and try again.' }
});

const inMemoryWaitlist = new Set();
const WAITLIST_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const WAITLIST_PLANS = new Set(['pro']);
let waitlistTablePresent = true;

app.post('/api/waitlist', waitlistLimiter, async (req, res) => {
  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const rawEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const rawPlan = typeof req.body.plan === 'string' ? req.body.plan.trim().toLowerCase() : '';

  if (!rawEmail || rawEmail.length > 255 || !WAITLIST_EMAIL_RE.test(rawEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (!rawPlan || !WAITLIST_PLANS.has(rawPlan)) {
    return res.status(400).json({ error: 'Invalid plan. Allowed plans: pro' });
  }

  const planTitle = rawPlan.charAt(0).toUpperCase() + rawPlan.slice(1);
  const client = (waitlistTablePresent && DB.getStatus() === 'connected') ? DB.getClient() : null;

  if (client) {
    try {
      const { data, error } = await client
        .from('waitlist')
        .insert({ email: rawEmail, plan: rawPlan })
        .select('id, email, plan, created_at')
        .single();

      if (error) {
        if (error.code === '23505' || /unique/i.test(error.message)) {
          return res.status(409).json({
            error: 'already_registered',
            message: `You're already on the waitlist for the ${planTitle} plan! We'll notify you as soon as early access opens.`
          });
        }
        if (/schema cache|not find the table|does not exist/i.test(error.message)) {
          if (waitlistTablePresent) {
            console.warn('[Waitlist] Database table not found in Supabase schema cache; falling back to in-memory waitlist.');
            waitlistTablePresent = false;
          }
        } else {
          console.error('[Waitlist] Database error:', error.message);
        }
        // Fall back to memory if table is missing or DB issue
        const key = `${rawEmail}:${rawPlan}`;
        if (inMemoryWaitlist.has(key)) {
          return res.status(409).json({
            error: 'already_registered',
            message: `You're already on the waitlist for the ${planTitle} plan! We'll notify you as soon as early access opens.`
          });
        }
        inMemoryWaitlist.add(key);
        return res.json({
          ok: true,
          message: `You're on the waitlist for the ${planTitle} plan! We'll notify you as soon as early access opens.`
        });
      }

      return res.json({
        ok: true,
        message: `You're on the waitlist for the ${planTitle} plan! We'll notify you as soon as early access opens.`
      });
    } catch (err) {
      console.error('[Waitlist] Error:', err.message);
    }
  }

  // In-memory fallback if DB is not connected
  const key = `${rawEmail}:${rawPlan}`;
  if (inMemoryWaitlist.has(key)) {
    return res.status(409).json({
      error: 'already_registered',
      message: `You're already on the waitlist for the ${planTitle} plan! We'll notify you as soon as early access opens.`
    });
  }
  inMemoryWaitlist.add(key);
  return res.json({
    ok: true,
    message: `You're on the waitlist for the ${planTitle} plan! We'll notify you as soon as early access opens.`
  });
});

const port = process.env.PORT || RT.server.defaultPort;
const server = app.listen(port, () => {
  console.log('Cyber Shield on http://localhost:' + port);
  console.log('Keys present: VirusTotal=' + !!env('VT_API_KEY') + ' URLhaus=' + !!env('URLHAUS_AUTH_KEY') + ' Places=' + !!env('GOOGLE_PLACES_KEY') + ' LLM(' + (env('LLM_PROVIDER') || 'none') + ')=' + !!(env('LLM_PROVIDER') === 'gemini' ? env('GEMINI_API_KEY') : env('ANTHROPIC_API_KEY')));
});
server.getUserIdFromRequest = getUserIdFromRequest;
module.exports = server;
