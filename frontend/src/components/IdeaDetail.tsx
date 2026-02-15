import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { AIContext, useContextState, getContextLabel } from './ContextSwitcher';
import { ContextPickerDialog } from './ContextPickerDialog';
import { logError } from '../utils/errors';
import { IdeaDetailActions } from './IdeaDetailActions';
import { IdeaDetailDraft } from './IdeaDetailDraft';
import { IdeaDetailRelations } from './IdeaDetailRelations';
import { typeLabels, categoryLabels, priorityLabels } from './IdeaDetailTypes';
import type { Relation, Suggestion, Draft, IdeaDetailProps } from './IdeaDetailTypes';
import '../neurodesign.css';
import './IdeaDetail.css';

export type { IdeaDetailProps };
export type { Idea } from './IdeaDetailTypes';

export function IdeaDetail({ idea, onClose, onNavigate, onConvertToTask, onOpenInChat, onMarkComplete, onMove }: IdeaDetailProps) {
  const [context] = useContextState();
  const [relations, setRelations] = useState<Relation[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingRelations, setLoadingRelations] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isMoving, setIsMoving] = useState(false);
  const [showContextPicker, setShowContextPicker] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);

  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  const [researchResult, setResearchResult] = useState<string | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchType, setResearchType] = useState<string | null>(null);

  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [onClose]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

  useEffect(() => {
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    loadRelations(signal);
    loadSuggestions(signal);
    loadDraft(signal);
    return () => { abortControllerRef.current?.abort(); };
  }, [idea.id]);

  const loadRelations = async (signal: AbortSignal) => {
    setLoadingRelations(true);
    try {
      const response = await axios.get(`/api/knowledge-graph/relations/${idea.id}`, { signal });
      if (!signal.aborted) setRelations(response.data.relationships || []);
    } catch (error) {
      if (!axios.isCancel(error)) logError('IdeaDetail:loadRelations', error);
    } finally {
      if (!signal.aborted) setLoadingRelations(false);
    }
  };

  const loadSuggestions = async (signal: AbortSignal) => {
    try {
      const response = await axios.get(`/api/knowledge-graph/suggestions/${idea.id}`, { signal });
      if (!signal.aborted) setSuggestions(response.data.suggestions || []);
    } catch (error) {
      if (!axios.isCancel(error)) logError('IdeaDetail:loadSuggestions', error);
    }
  };

  const loadDraft = async (signal: AbortSignal) => {
    setLoadingDraft(true);
    try {
      const response = await axios.get(`/api/${context}/ideas/${idea.id}/draft`, { signal });
      if (!signal.aborted && response.data.draft) setDraft(response.data.draft);
    } catch (error) {
      if (!axios.isCancel(error)) logError('IdeaDetail:loadDraft', error);
    } finally {
      if (!signal.aborted) setLoadingDraft(false);
    }
  };

  const copyDraft = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.content);
      showToast('In Zwischenablage kopiert', 'success');
      try {
        await axios.post(`/api/${context}/drafts/${draft.id}/copied`);
        if (!feedbackGiven) {
          setTimeout(() => {
            if (!abortControllerRef.current?.signal.aborted && !feedbackGiven) {
              setShowFeedbackPrompt(true);
            }
          }, 3000);
        }
      } catch { /* Ignore tracking errors */ }
    } catch {
      showToast('Der Text konnte nicht kopiert werden. Versuch es noch mal.', 'error');
    }
  };

  const generateSmartContent = async (forceRegenerate = false) => {
    setGeneratingDraft(true);
    const signal = abortControllerRef.current?.signal;
    try {
      const response = await axios.post(
        `/api/${context}/ideas/${idea.id}/draft`,
        { forceRegenerate, title: idea.title, summary: idea.summary, rawTranscript: idea.raw_transcript, keywords: idea.keywords, type: idea.type, category: idea.category },
        { signal }
      );
      if (!signal?.aborted && response.data.draft) {
        setDraft(response.data.draft);
        if (forceRegenerate) showToast('Inhalt wurde neu generiert', 'success');
      } else if (!signal?.aborted && !response.data.success) {
        showToast('Für diese Aufgabe konnte kein Inhalt generiert werden.', 'info');
      }
    } catch (error) {
      if (!axios.isCancel(error)) {
        logError('IdeaDetail:generateSmartContent', error);
        showToast('Generierung fehlgeschlagen. Versuch es gleich noch mal.', 'error');
      }
    } finally {
      if (!signal?.aborted) setGeneratingDraft(false);
    }
  };

  const analyzeRelations = async () => {
    setAnalyzing(true);
    const signal = abortControllerRef.current?.signal;
    try {
      await axios.post(`/api/knowledge-graph/analyze/${idea.id}`, {}, { signal });
      if (signal && !signal.aborted) {
        await loadRelations(signal);
        showToast('Beziehungen wurden analysiert', 'success');
      }
    } catch (error) {
      if (!axios.isCancel(error)) {
        logError('IdeaDetail:analyzeRelations', error);
        showToast('Die Analyse hat gerade nicht geklappt. Versuch es gleich noch mal.', 'error');
      }
    } finally {
      if (!signal?.aborted) setAnalyzing(false);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const performResearch = async (type: 'answer' | 'solve' | 'develop' | 'explore') => {
    setResearchLoading(true);
    setResearchType(type);
    setResearchResult(null);
    const signal = abortControllerRef.current?.signal;
    const prompts: Record<string, string> = {
      answer: `Beantworte diese Frage kurz und prägnant (max. 3-4 Sätze). Wenn nötig, gib 2-3 konkrete Tipps oder Links.\n\nFrage: "${idea.title}"\nKontext: ${idea.summary}`,
      solve: `Gib 3 konkrete Lösungsvorschläge für dieses Problem (je 1-2 Sätze). Priorisiere praktische, sofort umsetzbare Ansätze.\n\nProblem: "${idea.title}"\nDetails: ${idea.summary}`,
      develop: `Entwickle diese Idee weiter mit 3 konkreten nächsten Schritten und einem möglichen Ziel. Halte es kurz und actionable.\n\nIdee: "${idea.title}"\nBeschreibung: ${idea.summary}`,
      explore: `Erkläre diese Erkenntnis genauer und zeige 2-3 mögliche Anwendungen oder Konsequenzen auf.\n\nErkenntnis: "${idea.title}"\nDetails: ${idea.summary}`,
    };
    try {
      const response = await axios.post(`/api/chat/quick`, { message: prompts[type], context }, { signal });
      if (!signal?.aborted && response.data?.assistantMessage) setResearchResult(response.data.assistantMessage.content);
    } catch (error) {
      if (!axios.isCancel(error)) {
        logError('IdeaDetail:research', error);
        showToast('Die Recherche hat nicht geklappt. Versuch es noch mal.', 'error');
      }
    } finally {
      if (!signal?.aborted) setResearchLoading(false);
    }
  };

  const handleMove = async (targetContext: AIContext) => {
    setShowContextPicker(false);
    setIsMoving(true);
    try {
      await axios.post(`/api/${context}/ideas/${idea.id}/move`, { targetContext });
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
        <button type="button" className="close-button neuro-press-effect neuro-focus-ring" onClick={onClose} aria-label="Detail-Ansicht schließen">×</button>

        <div className="idea-detail-content">
          <div className="detail-header">
            <span className="detail-type-icon">{typeInfo.icon}</span>
            <div className="detail-type-info">
              <span className="detail-type-label">{typeInfo.label}</span>
              <span className="detail-category">{categoryLabels[idea.category]}</span>
            </div>
            <span className={`detail-priority priority-${idea.priority}`}>{priorityLabels[idea.priority]}</span>
          </div>

          <h2 id="idea-detail-title" className="detail-title">{idea.title}</h2>

          <IdeaDetailActions
            idea={idea}
            researchLoading={researchLoading}
            researchType={researchType}
            isMoving={isMoving}
            onPerformResearch={performResearch}
            onConvertToTask={onConvertToTask}
            onOpenInChat={onOpenInChat}
            onMarkComplete={onMarkComplete}
            onMoveClick={() => setShowContextPicker(true)}
            hasMove={!!onMove}
          />

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
                    <button type="button" className="research-copy-btn neuro-button neuro-focus-ring" onClick={async () => { await navigator.clipboard.writeText(researchResult); showToast('Kopiert', 'success'); }}>
                      📋 Kopieren
                    </button>
                    <button type="button" className="research-clear-btn neuro-button neuro-focus-ring" onClick={() => setResearchResult(null)}>
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

          <IdeaDetailDraft
            draft={draft}
            loadingDraft={loadingDraft}
            generatingDraft={generatingDraft}
            isTask={idea.type === 'task'}
            feedbackGiven={feedbackGiven}
            showFeedbackPrompt={showFeedbackPrompt}
            onSetFeedbackGiven={setFeedbackGiven}
            onSetShowFeedbackPrompt={setShowFeedbackPrompt}
            onGenerateSmartContent={generateSmartContent}
            onCopyDraft={copyDraft}
          />

          {idea.next_steps && idea.next_steps.length > 0 && (
            <div className="detail-section">
              <h3 id="next-steps-heading">Nächste Schritte</h3>
              <ul className="detail-steps" aria-labelledby="next-steps-heading">
                {idea.next_steps.map((step, i) => (
                  <li key={i}><span className="step-number" aria-hidden="true">{i + 1}</span>{step}</li>
                ))}
              </ul>
            </div>
          )}

          {idea.context_needed && idea.context_needed.length > 0 && (
            <div className="detail-section">
              <h3 id="context-needed-heading">Benötigter Kontext</h3>
              <ul className="detail-context" aria-labelledby="context-needed-heading">
                {idea.context_needed.map((ctx, i) => (<li key={i}>{ctx}</li>))}
              </ul>
            </div>
          )}

          {idea.keywords && idea.keywords.length > 0 && (
            <div className="detail-section">
              <h3 id="keywords-heading">Keywords</h3>
              <div className="detail-keywords" role="list" aria-labelledby="keywords-heading">
                {idea.keywords.map((kw, i) => (<span key={i} className="keyword-tag" role="listitem">{kw}</span>))}
              </div>
            </div>
          )}

          {idea.raw_transcript && (
            <div className="detail-section">
              <h3>Original-Transkript</h3>
              <blockquote className="detail-transcript">{idea.raw_transcript}</blockquote>
            </div>
          )}

          <IdeaDetailRelations
            relations={relations}
            suggestions={suggestions}
            loadingRelations={loadingRelations}
            analyzing={analyzing}
            onAnalyze={analyzeRelations}
            onNavigate={onNavigate}
          />

          <div className="detail-footer">
            <span className="detail-date">Erstellt: {formatDate(idea.created_at)}</span>
            {idea.updated_at && idea.updated_at !== idea.created_at && (
              <span className="detail-date">Aktualisiert: {formatDate(idea.updated_at)}</span>
            )}
          </div>
        </div>
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
