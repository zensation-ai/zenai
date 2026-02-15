import { useState } from 'react';
import { QuickFeedback, DraftFeedbackForm, FeedbackPrompt } from './DraftFeedback';
import type { Draft } from './IdeaDetailTypes';
import { draftTypeLabels } from './IdeaDetailTypes';

interface IdeaDetailDraftProps {
  draft: Draft | null;
  loadingDraft: boolean;
  generatingDraft: boolean;
  isTask: boolean;
  feedbackGiven: boolean;
  showFeedbackPrompt: boolean;
  onSetFeedbackGiven: (v: boolean) => void;
  onSetShowFeedbackPrompt: (v: boolean) => void;
  onGenerateSmartContent: (forceRegenerate: boolean) => void;
  onCopyDraft: () => void;
}

export function IdeaDetailDraft({
  draft,
  loadingDraft,
  generatingDraft,
  isTask,
  feedbackGiven,
  showFeedbackPrompt,
  onSetFeedbackGiven,
  onSetShowFeedbackPrompt,
  onGenerateSmartContent,
  onCopyDraft,
}: IdeaDetailDraftProps) {
  const [draftExpanded, setDraftExpanded] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);

  if (!draft && !loadingDraft && !generatingDraft && !isTask) return null;

  const handleCopy = async () => {
    onCopyDraft();
    setDraftCopied(true);
    setTimeout(() => setDraftCopied(false), 2000);
  };

  return (
    <>
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
              onClick={() => onGenerateSmartContent(true)}
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
                onClick={handleCopy}
              >
                {draftCopied ? '✓ Kopiert' : '📋 Kopieren'}
              </button>
            </div>

            {!feedbackGiven ? (
              <>
                <QuickFeedback
                  draftId={draft.id}
                  onFeedbackSubmitted={() => onSetFeedbackGiven(true)}
                />
                <DraftFeedbackForm
                  draftId={draft.id}
                  draftType={draft.draftType}
                  wordCount={draft.wordCount}
                  onFeedbackSubmitted={() => onSetFeedbackGiven(true)}
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
              onClick={() => onGenerateSmartContent(false)}
              disabled={generatingDraft}
            >
              {generatingDraft ? '⏳ Wird generiert...' : '✨ Jetzt vorbereiten lassen'}
            </button>
          </div>
        )}
      </div>

      {showFeedbackPrompt && draft && (
        <FeedbackPrompt
          draftId={draft.id}
          onDismiss={() => onSetShowFeedbackPrompt(false)}
          onFeedbackSubmitted={() => {
            onSetFeedbackGiven(true);
            onSetShowFeedbackPrompt(false);
          }}
        />
      )}
    </>
  );
}
