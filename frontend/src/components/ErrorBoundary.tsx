/// <reference types="vite/client" />

import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { logError } from '../utils/errors';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logError('ErrorBoundary:componentDidCatch', error);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="error-boundary-container">
        <div className="error-boundary-content">
          <div className="error-boundary-icon" aria-hidden="true">⚠️</div>
          <h2 className="error-boundary-title">Etwas ist schief gelaufen</h2>
          <p className="error-boundary-message">
            Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="error-boundary-details" role="alert">
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
          )}
          <div className="error-boundary-actions">
            <button
              className="error-boundary-button neuro-button neuro-focus-ring"
              onClick={this.handleReset}
              type="button"
              aria-label="Fehler ignorieren und erneut versuchen"
            >
              Erneut versuchen
            </button>
            <button
              className="error-boundary-button secondary neuro-focus-ring"
              onClick={() => window.location.reload()}
              type="button"
              aria-label="Seite komplett neu laden"
            >
              Seite neu laden
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Higher-order component to wrap any component with ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
): React.ComponentType<P> {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

export default ErrorBoundary;
