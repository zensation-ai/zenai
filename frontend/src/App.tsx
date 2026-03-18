import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';

// Types and constants
import type { Page } from './types';

// Route definitions (centralized)
import { resolvePathToPage, resolvePagePath, LEGACY_REDIRECTS } from './routes';

// Lazy-loaded page components (centralized)
import {
  Dashboard, ChatPage, BrowserPage, ContactsPage, FinancePage,
  ScreenMemoryPage, IdeasPage, AIWorkshop, InsightsDashboard,
  DocumentVaultPage, BusinessDashboard, PlannerPage, EmailPage,
  LearningDashboard, MyAIPage, SettingsDashboard, NotificationsPage,
  MemoryInsightsPage, SystemAdminPage,
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

  const renderRoutes = () => (
    <Routes>
      {/* Dashboard */}
      <Route path="/" element={
        <Suspense fallback={<PageLoader />}>
          <Dashboard
            context={context}
            onNavigate={navigateToPage}
            isAIActive={isAIActive}
            ideasCount={ideas.length}
            apiStatus={apiStatus}
          />
        </Suspense>
      } />

      {/* Chat */}
      <Route path="/chat" element={
        <Suspense fallback={<PageLoader />}>
          <ChatPage context={context} onContextChange={setContext} />
        </Suspense>
      } />

      {/* Ideas (with tabs) */}
      <Route path="/ideas" element={
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
      <Route path="/ideas/:tab" element={
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

      {/* Browser */}
      <Route path="/browser" element={
        <Suspense fallback={<PageLoader />}>
          <BrowserPage context={context} initialTab="browse" onBack={() => navigateToPage('home')} />
        </Suspense>
      } />
      <Route path="/browser/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <BrowserPage
            context={context}
            initialTab={(tabParam || 'browse') as 'browse' | 'history' | 'bookmarks'}
            onBack={() => navigateToPage('home')}
          />
        </Suspense>
      } />

      {/* Contacts */}
      <Route path="/contacts" element={
        <Suspense fallback={<PageLoader />}>
          <ContactsPage context={context} initialTab="all" onBack={() => navigateToPage('home')} />
        </Suspense>
      } />
      <Route path="/contacts/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <ContactsPage
            context={context}
            initialTab={(tabParam || 'all') as 'all' | 'favorites' | 'organizations'}
            onBack={() => navigateToPage('home')}
          />
        </Suspense>
      } />

      {/* Finance */}
      <Route path="/finance" element={
        <Suspense fallback={<PageLoader />}>
          <FinancePage context={context} initialTab="overview" onBack={() => navigateToPage('home')} />
        </Suspense>
      } />
      <Route path="/finance/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <FinancePage
            context={context}
            initialTab={(tabParam || 'overview') as 'overview' | 'transactions' | 'budgets' | 'goals'}
            onBack={() => navigateToPage('home')}
          />
        </Suspense>
      } />

      {/* Screen Memory */}
      <Route path="/screen-memory" element={
        <Suspense fallback={<PageLoader />}>
          <ScreenMemoryPage context={context} initialTab="timeline" onBack={() => navigateToPage('home')} />
        </Suspense>
      } />
      <Route path="/screen-memory/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <ScreenMemoryPage
            context={context}
            initialTab={(tabParam || 'timeline') as 'timeline' | 'search' | 'settings'}
            onBack={() => navigateToPage('home')}
          />
        </Suspense>
      } />

      {/* Insights */}
      <Route path="/insights" element={
        <Suspense fallback={<PageLoader />}>
          <InsightsDashboard
            context={context}
            onBack={() => navigateToPage('home')}
            onSelectIdea={() => navigateToPage('ideas')}
            initialTab="analytics"
          />
        </Suspense>
      } />
      <Route path="/insights/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <InsightsDashboard
            context={context}
            onBack={() => navigateToPage('home')}
            onSelectIdea={() => navigateToPage('ideas')}
            initialTab={(tabParam || 'analytics') as 'analytics' | 'digest' | 'connections' | 'graphrag' | 'sleep' | 'ai-traces'}
          />
        </Suspense>
      } />

      {/* Workshop */}
      <Route path="/workshop" element={
        <Suspense fallback={<PageLoader />}>
          <AIWorkshop context={context} onBack={() => navigateToPage('home')} initialTab="proactive" />
        </Suspense>
      } />
      <Route path="/workshop/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <AIWorkshop
            context={context}
            onBack={() => navigateToPage('home')}
            initialTab={(tabParam || 'proactive') as 'proactive' | 'evolution' | 'agent-teams' | 'automations'}
          />
        </Suspense>
      } />

      {/* Learning */}
      <Route path="/learning" element={
        <Suspense fallback={<PageLoader />}>
          <LearningDashboard context={context} onBack={() => navigateToPage('home')} initialTab="overview" />
        </Suspense>
      } />
      <Route path="/learning/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <LearningDashboard
            context={context}
            onBack={() => navigateToPage('home')}
            initialTab={(tabParam || 'overview') as 'overview' | 'focus' | 'suggestions' | 'research' | 'feedback' | 'profile'}
          />
        </Suspense>
      } />

      {/* My AI */}
      <Route path="/my-ai/memory-insights" element={
        <Suspense fallback={<PageLoader />}>
          <MemoryInsightsPage context={context} onBack={() => navigateToPage('my-ai')} />
        </Suspense>
      } />
      <Route path="/my-ai" element={
        <Suspense fallback={<PageLoader />}>
          <MyAIPage context={context} onBack={() => navigateToPage('home')} initialTab="personalize" />
        </Suspense>
      } />
      <Route path="/my-ai/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <MyAIPage
            context={context}
            onBack={() => navigateToPage('home')}
            initialTab={(tabParam || 'personalize') as 'personalize' | 'memory' | 'procedures' | 'digital-twin' | 'voice-chat'}
          />
        </Suspense>
      } />

      {/* System Admin */}
      <Route path="/admin" element={
        <Suspense fallback={<PageLoader />}>
          <SystemAdminPage context={context} onBack={() => navigateToPage('home')} initialTab="overview" />
        </Suspense>
      } />
      <Route path="/admin/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <SystemAdminPage
            context={context}
            onBack={() => navigateToPage('home')}
            initialTab={(tabParam || 'overview') as 'overview' | 'queues' | 'security' | 'sleep'}
          />
        </Suspense>
      } />

      {/* Notifications */}
      <Route path="/notifications" element={
        <Suspense fallback={<PageLoader />}>
          <NotificationsPage
            context={context}
            onBack={() => navigateToPage('home')}
            onNavigate={(page) => navigateToPage(page as Page)}
          />
        </Suspense>
      } />

      {/* Calendar / Planner */}
      <Route path="/calendar" element={
        <Suspense fallback={<PageLoader />}>
          <PlannerPage context={context} initialTab="calendar" onBack={() => navigateToPage('home')} />
        </Suspense>
      } />
      <Route path="/calendar/:tab" element={
        <CalendarRouteHandler context={context} tabParam={tabParam} navigateToPage={navigateToPage} />
      } />

      {/* Email */}
      <Route path="/email" element={
        <Suspense fallback={<PageLoader />}>
          <EmailPage context={context} initialTab="inbox" />
        </Suspense>
      } />
      <Route path="/email/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <EmailPage
            context={context}
            initialTab={(tabParam || 'inbox') as 'inbox' | 'sent' | 'drafts' | 'archived' | 'trash' | 'starred'}
          />
        </Suspense>
      } />

      {/* Business */}
      <Route path="/business" element={
        <Suspense fallback={<PageLoader />}>
          <BusinessDashboard context={context} onBack={() => navigateToPage('home')} />
        </Suspense>
      } />
      <Route path="/business/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <BusinessDashboard
            context={context}
            onBack={() => navigateToPage('home')}
            initialTab={tabParam as 'overview' | 'revenue' | 'traffic' | 'seo' | 'health' | 'insights' | 'reports' | 'connectors' | 'intelligence' | undefined}
          />
        </Suspense>
      } />

      {/* Documents */}
      <Route path="/documents" element={
        <Suspense fallback={<PageLoader />}>
          <DocumentVaultPage context={context} onBack={() => navigateToPage('home')} initialTab="documents" />
        </Suspense>
      } />
      <Route path="/documents/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <DocumentVaultPage
            context={context}
            onBack={() => navigateToPage('home')}
            initialTab={(tabParam || 'documents') as 'documents' | 'editor' | 'media'}
          />
        </Suspense>
      } />

      {/* Settings */}
      <Route path="/settings" element={
        <Suspense fallback={<PageLoader />}>
          <SettingsDashboard
            context={context}
            onBack={() => navigateToPage('home')}
            onNavigate={(page) => navigateToPage(page as Page)}
            initialTab="general"
          />
        </Suspense>
      } />
      <Route path="/settings/:tab" element={
        <Suspense fallback={<PageLoader />}>
          <SettingsDashboard
            context={context}
            onBack={() => navigateToPage('home')}
            onNavigate={(page) => navigateToPage(page as Page)}
            initialTab={(tabParam || 'general') as 'profile' | 'account' | 'general' | 'ai' | 'privacy' | 'automations' | 'proactive-rules' | 'governance' | 'context-rules' | 'security' | 'integrations' | 'mcp-servers' | 'extensions' | 'on-device-ai' | 'system' | 'data'}
          />
        </Suspense>
      } />
      <Route path="/settings/:tab/:subtab" element={
        <Suspense fallback={<PageLoader />}>
          <SettingsDashboard
            context={context}
            onBack={() => navigateToPage('home')}
            onNavigate={(page) => navigateToPage(page as Page)}
            initialTab={(tabParam || 'general') as 'profile' | 'account' | 'general' | 'ai' | 'privacy' | 'automations' | 'proactive-rules' | 'governance' | 'context-rules' | 'security' | 'integrations' | 'mcp-servers' | 'extensions' | 'on-device-ai' | 'system' | 'data'}
          />
        </Suspense>
      } />

      {/* Legacy Redirects */}
      {LEGACY_REDIRECTS.map(({ from, to }) => (
        <Route key={from} path={from} element={<Navigate to={to} replace />} />
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
              onClick={() => navigateToPage('home')}
            >
              Zum Dashboard
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
                    onClick={() => navigateToPage('home')}
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
  const calendarTabMap: Record<string, 'calendar' | 'tasks' | 'projects' | 'meetings'> = {
    'tasks': 'tasks', 'kanban': 'tasks', 'gantt': 'projects', 'meetings': 'meetings',
  };
  const plannerTab = tabParam ? calendarTabMap[tabParam] || 'calendar' : 'calendar';

  return (
    <Suspense fallback={<PageLoader />}>
      <PlannerPage context={context} initialTab={plannerTab} onBack={() => navigateToPage('home')} />
    </Suspense>
  );
}

export default App;
