import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { PageTransition, CountUp } from '../components/wow';
import { motion } from 'framer-motion';
import { useAuth } from '../auth';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SL = { ok: 'Looks fine', warn: 'Warning', bad: 'High risk', unknown: 'Unable to verify' };

const SKIPPED_REASONS = new Set([
  'ok',
  'disabled',
  'no company name',
  'no valid link',
  'no description'
]);

const SERVICE_FRIENDLY_NAMES = {
  rdap: 'domain age',
  urlhaus: 'malware list',
  virustotal: 'VirusTotal',
  places: 'Google Places',
  ai: 'AI reading'
};

function getFindingSource(text, checkKey) {
  if (!text || typeof text !== 'string') return null;
  if (/\brdap\b/i.test(text)) return 'RDAP';
  if (/\bvirustotal\b/i.test(text)) return 'VirusTotal';
  if (/\burlhaus\b/i.test(text)) return 'URLhaus';
  if (/\bgoogle (places|reviews|listing)\b/i.test(text)) return 'Google Places';
  if (/\bai (reading|detected|analysis)\b/i.test(text) || /^ai\b/i.test(text)) return 'AI';
  if (checkKey === 'company') return 'Google Places';
  return null;
}

export function Scan({ embedded = false }) {
  const [form, setForm] = useState({ url: '', company: '', email: '', desc: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState(null);
  const [isSplit, setIsSplit] = useState(false);
  const [prefillNote, setPrefillNote] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();

  useEffect(() => {
    // Check for "prefill" search parameter in hash route (e.g. #/scan?prefill=...)
    const params = new URLSearchParams(location.search);
    const prefillRaw = params.get('prefill');
    if (prefillRaw) {
      try {
        let b64 = prefillRaw.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const decoded = decodeURIComponent(escape(atob(b64)));
        const data = JSON.parse(decoded);
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setForm({
            url: typeof data.url === 'string' ? data.url.slice(0, 2000) : '',
            company: typeof data.company === 'string' ? data.company.slice(0, 200) : '',
            email: typeof data.email === 'string' ? data.email.slice(0, 200) : '',
            desc: typeof data.desc === 'string' ? data.desc.slice(0, 20000) : ''
          });
          setPrefillNote('Filled from the Cyber Shield extension. Review it, then press Scan.');
        }
      } catch (err) {
        // Ignore invalid data silently
      }
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  useEffect(() => {
    apiFetch('/api/health')
      .then(setHealth)
      .catch(() => setHealth('error'));
  }, []);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleClear = () => {
    setForm({ url: '', company: '', email: '', desc: '' });
    setError(null);
    setPrefillNote('');
    setIsSplit(false);
    setResult(null);
  };

  const loadSample = async (type) => {
    try {
      const s = await apiFetch('/api/samples');
      setForm({
        url: s[type].url || '',
        company: s[type].company || '',
        email: s[type].email || '',
        desc: s[type].desc || ''
      });
      setError(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSplit(true);
    setLoading(true);
    setResult(null);
    
    try {
      const d = await apiFetch('/api/verify', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      if (!d) {
        throw new Error('No data received from verification service.');
      }
      setResult(d);
    } catch (x) {
      const msg = x?.message ? String(x.message) : 'An error occurred while verifying the offer.';
      const isRateLimit = msg.toLowerCase().includes('too many scans') || msg.toLowerCase().includes('rate limit');
      setError({ message: msg, isRateLimit });
      setIsSplit(false);
    } finally {
      setLoading(false);
    }
  };

  const downloadReceipt = () => {
    if (!result || !result.receipt) return;
    try {
      const blob = new Blob([JSON.stringify(result.receipt, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (result.proofId || 'scan-proof') + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download receipt', err);
    }
  };

  const testScan = () => {
    if (!result) return;
    const proof = encodeURIComponent(result.proofId || '');
    const hash = encodeURIComponent(result.blockHash || '');
    const code = encodeURIComponent(result.accessCode || '');
    navigate(`/verify?proof=${proof}&hash=${hash}&code=${code}`);
  };

  const layoutModeClass = embedded
    ? `layout-embedded ${isSplit ? 'has-report' : ''}`
    : isSplit
      ? 'layout-split'
      : 'layout-centered';

  const content = (
    <div className={`scan-page ${embedded ? 'scan-embedded' : ''}`.trim()}>
      <div id="verify-layout" className={`layout-container ${layoutModeClass}`.trim()}>
        <div className="col-form">
          <form className="scan-card" id="form" autoComplete="off" onSubmit={handleSubmit}>
            <div className="card-header">
              <h1>Is this job offer real?</h1>
              <p>Instantly scan suspicious emails, links, and job descriptions.</p>
            </div>
            {prefillNote && (
              <div
                className="prefill-note"
                role="status"
                style={{
                  background: 'rgba(10, 102, 194, 0.12)',
                  border: '1px solid rgba(77, 163, 255, 0.3)',
                  color: '#4DA3FF',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '13px'
                }}
              >
                {prefillNote}
              </div>
            )}
            <div className="form-row">
              <div className="f">
                <label htmlFor="url">Job URL</label>
                <input id="url" type="text" inputMode="url" placeholder="https://careers.example.com/role" value={form.url} onChange={handleChange} />
              </div>
              <div className="f">
                <label htmlFor="company">Company name</label>
                <input id="company" type="text" placeholder="As written in the offer" value={form.company} onChange={handleChange} />
              </div>
              <div className="f">
                <label htmlFor="email">Recruiter email</label>
                <input id="email" type="email" placeholder="name@company.com" value={form.email} onChange={handleChange} />
              </div>
            </div>
            <div className="f">
              <label htmlFor="desc">Job description or message</label>
              <textarea id="desc" placeholder="Paste the full text of the offer" value={form.desc} onChange={handleChange}></textarea>
            </div>
            <div className="btn-row">
              <button className="primary" type="submit" id="run" disabled={loading}>
                {loading ? 'Checking\u2026' : 'Verify offer'}
              </button>
              <button type="button" id="clear" className="outline" onClick={handleClear}>Clear form</button>
            </div>
            <div className="example-btns">
              <button type="button" id="btnScam" className="outline" onClick={() => loadSample('scam')}>Try a scam example</button>
              <button type="button" id="btnSafe" className="outline" onClick={() => loadSample('legit')}>Try a safe example</button>
            </div>
            
            {error && (
              <div
                className="err"
                id="err"
                role="alert"
                aria-live="assertive"
                style={{
                  background: error.isRateLimit ? 'var(--warn-bg, #fff8e6)' : 'var(--bad-bg, #fdeaea)',
                  color: error.isRateLimit ? 'var(--warn-text, #FCD34D)' : 'var(--bad-text, #FCA5A5)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  marginTop: '16px'
                }}
              >
                {error.isRateLimit ? (
                  <>
                    <strong>Rate Limit Reached</strong><br/>
                    {error.message}
                  </>
                ) : (
                  <span>{error.message}</span>
                )}
              </div>
            )}
            
            {result?.evidenceStatus && typeof result.evidenceStatus === 'object' && (
              <>
                <div className="srv-label">Live checks</div>
                <div className="srv" id="srv" aria-label="Connected services">
                  {[
                    { id: 'rdap', label: 'RDAP' },
                    { id: 'virustotal', label: 'VirusTotal' },
                    { id: 'urlhaus', label: 'URLhaus' },
                    { id: 'places', altId: 'googlePlaces', label: 'Google Places' },
                    { id: 'ai', altId: 'llm', label: 'AI reading' }
                  ].map(svc => {
                    const status = result.evidenceStatus?.[svc.id] ?? (svc.altId ? result.evidenceStatus?.[svc.altId] : undefined);
                    if (!status) return null;
                    const isOk = status === 'ok';
                    return (
                      <div key={svc.id} className={`srv-dot ${isOk ? 'on' : ''}`} title={!isOk ? String(status) : ''} style={!isOk ? { color: 'var(--warn-text, #FCD34D)' } : {}}>
                        <i style={!isOk ? { background: 'var(--warn, #B7791F)' } : {}}></i>
                        {svc.label}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </form>
        </div>

        <div className="col-report" id="report-col">
          <div id="report" aria-live="polite">
            {loading && (
              <motion.div 
                className="scan-card" 
                id="loading"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="spinner"></div>
                <p>Checking the link, company and recruiter...</p>
                <motion.div 
                  style={{ width: '100%', height: '4px', background: 'var(--line)', borderRadius: '2px', marginTop: '16px', overflow: 'hidden' }}
                >
                  <motion.div 
                    style={{ height: '100%', background: 'var(--brand)' }}
                    animate={{ width: ["0%", "100%", "0%"], x: ["0%", "0%", "100%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                </motion.div>
              </motion.div>
            )}
            {!loading && result && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <ReportView result={result} downloadReceipt={downloadReceipt} testScan={testScan} isSignedIn={Boolean(session)} />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <PageTransition>{content}</PageTransition>;
}

function ReportView({ result: d, downloadReceipt, testScan, isSignedIn }) {
  if (!d) return null;
  const r = d.report || {};
  const o = r.overall || {};

  let t = 'Verification result';
  let sub = '';
  if (Array.isArray(d.headline)) {
    t = d.headline[0] || t;
    sub = d.headline[1] || '';
  } else if (typeof d.headline === 'string') {
    t = d.headline;
  } else if (d.level || o.level) {
    const lvl = d.level || o.level;
    t = String(lvl).charAt(0).toUpperCase() + String(lvl).slice(1) + ' risk';
  }
  
  const evidenceStatus = d.evidenceStatus && typeof d.evidenceStatus === 'object' ? d.evidenceStatus : {};
  const failedEntries = Object.entries(evidenceStatus).filter(([_, v]) => {
    if (!v) return false;
    const s = String(v).toLowerCase().trim();
    return !SKIPPED_REASONS.has(s);
  });
  const failedKeys = failedEntries.map(([k]) => k);
  let amberNote = null;
  if (failedKeys.length === 1 && failedKeys[0] === 'ai') {
    amberNote = 'The AI reading did not answer, so the description was checked by word rules only.';
  } else if (failedKeys.length > 0) {
    const names = failedKeys.map(k => SERVICE_FRIENDLY_NAMES[k] || k);
    amberNote = `Some live checks did not answer: ${names.join(', ')}.`;
  }
  const techReasons = failedEntries.map(([k, v]) => `${k}: ${v}`).join(', ');

  const score = typeof o.score === 'number' ? o.score : null;
  const level = String(o.level || d.level || 'unknown').toLowerCase();
  const confidence = typeof o.confidence === 'number' ? o.confidence : 0;
  const liveCount = typeof d.live === 'number' ? d.live : (typeof o.live === 'number' ? o.live : 0);
  const gaugeDashOffset = score == null ? 125.6 : 125.6 - (125.6 * Math.min(100, Math.max(0, score)) / 100);

  const checks = Array.isArray(r.checks) ? r.checks : [];
  const sources = Array.isArray(r.sources) ? r.sources : [];

  let timeFormatted = '\u2014';
  if (typeof d.timestamp === 'string') {
    timeFormatted = d.timestamp.replace('T', ' ').slice(0, 19);
  } else if (d.timestamp) {
    timeFormatted = String(d.timestamp);
  }
  
  return (
    <>
      <motion.div 
        className={`verdict v-${level}`}
        animate={level === 'high' || level === 'bad' ? { x: [-5, 5, -5, 5, 0] } : (level === 'low' || level === 'ok' ? { boxShadow: '0 0 20px rgba(18, 128, 92, 0.4)' } : {})}
        transition={{ duration: 0.4 }}
      >
        <div className="v-left">
          <h2 className="lvl">{t}</h2>
          {sub && <p>{sub}</p>}
          {amberNote && <p className="v-amber-note">{amberNote}</p>}
          <div className="v-chips">
            <span className="v-chip">{liveCount} of 5 checks had evidence</span>
            <span 
              className="v-chip v-chip-tooltip" 
              tabIndex={0} 
              role="note" 
              aria-label="Confidence: how much live evidence answered for this scan" 
              title="How much live evidence answered for this scan."
            >
              Confidence <CountUp value={confidence} />%
              <span className="tooltip-bubble" role="tooltip">
                How much live evidence answered for this scan.
              </span>
            </span>
          </div>
          {failedEntries.length > 0 && (
            <details className="v-details">
              <summary>Details</summary>
              <div className="v-tech-reasons">{techReasons}</div>
            </details>
          )}
        </div>
        <div className="v-right">
          <div className="gauge-wrap" role="img" aria-label={score == null ? 'No score' : 'Risk score of ' + score}>
            <svg className="gauge" viewBox="0 0 100 50" aria-hidden="true">
              <path className="gauge-bg" d="M 10 50 A 40 40 0 0 1 90 50" fill="none" strokeWidth="12" strokeLinecap="round"></path>
              {score != null && (
                <motion.path 
                  className="gauge-val" 
                  d="M 10 50 A 40 40 0 0 1 90 50" 
                  fill="none" 
                  strokeWidth="12" 
                  strokeLinecap="round" 
                  strokeDasharray="125.6" 
                  initial={{ strokeDashoffset: 125.6 }}
                  animate={{ strokeDashoffset: gaugeDashOffset }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
              )}
            </svg>
            <div className="score-num"><CountUp value={score} /></div>
          </div>
          <div className="score-cap">Risk score of 100</div>
        </div>
      </motion.div>

      {checks.length > 0 && (
        <div className="check-summary-row">
          {checks.map((c, i) => (
            <a
              key={i}
              href={`#check-${i}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`check-${i}`)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`check-pill s-${c?.state || 'unknown'}`}
            >
              <b></b>{c?.title || c?.key || `Check ${i + 1}`}
            </a>
          ))}
        </div>
      )}

      {checks.length > 0 && (
        <div className="report-grid">
          {checks.map((c, i) => {
            if (!c) return null;
            let extra = null;
            if (c.key === 'desc' && evidenceStatus?.ai && evidenceStatus.ai !== 'ok') {
              extra = (
                <p style={{ fontSize: '13px', color: 'var(--warn)', marginTop: '12px' }}>
                  AI analysis unavailable ({evidenceStatus.ai}). <span className="source-chip">AI</span>
                </p>
              );
            }
            if (c.key === 'company' && evidenceStatus?.places && evidenceStatus.places !== 'ok') {
              extra = (
                <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '12px' }}>
                  Could not be verified. This is common for small or new companies. <span className="source-chip">Google Places</span>
                </p>
              );
            }
            const findings = Array.isArray(c.findings) ? c.findings : [];
            const state = c.state || 'unknown';
            const stateLabel = SL[state] || state;
            const scoreVal = typeof c.score === 'number' ? Math.min(100, Math.max(0, c.score)) : null;
            const fillWidth = scoreVal == null ? 0 : Math.max(4, scoreVal);

            return (
              <div className="check" id={`check-${i}`} key={i}>
                <div className="chead">
                  <h3>{c.title || c.key || `Check ${i + 1}`}</h3>
                  <span className={`pill s-${state}`}>{stateLabel}</span>
                </div>
                <div
                  className={`meter m-${state}`}
                  role="progressbar"
                  aria-valuenow={scoreVal ?? 0}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-label={scoreVal == null ? 'No evidence' : `Risk ${scoreVal} of 100`}
                >
                  {scoreVal != null && (
                    <i style={{ width: `${fillWidth}%`, '--fill-width': `${fillWidth}%` }}></i>
                  )}
                </div>
                <ul className="notes">
                  {findings.map((n, j) => {
                    const src = getFindingSource(n?.text, c?.key);
                    return (
                      <li key={j}>
                        <b className={`d-${n?.severity || 'info'}`}></b>
                        <span>
                          {n?.text || ''}
                          {src && <span className="source-chip">{src}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {extra}
              </div>
            );
          })}
        </div>
      )}

      <p className="small">Sources used: {sources.length ? sources.join(', ') : 'none of the live services answered'}. Screening aid, not a legal finding.</p>
      
      <div className="scan-card proof-card">
        <h3>Your scan proof</h3>
        <div className="proof-grid">
          <div className="proof-item">
            <label>Proof ID</label>
            <div className="val">{d.proofId || '\u2014'}</div>
          </div>
          <div className="proof-item">
            <label>Block number</label>
            <div className="val">{d.block != null ? d.block : '\u2014'}</div>
          </div>
          <div className="proof-item">
            <label>Time (UTC)</label>
            <div className="val">{timeFormatted}</div>
          </div>
          <div className="proof-item">
            <label>Access Code</label>
            <div className="val">
              {d.accessCode || '\u2014'}{' '}
              {d.accessCode && (
                <button type="button" className="copy-btn" onClick={() => navigator.clipboard?.writeText?.(d.accessCode)}>Copy</button>
              )}
            </div>
            <div className="proof-warn">Save this code now. It is shown only once.</div>
          </div>
          <div className="proof-item" style={{ gridColumn: '1 / -1' }}>
            <label>Block hash</label>
            <div className="val">
              {d.blockHash || '\u2014'}{' '}
              {d.blockHash && (
                <button type="button" className="copy-btn" onClick={() => navigator.clipboard?.writeText?.(d.blockHash)}>Copy</button>
              )}
            </div>
          </div>
        </div>
        
        <div className="scan-history-status-wrap" aria-live="polite" style={{ marginTop: '14px' }}>
          {isSignedIn ? (
            d.saved !== false ? (
              <Link to="/dashboard/history" className="saved-history-chip">
                &#10003; Saved to your history
              </Link>
            ) : null
          ) : (
            <Link to="/login" className="signin-history-link">
              Sign in to keep a history of your scans
            </Link>
          )}
        </div>
        
        <div className="proof-btns" style={{ alignItems: 'flex-start' }}>
          <button type="button" className="primary" onClick={() => window.print()}>Save report as PDF</button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', maxWidth: '300px' }}>
            <button type="button" onClick={downloadReceipt} disabled={!d.receipt}>Download verification file (.json)</button>
            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.3, fontWeight: 'normal' }}>
              Keep this file. It lets you prove later that the scan contents were not changed.
            </div>
          </div>
        </div>
        
        {d.proofId && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button type="button" style={{ border: 'none', background: 'none', color: 'var(--primary, #0A66C2)', textDecoration: 'underline', fontSize: '13px', cursor: 'pointer', padding: 0 }} onClick={testScan}>
              Test this scan now
            </button>
          </div>
        )}
      </div>
    </>
  );
}

