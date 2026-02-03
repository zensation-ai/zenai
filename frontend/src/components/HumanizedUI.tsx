/**
 * Humanized UI Components
 *
 * Komponenten für humanisierte, emotionale Benutzeroberfläche:
 * - EnhancedTooltip: Tooltips mit Aktion, Shortcut und Hilfe
 * - ContextualLoader: Loading-States mit kontextuellen Nachrichten
 * - SuccessAnimation: Erfolgs-Feedback bei Aktionen
 * - AIStatusIndicator: Animierte KI-Status-Anzeige
 * - HumanizedEmptyState: Inspirierende leere Zustände
 * - FriendlyError: Freundliche Fehlermeldungen
 *
 * Basiert auf:
 * - Micro-copy Best Practices (3 C's: Clear, Concise, Consistent)
 * - WCAG 2.2 Accessibility Guidelines
 * - Neuroscience-informed Design
 */

import { useState, useEffect, useRef, useCallback, type ReactNode, type CSSProperties } from 'react';
import {
  type TooltipContent,
  type LoadingContext,
  type EmptyStateContent,
  type ErrorContent,
  type ActionFeedback,
  BUTTON_TOOLTIPS,
  getLoadingMessage,
  getEmptyStateContent,
  getErrorContent,
  getAIStatusMessage,
  getActionFeedback,
} from '../utils/humanizedMessages';
import './HumanizedUI.css';

// ============================================
// ENHANCED TOOLTIP
// Mit Aktion, Shortcut und kontextueller Hilfe
// ============================================

interface EnhancedTooltipProps {
  /** Tooltip-ID für BUTTON_TOOLTIPS lookup */
  tooltipId?: keyof typeof BUTTON_TOOLTIPS;
  /** Oder direkter Content */
  content?: TooltipContent;
  /** Custom label override */
  label?: string;
  /** Das getriggerte Element */
  children: ReactNode;
  /** Position */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Verzögerung in ms */
  delay?: number;
  /** Deaktiviert */
  disabled?: boolean;
  /** Zeige immer Shortcut-Badge */
  showShortcut?: boolean;
  /** Help mode: zeigt ein kleines Info-Icon neben dem Element */
  helpMode?: boolean;
  /** Custom help icon (default: info circle) */
  helpIcon?: string;
}

export const EnhancedTooltip = ({
  tooltipId,
  content: directContent,
  label,
  children,
  position = 'top',
  delay = 400,
  disabled = false,
  showShortcut = true,
  helpMode = false,
  helpIcon = '\u24D8', // circled i
}: EnhancedTooltipProps) => {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const content: TooltipContent | undefined = directContent || (tooltipId ? BUTTON_TOOLTIPS[tooltipId] : undefined);

  const handleMouseEnter = useCallback(() => {
    if (disabled || !content) return;
    timeoutRef.current = window.setTimeout(() => {
      setVisible(true);
    }, delay);
  }, [delay, disabled, content]);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!content) {
    return <>{children}</>;
  }

  // Help mode: render a small help icon that shows tooltip on hover
  if (helpMode) {
    return (
      <div className="enhanced-tooltip-wrapper help-mode-wrapper">
        {children}
        <span
          className="help-icon-trigger"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocus={handleMouseEnter}
          onBlur={handleMouseLeave}
          tabIndex={0}
          role="button"
          aria-label="Hilfe anzeigen"
        >
          {helpIcon}
        </span>
        <div
          className={`enhanced-tooltip ${position} ${visible ? 'visible' : ''}`}
          role="tooltip"
          aria-hidden={!visible}
        >
          <div className="tooltip-header">
            <span className="tooltip-label">{label || content.label}</span>
            {showShortcut && content.shortcut && (
              <kbd className="tooltip-shortcut">{content.shortcut}</kbd>
            )}
          </div>
          {content.action && (
            <div className="tooltip-action">
              <span className="action-arrow">\u2192</span>
              <span className="action-text">{content.action}</span>
            </div>
          )}
          {content.hint && (
            <div className="tooltip-hint">
              <span className="hint-icon">\uD83D\uDCA1</span>
              <span className="hint-text">{content.hint}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="enhanced-tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      <div
        className={`enhanced-tooltip ${position} ${visible ? 'visible' : ''}`}
        role="tooltip"
        aria-hidden={!visible}
      >
        {/* Hauptlabel */}
        <div className="tooltip-header">
          <span className="tooltip-label">{label || content.label}</span>
          {showShortcut && content.shortcut && (
            <kbd className="tooltip-shortcut">{content.shortcut}</kbd>
          )}
        </div>

        {/* Aktion (was passiert beim Klick) */}
        {content.action && (
          <div className="tooltip-action">
            <span className="action-arrow">\u2192</span>
            <span className="action-text">{content.action}</span>
          </div>
        )}

        {/* Kontextuelle Hilfe */}
        {content.hint && (
          <div className="tooltip-hint">
            <span className="hint-icon">\uD83D\uDCA1</span>
            <span className="hint-text">{content.hint}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// CONTEXTUAL LOADER
// Loading-States mit kontextuellen Nachrichten
// ============================================

interface ContextualLoaderProps {
  /** Loading-Kontext */
  context: LoadingContext;
  /** Größe */
  size?: 'small' | 'medium' | 'large';
  /** Inline oder Block */
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

// ============================================
// SKELETON LOADER (WCAG-konform)
// Stoppt nach 5s, respektiert prefers-reduced-motion
// ============================================

interface SkeletonLoaderProps {
  /** Typ des Inhalts */
  type: 'text' | 'heading' | 'card' | 'avatar' | 'button' | 'paragraph';
  /** Anzahl Zeilen/Items */
  count?: number;
  /** Breite */
  width?: string | number;
  /** Höhe */
  height?: string | number;
  /** Aria-Label für Screenreader */
  ariaLabel?: string;
}

export const SkeletonLoader = ({
  type,
  count = 1,
  width,
  height,
  ariaLabel = 'Lädt...',
}: SkeletonLoaderProps) => {
  const [animating, setAnimating] = useState(true);

  // WCAG 2.2.2: Animation stoppt nach 5 Sekunden
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimating(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const getDefaultStyle = (): CSSProperties => {
    const styles: Record<string, CSSProperties> = {
      text: { width: width || '100%', height: height || '16px' },
      heading: { width: width || '60%', height: height || '24px' },
      card: { width: width || '100%', height: height || '120px' },
      avatar: { width: width || '48px', height: height || '48px', borderRadius: '50%' },
      button: { width: width || '100px', height: height || '40px', borderRadius: '8px' },
      paragraph: { width: width || '100%', height: height || '80px' },
    };
    return styles[type] || styles.text;
  };

  const renderSkeletonItem = (index: number) => (
    <div
      key={`skeleton-${type}-${index}`}
      className={`skeleton-item ${type} ${animating ? 'animating' : ''}`}
      style={getDefaultStyle()}
      aria-hidden="true"
    />
  );

  return (
    <div
      className="skeleton-loader"
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
    >
      <span className="sr-only">{ariaLabel}</span>
      {type === 'paragraph' ? (
        <div className="skeleton-paragraph">
          <div className="skeleton-item text animating" style={{ width: '100%' }} />
          <div className="skeleton-item text animating" style={{ width: '100%' }} />
          <div className="skeleton-item text animating" style={{ width: '80%' }} />
        </div>
      ) : (
        Array.from({ length: count }).map((_, i) => renderSkeletonItem(i))
      )}
    </div>
  );
};

// ============================================
// SUCCESS ANIMATION
// Erfolgs-Feedback bei Aktionen
// ============================================

interface SuccessAnimationProps {
  /** Ist aktiv */
  show: boolean;
  /** Aktions-Typ */
  action?: 'archive' | 'save' | 'delete' | 'publish' | 'connect' | 'share' | 'learn' | 'voice' | 'search';
  /** Custom Feedback */
  feedback?: ActionFeedback;
  /** Callback nach Animation */
  onComplete?: () => void;
  /** Position */
  position?: 'center' | 'inline' | 'toast';
  /** Kontext für Feedback */
  context?: { count?: number; name?: string };
}

export const SuccessAnimation = ({
  show,
  action = 'save',
  feedback: customFeedback,
  onComplete,
  position = 'toast',
  context,
}: SuccessAnimationProps) => {
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  useEffect(() => {
    if (show) {
      const newFeedback = customFeedback || getActionFeedback(action, context);
      setFeedback(newFeedback);
      setVisible(true);

      const duration = newFeedback.duration || 2500;
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [show, action, customFeedback, context, onComplete]);

  if (!visible || !feedback) return null;

  return (
    <div className={`success-animation ${position} ${visible ? 'visible' : ''}`}>
      {/* Burst-Effekt */}
      <div className="success-burst" />

      {/* Icon */}
      <div className="success-icon">
        <span className="icon-emoji">{feedback.icon || '✓'}</span>
        <div className="icon-ring" />
      </div>

      {/* Nachricht */}
      <div className="success-content">
        <span className="success-message">{feedback.message}</span>
        {feedback.subMessage && (
          <span className="success-submessage">{feedback.subMessage}</span>
        )}
      </div>

      {/* Confetti für spezielle Aktionen */}
      {(action === 'publish' || action === 'connect') && (
        <div className="success-confetti">
          {[...Array(6)].map((_, i) => (
            <span key={i} className="confetti-piece" />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// AI STATUS INDICATOR
// Animierte KI-Status-Anzeige
// ============================================

interface AIStatusIndicatorProps {
  /** Aktueller Status */
  status: 'idle' | 'listening' | 'thinking' | 'processing' | 'success' | 'error' | 'offline';
  /** Größe */
  size?: 'small' | 'medium' | 'large';
  /** Zeige Text-Label */
  showLabel?: boolean;
  /** Custom className */
  className?: string;
  /** Klick-Handler */
  onClick?: () => void;
}

export const AIStatusIndicator = ({
  status,
  size = 'medium',
  showLabel = true,
  className = '',
  onClick,
}: AIStatusIndicatorProps) => {
  const statusInfo = getAIStatusMessage(status);
  const [pulseActive, setPulseActive] = useState(false);

  // Pulsierender Effekt bei aktiven Zuständen
  useEffect(() => {
    if (['listening', 'thinking', 'processing'].includes(status)) {
      setPulseActive(true);
    } else {
      setPulseActive(false);
    }
  }, [status]);

  return (
    <div
      className={`ai-status-indicator ${status} ${size} ${className}`}
      onClick={onClick}
      role="status"
      aria-live="polite"
      aria-label={`${statusInfo.message}${statusInfo.subMessage ? ` - ${statusInfo.subMessage}` : ''}`}
      style={statusInfo.pulseColor ? { '--pulse-color': statusInfo.pulseColor } as CSSProperties : undefined}
    >
      {/* Animierter Kreis */}
      <div className="status-circle">
        {/* Hintergrund-Glow */}
        <div className={`status-glow ${pulseActive ? 'active' : ''}`} />

        {/* Äußere Pulse-Ringe */}
        {pulseActive && (
          <>
            <div className="pulse-ring ring-1" />
            <div className="pulse-ring ring-2" />
            <div className="pulse-ring ring-3" />
          </>
        )}

        {/* Icon */}
        <div className="status-icon">
          <span className="icon-emoji">{statusInfo.icon}</span>
        </div>

        {/* Audio-Wellen für Listening */}
        {status === 'listening' && (
          <div className="audio-waves">
            <span className="wave" />
            <span className="wave" />
            <span className="wave" />
            <span className="wave" />
          </div>
        )}

        {/* Denkende Punkte für Thinking/Processing */}
        {(status === 'thinking' || status === 'processing') && (
          <div className="thinking-dots">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
      </div>

      {/* Label */}
      {showLabel && (
        <div className="status-label">
          <span className="label-message">{statusInfo.message}</span>
          {statusInfo.subMessage && (
            <span className="label-submessage">{statusInfo.subMessage}</span>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// HUMANIZED EMPTY STATE
// Inspirierende leere Zustände
// ============================================

interface HumanizedEmptyStateProps {
  /** Typ des leeren Zustands */
  type: 'inbox' | 'ideas' | 'search' | 'archive' | 'connections' | 'learning' | 'chat' | 'favorites' | 'recent';
  /** Kontext (z.B. Suchbegriff) */
  context?: { searchQuery?: string; category?: string };
  /** Aktion-Callback */
  onAction?: () => void;
  /** Benutzerdefinierter Inhalt */
  customContent?: Partial<EmptyStateContent>;
  /** Größe */
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

// ============================================
// FRIENDLY ERROR
// Freundliche, lösungsorientierte Fehlermeldungen
// ============================================

interface FriendlyErrorProps {
  /** Fehlertyp */
  errorType: 'network' | 'server' | 'auth' | 'notFound' | 'permission' | 'validation' | 'timeout' | 'unknown';
  /** Kontext für Details */
  context?: { fieldName?: string; details?: string };
  /** Retry-Callback */
  onRetry?: () => void;
  /** Dismiss-Callback */
  onDismiss?: () => void;
  /** Hilfe-Link-Callback */
  onHelp?: () => void;
  /** Benutzerdefinierter Inhalt */
  customContent?: Partial<ErrorContent>;
  /** Darstellungsart */
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
          ×
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

// ============================================
// PROGRESS TOAST
// Nicht-blockierender Fortschritt mit Nachrichten
// ============================================

interface ProgressToastProps {
  /** Ist sichtbar */
  show: boolean;
  /** Fortschritt (0-100) */
  progress: number;
  /** Nachricht */
  message: string;
  /** Sub-Nachricht */
  subMessage?: string;
  /** Abbrechen möglich */
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
          {isComplete ? '✓' : `${Math.round(progress)}%`}
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
          ×
        </button>
      )}
    </div>
  );
};

// ============================================
// CONNECTION STATUS BADGE
// Verständliche Verbindungsanzeige
// ============================================

interface ConnectionStatusProps {
  /** Status */
  status: 'connected' | 'connecting' | 'disconnected' | 'syncing';
  /** Letzter Sync-Zeitpunkt */
  lastSync?: Date;
  /** Zeige Details */
  showDetails?: boolean;
  /** Klick-Handler */
  onClick?: () => void;
}

export const ConnectionStatus = ({
  status,
  lastSync,
  showDetails = false,
  onClick,
}: ConnectionStatusProps) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'connected':
        return { label: 'Verbunden', icon: '●', color: 'var(--neuro-success)' };
      case 'connecting':
        return { label: 'Verbinde...', icon: '◐', color: 'var(--neuro-anticipation)' };
      case 'disconnected':
        return { label: 'Offline', icon: '○', color: 'var(--text-secondary)' };
      case 'syncing':
        return { label: 'Synchronisiere...', icon: '↻', color: 'var(--neuro-reward)' };
      default:
        return { label: 'Unbekannt', icon: '?', color: 'var(--text-secondary)' };
    }
  };

  const info = getStatusInfo();

  const formatLastSync = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `Vor ${diffMins} Min.`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Vor ${diffHours} Std.`;

    return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  };

  return (
    <div
      className={`connection-status ${status}`}
      onClick={onClick}
      role="status"
      aria-label={info.label}
      style={{ '--status-color': info.color } as CSSProperties}
    >
      <span className={`status-dot ${status === 'syncing' ? 'spinning' : ''}`}>
        {info.icon}
      </span>

      {showDetails && (
        <div className="status-details">
          <span className="status-label">{info.label}</span>
          {lastSync && status === 'connected' && (
            <span className="status-sync">
              Zuletzt: {formatLastSync(lastSync)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// EXPORT ALL COMPONENTS
// ============================================

export {
  type EnhancedTooltipProps,
  type ContextualLoaderProps,
  type SkeletonLoaderProps,
  type SuccessAnimationProps,
  type AIStatusIndicatorProps,
  type HumanizedEmptyStateProps,
  type FriendlyErrorProps,
  type ProgressToastProps,
  type ConnectionStatusProps,
};
