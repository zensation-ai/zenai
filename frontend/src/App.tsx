import { useState, useEffect, useMemo, useCallback, lazy, Suspense, useRef } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';

// Types and constants
import type { StructuredIdea, Page } from './types';
import { AI_PROCESSING_STEP_DELAY_MS, AI_PROCESSING_INITIAL_DELAY_MS } from './constants';

// Core components - always loaded
import { ToastContainer, showToast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useContextState } from './components/ContextSwitcher';
import { usePersonaState } from './components/PersonaSelector';
import { SkeletonLoader } from './components/SkeletonLoader';
import { KeyboardShortcutsModal, useKeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { useCommandPalette, CommandPalette } from './components/CommandPalette';
import type { ProcessType } from './components/AIProcessingOverlay';
import { AIProcessingOverlay } from './components/AIProcessingOverlay';
import type { InputMode } from './components/CommandCenter';
import type { AdvancedFilters } from './components/SearchFilterBar';
import { safeLocalStorage } from './utils/storage';
import { getErrorMessage } from './utils/errors';
import { useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { safeParseResponse, IdeaCreationResponseSchema, SearchResponseSchema, ProgressiveSearchResponseSchema } from './utils/apiSchemas';
import { GeneralChat } from './components/GeneralChat';
import { ContextNudge } from './components/ContextNudge';
import { AIQuestionBubble } from './components/AIQuestionBubble';
import { GlobalSearch } from './components/GlobalSearch';
import { useIdeasData } from './hooks/useIdeasData';
import { useAIQuestions } from './hooks/useAIQuestions';

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
  'agent-teams': '/workshop/agent-teams',
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
      const tabPages: Page[] = ['insights', 'workshop', 'documents', 'ideas', 'my-ai', 'settings', 'business', 'calendar', 'email', 'learning', 'contacts', 'finance', 'screen-memory'];
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

  if (!session) {
    return <LoginPage />;
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const { currentPage, tabParam, navigateToPage } = useUrlNavigation();
  const [context, setContext] = useContextState();
  const [selectedPersona] = usePersonaState(context);
  const keyboardShortcuts = useKeyboardShortcutsModal();

  // Data loading (extracted to useIdeasData hook)
  const {
    ideas, setIdeas,
    archivedIdeas, setArchivedIdeas,
    archivedCount, setArchivedCount,
    notificationCount,
    loading,
    error, setError,
    apiStatus,
    loadIdeas,
    lastSubmitTimeRef,
  } = useIdeasData(context, currentPage === 'ideas' && tabParam === 'archive' ? 'archive' : currentPage);

  // UI State
  const [processing, setProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [searchResults, setSearchResults] = useState<StructuredIdea[] | null>(null);
  const [filters, setFilters] = useState<AdvancedFilters>({
    types: new Set(),
    categories: new Set(),
    priorities: new Set(),
  });
  const [selectedIdea, setSelectedIdea] = useState<StructuredIdea | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return safeLocalStorage('get', 'onboardingComplete') !== 'true';
  });
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const isSubmittingRef = useRef(false);
  const [aiOverlay, setAIOverlay] = useState<{
    visible: boolean;
    type: ProcessType;
    step: number;
  } | null>(null);

  // Context nudge state for AI-suggested context
  const [contextNudge, setContextNudge] = useState<{
    ideaId: string;
    ideaTitle: string;
    suggestedContext: 'personal' | 'work' | 'learning' | 'creative';
    confidence: number;
  } | null>(null);

  // Email unread count for sidebar badge
  const [emailUnreadCount, setEmailUnreadCount] = useState(0);
  useEffect(() => {
    const fetchUnread = () => {
      axios.get(`/api/${context}/emails/stats`).then(res => {
        setEmailUnreadCount(res.data?.data?.unread ?? 0);
      }).catch(() => { /* silent */ });
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60_000);
    return () => clearInterval(interval);
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
        setInputMode('voice');
      } else if (action === 'voice-input') {
        navigateToPage('ideas');
        setInputMode('voice');
      }
    },
  });

  const isAIActive = processing || isSearching || isRecording || loading;
  const aiActivityType = isRecording ? 'transcribing' : isSearching ? 'searching' : loading ? 'thinking' : 'processing';
  const aiActivityMessage = useMemo(() => {
    if (!isAIActive) return undefined;
    if (isRecording) return 'Transkribiere...';
    if (isSearching) return 'Suche...';
    if (processing) return 'Verarbeite Gedanken...';
    if (loading) return 'Lade Daten...';
    return undefined;
  }, [isAIActive, isRecording, isSearching, processing, loading]);

  // Proactive AI questions
  const aiQuestions = useAIQuestions({
    currentPage,
    ideasCount: ideas.length,
    ideas,
    onNavigate: navigateToPage,
  });

  // Clear search/selection and abort pending requests when context changes
  useEffect(() => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearchResults(null);
    setSelectedIdea(null);
    setIsSearching(false);
  }, [context]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleArchive = useCallback((id: string) => {
    setIdeas(prev => prev.filter(i => i.id !== id));
    setArchivedCount(prev => prev + 1);
  }, []);

  const handleRestore = useCallback((id: string) => {
    setArchivedIdeas(prev => {
      const restored = prev.find(i => i.id === id);
      if (restored) {
        setIdeas(prevIdeas => [restored, ...prevIdeas]);
        setArchivedCount(prevCount => Math.max(0, prevCount - 1));
        return prev.filter(i => i.id !== id);
      }
      return prev;
    });
  }, []);

  const handleMove = useCallback((id: string) => {
    setIdeas(prev => prev.filter(i => i.id !== id));
    setSelectedIdea(null);
  }, []);

  const handleContextNudgeMove = useCallback(async (ideaId: string, targetContext: 'personal' | 'work' | 'learning' | 'creative') => {
    try {
      await axios.post(`/api/${context}/ideas/${ideaId}/move`, { targetContext });
      setIdeas(prev => prev.filter(i => i.id !== ideaId));
      showToast(`Gedanke nach "${targetContext}" verschoben`, 'success');
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Verschieben fehlgeschlagen'), 'error');
    }
    setContextNudge(null);
  }, [context]);

  const submitText = useCallback(async () => {
    if (!textInput.trim()) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setProcessing(true);
    setError(null);
    setAIOverlay({ visible: true, type: 'text', step: 0 });

    try {
      await new Promise(resolve => setTimeout(resolve, AI_PROCESSING_INITIAL_DELAY_MS));
      setAIOverlay({ visible: true, type: 'text', step: 1 });

      const response = await axios.post(`/api/${context}/voice-memo`, {
        text: textInput,
        persona: selectedPersona,
      });

      const creationData = safeParseResponse(IdeaCreationResponseSchema, response.data, 'submitText');

      setAIOverlay({ visible: true, type: 'text', step: 2 });
      await new Promise(resolve => setTimeout(resolve, AI_PROCESSING_STEP_DELAY_MS));
      setAIOverlay({ visible: true, type: 'text', step: 3 });
      await new Promise(resolve => setTimeout(resolve, AI_PROCESSING_STEP_DELAY_MS));

      const newIdea = {
        id: creationData.ideaId,
        ...creationData.structured,
        created_at: new Date().toISOString(),
      } as unknown as StructuredIdea;

      setIdeas(prev => [newIdea, ...prev]);
      lastSubmitTimeRef.current = Date.now();
      setTextInput('');
      showToast('Gedanke erfolgreich strukturiert!', 'success');

      // Show context nudge if AI suggests a different context
      const suggested = response.data.suggestedContext || creationData.structured?.suggested_context;
      if (suggested && suggested !== context) {
        setContextNudge({
          ideaId: creationData.ideaId,
          ideaTitle: creationData.structured?.title || 'Neuer Gedanke',
          suggestedContext: suggested,
          confidence: response.data.contextConfidence || 0.7,
        });
      }
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err, 'Verarbeitung fehlgeschlagen');
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setProcessing(false);
      setAIOverlay(null);
      isSubmittingRef.current = false;
    }
  }, [textInput, context, selectedPersona]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    // Abort any pending search request
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    try {
      // Phase 32B: Progressive search - keyword-first, then semantic
      const response = await axios.post(`/api/${context}/ideas/search/progressive`, { query, limit: 15 }, { signal: controller.signal });
      const parsed = safeParseResponse(ProgressiveSearchResponseSchema, response.data, 'progressiveSearch');

      // Merge keyword results (fast) + semantic results (deep), keyword first
      const keywordIdeas = parsed.keyword?.ideas ?? [];
      const semanticIdeas = parsed.semantic?.ideas ?? [];
      const merged = [...keywordIdeas, ...semanticIdeas] as unknown as StructuredIdea[];

      setSearchResults(merged);
    } catch (progressiveErr) {
      if (axios.isCancel(progressiveErr)) return;
      // Fallback to classic search if progressive endpoint not available
      try {
        const response = await axios.post(`/api/${context}/ideas/search`, { query, limit: 20 }, { signal: controller.signal });
        const parsed = safeParseResponse(SearchResponseSchema, response.data, 'handleSearch');
        setSearchResults(parsed.ideas as unknown as StructuredIdea[]);
      } catch (err: unknown) {
        if (axios.isCancel(err)) return;
        const errorMessage = getErrorMessage(err, 'Suche fehlgeschlagen');
        setError(errorMessage);
        showToast(errorMessage, 'error');
      }
    } finally {
      setIsSearching(false);
    }
  }, [context]);

  const clearSearch = useCallback(() => {
    setSearchResults(null);
  }, []);

  const handleIdeaClick = useCallback((idea: StructuredIdea) => {
    setSelectedIdea(idea);
  }, []);

  const navigateToIdea = useCallback((ideaId: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (idea) {
      setSelectedIdea(idea);
    }
  }, [ideas]);

  const handleOnboardingComplete = () => {
    safeLocalStorage('set', 'onboardingComplete', 'true');
    setShowOnboarding(false);
  };

  const handleRecordProcessed = useCallback((result: {
    ideaId: string;
    structured: {
      title?: string;
      type?: string;
      category?: string;
      priority?: string;
      summary?: string;
      next_steps?: string[];
      context_needed?: string[];
      keywords?: string[];
    };
    suggestedContext?: 'personal' | 'work' | 'learning' | 'creative';
    contextConfidence?: number;
  }) => {
    const newIdea: StructuredIdea = {
      id: result.ideaId,
      ...result.structured,
      next_steps: result.structured.next_steps || [],
      context_needed: result.structured.context_needed || [],
      keywords: result.structured.keywords || [],
      created_at: new Date().toISOString(),
    } as StructuredIdea;
    setIdeas(prev => [newIdea, ...prev]);
    setTextInput('');

    // Show context nudge if AI suggests a different context
    const suggested = result.suggestedContext || (result.structured as Record<string, unknown>).suggested_context as typeof result.suggestedContext;
    if (suggested && suggested !== context && (result.contextConfidence || 0.7) >= 0.5) {
      setContextNudge({
        ideaId: result.ideaId,
        ideaTitle: result.structured.title || 'Neuer Gedanke',
        suggestedContext: suggested,
        confidence: result.contextConfidence || 0.7,
      });
    }
  }, [context]);

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
                selectedPersona={selectedPersona}
                ideas={ideas}
                loading={loading}
                error={error}
                processing={processing}
                isSearching={isSearching}
                isAIActive={isAIActive}
                aiActivityType={aiActivityType as 'transcribing' | 'searching' | 'thinking' | 'processing'}
                aiOverlay={aiOverlay}
                textInput={textInput}
                onTextChange={setTextInput}
                inputMode={inputMode}
                onInputModeChange={setInputMode}
                onSubmitText={submitText}
                onSearch={handleSearch}
                onClearSearch={clearSearch}
                onDeleteIdea={(id) => setIdeas(prev => prev.filter(i => i.id !== id))}
                onArchiveIdea={handleArchive}
                onMoveIdea={handleMove}
                onRecordingChange={setIsRecording}
                onRecordProcessed={handleRecordProcessed}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                searchResults={searchResults}
                filters={filters}
                onFilterChange={setFilters}
                onSetError={setError}
                selectedIdea={selectedIdea}
                onIdeaClick={handleIdeaClick}
                onCloseDetail={() => setSelectedIdea(null)}
                onNavigateToIdea={navigateToIdea}
                archivedIdeas={archivedIdeas}
                archivedCount={archivedCount}
                onRestore={handleRestore}
                onTriageComplete={() => loadIdeas()}
                initialTab={(tabParam || 'ideas') as 'ideas' | 'incubator' | 'archive' | 'triage'}
                onIdeaCreated={() => loadIdeas()}
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
              onSelectIdea={(ideaId) => {
                const idea = ideas.find(i => i.id === ideaId);
                if (idea) {
                  setSelectedIdea(idea);
                  navigateToPage('ideas');
                }
              }}
              initialTab={(tabParam || 'analytics') as 'analytics' | 'digest' | 'connections'}
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
        return (
          <Suspense fallback={<PageLoader />}>
            <MyAIPage
              context={context}
              onBack={() => navigateToPage('home')}
              initialTab={(tabParam || 'personalize') as 'personalize' | 'memory' | 'voice-chat'}
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
              initialTab={(tabParam || 'general') as 'profile' | 'general' | 'ai' | 'privacy' | 'automations' | 'integrations' | 'data'}
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
        {renderPage()}
      </AppLayout>

      <ToastContainer />

      {aiOverlay?.visible && (
        <AIProcessingOverlay
          isVisible={aiOverlay.visible}
          processType={aiOverlay.type}
          currentStepIndex={aiOverlay.step}
        />
      )}

      {contextNudge && (
        <ContextNudge
          currentContext={context}
          suggestedContext={contextNudge.suggestedContext}
          ideaTitle={contextNudge.ideaTitle}
          ideaId={contextNudge.ideaId}
          confidence={contextNudge.confidence}
          onMove={handleContextNudgeMove}
          onDismiss={() => setContextNudge(null)}
        />
      )}

      {aiQuestions.currentQuestion && !contextNudge && !aiOverlay?.visible && (
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
  );
}

export default App;
