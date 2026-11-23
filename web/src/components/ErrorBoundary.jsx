import React from 'react';
import { Button, Container, Section } from './ui';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(error?.message || error, errorInfo?.componentStack || errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      const isDev = Boolean(import.meta.env && import.meta.env.DEV);
      return (
        <Section className="route-transition">
          <Container style={{ textAlign: 'center', maxWidth: '600px' }}>
            <h1 style={{ marginBottom: '16px' }}>Something went wrong</h1>
            <p style={{ color: 'var(--muted)', marginBottom: '32px' }}>
              We encountered an unexpected error. Please try reloading the page or go back home.
            </p>
            {isDev && this.state.error && (
              <details style={{ textAlign: 'left', marginBottom: '24px', background: 'var(--surface-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', overflowX: 'auto' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Details</summary>
                <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--risk-bad, #c00)' }}>
                  <strong>{this.state.error.message || String(this.state.error)}</strong>
                  {this.state.errorInfo?.componentStack && (
                    <pre style={{ marginTop: '8px', fontSize: '12px', whiteSpace: 'pre-wrap', color: 'var(--text-dim)' }}>
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}
            <Button variant="primary" onClick={() => window.location.href = '/'}>
              Back to home
            </Button>
          </Container>
        </Section>
      );
    }
    return this.props.children;
  }
}
