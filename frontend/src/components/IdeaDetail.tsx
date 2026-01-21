import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { QuickFeedback, DraftFeedbackForm, FeedbackPrompt } from './DraftFeedback';
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

interface Draft {
  id: string;
  ideaId: string;
  draftType: string;
  content: string;
  wordCount: number;
  status: string;
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

const draftTypeLabels: Record<string, { label: string; icon: string }> = {
  email: { label: 'E-Mail', icon: '📧' },
  article: { label: 'Artikel', icon: '📝' },
  proposal: { label: 'Angebot', icon: '📋' },
  document: { label: 'Dokument', icon: '📄' },
  generic: { label: 'Text', icon: '📃' },
};

export function IdeaDetail({ idea, onClose, onNavigate }: IdeaDetailProps) {
  const [relations, setRelations] = useState<Relation[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingRelations, setLoadingRelations] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Phase 25: Draft Support
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftExpanded, setDraftExpanded] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);

  // Phase 5: Draft Feedback
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  // ESC key handler for closing modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);

  // Data loading effect with AbortController
  useEffect(() => {
    // Create new AbortController for this effect
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    loadRelations(signal);
    loadSuggestions(signal);
    // Load draft for tasks
    if (idea.type === 'task') {
      loadDraft(signal);
    }

    return () => {
      // Abort all pending requests on cleanup
      abortControllerRef.current?.abort();
    };
  }, [idea.id]);

  const loadRelations = async (signal: AbortSignal) => {
    setLoadingRelations(true);
    try {
      const response = await axios.get(`/api/knowledge-graph/relations/${idea.id}`, { signal });
      if (!signal.aborted) {
        setRelations(response.data.relationships || []);
      }
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error('Failed to load relations:', error);
      }
      // Silent fail for relations - they're optional
    } finally {
      if (!signal.aborted) {
        setLoadingRelations(false);
      }
    }
  };

  const loadSuggestions = async (signal: AbortSignal) => {
    try {
      const response = await axios.get(`/api/knowledge-graph/suggestions/${idea.id}`, { signal });
      if (!signal.aborted) {
        setSuggestions(response.data.suggestions || []);
      }
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error('Failed to load suggestions:', error);
      }
      // Silent fail for suggestions - they're optional
    }
  };

  // Phase 25: Load draft for task
  const loadDraft = async (signal: AbortSignal) => {
    setLoadingDraft(true);
    try {
      const context = localStorage.getItem('ai-context') || 'personal';
      const response = await axios.get(`/api/${context}/ideas/${idea.id}/draft`, { signal });
      if (!signal.aborted && response.data.draft) {
        setDraft(response.data.draft);
      }
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error('Failed to load draft:', error);
      }
      // Silent fail - draft is optional
    } finally {
      if (!signal.aborted) {
        setLoadingDraft(false);
      }
    }
  };

  const copyDraft = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.content);
      setDraftCopied(true);
      showToast('In Zwischenablage kopiert', 'success');
      setTimeout(() => setDraftCopied(false), 2000);

      // Phase 5: Record copy and show feedback prompt after delay
      try {
        await axios.post(`/api/personal/drafts/${draft.id}/copied`);
        // Show feedback prompt after 3 seconds if not already given feedback
        if (!feedbackGiven) {
          setTimeout(() => {
            if (!abortControllerRef.current?.signal.aborted && !feedbackGiven) {
              setShowFeedbackPrompt(true);
            }
          }, 3000);
        }
      } catch (e) {
        // Ignore tracking errors
      }
    } catch (error) {
      showToast('Kopieren fehlgeschlagen', 'error');
    }
  };

  const analyzeRelations = async () => {
    setAnalyzing(true);
    const signal = abortControllerRef.current?.signal;
    try {
      await axios.post(`/api/knowledge-graph/analyze/${idea.id}`, {}, { signal });
      if (signal && !signal.aborted) {
        // Reload relations with current signal
        await loadRelations(signal);
        showToast('Beziehungen wurden analysiert', 'success');
      }
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error('Failed to analyze relations:', error);
        showToast('Analyse fehlgeschlagen', 'error');
      }
    } finally {
      if (!signal?.aborted) {
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

        {/* Phase 25: Draft Section for Tasks */}
        {idea.type === 'task' && (
          <div className="detail-section draft-section">
            <h3>
              {loadingDraft ? '⏳' : draft ? '✨' : '📝'} Entwurf
            </h3>
            {loadingDraft ? (
              <div className="loading-indicator">Lade Entwurf...</div>
            ) : draft ? (
              <div className="draft-content">
                <div className="draft-header">
                  <span className="draft-type">
                    {draftTypeLabels[draft.draftType]?.icon || '📄'}{' '}
                    {draftTypeLabels[draft.draftType]?.label || draft.draftType}
                  </span>
                  <span className="draft-word-count">{draft.wordCount} Wörter</span>
                </div>
                <div className={`draft-text ${draftExpanded ? 'expanded' : ''}`}>
                  {draftExpanded
                    ? draft.content
                    : draft.content.length > 300
                    ? draft.content.substring(0, 300) + '...'
                    : draft.content}
                </div>
                <div className="draft-actions">
                  {draft.content.length > 300 && (
                    <button
                      type="button"
                      className="expand-button"
                      onClick={() => setDraftExpanded(!draftExpanded)}
                    >
                      {draftExpanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`copy-button ${draftCopied ? 'copied' : ''}`}
                    onClick={copyDraft}
                  >
                    {draftCopied ? '✓ Kopiert' : '📋 Kopieren'}
                  </button>
                </div>

                {/* Phase 5: Feedback Section */}
                {!feedbackGiven ? (
                  <>
                    <QuickFeedback
                      draftId={draft.id}
                      onFeedbackSubmitted={() => setFeedbackGiven(true)}
                    />
                    <DraftFeedbackForm
                      draftId={draft.id}
                      draftType={draft.draftType}
                      wordCount={draft.wordCount}
                      onFeedbackSubmitted={() => setFeedbackGiven(true)}
                    />
                  </>
                ) : (
                  <div className="feedback-submitted-badge">
                    ✓ Feedback gegeben
                  </div>
                )}
              </div>
            ) : (
              <p className="no-draft">Kein Entwurf verfügbar für diese Aufgabe.</p>
            )}
          </div>
        )}

        {/* Phase 5: Feedback Prompt Popup */}
        {showFeedbackPrompt && draft && (
          <FeedbackPrompt
            draftId={draft.id}
            onDismiss={() => setShowFeedbackPrompt(false)}
            onFeedbackSubmitted={() => {
              setFeedbackGiven(true);
              setShowFeedbackPrompt(false);
            }}
          />
        )}

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
