import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { IdeaCard } from './components/IdeaCard';
import { RecordButton } from './components/RecordButton';
import { SearchBar } from './components/SearchBar';
import { Stats } from './components/Stats';
import { FilterBar, Filters } from './components/FilterBar';
import { IdeaDetail } from './components/IdeaDetail';
import { MeetingsPage } from './components/MeetingsPage';
import { ProfileDashboard } from './components/ProfileDashboard';
import { IntegrationsPage } from './components/IntegrationsPage';
import { IncubatorPage } from './components/IncubatorPage';
import { AIBrain } from './components/AIBrain';
import { ToastContainer, showToast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ContextSwitcher, useContextState } from './components/ContextSwitcher';
import { PersonaSelector, usePersonaState } from './components/PersonaSelector';
import { ExportMenu } from './components/ExportMenu';
import { NavDropdown } from './components/NavDropdown';
import './components/NavDropdown.css';
import KnowledgeGraphPage from './components/KnowledgeGraph/KnowledgeGraphPage';
import { LearningDashboard } from './components/LearningDashboard';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { AutomationDashboard } from './components/AutomationDashboard';
import { EvolutionDashboard } from './components/EvolutionDashboard';
import { NotificationsPage } from './components/NotificationsPage';
import { DigestDashboard } from './components/DigestDashboard';
import { PersonalizationChat } from './components/PersonalizationChat';
import { LearningTasksDashboard } from './components/LearningTasksDashboard';
import { MediaGallery } from './components/MediaGallery';
import { StoriesPage } from './components/StoriesPage';
import { ExportDashboard } from './components/ExportDashboard';
import { SyncDashboard } from './components/SyncDashboard';
import { ProactiveDashboard } from './components/ProactiveDashboard';
import { Onboarding } from './components/Onboarding';
import { safeLocalStorage } from './utils/storage';
import { getErrorMessage, logError } from './utils/errors';
import './App.css';

type Page = 'ideas' | 'archive' | 'meetings' | 'profile' | 'integrations' | 'incubator' | 'knowledge-graph' | 'learning' | 'analytics' | 'automations' | 'evolution' | 'notifications' | 'digest' | 'personalization' | 'learning-tasks' | 'media' | 'stories' | 'export' | 'sync' | 'proactive';

interface StructuredIdea {
  id: string;
  title: string;
  type: 'idea' | 'task' | 'insight' | 'problem' | 'question';
  category: 'business' | 'technical' | 'personal' | 'learning';
  priority: 'low' | 'medium' | 'high';
  summary: string;
  next_steps: string[];
  context_needed: string[];
  keywords: string[];
  raw_transcript?: string;
  created_at: string;
  updated_at?: string;
}

interface ApiStatus {
  database: boolean;
  ollama: boolean;
  models: string[];
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('ideas');
  const [ideas, setIdeas] = useState<StructuredIdea[]>([]);
  const [loading, setLoading] = useState(false);
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

  // Context state (personal/work)
  const [context, setContext] = useContextState();

  // Persona state (per context)
  const [selectedPersona, setSelectedPersona] = usePersonaState(context);

  // Determine AI activity state
  const isAIActive = processing || isSearching || isRecording || loading;
  const aiActivityType = isRecording ? 'transcribing' : isSearching ? 'searching' : loading ? 'thinking' : 'processing';

  // Dynamic, human greeting based on time and context
  const getHumanGreeting = () => {
    const hour = new Date().getHours();
    const hasIdeas = ideas.length > 0;

    if (!hasIdeas) {
      // First-time / empty state - welcoming
      if (hour >= 5 && hour < 12) {
        return { greeting: 'Guten Morgen! ☀️', subtext: 'Ein neuer Tag voller Möglichkeiten. Was geht dir durch den Kopf?' };
      } else if (hour >= 12 && hour < 17) {
        return { greeting: 'Hey, schön dich zu sehen!', subtext: 'Lass uns gemeinsam deine Gedanken sortieren und weiterentwickeln.' };
      } else if (hour >= 17 && hour < 21) {
        return { greeting: 'Guten Abend! 🌅', subtext: 'Zeit zum Reflektieren. Welche Ideen beschäftigen dich heute?' };
      } else {
        return { greeting: 'Noch wach? 🌙', subtext: 'Die besten Ideen kommen oft nachts. Ich bin hier, um zuzuhören.' };
      }
    } else {
      // Returning user with ideas
      if (hour >= 5 && hour < 12) {
        return { greeting: `Guten Morgen! ${ideas.length} Gedanken warten`, subtext: '' };
      } else if (hour >= 12 && hour < 17) {
        return { greeting: 'Willkommen zurück! 👋', subtext: '' };
      } else if (hour >= 17 && hour < 21) {
        return { greeting: 'Schön, dass du da bist!', subtext: '' };
      } else {
        return { greeting: 'Ich bin bereit, wenn du es bist', subtext: '' };
      }
    }
  };

  const humanGreeting = getHumanGreeting();

  // Check API health on mount and reload ideas when context changes
  useEffect(() => {
    const abortController = new AbortController();

    const loadData = async () => {
      await checkHealth(abortController.signal);
      await loadIdeas(abortController.signal);
      await loadArchivedCount(abortController.signal);
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
  useEffect(() => {
    if (currentPage !== 'ideas') return;

    const syncInterval = setInterval(async () => {
      try {
        // Silently check for updates
        const res = await axios.get(`/api/${context}/ideas`);
        const serverIdeas = res.data.ideas || [];

        // Only update if there are actual changes
        if (serverIdeas.length !== ideas.length) {
          setIdeas(serverIdeas);
        }
      } catch {
        // Silently fail on sync errors
      }
    }, 30000); // 30 seconds

    return () => clearInterval(syncInterval);
  }, [currentPage, context, ideas.length]);

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
      setIdeas(response.data.ideas);
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

  const handleArchive = (id: string) => {
    setIdeas(prev => prev.filter(i => i.id !== id));
    setArchivedCount(prev => prev + 1);
  };

  const handleRestore = (id: string) => {
    setArchivedIdeas(prev => {
      const restored = prev.find(i => i.id === id);
      if (restored) {
        setIdeas(prevIdeas => [restored, ...prevIdeas]);
        setArchivedCount(prevCount => Math.max(0, prevCount - 1));
        return prev.filter(i => i.id !== id);
      }
      return prev;
    });
  };

  const submitText = async () => {
    if (!textInput.trim()) return;

    setProcessing(true);
    setError(null);

    try {
      // Submit text to context-specific endpoint
      const response = await axios.post(`/api/${context}/voice-memo`, {
        text: textInput,
        persona: selectedPersona,
      });

      const newIdea: StructuredIdea = {
        id: response.data.ideaId,
        ...response.data.structured,
        created_at: new Date().toISOString(),
      };

      setIdeas(prev => [newIdea, ...prev]);
      setTextInput('');
      showToast('Gedanke erfolgreich strukturiert!', 'success');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      const errorMessage = axiosError.response?.data?.error || 'Verarbeitung fehlgeschlagen';
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      // Search within current context
      const response = await axios.post(`/api/${context}/ideas/search`, { query, limit: 20 });
      setSearchResults(response.data.ideas);
      if (response.data.ideas.length === 0) {
        showToast('Keine passenden Gedanken gefunden', 'info');
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      const errorMessage = axiosError.response?.data?.error || 'Suche fehlgeschlagen';
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchResults(null);
  };

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

  const handleIdeaClick = (idea: StructuredIdea) => {
    setSelectedIdea(idea);
  };

  const navigateToIdea = (ideaId: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (idea) {
      setSelectedIdea(idea);
    }
  };

  // Render sub-pages (all wrapped in ErrorBoundary for crash protection)
  if (currentPage === 'meetings') {
    return (
      <ErrorBoundary>
        <MeetingsPage onBack={() => setCurrentPage('ideas')} />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'profile') {
    return (
      <ErrorBoundary>
        <ProfileDashboard onBack={() => setCurrentPage('ideas')} context={context} />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'integrations') {
    return (
      <ErrorBoundary>
        <IntegrationsPage onBack={() => setCurrentPage('ideas')} />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'incubator') {
    return (
      <ErrorBoundary>
        <IncubatorPage
          onBack={() => setCurrentPage('ideas')}
          onIdeaCreated={() => {
            loadIdeas();
            setCurrentPage('ideas');
          }}
        />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'knowledge-graph') {
    return (
      <ErrorBoundary>
        <KnowledgeGraphPage
          onBack={() => setCurrentPage('ideas')}
          onSelectIdea={(ideaId) => {
            const idea = ideas.find(i => i.id === ideaId);
            if (idea) {
              setSelectedIdea(idea);
              setCurrentPage('ideas');
            }
          }}
        />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'learning') {
    return (
      <ErrorBoundary>
        <LearningDashboard
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'analytics') {
    return (
      <ErrorBoundary>
        <AnalyticsDashboard
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'automations') {
    return (
      <ErrorBoundary>
        <AutomationDashboard
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'evolution') {
    return (
      <ErrorBoundary>
        <EvolutionDashboard
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'notifications') {
    return (
      <ErrorBoundary>
        <NotificationsPage
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'digest') {
    return (
      <ErrorBoundary>
        <DigestDashboard
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'personalization') {
    return (
      <ErrorBoundary>
        <PersonalizationChat
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'learning-tasks') {
    return (
      <ErrorBoundary>
        <LearningTasksDashboard
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'media') {
    return (
      <ErrorBoundary>
        <MediaGallery
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'stories') {
    return (
      <ErrorBoundary>
        <StoriesPage
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'export') {
    return (
      <ErrorBoundary>
        <ExportDashboard
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'sync') {
    return (
      <ErrorBoundary>
        <SyncDashboard
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'proactive') {
    return (
      <ErrorBoundary>
        <ProactiveDashboard
          context={context}
          onBack={() => setCurrentPage('ideas')}
        />
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  if (currentPage === 'archive') {
    return (
      <ErrorBoundary>
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
              <div className="header-right">
                <ContextSwitcher context={context} onContextChange={setContext} />
              </div>
            </div>
          </header>
          <main className="main">
            <section className="ideas-section">
              <div className="section-header">
                <h2>Archivierte Gedanken</h2>
              </div>
              {loading ? (
                <div className="loading-state">
                  <div className="loading-spinner large" />
                  <p>Lade Archiv...</p>
                </div>
              ) : archivedIdeas.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📭</span>
                  <h3>Archiv ist leer</h3>
                  <p>Archivierte Gedanken erscheinen hier.</p>
                </div>
              ) : (
                <div className={`ideas-${viewMode}`}>
                  {archivedIdeas.map((idea) => (
                    <div key={idea.id} className="idea-wrapper">
                      <IdeaCard
                        idea={idea}
                        onDelete={(id) => setArchivedIdeas(prev => prev.filter((i) => i.id !== id))}
                        onRestore={handleRestore}
                        isArchived={true}
                        context={context}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>
        <ToastContainer />
      </ErrorBoundary>
    );
  }

  const handleOnboardingComplete = () => {
    safeLocalStorage('set', 'onboardingComplete', 'true');
    setShowOnboarding(false);
  };

  return (
    <ErrorBoundary>
    {showOnboarding && (
      <Onboarding context={context} onComplete={handleOnboardingComplete} />
    )}
    <div className="app" data-context={context}>
      {/* Animated Organic Background */}
      <div className="ambient-background" aria-hidden="true">
        <div className="blob-1" />
        <div className="blob-2" />
        <div className="blob-3" />
        <div className="blob-4" />
        {/* Floating Particles */}
        <div className="particle particle-1" />
        <div className="particle particle-2" />
        <div className="particle particle-3" />
        <div className="particle particle-4" />
        <div className="particle particle-5" />
        <div className="particle particle-6" />
      </div>

      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <AIBrain isActive={isAIActive} activityType={aiActivityType} ideasCount={ideas.length} />
            <h1>Personal AI Brain</h1>
            <ContextSwitcher context={context} onContextChange={setContext} />
          </div>
          <div className="header-center">
            <nav className="header-nav">
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
                  { label: 'Meetings', icon: '📅', page: 'meetings' },
                  { label: 'Medien', icon: '🖼️', page: 'media' },
                  { label: 'Stories', icon: '📖', page: 'stories' },
                  { label: 'Automationen', icon: '⚡', page: 'automations' },
                  { label: 'Integrationen', icon: '🔗', page: 'integrations' },
                  { label: 'Benachrichtigungen', icon: '🔔', page: 'notifications' },
                  { label: 'Export', icon: '📤', page: 'export' },
                  { label: 'Sync', icon: '🔄', page: 'sync' },
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
            <div className="status-indicators compact">
              <span
                className={`status-dot ${apiStatus?.database ? 'connected' : 'disconnected'}`}
                title={apiStatus?.database ? 'Datenbank verbunden' : 'Datenbank getrennt'}
              />
              <span
                className={`status-dot ${apiStatus?.ollama ? 'connected' : 'disconnected'}`}
                title={apiStatus?.ollama ? 'LLM verbunden' : 'LLM getrennt'}
              />
            </div>
            <button type="button" className="refresh-button" onClick={() => loadIdeas()} title="Neu laden">
              ↻
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section with Prominent AI Brain */}
      <section className={`hero-section ${ideas.length > 0 ? 'compact' : ''}`}>
        {/* Hero Sparkles */}
        <div className="hero-sparkle" aria-hidden="true" />
        <div className="hero-sparkle" aria-hidden="true" />
        <div className="hero-sparkle" aria-hidden="true" />
        <div className="hero-sparkle" aria-hidden="true" />
        <div className="hero-sparkle" aria-hidden="true" />
        <div className="hero-sparkle" aria-hidden="true" />

        {/* Large AI Brain */}
        <div className="hero-brain">
          <AIBrain
            isActive={isAIActive}
            activityType={aiActivityType}
            ideasCount={ideas.length}
            size="large"
          />
        </div>

        {/* Greeting - Human & Personal */}
        <h2 className="hero-greeting">
          {humanGreeting.greeting}
        </h2>
        {humanGreeting.subtext && (
          <p className="hero-subtext">
            {humanGreeting.subtext}
          </p>
        )}

        {/* Input Card - Integrated in Hero */}
        <div className="input-card">
          <div className="text-input-container">
            <label htmlFor="thought-input" className="visually-hidden">
              Neuer Gedanke eingeben
            </label>
            <textarea
              id="thought-input"
              className="text-input"
              placeholder="Was geht dir gerade durch den Kopf? Erzähl mir davon..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) {
                  submitText();
                }
              }}
              disabled={processing}
              rows={3}
              aria-describedby="input-hint"
            />
            <div className="input-actions">
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
              <button
                className="submit-button"
                onClick={submitText}
                disabled={processing || !textInput.trim()}
              >
                {processing ? (
                  <span className="loading-spinner" />
                ) : (
                  'Strukturieren'
                )}
              </button>
            </div>
          </div>
          <p id="input-hint" className="hint">Cmd + Enter zum Absenden | Mikrofon für Sprachaufnahme</p>
        </div>
      </section>

      <main className="main">

        {/* Error Display */}
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* Stats */}
        <Stats ideas={ideas} />

        {/* Search & Filter Section */}
        <section className="search-filter-section">
          <SearchBar onSearch={handleSearch} onClear={clearSearch} isSearching={isSearching} />
          {searchResults && (
            <div className="search-info">
              <span>{searchResults.length} Ergebnisse für semantische Suche</span>
              <button type="button" className="clear-search" onClick={clearSearch}>
                × Suche zurücksetzen
              </button>
            </div>
          )}
          <FilterBar filters={filters} onFilterChange={setFilters} counts={filterCounts} />
        </section>

        {/* Ideas List */}
        <section className="ideas-section">
          <div className="section-header">
            <h2>
              {searchResults ? 'Suchergebnisse' : 'Deine Gedanken'}
              <span className="count">{filteredIdeas.length}</span>
            </h2>
            <div className="view-toggle" role="group" aria-label="Ansicht wählen">
              <button
                type="button"
                className={viewMode === 'grid' ? 'active' : ''}
                onClick={() => setViewMode('grid')}
                title="Rasteransicht"
                aria-label="Rasteransicht"
                aria-pressed={viewMode === 'grid' ? 'true' : 'false'}
              >
                ⊞
              </button>
              <button
                type="button"
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => setViewMode('list')}
                title="Listenansicht"
                aria-label="Listenansicht"
                aria-pressed={viewMode === 'list' ? 'true' : 'false'}
              >
                ☰
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <div className="loading-spinner large" aria-hidden="true" />
              <p>Lade Ideen...</p>
            </div>
          ) : filteredIdeas.length === 0 ? (
            <div className="empty-state" role="status">
              <span className="empty-icon" aria-hidden="true">
                {filters.type || filters.category || filters.priority ? '🔍' : '✨'}
              </span>
              <h3>
                {filters.type || filters.category || filters.priority
                  ? 'Keine passenden Gedanken'
                  : 'Bereit für deinen ersten Gedanken'}
              </h3>
              <p>
                {filters.type || filters.category || filters.priority
                  ? 'Probiere andere Filter aus oder setze sie zurück, um alle Gedanken zu sehen.'
                  : 'Schreib einfach drauf los oder nutze das Mikrofon – dein AI Brain kümmert sich um den Rest.'}
              </p>
              {!(filters.type || filters.category || filters.priority) && (
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
              )}
            </div>
          ) : (
            <div className={`ideas-${viewMode}`} role="list" aria-label="Gedankenliste">
              {filteredIdeas.map((idea) => (
                <div
                  key={idea.id}
                  onClick={() => handleIdeaClick(idea)}
                  onKeyDown={(e) => e.key === 'Enter' && handleIdeaClick(idea)}
                  className="idea-wrapper"
                  role="listitem"
                  tabIndex={0}
                >
                  <IdeaCard
                    idea={idea}
                    onDelete={(id) => setIdeas(prev => prev.filter((i) => i.id !== id))}
                    onArchive={handleArchive}
                    context={context}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>Personal AI System • Lokal & Privat</p>
      </footer>

      {/* Detail Modal */}
      {selectedIdea && (
        <IdeaDetail
          idea={selectedIdea}
          onClose={() => setSelectedIdea(null)}
          onNavigate={navigateToIdea}
        />
      )}

      {/* Global Toast Notifications */}
      <ToastContainer />
    </div>
    </ErrorBoundary>
  );
}

export default App;
