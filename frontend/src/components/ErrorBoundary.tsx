/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 */

/// <reference types="vite/client" />

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // In production, you would send this to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div style={styles.container}>
          <div style={styles.content}>
            <div style={styles.icon}>⚠️</div>
            <h2 style={styles.title}>Etwas ist schief gelaufen</h2>
            <p style={styles.message}>
              Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre style={styles.errorDetails}>
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            )}
            <div style={styles.actions}>
              <button style={styles.button} onClick={this.handleReset}>
                Erneut versuchen
              </button>
              <button
                style={{ ...styles.button, ...styles.secondaryButton }}
                onClick={() => window.location.reload()}
              >
                Seite neu laden
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
    backgroundColor: '#1a1a2e',
  },
  content: {
    textAlign: 'center' as const,
    maxWidth: '500px',
    padding: '40px',
    backgroundColor: '#16213e',
    borderRadius: '16px',
    border: '1px solid #0f3460',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  title: {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 600,
    marginBottom: '12px',
  },
  message: {
    color: '#8b8b8b',
    fontSize: '16px',
    marginBottom: '24px',
    lineHeight: 1.5,
  },
  errorDetails: {
    textAlign: 'left' as const,
    backgroundColor: '#0f3460',
    padding: '16px',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#ff6b6b',
    overflow: 'auto',
    maxHeight: '200px',
    marginBottom: '24px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  button: {
    padding: '12px 24px',
    backgroundColor: '#e94560',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    border: '1px solid #0f3460',
  },
};

/**
 * Higher-order component to wrap any component with ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

export default ErrorBoundary;
