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
import { ThemeToggle } from './components/ThemeToggle';
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
// === Neue konsolidierte Komponenten (2026) ===
const InsightsDashboard = lazy(() => import('./components/InsightsDashboard').then(m => ({ default: m.InsightsDashboard })));
const AIWorkshop = lazy(() => import('./components/AIWorkshop').then(m => ({ default: m.AIWorkshop })));

// === Haupt-Seiten ===
const ChatPage = lazy(() => import('./components/ChatPage').then(m => ({ default: m.ChatPage })));
const Onboarding = lazy(() => import('./components/Onboarding').then(m => ({ default: m.Onboarding })));

// === Sekundäre Seiten (via Mehr-Dropdown) ===
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

// === Triage (bleibt als separate Seite) ===
const InboxTriage = lazy(() => import('./components/InboxTriage').then(m => ({ default: m.InboxTriage })));

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

  // ============================================
  // KONSOLIDIERTE NAVIGATION 2026
  // Haupt-Tabs: ideas, chat, insights, archive
  // Sekundäre Seiten via "Mehr"-Dropdown
  // ============================================

  // === HAUPT-TABS ===

  // Chat - KI-Gespräche
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

  // Insights - Konsolidiertes Dashboard (Dashboard + Analytics + Digest + Graph)
  if (currentPage === 'insights') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <InsightsDashboard
            context={context}
            onBack={() => setCurrentPage('ideas')}
            onNavigate={(page) => setCurrentPage(page as Page)}
            onSelectIdea={(ideaId) => {
              const idea = ideas.find(i => i.id === ideaId);
              if (idea) {
                setSelectedIdea(idea);
                setCurrentPage('ideas');
              }
            }}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  // === LEGACY-WEITERLEITUNGEN zu Insights ===
  if (currentPage === 'dashboard' || currentPage === 'analytics' || currentPage === 'digest' || currentPage === 'knowledge-graph') {
    // Automatisch zu Insights weiterleiten mit passendem Tab
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <InsightsDashboard
            context={context}
            onBack={() => setCurrentPage('ideas')}
            onNavigate={(page) => setCurrentPage(page as Page)}
            onSelectIdea={(ideaId) => {
              const idea = ideas.find(i => i.id === ideaId);
              if (idea) {
                setSelectedIdea(idea);
                setCurrentPage('ideas');
              }
            }}
            initialTab={
              currentPage === 'analytics' ? 'analytics' :
              currentPage === 'digest' ? 'digest' :
              currentPage === 'knowledge-graph' ? 'connections' :
              'overview'
            }
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  // === KI-WERKSTATT (Inkubator + Proaktiv + Evolution) ===
  if (currentPage === 'ai-workshop') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <AIWorkshop
            context={context}
            onBack={() => setCurrentPage('ideas')}
            onIdeaCreated={() => {
              loadIdeas();
              setCurrentPage('ideas');
            }}
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  // Legacy-Weiterleitungen zu KI-Werkstatt
  if (currentPage === 'incubator' || currentPage === 'proactive' || currentPage === 'evolution') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <AIWorkshop
            context={context}
            onBack={() => setCurrentPage('ideas')}
            onIdeaCreated={() => {
              loadIdeas();
              setCurrentPage('ideas');
            }}
            initialTab={
              currentPage === 'proactive' ? 'proactive' :
              currentPage === 'evolution' ? 'evolution' :
              'incubator'
            }
          />
        </Suspense>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  // === SEKUNDÄRE SEITEN (via Mehr-Dropdown) ===

  // Lernen (mit integriertem Lernziele-Tab)
  if (currentPage === 'learning' || currentPage === 'learning-tasks') {
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

  // Triage - Gedanken sortieren
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

  // Meetings
  if (currentPage === 'meetings') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <MeetingsPage onBack={() => setCurrentPage('ideas')} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Profil
  if (currentPage === 'profile') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <ProfileDashboard onBack={() => setCurrentPage('ideas')} context={context} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Integrationen
  if (currentPage === 'integrations') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <IntegrationsPage onBack={() => setCurrentPage('ideas')} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Automationen
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

  // Benachrichtigungen
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

  // Personalisierung
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

  // Medien
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

  // Stories
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

  // Export
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

  // Sync
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
                {/* ZenAI Logo: macOS-style - Orange Brain on Dark Circle */}
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" className="zenai-logo-svg">
                  <defs>
                    <linearGradient id="zenLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffb347" />
                      <stop offset="40%" stopColor="#ff9f33" />
                      <stop offset="60%" stopColor="#ff8c00" />
                      <stop offset="100%" stopColor="#ff6347" />
                    </linearGradient>
                    <linearGradient id="zenLogoHighlight" x1="0%" y1="0%" x2="50%" y2="100%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </linearGradient>
                  </defs>
                  {/* Dark background circle with subtle border */}
                  <circle cx="50" cy="50" r="48" fill="#1a2634" />
                  <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  {/* Left hemisphere */}
                  <path
                    d="M30 50 C30 40, 33 32, 40 28 C44 26, 47 27, 49 30 C49 35, 47 40, 46 45 C45 50, 47 55, 45 60 C42 66, 38 68, 34 66 C30 63, 30 56, 30 50Z"
                    fill="url(#zenLogoGradient)"
                  />
                  <path
                    d="M33 45 C33 40, 35 35, 40 32 C43 31, 46 33, 46 37 C44 38, 40 38, 37 42 C34 45, 33 48, 33 45Z"
                    fill="url(#zenLogoHighlight)"
                  />
                  {/* Right hemisphere */}
                  <path
                    d="M70 50 C70 40, 67 32, 60 28 C56 26, 53 27, 51 30 C51 35, 53 40, 54 45 C55 50, 53 55, 55 60 C58 66, 62 68, 66 66 C70 63, 70 56, 70 50Z"
                    fill="url(#zenLogoGradient)"
                  />
                  <path
                    d="M67 45 C67 40, 65 35, 60 32 C57 31, 54 33, 54 37 C56 38, 60 38, 63 42 C66 45, 67 48, 67 45Z"
                    fill="url(#zenLogoHighlight)"
                  />
                  {/* Neural connections */}
                  <line x1="37" y1="40" x2="50" y2="50" stroke="#ff8c00" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                  <line x1="63" y1="40" x2="50" y2="50" stroke="#ff8c00" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                  <line x1="40" y1="60" x2="50" y2="50" stroke="#ff8c00" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                  <line x1="60" y1="60" x2="50" y2="50" stroke="#ff8c00" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                  {/* Neural nodes */}
                  <circle cx="37" cy="40" r="3" fill="#ff9f33" />
                  <circle cx="63" cy="40" r="3" fill="#ff9f33" />
                  <circle cx="40" cy="60" r="3" fill="#ff9f33" />
                  <circle cx="60" cy="60" r="3" fill="#ff9f33" />
                  <circle cx="50" cy="50" r="4" fill="#ffb347" />
                </svg>
                {/* AI status indicator */}
                <span className={`logo-status-dot ${isAIActive ? 'active' : ''}`} title={isAIActive ? `KI arbeitet: ${aiActivityType}` : 'KI bereit'} />
              </div>
              <span className="header-logo-text">ZenAI</span>
            </div>
          </div>
          <div className="header-center">
            {/* Konsolidierte Navigation 2026: 4 Haupt-Tabs + 1 Mehr-Dropdown */}
            <nav className="header-nav" aria-label="Hauptnavigation">
              {/* Haupt-Tab 1: Gedanken */}
              <button
                type="button"
                className={`nav-button neuro-focus-ring ${currentPage === 'ideas' ? 'active' : ''}`}
                onClick={() => setCurrentPage('ideas')}
                title="Deine Gedanken"
                aria-label="Gedanken: Deine Ideen und Notizen anzeigen"
                aria-current={currentPage === 'ideas' ? 'page' : undefined}
              >
                <span aria-hidden="true">💭</span> Gedanken
              </button>

              {/* Haupt-Tab 2: Chat */}
              <button
                type="button"
                className={`nav-button neuro-focus-ring ${(currentPage as Page) === 'chat' ? 'active' : ''}`}
                onClick={() => setCurrentPage('chat')}
                title="KI-Gespräche"
                aria-label="Chat: KI-Gespräche führen"
                aria-current={(currentPage as Page) === 'chat' ? 'page' : undefined}
              >
                <span aria-hidden="true">💬</span> Chat
              </button>

              {/* Haupt-Tab 3: Insights (konsolidiert Dashboard/Analytics/Digest/Graph) */}
              <button
                type="button"
                className={`nav-button neuro-focus-ring ${['insights', 'dashboard', 'analytics', 'digest', 'knowledge-graph'].includes(currentPage as string) ? 'active' : ''}`}
                onClick={() => setCurrentPage('insights')}
                title="Statistiken und Übersicht"
                aria-label="Insights: Statistiken, Analytics und Wissensübersicht"
                aria-current={['insights', 'dashboard', 'analytics', 'digest', 'knowledge-graph'].includes(currentPage as string) ? 'page' : undefined}
              >
                <span aria-hidden="true">📊</span> Insights
              </button>

              {/* Haupt-Tab 4: Archiv */}
              <button
                type="button"
                className={`nav-button neuro-focus-ring ${(currentPage as Page) === 'archive' ? 'active' : ''} ${archivedCount > 0 ? 'has-items' : ''}`}
                onClick={() => setCurrentPage('archive')}
                title="Archivierte Gedanken"
                aria-label={`Archiv: Archivierte Gedanken${archivedCount > 0 ? ` (${archivedCount} Einträge)` : ''}`}
                aria-current={(currentPage as Page) === 'archive' ? 'page' : undefined}
              >
                <span aria-hidden="true">📥</span> Archiv {archivedCount > 0 && <span className="badge" aria-hidden="true">{archivedCount}</span>}
              </button>

              {/* Mehr-Dropdown: Alle sekundären Features */}
              <NavDropdown
                label="Mehr"
                icon="⚙️"
                items={[
                  // KI-Features Gruppe
                  { label: 'KI-Werkstatt', icon: '🧠', page: 'ai-workshop', group: 'KI-Features' },
                  { label: 'Lernen', icon: '📚', page: 'learning', group: 'KI-Features' },
                  { label: 'Sortieren', icon: '📋', page: 'triage', group: 'KI-Features' },
                  { label: 'Personalisierung', icon: '🎨', page: 'personalization', group: 'KI-Features' },
                  // Inhalte Gruppe
                  { label: 'Meetings', icon: '📅', page: 'meetings', group: 'Inhalte' },
                  { label: 'Medien', icon: '🖼️', page: 'media', group: 'Inhalte' },
                  { label: 'Stories', icon: '📖', page: 'stories', group: 'Inhalte' },
                  // Einstellungen Gruppe
                  { label: 'Automationen', icon: '⚡', page: 'automations', group: 'Einstellungen' },
                  { label: 'Integrationen', icon: '🔗', page: 'integrations', group: 'Einstellungen' },
                  { label: 'Profil', icon: '👤', page: 'profile', group: 'Einstellungen' },
                  { label: 'Benachrichtigungen', icon: '🔔', page: 'notifications', group: 'Einstellungen' },
                  { label: 'Export', icon: '📤', page: 'export', group: 'Einstellungen' },
                  { label: 'Sync', icon: '🔄', page: 'sync', group: 'Einstellungen' },
                ]}
                currentPage={currentPage}
                onNavigate={(page) => setCurrentPage(page as Page)}
              />
              <ExportMenu context={context} ideasCount={ideas.length} />
            </nav>
          </div>
          <div className="header-right">
            <ThemeToggle className="compact" />
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
            <button type="button" className="refresh-button neuro-focus-ring" onClick={() => loadIdeas()} title="Neu laden" aria-label="Daten neu laden">
              <span aria-hidden="true">↻</span>
            </button>
            {/* Mobile Navigation - Konsolidiert 2026 */}
            <MobileNav
              currentPage={currentPage}
              onNavigate={(page) => setCurrentPage(page as Page)}
              archivedCount={archivedCount}
              navGroups={[
                {
                  label: 'KI-Features',
                  icon: '🧠',
                  items: [
                    { label: 'KI-Werkstatt', icon: '🧠', page: 'ai-workshop' },
                    { label: 'Lernen', icon: '📚', page: 'learning' },
                    { label: 'Sortieren', icon: '📋', page: 'triage' },
                    { label: 'Personalisierung', icon: '🎨', page: 'personalization' },
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
                  label: 'Einstellungen',
                  icon: '⚙️',
                  items: [
                    { label: 'Automationen', icon: '⚡', page: 'automations' },
                    { label: 'Integrationen', icon: '🔗', page: 'integrations' },
                    { label: 'Profil', icon: '👤', page: 'profile' },
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
                aria-selected={viewMode === 'grid'}
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
                aria-selected={viewMode === 'list'}
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

      {/* Vereinfachter Footer - Keine redundante Navigation */}
      <footer className="footer liquid-glass-nav" role="contentinfo">
        <div className="footer-content footer-minimal">
          <div className="footer-brand">
            <span className="footer-logo-icon">🧠</span>
            <span className="footer-logo-text">ZenAI</span>
            <span className="footer-separator">•</span>
            <span className="footer-tagline">Dein intelligenter Gedanken-Assistent</span>
          </div>
          <div className="footer-links">
            <a href="https://zensation.ai" target="_blank" rel="noopener noreferrer">zensation.ai</a>
            <span className="footer-dot">·</span>
            <a href="https://zensation.app" target="_blank" rel="noopener noreferrer">zensation.app</a>
          </div>
          <div className="footer-meta">
            <span className="footer-copyright">© {new Date().getFullYear()} ZenSation</span>
            <span className="footer-version">v2026.1</span>
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
