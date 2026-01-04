import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { IdeaCard } from './components/IdeaCard';
import { RecordButton } from './components/RecordButton';
import { SearchBar } from './components/SearchBar';
import { Stats } from './components/Stats';
import './App.css';

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
  created_at: string;
}

interface ApiStatus {
  database: boolean;
  ollama: boolean;
  models: string[];
}

function App() {
  const [ideas, setIdeas] = useState<StructuredIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [textInput, setTextInput] = useState('');
  const [searchResults, setSearchResults] = useState<StructuredIdea[] | null>(null);

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
      const response = await axios.get('/api/ideas?limit=50');
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

      // Add new idea to the list
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
      const response = await axios.post('/api/ideas/search', { query, limit: 10 });
      setSearchResults(response.data.ideas);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Search failed');
    }
  };

  const clearSearch = () => {
    setSearchResults(null);
  };

  const displayedIdeas = searchResults || ideas;

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>Personal AI Brain</h1>
          <div className="status-indicators">
            <span className={`status-dot ${apiStatus?.database ? 'connected' : 'disconnected'}`}>
              DB
            </span>
            <span className={`status-dot ${apiStatus?.ollama ? 'connected' : 'disconnected'}`}>
              Ollama
            </span>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Input Section */}
        <section className="input-section">
          <div className="text-input-container">
            <textarea
              className="text-input"
              placeholder="Tippe deine Gedanken ein... (z.B. 'Ich habe eine Idee für ein RAG-System für PV-Dokumentation')"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) {
                  submitText();
                }
              }}
              disabled={processing}
            />
            <button
              className="submit-button"
              onClick={submitText}
              disabled={processing || !textInput.trim()}
            >
              {processing ? 'Verarbeite...' : 'Strukturieren'}
            </button>
          </div>
          <p className="hint">Cmd+Enter zum Absenden</p>

          <RecordButton
            onTranscript={(transcript) => {
              setTextInput(transcript);
            }}
            onProcessed={(result) => {
              // Add new idea directly from voice recording
              const newIdea: StructuredIdea = {
                id: result.ideaId,
                ...result.structured,
                next_steps: [],
                context_needed: [],
                keywords: [],
                created_at: new Date().toISOString(),
              } as StructuredIdea;
              setIdeas([newIdea, ...ideas]);
              setTextInput(''); // Clear any text in input
            }}
            disabled={processing}
          />
        </section>

        {/* Search Section */}
        <section className="search-section">
          <SearchBar onSearch={handleSearch} onClear={clearSearch} />
          {searchResults && (
            <p className="search-info">
              {searchResults.length} Ergebnisse gefunden
              <button className="clear-search" onClick={clearSearch}>
                Suche zurücksetzen
              </button>
            </p>
          )}
        </section>

        {/* Error Display */}
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>Schließen</button>
          </div>
        )}

        {/* Stats */}
        <Stats ideas={ideas} />

        {/* Ideas List */}
        <section className="ideas-section">
          <h2>
            {searchResults ? 'Suchergebnisse' : 'Deine Gedanken'}{' '}
            <span className="count">({displayedIdeas.length})</span>
          </h2>

          {loading ? (
            <div className="loading">Lade Ideen...</div>
          ) : displayedIdeas.length === 0 ? (
            <div className="empty-state">
              <p>Noch keine Gedanken erfasst.</p>
              <p>Tippe oben etwas ein oder nimm ein Sprachmemo auf!</p>
            </div>
          ) : (
            <div className="ideas-grid">
              {displayedIdeas.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} onDelete={(id) => {
                  setIdeas(ideas.filter(i => i.id !== id));
                }} />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>Personal AI System - Lokal & Privat</p>
      </footer>
    </div>
  );
}

export default App;
