import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import axios from 'axios';

// Types and constants
import type { Page } from './types';

// Route definitions (centralized)
import { resolvePathToPage, resolvePagePath, createLegacyRedirects } from './routes';

// Lazy-loaded page components (centralized)
import {
  ContactsPage, FinancePage,
  IdeasPage, AIWorkshop, InsightsDashboard,
  DocumentVaultPage, BusinessDashboard, PlannerPage, EmailPage,
  LearningDashboard, MyAIPage, SettingsDashboard, NotificationsPage,
  MemoryInsightsPage, SystemAdminPage,
  // Phase 104: ChatHub is the new primary start page
  ChatHub,
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
            initialTab={(tabParam || 'personalize') as 'personalize' | 'memory' | 'procedures' | 'digital-twin' | 'voice-chat'}
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
