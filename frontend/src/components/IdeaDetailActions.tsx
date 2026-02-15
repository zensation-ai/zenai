import type { Idea } from './IdeaDetailTypes';

interface IdeaDetailActionsProps {
  idea: Idea;
  researchLoading: boolean;
  researchType: string | null;
  isMoving: boolean;
  onPerformResearch: (type: 'answer' | 'solve' | 'develop' | 'explore') => void;
  onConvertToTask?: (idea: Idea) => void;
  onOpenInChat?: (idea: Idea) => void;
  onMarkComplete?: (idea: Idea) => void;
  onMoveClick: () => void;
  hasMove: boolean;
}

export function IdeaDetailActions({
  idea,
  researchLoading,
  researchType,
  isMoving,
  onPerformResearch,
  onConvertToTask,
  onOpenInChat,
  onMarkComplete,
  onMoveClick,
  hasMove,
}: IdeaDetailActionsProps) {
  return (
    <div className="detail-actions-bar">
      {idea.type === 'task' && onMarkComplete && (
        <button
          type="button"
          className="action-btn action-complete neuro-button neuro-focus-ring"
          onClick={() => onMarkComplete(idea)}
        >
          ✓ Erledigt
        </button>
      )}

      {idea.type === 'idea' && (
        <>
          <button
            type="button"
            className="action-btn action-develop neuro-button neuro-focus-ring"
            onClick={() => onPerformResearch('develop')}
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

      {idea.type === 'question' && (
        <button
          type="button"
          className="action-btn action-answer neuro-button neuro-focus-ring"
          onClick={() => onPerformResearch('answer')}
          disabled={researchLoading}
        >
          {researchLoading && researchType === 'answer' ? '⏳ Recherchiere...' : '🔍 Antwort suchen'}
        </button>
      )}

      {idea.type === 'problem' && (
        <>
          <button
            type="button"
            className="action-btn action-solve neuro-button neuro-focus-ring"
            onClick={() => onPerformResearch('solve')}
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

      {idea.type === 'insight' && (
        <button
          type="button"
          className="action-btn action-explore neuro-button neuro-focus-ring"
          onClick={() => onPerformResearch('explore')}
          disabled={researchLoading}
        >
          {researchLoading && researchType === 'explore' ? '⏳ Erkunde...' : '🔎 Vertiefen'}
        </button>
      )}

      {onOpenInChat && (
        <button
          type="button"
          className="action-btn action-chat neuro-button neuro-focus-ring"
          onClick={() => onOpenInChat(idea)}
        >
          💬 Im Chat
        </button>
      )}

      {hasMove && (
        <button
          type="button"
          className="action-btn action-move neuro-button neuro-focus-ring"
          onClick={onMoveClick}
          disabled={isMoving}
        >
          {isMoving ? '...' : '↔ Verschieben'}
        </button>
      )}
    </div>
  );
}
