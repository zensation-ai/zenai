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
import KnowledgeGraphPage from './components/KnowledgeGraph/KnowledgeGraphPage';
import { LearningDashboard } from './components/LearningDashboard';
import { Onboarding } from './components/Onboarding';
import { safeLocalStorage } from './utils/storage';
import './App.css';

type Page = 'ideas' | 'archive' | 'meetings' | 'profile' | 'integrations' | 'incubator' | 'knowledge-graph' | 'learning';

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

  // Check API health on mount and reload ideas when context changes
  useEffect(() => {
    checkHealth();
    loadIdeas();
    loadArchivedCount();
  }, [context]);

  // Load archived ideas when switching to archive page
  useEffect(() => {
    if (currentPage === 'archive') {
      loadArchivedIdeas();
    }
  }, [currentPage, context]);

  const checkHealth = async () => {
    try {
      const response = await axios.get('/api/health');
      // Support both old (database) and new (databases) format
      const databases = response.data.services.databases;
      const dbConnected = databases
        ? (databases.personal?.status === 'connected' || databases.work?.status === 'connected')
        : response.data.services.database?.status === 'connected';

      // AI services are under services.ai (not services.ollama directly)
      const aiServices = response.data.services.ai;
      const ollamaConnected = aiServices?.ollama?.status === 'connected';
      const ollamaModels = aiServices?.ollama?.models || [];

      setApiStatus({
        database: dbConnected,
        ollama: ollamaConnected,
        models: ollamaModels,
      });
    } catch (err) {
      setApiStatus({ database: false, ollama: false, models: [] });
    }
  };

  const loadIdeas = async () => {
    setLoading(true);
    try {
      // Load ideas for the current context
      const response = await axios.get(`/api/${context}/ideas?limit=100`);
      setIdeas(response.data.ideas);
      setError(null);
    } catch (err: unknown) {
      // Fallback to general endpoint if context-specific fails
      try {
        const fallbackResponse = await axios.get('/api/ideas?limit=100');
        setIdeas(fallbackResponse.data.ideas);
        setError(null);
      } catch (fallbackErr: unknown) {
        const axiosError = fallbackErr as { response?: { data?: { error?: string } } };
        setError(axiosError.response?.data?.error || 'Failed to load ideas');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadArchivedIdeas = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/${context}/ideas/archived?limit=100`);
      setArchivedIdeas(response.data.ideas);
      setArchivedCount(response.data.pagination.total);
    } catch (err) {
      console.error('Failed to load archived ideas:', err);
      setArchivedIdeas([]);
    } finally {
      setLoading(false);
    }
  };

  const loadArchivedCount = async () => {
    try {
      const response = await axios.get(`/api/${context}/ideas/archived?limit=1`);
      setArchivedCount(response.data.pagination.total);
    } catch (err) {
      setArchivedCount(0);
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
        <ProfileDashboard onBack={() => setCurrentPage('ideas')} />
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
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <AIBrain isActive={isAIActive} activityType={aiActivityType} ideasCount={ideas.length} />
            <h1>Personal AI Brain</h1>
            <span className="version-badge">v1.0</span>
            <ContextSwitcher context={context} onContextChange={setContext} />
            <PersonaSelector
              context={context}
              selectedPersona={selectedPersona}
              onPersonaChange={setSelectedPersona}
            />
          </div>
          <div className="header-right">
            <nav className="header-nav">
              <button
                type="button"
                className={`nav-button archive-nav ${archivedCount > 0 ? 'has-items' : ''}`}
                onClick={() => setCurrentPage('archive')}
                title="Archiv"
              >
                📥 Archiv {archivedCount > 0 && <span className="badge">{archivedCount}</span>}
              </button>
              <button
                type="button"
                className="nav-button incubator-nav"
                onClick={() => setCurrentPage('incubator')}
                title="Gedanken-Inkubator"
              >
                🧠 Inkubator
              </button>
              <button
                type="button"
                className="nav-button graph-nav"
                onClick={() => setCurrentPage('knowledge-graph')}
                title="Knowledge Graph"
              >
                🕸️ Graph
              </button>
              <button
                type="button"
                className="nav-button"
                onClick={() => setCurrentPage('meetings')}
                title="Meetings"
              >
                📅 Meetings
              </button>
              <button
                type="button"
                className="nav-button"
                onClick={() => setCurrentPage('learning')}
                title="KI-Lernzentrum"
              >
                🧬 Lernen
              </button>
              <button
                type="button"
                className="nav-button"
                onClick={() => setCurrentPage('profile')}
                title="Profil"
              >
                👤 Profil
              </button>
              <button
                type="button"
                className="nav-button"
                onClick={() => setCurrentPage('integrations')}
                title="Integrationen"
              >
                ⚙️ Integrationen
              </button>
              <ExportMenu context={context} ideasCount={ideas.length} />
            </nav>
            <div className="status-indicators">
              <span
                className={`status-dot ${apiStatus?.database ? 'connected' : 'disconnected'}`}
                title={apiStatus?.database ? 'Datenbank verbunden' : 'Datenbank getrennt'}
              >
                DB
              </span>
              <span
                className={`status-dot ${apiStatus?.ollama ? 'connected' : 'disconnected'}`}
                title={apiStatus?.ollama ? 'Ollama verbunden' : 'Ollama getrennt'}
              >
                LLM
              </span>
            </div>
            <button type="button" className="refresh-button" onClick={loadIdeas} title="Neu laden">
              ↻
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Input Section */}
        <section className="input-section">
          <div className="input-card">
            <h2>Neuer Gedanke</h2>
            <div className="text-input-container">
              <label htmlFor="thought-input" className="visually-hidden">
                Neuer Gedanke eingeben
              </label>
              <textarea
                id="thought-input"
                className="text-input"
                placeholder="Beschreibe deine Idee, Aufgabe oder Frage..."
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
              <span className="empty-icon" aria-hidden="true">💭</span>
              <h3>Keine Gedanken gefunden</h3>
              <p>
                {filters.type || filters.category || filters.priority
                  ? 'Versuche andere Filter oder setze sie zurück.'
                  : 'Tippe oben etwas ein oder nimm ein Sprachmemo auf!'}
              </p>
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
