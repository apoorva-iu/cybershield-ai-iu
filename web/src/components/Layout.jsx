import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Container } from './ui';
import { ToastContainer } from './Toast';
import '../layout.css';

const AUTH_PATHS = new Set(['/login', '/signup', '/forgot-password', '/reset-password']);

export function Layout() {
  const location = useLocation();
  const isAuthPage = AUTH_PATHS.has(location.pathname);
  const isDashboardPage =
    location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/');
  const hideSiteChrome = isAuthPage || isDashboardPage;

  const handleSkipToContent = (e) => {
    e.preventDefault();
    const el = document.getElementById('main-content');
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="layout">
      <a
        href="#main-content"
        className="skip-to-content-link"
        onClick={handleSkipToContent}
      >
        Skip to main content
      </a>
      {!hideSiteChrome && <Header />}

      <main className={`main-content ${hideSiteChrome ? 'main-content-bare' : ''}`} id="main-content" tabIndex={-1}>
        <Outlet />
      </main>

      {!hideSiteChrome && (
        <footer className="footer">
          <Container>
            <div className="footer-content">
              <div className="footer-links">
                <Link to="/tools/job-scam-check">Job Scam Check</Link>
                <Link to="/tools/upi-payment-check">UPI Check</Link>
                <Link to="/tools/message-scanner">Message Scanner</Link>
                <Link to="/verify">Verify</Link>
                <Link to="/pricing">Pricing</Link>
                <Link to="/how-it-works">How it works</Link>
                <Link to="/extension">Extension</Link>
                <Link to="/privacy">Privacy</Link>
                <Link to="/terms">Terms</Link>
                <Link to="/contact">Contact</Link>
              </div>
              <p className="footer-disclaimer">Screening aid, not a legal finding.</p>
              <p className="footer-copy" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                Privacy &amp; Terms: Draft for review, not legal advice. &bull; &copy; {new Date().getFullYear()} Cyber Shield.
              </p>
            </div>
          </Container>
        </footer>
      )}

      <ToastContainer />
    </div>
  );
}

