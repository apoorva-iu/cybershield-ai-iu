import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ShieldCheck, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { UnifiedScanResult } from '../components/UnifiedScanResult';
import { Container } from '../components/ui';

export function SharedReport() {
  const { token } = useParams();
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setError('Invalid share link.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/share/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || (res.status === 404 ? 'Report not found or sharing has been disabled' : 'Could not load report'));
        }
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setReportData(data);
        if (data?.proofId) {
          document.title = `Cyber Shield - Report ${data.proofId}`;
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Could not load report');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  if (loading) {
    return (
      <Container>
        <div className="shared-report-page" role="status" aria-label="Loading shared report">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '16px' }}>
            <Loader2 size={32} className="spin" style={{ color: 'var(--primary, #0A66C2)' }} />
            <p style={{ color: 'var(--text-dim)', fontSize: '14px' }}>Loading verified screening report…</p>
          </div>
        </div>
      </Container>
    );
  }

  if (error || !reportData) {
    return (
      <Container>
        <div className="shared-report-page">
          <div className="dash-empty-state" style={{ maxWidth: '520px', margin: '60px auto', textAlign: 'center', padding: '40px 24px' }}>
            <AlertCircle size={48} style={{ color: 'var(--text-dim)', marginBottom: '16px' }} />
            <h2 className="dash-heading-md" style={{ marginBottom: '8px' }}>
              Report unavailable
            </h2>
            <p className="dash-text-secondary" style={{ marginBottom: '24px' }}>
              {error || 'This report may have expired, or the owner has stopped sharing it.'}
            </p>
            <Link to="/" className="dash-btn-primary" style={{ display: 'inline-flex' }}>
              <ArrowLeft size={16} />
              <span>Go to Cyber Shield</span>
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  const resolvedToolKind = (reportData?.tool || 'job').toLowerCase();

  return (
    <Container>
      <div className="shared-report-page">
        {/* Read-only scan result */}
        <UnifiedScanResult
          result={reportData || {}}
          rawInput=""
          toolKind={resolvedToolKind}
          isHistory={false}
          readOnly={true}
        />

        {/* Public shared report footer */}
        <div className="shared-report-footer no-print">
          <div className="shared-report-footer-inner">
            <div className="shared-report-badge">
              <ShieldCheck size={20} className="shared-report-shield-icon" aria-hidden="true" />
              <span className="shared-report-brand">Checked with Cyber Shield</span>
            </div>
            <p className="shared-report-tagline">
              Independent AI screening &amp; verification for job offers, UPI handles, and messages.
            </p>
            <div className="shared-report-cta">
              <Link to="/" className="shared-report-btn">
                Check your own offer &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}

export default SharedReport;
