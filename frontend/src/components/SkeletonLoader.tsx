import '../neurodesign.css';
import './SkeletonLoader.css';

interface SkeletonLoaderProps {
  type?: 'card' | 'text' | 'avatar' | 'button';
  count?: number;
  width?: string;
  height?: string;
}

/**
 * Skeleton Loader Component
 * Provides visual feedback during content loading with animated placeholders
 */
export function SkeletonLoader({
  type = 'card',
  count = 1,
  width,
  height
}: SkeletonLoaderProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  if (type === 'text') {
    return (
      <div className="skeleton-text-group">
        {items.map((i) => (
          <div
            key={i}
            className="skeleton skeleton-text"
            style={{ width: width || `${80 - i * 15}%` }}
          />
        ))}
      </div>
    );
  }

  if (type === 'avatar') {
    return (
      <div
        className="skeleton skeleton-avatar"
        style={{ width: width || '48px', height: height || '48px' }}
      />
    );
  }

  if (type === 'button') {
    return (
      <div
        className="skeleton skeleton-button"
        style={{ width: width || '120px', height: height || '40px' }}
      />
    );
  }

  // Card skeleton (default)
  return (
    <div className="skeleton-cards">
      {items.map((i) => (
        <div key={i} className="skeleton-card" aria-hidden="true">
          <div className="skeleton-card-header">
            <div className="skeleton skeleton-icon" />
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-action" />
          </div>
          <div className="skeleton-card-body">
            <div className="skeleton skeleton-line" style={{ width: '100%' }} />
            <div className="skeleton skeleton-line" style={{ width: '85%' }} />
            <div className="skeleton skeleton-line" style={{ width: '70%' }} />
          </div>
          <div className="skeleton-card-tags">
            <div className="skeleton skeleton-tag" />
            <div className="skeleton skeleton-tag" />
          </div>
          <div className="skeleton-card-footer">
            <div className="skeleton skeleton-date" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Progress Indicator for long-running AI operations
 */
interface ProgressIndicatorProps {
  message?: string;
  subMessage?: string;
  progress?: number; // 0-100, if undefined shows indeterminate
  steps?: string[];
  currentStep?: number;
}

export function ProgressIndicator({
  message = 'Verarbeite...',
  subMessage,
  progress,
  steps,
  currentStep = 0
}: ProgressIndicatorProps) {
  return (
    <div className="progress-indicator" role="status" aria-live="polite">
      <div className="progress-spinner neuro-loading-spinner">
        <svg className="spinner-svg" viewBox="0 0 50 50">
          <circle
            className="spinner-track"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            strokeWidth="4"
          />
          <circle
            className="spinner-progress"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            strokeWidth="4"
            strokeDasharray={progress !== undefined ? `${progress * 1.26} 126` : '80 126'}
            strokeLinecap="round"
          />
        </svg>
        {progress !== undefined && (
          <span className="progress-percent">{Math.round(progress)}%</span>
        )}
      </div>

      <div className="progress-content">
        <p className="progress-message">{message}</p>
        {subMessage && <p className="progress-sub">{subMessage}</p>}
      </div>

      {steps && steps.length > 0 && (
        <div className="progress-steps">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`progress-step ${i < currentStep ? 'completed' : ''} ${i === currentStep ? 'active' : ''}`}
            >
              <span className="step-indicator neuro-status-dot">
                {i < currentStep ? '✓' : i === currentStep ? '●' : '○'}
              </span>
              <span className="step-label">{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Inline loading indicator for buttons and small elements
 */
interface InlineLoaderProps {
  size?: 'small' | 'medium' | 'large';
  color?: 'primary' | 'white' | 'muted';
  text?: string;
}

export function InlineLoader({
  size = 'medium',
  color = 'primary',
  text
}: InlineLoaderProps) {
  return (
    <span
      className={`inline-loader inline-loader-${size} inline-loader-${color}`}
      role="status"
      aria-label={text || 'Lädt...'}
    >
      <span className="inline-loader-dot" aria-hidden="true" />
      <span className="inline-loader-dot" aria-hidden="true" />
      <span className="inline-loader-dot" aria-hidden="true" />
      {text && <span className="inline-loader-text">{text}</span>}
    </span>
  );
}
