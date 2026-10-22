'use strict';
const cfg = require('../config');
const upiConfig = require('../config/upi-rules.json');

const env = k => (process.env[k] || '').trim();
const EV = cfg.runtime.evidence;
const H = cfg.runtime.http;

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  } catch (e) {
    // fallback
  }
  return R.fallbackUrl;
}

async function rdap(domain) {
  try {
    const base = await rdapBase(domain.split('.').pop().toLowerCase());
    const r = await http(base + domain, { headers: { Accept: 'application/rdap+json' } }, EV.rdap.timeoutMs);
    if (!r.ok) return { checked: false, reason: 'http ' + r.status };
    const d = await r.json();
    const reg = (d.events || []).find(e => e.eventAction === 'registration');
    const ent = (d.entities || []).find(e => (e.roles || []).includes('registrar'));
    const fn = ent && ent.vcardArray && (ent.vcardArray[1].find(x => x[0] === 'fn') || [])[3];
    return reg ? { checked: true, createdAt: reg.eventDate, registrar: fn } : { checked: false, reason: 'no registration date published' };
  } catch (e) {
    return { checked: false, reason: (e && e.name === 'AbortError') ? 'timeout' : 'lookup failed' };
  }
}

async function urlhaus(url) {
  const key = env('URLHAUS_AUTH_KEY');
  if (!key) return { checked: false, reason: 'no key' };
  try {
    const r = await http(EV.urlhaus.url, {
      method: 'POST',
      headers: { 'Auth-Key': key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url })
    }, EV.urlhaus.timeoutMs);
    if (!r.ok) return { checked: false, reason: 'http ' + r.status };
    const d = await r.json();
    if (d.query_status === 'ok') return { checked: true, listed: true, threat: d.threat };
    if (d.query_status === 'no_results') return { checked: true, listed: false };
    return { checked: false, reason: 'status ' + d.query_status };
  } catch (e) {
    return { checked: false, reason: (e && e.name === 'AbortError') ? 'timeout' : 'lookup error' };
  }
}

async function virustotal(url) {
  const key = env('VT_API_KEY');
  if (!key) return { checked: false, reason: 'no key' };
  try {
    const h = { 'x-apikey': key };
    const id = Buffer.from(url).toString('base64url');
    const r = await http(EV.virustotal.urlBase + '/' + id, { headers: h }, EV.virustotal.timeoutMs);
    if (r.status === 404) return { checked: true, malicious: 0, suspicious: 0, harmless: 0, note: 'not in database' };
    if (!r.ok) return { checked: false, reason: 'http ' + r.status };
    const s = (await r.json()).data.attributes.last_analysis_stats;
    if (!s) return { checked: false, reason: 'analysis pending' };
    return { checked: true, malicious: s.malicious || 0, suspicious: s.suspicious || 0, harmless: s.harmless || 0 };
  } catch (e) {
    return { checked: false, reason: (e && e.name === 'AbortError') ? 'timeout' : 'lookup error' };
  }
}

// 24-hour in-memory cache for link lookups
const linkCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function extractLinks(text) {
  if (typeof text !== 'string') return [];
  const re = /\b(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`]+|\b[a-zA-Z0-9-]+\.(?:com|org|net|xyz|top|info|site|online|live|tech|app|in|co|io)\b[^\s<>"'{}|\\^`]*/gi;
  const matches = text.match(re) || [];
  const normalized = [];
  const seen = new Set();

  for (const raw of matches) {
    let clean = raw.replace(/[.,;:!?]+$/, '');
    let url = clean;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    try {
      const u = new URL(url);
      if (!seen.has(u.href)) {
        seen.add(u.href);
        normalized.push({ raw: clean, href: u.href, host: u.hostname.toLowerCase(), pathname: u.pathname });
      }
    } catch (e) {
      // invalid URL
    }
    if (normalized.length >= 3) break; // at most 3 links
  }
  return normalized;
}

const BRAND_DOMAINS = {
  'sbi': ['sbi.co.in', 'onlinesbi.sbi', 'onlinesbi.com'],
  'hdfc': ['hdfcbank.com', 'hdfc.com'],
  'icici': ['icicibank.com'],
  'axis': ['axisbank.com'],
  'paytm': ['paytm.com'],
  'phonepe': ['phonepe.com'],
  'google': ['google.com', 'google.co.in', 'gpay.app'],
  'amazon': ['amazon.in', 'amazon.com'],
  'flipkart': ['flipkart.com'],
  'netflix': ['netflix.com'],
  'whatsapp': ['whatsapp.com'],
  'telegram': ['telegram.org', 't.me']
};

function checkBrandLookalike(hostname) {
  const host = hostname.toLowerCase();
  for (const [brand, legitDomains] of Object.entries(BRAND_DOMAINS)) {
    if (host.includes(brand)) {
      const isLegit = legitDomains.some(d => host === d || host.endsWith('.' + d));
      if (!isLegit) {
        return { suspicious: true, brand, reason: `Lookalike domain targeting ${brand.toUpperCase()} (${host})` };
      }
    }
  }
  return { suspicious: false };
}

async function inspectLinks(links, ruleAlreadyFlagged = false) {
  const results = [];
  const now = Date.now();

  for (const link of links) {
    const cacheKey = link.href;
    const cached = linkCache.get(cacheKey);
    if (cached && (now - cached.at) < CACHE_TTL_MS) {
      results.push(cached.data);
      continue;
    }

    const item = {
      url: link.href,
      host: link.host,
      isShortener: (cfg.lists.shorteners || []).includes(link.host),
      isPunycode: link.host.includes('xn--'),
      isApk: link.pathname.toLowerCase().endsWith('.apk') || link.href.toLowerCase().includes('.apk'),
      brandLookalike: checkBrandLookalike(link.host),
      urlhaus: { checked: false },
      virustotal: { checked: false },
      rdap: { checked: false }
    };

    // 1. URLhaus check first
    item.urlhaus = await urlhaus(link.href);

    // 2. VirusTotal only if URLhaus and rules did not already flag the link
    const urlhausFlagged = item.urlhaus && item.urlhaus.checked && item.urlhaus.listed;
    if (!urlhausFlagged && !ruleAlreadyFlagged && !item.isApk) {
      item.virustotal = await virustotal(link.href);
    } else {
      item.virustotal = { checked: false, reason: urlhausFlagged ? 'already flagged by URLhaus' : 'skipped' };
    }

    // 3. Domain age by RDAP
    item.rdap = await rdap(link.host);

    linkCache.set(cacheKey, { at: now, data: item });
    results.push(item);
  }

  return results;
}

function extractEmails(text) {
  if (typeof text !== 'string') return [];
  const re = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const matches = text.match(re) || [];
  const unique = [...new Set(matches.map(e => e.toLowerCase()))];
  return unique.map(email => {
    const domain = email.split('@')[1];
    const isFree = (cfg.lists.freeMail || []).includes(domain);
    const isDisposable = (cfg.lists.disposableMail || []).includes(domain);
    return {
      email,
      domain,
      isFree,
      isDisposable,
      note: 'Format valid. Claim no spam database.'
    };
  });
}

function extractPhoneNumbers(text) {
  if (typeof text !== 'string') return [];
  // Match standard Indian phone numbers (+91-9876543210, 9876543210, etc.)
  const re = /(?:\+?91[\s.-]?)?[6-9]\d{9}\b/g;
  const matches = text.match(re) || [];
  const unique = [...new Set(matches)];
  return unique.map(raw => {
    const digits = raw.replace(/\D/g, '');
    const normalized = digits.length === 10 ? `+91${digits}` : `+${digits}`;
    return {
      raw,
      normalized,
      validFormat: digits.length === 10 || (digits.length === 12 && digits.startsWith('91')),
      note: 'Format validated. No spam database queried.'
    };
  });
}

function extractUpiIds(text) {
  if (typeof text !== 'string') return [];
  const re = /\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}\b/g;
  const matches = text.match(re) || [];
  const known = new Set(upiConfig.knownHandles || []);
  const unique = [...new Set(matches.map(u => u.toLowerCase()))];
  
  // Exclude matches that are obviously emails (.com, .org, .edu, .net, .in with tld)
  const upiList = [];
  for (const m of unique) {
    const [name, handle] = m.split('@');
    // If handle has a dot with a common email domain suffix, it's likely an email unless in known handles
    if (handle.includes('.') && !known.has(handle)) {
      continue;
    }
    const isKnownHandle = known.has(handle);
    upiList.push({
      upiId: m,
      handle,
      isKnownHandle,
      note: 'Format checked against known handles. Claim no bank or owner lookup.'
    });
  }
  return upiList;
}

function extractAmounts(text) {
  if (typeof text !== 'string') return [];
  const matches = [];
  const p1 = /(?:₹|rs\.?|inr|\$|usd)\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:lakh|crore|k))?/gi;
  const p2 = /\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:rupees|rs\.?|inr|usd|lakh|crore)\b/gi;

  let m;
  while ((m = p1.exec(text)) !== null) {
    const raw = m[0].trim();
    if (raw && !matches.includes(raw)) matches.push(raw);
  }
  while ((m = p2.exec(text)) !== null) {
    const raw = m[0].trim();
    if (raw && !matches.includes(raw)) matches.push(raw);
  }
  return matches;
}


module.exports = {
  extractLinks,
  inspectLinks,
  extractEmails,
  extractPhoneNumbers,
  extractUpiIds,
  extractAmounts,
  rdap,
  urlhaus,
  virustotal
};


