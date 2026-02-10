export interface ProgressToastProps {
  /** Is visible */
  show: boolean;
  /** Progress (0-100) */
  progress: number;
  /** Message */
  message: string;
  /** Sub-message */
  subMessage?: string;
  /** Cancel possible */
  onCancel?: () => void;
  /** Position */
  position?: 'top-right' | 'bottom-right' | 'bottom-center';
}

export const ProgressToast = ({
  show,
  progress,
  message,
  subMessage,
  onCancel,
  position = 'bottom-right',
}: ProgressToastProps) => {
  if (!show) return null;

  const isComplete = progress >= 100;

  return (
    <div className={`progress-toast ${position} ${isComplete ? 'complete' : ''}`}>
      {/* Progress Ring */}
      <div className="progress-ring">
        <svg viewBox="0 0 36 36">
          <circle
            className="ring-bg"
            cx="18"
            cy="18"
            r="16"
            fill="none"
            strokeWidth="3"
          />
          <circle
            className="ring-progress"
            cx="18"
            cy="18"
            r="16"
            fill="none"
            strokeWidth="3"
            strokeDasharray={`${progress}, 100`}
          />
        </svg>
        <span className="progress-percent">
          {isComplete ? '\u2713' : `${Math.round(progress)}%`}
        </span>
      </div>

      {/* Content */}
      <div className="toast-content">
        <span className="toast-message">{message}</span>
        {subMessage && <span className="toast-submessage">{subMessage}</span>}
      </div>

      {/* Cancel */}
      {onCancel && !isComplete && (
        <button className="toast-cancel" onClick={onCancel} aria-label="Abbrechen">
          {'\u00D7'}
        </button>
      )}
    </div>
  );
};
