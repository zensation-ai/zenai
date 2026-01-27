/**
 * PageWrapper Component
 *
 * Reduziert Code-Duplikation: Abstrahiert das wiederholte
 * ErrorBoundary > NeuroFeedbackProvider > Suspense > ToastContainer Pattern.
 *
 * Vorher (22x dupliziert in App.tsx):
 * <ErrorBoundary>
 *   <NeuroFeedbackProvider>  // optional
 *     <Suspense fallback={<PageLoader />}>
 *       <SomePage ... />
 *     </Suspense>
 *     <ToastContainer />
 *   </NeuroFeedbackProvider>
 * </ErrorBoundary>
 *
 * Nachher:
 * <PageWrapper withNeuroFeedback>
 *   <SomePage ... />
 * </PageWrapper>
 */

import { Suspense, ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { NeuroFeedbackProvider } from './NeuroFeedback';
import { ToastContainer } from './Toast';
import { SkeletonLoader } from './SkeletonLoader';

interface PageWrapperProps {
  children: ReactNode;
  /** Whether to include NeuroFeedbackProvider (default: false) */
  withNeuroFeedback?: boolean;
  /** Custom loading fallback (default: PageLoader) */
  fallback?: ReactNode;
}

// Default loading fallback - same as PageLoader in App.tsx
const DefaultFallback = () => (
  <div className="page-loader" role="status" aria-live="polite">
    <SkeletonLoader type="card" count={1} />
    <p className="loading-text">Wird geladen...</p>
  </div>
);

export function PageWrapper({
  children,
  withNeuroFeedback = false,
  fallback
}: PageWrapperProps) {
  const content = (
    <Suspense fallback={fallback ?? <DefaultFallback />}>
      {children}
    </Suspense>
  );

  if (withNeuroFeedback) {
    return (
      <ErrorBoundary>
        <NeuroFeedbackProvider>
          {content}
          <ToastContainer />
        </NeuroFeedbackProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {content}
      <ToastContainer />
    </ErrorBoundary>
  );
}
