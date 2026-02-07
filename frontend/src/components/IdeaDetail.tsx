import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { QuickFeedback, DraftFeedbackForm, FeedbackPrompt } from './DraftFeedback';
import { useContextState } from './ContextSwitcher';
import { logError } from '../utils/errors';
import '../neurodesign.css';
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
  onConvertToTask?: (idea: Idea) => void;
  onOpenInChat?: (idea: Idea) => void;
  onMarkComplete?: (idea: Idea) => void;
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

export function IdeaDetail({ idea, onClose, onNavigate, onConvertToTask, onOpenInChat, onMarkComplete }: IdeaDetailProps) {
  const [context] = useContextState();
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

  // Inline-Recherche
  const [researchResult, setResearchResult] = useState<string | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchType, setResearchType] = useState<string | null>(null);

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

  // Prevent body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

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
        logError('IdeaDetail:loadRelations', error);
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
        logError('IdeaDetail:loadSuggestions', error);
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
        logError('IdeaDetail:loadDraft', error);
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
        await axios.post(`/api/${context}/drafts/${draft.id}/copied`);
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
      showToast('Der Text konnte nicht kopiert werden. Versuch es noch mal.', 'error');
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
        logError('IdeaDetail:analyzeRelations', error);
        showToast('Die Analyse hat gerade nicht geklappt. Versuch es gleich noch mal.', 'error');
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

  // Inline-Recherche basierend auf Typ
  const performResearch = async (type: 'answer' | 'solve' | 'develop' | 'explore') => {
    setResearchLoading(true);
    setResearchType(type);
    setResearchResult(null);

    const signal = abortControllerRef.current?.signal;
    const context = localStorage.getItem('ai-context') || 'personal';

    // Typ-spezifische Prompts
    const prompts: Record<string, string> = {
      answer: `Beantworte diese Frage kurz und prägnant (max. 3-4 Sätze). Wenn nötig, gib 2-3 konkrete Tipps oder Links.

Frage: "${idea.title}"
Kontext: ${idea.summary}`,
      solve: `Gib 3 konkrete Lösungsvorschläge für dieses Problem (je 1-2 Sätze). Priorisiere praktische, sofort umsetzbare Ansätze.

Problem: "${idea.title}"
Details: ${idea.summary}`,
      develop: `Entwickle diese Idee weiter mit 3 konkreten nächsten Schritten und einem möglichen Ziel. Halte es kurz und actionable.

Idee: "${idea.title}"
Beschreibung: ${idea.summary}`,
      explore: `Erkläre diese Erkenntnis genauer und zeige 2-3 mögliche Anwendungen oder Konsequenzen auf.

Erkenntnis: "${idea.title}"
Details: ${idea.summary}`,
    };

    try {
      const response = await axios.post(
        `/api/chat/quick`,
        {
          message: prompts[type],
          context,
        },
        { signal }
      );

      if (!signal?.aborted && response.data?.response) {
        setResearchResult(response.data.response);
      }
    } catch (error) {
      if (!axios.isCancel(error)) {
        logError('IdeaDetail:research', error);
        showToast('Die Recherche hat nicht geklappt. Versuch es noch mal.', 'error');
      }
    } finally {
      if (!signal?.aborted) {
        setResearchLoading(false);
      }
    }
  };

  const typeInfo = typeLabels[idea.type] || { label: idea.type, icon: '📝' };

  return (
    <div className="idea-detail-overlay" onClick={onClose} role="presentation">
      <div
        className="idea-detail-modal liquid-glass neuro-human-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Idee Detail-Ansicht"
      >
        <button
          type="button"
          className="close-button neuro-press-effect neuro-focus-ring"
          onClick={onClose}
          aria-label="Detail-Ansicht schliessen"
        >
          ×
        </button>

        <div className="idea-detail-content">
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

        <h2 id="idea-detail-title" className="detail-title">{idea.title}</h2>

        {/* Typ-spezifische Aktionen */}
        <div className="detail-actions-bar">
          {/* Aufgabe: Erledigen + Entwurf */}
          {idea.type === 'task' && onMarkComplete && (
            <button
              type="button"
              className="action-btn action-complete neuro-button neuro-focus-ring"
              onClick={() => onMarkComplete(idea)}
            >
              ✓ Erledigt
            </button>
          )}

          {/* Idee: Weiterentwickeln + In Aufgabe */}
          {idea.type === 'idea' && (
            <>
              <button
                type="button"
                className="action-btn action-develop neuro-button neuro-focus-ring"
                onClick={() => performResearch('develop')}
                disabled={researchLoading}
              >
                {researchLoading && researchType === 'develop' ? '⏳ Denke nach...' : '🧠 Weiterentwickeln'}
              </button>
              {onConvertToTask && (
                <button
                  type="button"
                  className="action-btn action-convert neuro-button neuro-focus-ring"
                  onClick={() => onConvertToTask(idea)}
                >
                  ✅ In Aufgabe
                </button>
              )}
            </>
          )}

          {/* Frage: Antwort suchen */}
          {idea.type === 'question' && (
            <button
              type="button"
              className="action-btn action-answer neuro-button neuro-focus-ring"
              onClick={() => performResearch('answer')}
              disabled={researchLoading}
            >
              {researchLoading && researchType === 'answer' ? '⏳ Recherchiere...' : '🔍 Antwort suchen'}
            </button>
          )}

          {/* Problem: Lösungen finden + In Aufgabe */}
          {idea.type === 'problem' && (
            <>
              <button
                type="button"
                className="action-btn action-solve neuro-button neuro-focus-ring"
                onClick={() => performResearch('solve')}
                disabled={researchLoading}
              >
                {researchLoading && researchType === 'solve' ? '⏳ Analysiere...' : '💡 Lösungen finden'}
              </button>
              {onConvertToTask && (
                <button
                  type="button"
                  className="action-btn action-convert neuro-button neuro-focus-ring"
                  onClick={() => onConvertToTask(idea)}
                >
                  ✅ In Aufgabe
                </button>
              )}
            </>
          )}

          {/* Erkenntnis: Vertiefen */}
          {idea.type === 'insight' && (
            <button
              type="button"
              className="action-btn action-explore neuro-button neuro-focus-ring"
              onClick={() => performResearch('explore')}
              disabled={researchLoading}
            >
              {researchLoading && researchType === 'explore' ? '⏳ Erkunde...' : '🔎 Vertiefen'}
            </button>
          )}

          {/* Alle Typen: Im Chat vertiefen (optional) */}
          {onOpenInChat && (
            <button
              type="button"
              className="action-btn action-chat neuro-button neuro-focus-ring"
              onClick={() => onOpenInChat(idea)}
            >
              💬 Im Chat
            </button>
          )}
        </div>

        {/* Recherche-Ergebnis Anzeige */}
        {(researchLoading || researchResult) && (
          <div className="detail-section research-section">
            <h3>
              {researchLoading ? '⏳' : '✨'}{' '}
              {researchType === 'answer' && 'Antwort'}
              {researchType === 'solve' && 'Lösungsvorschläge'}
              {researchType === 'develop' && 'Weiterentwicklung'}
              {researchType === 'explore' && 'Vertiefung'}
            </h3>
            {researchLoading ? (
              <div className="research-loading">
                <div className="loading-spinner neuro-loading-spinner" />
                <span>Denke nach...</span>
              </div>
            ) : researchResult && (
              <div className="research-result">
                <p className="research-text">{researchResult}</p>
                <div className="research-actions">
                  <button
                    type="button"
                    className="research-copy-btn neuro-button neuro-focus-ring"
                    onClick={async () => {
                      await navigator.clipboard.writeText(researchResult);
                      showToast('Kopiert', 'success');
                    }}
                  >
                    📋 Kopieren
                  </button>
                  <button
                    type="button"
                    className="research-clear-btn neuro-button neuro-focus-ring"
                    onClick={() => setResearchResult(null)}
                  >
                    ✕ Schließen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="detail-section">
          <h3>Zusammenfassung</h3>
          <p id="idea-detail-summary" className="detail-summary">{idea.summary}</p>
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
                      className="expand-button neuro-press-effect neuro-focus-ring neuro-hover-lift"
                      onClick={() => setDraftExpanded(!draftExpanded)}
                      aria-expanded={draftExpanded}
                      aria-label={draftExpanded ? 'Entwurf einklappen' : 'Entwurf vollstaendig anzeigen'}
                    >
                      {draftExpanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`copy-button neuro-button neuro-focus-ring ${draftCopied ? 'copied success' : ''}`}
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
            <h3 id="next-steps-heading">Nächste Schritte</h3>
            <ul className="detail-steps" aria-labelledby="next-steps-heading">
              {idea.next_steps.map((step, i) => (
                <li key={i}>
                  <span className="step-number" aria-hidden="true">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ul>
          </div>
        )}

        {idea.context_needed && idea.context_needed.length > 0 && (
          <div className="detail-section">
            <h3 id="context-needed-heading">Benötigter Kontext</h3>
            <ul className="detail-context" aria-labelledby="context-needed-heading">
              {idea.context_needed.map((ctx, i) => (
                <li key={i}>{ctx}</li>
              ))}
            </ul>
          </div>
        )}

        {idea.keywords && idea.keywords.length > 0 && (
          <div className="detail-section">
            <h3 id="keywords-heading">Keywords</h3>
            <div className="detail-keywords" role="list" aria-labelledby="keywords-heading">
              {idea.keywords.map((kw, i) => (
                <span key={i} className="keyword-tag" role="listitem">
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
              type="button"
              className="analyze-button neuro-button neuro-focus-ring"
              onClick={analyzeRelations}
              disabled={analyzing}
              aria-label="Beziehungen zu anderen Gedanken analysieren"
            >
              {analyzing ? 'Analysiere...' : 'Beziehungen analysieren'}
            </button>
          </div>

          {loadingRelations ? (
            <div className="loading-indicator">Lade Verknüpfungen...</div>
          ) : relations.length > 0 ? (
            <div className="relations-list" role="list" aria-label="Verknuepfte Gedanken">
              {relations.map((rel, i) => (
                <div
                  key={i}
                  className="relation-item neuro-hover-lift neuro-press-effect"
                  onClick={() => onNavigate?.(rel.targetId)}
                  role="listitem"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onNavigate?.(rel.targetId)}
                  aria-label={`${relationLabels[rel.relationType] || rel.relationType}: ${rel.target_title || rel.targetId}`}
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
            <div className="suggestions-list" role="list" aria-label="Vorgeschlagene Verbindungen">
              {suggestions.slice(0, 3).map((sug) => (
                <div
                  key={sug.id}
                  className="suggestion-item neuro-hover-lift neuro-press-effect"
                  onClick={() => onNavigate?.(sug.id)}
                  role="listitem"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onNavigate?.(sug.id)}
                  aria-label={`${sug.title} - ${Math.round(sug.similarity * 100)}% aehnlich`}
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
        </div>{/* End of idea-detail-content */}
      </div>
    </div>
  );
}
