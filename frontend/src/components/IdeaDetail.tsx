import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { QuickFeedback, DraftFeedbackForm, FeedbackPrompt } from './DraftFeedback';
import { AIContext, useContextState, getContextLabel } from './ContextSwitcher';
import { ContextPickerDialog } from './ContextPickerDialog';
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
  onMove?: (id: string, targetContext: AIContext) => void;
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

const draftTypeLabels: Record<string, { label: string; icon: string; sectionTitle: string }> = {
  // Writing-Typen
  email: { label: 'E-Mail', icon: '📧', sectionTitle: 'Entwurf' },
  article: { label: 'Artikel', icon: '📝', sectionTitle: 'Entwurf' },
  proposal: { label: 'Angebot', icon: '📋', sectionTitle: 'Entwurf' },
  document: { label: 'Dokument', icon: '📄', sectionTitle: 'Entwurf' },
  generic: { label: 'Text', icon: '📃', sectionTitle: 'Entwurf' },
  // Smart Content Typen
  reading: { label: 'Leseinhalt', icon: '📚', sectionTitle: 'Vorbereitet von deiner KI' },
  research: { label: 'Recherche', icon: '🔬', sectionTitle: 'Recherche-Ergebnis' },
  learning: { label: 'Lernmaterial', icon: '🎓', sectionTitle: 'Lernmaterial' },
  plan: { label: 'Plan', icon: '📋', sectionTitle: 'Plan' },
  analysis: { label: 'Analyse', icon: '📊', sectionTitle: 'Analyse' },
};

export function IdeaDetail({ idea, onClose, onNavigate, onConvertToTask, onOpenInChat, onMarkComplete, onMove }: IdeaDetailProps) {
  const [context] = useContextState();
  const [relations, setRelations] = useState<Relation[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingRelations, setLoadingRelations] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Move to other context
  const [isMoving, setIsMoving] = useState(false);
  const [showContextPicker, setShowContextPicker] = useState(false);

  // Phase 25: Draft / Smart Content Support
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftExpanded, setDraftExpanded] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);

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
    // Load draft / smart content for all task types
    loadDraft(signal);

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

  // Smart Content generieren (On-Demand oder Regenerieren)
  const generateSmartContent = async (forceRegenerate = false) => {
    setGeneratingDraft(true);
    const signal = abortControllerRef.current?.signal;
    try {
      const response = await axios.post(
        `/api/${context}/ideas/${idea.id}/draft`,
        {
          forceRegenerate,
          title: idea.title,
          summary: idea.summary,
          rawTranscript: idea.raw_transcript,
          keywords: idea.keywords,
          type: idea.type,
          category: idea.category,
        },
        { signal }
      );
      if (!signal?.aborted && response.data.draft) {
        setDraft(response.data.draft);
        setDraftExpanded(false);
        if (forceRegenerate) {
          showToast('Inhalt wurde neu generiert', 'success');
        }
      } else if (!signal?.aborted && !response.data.success) {
        showToast('Für diese Aufgabe konnte kein Inhalt generiert werden.', 'info');
      }
    } catch (error) {
      if (!axios.isCancel(error)) {
        logError('IdeaDetail:generateSmartContent', error);
        showToast('Generierung fehlgeschlagen. Versuch es gleich noch mal.', 'error');
      }
    } finally {
      if (!signal?.aborted) {
        setGeneratingDraft(false);
      }
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

      if (!signal?.aborted && response.data?.assistantMessage) {
        setResearchResult(response.data.assistantMessage.content);
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

  const handleMove = async (targetContext: AIContext) => {
    setShowContextPicker(false);
    setIsMoving(true);
    try {
      await axios.post(
        `/api/${context}/ideas/${idea.id}/move`,
        { targetContext }
      );
      showToast(`Verschoben nach ${getContextLabel(targetContext)}`, 'success');
      if (onMove) onMove(idea.id, targetContext);
      onClose();
    } catch (err) {
      logError('IdeaDetail.handleMove', err);
      showToast('Verschieben fehlgeschlagen', 'error');
    } finally {
      setIsMoving(false);
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

          {/* Alle Typen: In anderen Kontext verschieben */}
          {onMove && (
            <button
              type="button"
              className="action-btn action-move neuro-button neuro-focus-ring"
              onClick={() => setShowContextPicker(true)}
              disabled={isMoving}
            >
              {isMoving ? '...' : '↔ Verschieben'}
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

        {/* Smart Content / Draft Section - alle Typen */}
        {(draft || loadingDraft || generatingDraft || idea.type === 'task') && (
          <div className={`detail-section draft-section ${draft ? `draft-type-${draft.draftType}` : ''}`}>
            <div className="smart-content-header">
              <h3>
                {(loadingDraft || generatingDraft) ? '⏳' : draft ? (draftTypeLabels[draft.draftType]?.icon || '✨') : '📝'}{' '}
                {draft ? (draftTypeLabels[draft.draftType]?.sectionTitle || 'Entwurf') : 'Vorbereitet von deiner KI'}
              </h3>
              {draft && (
                <button
                  type="button"
                  className="regenerate-button neuro-button neuro-focus-ring"
                  onClick={() => generateSmartContent(true)}
                  disabled={generatingDraft}
                  aria-label="Inhalt neu generieren"
                  title="Inhalt neu generieren"
                >
                  {generatingDraft ? '⏳' : '⟳'} Neu
                </button>
              )}
            </div>
            {(loadingDraft || generatingDraft) ? (
              <div className="loading-indicator">
                <div className="loading-spinner neuro-loading-spinner" />
                {generatingDraft ? 'Deine KI bereitet Inhalte vor...' : 'Lade...'}
              </div>
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
                      aria-label={draftExpanded ? 'Einklappen' : 'Vollstaendig anzeigen'}
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

                {/* Feedback Section */}
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
              <div className="no-draft-container">
                <p className="no-draft">Deine KI hat noch nichts vorbereitet.</p>
                <button
                  type="button"
                  className="generate-button neuro-button neuro-focus-ring"
                  onClick={() => generateSmartContent(false)}
                  disabled={generatingDraft}
                >
                  {generatingDraft ? '⏳ Wird generiert...' : '✨ Jetzt vorbereiten lassen'}
                </button>
              </div>
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

      <ContextPickerDialog
        isOpen={showContextPicker}
        currentContext={context}
        onSelect={handleMove}
        onCancel={() => setShowContextPicker(false)}
      />
    </div>
  );
}
