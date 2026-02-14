import {
  type ErrorContent,
  getErrorContent,
} from '../../utils/humanizedMessages';

export interface FriendlyErrorProps {
  /** Error type */
  errorType: 'network' | 'server' | 'auth' | 'notFound' | 'permission' | 'validation' | 'timeout' | 'unknown';
  /** Context for details */
  context?: { fieldName?: string; details?: string };
  /** Retry callback */
  onRetry?: () => void;
  /** Dismiss callback */
  onDismiss?: () => void;
  /** Help link callback */
  onHelp?: () => void;
  /** Custom content */
  customContent?: Partial<ErrorContent>;
  /** Display variant */
  variant?: 'inline' | 'card' | 'fullpage';
}

export const FriendlyError = ({
  errorType,
  context,
  onRetry,
  onDismiss,
  onHelp,
  customContent,
  variant = 'card',
}: FriendlyErrorProps) => {
  const content: ErrorContent = {
    ...getErrorContent(errorType, context),
    ...customContent,
  };

  return (
    <div className={`friendly-error ${variant} ${errorType}`} role="alert">
      {/* Dismiss Button */}
      {onDismiss && variant !== 'fullpage' && (
        <button className="error-dismiss" onClick={onDismiss} aria-label="Schließen">
          {'\u00D7'}
        </button>
      )}

      {/* Icon */}
      <div className="error-icon">
        <span className="icon-emoji">{content.icon}</span>
      </div>

      {/* Inhalt */}
      <div className="error-content">
        <h4 className="error-title">{content.title}</h4>
        <p className="error-description">{content.description}</p>
        <p className="error-suggestion">{content.suggestion}</p>
      </div>

      {/* Aktionen */}
      <div className="error-actions">
        {content.retryLabel && onRetry && (
          <button className="error-retry neuro-button" onClick={onRetry}>
            {content.retryLabel}
          </button>
        )}
        {content.helpLink && onHelp && (
          <button className="error-help" onClick={onHelp}>
            Hilfe erhalten
          </button>
        )}
      </div>
    </div>
  );
};
