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
import type { InputMode } from './components/CommandCenter';
import type { AdvancedFilters } from './components/SearchFilterBar';
import { safeLocalStorage } from './utils/storage';
import { getErrorMessage } from './utils/errors';
import { safeParseResponse, IdeaCreationResponseSchema, SearchResponseSchema, ProgressiveSearchResponseSchema } from './utils/apiSchemas';
import { GeneralChat } from './components/GeneralChat';
import { ContextNudge } from './components/ContextNudge';
import { useIdeasData } from './hooks/useIdeasData';

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
const InsightsDashboard = lazy(() => import('./components/InsightsDashboard').then(m => ({ default: m.InsightsDashboard })));
const AIWorkshop = lazy(() => import('./components/AIWorkshop').then(m => ({ default: m.AIWorkshop })));
const SettingsDashboard = lazy(() => import('./components/SettingsDashboard').then(m => ({ default: m.SettingsDashboard })));
const Onboarding = lazy(() => import('./components/Onboarding').then(m => ({ default: m.Onboarding })));
const MeetingsPage = lazy(() => import('./components/MeetingsPage').then(m => ({ default: m.MeetingsPage })));
const ProfileDashboard = lazy(() => import('./components/ProfileDashboard').then(m => ({ default: m.ProfileDashboard })));
const IntegrationsPage = lazy(() => import('./components/IntegrationsPage').then(m => ({ default: m.IntegrationsPage })));
const LearningDashboard = lazy(() => import('./components/LearningDashboard').then(m => ({ default: m.LearningDashboard })));
const AutomationDashboard = lazy(() => import('./components/AutomationDashboard').then(m => ({ default: m.AutomationDashboard })));
const NotificationsPage = lazy(() => import('./components/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const MyAIPage = lazy(() => import('./components/MyAIPage').then(m => ({ default: m.MyAIPage })));
const ExportDashboard = lazy(() => import('./components/ExportDashboard').then(m => ({ default: m.ExportDashboard })));
const SyncDashboard = lazy(() => import('./components/SyncDashboard').then(m => ({ default: m.SyncDashboard })));
const DocumentVaultPage = lazy(() => import('./components/DocumentVaultPage').then(m => ({ default: m.DocumentVaultPage })));
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const IdeasPage = lazy(() => import('./components/IdeasPage').then(m => ({ default: m.IdeasPage })));
const IncubatorPage = lazy(() => import('./components/IncubatorPage').then(m => ({ default: m.IncubatorPage })));
const BusinessDashboard = lazy(() => import('./components/BusinessDashboard').then(m => ({ default: m.BusinessDashboard })));

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
  // Primary pages
  'home': '/',
  'ideas': '/ideas',
  'incubator': '/incubator',
  'ai-workshop': '/ai-workshop',
  'learning': '/learning',
  'my-ai': '/my-ai',
  'insights': '/insights',
  'documents': '/documents',
  'meetings': '/meetings',
  'automations': '/automations',
  'integrations': '/integrations',
  'export': '/export',
  'sync': '/sync',
  'business': '/business',
  'profile': '/profile',
  'notifications': '/notifications',
  'settings': '/settings',
  // Legacy redirects (old pages -> new locations)
  'archive': '/ideas',
  'triage': '/ideas',
  'stories': '/insights/connections',
  'media': '/documents',
  'canvas': '/documents',
  'personalization': '/my-ai',
  'proactive': '/ai-workshop/proactive',
  'evolution': '/ai-workshop/evolution',
  'dashboard': '/insights/analytics',
  'analytics': '/insights/analytics',
  'digest': '/insights/digest',
  'knowledge-graph': '/insights/connections',
  'learning-tasks': '/learning',
  'voice-chat': '/ai-workshop/voice-chat',
  'agent-teams': '/ai-workshop/agent-teams',
};

const PATH_PAGES: Record<string, Page> = {
  // Primary routes
  '/': 'home',
  '/ideas': 'ideas',
  '/incubator': 'incubator',
  '/ai-workshop': 'ai-workshop',
  '/learning': 'learning',
  '/my-ai': 'my-ai',
  '/insights': 'insights',
  '/documents': 'documents',
  '/meetings': 'meetings',
  '/automations': 'automations',
  '/integrations': 'integrations',
  '/export': 'export',
  '/sync': 'sync',
  '/business': 'business',
  '/profile': 'profile',
  '/notifications': 'notifications',
  '/settings': 'settings',
  // Legacy paths -> redirect to new pages
  '/archive': 'ideas',
  '/triage': 'ideas',
  '/stories': 'insights',
  '/media': 'documents',
  '/canvas': 'documents',
  '/personalization': 'my-ai',
  '/voice-chat': 'ai-workshop',
  '/agent-teams': 'ai-workshop',
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
    if (fullPath.startsWith('/ai-workshop/')) return 'ai-workshop';
    if (fullPath.startsWith('/documents/')) return 'documents';
    if (fullPath.startsWith('/business/')) return 'business';

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
      if (page === 'insights' || page === 'ai-workshop' || page === 'documents') {
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
  } = useIdeasData(context, currentPage);

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

  const pageHistory = usePageHistory();

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

  // Clear search/selection when context changes (data reset handled by useIdeasData)
  useEffect(() => {
    setSearchResults(null);
    setSelectedIdea(null);
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

    setIsSearching(true);
    try {
      // Phase 32B: Progressive search - keyword-first, then semantic
      const response = await axios.post(`/api/${context}/ideas/search/progressive`, { query, limit: 15 });
      const parsed = safeParseResponse(ProgressiveSearchResponseSchema, response.data, 'progressiveSearch');

      // Merge keyword results (fast) + semantic results (deep), keyword first
      const keywordIdeas = parsed.keyword?.ideas ?? [];
      const semanticIdeas = parsed.semantic?.ideas ?? [];
      const merged = [...keywordIdeas, ...semanticIdeas] as unknown as StructuredIdea[];

      setSearchResults(merged);
    } catch {
      // Fallback to classic search if progressive endpoint not available
      try {
        const response = await axios.post(`/api/${context}/ideas/search`, { query, limit: 20 });
        const parsed = safeParseResponse(SearchResponseSchema, response.data, 'handleSearch');
        setSearchResults(parsed.ideas as unknown as StructuredIdea[]);
      } catch (err: unknown) {
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
    structured: Partial<StructuredIdea>;
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

  if (currentPage === 'dashboard' || currentPage === 'analytics' || currentPage === 'digest' || currentPage === 'knowledge-graph') {
    const tab = currentPage === 'analytics' ? 'analytics' :
                currentPage === 'digest' ? 'digest' :
                currentPage === 'knowledge-graph' ? 'connections' : 'overview';
    return <Navigate to={`/insights/${tab}`} replace />;
  }

  if (currentPage === 'proactive' || currentPage === 'evolution') {
    return <Navigate to={`/ai-workshop/${currentPage}`} replace />;
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
              />
            </Suspense>
          </NeuroFeedbackProvider>
        );

      case 'incubator':
        return (
          <Suspense fallback={<PageLoader />}>
            <IncubatorPage
              onBack={() => navigateToPage('ideas')}
              onIdeaCreated={() => {
                loadIdeas();
                navigateToPage('ideas');
              }}
            />
          </Suspense>
        );

      case 'insights':
        return (
          <Suspense fallback={<PageLoader />}>
            <InsightsDashboard
              context={context}
              onBack={() => navigateToPage('home')}
              onNavigate={(page) => navigateToPage(page as Page)}
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

      case 'ai-workshop':
        return (
          <Suspense fallback={<PageLoader />}>
            <AIWorkshop
              context={context}
              onBack={() => navigateToPage('home')}
              onNavigate={(page) => navigateToPage(page as Page)}
              onIdeaCreated={() => {
                loadIdeas();
                navigateToPage('ideas');
              }}
              initialTab={(tabParam || 'proactive') as 'proactive' | 'evolution' | 'voice-chat' | 'agent-teams'}
            />
          </Suspense>
        );

      case 'learning':
        return (
          <Suspense fallback={<PageLoader />}>
            <LearningDashboard
              context={context}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'my-ai':
        return (
          <Suspense fallback={<PageLoader />}>
            <MyAIPage
              context={context}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'meetings':
        return (
          <Suspense fallback={<PageLoader />}>
            <MeetingsPage onBack={() => navigateToPage('home')} />
          </Suspense>
        );

      case 'profile':
        return (
          <Suspense fallback={<PageLoader />}>
            <ProfileDashboard onBack={() => navigateToPage('home')} context={context} />
          </Suspense>
        );

      case 'integrations':
        return (
          <Suspense fallback={<PageLoader />}>
            <IntegrationsPage onBack={() => navigateToPage('home')} />
          </Suspense>
        );

      case 'automations':
        return (
          <Suspense fallback={<PageLoader />}>
            <AutomationDashboard
              context={context}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'notifications':
        return (
          <Suspense fallback={<PageLoader />}>
            <NotificationsPage
              context={context}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );


      case 'export':
        return (
          <Suspense fallback={<PageLoader />}>
            <ExportDashboard
              context={context}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'sync':
        return (
          <Suspense fallback={<PageLoader />}>
            <SyncDashboard
              context={context}
              onBack={() => navigateToPage('home')}
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
              initialTab={tabParam as 'documents' | 'editor' | 'media' | undefined}
            />
          </Suspense>
        );

      case 'settings':
        return (
          <Suspense fallback={<PageLoader />}>
            <SettingsDashboard
              context={context}
              currentPage={currentPage}
              onBack={() => navigateToPage('home')}
              onNavigate={(page) => navigateToPage(page as Page)}
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
        archivedCount={archivedCount}
        notificationCount={notificationCount}
        onOpenSearch={commandPalette.open}
        onRefresh={() => loadIdeas()}
        recentPages={pageHistory.recentPages}
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

      {commandPalette.isOpen && (
        <CommandPalette
          isOpen={commandPalette.isOpen}
          onClose={commandPalette.close}
          commands={commandPalette.commands}
          recentPages={pageHistory.recentPages}
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
