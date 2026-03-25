import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Types and constants
import type { Page } from './types';

// Route definitions (centralized)
import { resolvePathToPage, resolvePagePath, legacyPageToPanel } from './routes';

// Lazy-loaded page components (centralized)
import {
  // Demo entry page (public route)
  DemoPage,
  // Pricing page (public route)
  PricingPage,
} from './routes/LazyPages';

// Core components - always loaded
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useContextState } from './components/ContextSwitcher';
import type { AIContext } from './components/ContextSwitcher';
import { SkeletonLoader } from './components/SkeletonLoader';
import { KeyboardShortcutsModal, useKeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { useCommandPalette, CommandPalette } from './components/CommandPalette';
import { safeLocalStorage } from './utils/storage';
import { useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/AuthPage/AuthPage';
import { GeneralChat } from './components/GeneralChat';
import { ShortcutHintProvider } from './components/ShortcutHint';

// Layout System
import { usePageHistory } from './hooks/usePageHistory';

// Cockpit Mode (now the only mode)
import { PanelProvider, usePanelContext } from './contexts/PanelContext';
import type { PanelType } from './contexts/PanelContext';
import { CockpitLayout } from './components/cockpit/CockpitLayout';
import { ChatSessionTabs } from './components/cockpit/ChatSessionTabs';
import { WelcomeChatMessage } from './components/cockpit/WelcomeChatMessage';
import { ContextSelectorCards } from './components/cockpit/ContextSelectorCards';
import { DashboardPage } from './components/cockpit/DashboardPage';
import { useCockpitSessions } from './hooks/useCockpitSessions';
import { useCockpitShortcuts } from './components/cockpit/useCockpitShortcuts';
import { QuickActionsBar } from './components/cockpit/QuickActionsBar';

import './App.css';


// ============================================
// URL NAVIGATION HOOK (uses centralized routes)
// ============================================

function useUrlNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentPage: Page = useMemo(() => {
    return resolvePathToPage(location.pathname);
  }, [location.pathname]);

  const tabParam = useMemo(() => {
    const parts = location.pathname.split('/');
    if (parts.length >= 3) {
      return parts[2];
    }
    return undefined;
  }, [location.pathname]);

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
  const { currentPage, navigateToPage } = useUrlNavigation();
  const location = useLocation();
  const navigate = useNavigate();
  const [context, setContext] = useContextState();
  const keyboardShortcuts = useKeyboardShortcutsModal();

  // Redirect legacy URLs to /?panel=X
  useEffect(() => {
    const currentPath = location.pathname;
    if (currentPath === '/' || currentPath === '/auth') return;
    const page = resolvePathToPage(currentPath);
    if (page) {
      const panel = legacyPageToPanel(page);
      if (panel) {
        navigate(`/?panel=${panel}`, { replace: true });
      }
    }
  }, [location.pathname, navigate]);

  const pageHistory = usePageHistory();

  // Track page visits for recents + frecency nav
  useEffect(() => {
    pageHistory.addRecentPage(currentPage);
    import('./components/Dashboard').then(m => m.recordPageVisit?.(currentPage)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // ============================================
  // COCKPIT MODE (only mode)
  // ============================================
  return (
    <ShortcutHintProvider>
    <ErrorBoundary>
      <PanelProvider>
        <CockpitShell
          context={context}
          onContextChange={setContext}
          currentPage={currentPage}
          navigateToPage={navigateToPage}
          pageHistory={pageHistory}
          keyboardShortcuts={keyboardShortcuts}
        />
      </PanelProvider>
    </ErrorBoundary>
    </ShortcutHintProvider>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

/** Cockpit mode shell — rendered inside PanelProvider so it can use usePanelContext */
function CockpitShell({ context, onContextChange, currentPage, navigateToPage, pageHistory, keyboardShortcuts }: {
  context: AIContext;
  onContextChange: (c: AIContext) => void;
  currentPage: Page;
  navigateToPage: (page: Page, options?: { tab?: string }) => void;
  pageHistory: { recentPages: Page[]; favoritePages: Page[]; toggleFavorite: (page: Page) => void; isFavorited: (page: Page) => boolean; addRecentPage: (page: Page) => void };
  keyboardShortcuts: { isOpen: boolean; close: () => void };
}) {
  const { dispatch: panelDispatch } = usePanelContext();

  // Task 4: Onboarding state for cockpit mode
  const onboardingComplete = safeLocalStorage('get', 'zenai-onboarding-complete') === 'true';
  const [showWelcome, setShowWelcome] = useState(!onboardingComplete);
  const [showContextSelector, setShowContextSelector] = useState(!onboardingComplete);

  // Task B: Command palette with panel commands wired
  const commandPalette = useCommandPalette({
    onNavigate: navigateToPage,
    externalRecentPages: pageHistory.recentPages,
    onAction: (action) => {
      if (action === 'new-idea') {
        navigateToPage('ideas');
      } else if (action === 'voice-input') {
        navigateToPage('ideas');
      }
    },
    onOpenPanel: (panelId: string) => panelDispatch({ type: 'OPEN_PANEL', panel: panelId as PanelType }),
  });

  // Task 4: Hidden file input refs for attach/image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleAttachFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleUploadImage = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleVoiceInput = useCallback(() => {
    // TODO: implement voice input
  }, []);

  const handleQuickCreate = useCallback(() => {
    panelDispatch({ type: 'OPEN_PANEL', panel: 'ideas' as PanelType });
  }, [panelDispatch]);

  // Task 2: Chat session management via hook
  const sessionManager = useCockpitSessions(context);
  const chatTabs = useMemo(() =>
    sessionManager.visibleSessions.map(s => ({ sessionId: s.id, title: s.title })),
    [sessionManager.visibleSessions],
  );

  // Task 2: Cockpit keyboard shortcuts
  useCockpitShortcuts({
    onOpenPanel: (panel) => panelDispatch({ type: 'OPEN_PANEL', panel }),
    onClosePanel: () => panelDispatch({ type: 'CLOSE_PANEL' }),
    onNavigate: (path) => navigateToPage(path as Page),
    onNewTab: () => { void sessionManager.createSession(); },
    onPrevTab: () => sessionManager.switchToPrev(),
    onNextTab: () => sessionManager.switchToNext(),
    onCloseTab: () => { if (sessionManager.activeSessionId) sessionManager.closeSession(sessionManager.activeSessionId); },
  });

  return (
    <>
      <CockpitLayout
        context={context}
        onContextChange={onContextChange}
        hasActivity={false}
        sessions={sessionManager.visibleSessions.map(s => ({ id: s.id, title: s.title, updatedAt: s.createdAt }))}
        onSwitchSession={(id) => sessionManager.switchSession(id)}
      >
        {currentPage === 'hub' || currentPage === 'chat' || !currentPage ? (
          <>
            <ChatSessionTabs
              tabs={chatTabs}
              activeSessionId={sessionManager.activeSessionId || 'default'}
              onSelectTab={(sessionId) => sessionManager.switchSession(sessionId)}
              onCloseTab={(sessionId) => sessionManager.closeSession(sessionId)}
              onNewTab={() => { void sessionManager.createSession(); }}
            />
            {showWelcome && (
              <WelcomeChatMessage
                onSendMessage={() => {
                  setShowWelcome(false);
                  safeLocalStorage('set', 'zenai-welcome-shown', 'true');
                }}
                onOpenCommandPalette={() => {
                  setShowWelcome(false);
                  commandPalette.open();
                }}
              />
            )}
            {showContextSelector && (
              <ContextSelectorCards
                selectedContext={context}
                onSelect={(ctx) => {
                  setShowContextSelector(false);
                  safeLocalStorage('set', 'zenai-onboarding-complete', 'true');
                  onContextChange(ctx as AIContext);
                }}
              />
            )}
            <QuickActionsBar
              onAttachFile={handleAttachFile}
              onUploadImage={handleUploadImage}
              onVoiceInput={handleVoiceInput}
              onQuickCreate={handleQuickCreate}
            />
            <ErrorBoundary fallback={<div className="chat-error-fallback">Chat nicht verfuegbar.</div>}>
              <GeneralChat
                key={sessionManager.activeSessionId}
                context={context}
                isCompact={false}
                initialSessionId={sessionManager.activeSessionId}
                onSessionChange={(id) => { if (id) sessionManager.switchSession(id); }}
                onPanelAction={(panel, filter) => panelDispatch({ type: 'OPEN_PANEL', panel: panel as PanelType, filter })}
              />
            </ErrorBoundary>
            {/* Hidden file inputs for attach/image callbacks */}
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} aria-hidden="true" />
            <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} aria-hidden="true" />
          </>
        ) : (
          <DashboardPage context={context} />
        )}
      </CockpitLayout>

      <ToastContainer />

      {commandPalette.isOpen && (
        <CommandPalette
          isOpen={commandPalette.isOpen}
          onClose={commandPalette.close}
          commands={commandPalette.commands}
          recentPages={pageHistory.recentPages}
          currentPage={currentPage}
        />
      )}

      <KeyboardShortcutsModal
        isOpen={keyboardShortcuts.isOpen}
        onClose={keyboardShortcuts.close}
      />
    </>
  );
}

export default App;
