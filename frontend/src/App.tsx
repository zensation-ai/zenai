import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Types and constants
import type { Page } from './types';

// Route definitions (centralized)
import { resolvePathToPage, resolvePagePath, PAGE_PATHS } from './routes';

// Lazy-loaded page components (centralized)
import {
  // Demo entry page (public route)
  DemoPage,
  // Pricing page (public route)
  PricingPage,
} from './routes/LazyPages';

// Public invitation page (accessible without auth)
import { InviteAcceptPage } from './components/InviteAcceptPage';

// Core components - always loaded
import { NotFoundPage } from './components/NotFoundPage';
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useContextState } from './components/ContextSwitcher';
import { SkeletonLoader } from './components/SkeletonLoader';
import { KeyboardShortcutsModal, useKeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { GlobalSearch } from './components/GlobalSearch';
import { useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/AuthPage/AuthPage';
import { ShortcutHintProvider } from './components/ShortcutHint';

// Layout System
import { usePageHistory } from './hooks/usePageHistory';
import { LayoutModeProvider } from './contexts/LayoutModeContext';
import { WorkspaceLayout } from './components/layout/WorkspaceLayout';
import { useCockpitSessions } from './hooks/useCockpitSessions';

// Sprint 1.6 — Welcome Wizard (lazy to keep initial bundle slim)
import { WelcomeWizard } from './components/onboarding/WelcomeWizard';
import { ConsentBanner } from './components/auth/ConsentBanner';

// ============================================
// URL NAVIGATION HOOK (uses centralized routes)
// ============================================

function useUrlNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentPage: Page | undefined = useMemo(() => {
    return resolvePathToPage(location.pathname);
  }, [location.pathname]);

  // Redirect legacy English paths to canonical German slugs
  useEffect(() => {
    if (!currentPage) return;
    const canonical = PAGE_PATHS[currentPage];
    if (canonical && !location.pathname.startsWith(canonical) && canonical !== '/') {
      navigate(canonical, { replace: true });
    }
  }, [currentPage, location.pathname, navigate]);

  // Extract tab segment relative to the page's base path depth.
  // E.g. /cockpit/trends/analytics → basePath '/cockpit/trends' (depth 2) → tab 'analytics'
  //      /ideen/incubator           → basePath '/ideen' (depth 1)          → tab 'incubator'
  const tabParam = useMemo(() => {
    if (!currentPage) return undefined;
    const basePath = PAGE_PATHS[currentPage];
    if (!basePath || basePath === '/') return undefined;
    const baseDepth = basePath.split('/').filter(Boolean).length;
    const segments = location.pathname.split('/').filter(Boolean);
    return segments[baseDepth] || undefined;
  }, [location.pathname, currentPage]);

  const navigateToPage = useCallback((page: Page, options?: { tab?: string }) => {
    const path = resolvePagePath(page, options?.tab);
    navigate(path);
  }, [navigate]);

  return {
    currentPage,
    tabParam,
    navigateToPage,
  };
}

function App() {
  const { session, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // /demo is a public route — render before auth checks
  if (location.pathname === '/demo') {
    return (
      <Suspense fallback={<div className="page-loader" role="status" aria-live="polite"><SkeletonLoader type="card" count={1} /><p className="loading-text">Wird geladen...</p></div>}>
        <DemoPage
          onDemoStart={() => navigate('/')}
          onNavigateToAuth={() => navigate('/auth')}
        />
      </Suspense>
    );
  }

  // /invite/:token is a semi-public route — shows invite info, requires auth to accept
  if (location.pathname.startsWith('/invite/')) {
    return <InviteAcceptPage />;
  }

  // /pricing is a public route — visible without authentication
  if (location.pathname === '/pricing') {
    return (
      <Suspense fallback={<div className="page-loader" role="status" aria-live="polite"><SkeletonLoader type="card" count={1} /><p className="loading-text">Wird geladen...</p></div>}>
        <PricingPage />
      </Suspense>
    );
  }

  if (authLoading) {
    return (
      <div className="page-loader" role="status" aria-live="polite">
        <SkeletonLoader type="card" count={1} />
        <p className="loading-text">Wird geladen...</p>
      </div>
    );
  }

  // In production, require JWT session. In dev, allow API key fallback for testing.
  const hasApiKey = import.meta.env.DEV && !!(import.meta.env.VITE_API_KEY);
  if (!session && !hasApiKey) {
    return <AuthPage />;
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const { currentPage, tabParam, navigateToPage } = useUrlNavigation();
  const [context, setContext] = useContextState();
  const keyboardShortcuts = useKeyboardShortcutsModal();
  const [searchOpen, setSearchOpen] = useState(false);
  const { user } = useAuth();
  const showWelcomeWizard = !!user && !user.onboarding_completed_at;
  const showConsentBanner = !!user && !user.consent_banner_shown_at;

  const pageHistory = usePageHistory();

  // Session management for workspace chat drawer (must be before early returns — Rules of Hooks)
  const sessionManager = useCockpitSessions(context);

  // Cmd+K → open GlobalSearch
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Track page visits for recents + frecency nav
  useEffect(() => {
    if (currentPage) {
      pageHistory.addRecentPage(currentPage);
      import('./components/Dashboard').then(m => m.recordPageVisit?.(currentPage)).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Unknown path → show 404
  if (!currentPage) {
    return <NotFoundPage />;
  }

  return (
    <ShortcutHintProvider>
    <ErrorBoundary>
      <LayoutModeProvider>
        <WorkspaceLayout
          currentPage={currentPage}
          tabParam={tabParam}
          context={context}
          onContextChange={setContext}
          onNavigate={(page) => navigateToPage(page)}
          onSearchOpen={() => setSearchOpen(true)}
          activeSessionId={sessionManager.activeSessionId ?? undefined}
          onSessionChange={(id) => { if (id) sessionManager.switchSession(id); }}
        />
        <ToastContainer />
        <KeyboardShortcutsModal
          isOpen={keyboardShortcuts.isOpen}
          onClose={keyboardShortcuts.close}
        />
        <GlobalSearch
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          context={context}
          onNavigate={(page) => navigateToPage(page as Page)}
        />
        {showConsentBanner && <ConsentBanner />}
        {!showConsentBanner && showWelcomeWizard && (
          <WelcomeWizard
            onNavigateCta={(target) => {
              if (target === 'chat') navigateToPage('hub');
              else if (target === 'ideas') navigateToPage('ideas');
              else if (target === 'memory') navigateToPage('my-ai');
            }}
          />
        )}
      </LayoutModeProvider>
    </ErrorBoundary>
    </ShortcutHintProvider>
  );
}

export default App;
