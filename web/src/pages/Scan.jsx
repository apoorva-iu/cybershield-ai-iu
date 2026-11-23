import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { PageTransition, CountUp } from '../components/wow';
import { motion } from 'framer-motion';
import { useAuth } from '../auth';
import { UsagePill } from '../components/UsagePill';
import { QuotaExceededModal } from '../components/QuotaExceededModal';
import { triggerUsageRefresh } from '../lib/useUsage';
import { UnifiedScanResult } from '../components/UnifiedScanResult';

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
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [quotaModalData, setQuotaModalData] = useState(null);
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
      triggerUsageRefresh();
    } catch (x) {
      if (x?.status === 429 && (x?.data?.error === 'quota_exceeded' || x?.data?.code === 'QUOTA_EXCEEDED')) {
        setQuotaModalData(x.data);
        setIsQuotaModalOpen(true);
        setIsSplit(false);
      } else {
        let msg = x?.message ? String(x.message) : 'An error occurred while verifying the offer.';
        if (msg.includes('AI_UNAVAILABLE') || x?.code === 'AI_UNAVAILABLE' || x?.status === 503) {
          msg = 'AI screening service is temporarily unavailable. Please try again in a moment.';
        }
        const isRateLimit = msg.toLowerCase().includes('too many scans') || msg.toLowerCase().includes('rate limit');
        setError({ message: msg, isRateLimit });
        setIsSplit(false);
      }
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
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1>Is this job offer real?</h1>
                <p>Instantly scan suspicious emails, links, and job descriptions.</p>
              </div>
              <UsagePill variant="tool" />
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
                  <span>{String(error.message).includes('AI_UNAVAILABLE') ? 'AI screening service is temporarily unavailable. Please try again in a moment.' : error.message}</span>
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
      <QuotaExceededModal
        isOpen={isQuotaModalOpen}
        onClose={() => setIsQuotaModalOpen(false)}
        data={quotaModalData}
      />
    </div>
  );

  if (embedded) {
    return content;
  }

  return <PageTransition>{content}</PageTransition>;
}

function ReportView({ result: d, downloadReceipt, testScan, isSignedIn }) {
  if (!d) return null;
  return (
    <div className="job-report-view">
      <UnifiedScanResult
        result={d}
        toolKind="job"
        downloadReceipt={downloadReceipt}
      />
      {d.proofId && testScan && (
        <div style={{ marginTop: '16px', textAlign: 'center' }} className="no-print">
          <button
            type="button"
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--primary, #0A66C2)',
              textDecoration: 'underline',
              fontSize: '13px',
              cursor: 'pointer',
              padding: 0
            }}
            onClick={testScan}
          >
            Test this scan now
          </button>
        </div>
      )}
    </div>
  );
}

