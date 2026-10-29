import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, NavLink, Outlet, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  ScanSearch,
  History,
  CreditCard,
  Settings,
  Search,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Printer,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { apiFetch } from '../api';
import { useAuth, getDisplayName, UserAvatar } from '../auth';
import { Logo } from '../components/Logo';
import { CountUp } from '../components/wow';
import { addToast } from '../components/Toast';
import { useBillingStatus, startUpgrade, formatExpiryDate } from '../lib/billing';
import { useUsage } from '../lib/useUsage';
import { Scan } from './Scan';
import '../tools.css';

const SL = {
  ok: 'Looks fine',
  safe: 'Looks fine',
  pass: 'Looks fine',
  warn: 'Warning',
  warning: 'Warning',
  caution: 'Caution',
  bad: 'High risk',
  danger: 'High risk',
  flag: 'Flagged pattern',
  fail: 'Flagged pattern',
  not_applicable: 'Not applicable',
  unknown: 'Unable to verify'
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

function formatScanDate(isoStr) {
  if (!isoStr) return '\u2014';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) {
    return String(isoStr).replace('T', ' ').slice(0, 16);
  }
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatScanDateTime(isoStr) {
  if (!isoStr) return '\u2014';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) {
    return String(isoStr).replace('T', ' ').slice(0, 19);
  }
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function shortenProofId(proofId) {
  const s = String(proofId || '').trim();
  if (!s) return '\u2014';
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}\u2026${s.slice(-4)}`;
}

function formatLevelLabel(level) {
  const lv = String(level || '').trim().toLowerCase();
  if (lv === 'high' || lv === 'bad') return 'High';
  if (lv === 'medium' || lv === 'warn') return 'Medium';
  if (lv === 'low' || lv === 'ok') return 'Low';
  return 'Unknown';
}

function getLevelBadgeClass(level) {
  const lv = String(level || '').trim().toLowerCase();
  if (lv === 'high' || lv === 'bad') return 'dash-level-badge dash-level-high';
  if (lv === 'medium' || lv === 'warn') return 'dash-level-badge dash-level-medium';
  if (lv === 'low' || lv === 'ok') return 'dash-level-badge dash-level-low';
  return 'dash-level-badge dash-level-unknown';
}

function EmptyScansIllustration() {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className="dash-empty-svg"
    >
      <rect
        x="22"
        y="18"
        width="76"
        height="84"
        rx="10"
        fill="#0B1220"
        stroke="#0A66C2"
        strokeWidth="2.5"
      />
      <line x1="36" y1="38" x2="72" y2="38" stroke="#9AA8BF" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="36" y1="50" x2="82" y2="50" stroke="#9AA8BF" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="36" y1="62" x2="64" y2="62" stroke="#9AA8BF" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="78" cy="78" r="18" fill="#05080F" stroke="#22D3EE" strokeWidth="2.5" />
      <path
        d="M72 78L76 82L85 73"
        stroke="#22D3EE"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function useScanToolKinds(items) {
  const [kinds, setKinds] = useState({});

  useEffect(() => {
    if (!Array.isArray(items) || items.length === 0) return;
    let active = true;

    const newKinds = { ...kinds };
    const missing = [];

    for (const item of items) {
      if (!item || !item.id) continue;
      if (item.company || item.host) {
        newKinds[item.id] = 'Job';
        continue;
      }
      const cached = item.proofId
        ? sessionStorage.getItem('cs_tool_kind_' + item.proofId)
        : null;
      if (cached) {
        newKinds[item.id] = cached === 'upi' ? 'UPI' : 'Message';
      } else if (!newKinds[item.id]) {
        missing.push(item);
      }
    }

    if (active) {
      setKinds(newKinds);
    }

    if (missing.length > 0) {
      Promise.all(
        missing.map(async (m) => {
          try {
            const detail = await apiFetch(`/api/scans/${m.id}`);
            const k = detail?.report?.input?.kind;
            if (k) {
              const label = k === 'upi' ? 'UPI' : 'Message';
              if (m.proofId) sessionStorage.setItem('cs_tool_kind_' + m.proofId, k);
              return { id: m.id, kind: label };
            }
          } catch {}
          return { id: m.id, kind: 'Message' };
        })
      ).then((resolved) => {
        if (!active) return;
        setKinds((prev) => {
          const next = { ...prev };
          for (const r of resolved) {
            if (r) next[r.id] = r.kind;
          }
          return next;
        });
      });
    }

    return () => {
      active = false;
    };
  }, [items]);

  return kinds;
}

/* ==========================================================================
   SHARED SKELETON & ROUTE ERROR BOUNDARY
   ========================================================================== */

export function DashboardSkeleton() {
  return (
    <div className="dash-page-stack" role="status" aria-live="polite" aria-label="Loading dashboard">
      <div className="dash-card" style={{ padding: '24px' }}>
        <div className="dash-skeleton" style={{ width: '220px', height: '24px', marginBottom: '12px' }} />
        <div className="dash-skeleton" style={{ width: '320px', height: '16px' }} />
      </div>
      <div className="dash-summary-grid">
        {[1, 2, 3].map((n) => (
          <div key={n} className="dash-summary-card">
            <div className="dash-skeleton" style={{ width: '100px', height: '14px' }} />
            <div className="dash-skeleton" style={{ width: '64px', height: '28px', margin: '6px 0' }} />
            <div className="dash-skeleton" style={{ width: '130px', height: '14px' }} />
          </div>
        ))}
      </div>
      <div className="dash-card" style={{ padding: '24px' }}>
        {[1, 2, 3, 4].map((row) => (
          <div key={row} className="dash-skeleton-row">
            <div className="dash-skeleton dash-sk-col-sm" />
            <div className="dash-skeleton dash-sk-col-lg" />
            <div className="dash-skeleton dash-sk-col-badge" />
            <div className="dash-skeleton dash-sk-col-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

export class DashboardRouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Dashboard route error:', error, info);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="dash-card dash-error-fallback" role="alert">
          <AlertTriangle size={28} color="#F87171" aria-hidden="true" />
          <h1 className="dash-heading-lg">Something went wrong on this page</h1>
          <p className="dash-text-secondary">
            We couldn&apos;t load this section right now. Your saved scans and account data are safe.
          </p>
          <div style={{ marginTop: '8px' }}>
            <Link
              to="/dashboard"
              className="dash-btn-primary"
              onClick={() => this.setState({ hasError: false })}
            >
              <ArrowLeft size={16} />
              <span>Back to overview</span>
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function LegacyScanRedirect() {
  const { id } = useParams();
  return <Navigate to={`/dashboard/history/${encodeURIComponent(id || '')}`} replace />;
}

/* ==========================================================================
   CONFIRM DELETE SCAN DIALOG
   ========================================================================== */

function DeleteScanConfirmDialog({ onConfirm, onCancel, deleting }) {
  const dialogRef = useRef(null);
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (cancelBtnRef.current) {
      cancelBtnRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !deleting) {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, deleting]);

  return (
    <div
      className="name-prompt-overlay no-print"
      role="presentation"
      onClick={() => !deleting && onCancel()}
    >
      <div
        ref={dialogRef}
        className="name-prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-scan-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-scan-dialog-title" className="name-prompt-title">
          Delete this scan?
        </h2>
        <p className="dash-text-secondary" style={{ margin: 0 }}>
          This scan will be permanently removed from your saved history. This action cannot be undone.
        </p>
        <div className="name-prompt-actions" style={{ marginTop: '8px' }}>
          <button
            ref={cancelBtnRef}
            type="button"
            className="dash-btn-outline"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dash-btn-danger"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting\u2026' : 'Delete scan'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   APP SHELL: DashboardLayout (Sidebar + Mobile Drawer + Main Content Outlet)
   ========================================================================== */

const SIDEBAR_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/tools', label: 'New check', icon: ScanSearch, end: false },
  { to: '/dashboard/history', label: 'History', icon: History, end: false },
  { to: '/dashboard/plan', label: 'Plan', icon: CreditCard, end: false },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings, end: false }
];

export function DashboardLayout() {
  const { authReady, session, profile, signOut } = useAuth();
  const { isPro } = useBillingStatus(session);
  const location = useLocation();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);
  const hamburgerBtnRef = useRef(null);

  const displayName = getDisplayName(profile, session);

  // Close mobile drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Focus trap & Escape handler for mobile drawer (< 900px)
  useEffect(() => {
    if (!drawerOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';
    const panel = drawerRef.current;
    if (panel) {
      const focusable = panel.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDrawerOpen(false);
        if (hamburgerBtnRef.current) {
          hamburgerBtnRef.current.focus();
        }
        return;
      }
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const handleSignOut = async () => {
    setDrawerOpen(false);
    await signOut();
    navigate('/');
  };

  const renderSidebarContent = (isMobileDrawer = false) => (
    <>
      <div className="dash-sidebar-top">
        <div className="dash-sidebar-brand-row">
          <Link
            to="/"
            className="logo-link"
            aria-label="CyberShield Home"
            onClick={() => isMobileDrawer && setDrawerOpen(false)}
          >
            <Logo size={26} withWordmark={true} isDark={true} />
          </Link>
          {isMobileDrawer && (
            <button
              type="button"
              className="dash-drawer-close-btn"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation menu"
            >
              <X size={20} />
            </button>
          )}
        </div>
        <Link
          to="/"
          className="dash-back-to-site"
          onClick={() => isMobileDrawer && setDrawerOpen(false)}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Back to site</span>
        </Link>
      </div>

      <nav className="dash-sidebar-nav" aria-label="Dashboard navigation">
        {SIDEBAR_ITEMS.map((item) => {
          const IconComponent = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `dash-nav-pill ${isActive ? 'active' : ''}`}
              onClick={() => isMobileDrawer && setDrawerOpen(false)}
            >
              <IconComponent size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="dash-sidebar-footer">
        <div className="dash-sidebar-user">
          <UserAvatar profile={profile} session={session} size={36} />
          <div className="dash-sidebar-user-meta">
            <strong className="dash-sidebar-user-name" title={displayName}>
              {displayName}
            </strong>
            <span className="dash-sidebar-user-plan">{isPro ? 'Pro plan' : 'Free plan'}</span>
          </div>
        </div>
        <button
          type="button"
          className="dash-sidebar-signout-btn"
          onClick={handleSignOut}
        >
          <LogOut size={16} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="dash-shell">
      {/* Desktop Left Sidebar (240px, visible >= 900px) */}
      <aside className="dash-sidebar no-print" aria-label="Account sidebar">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Slim Top Bar (< 900px) */}
      <header className="dash-mobile-topbar no-print">
        <button
          ref={hamburgerBtnRef}
          type="button"
          className="dash-mobile-menu-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
        >
          <Menu size={20} />
        </button>
        <Link to="/" className="logo-link" aria-label="CyberShield Home">
          <Logo size={24} withWordmark={true} isDark={true} />
        </Link>
        <Link to="/" className="dash-mobile-site-link">
          Back to site
        </Link>
      </header>

      {/* Mobile Sidebar Drawer (< 900px) */}
      {drawerOpen && (
        <div
          className="dash-drawer-overlay no-print"
          role="presentation"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            ref={drawerRef}
            className="dash-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation drawer"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="dash-main-area">
        <div className="dash-main-container">
          {!authReady ? (
            <DashboardSkeleton />
          ) : (
            <DashboardRouteErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </DashboardRouteErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   STEP 3.4: OVERVIEW (/dashboard)
   ========================================================================== */

export function DashboardOverview() {
  const { session, profile } = useAuth();
  const displayName = getDisplayName(profile, session);
  const {
    status: billingStatus,
    isPro,
    daysLeft,
    expiresAt,
    checksUsed,
    checksLimit,
    paymentsMode,
    isPaymentsAvailable
  } = useBillingStatus(session);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const handlePlanAction = () => {
    if (!isPaymentsAvailable) return;
    startUpgrade({
      session,
      onProgress: setUpgradeLoading
    });
  };

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [totalScans, setTotalScans] = useState(0);
  const [highRiskTotal, setHighRiskTotal] = useState(0);
  const [lastScanDate, setLastScanDate] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [recentRes, highRes] = await Promise.all([
        apiFetch('/api/scans?page=1&limit=5'),
        apiFetch('/api/scans?page=1&limit=1&level=High')
      ]);
      const items = Array.isArray(recentRes?.items) ? recentRes.items : [];
      setRecentScans(items.slice(0, 5));
      setTotalScans(typeof recentRes?.total === 'number' ? recentRes.total : items.length);
      setHighRiskTotal(typeof highRes?.total === 'number' ? highRes.total : 0);
      setLastScanDate(items.length > 0 ? items[0]?.createdAt || null : null);
    } catch (err) {
      if (err?.status !== 401) {
        setErrorMsg(err?.message || 'Could not load your dashboard summary.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleCopyProofId = async (proofId) => {
    if (!proofId) return;
    try {
      await navigator.clipboard?.writeText?.(proofId);
      setCopiedId(proofId);
      setTimeout(() => {
        setCopiedId((prev) => (prev === proofId ? null : prev));
      }, 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const recentScansToolKinds = useScanToolKinds(recentScans);

  return (
    <div className="dash-page-stack">
      {/* Top Heading Row */}
      <header className="dash-page-header">
        <div>
          <h1 className="dash-heading-lg">Welcome back, {displayName}</h1>
          <p className="dash-text-secondary">
            Overview of your saved job offer screenings and verification records.
          </p>
        </div>
        <Link to="/dashboard/scan" className="dash-btn-primary">
          <ScanSearch size={16} aria-hidden="true" />
          <span>Scan a job</span>
        </Link>
      </header>

      {/* Three Summary Cards in 3-Column Grid */}
      <section className="dash-summary-grid" aria-label="Scan summary metrics">
        <div className="dash-summary-card">
          <span className="dash-summary-label">Total scans</span>
          {loading ? (
            <div className="dash-skeleton dash-skeleton-num" aria-hidden="true" />
          ) : (
            <strong className="dash-summary-value">{totalScans}</strong>
          )}
          <span className="dash-summary-caption">Saved to your account</span>
        </div>

        <div className="dash-summary-card">
          <span className="dash-summary-label">High-risk offers</span>
          {loading ? (
            <div className="dash-skeleton dash-skeleton-num" aria-hidden="true" />
          ) : (
            <strong className="dash-summary-value dash-value-high">{highRiskTotal}</strong>
          )}
          <span className="dash-summary-caption">Flagged as high risk</span>
        </div>

        <div className="dash-summary-card">
          <span className="dash-summary-label">Last scan date</span>
          {loading ? (
            <div className="dash-skeleton dash-skeleton-text" aria-hidden="true" />
          ) : (
            <strong className="dash-summary-value dash-value-date">
              {lastScanDate ? formatScanDate(lastScanDate) : 'No scans yet'}
            </strong>
          )}
          <span className="dash-summary-caption">
            {lastScanDate ? formatScanDateTime(lastScanDate) : 'Run your first job check'}
          </span>
        </div>
      </section>

      {/* Plan Card */}
      <section className="dash-card dash-plan-status-card" aria-labelledby="dash-plan-heading">
        <div className="dash-plan-card-body">
          <div className="dash-plan-card-info">
            <div className="dash-plan-card-badge-row">
              <span className={`feature-pill-badge ${isPro ? 'pill-pro' : 'pill-active'}`}>
                {isPro ? 'Pro' : 'Free'}
              </span>
              <span className="dash-plan-expiry-text">
                {isPro && expiresAt
                  ? `Active until ${formatExpiryDate(expiresAt)} (${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left)`
                  : 'Free tier · 5 checks per month'}
              </span>
            </div>
            <h2 id="dash-plan-heading" className="dash-heading-md" style={{ margin: '6px 0 4px' }}>
              {isPro ? 'Pro Screening Plan' : 'Free Screening Plan'}
            </h2>
            <p className="dash-text-secondary" style={{ margin: '0 0 10px' }}>
              {checksUsed} of {checksLimit} checks used this period.
            </p>
            <div
              className="dash-plan-progress-bar"
              role="progressbar"
              aria-valuenow={checksUsed}
              aria-valuemin="0"
              aria-valuemax={checksLimit}
            >
              <div
                className="dash-plan-progress-fill"
                style={{
                  width: `${Math.min(100, Math.round(((checksUsed || 0) / (checksLimit || 1)) * 100))}%`
                }}
              />
            </div>
          </div>

          <div className="dash-plan-card-action">
            <button
              type="button"
              className="dash-btn-primary"
              onClick={handlePlanAction}
              disabled={upgradeLoading || !isPaymentsAvailable}
              style={
                upgradeLoading || !isPaymentsAvailable
                  ? { opacity: 0.65, cursor: 'not-allowed' }
                  : undefined
              }
            >
              <CreditCard size={16} aria-hidden="true" />
              <span>
                {!isPaymentsAvailable
                  ? 'Payments unavailable right now'
                  : upgradeLoading
                  ? 'Processing...'
                  : isPro
                  ? 'Add 30 days for Rs 1'
                  : 'Upgrade for ₹1'}
              </span>
            </button>
            {paymentsMode === 'test' && (
              <span className="dash-plan-test-notice">
                Test mode: no real money is charged.
              </span>
            )}
          </div>
        </div>
      </section>

      {/* "Check a new offer" CTA Card */}
      <section className="dash-card dash-cta-banner" aria-labelledby="check-new-offer-heading">
        <div className="dash-cta-banner-text">
          <h2 id="check-new-offer-heading" className="dash-heading-md">
            Check a new offer
          </h2>
          <p className="dash-text-secondary">
            Screen any job link, company name, recruiter email, or message across five live verification signals.
          </p>
        </div>
        <Link to="/dashboard/scan" className="dash-btn-primary">
          <span>Open scanner</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      {/* Recent Scans Table (Latest 5) */}
      <section className="dash-card" aria-labelledby="recent-scans-heading">
        <div className="dash-card-header-row">
          <h2 id="recent-scans-heading" className="dash-heading-md">
            Recent scans
          </h2>
          <Link to="/dashboard/history" className="dash-view-all-link">
            <span>View all</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        {errorMsg && (
          <div className="login-status-alert login-status-error" role="alert" style={{ marginBottom: '16px' }}>
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="dash-skeleton-table" role="status" aria-label="Loading recent scans">
            {[1, 2, 3].map((row) => (
              <div key={row} className="dash-skeleton-row">
                <div className="dash-skeleton dash-sk-col-sm" />
                <div className="dash-skeleton dash-sk-col-lg" />
                <div className="dash-skeleton dash-sk-col-badge" />
                <div className="dash-skeleton dash-sk-col-sm" />
              </div>
            ))}
          </div>
        ) : recentScans.length === 0 ? (
          <div className="dash-empty-state">
            <EmptyScansIllustration />
            <h3 className="dash-heading-md">No saved scans yet</h3>
            <p className="dash-text-secondary" style={{ maxWidth: '420px' }}>
              When you screen a job offer while signed in, the full report and Proof ID are automatically saved here.
            </p>
            <div className="dash-empty-actions">
              <Link to="/dashboard/scan" className="dash-btn-primary">
                Scan a job
              </Link>
            </div>
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-scans-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Company / Host</th>
                  <th scope="col">Level</th>
                  <th scope="col">Score</th>
                  <th scope="col">Proof ID</th>
                  <th scope="col" className="dash-col-actions">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentScans.map((item) => {
                  const toolTag = recentScansToolKinds[item.id];
                  const primaryLabel =
                    item.company ||
                    item.host ||
                    (toolTag === 'UPI'
                      ? 'UPI Payment Check'
                      : toolTag === 'Message'
                      ? 'Message Scan'
                      : 'Screening result');
                  const secondaryLabel =
                    item.company && item.host
                      ? item.host
                      : item.headline || 'Saved screening report';
                  const isCopied = copiedId === item.proofId;

                  return (
                    <tr key={item.id}>
                      <td data-label="Date" className="dash-cell-date">
                        {formatScanDate(item.createdAt)}
                      </td>
                      <td data-label="Company / Host" className="dash-cell-company">
                        <Link to={`/dashboard/history/${item.id}`} className="dash-company-link">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {toolTag && toolTag !== 'Job' && (
                              <span className={`dash-tool-tag dash-tool-${toolTag.toLowerCase()}`}>
                                {toolTag}
                              </span>
                            )}
                            <strong>{primaryLabel}</strong>
                          </div>
                          <span>{secondaryLabel}</span>
                        </Link>
                      </td>
                      <td data-label="Level">
                        <span className={getLevelBadgeClass(item.level)}>
                          {formatLevelLabel(item.level)}
                        </span>
                      </td>
                      <td data-label="Score" className="dash-cell-score">
                        {item.score != null ? (
                          <span className="dash-score-mono">{item.score}/100</span>
                        ) : (
                          '\u2014'
                        )}
                      </td>
                      <td data-label="Proof ID" className="dash-cell-proof">
                        {item.proofId ? (
                          <div className="dash-proof-cell-inner">
                            <code className="dash-proof-code" title={item.proofId}>
                              {shortenProofId(item.proofId)}
                            </code>
                            <button
                              type="button"
                              className="dash-copy-btn"
                              onClick={() => handleCopyProofId(item.proofId)}
                              aria-label={`Copy Proof ID ${item.proofId}`}
                            >
                              {isCopied ? <Check size={12} /> : <Copy size={12} />}
                              <span>{isCopied ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        ) : (
                          '\u2014'
                        )}
                      </td>
                      <td data-label="Action" className="dash-cell-action">
                        <Link to={`/dashboard/history/${item.id}`} className="dash-btn-outline dash-btn-sm">
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// Keep named export Dashboard as an alias for DashboardOverview
export const Dashboard = DashboardOverview;

/* ==========================================================================
   STEP 3.5: SCAN A JOB (/dashboard/scan)
   ========================================================================== */

export function DashboardScan() {
  return (
    <div className="dash-page-stack">
      <header className="dash-page-header">
        <div>
          <h1 className="dash-heading-lg">Scan a job offer</h1>
          <p className="dash-text-secondary">
            Results are automatically saved to your account history with a cryptographic Proof ID.
          </p>
        </div>
        <Link to="/dashboard/history" className="dash-btn-outline">
          <History size={16} aria-hidden="true" />
          <span>View history</span>
        </Link>
      </header>

      <Scan embedded={true} />
    </div>
  );
}

/* ==========================================================================
   STEP 3.6: HISTORY (/dashboard/history)
   ========================================================================== */

export function DashboardHistory() {
  const [items, setItems] = useState([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError] = useState(null);
  const [page, setPage] = useState(1);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [levelFilter, setLevelFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Row delete confirmation state
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deletingRow, setDeletingRow] = useState(false);

  const LIMIT = 10;

  const loadTable = useCallback(async (targetPage, targetLevel) => {
    setTableLoading(true);
    setTableError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(LIMIT)
      });
      if (targetLevel) {
        params.set('level', targetLevel);
      }
      const res = await apiFetch(`/api/scans?${params.toString()}`);
      const list = Array.isArray(res?.items) ? res.items : [];
      setItems(list);
      setFilteredTotal(typeof res?.total === 'number' ? res.total : list.length);
    } catch (err) {
      if (err?.status !== 401) {
        setTableError(err?.message || 'Could not load your scan history.');
      }
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTable(page, levelFilter);
  }, [page, levelFilter, loadTable]);

  const handleCopyProofId = async (proofId) => {
    if (!proofId) return;
    try {
      await navigator.clipboard?.writeText?.(proofId);
      setCopiedId(proofId);
      setTimeout(() => {
        setCopiedId((prev) => (prev === proofId ? null : prev));
      }, 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleLevelChange = (nextLevel) => {
    setLevelFilter(nextLevel);
    setPage(1);
  };

  const handleConfirmRowDelete = async () => {
    if (!deleteTargetId || deletingRow) return;
    setDeletingRow(true);
    try {
      await apiFetch(`/api/scans/${encodeURIComponent(deleteTargetId)}`, {
        method: 'DELETE'
      });
      setDeleteTargetId(null);
      setDeletingRow(false);
      addToast('Scan deleted from your history.');
      const nextPage = items.length === 1 && page > 1 ? page - 1 : page;
      if (nextPage !== page) {
        setPage(nextPage);
      } else {
        loadTable(page, levelFilter);
      }
    } catch (err) {
      setDeletingRow(false);
      setDeleteTargetId(null);
      if (err?.status !== 401) {
        setTableError(err?.message || 'Could not delete this scan. Please try again.');
      }
    }
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleItems = normalizedSearch
    ? items.filter((item) => {
        const comp = String(item.company || '').toLowerCase();
        const host = String(item.host || '').toLowerCase();
        const proof = String(item.proofId || '').toLowerCase();
        const head = String(item.headline || '').toLowerCase();
        return (
          comp.includes(normalizedSearch) ||
          host.includes(normalizedSearch) ||
          proof.includes(normalizedSearch) ||
          head.includes(normalizedSearch)
        );
      })
    : items;

  const historyToolKinds = useScanToolKinds(visibleItems);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / LIMIT));

  return (
    <div className="dash-page-stack">
      <header className="dash-page-header">
        <div>
          <h1 className="dash-heading-lg">Scan history</h1>
          <p className="dash-text-secondary">
            Browse, filter, and manage every job offer screening saved to your account.
          </p>
        </div>
        <Link to="/dashboard/scan" className="dash-btn-primary">
          <ScanSearch size={16} aria-hidden="true" />
          <span>Scan a job</span>
        </Link>
      </header>

      <section className="dash-card" aria-labelledby="history-table-heading">
        <div className="dash-table-toolbar">
          <h2 id="history-table-heading" className="dash-heading-md">
            Saved scans
          </h2>

          <div className="dash-controls-row">
            {/* Search Box with proper visually hidden sr-only label */}
            <div className="dash-search-wrap">
              <label htmlFor="dash-scan-search" className="sr-only">
                Search by company, domain, or Proof ID
              </label>
              <Search size={16} className="dash-search-icon" aria-hidden="true" />
              <input
                id="dash-scan-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search company, host, Proof ID\u2026"
                className="dash-search-input"
              />
            </div>

            {/* Level Filter Chips */}
            <div className="dash-filter-pills" role="group" aria-label="Filter scans by risk level">
              {[
                { value: '', label: 'All' },
                { value: 'High', label: 'High' },
                { value: 'Medium', label: 'Medium' },
                { value: 'Low', label: 'Low' }
              ].map((f) => {
                const active = levelFilter === f.value;
                return (
                  <button
                    key={f.label}
                    type="button"
                    className={`dash-filter-btn ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    onClick={() => handleLevelChange(f.value)}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live status announcement for screen readers */}
        <div className="sr-only" aria-live="polite">
          {tableLoading
            ? 'Loading scans'
            : `${visibleItems.length} scan${visibleItems.length === 1 ? '' : 's'} shown`}
          {copiedId ? `, Proof ID ${copiedId} copied to clipboard` : ''}
        </div>

        {tableError && (
          <div className="login-status-alert login-status-error" role="alert" style={{ marginBottom: '16px' }}>
            {tableError}
          </div>
        )}

        {tableLoading ? (
          <div className="dash-skeleton-table" role="status" aria-label="Loading saved scans">
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="dash-skeleton-row">
                <div className="dash-skeleton dash-sk-col-sm" />
                <div className="dash-skeleton dash-sk-col-lg" />
                <div className="dash-skeleton dash-sk-col-badge" />
                <div className="dash-skeleton dash-sk-col-sm" />
                <div className="dash-skeleton dash-sk-col-md" />
              </div>
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="dash-empty-state">
            <EmptyScansIllustration />
            <h3 className="dash-heading-md">
              {levelFilter || normalizedSearch
                ? 'No scans match your current filter'
                : 'No saved scans yet'}
            </h3>
            <p className="dash-text-secondary" style={{ maxWidth: '420px' }}>
              {levelFilter || normalizedSearch
                ? 'Try clearing your search or selecting a different risk level.'
                : 'When you scan a job offer while signed in, the full report is saved here.'}
            </p>
            <div className="dash-empty-actions">
              {(levelFilter || normalizedSearch) && (
                <button
                  type="button"
                  className="dash-btn-outline"
                  onClick={() => {
                    setSearchQuery('');
                    handleLevelChange('');
                  }}
                >
                  Clear filter
                </button>
              )}
              <Link to="/dashboard/scan" className="dash-btn-primary">
                Scan a job
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="dash-table-wrap">
              <table className="dash-scans-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Company / Host</th>
                    <th scope="col">Level</th>
                    <th scope="col">Score</th>
                    <th scope="col">Proof ID</th>
                    <th scope="col" className="dash-col-actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const toolTag = historyToolKinds[item.id];
                    const primaryLabel =
                      item.company ||
                      item.host ||
                      (toolTag === 'UPI'
                        ? 'UPI Payment Check'
                        : toolTag === 'Message'
                        ? 'Message Scan'
                        : 'Screening result');
                    const secondaryLabel =
                      item.company && item.host
                        ? item.host
                        : item.headline || 'View full screening report';
                    const isCopied = copiedId === item.proofId;

                    return (
                      <tr key={item.id}>
                        <td data-label="Date" className="dash-cell-date">
                          {formatScanDate(item.createdAt)}
                        </td>
                        <td data-label="Company / Host" className="dash-cell-company">
                          <Link to={`/dashboard/history/${item.id}`} className="dash-company-link">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {toolTag && toolTag !== 'Job' && (
                                <span className={`dash-tool-tag dash-tool-${toolTag.toLowerCase()}`}>
                                  {toolTag}
                                </span>
                              )}
                              <strong>{primaryLabel}</strong>
                            </div>
                            <span>{secondaryLabel}</span>
                          </Link>
                        </td>
                        <td data-label="Level">
                          <span className={getLevelBadgeClass(item.level)}>
                            {formatLevelLabel(item.level)}
                          </span>
                        </td>
                        <td data-label="Score" className="dash-cell-score">
                          {item.score != null ? (
                            <span className="dash-score-mono">{item.score}/100</span>
                          ) : (
                            '\u2014'
                          )}
                        </td>
                        <td data-label="Proof ID" className="dash-cell-proof">
                          {item.proofId ? (
                            <div className="dash-proof-cell-inner">
                              <code className="dash-proof-code" title={item.proofId}>
                                {shortenProofId(item.proofId)}
                              </code>
                              <button
                                type="button"
                                className="dash-copy-btn"
                                onClick={() => handleCopyProofId(item.proofId)}
                                aria-label={`Copy Proof ID ${item.proofId}`}
                              >
                                {isCopied ? <Check size={12} /> : <Copy size={12} />}
                                <span>{isCopied ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                          ) : (
                            '\u2014'
                          )}
                        </td>
                        <td data-label="Actions" className="dash-cell-action">
                          <div className="dash-row-actions">
                            <Link
                              to={`/dashboard/history/${item.id}`}
                              className="dash-btn-outline dash-btn-sm"
                            >
                              Open
                            </Link>
                            <button
                              type="button"
                              className="dash-btn-danger-outline dash-btn-sm"
                              onClick={() => setDeleteTargetId(item.id)}
                              aria-label={`Delete scan for ${primaryLabel}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination (10 per page) */}
            <div className="dash-pagination-bar">
              <span className="dash-page-info">
                Page {page} of {totalPages} ({filteredTotal} total)
              </span>
              <div className="dash-page-btns">
                <button
                  type="button"
                  className="dash-page-btn"
                  disabled={page <= 1 || tableLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={15} />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  className="dash-page-btn"
                  disabled={page >= totalPages || tableLoading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <span>Next</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {deleteTargetId && (
        <DeleteScanConfirmDialog
          onConfirm={handleConfirmRowDelete}
          onCancel={() => !deletingRow && setDeleteTargetId(null)}
          deleting={deletingRow}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   STEP 3.7: SAVED REPORT (/dashboard/history/:id)
   ========================================================================== */

export function DashboardScanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedProof, setCopiedProof] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErrorMsg(null);

    apiFetch(`/api/scans/${encodeURIComponent(id || '')}`)
      .then((data) => {
        if (!mounted) return;
        setScan(data);
      })
      .catch((err) => {
        if (!mounted) return;
        if (err?.status === 404) {
          setErrorMsg('This scan could not be found or no longer exists.');
        } else if (err?.status !== 401) {
          setErrorMsg(err?.message || 'Could not load scan details.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  const handleCopyProof = async () => {
    if (!scan?.proofId) return;
    try {
      await navigator.clipboard?.writeText?.(scan.proofId);
      setCopiedProof(true);
      setTimeout(() => setCopiedProof(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleConfirmDelete = async () => {
    if (!scan?.id || deleting) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/scans/${encodeURIComponent(scan.id)}`, {
        method: 'DELETE'
      });
      setConfirmOpen(false);
      addToast('Scan deleted from your history.');
      navigate('/dashboard/history', { replace: true });
    } catch (err) {
      setDeleting(false);
      setConfirmOpen(false);
      if (err?.status !== 401) {
        setErrorMsg(err?.message || 'Could not delete this scan. Please try again.');
      }
    }
  };

  if (loading) {
    return (
      <div className="dash-page-stack" role="status" aria-live="polite">
        <div className="dash-card">
          <div className="dash-skeleton dash-sk-col-lg" style={{ height: '28px', marginBottom: '16px' }} />
          <div className="dash-skeleton" style={{ height: '120px', marginBottom: '16px' }} />
          <div className="dash-skeleton" style={{ height: '180px' }} />
        </div>
      </div>
    );
  }

  if (errorMsg || !scan) {
    return (
      <div className="dash-page-stack">
        <div className="dash-card dash-error-fallback" role="alert" aria-live="polite">
          <h1 className="dash-heading-lg">Scan unavailable</h1>
          <p className="dash-text-secondary">
            {errorMsg || 'This scan could not be found.'}
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link to="/dashboard/history" className="dash-btn-outline">
              <ArrowLeft size={15} />
              <span>Back to history</span>
            </Link>
            <Link to="/dashboard" className="dash-btn-primary">
              <span>Back to overview</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const r = scan.report || {};
  const o = r.overall || {};
  const inp = r.input || {};
  const checks = Array.isArray(r.checks) ? r.checks : [];
  const sources = Array.isArray(r.sources) ? r.sources : [];

  let headlineTitle = 'Verification result';
  let headlineSub = '';
  if (Array.isArray(scan.headline)) {
    headlineTitle = scan.headline[0] || headlineTitle;
    headlineSub = scan.headline[1] || '';
  } else if (typeof scan.headline === 'string') {
    headlineTitle = scan.headline;
  } else if (scan.level || o.level) {
    const lv = scan.level || o.level;
    headlineTitle = String(lv).charAt(0).toUpperCase() + String(lv).slice(1) + ' risk';
  }

  const score = typeof scan.score === 'number' ? scan.score : (typeof o.score === 'number' ? o.score : null);
  const level = String(scan.level || o.level || 'unknown').toLowerCase();
  const confidence =
    typeof scan.confidence === 'number'
      ? scan.confidence
      : typeof o.confidence === 'number'
      ? o.confidence
      : typeof r.confidence === 'number'
      ? r.confidence
      : 85;
  const checksWithEvidence = checks.filter(
    (c) => c && (c.score != null || (c.state && c.state !== 'not_applicable'))
  ).length;
  const gaugeDashOffset =
    score == null ? 125.6 : 125.6 - (125.6 * Math.min(100, Math.max(0, score))) / 100;

  return (
    <div className="scan-page dash-detail-page dash-page-stack">
      {/* Top Action Bar (Hidden in Print) */}
      <div className="dash-detail-topbar no-print">
        <Link to="/dashboard/history" className="dash-back-link">
          <ArrowLeft size={16} />
          <span>Back to history</span>
        </Link>

        <div className="dash-detail-actions">
          {scan.proofId && (
            <Link
              to={`/verify?proof=${encodeURIComponent(scan.proofId)}`}
              className="dash-btn-outline"
            >
              <ExternalLink size={14} />
              <span>Verify this proof</span>
            </Link>
          )}
          <button
            type="button"
            className="dash-btn-primary"
            onClick={() => window.print()}
          >
            <Printer size={14} />
            <span>Download PDF</span>
          </button>
          <button
            type="button"
            className="dash-btn-danger-outline"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 size={14} />
            <span>Delete scan</span>
          </button>
        </div>
      </div>

      {/* Print-only Header */}
      <div className="print-only">
        Cyber Shield &mdash; Job Offer Screening Report ({formatScanDateTime(scan.createdAt)})
      </div>

      {/* Offer / Tool Input Summary */}
      {inp.kind ? (
        <div className="dash-offer-meta-card">
          <div className="dash-offer-meta-item">
            <span className="dash-offer-meta-label">Tool</span>
            <span className={`dash-tool-tag dash-tool-${inp.kind}`}>
              {inp.kind === 'upi' ? 'UPI' : 'Message'}
            </span>
            <strong className="dash-offer-meta-val" style={{ marginLeft: '6px' }}>
              {inp.kind === 'upi' ? 'UPI and Payment Check' : 'Message Scanner'}
            </strong>
          </div>
          <div className="dash-offer-meta-item">
            <span className="dash-offer-meta-label">Input length</span>
            <span className="dash-offer-meta-val">{inp.inputLength || 0} characters</span>
          </div>
          {inp.linksCount > 0 && (
            <div className="dash-offer-meta-item">
              <span className="dash-offer-meta-label">Links detected</span>
              <span className="dash-offer-meta-val">{inp.linksCount}</span>
            </div>
          )}
          <div className="dash-offer-meta-item">
            <span className="dash-offer-meta-label">Scanned on</span>
            <span className="dash-offer-meta-val">{formatScanDateTime(scan.createdAt)}</span>
          </div>
        </div>
      ) : (inp.company || inp.url || inp.recruiterEmail) ? (
        <div className="dash-offer-meta-card">
          {inp.company && (
            <div className="dash-offer-meta-item">
              <span className="dash-offer-meta-label">Company</span>
              <strong className="dash-offer-meta-val">{inp.company}</strong>
            </div>
          )}
          {inp.url && (
            <div className="dash-offer-meta-item">
              <span className="dash-offer-meta-label">Job URL</span>
              <span className="dash-offer-meta-val mono">{inp.url}</span>
            </div>
          )}
          {inp.recruiterEmail && (
            <div className="dash-offer-meta-item">
              <span className="dash-offer-meta-label">Recruiter email</span>
              <span className="dash-offer-meta-val mono">{inp.recruiterEmail}</span>
            </div>
          )}
          <div className="dash-offer-meta-item">
            <span className="dash-offer-meta-label">Scanned on</span>
            <span className="dash-offer-meta-val">{formatScanDateTime(scan.createdAt)}</span>
          </div>
        </div>
      ) : null}

      {/* Verdict Card (same style as /scan) */}
      <motion.div
        className={`verdict v-${level}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="v-left">
          <h1 className="lvl">{headlineTitle}</h1>
          {headlineSub && <p>{headlineSub}</p>}
          {(scan.limitedEvidence || o.limitedEvidence) && (
            <p className="v-amber-note">
              Limited live evidence was available when this scan ran.
            </p>
          )}
          <div className="v-chips">
            <span className="v-chip">{checksWithEvidence} of 5 checks had evidence</span>
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
        </div>

        <div className="v-right">
          <div
            className="gauge-wrap"
            role="img"
            aria-label={score == null ? 'No score' : 'Risk score of ' + score}
          >
            <svg className="gauge" viewBox="0 0 100 50" aria-hidden="true">
              <path
                className="gauge-bg"
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                strokeWidth="12"
                strokeLinecap="round"
              />
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
                  transition={{ duration: 1.1, ease: 'easeOut' }}
                />
              )}
            </svg>
            <div className="score-num">
              <CountUp value={score} />
            </div>
          </div>
          <div className="score-cap">Risk score of 100</div>
        </div>
      </motion.div>

      {/* Primary Concern Banner if present */}
      {(r.primaryConcern || o.primaryConcern) && (
        <div className="dash-concern-card" role="region" aria-label="Primary risk concern">
          <div className="dash-concern-icon-wrap" aria-hidden="true">
            <AlertTriangle size={20} color="#F59E0B" />
          </div>
          <div className="dash-concern-text">
            <strong>Key Assessment:</strong>
            <p>{r.primaryConcern || o.primaryConcern}</p>
          </div>
        </div>
      )}

      {/* Extracted Artifacts Bar (UPI IDs, amounts, phones, links) */}
      {r.extractedItems && (
        (r.extractedItems.upiIds?.length > 0 ||
         r.extractedItems.amounts?.length > 0 ||
         r.extractedItems.phones?.length > 0 ||
         r.extractedItems.links?.length > 0 ||
         r.extractedItems.emails?.length > 0) && (
          <div className="dash-extracted-card">
            <h3 className="dash-card-subtitle">Extracted Payment &amp; Identity Signals</h3>
            <div className="dash-extracted-grid">
              {r.extractedItems.upiIds?.length > 0 && (
                <div className="dash-extracted-item">
                  <span className="dash-extracted-label">UPI Handles:</span>
                  <div className="dash-extracted-tags">
                    {r.extractedItems.upiIds.map((u, i) => (
                      <span key={i} className="dash-tag-pill mono">{typeof u === 'string' ? u : u.upiId || u}</span>
                    ))}
                  </div>
                </div>
              )}
              {r.extractedItems.amounts?.length > 0 && (
                <div className="dash-extracted-item">
                  <span className="dash-extracted-label">Amounts:</span>
                  <div className="dash-extracted-tags">
                    {r.extractedItems.amounts.map((a, i) => (
                      <span key={i} className="dash-tag-pill mono">{typeof a === 'string' ? a : (a.formatted || a.raw || a)}</span>
                    ))}
                  </div>
                </div>
              )}
              {r.extractedItems.phones?.length > 0 && (
                <div className="dash-extracted-item">
                  <span className="dash-extracted-label">Phones:</span>
                  <div className="dash-extracted-tags">
                    {r.extractedItems.phones.map((p, i) => (
                      <span key={i} className="dash-tag-pill mono">{typeof p === 'string' ? p : p.normalized || p}</span>
                    ))}
                  </div>
                </div>
              )}
              {r.extractedItems.links?.length > 0 && (
                <div className="dash-extracted-item">
                  <span className="dash-extracted-label">Links:</span>
                  <div className="dash-extracted-tags">
                    {r.extractedItems.links.map((l, i) => (
                      <span key={i} className="dash-tag-pill mono">{typeof l === 'string' ? l : l.url || l}</span>
                    ))}
                  </div>
                </div>
              )}
              {r.extractedItems.emails?.length > 0 && (
                <div className="dash-extracted-item">
                  <span className="dash-extracted-label">Emails:</span>
                  <div className="dash-extracted-tags">
                    {r.extractedItems.emails.map((e, i) => (
                      <span key={i} className="dash-tag-pill mono">{typeof e === 'string' ? e : e.email || e}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Check Summary Row (same style as /scan, without overwriting HashRouter URL) */}
      {checks.length > 0 && (
        <div className="check-summary-row no-print">
          {checks.map((c, i) => (
            <a
              key={i}
              href={`#detail-check-${i}`}
              className={`check-pill s-${c?.state || 'unknown'}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(`detail-check-${i}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <b></b>
              {c?.title || c?.key || `Check ${i + 1}`}
            </a>
          ))}
        </div>
      )}

      {/* Five Check Cards (same style as /scan) */}
      {checks.length > 0 && (
        <div className="report-grid">
          {checks.map((c, i) => {
            if (!c) return null;
            let findings = [];
            if (Array.isArray(c.findings) && c.findings.length > 0) {
              findings = c.findings.map(f => typeof f === 'string' ? { text: f, severity: c.state || 'info' } : f);
            } else if (typeof c.findings === 'string' && c.findings.trim()) {
              findings = [{ text: c.findings.trim(), severity: c.state || 'info' }];
            } else if (typeof c.summary === 'string' && c.summary.trim()) {
              findings = [{ text: c.summary.trim(), severity: c.state || 'info' }];
            } else if (typeof c.reason === 'string' && c.reason.trim()) {
              findings = [{ text: c.reason.trim(), severity: c.state || 'info' }];
            }

            if (findings.length === 0) {
              const fallbackMap = {
                payment_direction: c.state === 'flag' || c.state === 'fail'
                  ? 'Deceptive collect request pattern or reverse-transfer trap detected.'
                  : 'Evaluated sender vs. receiver collect flow and authorization requests.',
                proof_authenticity: c.state === 'not_applicable'
                  ? 'No payment receipt or transaction screenshot attached for authenticity analysis.'
                  : 'Evaluated payment receipt markers, reference numbers, and visual authenticity.',
                urgency_and_pressure: c.state === 'warning' || c.state === 'warn'
                  ? 'Pressure tactics detected, urging immediate action before verifying.'
                  : 'Evaluated message tone for coercive urgency, artificial deadlines, or countdowns.',
                channel_and_identity: c.state === 'flag' || c.state === 'fail'
                  ? 'Unverified contact handle or suspicious communication channel detected.'
                  : 'Evaluated contact identity, sender handle credibility, and registry history.',
                job_offer: 'Evaluated employment claims, salary plausibility, and recruiter credibility.'
              };
              const desc = fallbackMap[c.key] || (c.state === 'ok' || c.state === 'safe' ? 'Normal pattern observed with no warning signs.' : 'Detailed evaluation performed for this check.');
              findings = [{ text: desc, severity: c.state || 'info' }];
            }

            const state = c.state || 'unknown';
            const stateLabel = SL[state] || state;
            const scoreVal =
              typeof c.score === 'number'
                ? Math.min(100, Math.max(0, c.score))
                : (state === 'flag' || state === 'fail' || state === 'bad' ? 88
                   : (state === 'warning' || state === 'warn' ? 55
                   : (state === 'ok' || state === 'safe' || state === 'pass' ? 12 : 20)));
            const fillWidth = Math.max(10, scoreVal);

            return (
              <div className="check" id={`detail-check-${i}`} key={i}>
                <div className="chead">
                  <h3>{c.title || c.key || `Check ${i + 1}`}</h3>
                  <span className={`pill s-${state}`}>{stateLabel}</span>
                </div>
                <div
                  className={`meter m-${state}`}
                  role="progressbar"
                  aria-valuenow={scoreVal}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-label={`Risk ${scoreVal} of 100`}
                >
                  <i style={{ width: `${fillWidth}%`, '--fill-width': `${fillWidth}%` }}></i>
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
              </div>
            );
          })}
        </div>
      )}

      {/* Recommended Safety Actions if present */}
      {Array.isArray(r.whatToDo) && r.whatToDo.length > 0 && (
        <div className="dash-actions-card">
          <h3 className="dash-card-subtitle">Recommended Safety Actions</h3>
          <ul className="dash-steps-list">
            {r.whatToDo.map((step, idx) => (
              <li key={idx}>
                <CheckCircle2 size={16} color="var(--accent-cyan, #22D3EE)" aria-hidden="true" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Verbatim Evidence Excerpts if present */}
      {Array.isArray(r.evidence) && r.evidence.length > 0 && (
        <div className="dash-evidence-card">
          <h3 className="dash-card-subtitle">Verified Verbatim Excerpts from Input</h3>
          <div className="dash-evidence-list">
            {r.evidence.map((ev, i) => (
              <div key={i} className="dash-evidence-box">
                <blockquote className="dash-quote">&ldquo;{ev.quote}&rdquo;</blockquote>
                {ev.interpretation && (
                  <p className="dash-quote-interp">{ev.interpretation}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="small">
        Sources used: {sources.length ? sources.join(', ') : 'none of the live services answered'}.
      </p>

      {/* Proof Card */}
      <div className="scan-card proof-card">
        <h3>Your scan proof</h3>
        <div className="proof-grid">
          <div className="proof-item">
            <label>Proof ID</label>
            <div className="val">
              <span>{scan.proofId || '\u2014'}</span>
              {scan.proofId && (
                <button
                  type="button"
                  className="copy-btn no-print"
                  onClick={handleCopyProof}
                >
                  {copiedProof ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>
          <div className="proof-item">
            <label>Time (UTC)</label>
            <div className="val">{formatScanDateTime(scan.createdAt || r.generatedAt)}</div>
          </div>
        </div>

        <div className="sr-only" aria-live="polite">
          {copiedProof ? 'Proof ID copied to clipboard' : ''}
        </div>

        <div className="proof-btns no-print" style={{ alignItems: 'center' }}>
          <button
            type="button"
            className="primary"
            onClick={() => window.print()}
          >
            Download PDF
          </button>
          {scan.proofId && (
            <Link
              to={`/verify?proof=${encodeURIComponent(scan.proofId)}`}
              className="dash-btn-outline"
            >
              Verify this proof
            </Link>
          )}
          <button
            type="button"
            className="dash-btn-danger-outline"
            onClick={() => setConfirmOpen(true)}
          >
            Delete scan
          </button>
        </div>
      </div>

      {confirmOpen && (
        <DeleteScanConfirmDialog
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmOpen(false)}
          deleting={deleting}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   STEP 3.8: PLAN (/dashboard/plan)
   ========================================================================== */

export function DashboardPlan() {
  const { session } = useAuth();
  const {
    isPro,
    expiresAt,
    daysLeft,
    paymentsMode,
    isPaymentsAvailable
  } = useBillingStatus(session);
  const { usage, usageText } = useUsage();
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const handleUpgrade = () => {
    if (!isPaymentsAvailable) return;
    startUpgrade({
      session,
      onProgress: setUpgradeLoading
    });
  };

  const checksUsed = usage?.used ?? (isPro ? 0 : 1);
  const checksLimit = usage?.allowance ?? (isPro ? 100 : 5);
  const percentUsed = Math.min(100, Math.round((checksUsed / checksLimit) * 100));

  return (
    <div className="dash-page-stack dash-plan-stack">
      <header className="dash-page-header">
        <div>
          <h1 className="dash-heading-lg">Plans &amp; Subscription</h1>
          <p className="dash-text-secondary">
            Manage your screening allowance, active tier, and payment pass.
          </p>
        </div>
      </header>

      {/* Active Plan & Quota Status Hero Card */}
      <div className="dash-plan-hero-card">
        <div className="dash-plan-hero-top">
          <div className="dash-plan-hero-left">
            <span className={`feature-pill-badge ${isPro ? 'pill-pro' : 'pill-active'}`}>
              {isPro ? 'Pro 30-Day Pass Active' : 'Free Tier Active'}
            </span>
            <h2 className="dash-plan-hero-title">
              {isPro ? 'Pro Screening Plan' : 'Free Screening Allowance'}
            </h2>
            <p className="dash-plan-hero-desc">
              {isPro && expiresAt ? (
                <>Active until <strong>{formatExpiryDate(expiresAt)}</strong> &bull; {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</>
              ) : (
                <>5 checks per calendar month &bull; Resets on the 1st of each month</>
              )}
            </p>
          </div>

          <div className="dash-plan-hero-right">
            <div className="dash-plan-usage-stat">
              <span className="dash-plan-usage-num">{checksUsed} / {checksLimit}</span>
              <span className="dash-plan-usage-label">Checks Used</span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="dash-plan-hero-progress-wrap">
          <div className="dash-plan-hero-bar" role="progressbar" aria-valuenow={checksUsed} aria-valuemin="0" aria-valuemax={checksLimit}>
            <div className={`dash-plan-hero-fill ${isPro ? 'fill-pro' : 'fill-free'}`} style={{ width: `${percentUsed}%` }} />
          </div>
          <div className="dash-plan-hero-progress-meta">
            <span>{usageText || `${checksUsed} of ${checksLimit} checks used`}</span>
            <span>{isPro ? 'No auto-renewal &bull; One-time pass' : 'Resets on 1st of each month (IST)'}</span>
          </div>
        </div>
      </div>

      {/* Two Tier Comparison Cards */}
      <div className="dash-plan-grid">
        {/* Card 1: Free */}
        <div className={`dash-tier-card ${!isPro ? 'is-active-tier' : ''}`}>
          <div className="dash-tier-header">
            <div className="dash-tier-badge-row">
              <span className="dash-tier-badge badge-free">Free</span>
              {!isPro && <span className="dash-current-pill">Current Plan</span>}
            </div>
            <h3 className="dash-tier-name">Free Plan</h3>
            <p className="dash-tier-tagline">Essential screening for individual job seekers and students.</p>
            <div className="dash-tier-price-row">
              <span className="dash-tier-price">₹0</span>
              <span className="dash-tier-period">/ month</span>
            </div>
          </div>

          <ul className="dash-tier-features">
            <li>
              <CheckCircle2 size={16} className="tier-check-icon icon-ok" aria-hidden="true" />
              <span><strong>5 checks per month</strong> (3 anonymous + 2 signed-in)</span>
            </li>
            <li>
              <CheckCircle2 size={16} className="tier-check-icon icon-ok" aria-hidden="true" />
              <span>Full Job, UPI, and Message security checks</span>
            </li>
            <li>
              <CheckCircle2 size={16} className="tier-check-icon icon-ok" aria-hidden="true" />
              <span>Cryptographic Proof ID &amp; ledger verification</span>
            </li>
            <li>
              <CheckCircle2 size={16} className="tier-check-icon icon-ok" aria-hidden="true" />
              <span>PDF and JSON receipt downloads</span>
            </li>
            <li>
              <CheckCircle2 size={16} className="tier-check-icon icon-ok" aria-hidden="true" />
              <span>Saved scan history in your dashboard</span>
            </li>
          </ul>

          <div className="dash-tier-cta">
            <Link to="/dashboard/scan" className="dash-btn-outline" style={{ width: '100%', textAlign: 'center' }}>
              Run a check
            </Link>
          </div>
        </div>

        {/* Card 2: Pro */}
        <div className={`dash-tier-card is-pro-tier ${isPro ? 'is-active-tier' : ''}`}>
          <div className="dash-tier-header">
            <div className="dash-tier-badge-row">
              <span className="dash-tier-badge badge-pro">Pro Pass</span>
              {isPro && <span className="dash-current-pill">Current Plan</span>}
            </div>
            <h3 className="dash-tier-name">Pro 30-Day Pass</h3>
            <p className="dash-tier-tagline">High-volume check capacity and priority screening for active verification.</p>
            <div className="dash-tier-price-row">
              <span className="dash-tier-price">₹1</span>
              <span className="dash-tier-period">/ 30-day pass</span>
            </div>
          </div>

          <ul className="dash-tier-features">
            <li>
              <CheckCircle2 size={16} className="tier-check-icon icon-pro" aria-hidden="true" />
              <span><strong>Up to 100 checks</strong> within 30 days</span>
            </li>
            <li>
              <CheckCircle2 size={16} className="tier-check-icon icon-pro" aria-hidden="true" />
              <span>Everything included in the Free tier</span>
            </li>
            <li>
              <CheckCircle2 size={16} className="tier-check-icon icon-pro" aria-hidden="true" />
              <span>Permanent history retention &amp; proof archiving</span>
            </li>
            <li>
              <CheckCircle2 size={16} className="tier-check-icon icon-pro" aria-hidden="true" />
              <span>Zero auto-renewal (never unexpected charges)</span>
            </li>
            <li>
              <CheckCircle2 size={16} className="tier-check-icon icon-pro" aria-hidden="true" />
              <span>Priority dual-pass AI screening models</span>
            </li>
          </ul>

          <div className="dash-tier-cta">
            <button
              type="button"
              className="dash-btn-primary dash-btn-pro"
              style={{ width: '100%', textAlign: 'center' }}
              onClick={handleUpgrade}
              disabled={upgradeLoading || !isPaymentsAvailable}
            >
              {!isPaymentsAvailable
                ? 'Payments unavailable right now'
                : upgradeLoading
                ? 'Opening checkout...'
                : isPro
                ? 'Extend pass by 30 days (₹1)'
                : 'Upgrade for ₹1'}
            </button>
            {paymentsMode === 'test' && (
              <p className="dash-plan-test-notice">
                Test mode: Razorpay test credentials, no real money debited.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   STEP 3.9: SETTINGS (/dashboard/settings)
   ========================================================================== */

export function DashboardSettings() {
  const { session, profile, updateDisplayName, signOut } = useAuth();
  const { isPro, daysLeft, expiresAt } = useBillingStatus(session);
  const { usage } = useUsage();
  const navigate = useNavigate();

  const currentDisplayName = getDisplayName(profile, session);
  const email = (profile?.email || session?.user?.email || '').trim();

  const [nameValue, setNameValue] = useState(profile?.display_name || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);

  // Delete account state
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState(null);

  useEffect(() => {
    if (typeof profile?.display_name === 'string') {
      setNameValue(profile.display_name);
    }
  }, [profile?.display_name]);

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (saving) return;
    const trimmed = nameValue.trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
      setErrorMsg('Please enter a display name between 1 and 60 characters.');
      setSavedMsg(null);
      return;
    }
    setErrorMsg(null);
    setSavedMsg(null);
    setSaving(true);
    try {
      await updateDisplayName(trimmed);
      setSavedMsg('Display name updated successfully.');
    } catch (err) {
      if (err?.status !== 401) {
        setErrorMsg(err?.message || 'Could not update display name right now. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (deletingAccount || deleteConfirmText !== 'DELETE') return;
    setDeleteErrorMsg(null);
    setDeletingAccount(true);
    try {
      await apiFetch('/api/me', { method: 'DELETE' });
      await signOut();
      addToast('Your account and saved scans have been deleted.');
      navigate('/', { replace: true });
    } catch (err) {
      setDeletingAccount(false);
      if (err?.status !== 401) {
        setDeleteErrorMsg(err?.message || 'Could not delete your account right now. Please try again.');
      }
    }
  };

  return (
    <div className="dash-page-stack dash-settings-stack">
      <header className="dash-page-header">
        <div>
          <h1 className="dash-heading-lg">Account Settings</h1>
          <p className="dash-text-secondary">
            Manage your personal profile, active subscription, and data privacy.
          </p>
        </div>
      </header>

      {/* Section Card 1: Profile */}
      <section className="dash-card dash-settings-card" aria-labelledby="settings-profile-heading">
        <div className="dash-settings-section-head">
          <UserAvatar profile={profile} session={session} size={48} />
          <div>
            <h2 id="settings-profile-heading" className="dash-heading-md">
              Profile Information
            </h2>
            <p className="dash-text-secondary">
              Update your display name visible across your verification history.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveName} className="dash-settings-form">
          <div className="f">
            <label htmlFor="settings-display-name">Display name</label>
            <input
              id="settings-display-name"
              type="text"
              maxLength={60}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder={currentDisplayName}
              disabled={saving}
              autoComplete="name"
            />
          </div>

          <div className="f">
            <label htmlFor="settings-email-readonly">Email address</label>
            <input
              id="settings-email-readonly"
              type="email"
              value={email}
              readOnly
              disabled
              className="login-input-disabled"
            />
            <span style={{ fontSize: '12px', color: 'var(--text-dim, #94A3B8)', marginTop: '4px', display: 'block' }}>
              Connected via Supabase Authentication. Email changes require security verification.
            </span>
          </div>

          <div aria-live="polite">
            {errorMsg && (
              <div className="login-status-alert login-status-error" role="alert">
                {errorMsg}
              </div>
            )}
            {savedMsg && (
              <div className="login-status-alert login-status-success" role="status">
                {savedMsg}
              </div>
            )}
          </div>

          <div className="dash-settings-actions">
            <button type="submit" className="dash-btn-primary" disabled={saving}>
              {saving ? 'Saving changes...' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>

      {/* Section Card 2: Plan & Quota Summary */}
      <section className="dash-card dash-settings-card" aria-labelledby="settings-account-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h2 id="settings-account-heading" className="dash-heading-md" style={{ marginBottom: '4px' }}>
              Plan &amp; Quota
            </h2>
            <p className="dash-text-secondary">
              Your active subscription tier and check allowance for this billing period.
            </p>
          </div>
          <Link to="/dashboard/plan" className="dash-btn-outline">
            Manage plan
          </Link>
        </div>

        <div className="dash-plan-summary-row">
          <div>
            <span className="dash-plan-label">Active Tier</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
              <strong style={{ fontSize: '16px', color: '#FFFFFF' }}>{isPro ? 'Pro Pass' : 'Free Tier'}</strong>
              <span className={`feature-pill-badge ${isPro ? 'pill-pro' : 'pill-active'}`}>
                {isPro ? `${daysLeft} days left` : '5 checks / month'}
              </span>
            </div>
            {isPro && expiresAt && (
              <span style={{ fontSize: '12.5px', color: 'var(--text-dim, #94A3B8)', marginTop: '4px', display: 'block' }}>
                Valid through {formatExpiryDate(expiresAt)}
              </span>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <span className="dash-plan-label">Usage This Period</span>
            <div style={{ fontSize: '15px', color: '#FFFFFF', fontWeight: 600, marginTop: '6px' }}>
              {usage?.used ?? (isPro ? 0 : 1)} of {usage?.allowance ?? (isPro ? 100 : 5)} checks
            </div>
          </div>
        </div>

        <div className="dash-settings-actions" style={{ marginTop: '20px' }}>
          <button
            type="button"
            className="dash-btn-outline"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            <LogOut size={15} aria-hidden="true" />
            <span>Sign out of session</span>
          </button>
        </div>
      </section>

      {/* Section Card 3: Danger Zone */}
      <section
        className="dash-card dash-danger-card"
        aria-labelledby="danger-zone-heading"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <AlertTriangle size={18} color="#F87171" aria-hidden="true" />
          <h2 id="danger-zone-heading" className="dash-heading-md" style={{ color: '#F87171' }}>
            Danger zone
          </h2>
        </div>
        <p className="dash-text-secondary" style={{ marginBottom: '16px' }}>
          Permanently delete your account, profile, and all saved scan history. Existing ledger
          verification hashes remain anonymous and tamper-evident. This action cannot be undone.
        </p>

        <form onSubmit={handleDeleteAccount} className="dash-settings-form">
          <div className="f">
            <label htmlFor="delete-account-confirm">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              id="delete-account-confirm"
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={deletingAccount}
            />
          </div>

          <div aria-live="polite">
            {deleteErrorMsg && (
              <div className="login-status-alert login-status-error" role="alert">
                {deleteErrorMsg}
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              className="dash-btn-danger"
              disabled={deletingAccount || deleteConfirmText !== 'DELETE'}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>{deletingAccount ? 'Deleting account\u2026' : 'Delete my account'}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default DashboardLayout;
