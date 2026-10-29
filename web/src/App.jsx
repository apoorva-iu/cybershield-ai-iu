import React, { Suspense } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth, setReturnTo } from './auth';

// Keep Home and Scan eagerly loaded as requested
import { Home } from './pages/Home';
import { Scan } from './pages/Scan';

// Lazy-load every other route
const Verify = React.lazy(() =>
  import('./pages/Verify').then((m) => ({ default: m.Verify }))
);
const Login = React.lazy(() =>
  import('./pages/Login').then((m) => ({ default: m.Login }))
);
const NotFound = React.lazy(() =>
  import('./components/NotFound').then((m) => ({ default: m.NotFound }))
);

// Lazy-load Dashboard App Shell and nested routes
const DashboardLayout = React.lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.DashboardLayout }))
);
const DashboardOverview = React.lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.DashboardOverview }))
);
const DashboardScan = React.lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.DashboardScan }))
);
const DashboardHistory = React.lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.DashboardHistory }))
);
const DashboardScanDetail = React.lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.DashboardScanDetail }))
);
const DashboardPlan = React.lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.DashboardPlan }))
);
const DashboardSettings = React.lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.DashboardSettings }))
);
const LegacyScanRedirect = React.lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.LegacyScanRedirect }))
);

const Resources = React.lazy(() =>
  import('./pages/Resources').then((m) => ({ default: m.Resources }))
);
const HowItWorks = React.lazy(() =>
  import('./pages/HowItWorks').then((m) => ({ default: m.HowItWorks }))
);

const Terms = React.lazy(() =>
  import('./pages/Terms').then((m) => ({ default: m.Terms }))
);
const Privacy = React.lazy(() =>
  import('./pages/Privacy').then((m) => ({ default: m.Privacy }))
);

const Pricing = React.lazy(() =>
  import('./pages/Pricing').then((m) => ({ default: m.Pricing }))
);
const Extension = React.lazy(() =>
  import('./pages/Extension').then((m) => ({ default: m.Extension }))
);
const Tools = React.lazy(() =>
  import('./pages/Tools').then((m) => ({ default: m.Tools }))
);
const ToolDetail = React.lazy(() =>
  import('./pages/ToolDetail').then((m) => ({ default: m.ToolDetail }))
);
const UpiCheck = React.lazy(() =>
  import('./pages/UpiCheck').then((m) => ({ default: m.UpiCheck }))
);
const MessageCheck = React.lazy(() =>
  import('./pages/MessageCheck').then((m) => ({ default: m.MessageCheck }))
);

function RouteLoading() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      role="status"
      aria-label="Loading page"
    >
      <div className="spinner" />
    </div>
  );
}

function DashboardRouteFallback() {
  return (
    <div className="dash-page-stack" role="status" aria-live="polite" aria-label="Loading dashboard section">
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

function DashboardShellFallback() {
  return (
    <div className="dash-shell" role="status" aria-live="polite" aria-label="Loading dashboard">
      <aside className="dash-sidebar no-print" aria-hidden="true">
        <div className="dash-sidebar-top">
          <div className="dash-sidebar-brand-row">
            <div className="dash-skeleton" style={{ width: '130px', height: '26px' }} />
          </div>
          <div className="dash-skeleton" style={{ width: '84px', height: '16px', marginTop: '6px' }} />
        </div>
        <div className="dash-sidebar-nav" style={{ gap: '8px' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="dash-skeleton" style={{ width: '100%', height: '38px', borderRadius: '8px' }} />
          ))}
        </div>
        <div className="dash-sidebar-footer">
          <div className="dash-skeleton" style={{ width: '100%', height: '44px', borderRadius: '8px' }} />
        </div>
      </aside>
      <div className="dash-main-area">
        <div className="dash-main-container">
          <DashboardRouteFallback />
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { authReady, session } = useAuth();
  const location = useLocation();

  // Do not redirect while auth is still initializing; let DashboardLayout render skeletons
  if (!authReady) {
    return children;
  }

  if (!session) {
    const intended = location.pathname + (location.search || '');
    setReturnTo(intended);
    return <Navigate to="/login" state={{ from: intended }} replace />;
  }

  return children;
}

function ScanRedirect() {
  const location = useLocation();
  return <Navigate to={`/tools/job-scam-check${location.search}${location.hash}`} replace />;
}

function ScrollToTop() {
  const location = useLocation();

  React.useEffect(() => {
    if (!location.hash && !location.search.includes('section=')) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [location.pathname, location.search, location.hash]);

  return null;
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="scan" element={<ScanRedirect />} />
            <Route path="tools/job-scam-check" element={<Scan />} />
            <Route
              path="tools"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Tools />
                </Suspense>
              }
            />
            <Route
              path="tools/upi-payment-check"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <UpiCheck />
                </Suspense>
              }
            />
            <Route
              path="tools/message-scanner"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <MessageCheck />
                </Suspense>
              }
            />
            <Route
              path="tools/:slug"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <ToolDetail />
                </Suspense>
              }
            />

            <Route
              path="verify"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Verify />
                </Suspense>
              }
            />
            <Route
              path="login"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Login mode="login" />
                </Suspense>
              }
            />
            <Route
              path="signup"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Login mode="signup" />
                </Suspense>
              }
            />
            <Route
              path="forgot-password"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Login mode="forgot-password" />
                </Suspense>
              }
            />
            <Route
              path="reset-password"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Login mode="reset-password" />
                </Suspense>
              }
            />

            <Route
              path="resources"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Resources />
                </Suspense>
              }
            />
            <Route
              path="how-it-works"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <HowItWorks />
                </Suspense>
              }
            />
            <Route path="about" element={<Navigate to="/how-it-works" replace />} />
            <Route path="guide" element={<Navigate to="/resources?section=scam-guides" replace />} />
            <Route path="scam-types" element={<Navigate to="/resources?section=scam-guides" replace />} />
            <Route path="helpline-1930" element={<Navigate to="/resources?section=safety-checklist" replace />} />
            <Route
              path="privacy"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Privacy />
                </Suspense>
              }
            />
            <Route
              path="terms"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Terms />
                </Suspense>
              }
            />
            <Route path="contact" element={<Navigate to="/resources?section=contact-report" replace />} />

            <Route
              path="pricing"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Pricing />
                </Suspense>
              }
            />
            <Route
              path="extension"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <Extension />
                </Suspense>
              }
            />

            {/* Nested Dashboard App Shell Routes */}
            <Route
              path="dashboard"
              element={
                <ErrorBoundary>
                  <ProtectedRoute>
                    <Suspense fallback={<DashboardShellFallback />}>
                      <DashboardLayout />
                    </Suspense>
                  </ProtectedRoute>
                </ErrorBoundary>
              }
            >
              <Route
                index
                element={
                  <Suspense fallback={<DashboardRouteFallback />}>
                    <DashboardOverview />
                  </Suspense>
                }
              />
              <Route
                path="scan"
                element={
                  <Suspense fallback={<DashboardRouteFallback />}>
                    <DashboardScan />
                  </Suspense>
                }
              />
              <Route
                path="history"
                element={
                  <Suspense fallback={<DashboardRouteFallback />}>
                    <DashboardHistory />
                  </Suspense>
                }
              />
              <Route
                path="history/:id"
                element={
                  <Suspense fallback={<DashboardRouteFallback />}>
                    <DashboardScanDetail />
                  </Suspense>
                }
              />
              <Route
                path="plan"
                element={
                  <Suspense fallback={<DashboardRouteFallback />}>
                    <DashboardPlan />
                  </Suspense>
                }
              />
              <Route
                path="settings"
                element={
                  <Suspense fallback={<DashboardRouteFallback />}>
                    <DashboardSettings />
                  </Suspense>
                }
              />
              {/* Legacy URL redirects */}
              <Route path="scans" element={<Navigate to="/dashboard/history" replace />} />
              <Route
                path="scans/:id"
                element={
                  <Suspense fallback={<DashboardRouteFallback />}>
                    <LegacyScanRedirect />
                  </Suspense>
                }
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>

            <Route
              path="*"
              element={
                <Suspense fallback={<RouteLoading />}>
                  <NotFound />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
