/**
 * Anticipatory UI Components
 *
 * Antizipatorisches Design zeigt dem Nutzer vorausschauend,
 * was als nächstes passieren wird - bevor die Aktion ausgeführt wird.
 *
 * Neurowissenschaftliche Grundlage:
 * - Anticipation aktiviert Nucleus Accumbens stärker als die Belohnung selbst (Knutson 2001)
 * - Vorhersehbarkeit reduziert Stress und fördert Flow-State
 * - Variable Belohnungen halten Engagement aufrecht
 */

import { useState, useCallback, useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import './AnticipatoryUI.css';

// ===========================================
// Anticipatory Tooltip
// Zeigt vorausschauend, was passieren wird
// ===========================================

interface AnticipatoryTooltipProps {
  /** Der Tooltip-Inhalt */
  content: ReactNode;
  /** Was passiert bei der Aktion */
  action?: string;
  /** Das Element das den Tooltip triggert */
  children: ReactNode;
  /** Position des Tooltips */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Verzögerung vor dem Anzeigen (ms) */
  delay?: number;
}

export const AnticipatoryTooltip = ({
  content,
  action,
  children,
  position = 'top',
  delay = 400,
}: AnticipatoryTooltipProps) => {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    timeoutRef.current = window.setTimeout(() => {
      setVisible(true);
    }, delay);
  }, [delay]);

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

  return (
    <div
      className="anticipatory-tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      <div
        className={`anticipatory-tooltip ${position} ${visible ? 'visible' : ''}`}
        role="tooltip"
      >
        <div className="tooltip-content">{content}</div>
        {action && (
          <div className="tooltip-action">
            <span className="action-arrow">→</span>
            <span className="action-text">{action}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ===========================================
// Predictive Loading
// Zeigt Fortschritt mit Erwartungsaufbau
// ===========================================

interface PredictiveLoadingProps {
  /** Aktuelle Schritt-Nummer */
  currentStep: number;
  /** Gesamtanzahl der Schritte */
  totalSteps: number;
  /** Schritt-Labels */
  steps: string[];
  /** Aktive Schritt-Beschreibung */
  activeDescription?: string;
  /** Ist geladen? */
  isComplete?: boolean;
}

export const PredictiveLoading = ({
  currentStep,
  totalSteps,
  steps,
  activeDescription,
  isComplete = false,
}: PredictiveLoadingProps) => {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className={`predictive-loading ${isComplete ? 'complete' : ''}`}>
      {/* Progress Bar mit Glow */}
      <div className="predictive-progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
        <div
          className="progress-glow"
          style={{ left: `${progress}%` }}
        />
      </div>

      {/* Step Indicators */}
      <div className="predictive-steps">
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isActive = stepNum === currentStep;
          const isPast = stepNum < currentStep;
          const isFuture = stepNum > currentStep;

          return (
            <div
              key={`step-${stepNum}-${step.slice(0, 20)}`}
              className={`predictive-step ${isActive ? 'active' : ''} ${isPast ? 'complete' : ''} ${isFuture ? 'pending' : ''}`}
            >
              <div className="step-dot">
                {isPast && <span className="step-check">✓</span>}
                {isActive && <span className="step-pulse" />}
                {isFuture && <span className="step-number">{stepNum}</span>}
              </div>
              <span className="step-label">{step}</span>
            </div>
          );
        })}
      </div>

      {/* Active Description */}
      {activeDescription && !isComplete && (
        <div className="predictive-description">
          <span className="description-dots">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </span>
          <span className="description-text">{activeDescription}</span>
        </div>
      )}

      {/* Complete State */}
      {isComplete && (
        <div className="predictive-complete">
          <span className="complete-icon">✓</span>
          <span className="complete-text">Fertig!</span>
        </div>
      )}
    </div>
  );
};

// ===========================================
// Hover Intent Detection
// Erkennt Benutzerabsicht vor dem Klick
// ===========================================

interface HoverIntentProps {
  /** Callback wenn Hover-Intent erkannt wird */
  onIntent: () => void;
  /** Callback wenn Intent verloren geht */
  onIntentLost?: () => void;
  /** Sensitivität (ms bis Intent erkannt) */
  sensitivity?: number;
  children: ReactNode;
  className?: string;
}

export const HoverIntent = ({
  onIntent,
  onIntentLost,
  sensitivity = 150,
  children,
  className = '',
}: HoverIntentProps) => {
  const timeoutRef = useRef<number | null>(null);
  const [hasIntent, setHasIntent] = useState(false);

  const handleMouseEnter = useCallback(() => {
    timeoutRef.current = window.setTimeout(() => {
      setHasIntent(true);
      onIntent();
    }, sensitivity);
  }, [sensitivity, onIntent]);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (hasIntent) {
      setHasIntent(false);
      onIntentLost?.();
    }
  }, [hasIntent, onIntentLost]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`hover-intent ${hasIntent ? 'has-intent' : ''} ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
};

// ===========================================
// Skeleton with Anticipation
// Skeleton das zeigt "hier kommt gleich was"
// ===========================================

interface AnticipatorySkeletonProps {
  /** Art des Skeletons */
  type: 'text' | 'card' | 'avatar' | 'button';
  /** Anzahl der Elemente */
  count?: number;
  /** Breite */
  width?: string | number;
  /** Höhe */
  height?: string | number;
  /** Zeigt Puls-Animation */
  animate?: boolean;
}

export const AnticipatorySkeletonItem = ({
  type,
  width,
  height,
  animate = true,
}: Omit<AnticipatorySkeletonProps, 'count'>) => {
  const getDefaultDimensions = () => {
    switch (type) {
      case 'text':
        return { width: '100%', height: '16px' };
      case 'card':
        return { width: '100%', height: '120px' };
      case 'avatar':
        return { width: '48px', height: '48px' };
      case 'button':
        return { width: '120px', height: '40px' };
      default:
        return { width: '100%', height: '20px' };
    }
  };

  const defaults = getDefaultDimensions();

  const style: CSSProperties = {
    width: width || defaults.width,
    height: height || defaults.height,
  };

  return (
    <div
      className={`anticipatory-skeleton ${type} ${animate ? 'animate' : ''}`}
      style={style}
      aria-hidden="true"
    >
      <div className="skeleton-shimmer" />
      <div className="skeleton-glow" />
    </div>
  );
};

export const AnticipatorySkeleton = ({
  type,
  count = 1,
  width,
  height,
  animate = true,
}: AnticipatorySkeletonProps) => {
  return (
    <div className="anticipatory-skeleton-group">
      {[...Array(count)].map((_, i) => (
        <AnticipatorySkeletonItem
          key={i}
          type={type}
          width={width}
          height={height}
          animate={animate}
        />
      ))}
    </div>
  );
};

// ===========================================
// Button with Ripple (Dopamin-Feedback)
// ===========================================

interface RippleButtonProps {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

export const RippleButton = ({
  onClick,
  children,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
  type = 'button',
}: RippleButtonProps) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;

    // Create ripple
    const button = buttonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = Date.now();

      setRipples(prev => [...prev, { x, y, id }]);

      // Remove ripple after animation
      setTimeout(() => {
        setRipples(prev => prev.filter(r => r.id !== id));
      }, 600);
    }

    onClick?.(e);
  }, [disabled, loading, onClick]);

  return (
    <button
      ref={buttonRef}
      type={type}
      className={`ripple-button ${variant} ${loading ? 'loading' : ''} ${className}`}
      onClick={handleClick}
      disabled={disabled || loading}
    >
      <span className="button-content">
        {loading ? (
          <span className="button-spinner" />
        ) : (
          children
        )}
      </span>

      {/* Ripples */}
      <span className="ripple-container">
        {ripples.map(ripple => (
          <span
            key={ripple.id}
            className="ripple"
            style={{
              left: ripple.x,
              top: ripple.y,
            }}
          />
        ))}
      </span>

      {/* Hover Glow */}
      <span className="button-glow" />
    </button>
  );
};

// ===========================================
// Scroll Progress Indicator
// ===========================================

export const ScrollProgress = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;

      const totalScrollable = documentHeight - windowHeight;
      const currentProgress = totalScrollable > 0
        ? Math.min((scrollTop / totalScrollable) * 100, 100)
        : 0;

      setProgress(currentProgress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (progress === 0) return null;

  return (
    <div
      className="scroll-progress-indicator"
      style={{ '--progress': `${progress}%` } as CSSProperties}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Scroll-Fortschritt"
    />
  );
};
