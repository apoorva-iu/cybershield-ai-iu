'use strict';
// Scoring logic. No lists, patterns or score values live here: they come from config/*.json
const cfg = require('./config');
const L = cfg.lists, R = cfg.rules, S = cfg.scoring;

const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
const FREE = new Set(L.freeMail);
const DISPOSABLE = new Set(L.disposableMail);
const SLD = new Set(L.secondLevelSuffixes);
const SUFFIX_RE = new RegExp('\\b(' + L.companySuffixWords + ')\\b', 'g');
const IP_RE = new RegExp(R.ipPattern);
const EMAIL_RE = new RegExp(R.emailPattern);
const HIRING_RE = new RegExp(R.hiringWordsPattern);
const ROLE_RE = new RegExp(R.roleMailboxPattern);
const RULES = R.descriptionRules.map(r => ({ id: r.id, w: r.weight, re: new RegExp(r.pattern, r.flags || ''), t: r.text, sev: r.severity }));
const hostIn = (host, list) => list.some(x => host === x || host.endsWith('.' + x));

function regDomain(host) { const p = host.split('.'); if (p.length <= 2) return host; const l2 = p.slice(-2).join('.'); return SLD.has(l2) ? p.slice(-3).join('.') : l2; }
function parseUrl(raw) { raw = (raw || '').trim(); if (!raw) return null; try { const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : 'https://' + raw); const host = u.hostname.toLowerCase().replace(/^www\./, ''); return { u, host, reg: regDomain(host), https: u.protocol === 'https:', raw }; } catch (e) { return { bad: true, raw }; } }
function slug(name) { return (name || '').toLowerCase().replace(/&/g, ' and ').replace(SUFFIX_RE, ' ').replace(/[^a-z0-9 ]/g, ' ').trim(); }
function lev(a, b) { const m = [...Array(a.length + 1)].map((_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; }
const label = d => d.split('.')[0];
function nameMatchesDomain(company, reg) { const s = slug(company); if (!s) return null; const dl = label(reg).replace(/-/g, ''); const joined = s.replace(/ /g, ''); const minLen = S.company.nameDomainMinLength; if (dl.includes(joined) || joined.includes(dl) && dl.length >= minLen) return true; return s.split(' ').filter(t => t.length >= S.company.nameTokenMinLength).some(t => dl.includes(t)); }
const isBoard = reg => hostIn(reg, L.jobBoards);
function safeUrl(raw) { try { return new URL(raw); } catch { return null; } }
function stateOf(s) { return s < S.levels.okBelow ? 'ok' : s < S.levels.warnBelow ? 'warn' : 'bad'; }

/* ---------- checks ---------- */
function checkUrl(inp) {
  const U = S.url, p = parseUrl(inp.url), notes = [];
  if (!p) return { key: 'url', title: 'Job URL', state: 'unknown', score: null, notes: [{ s: 'info', t: 'No link supplied, so the website could not be assessed.' }] };
  if (p.bad) return { key: 'url', title: 'Job URL', state: 'bad', score: U.invalid, notes: [{ s: 'bad', t: 'The link is not a valid web address.' }] };
  let s = U.base; const add = (n, sev, t) => { s += n; notes.push({ s: sev, t }); };
  const board = isBoard(p.reg);
  if (board) { s = U.knownBoard; notes.push({ s: 'ok', t: p.reg + ' is a known job platform. Check the poster and company page inside the listing.' }); }
  if (!p.https) add(U.noHttps, 'bad', 'The link does not use HTTPS.');
  if (IP_RE.test(p.host)) add(U.rawIp, 'bad', 'The link points to a raw IP address instead of a domain name.');
  if (L.shorteners.includes(p.reg)) add(U.shortener, 'bad', 'A link shortener hides the real destination.');
  const tld = p.host.split('.').pop();
  if (L.badTlds.includes(tld)) add(U.badTld, 'warn', 'The .' + tld + ' ending is common on throwaway scam sites.');
  if (hostIn(p.host, L.siteBuilders)) add(U.siteBuilder, 'warn', 'The page sits on a free site builder, not a company domain.');
  if (hostIn(p.host, L.chatAndFormHosts)) add(U.chatOrForm, 'bad', 'The link leads to a chat or form service, which real employers rarely use for postings.');
  if (p.host.includes('xn--')) add(U.punycode, 'bad', 'The domain uses punycode, which can disguise look-alike characters.');
  if (p.host.split('.').length > U.manySubdomainsOver) add(U.manySubdomains, 'warn', 'The address has an unusually long chain of subdomains.');
  if ((p.host.match(/-/g) || []).length >= U.manyHyphensAtLeast) add(U.manyHyphens, 'warn', 'The domain contains many hyphens.');
  if (/@/.test(p.raw)) add(U.atSign, 'bad', 'The link contains an @ sign, a known trick to hide the real host.');
  for (const [b, off] of Object.entries(L.brandHints)) { if (p.host.includes(b) && p.reg !== off && !board) { add(U.brandLookalike, 'bad', 'The domain uses the name "' + b + '" but is not the official domain (' + off + ').'); break; } }
  if (!board && HIRING_RE.test(label(p.reg))) add(U.hiringWords, 'warn', 'The domain name is built around hiring words, which scam sites favour.');
  if (!notes.some(n => n.s === 'bad' || n.s === 'warn') && !board) notes.push({ s: 'ok', t: 'No structural red flags found in the address.' });
  s = clamp(s); return { key: 'url', title: 'Job URL', state: stateOf(s), score: s, notes };
}

function checkDesc(inp) {
  const d = (inp.desc || '').trim();
  if (!d) return { key: 'desc', title: 'Job description', state: 'unknown', score: null, notes: [{ s: 'info', t: 'No description supplied, so scam wording could not be checked.' }] };
  let s = 0; const notes = [];
  for (const r of RULES) { const m = d.match(r.re); if (m) { s += r.w; notes.push({ s: r.sev, t: r.t + ' Found: "' + m[0].trim().slice(0, R.foundSnippetLength) + '"' }); } }
  if (d.length < R.shortDescriptionLength) { s += R.shortDescriptionPenalty; notes.push({ s: 'warn', t: 'The description is very short and vague.' }); }
  const good = R.goodSectionKeywords.filter(k => new RegExp(k, 'i').test(d)).length;
  if (good >= R.goodSectionsMin && s < R.goodSectionsScoreCeiling) { s = Math.max(0, s - R.goodSectionsReduction); notes.push({ s: 'ok', t: 'Includes structured sections such as responsibilities and requirements.' }); }
  if (!notes.length) notes.push({ s: 'ok', t: 'No known scam phrases found in the text.' });
  s = clamp(s); return { key: 'desc', title: 'Job description', state: stateOf(s), score: s, notes };
}

function checkCompany(inp, ev) {
  const C = S.company, c = (inp.company || '').trim(), p = parseUrl(inp.url), notes = []; let s = null;
  const pl = ev && ev.places;
  if (pl && pl.checked) {
    if (pl.found) {
      s = C.placesFound; notes.push({ s: 'ok', t: 'Google Places lists "' + pl.name + '"' + (pl.address ? ' at ' + pl.address : '') + '.' });
      if (pl.reviews != null) notes.push({ s: pl.reviews >= C.fewReviewsUnder ? 'ok' : 'warn', t: pl.reviews + ' Google reviews' + (pl.rating ? ' averaging ' + pl.rating + '.' : '.') });
      if (pl.reviews != null && pl.reviews < C.fewReviewsUnder) s += C.fewReviewsAdd;
      if (pl.website && p && !p.bad) { let same = false; const u = safeUrl(pl.website); if (u) { same = regDomain(u.hostname.replace(/^www\./, '')) === p.reg; } notes.push({ s: same ? 'ok' : 'warn', t: same ? 'The job link domain matches the website on the Google listing.' : 'The job link domain differs from the website on the Google listing (' + pl.website + ').' }); if (!same && !isBoard(p.reg)) s += C.websiteMismatchAdd; }
    } else { s = C.notFound; notes.push({ s: 'bad', t: 'No business named "' + c + '" was found on Google Places.' }); }
  }
  if (c && p && !p.bad && !isBoard(p.reg)) {
    const m = nameMatchesDomain(c, p.reg);
    if (m) { notes.push({ s: 'ok', t: 'The company name appears in the job domain (' + p.reg + ').' }); s = s == null ? C.nameMatchNoPlaces : s; }
    else { notes.push({ s: 'warn', t: 'The company name does not appear in the job domain (' + p.reg + ').' }); s = s == null ? C.nameMismatchNoPlaces : Math.min(C.maxScore, s + C.nameMismatchWithPlacesAdd); }
  }
  if (!c) return { key: 'company', title: 'Company verification', state: 'unknown', score: null, notes: [{ s: 'info', t: 'No company name supplied.' }] };
  if (s == null) notes.push({ s: 'info', t: 'Not enough evidence to judge the company. Enable the backend for Google Places lookups.' });
  else if (!(pl && pl.checked)) notes.push({ s: 'info', t: 'Google Places was not queried. Enable the backend for a real-world business lookup.' });
  s = s == null ? null : clamp(s); return { key: 'company', title: 'Company verification', state: s == null ? 'unknown' : stateOf(s), score: s, notes };
}

function checkRecruiter(inp) {
  const K = S.recruiter, e = (inp.email || '').trim().toLowerCase(), notes = [];
  if (!e) return { key: 'recruiter', title: 'Recruiter verification', state: 'unknown', score: null, notes: [{ s: 'info', t: 'No recruiter email supplied.' }] };
  if (!EMAIL_RE.test(e)) return { key: 'recruiter', title: 'Recruiter verification', state: 'bad', score: K.malformed, notes: [{ s: 'bad', t: 'The recruiter email address is malformed.' }] };
  const dom = e.split('@')[1], reg = regDomain(dom); let s = K.base;
  const p = parseUrl(inp.url), co = slug(inp.company).replace(/ /g, '');
  if (DISPOSABLE.has(dom)) { s = K.disposable; notes.push({ s: 'bad', t: dom + ' is a disposable mailbox provider.' }); }
  else if (FREE.has(dom)) { s = K.freeMail; notes.push({ s: 'warn', t: 'The recruiter writes from a free mailbox (' + dom + ') rather than a company domain.' }); }
  else {
    const targets = []; if (p && !p.bad && !isBoard(p.reg)) targets.push(p.reg);
    let matched = false, look = null;
    for (const t of targets) { if (t === reg) matched = true; else if (lev(label(t), label(reg)) <= K.lookalikeMaxDistance && label(t).length >= K.lookalikeMinLabelLength) look = t; }
    const byName = inp.company ? nameMatchesDomain(inp.company, reg) : null;
    if (byName) matched = true;
    if (!look && co.length >= K.lookalikeMinLabelLength && lev(co, label(reg).replace(/-/g, '')) <= K.lookalikeMaxDistance && co !== label(reg).replace(/-/g, '')) look = inp.company;
    if (matched) { s = K.matched; notes.push({ s: 'ok', t: 'The email domain (' + reg + ') matches the ' + (byName ? 'company name' : 'job link') + '.' }); }
    else if (look) { s = K.lookalike; notes.push({ s: 'bad', t: 'The email domain (' + reg + ') looks almost identical to "' + look + '" but is different, a typical look-alike trick.' }); }
    else if (targets.length || inp.company) { s = K.mismatch; notes.push({ s: 'warn', t: 'The email domain (' + reg + ') does not match the company' + (targets.length ? ' or the job link (' + targets[0] + ')' : '') + '.' }); }
    else { s = K.noReference; notes.push({ s: 'info', t: 'No company or job link was given to compare the email domain against.' }); }
  }
  if (ROLE_RE.test(e)) notes.push({ s: 'info', t: 'A role mailbox is normal for companies, but confirm it from the official website.' });
  s = clamp(s); return { key: 'recruiter', title: 'Recruiter verification', state: stateOf(s), score: s, notes };
}

function checkSecurity(inp, ev) {
  const X = S.security, p = parseUrl(inp.url), notes = []; let s = null;
  if (!p || p.bad) return { key: 'security', title: 'Security checks', state: 'unknown', score: null, notes: [{ s: 'info', t: 'A valid job link is needed for security lookups.' }] };
  const bump = v => { s = s == null ? v : Math.max(s, v); };
  const rd = ev && ev.rdap;
  if (rd && rd.createdAt) {
    const days = Math.floor((Date.now() - new Date(rd.createdAt).getTime()) / 864e5);
    const when = days >= X.yearsDisplayDays ? Math.floor(days / 365) + ' years' : days >= X.monthsDisplayDays ? Math.floor(days / 30) + ' months' : days + ' days';
    if (days < X.youngDomainDays) { bump(X.youngDomainScore); notes.push({ s: 'bad', t: 'RDAP: the domain was registered only ' + days + ' days ago (' + (rd.registrar || 'registrar unknown') + ').' }); }
    else if (days < X.newDomainDays) { bump(X.newDomainScore); notes.push({ s: 'warn', t: 'RDAP: the domain is only ' + when + ' old.' }); }
    else { bump(X.oldDomainScore); notes.push({ s: 'ok', t: 'RDAP: the domain has existed for about ' + when + '.' }); }
  } else notes.push({ s: 'info', t: 'RDAP domain age was not available.' });
  const uh = ev && ev.urlhaus;
  if (uh && uh.checked) { if (uh.listed) { bump(X.urlhausListed); notes.push({ s: 'bad', t: 'URLhaus lists this address as ' + (uh.threat || 'malicious') + '.' }); } else { bump(X.urlhausClean); notes.push({ s: 'ok', t: 'URLhaus has no malware record for this address.' }); } }
  else notes.push({ s: 'info', t: 'URLhaus was not queried.' });
  const vt = ev && ev.virustotal;
  if (vt && vt.checked) {
    const bad = (vt.malicious || 0) + (vt.suspicious || 0);
    if (vt.malicious >= X.virustotalMaliciousStrong) { bump(X.virustotalStrongScore); notes.push({ s: 'bad', t: 'VirusTotal: ' + vt.malicious + ' engines flag this link as malicious.' }); }
    else if (bad > 0) { bump(X.virustotalSomeScore); notes.push({ s: 'warn', t: 'VirusTotal: ' + bad + ' engine(s) flag this link as malicious or suspicious.' }); }
    else { bump(X.virustotalCleanScore); notes.push({ s: 'ok', t: 'VirusTotal: no engine flags this link (' + (vt.harmless || 0) + ' report it harmless).' }); }
  } else notes.push({ s: 'info', t: 'VirusTotal was not queried.' });
  if (s == null) notes.push({ s: 'info', t: 'No security service answered. Run the backend to enable VirusTotal, URLhaus and RDAP.' });
  return { key: 'security', title: 'Security checks', state: s == null ? 'unknown' : stateOf(s), score: s, notes };
}

function countSources(inp, ev = {}, ai = null) {
  const p = parseUrl(inp && inp.url);
  const valid = p && !p.bad;
  let expected = 0;
  let answered = 0;
  if (valid) {
    expected += 3;
    if (ev && ev.rdap && ev.rdap.checked) answered++;
    if (ev && ev.urlhaus && ev.urlhaus.checked) answered++;
    if (ev && ev.virustotal && ev.virustotal.checked) answered++;
  }
  if (inp && inp.company && String(inp.company).trim()) {
    expected += 1;
    if (ev && ev.places && ev.places.checked) answered++;
  }
  if (inp && inp.desc && String(inp.desc).trim()) {
    expected += 1;
    if (ai) answered++;
  }
  return { answered, expected, sourcesAnswered: answered, sourcesExpected: expected };
}

/* ---------- overall verdict ---------- */
function combine(checks, opts, argExpected) {
  const K = S.combine, W = S.checkWeights;
  const live = checks.filter(c => c.score != null);
  const total = live.reduce((a, c) => a + W[c.key], 0);
  let score = total ? Math.round(live.reduce((a, c) => a + c.score * W[c.key], 0) / total) : null;
  const hard = live.some(c => c.score >= K.hardSignalScore);
  const strong = live.filter(c => c.score >= K.strongCheckScore).length;
  if (score != null) { if (hard) score = Math.max(score, K.hardSignalFloor); if (strong >= K.strongChecksNeeded) score = Math.max(score, K.strongChecksFloor); }
  const descOrUrl = live.some(c => c.key === 'desc' || c.key === 'url');
  const evidenceShare = Math.round(100 * total / Object.values(W).reduce((a, b) => a + b, 0));

  let answered = 0;
  let expected = 0;
  if (typeof opts === 'number' && typeof argExpected === 'number') {
    answered = opts;
    expected = argExpected;
  } else if (opts && typeof opts === 'object') {
    if (opts.sourcesExpected != null) expected = Number(opts.sourcesExpected);
    else if (opts.expected != null) expected = Number(opts.expected);
    if (opts.sourcesAnswered != null) answered = Number(opts.sourcesAnswered);
    else if (opts.answered != null) answered = Number(opts.answered);

    if (expected === 0 && (opts.inp || opts.input)) {
      const counts = countSources(opts.inp || opts.input, opts.ev || opts.evidence || {}, opts.ai);
      answered = counts.answered;
      expected = counts.expected;
    }
  }

  const C_CONF = S.confidence || { base: 50, max: 100 };
  const base = C_CONF.base != null ? C_CONF.base : 50;
  const max = C_CONF.max != null ? C_CONF.max : 100;

  let confidence = evidenceShare;
  if (expected > 0) {
    const ratio = Math.max(0, Math.min(1, answered / expected));
    confidence = Math.round(evidenceShare * (base + (max - base) * ratio) / max);
  }

  // A single check may give a verdict only when its evidence is already strong.
  const tooThin = live.length < K.minChecksForVerdict && !(score != null && score >= K.singleCheckVerdictMin);
  const level = (tooThin || !descOrUrl || score == null) ? 'unknown' : (score < K.lowBelow ? 'low' : score < K.mediumBelow ? 'medium' : 'high');
  const finalScore = (tooThin || !descOrUrl || score == null) ? null : score;
  return {
    level,
    score: finalScore,
    live: live.length,
    confidence,
    sourcesAnswered: answered,
    sourcesExpected: expected
  };
}
const LV = S.verdicts;

module.exports = { parseUrl, checkUrl, checkDesc, checkCompany, checkRecruiter, checkSecurity, combine, countSources, regDomain, LV, stateOf, RULES };
