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
import './App.css';

type Page = 'ideas' | 'meetings' | 'profile' | 'integrations';

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

  // Check API health on mount
  useEffect(() => {
    checkHealth();
    loadIdeas();
  }, []);

  const checkHealth = async () => {
    try {
      const response = await axios.get('/api/health');
      setApiStatus({
        database: response.data.services.database.status === 'connected',
        ollama: response.data.services.ollama.status === 'connected',
        models: response.data.services.ollama.models || [],
      });
    } catch (err) {
      setApiStatus({ database: false, ollama: false, models: [] });
    }
  };

  const loadIdeas = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/ideas?limit=100');
      setIdeas(response.data.ideas);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load ideas');
    } finally {
      setLoading(false);
    }
  };

  const submitText = async () => {
    if (!textInput.trim()) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await axios.post('/api/voice-memo/text', {
        text: textInput,
      });

      const newIdea: StructuredIdea = {
        id: response.data.ideaId,
        ...response.data.structured,
        created_at: new Date().toISOString(),
      };

      setIdeas([newIdea, ...ideas]);
      setTextInput('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to process text');
    } finally {
      setProcessing(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    try {
      const response = await axios.post('/api/ideas/search', { query, limit: 20 });
      setSearchResults(response.data.ideas);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Search failed');
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

  // Render sub-pages
  if (currentPage === 'meetings') {
    return <MeetingsPage onBack={() => setCurrentPage('ideas')} />;
  }

  if (currentPage === 'profile') {
    return <ProfileDashboard onBack={() => setCurrentPage('ideas')} />;
  }

  if (currentPage === 'integrations') {
    return <IntegrationsPage onBack={() => setCurrentPage('ideas')} />;
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <h1>Personal AI Brain</h1>
            <span className="version-badge">v1.0</span>
          </div>
          <div className="header-right">
            <nav className="header-nav">
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
              <textarea
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
                    setIdeas([newIdea, ...ideas]);
                    setTextInput('');
                  }}
                  disabled={processing}
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
            <p className="hint">Cmd + Enter zum Absenden | Mikrofon für Sprachaufnahme</p>
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
          <SearchBar onSearch={handleSearch} onClear={clearSearch} />
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
            <div className="view-toggle">
              <button
                type="button"
                className={viewMode === 'grid' ? 'active' : ''}
                onClick={() => setViewMode('grid')}
                title="Rasteransicht"
              >
                ⊞
              </button>
              <button
                type="button"
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => setViewMode('list')}
                title="Listenansicht"
              >
                ☰
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner large" />
              <p>Lade Ideen...</p>
            </div>
          ) : filteredIdeas.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">💭</span>
              <h3>Keine Gedanken gefunden</h3>
              <p>
                {filters.type || filters.category || filters.priority
                  ? 'Versuche andere Filter oder setze sie zurück.'
                  : 'Tippe oben etwas ein oder nimm ein Sprachmemo auf!'}
              </p>
            </div>
          ) : (
            <div className={`ideas-${viewMode}`}>
              {filteredIdeas.map((idea) => (
                <div key={idea.id} onClick={() => handleIdeaClick(idea)} className="idea-wrapper">
                  <IdeaCard
                    idea={idea}
                    onDelete={(id) => setIdeas(ideas.filter((i) => i.id !== id))}
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
    </div>
  );
}

export default App;
