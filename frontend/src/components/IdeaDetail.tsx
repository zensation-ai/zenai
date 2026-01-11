import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import './IdeaDetail.css';

interface Idea {
  id: string;
  title: string;
  type: string;
  category: string;
  priority: string;
  summary: string;
  next_steps: string[];
  context_needed: string[];
  keywords: string[];
  raw_transcript?: string;
  created_at: string;
  updated_at?: string;
}

interface Relation {
  sourceId: string;
  targetId: string;
  relationType: string;
  strength: number;
  reason: string;
  target_title?: string;
  target_summary?: string;
}

interface Suggestion {
  id: string;
  title: string;
  summary: string;
  similarity: number;
}

interface IdeaDetailProps {
  idea: Idea;
  onClose: () => void;
  onNavigate?: (ideaId: string) => void;
}

const typeLabels: Record<string, { label: string; icon: string }> = {
  idea: { label: 'Idee', icon: '💡' },
  task: { label: 'Aufgabe', icon: '✅' },
  insight: { label: 'Erkenntnis', icon: '🔍' },
  problem: { label: 'Problem', icon: '⚠️' },
  question: { label: 'Frage', icon: '❓' },
};

const categoryLabels: Record<string, string> = {
  business: 'Business',
  technical: 'Technik',
  personal: 'Persönlich',
  learning: 'Lernen',
};

const priorityLabels: Record<string, string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
};

const relationLabels: Record<string, string> = {
  similar_to: 'Ähnlich zu',
  builds_on: 'Baut auf',
  supports: 'Unterstützt',
  enables: 'Ermöglicht',
  related_tech: 'Verwandte Technologie',
  contradicts: 'Widerspricht',
  part_of: 'Teil von',
};

export function IdeaDetail({ idea, onClose, onNavigate }: IdeaDetailProps) {
  const [relations, setRelations] = useState<Relation[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingRelations, setLoadingRelations] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    loadRelations();
    loadSuggestions();
    return () => {
      isMountedRef.current = false;
    };
  }, [idea.id]);

  const loadRelations = async () => {
    setLoadingRelations(true);
    try {
      const response = await axios.get(`/api/knowledge-graph/relations/${idea.id}`);
      if (isMountedRef.current) {
        setRelations(response.data.relationships || []);
      }
    } catch (error) {
      console.error('Failed to load relations:', error);
      // Silent fail for relations - they're optional
    } finally {
      if (isMountedRef.current) {
        setLoadingRelations(false);
      }
    }
  };

  const loadSuggestions = async () => {
    try {
      const response = await axios.get(`/api/knowledge-graph/suggestions/${idea.id}`);
      if (isMountedRef.current) {
        setSuggestions(response.data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error);
      // Silent fail for suggestions - they're optional
    }
  };

  const analyzeRelations = async () => {
    setAnalyzing(true);
    try {
      await axios.post(`/api/knowledge-graph/analyze/${idea.id}`);
      await loadRelations();
      if (isMountedRef.current) {
        showToast('Beziehungen wurden analysiert', 'success');
      }
    } catch (error) {
      console.error('Failed to analyze relations:', error);
      if (isMountedRef.current) {
        showToast('Analyse fehlgeschlagen', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setAnalyzing(false);
      }
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const typeInfo = typeLabels[idea.type] || { label: idea.type, icon: '📝' };

  return (
    <div className="idea-detail-overlay" onClick={onClose}>
      <div className="idea-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>
          ×
        </button>

        <div className="detail-header">
          <span className="detail-type-icon">{typeInfo.icon}</span>
          <div className="detail-type-info">
            <span className="detail-type-label">{typeInfo.label}</span>
            <span className="detail-category">{categoryLabels[idea.category]}</span>
          </div>
          <span className={`detail-priority priority-${idea.priority}`}>
            {priorityLabels[idea.priority]}
          </span>
        </div>

        <h2 className="detail-title">{idea.title}</h2>

        <div className="detail-section">
          <h3>Zusammenfassung</h3>
          <p className="detail-summary">{idea.summary}</p>
        </div>

        {idea.next_steps && idea.next_steps.length > 0 && (
          <div className="detail-section">
            <h3>Nächste Schritte</h3>
            <ul className="detail-steps">
              {idea.next_steps.map((step, i) => (
                <li key={i}>
                  <span className="step-number">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ul>
          </div>
        )}

        {idea.context_needed && idea.context_needed.length > 0 && (
          <div className="detail-section">
            <h3>Benötigter Kontext</h3>
            <ul className="detail-context">
              {idea.context_needed.map((ctx, i) => (
                <li key={i}>{ctx}</li>
              ))}
            </ul>
          </div>
        )}

        {idea.keywords && idea.keywords.length > 0 && (
          <div className="detail-section">
            <h3>Keywords</h3>
            <div className="detail-keywords">
              {idea.keywords.map((kw, i) => (
                <span key={i} className="keyword-tag">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {idea.raw_transcript && (
          <div className="detail-section">
            <h3>Original-Transkript</h3>
            <blockquote className="detail-transcript">{idea.raw_transcript}</blockquote>
          </div>
        )}

        {/* Knowledge Graph Section */}
        <div className="detail-section knowledge-section">
          <div className="section-header">
            <h3>🔗 Verknüpfungen</h3>
            <button
              className="analyze-button"
              onClick={analyzeRelations}
              disabled={analyzing}
            >
              {analyzing ? 'Analysiere...' : 'Beziehungen analysieren'}
            </button>
          </div>

          {loadingRelations ? (
            <div className="loading-indicator">Lade Verknüpfungen...</div>
          ) : relations.length > 0 ? (
            <div className="relations-list">
              {relations.map((rel, i) => (
                <div
                  key={i}
                  className="relation-item"
                  onClick={() => onNavigate?.(rel.targetId)}
                >
                  <span className="relation-type">{relationLabels[rel.relationType]}</span>
                  <span className="relation-target">{rel.target_title || rel.targetId}</span>
                  <span className="relation-strength">
                    {Math.round(rel.strength * 100)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-relations">
              Noch keine Verknüpfungen. Klicke "Beziehungen analysieren" um Verbindungen zu finden.
            </p>
          )}
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="detail-section">
            <h3>💡 Vorgeschlagene Verbindungen</h3>
            <div className="suggestions-list">
              {suggestions.slice(0, 3).map((sug) => (
                <div
                  key={sug.id}
                  className="suggestion-item"
                  onClick={() => onNavigate?.(sug.id)}
                >
                  <span className="suggestion-title">{sug.title}</span>
                  <span className="suggestion-similarity">
                    {Math.round(sug.similarity * 100)}% ähnlich
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="detail-footer">
          <span className="detail-date">Erstellt: {formatDate(idea.created_at)}</span>
          {idea.updated_at && idea.updated_at !== idea.created_at && (
            <span className="detail-date">Aktualisiert: {formatDate(idea.updated_at)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
