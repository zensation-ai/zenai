import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';

// Types and constants
import type { Page } from './types';

// Core components - always loaded
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useContextState } from './components/ContextSwitcher';
import { SkeletonLoader } from './components/SkeletonLoader';
import { KeyboardShortcutsModal, useKeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { useCommandPalette, CommandPalette } from './components/CommandPalette';
import { safeLocalStorage } from './utils/storage';
import { useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/AuthPage/AuthPage';
import { GeneralChat } from './components/GeneralChat';
import { AIQuestionBubble } from './components/AIQuestionBubble';
import { GlobalSearch } from './components/GlobalSearch';
import { useIdeasData } from './hooks/useIdeasData';
import { useAIQuestions } from './hooks/useAIQuestions';
import { ShortcutHintProvider } from './components/ShortcutHint';

// Neurodesign System
import { NeuroFeedbackProvider } from './components/NeuroFeedback';
import { ScrollProgress } from './components/AnticipatoryUI';

// Layout System
import { AppLayout } from './components/layout/AppLayout';
import { usePageHistory } from './hooks/usePageHistory';

import './App.css';

// Lazy-loaded modal/on-demand components
// CommandPalette is statically imported alongside useCommandPalette (line 16)

// Lazy-loaded page components
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const ChatPage = lazy(() => import('./components/ChatPage').then(m => ({ default: m.ChatPage })));
const BrowserPage = lazy(() => import('./components/BrowserPage/BrowserPage').then(m => ({ default: m.BrowserPage })));
const ContactsPage = lazy(() => import('./components/ContactsPage/ContactsPage').then(m => ({ default: m.ContactsPage })));
const FinancePage = lazy(() => import('./components/FinancePage/FinancePage').then(m => ({ default: m.FinancePage })));
const ScreenMemoryPage = lazy(() => import('./components/ScreenMemoryPage/ScreenMemoryPage').then(m => ({ default: m.ScreenMemoryPage })));
const IdeasPage = lazy(() => import('./components/IdeasPage').then(m => ({ default: m.IdeasPage })));
const AIWorkshop = lazy(() => import('./components/AIWorkshop').then(m => ({ default: m.AIWorkshop })));
const InsightsDashboard = lazy(() => import('./components/InsightsDashboard').then(m => ({ default: m.InsightsDashboard })));
const DocumentVaultPage = lazy(() => import('./components/DocumentVaultPage').then(m => ({ default: m.DocumentVaultPage })));
const BusinessDashboard = lazy(() => import('./components/BusinessDashboard').then(m => ({ default: m.BusinessDashboard })));
const PlannerPage = lazy(() => import('./components/PlannerPage/PlannerPage').then(m => ({ default: m.PlannerPage })));
const EmailPage = lazy(() => import('./components/EmailPage/EmailPage').then(m => ({ default: m.EmailPage })));
const LearningDashboard = lazy(() => import('./components/LearningDashboard').then(m => ({ default: m.LearningDashboard })));
const MyAIPage = lazy(() => import('./components/MyAIPage').then(m => ({ default: m.MyAIPage })));
const SettingsDashboard = lazy(() => import('./components/SettingsDashboard').then(m => ({ default: m.SettingsDashboard })));
const NotificationsPage = lazy(() => import('./components/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const MemoryInsightsPage = lazy(() => import('./components/MemoryInsightsPage/MemoryInsightsPage').then(m => ({ default: m.MemoryInsightsPage })));
const SystemAdminPage = lazy(() => import('./components/SystemAdminPage').then(m => ({ default: m.SystemAdminPage })));
const Onboarding = lazy(() => import('./components/Onboarding').then(m => ({ default: m.Onboarding })));

const PageLoader = () => (
  <div className="page-loader" role="status" aria-live="polite">
    <SkeletonLoader type="card" count={1} />
    <p className="loading-text">Wird geladen...</p>
  </div>
);

// ============================================
// URL ROUTING CONFIGURATION
// ============================================

const PAGE_PATHS: Record<Page, string> = {
  // Primary pages (active routes)
  'home': '/',
  'chat': '/chat',
  'browser': '/browser',
  'contacts': '/contacts',
  'finance': '/finance',
  'ideas': '/ideas',
  'workshop': '/workshop',
  'insights': '/insights',
  'documents': '/documents',
  'calendar': '/calendar',
  'email': '/email',
  'business': '/business',
  'learning': '/learning',
  'my-ai': '/my-ai',
  'screen-memory': '/screen-memory',
  'settings': '/settings',
  'notifications': '/notifications',
  // Legacy pages (redirect to new locations)
  'incubator': '/ideas/incubator',
  'ai-workshop': '/workshop',
  'meetings': '/calendar/meetings',
  'tasks': '/calendar/tasks',
  'kanban': '/calendar/kanban',
  'gantt': '/calendar/gantt',
  'automations': '/settings/automations',
  'integrations': '/settings/integrations',
  'export': '/settings/data',
  'sync': '/settings/data',
  'profile': '/settings/profile',
  'archive': '/ideas/archive',
  'triage': '/ideas/triage',
  'stories': '/insights/connections',
  'media': '/documents',
  'canvas': '/documents/editor',
  'personalization': '/my-ai',
  'proactive': '/workshop/proactive',
  'evolution': '/workshop/evolution',
  'dashboard': '/insights/analytics',
  'analytics': '/insights/analytics',
  'digest': '/insights/digest',
  'knowledge-graph': '/insights/connections',
  'learning-tasks': '/learning',
  'voice-chat': '/my-ai/voice-chat',
  'memory-insights': '/my-ai/memory-insights',
  'agent-teams': '/workshop/agent-teams',
  'mcp-servers': '/settings/integrations/mcp',
  'system-admin': '/admin',
  'graphrag': '/insights/graphrag',
  'procedural-memory': '/my-ai/procedures',
};

const PATH_PAGES: Record<string, Page> = {
  // Primary routes
  '/': 'home',
  '/chat': 'chat',
  '/browser': 'browser',
  '/contacts': 'contacts',
  '/finance': 'finance',
  '/ideas': 'ideas',
  '/workshop': 'workshop',
  '/insights': 'insights',
  '/documents': 'documents',
  '/calendar': 'calendar',
  '/email': 'email',
  '/business': 'business',
  '/learning': 'learning',
  '/my-ai': 'my-ai',
  '/screen-memory': 'screen-memory',
  '/settings': 'settings',
  '/notifications': 'notifications',
  // Legacy paths -> redirect to primary pages
  '/incubator': 'ideas',
  '/ai-workshop': 'workshop',
  '/meetings': 'calendar',
  '/automations': 'settings',
  '/integrations': 'settings',
  '/export': 'settings',
  '/sync': 'settings',
  '/profile': 'settings',
  '/archive': 'ideas',
  '/triage': 'ideas',
  '/stories': 'insights',
  '/media': 'documents',
  '/canvas': 'documents',
  '/personalization': 'my-ai',
  '/voice-chat': 'my-ai',
  '/agent-teams': 'workshop',
  '/admin': 'system-admin',
};

function useUrlNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentPage: Page = useMemo(() => {
    const basePath = '/' + location.pathname.split('/').slice(1, 2).join('/') || '/';
    const fullPath = location.pathname;

    if (PATH_PAGES[fullPath]) {
      return PATH_PAGES[fullPath];
    }

    if (fullPath.startsWith('/insights/')) return 'insights';
    if (fullPath.startsWith('/workshop/')) return 'workshop';
    if (fullPath.startsWith('/documents/')) return 'documents';
    if (fullPath.startsWith('/calendar/')) return 'calendar';
    if (fullPath.startsWith('/browser/')) return 'browser';
    if (fullPath.startsWith('/contacts/')) return 'contacts';
    if (fullPath.startsWith('/finance/')) return 'finance';
    if (fullPath.startsWith('/email/')) return 'email';
    if (fullPath.startsWith('/business/')) return 'business';
    if (fullPath.startsWith('/ideas/')) return 'ideas';
    if (fullPath.startsWith('/my-ai/')) return 'my-ai';
    if (fullPath.startsWith('/settings/')) return 'settings';
    if (fullPath.startsWith('/learning/')) return 'learning';
    if (fullPath.startsWith('/screen-memory/')) return 'screen-memory';
    if (fullPath.startsWith('/admin/')) return 'system-admin';
    // Legacy: /ai-workshop/* → workshop
    if (fullPath.startsWith('/ai-workshop/')) return 'workshop';

    return PATH_PAGES[basePath] || 'home';
  }, [location.pathname]);

  const tabParam = useMemo(() => {
    const parts = location.pathname.split('/');
    if (parts.length >= 3) {
      return parts[2];
    }
    return undefined;
  }, [location.pathname]);

  const navigateToPage = useCallback((page: Page, options?: { tab?: string }) => {
    let path = PAGE_PATHS[page] || '/';

    if (options?.tab) {
      const tabPages: Page[] = ['insights', 'workshop', 'documents', 'ideas', 'my-ai', 'settings', 'business', 'calendar', 'email', 'learning', 'contacts', 'finance', 'screen-memory', 'memory-insights', 'system-admin'];
      if (tabPages.includes(page)) {
        path = `${PAGE_PATHS[page]}/${options.tab}`;
      }
    }

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
  // Note: IdeasPage now manages its own data via React Query hooks.
  // useIdeasData is kept here for Dashboard, AppLayout sidebar badges, and AI questions.
  const {
    ideas,
    archivedCount,
    notificationCount,
    loading,
    apiStatus,
    loadIdeas,
  } = useIdeasData(context, currentPage);

  // UI State
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return safeLocalStorage('get', 'onboardingComplete') !== 'true';
  });

  // Email unread count for sidebar badge (with exponential backoff on errors)
  const [emailUnreadCount, setEmailUnreadCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let errorCount = 0;
    let intervalId: ReturnType<typeof setTimeout>;

    const fetchUnread = () => {
      axios.get(`/api/${context}/emails/stats`, { signal: controller.signal }).then(res => {
        setEmailUnreadCount(res.data?.data?.unread ?? 0);
        errorCount = 0; // Reset on success
        scheduleNext(60_000); // Normal 60s interval
      }).catch(() => {
        if (controller.signal.aborted) return;
        errorCount++;
        // Exponential backoff: 60s, 120s, 240s, max 300s
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

  // Track page visits for recents
  useEffect(() => {
    pageHistory.addRecentPage(currentPage);
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

  const handleOnboardingComplete = () => {
    safeLocalStorage('set', 'onboardingComplete', 'true');
    setShowOnboarding(false);
  };

  // ============================================
  // LEGACY REDIRECTS
  // ============================================

  // Legacy redirects - all old URLs redirect to new locations
  if (currentPage === 'dashboard' || currentPage === 'analytics' || currentPage === 'digest' || currentPage === 'knowledge-graph') {
    const tab = currentPage === 'analytics' ? 'analytics' :
                currentPage === 'digest' ? 'digest' :
                currentPage === 'knowledge-graph' ? 'connections' : 'overview';
    return <Navigate to={`/insights/${tab}`} replace />;
  }

  if (currentPage === 'proactive' || currentPage === 'evolution') {
    return <Navigate to={`/workshop/${currentPage}`} replace />;
  }

  // ============================================
  // PAGE RENDERER
  // ============================================

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return (
          <Suspense fallback={<PageLoader />}>
            <Dashboard
              context={context}
              onNavigate={navigateToPage}
              isAIActive={isAIActive}
              ideasCount={ideas.length}
              apiStatus={apiStatus}
            />
          </Suspense>
        );

      case 'ideas':
        return (
          <NeuroFeedbackProvider>
            <Suspense fallback={<PageLoader />}>
              <IdeasPage
                context={context}
                initialTab={(tabParam || 'ideas') as 'ideas' | 'incubator' | 'archive' | 'triage'}
                onNavigate={(page) => navigateToPage(page as Page)}
              />
            </Suspense>
          </NeuroFeedbackProvider>
        );

      case 'chat':
        return (
          <Suspense fallback={<PageLoader />}>
            <ChatPage context={context} onContextChange={setContext} />
          </Suspense>
        );

      case 'browser':
        return (
          <Suspense fallback={<PageLoader />}>
            <BrowserPage
              context={context}
              initialTab={(tabParam || 'browse') as 'browse' | 'history' | 'bookmarks'}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'contacts':
        return (
          <Suspense fallback={<PageLoader />}>
            <ContactsPage
              context={context}
              initialTab={(tabParam || 'all') as 'all' | 'favorites' | 'organizations'}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'finance':
        return (
          <Suspense fallback={<PageLoader />}>
            <FinancePage
              context={context}
              initialTab={(tabParam || 'overview') as 'overview' | 'transactions' | 'budgets' | 'goals'}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'screen-memory':
        return (
          <Suspense fallback={<PageLoader />}>
            <ScreenMemoryPage
              context={context}
              initialTab={(tabParam || 'timeline') as 'timeline' | 'search' | 'settings'}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'insights':
        return (
          <Suspense fallback={<PageLoader />}>
            <InsightsDashboard
              context={context}
              onBack={() => navigateToPage('home')}
              onSelectIdea={() => {
                navigateToPage('ideas');
              }}
              initialTab={(tabParam || 'analytics') as 'analytics' | 'digest' | 'connections' | 'graphrag' | 'sleep'}
            />
          </Suspense>
        );

      case 'workshop':
        return (
          <Suspense fallback={<PageLoader />}>
            <AIWorkshop
              context={context}
              onBack={() => navigateToPage('home')}
              initialTab={(tabParam || 'proactive') as 'proactive' | 'evolution' | 'agent-teams'}
            />
          </Suspense>
        );

      case 'learning':
        return (
          <Suspense fallback={<PageLoader />}>
            <LearningDashboard
              context={context}
              onBack={() => navigateToPage('home')}
              initialTab={(tabParam || 'overview') as 'overview' | 'focus' | 'suggestions' | 'research' | 'feedback' | 'profile'}
            />
          </Suspense>
        );

      case 'my-ai':
        if (tabParam === 'memory-insights') {
          return (
            <Suspense fallback={<PageLoader />}>
              <MemoryInsightsPage
                context={context}
                onBack={() => navigateToPage('my-ai')}
              />
            </Suspense>
          );
        }
        return (
          <Suspense fallback={<PageLoader />}>
            <MyAIPage
              context={context}
              onBack={() => navigateToPage('home')}
              initialTab={(tabParam || 'personalize') as 'personalize' | 'memory' | 'procedures' | 'voice-chat'}
            />
          </Suspense>
        );

      case 'system-admin':
        return (
          <Suspense fallback={<PageLoader />}>
            <SystemAdminPage
              context={context}
              onBack={() => navigateToPage('home')}
              initialTab={(tabParam || 'overview') as 'overview' | 'queues' | 'security' | 'sleep'}
            />
          </Suspense>
        );

      case 'notifications':
        return (
          <Suspense fallback={<PageLoader />}>
            <NotificationsPage
              context={context}
              onBack={() => navigateToPage('home')}
              onNavigate={(page) => navigateToPage(page as Page)}
            />
          </Suspense>
        );


      case 'calendar': {
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

      case 'email':
        return (
          <Suspense fallback={<PageLoader />}>
            <EmailPage
              context={context}
              initialTab={(tabParam || 'inbox') as 'inbox' | 'sent' | 'drafts' | 'archived' | 'trash' | 'starred'}
            />
          </Suspense>
        );

      case 'business':
        return (
          <Suspense fallback={<PageLoader />}>
            <BusinessDashboard
              context={context}
              onBack={() => navigateToPage('home')}
              initialTab={tabParam as 'overview' | 'revenue' | 'traffic' | 'seo' | 'health' | 'insights' | 'reports' | 'connectors' | undefined}
            />
          </Suspense>
        );

      case 'documents':
        return (
          <Suspense fallback={<PageLoader />}>
            <DocumentVaultPage
              context={context}
              onBack={() => navigateToPage('home')}
              initialTab={(tabParam || 'documents') as 'documents' | 'editor' | 'media'}
            />
          </Suspense>
        );

      case 'settings':
        return (
          <Suspense fallback={<PageLoader />}>
            <SettingsDashboard
              context={context}
              onBack={() => navigateToPage('home')}
              onNavigate={(page) => navigateToPage(page as Page)}
              initialTab={(tabParam || 'general') as 'profile' | 'general' | 'ai' | 'privacy' | 'automations' | 'governance' | 'integrations' | 'data'}
            />
          </Suspense>
        );

      default:
        return (
          <div className="not-found-page">
            <div className="not-found-content">
              <span className="not-found-icon" aria-hidden="true">🔍</span>
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
        );
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <ShortcutHintProvider>
    <ErrorBoundary>
      {showOnboarding && (
        <Suspense fallback={<PageLoader />}>
          <Onboarding context={context} onComplete={handleOnboardingComplete} />
        </Suspense>
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
        <ErrorBoundary
          key={currentPage}
          fallback={
            <div className="page-error-fallback" role="alert">
              <div className="page-error-content">
                <span className="page-error-icon" aria-hidden="true">⚠️</span>
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
          {renderPage()}
        </ErrorBoundary>
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
        <GlobalSearch
          isOpen={globalSearchOpen}
          onClose={closeGlobalSearch}
          context={context}
          onNavigate={(page) => { navigateToPage(page as Page); closeGlobalSearch(); }}
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

export default App;
