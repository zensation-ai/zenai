import { useState, useEffect, useMemo, useCallback, lazy, Suspense, useRef } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';

// Types and constants
import type { StructuredIdea, ApiStatus, Page } from './types';
import { RECENT_CUTOFF_MS, SYNC_INTERVAL_MS, AI_PROCESSING_STEP_DELAY_MS, AI_PROCESSING_INITIAL_DELAY_MS } from './constants';

// Core components - always loaded
import { SmartIdeaList } from './components/VirtualizedIdeaList';
import { ToastContainer, showToast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useContextState } from './components/ContextSwitcher';
import { usePersonaState } from './components/PersonaSelector';
import { SkeletonLoader } from './components/SkeletonLoader';
import { KeyboardShortcutsModal, useKeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { useCommandPalette } from './components/CommandPalette';
import type { ProcessType } from './components/AIProcessingOverlay';
import type { InputMode } from './components/CommandCenter';
import type { AdvancedFilters } from './components/SearchFilterBar';
import { safeLocalStorage } from './utils/storage';
import { getErrorMessage, logError } from './utils/errors';
import { safeParseResponse, HealthResponseSchema, IdeasResponseSchema, IdeaCreationResponseSchema, SearchResponseSchema } from './utils/apiSchemas';
import { GeneralChat } from './components/GeneralChat';

// Neurodesign System
import { NeuroFeedbackProvider } from './components/NeuroFeedback';
import { ScrollProgress } from './components/AnticipatoryUI';

// Layout System
import { AppLayout } from './components/layout/AppLayout';
import { usePageHistory } from './hooks/usePageHistory';

import './App.css';

// Lazy-loaded modal/on-demand components
const CommandPalette = lazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })));

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
const PersonalizationChat = lazy(() => import('./components/PersonalizationChat').then(m => ({ default: m.PersonalizationChat })));
const MediaGallery = lazy(() => import('./components/MediaGallery').then(m => ({ default: m.MediaGallery })));
const StoriesPage = lazy(() => import('./components/StoriesPage').then(m => ({ default: m.StoriesPage })));
const ExportDashboard = lazy(() => import('./components/ExportDashboard').then(m => ({ default: m.ExportDashboard })));
const SyncDashboard = lazy(() => import('./components/SyncDashboard').then(m => ({ default: m.SyncDashboard })));
const DocumentVaultPage = lazy(() => import('./components/DocumentVaultPage').then(m => ({ default: m.DocumentVaultPage })));
const InboxTriage = lazy(() => import('./components/InboxTriage').then(m => ({ default: m.InboxTriage })));
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const IdeasPage = lazy(() => import('./components/IdeasPage').then(m => ({ default: m.IdeasPage })));
const CanvasPage = lazy(() => import('./components/CanvasPage').then(m => ({ default: m.CanvasPage })));
const VoiceChatPage = lazy(() => import('./components/VoiceChat').then(m => ({ default: m.VoiceChat })));
const AgentTeamsPage = lazy(() => import('./components/AgentTeamsPage').then(m => ({ default: m.AgentTeamsPage })));

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
  'home': '/',
  'ideas': '/ideas',
  'insights': '/insights',
  'archive': '/archive',
  'settings': '/settings',
  'ai-workshop': '/ai-workshop',
  'learning': '/learning',
  'profile': '/profile',
  'meetings': '/meetings',
  'media': '/media',
  'stories': '/stories',
  'automations': '/automations',
  'integrations': '/integrations',
  'notifications': '/notifications',
  'export': '/export',
  'sync': '/sync',
  'personalization': '/personalization',
  'documents': '/documents',
  'triage': '/triage',
  'canvas': '/canvas',
  'voice-chat': '/voice-chat',
  'agent-teams': '/agent-teams',
  // Legacy redirects
  'incubator': '/ai-workshop/incubator',
  'proactive': '/ai-workshop/proactive',
  'evolution': '/ai-workshop/evolution',
  'dashboard': '/insights/overview',
  'analytics': '/insights/analytics',
  'digest': '/insights/digest',
  'knowledge-graph': '/insights/connections',
  'learning-tasks': '/learning',
};

const PATH_PAGES: Record<string, Page> = {
  '/': 'home',
  '/ideas': 'ideas',
  '/insights': 'insights',
  '/archive': 'archive',
  '/settings': 'settings',
  '/ai-workshop': 'ai-workshop',
  '/learning': 'learning',
  '/profile': 'profile',
  '/meetings': 'meetings',
  '/media': 'media',
  '/stories': 'stories',
  '/automations': 'automations',
  '/integrations': 'integrations',
  '/notifications': 'notifications',
  '/export': 'export',
  '/sync': 'sync',
  '/personalization': 'personalization',
  '/documents': 'documents',
  '/triage': 'triage',
  '/canvas': 'canvas',
  '/voice-chat': 'voice-chat',
  '/agent-teams': 'agent-teams',
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
      if (page === 'insights' || page === 'ai-workshop') {
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

  // State
  const [ideas, setIdeas] = useState<StructuredIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
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
  const [archivedIdeas, setArchivedIdeas] = useState<StructuredIdea[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
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

  const [context, setContext] = useContextState();
  const [selectedPersona] = usePersonaState(context);
  const keyboardShortcuts = useKeyboardShortcutsModal();

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

  // ============================================
  // DATA LOADING
  // ============================================

  useEffect(() => {
    const abortController = new AbortController();
    Promise.all([
      checkHealth(abortController.signal),
      loadIdeas(abortController.signal),
      loadArchivedCount(abortController.signal),
      loadNotificationCount(abortController.signal),
    ]);
    return () => { abortController.abort(); };
  }, [context]);

  useEffect(() => {
    if (currentPage === 'archive') {
      const abortController = new AbortController();
      loadArchivedIdeas(abortController.signal);
      return () => abortController.abort();
    }
  }, [currentPage, context]);

  useEffect(() => {
    if (currentPage !== 'ideas') return;

    const syncInterval = setInterval(async () => {
      try {
        const res = await axios.get(`/api/${context}/ideas`);
        const serverIdeas: StructuredIdea[] = res.data.ideas || [];
        const serverIdeaIds = new Set(serverIdeas.map(i => i.id));

        setIdeas(currentIdeas => {
          const recentCutoff = new Date(Date.now() - RECENT_CUTOFF_MS).toISOString();
          const recentLocalIdeas = currentIdeas.filter(localIdea =>
            !serverIdeaIds.has(localIdea.id) &&
            localIdea.created_at > recentCutoff
          );

          if (recentLocalIdeas.length > 0) {
            return [...recentLocalIdeas, ...serverIdeas];
          }
          return serverIdeas;
        });
      } catch (err) {
        if (err instanceof Error && err.name !== 'CanceledError') {
          console.debug('[Sync] Background sync failed:', err.message);
        }
      }
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(syncInterval);
  }, [currentPage, context]);

  const checkHealth = async (signal?: AbortSignal) => {
    try {
      const response = await axios.get('/api/health', { signal });
      const healthData = safeParseResponse(HealthResponseSchema, response.data, 'checkHealth');

      const databases = healthData.services?.databases;
      const dbConnected = databases
        ? (databases.personal?.status === 'connected' || databases.work?.status === 'connected')
        : healthData.services?.database?.status === 'connected';

      const aiServices = healthData.services?.ai;
      const claudeAvailable = aiServices?.claude?.status === 'healthy' || aiServices?.claude?.available;
      const ollamaConnected = aiServices?.ollama?.status === 'connected';
      const openaiConfigured = aiServices?.openai?.status === 'configured';
      const ollamaModels = aiServices?.ollama?.models || [];

      setApiStatus({
        database: !!dbConnected,
        ollama: !!(claudeAvailable || ollamaConnected || openaiConfigured),
        models: ollamaModels,
      });
    } catch (err) {
      if (!signal?.aborted) {
        setApiStatus({ database: false, ollama: false, models: [] });
      }
    }
  };

  const loadIdeas = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/${context}/ideas?limit=100`, { signal });
      const parsed = safeParseResponse(IdeasResponseSchema, response.data, 'loadIdeas');
      const serverIdeas = (parsed.ideas || []) as unknown as StructuredIdea[];

      setIdeas(currentIdeas => {
        const serverIdeaIds = new Set(serverIdeas.map(i => i.id));
        const recentCutoff = new Date(Date.now() - RECENT_CUTOFF_MS).toISOString();

        const recentLocalIdeas = currentIdeas.filter(localIdea =>
          !serverIdeaIds.has(localIdea.id) &&
          localIdea.created_at > recentCutoff
        );

        if (recentLocalIdeas.length > 0) {
          return [...recentLocalIdeas, ...serverIdeas];
        }
        return serverIdeas;
      });
      setError(null);
    } catch (err: unknown) {
      if (signal?.aborted) return;
      try {
        const fallbackResponse = await axios.get('/api/ideas?limit=100', { signal });
        const fallbackParsed = safeParseResponse(IdeasResponseSchema, fallbackResponse.data, 'loadIdeas:fallback');
        setIdeas(fallbackParsed.ideas as unknown as StructuredIdea[]);
        setError(null);
      } catch (fallbackErr: unknown) {
        if (signal?.aborted) return;
        logError('loadIdeas', fallbackErr);
        setError(getErrorMessage(fallbackErr, 'Failed to load ideas'));
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const loadArchivedIdeas = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/${context}/ideas/archived?limit=100`, { signal });
      const parsed = safeParseResponse(IdeasResponseSchema, response.data, 'loadArchivedIdeas');
      setArchivedIdeas(parsed.ideas as unknown as StructuredIdea[]);
      setArchivedCount(parsed.pagination?.total ?? 0);
    } catch (err) {
      if (signal?.aborted) return;
      logError('loadArchivedIdeas', err);
      setArchivedIdeas([]);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const loadArchivedCount = async (signal?: AbortSignal) => {
    try {
      const response = await axios.get(`/api/${context}/ideas/archived?limit=1`, { signal });
      const parsed = safeParseResponse(IdeasResponseSchema, response.data, 'loadArchivedCount');
      setArchivedCount(parsed.pagination?.total ?? 0);
    } catch (err) {
      if (!signal?.aborted) {
        setArchivedCount(0);
      }
    }
  };

  const loadNotificationCount = async (signal?: AbortSignal) => {
    try {
      const response = await axios.get('/api/notifications/history?limit=1', { signal });
      const total = response.data?.total ?? response.data?.notifications?.length ?? 0;
      setNotificationCount(total);
    } catch {
      // Notifications not available - keep count at 0
    }
  };

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
      setTextInput('');
      showToast('Gedanke erfolgreich strukturiert!', 'success');
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
      const data = response.data;

      // Merge keyword results (fast) + semantic results (deep), keyword first
      const keywordIdeas = data.keyword?.ideas ?? [];
      const semanticIdeas = data.semantic?.ideas ?? [];
      const merged = [...keywordIdeas, ...semanticIdeas];

      setSearchResults(merged as unknown as StructuredIdea[]);
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

  const handleRecordProcessed = useCallback((result: { ideaId: string; structured: Partial<StructuredIdea> }) => {
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
  }, []);

  // ============================================
  // LEGACY REDIRECTS
  // ============================================

  if (currentPage === 'dashboard' || currentPage === 'analytics' || currentPage === 'digest' || currentPage === 'knowledge-graph') {
    const tab = currentPage === 'analytics' ? 'analytics' :
                currentPage === 'digest' ? 'digest' :
                currentPage === 'knowledge-graph' ? 'connections' : 'overview';
    return <Navigate to={`/insights/${tab}`} replace />;
  }

  if (currentPage === 'incubator' || currentPage === 'proactive' || currentPage === 'evolution') {
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
              />
            </Suspense>
          </NeuroFeedbackProvider>
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
              initialTab={(tabParam || 'overview') as 'overview' | 'analytics' | 'digest' | 'connections'}
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
              initialTab={(tabParam || 'incubator') as 'incubator' | 'proactive' | 'evolution'}
            />
          </Suspense>
        );

      case 'learning':
      case 'learning-tasks':
        return (
          <Suspense fallback={<PageLoader />}>
            <LearningDashboard
              context={context}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'triage':
        return (
          <NeuroFeedbackProvider>
            <Suspense fallback={<PageLoader />}>
              <InboxTriage
                context={context}
                apiBase="/api"
                onBack={() => navigateToPage('home')}
                onComplete={() => {
                  loadIdeas();
                  navigateToPage('ideas');
                }}
                showToast={showToast}
              />
            </Suspense>
          </NeuroFeedbackProvider>
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

      case 'personalization':
        return (
          <Suspense fallback={<PageLoader />}>
            <PersonalizationChat
              context={context}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'media':
        return (
          <Suspense fallback={<PageLoader />}>
            <MediaGallery
              context={context}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'stories':
        return (
          <Suspense fallback={<PageLoader />}>
            <StoriesPage
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

      case 'canvas':
        return (
          <Suspense fallback={<PageLoader />}>
            <CanvasPage
              context={context}
              onNavigate={(page) => navigateToPage(page as Page)}
            />
          </Suspense>
        );

      case 'voice-chat':
        return (
          <Suspense fallback={<PageLoader />}>
            <VoiceChatPage
              context={context}
              apiUrl={import.meta.env.VITE_API_URL || ''}
              apiKey={import.meta.env.VITE_API_KEY || ''}
              onClose={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'agent-teams':
        return (
          <Suspense fallback={<PageLoader />}>
            <AgentTeamsPage
              context={context}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );

      case 'documents': {
        const docContext = context === 'work' ? 'work' : 'personal';
        return (
          <Suspense fallback={<PageLoader />}>
            <DocumentVaultPage
              context={docContext}
              onBack={() => navigateToPage('home')}
            />
          </Suspense>
        );
      }

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

      case 'archive':
        return (
          <NeuroFeedbackProvider>
            <div className="archive-page">
              <div className="archive-header">
                <h1>📥 Archiv</h1>
                <span className="archive-count">{archivedCount} archiviert</span>
              </div>
              <section className="ideas-section">
                <div className="section-header">
                  <h2>Archivierte Gedanken</h2>
                </div>
                {loading ? (
                  <div className="loading-state" role="status" aria-live="polite">
                    <SkeletonLoader type="card" count={3} />
                  </div>
                ) : archivedIdeas.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">📭</span>
                    <h3>Archiv ist leer</h3>
                    <p>Archivierte Gedanken erscheinen hier. Archiviere Gedanken, die du aufbewahren aber nicht mehr aktiv nutzen möchtest.</p>
                    <div className="empty-state-actions">
                      <button
                        type="button"
                        className="empty-state-cta"
                        onClick={() => navigateToPage('ideas')}
                      >
                        ← Zu deinen Gedanken
                      </button>
                    </div>
                  </div>
                ) : (
                  <SmartIdeaList
                    ideas={archivedIdeas}
                    viewMode={viewMode}
                    onDelete={(id) => setArchivedIdeas(prev => prev.filter(i => i.id !== id))}
                    onRestore={handleRestore}
                    isArchived={true}
                    context={context}
                  />
                )}
              </section>
            </div>
          </NeuroFeedbackProvider>
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

      {commandPalette.isOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            isOpen={commandPalette.isOpen}
            onClose={commandPalette.close}
            commands={commandPalette.commands}
            recentPages={pageHistory.recentPages}
          />
        </Suspense>
      )}

      <KeyboardShortcutsModal
        isOpen={keyboardShortcuts.isOpen}
        onClose={keyboardShortcuts.close}
      />
    </ErrorBoundary>
  );
}

export default App;
