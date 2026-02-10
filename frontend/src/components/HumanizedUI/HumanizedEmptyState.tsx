import {
  type EmptyStateContent,
  getEmptyStateContent,
} from '../../utils/humanizedMessages';

export interface HumanizedEmptyStateProps {
  /** Type of empty state */
  type: 'inbox' | 'ideas' | 'search' | 'archive' | 'connections' | 'learning' | 'chat' | 'favorites' | 'recent';
  /** Context (e.g. search query) */
  context?: { searchQuery?: string; category?: string };
  /** Action callback */
  onAction?: () => void;
  /** Custom content */
  customContent?: Partial<EmptyStateContent>;
  /** Size */
  size?: 'small' | 'medium' | 'large';
}

export const HumanizedEmptyState = ({
  type,
  context,
  onAction,
  customContent,
  size = 'medium',
}: HumanizedEmptyStateProps) => {
  const content: EmptyStateContent = {
    ...getEmptyStateContent(type, context),
    ...customContent,
  };

  return (
    <div className={`humanized-empty-state ${size}`}>
      {/* Animiertes Icon */}
      <div className="empty-icon">
        <span className="icon-emoji">{content.icon}</span>
        <div className="icon-glow" />
      </div>

      {/* Inhalt */}
      <div className="empty-content">
        <h3 className="empty-title">{content.title}</h3>
        <p className="empty-description">{content.description}</p>
        <p className="empty-encouragement">{content.encouragement}</p>
      </div>

      {/* Aktion */}
      {content.actionLabel && onAction && (
        <button className="empty-action neuro-button" onClick={onAction}>
          {content.actionLabel}
          {content.actionHint && (
            <span className="action-hint">{content.actionHint}</span>
          )}
        </button>
      )}
    </div>
  );
};
