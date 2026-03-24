import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import axios from 'axios';

// Types and constants
import type { Page } from './types';

// Route definitions (centralized)
import { resolvePathToPage, resolvePagePath, createLegacyRedirects, legacyPageToPanel } from './routes';

// Lazy-loaded page components (centralized)
import {
  ContactsPage, FinancePage,
  IdeasPage, AIWorkshop, InsightsDashboard,
  PlannerPage, EmailPage,
  LearningDashboard, NotificationsPage,
  MemoryInsightsPage, SystemAdminPage,
  // Phase 104: ChatHub is the new primary start page
  ChatHub,
  // Original full-featured pages (Smart Page stubs not yet wired)
  DocumentVaultPage, BusinessDashboard, MyAIPage, SettingsDashboard,
  // Demo entry page (public route)
  DemoPage,
  // Pricing page (public route)
  PricingPage,
} from './routes/LazyPages';

// Onboarding (Phase 86)
import { OnboardingWizard } from './components/OnboardingWizard/OnboardingWizard';
import { useOnboarding } from './hooks/useOnboarding';

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
import { AIQuestionBubble } from './components/AIQuestionBubble';
// Phase 95: UniversalSearch replaces GlobalSearch
import { UniversalSearch } from './components/UniversalSearch/UniversalSearch';
import { useIdeasData } from './hooks/useIdeasData';
import { useAIQuestions } from './hooks/useAIQuestions';
import { ShortcutHintProvider } from './components/ShortcutHint';

// Neurodesign System
import { NeuroFeedbackProvider } from './components/NeuroFeedback';
import { ScrollProgress } from './components/AnticipatoryUI';

// Layout System
import { AppLayout } from './components/layout/AppLayout';
import { usePageHistory } from './hooks/usePageHistory';
import { PageTransition } from './components/PageTransition';

// Cockpit Mode (Phase 142 — opt-in feature flag)
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

const PageLoader = () => (
  <div className="page-loader" role="status" aria-live="polite">
    <SkeletonLoader type="card" count={1} />
    <p className="loading-text">Wird geladen...</p>
  </div>
);

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
  const { currentPage, tabParam, navigateToPage } = useUrlNavigation();
  const location = useLocation();
  const navigate = useNavigate();
  const [context, setContext] = useContextState();
  const keyboardShortcuts = useKeyboardShortcutsModal();

  // Phase 142: Cockpit mode (opt-in via localStorage)
  const cockpitMode = safeLocalStorage('get', 'zenai-cockpit-mode') === 'true';

  // Phase 142: Redirect legacy URLs to /?panel=X in cockpit mode
  useEffect(() => {
    if (!cockpitMode) return;
    const currentPath = location.pathname;
    // If already on root, /dashboard, or /settings, do nothing
    if (currentPath === '/' || currentPath === '/dashboard' || currentPath.startsWith('/settings') || currentPath.startsWith('/system')) {
      return;
    }
    // Try to resolve old path to a panel
    const page = resolvePathToPage(currentPath);
    if (page) {
      const panel = legacyPageToPanel(page);
      if (panel) {
        navigate(`/?panel=${panel}`, { replace: true });
      }
    }
  }, [cockpitMode, location.pathname, navigate]);

  // Data loading (extracted to useIdeasData hook)
  const {
    ideas,
    archivedCount,
    notificationCount,
    loading,
    apiStatus,
    loadIdeas,
  } = useIdeasData(context, currentPage);

  // Onboarding (Phase 86)
  const { showOnboarding, completeOnboarding } = useOnboarding();
  const isOnboardingComplete = !showOnboarding || safeLocalStorage('get', 'onboardingComplete') === 'true';

  // Email unread count for sidebar badge (with exponential backoff on errors)
  const [emailUnreadCount, setEmailUnreadCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let errorCount = 0;
    let intervalId: ReturnType<typeof setTimeout>;

    const fetchUnread = () => {
      axios.get(`/api/${context}/emails/stats`, { signal: controller.signal }).then(res => {
        setEmailUnreadCount(res.data?.data?.unread ?? 0);
        errorCount = 0;
        scheduleNext(60_000);
      }).catch(() => {
        if (controller.signal.aborted) return;
        errorCount++;
        const backoff = Math.min(60_000 * Math.pow(2, errorCount - 1), 300_000);
        scheduleNext(backoff);
      });
    };

    const scheduleNext = (ms: number) => {
      clearTimeout(intervalId);
      intervalId = setTimeout(fetchUnread, ms);
    };

    fetchUnread();
    return () => {
      controller.abort();
      clearTimeout(intervalId);
    };
  }, [context]);

  const pageHistory = usePageHistory();

  // Global Search state
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const openGlobalSearch = useCallback(() => setGlobalSearchOpen(true), []);
  const closeGlobalSearch = useCallback(() => setGlobalSearchOpen(false), []);

  // Track page visits for recents + frecency nav
  useEffect(() => {
    pageHistory.addRecentPage(currentPage);
    // Lazy import to avoid bundling frecency in initial chunk
    import('./components/Dashboard').then(m => m.recordPageVisit?.(currentPage)).catch(() => {});
  // Intentionally omit pageHistory — stable module-level singleton
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

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
  });

  const isAIActive = loading;
  const aiActivityMessage = useMemo(() => {
    if (!isAIActive) return undefined;
    if (loading) return 'Lade Daten...';
    return undefined;
  }, [isAIActive, loading]);

  // Proactive AI questions
  const aiQuestions = useAIQuestions({
    currentPage,
    ideasCount: ideas.length,
    ideas,
    onNavigate: navigateToPage,
  });

  const handleOnboardingComplete = useCallback(() => {
    completeOnboarding();
    safeLocalStorage('set', 'onboardingComplete', 'true');
  }, [completeOnboarding]);

  // ============================================
  // ROUTE-BASED PAGE RENDERER
  // ============================================

  // Pre-compute legacy redirect route elements
  const legacyRedirectRoutes = useMemo(() => createLegacyRedirects(), []);

  const renderRoutes = () => (
    <Routes>
      {/* Phase 104: ChatHub is the primary start page at / */}
      <Route path="/" element={
        <Suspense fallback={<PageLoader />}>
          <ChatHub context={context} />
        </Suspense>
      } />

      {/* ── 7 Smart Page German Slug Routes ── */}

      {/* Ideen (Ideas) */}
      <Route path="/ideen" element={
        <NeuroFeedbackProvider>
          <Suspense fallback={<PageLoader />}>
            <IdeasPage
              context={context}
              initialTab={(tabParam || 'ideas') as 'ideas' | 'incubator' | 'archive' | 'triage'}
              onNavigate={(page) => navigateToPage(page as Page)}
            />
          </Suspense>
        </NeuroFeedbackProvider>
      } />
      <Route path="/ideen/:tab" element={
        <NeuroFeedbackProvider>
          <Suspense fallback={<PageLoader />}>
            <IdeasPage
              context={context}
              initialTab={(tabParam || 'ideas') as 'ideas' | 'incubator' | 'archive' | 'triage'}
              onNavigate={(page) => navigateToPage(page as Page)}
            />
          </Suspense>
        </NeuroFeedbackProvider>
      } />

      {/* Planer (Calendar/Planner) */}
      <Route path="/planer" element={
        <Suspense fallback={<PageLoader />}>
          <PlannerPage context={context} initialTab="calendar" onBack={() => navigateToPage('hub')} />
        </Suspense>
      } />
      <Route path="/planer/:tab" element={
        <CalendarRouteHandler context={context} tabParam={tabParam} navigateToPage={navigateToPage} />
      } />

      {/* Inbox (Email) */}
      <Route path="/inbox" element={
        <Suspense fallback={<PageLoader />}>
          <EmailPage context={context} initialTab="inbox" />
        </Suspense>
      } />
      <Route path="/inbox/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <EmailPage
            context={context}
            initialTab={(tabParam || 'inbox') as 'inbox' | 'sent' | 'drafts' | 'archived' | 'trash' | 'starred'}
          />
        </Suspense>
      } />

      {/* Wissen (Documents/Knowledge) */}
      <Route path="/wissen" element={
        <Suspense fallback={<PageLoader />}>
          <DocumentVaultPage context={context} onBack={() => navigateToPage('hub')} initialTab="documents" />
        </Suspense>
      } />
      <Route path="/wissen/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <DocumentVaultPage
            context={context}
            onBack={() => navigateToPage('hub')}
            initialTab={(tabParam || 'documents') as 'documents' | 'editor' | 'media'}
          />
        </Suspense>
      } />

      {/* Cockpit (Business) */}
      <Route path="/cockpit" element={
        <Suspense fallback={<PageLoader />}>
          <BusinessDashboard context={context} onBack={() => navigateToPage('hub')} />
        </Suspense>
      } />
      <Route path="/cockpit/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <BusinessDashboard
            context={context}
            onBack={() => navigateToPage('hub')}
            initialTab={tabParam as 'overview' | 'revenue' | 'traffic' | 'seo' | 'health' | 'insights' | 'reports' | 'connectors' | 'intelligence' | undefined}
          />
        </Suspense>
      } />

      {/* Meine KI (My AI) */}
      <Route path="/meine-ki/memory-insights" element={
        <Suspense fallback={<PageLoader />}>
          <MemoryInsightsPage context={context} onBack={() => navigateToPage('my-ai')} />
        </Suspense>
      } />
      <Route path="/meine-ki" element={
        <Suspense fallback={<PageLoader />}>
          <MyAIPage context={context} onBack={() => navigateToPage('hub')} initialTab="personalize" />
        </Suspense>
      } />
      <Route path="/meine-ki/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <MyAIPage
            context={context}
            onBack={() => navigateToPage('hub')}
            initialTab={(tabParam || 'personalize') as 'personalize' | 'memory' | 'procedures' | 'digital-twin' | 'cognitive' | 'voice-chat'}
          />
        </Suspense>
      } />

      {/* System (Settings) */}
      <Route path="/system" element={
        <Suspense fallback={<PageLoader />}>
          <SettingsDashboard
            context={context}
            onBack={() => navigateToPage('hub')}
            onNavigate={(page) => navigateToPage(page as Page)}
            initialTab="general"
          />
        </Suspense>
      } />
      <Route path="/system/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <SettingsDashboard
            context={context}
            onBack={() => navigateToPage('hub')}
            onNavigate={(page) => navigateToPage(page as Page)}
            initialTab={(tabParam || 'general') as 'profile' | 'account' | 'general' | 'ai' | 'privacy' | 'automations' | 'proactive-rules' | 'governance' | 'context-rules' | 'security' | 'integrations' | 'mcp-servers' | 'extensions' | 'on-device-ai' | 'system' | 'data'}
          />
        </Suspense>
      } />
      <Route path="/system/:tab/:subtab" element={
        <Suspense fallback={<PageLoader />}>
          <SettingsDashboard
            context={context}
            onBack={() => navigateToPage('hub')}
            onNavigate={(page) => navigateToPage(page as Page)}
            initialTab={(tabParam || 'general') as 'profile' | 'account' | 'general' | 'ai' | 'privacy' | 'automations' | 'proactive-rules' | 'governance' | 'context-rules' | 'security' | 'integrations' | 'mcp-servers' | 'extensions' | 'on-device-ai' | 'system' | 'data'}
          />
        </Suspense>
      } />

      {/* ── Sub-page routes (intermediary: standalone components at new URLs) ── */}

      {/* Contacts → sub-page of Planer */}
      <Route path="/planer/kontakte" element={
        <Suspense fallback={<PageLoader />}>
          <ContactsPage context={context} initialTab="all" onBack={() => navigateToPage('calendar')} />
        </Suspense>
      } />
      <Route path="/planer/kontakte/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <ContactsPage
            context={context}
            initialTab={(tabParam || 'all') as 'all' | 'favorites' | 'organizations'}
            onBack={() => navigateToPage('calendar')}
          />
        </Suspense>
      } />

      {/* Finance → sub-page of Cockpit */}
      <Route path="/cockpit/finanzen" element={
        <Suspense fallback={<PageLoader />}>
          <FinancePage context={context} initialTab="overview" onBack={() => navigateToPage('business')} />
        </Suspense>
      } />
      <Route path="/cockpit/finanzen/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <FinancePage
            context={context}
            initialTab={(tabParam || 'overview') as 'overview' | 'transactions' | 'budgets' | 'goals'}
            onBack={() => navigateToPage('business')}
          />
        </Suspense>
      } />

      {/* Insights → sub-page of Cockpit */}
      <Route path="/cockpit/trends" element={
        <Suspense fallback={<PageLoader />}>
          <InsightsDashboard
            context={context}
            onBack={() => navigateToPage('business')}
            onSelectIdea={() => navigateToPage('ideas')}
            initialTab="analytics"
          />
        </Suspense>
      } />
      <Route path="/cockpit/trends/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <InsightsDashboard
            context={context}
            onBack={() => navigateToPage('business')}
            onSelectIdea={() => navigateToPage('ideas')}
            initialTab={(tabParam || 'analytics') as 'analytics' | 'digest' | 'connections' | 'graphrag' | 'sleep' | 'ai-traces'}
          />
        </Suspense>
      } />

      {/* Learning → sub-page of Wissen */}
      <Route path="/wissen/lernen" element={
        <Suspense fallback={<PageLoader />}>
          <LearningDashboard context={context} onBack={() => navigateToPage('documents')} initialTab="overview" />
        </Suspense>
      } />
      <Route path="/wissen/lernen/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <LearningDashboard
            context={context}
            onBack={() => navigateToPage('documents')}
            initialTab={(tabParam || 'overview') as 'overview' | 'focus' | 'suggestions' | 'research' | 'feedback' | 'profile'}
          />
        </Suspense>
      } />

      {/* Notifications → sub-page of Inbox */}
      <Route path="/inbox/benachrichtigungen" element={
        <Suspense fallback={<PageLoader />}>
          <NotificationsPage
            context={context}
            onBack={() => navigateToPage('email')}
            onNavigate={(page) => navigateToPage(page as Page)}
          />
        </Suspense>
      } />

      {/* System Admin → sub-page of System */}
      <Route path="/system/admin" element={
        <Suspense fallback={<PageLoader />}>
          <SystemAdminPage context={context} onBack={() => navigateToPage('settings')} initialTab="overview" />
        </Suspense>
      } />
      <Route path="/system/admin/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <SystemAdminPage
            context={context}
            onBack={() => navigateToPage('settings')}
            initialTab={(tabParam || 'overview') as 'overview' | 'queues' | 'security' | 'sleep'}
          />
        </Suspense>
      } />

      {/* Workshop → sub-page of Ideen (intermediary) */}
      <Route path="/ideen/workshop" element={
        <Suspense fallback={<PageLoader />}>
          <AIWorkshop context={context} onBack={() => navigateToPage('ideas')} initialTab="proactive" />
        </Suspense>
      } />
      <Route path="/ideen/workshop/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <AIWorkshop
            context={context}
            onBack={() => navigateToPage('ideas')}
            initialTab={(tabParam || 'proactive') as 'proactive' | 'evolution' | 'agent-teams' | 'automations'}
          />
        </Suspense>
      } />

      {/* ── Legacy Redirects (with rewritePrefix support) ── */}
      {legacyRedirectRoutes.map(({ path, element }) => (
        <Route key={path} path={path} element={element} />
      ))}

      {/* 404 Catch-all */}
      <Route path="*" element={
        <div className="not-found-page">
          <div className="not-found-content">
            <span className="not-found-icon" aria-hidden="true">?</span>
            <h1>Seite nicht gefunden</h1>
            <p>Die angeforderte Seite existiert nicht.</p>
            <button
              type="button"
              className="not-found-cta neuro-press-effect neuro-focus-ring"
              onClick={() => navigateToPage('hub')}
            >
              Zum Chat Hub
            </button>
          </div>
        </div>
      } />
    </Routes>
  );

  // ============================================
  // RENDER
  // ============================================

  // ============================================
  // COCKPIT MODE (Phase 142 — opt-in feature flag)
  // ============================================
  if (cockpitMode) {
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
  // STANDARD MODE (existing AppLayout)
  // ============================================

  return (
    <ShortcutHintProvider>
    <ErrorBoundary>
      {!isOnboardingComplete && (
        <OnboardingWizard
          context={context}
          onContextChange={setContext}
          onComplete={handleOnboardingComplete}
        />
      )}

      <ScrollProgress />

      <AppLayout
        context={context}
        onContextChange={setContext}
        currentPage={currentPage}
        onNavigate={navigateToPage}
        apiStatus={apiStatus}
        isAIActive={isAIActive}
        aiActivityMessage={aiActivityMessage}
        archivedCount={archivedCount}
        notificationCount={notificationCount}
        emailUnreadCount={emailUnreadCount}
        onOpenSearch={openGlobalSearch}
        onRefresh={() => loadIdeas()}
        favoritePages={pageHistory.favoritePages}
        toggleFavorite={pageHistory.toggleFavorite}
        isFavorited={pageHistory.isFavorited}
        renderChat={() => (
          <ErrorBoundary fallback={<div className="chat-error-fallback">Chat nicht verfügbar.</div>}>
            <GeneralChat context={context} isCompact={true} />
          </ErrorBoundary>
        )}
      >
        <PageTransition pageKey={currentPage}>
        <ErrorBoundary
          key={currentPage}
          fallback={
            <div className="page-error-fallback" role="alert">
              <div className="page-error-content">
                <span className="page-error-icon" aria-hidden="true">!</span>
                <h2>Diese Seite konnte nicht geladen werden</h2>
                <p>Ein unerwarteter Fehler ist aufgetreten. Deine Daten sind sicher.</p>
                <div className="page-error-actions">
                  <button
                    type="button"
                    className="neuro-button neuro-focus-ring"
                    onClick={() => navigateToPage('hub')}
                  >
                    Zum Dashboard
                  </button>
                  <button
                    type="button"
                    className="neuro-button secondary neuro-focus-ring"
                    onClick={() => window.location.reload()}
                  >
                    Seite neu laden
                  </button>
                </div>
              </div>
            </div>
          }
        >
          {renderRoutes()}
        </ErrorBoundary>
        </PageTransition>
      </AppLayout>

      <ToastContainer />

      {aiQuestions.currentQuestion && (
        <AIQuestionBubble
          question={aiQuestions.currentQuestion.question}
          emoji={aiQuestions.currentQuestion.emoji}
          category={aiQuestions.currentQuestion.category}
          actionLabel={aiQuestions.currentQuestion.actionLabel}
          dismissLabel={aiQuestions.currentQuestion.dismissLabel}
          onAction={aiQuestions.currentQuestion.action}
          onDismiss={aiQuestions.dismiss}
        />
      )}

      {commandPalette.isOpen && (
        <CommandPalette
          isOpen={commandPalette.isOpen}
          onClose={commandPalette.close}
          commands={commandPalette.commands}
          recentPages={pageHistory.recentPages}
          currentPage={currentPage}
        />
      )}

      {globalSearchOpen && (
        <UniversalSearch
          isOpen={globalSearchOpen}
          onClose={closeGlobalSearch}
          context={context}
          onNavigate={(_type, _id) => { closeGlobalSearch(); }}
        />
      )}

      <KeyboardShortcutsModal
        isOpen={keyboardShortcuts.isOpen}
        onClose={keyboardShortcuts.close}
      />
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
    console.log('attach file');
    fileInputRef.current?.click();
  }, []);

  const handleUploadImage = useCallback(() => {
    console.log('upload image');
    imageInputRef.current?.click();
  }, []);

  const handleVoiceInput = useCallback(() => {
    console.log('voice input');
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

/** Calendar route handler — maps tab param to planner tab */
function CalendarRouteHandler({ context, tabParam, navigateToPage }: {
  context: AIContext;
  tabParam: string | undefined;
  navigateToPage: (page: Page) => void;
}) {
  const calendarTabMap: Record<string, 'calendar' | 'tasks' | 'projects' | 'meetings' | 'map'> = {
    'tasks': 'tasks', 'kanban': 'tasks', 'gantt': 'projects', 'meetings': 'meetings', 'map': 'map',
  };
  const plannerTab = tabParam ? calendarTabMap[tabParam] || 'calendar' : 'calendar';

  return (
    <Suspense fallback={<PageLoader />}>
      <PlannerPage context={context} initialTab={plannerTab} onBack={() => navigateToPage('hub')} />
    </Suspense>
  );
}

export default App;
