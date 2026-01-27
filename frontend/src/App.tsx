import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import axios from 'axios';

// Types and constants
import type { StructuredIdea, ApiStatus, Page } from './types';
import { RECENT_CUTOFF_MS, SYNC_INTERVAL_MS, AI_PROCESSING_STEP_DELAY_MS, AI_PROCESSING_INITIAL_DELAY_MS } from './constants';

// Core components - always loaded
import { SmartIdeaList } from './components/VirtualizedIdeaList';
import { RecordButton } from './components/RecordButton';
import { SearchFilterBar, type Filters } from './components/SearchFilterBar';
import { QuickStats } from './components/QuickStats';
import { IdeaDetail } from './components/IdeaDetail';
import { AIBrain } from './components/AIBrain';
import { ToastContainer, showToast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useContextState } from './components/ContextSwitcher';
import { PersonaSelector, usePersonaState } from './components/PersonaSelector';
import { ExportMenu } from './components/ExportMenu';
import { NavDropdown } from './components/NavDropdown';
import './components/NavDropdown.css';
import { GeneralChat } from './components/GeneralChat';
import { SkeletonLoader } from './components/SkeletonLoader';
import { MobileNav } from './components/MobileNav';
import { AIProcessingOverlay, type ProcessType } from './components/AIProcessingOverlay';
import { CommandCenter, type InputMode } from './components/CommandCenter';
import { safeLocalStorage } from './utils/storage';
import { getErrorMessage, logError } from './utils/errors';
import {
  AI_PERSONALITY,
  AI_AVATAR,
  getTimeBasedGreeting,
  EMPTY_STATE_MESSAGES,
  getContextAwareGreeting,
} from './utils/aiPersonality';

// Neurodesign System - Dopamin-optimiertes Feedback
import { NeuroFeedbackProvider } from './components/NeuroFeedback';
import { ScrollProgress } from './components/AnticipatoryUI';

import './App.css';

// Lazy-loaded page components for code-splitting
const MeetingsPage = lazy(() => import('./components/MeetingsPage').then(m => ({ default: m.MeetingsPage })));
const ProfileDashboard = lazy(() => import('./components/ProfileDashboard').then(m => ({ default: m.ProfileDashboard })));
const IntegrationsPage = lazy(() => import('./components/IntegrationsPage').then(m => ({ default: m.IntegrationsPage })));
const IncubatorPage = lazy(() => import('./components/IncubatorPage').then(m => ({ default: m.IncubatorPage })));
const KnowledgeGraphPage = lazy(() => import('./components/KnowledgeGraph/KnowledgeGraphPage'));
const LearningDashboard = lazy(() => import('./components/LearningDashboard').then(m => ({ default: m.LearningDashboard })));
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));
const AutomationDashboard = lazy(() => import('./components/AutomationDashboard').then(m => ({ default: m.AutomationDashboard })));
const EvolutionDashboard = lazy(() => import('./components/EvolutionDashboard').then(m => ({ default: m.EvolutionDashboard })));
const NotificationsPage = lazy(() => import('./components/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const DigestDashboard = lazy(() => import('./components/DigestDashboard').then(m => ({ default: m.DigestDashboard })));
const PersonalizationChat = lazy(() => import('./components/PersonalizationChat').then(m => ({ default: m.PersonalizationChat })));
const LearningTasksDashboard = lazy(() => import('./components/LearningTasksDashboard').then(m => ({ default: m.LearningTasksDashboard })));
const MediaGallery = lazy(() => import('./components/MediaGallery').then(m => ({ default: m.MediaGallery })));
const StoriesPage = lazy(() => import('./components/StoriesPage').then(m => ({ default: m.StoriesPage })));
const ExportDashboard = lazy(() => import('./components/ExportDashboard').then(m => ({ default: m.ExportDashboard })));
const SyncDashboard = lazy(() => import('./components/SyncDashboard').then(m => ({ default: m.SyncDashboard })));
const ProactiveDashboard = lazy(() => import('./components/ProactiveDashboard').then(m => ({ default: m.ProactiveDashboard })));
const Onboarding = lazy(() => import('./components/Onboarding').then(m => ({ default: m.Onboarding })));
const InboxTriage = lazy(() => import('./components/InboxTriage').then(m => ({ default: m.InboxTriage })));
const DashboardHome = lazy(() => import('./components/DashboardHome').then(m => ({ default: m.DashboardHome })));
const ChatPage = lazy(() => import('./components/ChatPage').then(m => ({ default: m.ChatPage })));

// Loading fallback component for lazy-loaded pages
const PageLoader = () => (
  <div className="page-loader" role="status" aria-live="polite">
    <SkeletonLoader type="card" count={1} />
    <p className="loading-text">Wird geladen...</p>
  </div>
);

// Types imported from ./types - see types/idea.ts for definitions

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('ideas');
  const [ideas, setIdeas] = useState<StructuredIdea[]>([]);
  const [loading, setLoading] = useState(true); // Start true to prevent layout shift
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [textInput, setTextInput] = useState('');
  const [searchResults, setSearchResults] = useState<StructuredIdea[] | null>(null);
  const [filters, setFilters] = useState<Filters>({ type: null, category: null, priority: null });
  const [selectedIdea, setSelectedIdea] = useState<StructuredIdea | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isSearching, setIsSearching] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [archivedIdeas, setArchivedIdeas] = useState<StructuredIdea[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return safeLocalStorage('get', 'onboardingComplete') !== 'true';
  });

  // Input mode state (voice memo or chat) - using CommandCenter's InputMode type
  const [inputMode, setInputMode] = useState<InputMode>('voice');

  // AI Processing Overlay state for transparent status display
  const [aiOverlay, setAIOverlay] = useState<{
    visible: boolean;
    type: ProcessType;
    step: number;
  } | null>(null);

  // Context state (personal/work) - setContext unused since context switching was removed
  const [context] = useContextState();

  // Persona state (per context)
  const [selectedPersona, setSelectedPersona] = usePersonaState(context);

  // Determine AI activity state
  const isAIActive = processing || isSearching || isRecording || loading;
  const aiActivityType = isRecording ? 'transcribing' : isSearching ? 'searching' : loading ? 'thinking' : 'processing';

  // Dynamic, human greeting using centralized AI personality system
  // Neuro-optimiert: Variable Begrüßungen für Dopamin-Aktivierung
  const timeGreeting = useMemo(() => getTimeBasedGreeting(), []);

  // Kontextbewusste Begrüßung mit emotionaler Intelligenz
  const humanGreeting = useMemo(() => {
    const hasIdeas = ideas.length > 0;

    if (!hasIdeas) {
      // First-time / empty state - welcoming with AI personality
      // Neuro-Prinzip: Einladende, nicht-überwältigende erste Erfahrung
      return {
        greeting: `${timeGreeting.emoji} ${timeGreeting.greeting}`,
        subtext: `Ich bin ${AI_PERSONALITY.name}. ${timeGreeting.subtext}`,
        mood: timeGreeting.mood,
        energyLevel: timeGreeting.energyLevel,
        suggestedAction: timeGreeting.suggestedAction,
      };
    } else {
      // Returning user with ideas - personalized & contextual
      // Neuro-Prinzip: Progressive Disclosure basierend auf Engagement-Level
      const contextGreeting = getContextAwareGreeting({
        ideasCount: ideas.length,
        lastActivityDays: 0, // Could be calculated from last idea timestamp
        streakDays: 0, // Could be tracked
        recentCategories: ideas.slice(0, 5).map(i => i.category),
      });

      if (ideas.length < 10) {
        return {
          greeting: `${timeGreeting.emoji} ${timeGreeting.greeting}`,
          subtext: `${ideas.length} Gedanken warten auf dich`,
          mood: timeGreeting.mood,
          energyLevel: timeGreeting.energyLevel,
          suggestedAction: contextGreeting.callToAction,
        };
      } else if (ideas.length < 50) {
        return {
          greeting: `${timeGreeting.emoji} ${timeGreeting.greeting}`,
          subtext: `Wir haben schon ${ideas.length} Gedanken zusammen!`,
          mood: timeGreeting.mood,
          energyLevel: timeGreeting.energyLevel,
          suggestedAction: 'Bereit für den nächsten?',
        };
      } else {
        return {
          greeting: `${timeGreeting.emoji} ${timeGreeting.greeting}`,
          subtext: `${ideas.length} Gedanken – ${AI_PERSONALITY.name} kennt dich gut!`,
          mood: timeGreeting.mood,
          energyLevel: timeGreeting.energyLevel,
          suggestedAction: 'Dein digitales Gehirn wächst',
        };
      }
    }
  }, [ideas.length, timeGreeting]);

  // Check API health on mount and reload ideas when context changes
  // Performance: Load all data in parallel instead of sequentially
  useEffect(() => {
    const abortController = new AbortController();

    const loadData = async () => {
      // Parallel loading for faster initial render
      await Promise.all([
        checkHealth(abortController.signal),
        loadIdeas(abortController.signal),
        loadArchivedCount(abortController.signal),
      ]);
    };

    loadData();

    return () => {
      abortController.abort();
    };
  }, [context]);

  // Load archived ideas when switching to archive page
  useEffect(() => {
    if (currentPage === 'archive') {
      const abortController = new AbortController();
      loadArchivedIdeas(abortController.signal);
      return () => abortController.abort();
    }
  }, [currentPage, context]);

  // Cross-device sync polling (every 30 seconds on ideas page)
  // FIX: Smart merge to prevent race condition where optimistically-added ideas disappear
  useEffect(() => {
    if (currentPage !== 'ideas') return;

    const syncInterval = setInterval(async () => {
      try {
        // Silently check for updates
        const res = await axios.get(`/api/${context}/ideas`);
        const serverIdeas: StructuredIdea[] = res.data.ideas || [];
        const serverIdeaIds = new Set(serverIdeas.map(i => i.id));

        // FIX: Smart merge instead of blind replacement
        // Keep locally-added ideas that aren't on the server yet (created in last 2 minutes)
        // This prevents the race condition where cache returns stale data before invalidation
        setIdeas(currentIdeas => {
          const recentCutoff = new Date(Date.now() - RECENT_CUTOFF_MS).toISOString();

          // Find local ideas that are recent and NOT on server (likely just created)
          const recentLocalIdeas = currentIdeas.filter(localIdea =>
            !serverIdeaIds.has(localIdea.id) &&
            localIdea.created_at > recentCutoff
          );

          // Merge: Server ideas first, then recent local ideas that aren't duplicates
          if (recentLocalIdeas.length > 0) {
            // Keep recent local ideas at the top (they were just created)
            return [...recentLocalIdeas, ...serverIdeas];
          }

          // No recent local ideas to preserve, use server data
          return serverIdeas;
        });
      } catch (err) {
        // Log sync errors for debugging but don't disrupt user
        // Only log if not a cancellation (e.g., from component unmount)
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
      // Support both old (database) and new (databases) format
      const databases = response.data.services.databases;
      const dbConnected = databases
        ? (databases.personal?.status === 'connected' || databases.work?.status === 'connected')
        : response.data.services.database?.status === 'connected';

      // AI services are under services.ai (not services.ollama directly)
      const aiServices = response.data.services.ai;
      const claudeAvailable = aiServices?.claude?.status === 'healthy' || aiServices?.claude?.available;
      const ollamaConnected = aiServices?.ollama?.status === 'connected';
      const openaiConfigured = aiServices?.openai?.status === 'configured';
      const ollamaModels = aiServices?.ollama?.models || [];

      setApiStatus({
        database: dbConnected,
        ollama: claudeAvailable || ollamaConnected || openaiConfigured,
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
      const serverIdeas: StructuredIdea[] = response.data.ideas || [];

      // FIX: Smart merge to preserve recently-created local ideas
      // This handles the case where server cache hasn't been invalidated yet
      setIdeas(currentIdeas => {
        const serverIdeaIds = new Set(serverIdeas.map(i => i.id));
        const recentCutoff = new Date(Date.now() - RECENT_CUTOFF_MS).toISOString();

        // Keep local ideas that are recent and not on server yet
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
      // Fallback to general endpoint if context-specific fails
      try {
        const fallbackResponse = await axios.get('/api/ideas?limit=100', { signal });
        setIdeas(fallbackResponse.data.ideas);
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
      setArchivedIdeas(response.data.ideas);
      setArchivedCount(response.data.pagination.total);
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
      setArchivedCount(response.data.pagination.total);
    } catch (err) {
      if (!signal?.aborted) {
        setArchivedCount(0);
      }
    }
  };

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

  const submitText = useCallback(async () => {
    if (!textInput.trim()) return;

    setProcessing(true);
    setError(null);

    // Show AI processing overlay with step-by-step progress
    setAIOverlay({ visible: true, type: 'text', step: 0 });

    try {
      // Step 1: Analyzing (shown immediately)
      await new Promise(resolve => setTimeout(resolve, AI_PROCESSING_INITIAL_DELAY_MS));
      setAIOverlay({ visible: true, type: 'text', step: 1 });

      // Submit text to context-specific endpoint
      const response = await axios.post(`/api/${context}/voice-memo`, {
        text: textInput,
        persona: selectedPersona,
      });

      // Step 2: Classifying -> Step 3: Extracting
      setAIOverlay({ visible: true, type: 'text', step: 2 });
      await new Promise(resolve => setTimeout(resolve, AI_PROCESSING_STEP_DELAY_MS));
      setAIOverlay({ visible: true, type: 'text', step: 3 });
      await new Promise(resolve => setTimeout(resolve, AI_PROCESSING_STEP_DELAY_MS));

      const newIdea: StructuredIdea = {
        id: response.data.ideaId,
        ...response.data.structured,
        created_at: new Date().toISOString(),
      };

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
    }
  }, [textInput, context, selectedPersona]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      // Search within current context
      const response = await axios.post(`/api/${context}/ideas/search`, { query, limit: 20 });
      setSearchResults(response.data.ideas);
      // No toast for empty results - UI shows this clearly
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err, 'Suche fehlgeschlagen');
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setIsSearching(false);
    }
  }, [context]);

  const clearSearch = useCallback(() => {
    setSearchResults(null);
  }, []);

  // Calculate filter counts
  const filterCounts = useMemo(() => {
    const types: Record<string, number> = {};
    const categories: Record<string, number> = {};
    const priorities: Record<string, number> = {};

    ideas.forEach((idea) => {
      types[idea.type] = (types[idea.type] || 0) + 1;
      categories[idea.category] = (categories[idea.category] || 0) + 1;
      priorities[idea.priority] = (priorities[idea.priority] || 0) + 1;
    });

    return { types, categories, priorities };
  }, [ideas]);

  // Apply filters
  const filteredIdeas = useMemo(() => {
    let result = searchResults || ideas;

    if (filters.type) {
      result = result.filter((idea) => idea.type === filters.type);
    }
    if (filters.category) {
      result = result.filter((idea) => idea.category === filters.category);
    }
    if (filters.priority) {
      result = result.filter((idea) => idea.priority === filters.priority);
    }

    return result;
  }, [ideas, searchResults, filters]);

  const handleIdeaClick = useCallback((idea: StructuredIdea) => {
    setSelectedIdea(idea);
  }, []);

  const navigateToIdea = useCallback((ideaId: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (idea) {
      setSelectedIdea(idea);
    }
  }, [ideas]);

  // Render sub-pages (all wrapped in ErrorBoundary and Suspense for crash protection and lazy loading)
  if (currentPage === 'meetings') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <MeetingsPage onBack={() => setCurrentPage('ideas')} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (currentPage === 'profile') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <ProfileDashboard onBack={() => setCurrentPage('ideas')} context={context} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (currentPage === 'integrations') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <IntegrationsPage onBack={() => setCurrentPage('ideas')} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (currentPage === 'incubator') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <IncubatorPage
            onBack={() => setCurrentPage('ideas')}
            onIdeaCreated={() => {
              loadIdeas();
              setCurrentPage('ideas');
            }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (currentPage === 'knowledge-graph') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <KnowledgeGraphPage
            onBack={() => setCurrentPage('ideas')}
            onSelectIdea={(ideaId) => {
              const idea = ideas.find(i => i.id === ideaId);
              if (idea) {
                setSelectedIdea(idea);
                setCurrentPage('ideas');
              }
            }}
            context={context}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (currentPage === 'learning') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <LearningDashboard
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'analytics') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <AnalyticsDashboard
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'automations') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <AutomationDashboard
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'evolution') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <EvolutionDashboard
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'notifications') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <NotificationsPage
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'digest') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <DigestDashboard
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'personalization') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <PersonalizationChat
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'learning-tasks') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <LearningTasksDashboard
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'media') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <MediaGallery
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'stories') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <StoriesPage
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'export') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <ExportDashboard
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'sync') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <SyncDashboard
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'proactive') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <ProactiveDashboard
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'triage') {
    return (
      <ErrorBoundary>
        <NeuroFeedbackProvider>
          <Suspense fallback={<PageLoader />}>
            <InboxTriage
              context={context}
              apiBase="/api"
              onBack={() => setCurrentPage('ideas')}
              onComplete={() => {
                loadIdeas();
                setCurrentPage('ideas');
              }}
              showToast={showToast}
            />
          </Suspense>
          <ToastContainer />
        </NeuroFeedbackProvider>
      </ErrorBoundary>
    );
  }

  if (currentPage === 'dashboard') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <DashboardHome
            context={context}
            apiBase="/api"
            onNavigate={(page) => setCurrentPage(page as Page)}
            showToast={showToast}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'chat') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <ChatPage
            context={context}
            onBack={() => setCurrentPage('ideas')}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'archive') {
    return (
      <ErrorBoundary>
        <NeuroFeedbackProvider>
        <div className="app archive-page">
          <header className="header">
            <div className="header-content">
              <div className="header-left">
                <button type="button" className="back-button" onClick={() => setCurrentPage('ideas')}>
                  ← Zurück
                </button>
                <h1>📥 Archiv</h1>
                <span className="archive-count">{archivedCount} archiviert</span>
              </div>
            </div>
          </header>
          <main className="main">
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
                      onClick={() => setCurrentPage('ideas')}
                    >
                      ← Zu deinen Gedanken
                    </button>
                  </div>
                </div>
              ) : (
                <SmartIdeaList
                  ideas={archivedIdeas}
                  viewMode={viewMode}
                  onDelete={(id) => setArchivedIdeas(prev => prev.filter((i) => i.id !== id))}
                  onRestore={handleRestore}
                  isArchived={true}
                  context={context}
                />
              )}
            </section>
          </main>
        </div>
        <ToastContainer />
        </NeuroFeedbackProvider>
      </ErrorBoundary>
    );
  }

  const handleOnboardingComplete = () => {
    safeLocalStorage('set', 'onboardingComplete', 'true');
    setShowOnboarding(false);
  };

  return (
    <ErrorBoundary>
    <NeuroFeedbackProvider>
    {showOnboarding && (
      <Suspense fallback={<PageLoader />}>
        <Onboarding context={context} onComplete={handleOnboardingComplete} />
      </Suspense>
    )}
    {/* Scroll Progress Indicator (Neurodesign) */}
    <ScrollProgress />
    <div className="app" data-context={context}>
      {/* Skip Link for Keyboard Navigation (a11y) */}
      <a href="#main-content" className="skip-link">
        Zum Hauptinhalt springen
      </a>

      {/* Animated Organic Background - Performance-optimiert */}
      <div className="ambient-background" aria-hidden="true">
        <div className="blob-1" />
        <div className="blob-2" />
        <div className="blob-3" />
        {/* blob-4 und blob-5 entfernt: Performance-Optimierung, 3 Blobs sind ausreichend */}
        {/* Floating Particles: Reduziert von 12 auf 5 für bessere Performance */}
        <div className="particle particle-1" />
        <div className="particle particle-2" />
        <div className="particle particle-3" />
        <div className="particle particle-4" />
        <div className="particle particle-5" />
      </div>

      <header className="header liquid-glass-nav" role="banner">
        <div className="header-content">
          <div className="header-left">
            <div className="header-logo-container">
              <div className="header-logo-icon">
                {/* ZenAI Logo: Brain on dark green circle */}
                <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" className="zenai-logo-svg">
                  <defs>
                    <linearGradient id="zenLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#a8e6cf" />
                      <stop offset="50%" stopColor="#88d8b0" />
                      <stop offset="100%" stopColor="#6bcf9f" />
                    </linearGradient>
                  </defs>
                  {/* Dark green background circle */}
                  <circle cx="20" cy="20" r="18" fill="#1a3a2f" />
                  {/* Simplified brain shape */}
                  <g transform="translate(8, 8) scale(0.6)">
                    <path d="M20 25 C18 20, 19 15, 23 13 C26 11, 28 12, 30 14 C32 12, 34 11, 37 13 C41 15, 42 20, 40 25 C42 27, 43 31, 40 36 C37 40, 33 42, 30 41 C27 42, 23 40, 20 36 C17 31, 18 27, 20 25Z" fill="url(#zenLogoGradient)" />
                    {/* Neural nodes */}
                    <circle cx="25" cy="22" r="1.5" fill="white" opacity="0.9" />
                    <circle cx="35" cy="22" r="1.5" fill="white" opacity="0.9" />
                    <circle cx="30" cy="28" r="2" fill="white" opacity="0.9" />
                  </g>
                </svg>
                {/* AI status indicator */}
                <span className={`logo-status-dot ${isAIActive ? 'active' : ''}`} title={isAIActive ? `KI arbeitet: ${aiActivityType}` : 'KI bereit'} />
              </div>
              <span className="header-logo-text">ZenAI</span>
            </div>
          </div>
          <div className="header-center">
            <nav className="header-nav" aria-label="Hauptnavigation">
              <button
                type="button"
                className={`nav-button ${currentPage === 'ideas' ? 'active' : ''}`}
                onClick={() => setCurrentPage('ideas')}
                title="Gedanken"
              >
                💭 Gedanken
              </button>
              <button
                type="button"
                className="nav-button"
                onClick={() => setCurrentPage('triage')}
                title="Gedanken sortieren"
              >
                📋 Triage
              </button>
              <button
                type="button"
                className={`nav-button ${(currentPage as Page) === 'chat' ? 'active' : ''}`}
                onClick={() => setCurrentPage('chat')}
                title="Gespräche"
              >
                💬 Gespräche
              </button>
              <button
                type="button"
                className={`nav-button ${archivedCount > 0 ? 'has-items' : ''}`}
                onClick={() => setCurrentPage('archive')}
                title="Archiv"
              >
                📥 Archiv {archivedCount > 0 && <span className="badge">{archivedCount}</span>}
              </button>
              <NavDropdown
                label="KI"
                icon="🧠"
                items={[
                  { label: 'Inkubator', icon: '🧠', page: 'incubator' },
                  { label: 'Lernen', icon: '🧬', page: 'learning' },
                  { label: 'Lernziele', icon: '📚', page: 'learning-tasks' },
                  { label: 'Proaktiv', icon: '✨', page: 'proactive' },
                  { label: 'Evolution', icon: '🌱', page: 'evolution' },
                  { label: 'Personalisierung', icon: '👤', page: 'personalization' },
                ]}
                currentPage={currentPage}
                onNavigate={(page) => setCurrentPage(page as Page)}
              />
              <NavDropdown
                label="Analyse"
                icon="📊"
                items={[
                  { label: 'Übersicht', icon: '🏠', page: 'dashboard' },
                  { label: 'Analytics', icon: '📈', page: 'analytics' },
                  { label: 'Digest', icon: '📊', page: 'digest' },
                  { label: 'Graph', icon: '🕸️', page: 'knowledge-graph' },
                  { label: 'Profil', icon: '👤', page: 'profile' },
                ]}
                currentPage={currentPage}
                onNavigate={(page) => setCurrentPage(page as Page)}
              />
              <NavDropdown
                label="Mehr"
                icon="⚙️"
                items={[
                  // Inhalte Gruppe (3 Items)
                  { label: 'Meetings', icon: '📅', page: 'meetings', group: 'Inhalte' },
                  { label: 'Medien', icon: '🖼️', page: 'media', group: 'Inhalte' },
                  { label: 'Stories', icon: '📖', page: 'stories', group: 'Inhalte' },
                  // Workflows Gruppe (2 Items)
                  { label: 'Automationen', icon: '⚡', page: 'automations', group: 'Workflows' },
                  { label: 'Integrationen', icon: '🔗', page: 'integrations', group: 'Workflows' },
                  // System Gruppe (3 Items)
                  { label: 'Benachrichtigungen', icon: '🔔', page: 'notifications', group: 'System' },
                  { label: 'Export', icon: '📤', page: 'export', group: 'System' },
                  { label: 'Sync', icon: '🔄', page: 'sync', group: 'System' },
                ]}
                currentPage={currentPage}
                onNavigate={(page) => setCurrentPage(page as Page)}
              />
              <ExportMenu context={context} ideasCount={ideas.length} />
            </nav>
          </div>
          <div className="header-right">
            <PersonaSelector
              context={context}
              selectedPersona={selectedPersona}
              onPersonaChange={setSelectedPersona}
            />
            <div className="status-indicators neuro-connection-status compact">
              <span
                className={`status-dot neuro-status-dot ${apiStatus?.database ? 'connected' : 'disconnected'}`}
                title={apiStatus?.database ? 'Datenbank verbunden' : 'Datenbank getrennt'}
              />
              <span
                className={`status-dot neuro-status-dot ${apiStatus?.ollama ? 'connected' : 'disconnected'}`}
                title={apiStatus?.ollama ? 'LLM verbunden' : 'LLM getrennt'}
              />
            </div>
            <button type="button" className="refresh-button" onClick={() => loadIdeas()} title="Neu laden" aria-label="Neu laden">
              ↻
            </button>
            {/* Mobile Navigation */}
            <MobileNav
              currentPage={currentPage}
              onNavigate={(page) => setCurrentPage(page as Page)}
              archivedCount={archivedCount}
              navGroups={[
                {
                  label: 'KI',
                  icon: '🧠',
                  items: [
                    { label: 'Inkubator', icon: '🧠', page: 'incubator' },
                    { label: 'Lernen', icon: '🧬', page: 'learning' },
                    { label: 'Lernziele', icon: '📚', page: 'learning-tasks' },
                    { label: 'Proaktiv', icon: '✨', page: 'proactive' },
                    { label: 'Evolution', icon: '🌱', page: 'evolution' },
                    { label: 'Personalisierung', icon: '👤', page: 'personalization' },
                  ]
                },
                {
                  label: 'Analyse',
                  icon: '📊',
                  items: [
                    { label: 'Übersicht', icon: '🏠', page: 'dashboard' },
                    { label: 'Analytics', icon: '📈', page: 'analytics' },
                    { label: 'Digest', icon: '📊', page: 'digest' },
                    { label: 'Graph', icon: '🕸️', page: 'knowledge-graph' },
                    { label: 'Profil', icon: '👤', page: 'profile' },
                  ]
                },
                {
                  label: 'Inhalte',
                  icon: '📁',
                  items: [
                    { label: 'Meetings', icon: '📅', page: 'meetings' },
                    { label: 'Medien', icon: '🖼️', page: 'media' },
                    { label: 'Stories', icon: '📖', page: 'stories' },
                  ]
                },
                {
                  label: 'Workflows',
                  icon: '⚡',
                  items: [
                    { label: 'Automationen', icon: '⚡', page: 'automations' },
                    { label: 'Integrationen', icon: '🔗', page: 'integrations' },
                  ]
                },
                {
                  label: 'System',
                  icon: '⚙️',
                  items: [
                    { label: 'Benachrichtigungen', icon: '🔔', page: 'notifications' },
                    { label: 'Export', icon: '📤', page: 'export' },
                    { label: 'Sync', icon: '🔄', page: 'sync' },
                  ]
                }
              ]}
            />
          </div>
        </div>
      </header>

      {/* Hero Section with Prominent AI Brain - Neuro-optimiert 2026 */}
      {/* CLS-Fix: Während des Ladens compact zeigen, um Layout-Shift zu vermeiden */}
      <section
        className={`hero-section ${loading || ideas.length > 0 ? 'compact' : ''}`}
        data-mood={humanGreeting.mood}
        data-energy={humanGreeting.energyLevel}
      >
        {/* Ambient Particles - Performance-optimiert: 6 statt 20 Sparkles */}
        <div className="hero-ambient" aria-hidden="true">
          {/* Reduzierte Sparkles für bessere Performance bei gleichem visuellen Effekt */}
          <div className="hero-sparkle" />
          <div className="hero-sparkle" />
          <div className="hero-sparkle" />
          <div className="hero-sparkle" />
          {/* Micro Sparkles: Reduziert auf 2 für subtile Tiefenwirkung */}
          <div className="hero-micro-sparkle" />
          <div className="hero-micro-sparkle" />
        </div>

        {/* Energy Ring - Visualisiert AI-Aktivität */}
        <div className={`hero-energy-ring ${isAIActive ? 'active' : ''}`} aria-hidden="true" />

        {/* Large AI Brain - Zentrales Fokus-Element */}
        <div className="hero-brain">
          <AIBrain
            isActive={isAIActive}
            activityType={aiActivityType}
            ideasCount={ideas.length}
            size="large"
          />
        </div>

        {/* Greeting - Human & Personal mit Dopamin-optimierter Variabilität */}
        <div className="hero-greeting-container">
          <h2 className="hero-greeting">
            {humanGreeting.greeting}
          </h2>
          {humanGreeting.subtext && (
            <p className="hero-subtext">
              {humanGreeting.subtext}
            </p>
          )}
          {/* Suggested Action - Antizipatorisches Design */}
          {humanGreeting.suggestedAction && ideas.length === 0 && (
            <p className="hero-suggested-action">
              {humanGreeting.suggestedAction}
            </p>
          )}
        </div>

        {/* CommandCenter - Central input with AI transparency */}
        <CommandCenter
          context={context}
          isAIActive={isAIActive}
          currentStepIndex={aiOverlay?.step ?? null}
          textValue={textInput}
          onTextChange={setTextInput}
          onSubmit={submitText}
          onModeChange={setInputMode}
          inputMode={inputMode}
          isProcessing={processing}
          disabled={false}
          renderRecordButton={() => (
            <RecordButton
              onTranscript={(transcript) => setTextInput(transcript)}
              onProcessed={(result) => {
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
              }}
              onRecordingChange={setIsRecording}
              disabled={processing}
              context={context}
              persona={selectedPersona}
            />
          )}
          renderChat={() => (
            <GeneralChat context={context} isCompact={ideas.length > 0} />
          )}
        />
      </section>

      <main id="main-content" className="main" role="main">

        {/* Error Display */}
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* WelcomeMessage entfernt - Hero-Section enthält bereits vollständige Begrüßung
            Die doppelte Anzeige wurde entfernt, da die Hero-Greeting permanent sichtbar ist
            und die WelcomeMessage nach 8 Sekunden verschwand */}

        {/* Quick Stats - Kompakte Statistik-Übersicht */}
        <QuickStats
          ideas={ideas}
          onFilterClick={(filterType, value) => {
            setFilters(prev => ({
              ...prev,
              [filterType]: prev[filterType] === value ? null : value,
            }));
          }}
        />

        {/* Integrierte Suche und Filter */}
        <SearchFilterBar
          filters={filters}
          onFilterChange={setFilters}
          onSearch={handleSearch}
          onClearSearch={clearSearch}
          isSearching={isSearching}
          searchResults={searchResults ? searchResults.length : null}
          counts={filterCounts}
        />

        {/* Ideas List */}
        <section className="ideas-section">
          <div className="section-header">
            <h2>
              {searchResults ? 'Suchergebnisse' : 'Deine Gedanken'}
              <span className="count">{filteredIdeas.length}</span>
            </h2>
            <div className="view-toggle" role="tablist" aria-label="Ansicht wählen">
              <button
                type="button"
                role="tab"
                className={viewMode === 'grid' ? 'active' : ''}
                onClick={() => setViewMode('grid')}
                title="Rasteransicht"
                aria-label="Rasteransicht"
                aria-selected={viewMode === 'grid' ? 'true' : 'false'}
                tabIndex={viewMode === 'grid' ? 0 : -1}
              >
                ⊞
              </button>
              <button
                type="button"
                role="tab"
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => setViewMode('list')}
                title="Listenansicht"
                aria-label="Listenansicht"
                aria-selected={viewMode === 'list' ? 'true' : 'false'}
                tabIndex={viewMode === 'list' ? 0 : -1}
              >
                ☰
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <SkeletonLoader type="card" count={3} />
            </div>
          ) : filteredIdeas.length === 0 ? (
            <div className="empty-state" role="status">
              {filters.type || filters.category || filters.priority ? (
                <>
                  <span className="empty-icon" aria-hidden="true">🔍</span>
                  <h3>{EMPTY_STATE_MESSAGES.search.title}</h3>
                  <p>{EMPTY_STATE_MESSAGES.search.description}</p>
                  <span className="empty-encouragement">{EMPTY_STATE_MESSAGES.search.encouragement}</span>
                  <div className="empty-state-actions">
                    <button
                      type="button"
                      className="empty-state-cta"
                      onClick={() => setFilters({ type: null, category: null, priority: null })}
                    >
                      Filter zurücksetzen
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="empty-avatar">{AI_AVATAR.emoji}</div>
                  <h3>{EMPTY_STATE_MESSAGES.ideas.title}</h3>
                  <p>{EMPTY_STATE_MESSAGES.ideas.description}</p>
                  <span className="empty-encouragement">{EMPTY_STATE_MESSAGES.ideas.encouragement}</span>
                  <div className="empty-ai-name">
                    <span>Ich bin {AI_PERSONALITY.name}, dein KI-Begleiter</span>
                  </div>
                  <div className="empty-state-actions">
                    <div className="empty-state-hint">
                      <span className="hint-icon">⌨️</span>
                      <span>Tippen &amp; <span className="hint-key">⌘</span><span className="hint-key">↵</span> zum Absenden</span>
                    </div>
                    <div className="empty-state-hint">
                      <span className="hint-icon">🎙️</span>
                      <span>Oder einfach sprechen</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <SmartIdeaList
              ideas={filteredIdeas}
              viewMode={viewMode}
              onIdeaClick={handleIdeaClick}
              onDelete={(id) => setIdeas(prev => prev.filter((i) => i.id !== id))}
              onArchive={handleArchive}
              context={context}
            />
          )}
        </section>
      </main>

      <footer className="footer" role="contentinfo">
        <div className="footer-content">
          <p className="footer-brand">ZenAI by ZenSation Enterprise Solutions</p>
          <p className="footer-copyright">&copy; {new Date().getFullYear()} Alexander Bering. All rights reserved.</p>
          <div className="footer-links">
            <a href="https://zensation.ai" target="_blank" rel="noopener noreferrer">zensation.ai</a>
            <span className="footer-divider">|</span>
            <a href="https://zensation.app" target="_blank" rel="noopener noreferrer">zensation.app</a>
            <span className="footer-divider">|</span>
            <a href="https://zensation.sh" target="_blank" rel="noopener noreferrer">zensation.sh</a>
          </div>
        </div>
      </footer>

      {/* Detail Modal */}
      {selectedIdea && (
        <IdeaDetail
          idea={selectedIdea}
          onClose={() => setSelectedIdea(null)}
          onNavigate={navigateToIdea}
        />
      )}

      {/* AI Processing Overlay - Shows transparent AI status */}
      {aiOverlay?.visible && (
        <AIProcessingOverlay
          isVisible={aiOverlay.visible}
          processType={aiOverlay.type}
          currentStepIndex={aiOverlay.step}
        />
      )}

      {/* Global Toast Notifications */}
      <ToastContainer />
    </div>
    </NeuroFeedbackProvider>
    </ErrorBoundary>
  );
}

export default App;
