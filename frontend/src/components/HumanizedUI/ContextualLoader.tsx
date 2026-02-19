import {
  type LoadingContext,
  getLoadingMessage,
} from '../../utils/humanizedMessages';

export interface ContextualLoaderProps {
  /** Loading context */
  context: LoadingContext;
  /** Size */
  size?: 'small' | 'medium' | 'large';
  /** Inline or block */
  inline?: boolean;
  /** Custom className */
  className?: string;
}

export const ContextualLoader = ({
  context,
  size = 'medium',
  inline = false,
  className = '',
}: ContextualLoaderProps) => {
  const { message, subMessage, showProgress } = getLoadingMessage(context);

  return (
    <div
      className={`contextual-loader ${size} ${inline ? 'inline' : ''} ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Animierter Loader */}
      <div className="loader-animation">
        <div className="loader-ring">
          <div className="ring-segment" />
          <div className="ring-segment" />
          <div className="ring-segment" />
        </div>
        <div className="loader-pulse" />
      </div>

      {/* Nachrichten */}
      <div className="loader-content">
        <span className="loader-message">{message}</span>
        {subMessage && (
          <span className="loader-submessage">{subMessage}</span>
        )}
      </div>

      {/* Progress-Bar wenn verfügbar */}
      {showProgress && context.progress !== undefined && (
        <div className="loader-progress">
          <div
            className="progress-fill"
            style={{ width: `${context.progress}%` }}
          />
        </div>
      )}
    </div>
  );
};
