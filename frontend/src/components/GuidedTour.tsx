import { useState, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { safeLocalStorage } from '../utils/storage';
import './GuidedTour.css';

export interface TourStep {
  id: string;
  /** CSS selector for the target element */
  target: string;
  /** Title of the step */
  title: string;
  /** Description/content */
  content: string;
  /** Tooltip placement relative to target */
  placement: 'top' | 'bottom' | 'left' | 'right';
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface GuidedTourProps {
  /** Array of tour steps */
  steps: TourStep[];
  /** Whether the tour is active */
  isActive: boolean;
  /** Callback when tour ends (completed or skipped) */
  onEnd: () => void;
  /** Storage key for completion status */
  storageKey?: string;
}

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Calculate tooltip position based on target element and placement
 */
function calculatePosition(
  targetRect: DOMRect,
  placement: TourStep['placement'],
  tooltipWidth: number = 320,
  tooltipHeight: number = 180
): TooltipPosition {
  const padding = 16;
  const arrowSize = 12;
  let top = 0;
  let left = 0;

  switch (placement) {
    case 'top':
      top = targetRect.top - tooltipHeight - arrowSize - padding;
      left = targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2);
      break;
    case 'bottom':
      top = targetRect.bottom + arrowSize + padding;
      left = targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2);
      break;
    case 'left':
      top = targetRect.top + (targetRect.height / 2) - (tooltipHeight / 2);
      left = targetRect.left - tooltipWidth - arrowSize - padding;
      break;
    case 'right':
      top = targetRect.top + (targetRect.height / 2) - (tooltipHeight / 2);
      left = targetRect.right + arrowSize + padding;
      break;
  }

  // Keep within viewport
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (left < padding) left = padding;
  if (left + tooltipWidth > viewportWidth - padding) {
    left = viewportWidth - tooltipWidth - padding;
  }
  if (top < padding) top = padding;
  if (top + tooltipHeight > viewportHeight - padding) {
    top = viewportHeight - tooltipHeight - padding;
  }

  // Determine arrow position (opposite of placement)
  const arrowPosition = placement === 'top' ? 'bottom' :
                        placement === 'bottom' ? 'top' :
                        placement === 'left' ? 'right' : 'left';

  return { top, left, arrowPosition };
}

/**
 * Tour Spotlight Component
 * Highlights the target element with a dark overlay
 */
const TourSpotlight = memo(function TourSpotlight({
  targetRect,
}: {
  targetRect: DOMRect | null;
}) {
  if (!targetRect) return null;

  const padding = 8;

  return (
    <div className="tour-spotlight-container">
      {/* Overlay with cutout */}
      <svg className="tour-overlay-svg" width="100%" height="100%">
        <defs>
          <mask id="spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={targetRect.left - padding}
              y={targetRect.top - padding}
              width={targetRect.width + padding * 2}
              height={targetRect.height + padding * 2}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Highlight border around target */}
      <div
        className="tour-highlight"
        style={{
          top: targetRect.top - padding,
          left: targetRect.left - padding,
          width: targetRect.width + padding * 2,
          height: targetRect.height + padding * 2,
        }}
      />
    </div>
  );
});

/**
 * Tour Tooltip Component
 */
const TourTooltip = memo(function TourTooltip({
  step,
  currentIndex,
  totalSteps,
  position,
  onNext,
  onSkip,
  onPrev,
}: {
  step: TourStep;
  currentIndex: number;
  totalSteps: number;
  position: TooltipPosition;
  onNext: () => void;
  onSkip: () => void;
  onPrev: () => void;
}) {
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalSteps - 1;

  return (
    <div
      className={`tour-tooltip tour-tooltip-${position.arrowPosition}`}
      style={{
        top: position.top,
        left: position.left,
      }}
      role="dialog"
      aria-label={step.title}
    >
      <div className="tour-tooltip-content">
        <div className="tour-progress">
          <span className="tour-step-indicator">
            {currentIndex + 1} / {totalSteps}
          </span>
          <button
            type="button"
            className="tour-skip-btn"
            onClick={onSkip}
            aria-label="Tour \u00FCberspringen"
          >
            \u00D7
          </button>
        </div>

        <h4 className="tour-title">{step.title}</h4>
        <p className="tour-description">{step.content}</p>

        {step.action && (
          <button
            type="button"
            className="tour-action-btn neuro-press-effect"
            onClick={step.action.onClick}
          >
            {step.action.label}
          </button>
        )}

        <div className="tour-navigation">
          {!isFirst && (
            <button
              type="button"
              className="tour-nav-btn tour-prev-btn"
              onClick={onPrev}
            >
              \u2190 Zur\u00FCck
            </button>
          )}
          <button
            type="button"
            className="tour-nav-btn tour-next-btn neuro-press-effect"
            onClick={onNext}
          >
            {isLast ? 'Fertig \u2713' : 'Weiter \u2192'}
          </button>
        </div>
      </div>

      <div className={`tour-arrow tour-arrow-${position.arrowPosition}`} />
    </div>
  );
});

/**
 * Guided Tour Component
 * Provides an interactive walkthrough of app features
 */
export const GuidedTour = memo(function GuidedTour({
  steps,
  isActive,
  onEnd,
  storageKey = 'guidedTourComplete',
}: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);

  // Find and measure target element
  useEffect(() => {
    if (!isActive || !steps[currentStep]) return;

    const step = steps[currentStep];
    const targetElement = document.querySelector(step.target);

    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      setTargetRect(rect);
      setTooltipPosition(calculatePosition(rect, step.placement));

      // Scroll target into view if needed
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // Target not found, skip to next step
      console.warn(`Tour target not found: ${step.target}`);
      if (currentStep < steps.length - 1) {
        setCurrentStep(prev => prev + 1);
      }
    }

    // Update on resize
    const handleResize = () => {
      const el = document.querySelector(step.target);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        setTooltipPosition(calculatePosition(rect, step.placement));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isActive, currentStep, steps]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Tour complete
      safeLocalStorage('set', storageKey, 'true');
      onEnd();
    }
  }, [currentStep, steps.length, onEnd, storageKey]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    safeLocalStorage('set', storageKey, 'true');
    onEnd();
  }, [onEnd, storageKey]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleNext, handlePrev, handleSkip]);

  if (!isActive || !steps[currentStep] || !tooltipPosition) return null;

  return createPortal(
    <div className="guided-tour-container">
      <TourSpotlight targetRect={targetRect} />
      <TourTooltip
        step={steps[currentStep]}
        currentIndex={currentStep}
        totalSteps={steps.length}
        position={tooltipPosition}
        onNext={handleNext}
        onPrev={handlePrev}
        onSkip={handleSkip}
      />
    </div>,
    document.body
  );
});

/**
 * Default tour steps for the main app
 */
export const MAIN_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: '.hero-brain',
    title: 'Willkommen bei My Brain!',
    content: 'Hier siehst du deinen KI-Assistenten. Er hilft dir, Gedanken zu strukturieren und Verbindungen zu finden.',
    placement: 'bottom',
  },
  {
    id: 'command-center',
    target: '.command-center',
    title: 'Dein Eingabebereich',
    content: 'Tippe hier deine Gedanken ein oder nutze das Mikrofon f\u00FCr Sprachaufnahmen. Dr\u00FCcke Cmd+Enter zum Speichern.',
    placement: 'top',
  },
  {
    id: 'navigation',
    target: '.header-nav',
    title: 'Navigation',
    content: 'Wechsle zwischen Gedanken, Insights, Archiv und Einstellungen. Jeder Bereich bietet unterschiedliche Funktionen.',
    placement: 'bottom',
  },
  {
    id: 'quick-stats',
    target: '.quick-stats',
    title: 'Schnell\u00FCbersicht',
    content: 'Hier siehst du auf einen Blick deine Kategorien und Priorit\u00E4ten. Klicke auf einen Filter, um die Ansicht einzugrenzen.',
    placement: 'top',
  },
  {
    id: 'keyboard-help',
    target: '.theme-toggle',
    title: 'Tastenkombinationen',
    content: 'Dr\u00FCcke ? um alle Tastenkombinationen zu sehen. Mit Cmd+K \u00F6ffnest du die Schnellsuche.',
    placement: 'left',
  },
];

/**
 * Hook to manage guided tour state
 */
export function useGuidedTour(storageKey = 'guidedTourComplete') {
  const [isActive, setIsActive] = useState(false);
  const [hasCompleted, setHasCompleted] = useState(() => {
    return safeLocalStorage('get', storageKey) === 'true';
  });

  const startTour = useCallback(() => {
    setIsActive(true);
  }, []);

  const endTour = useCallback(() => {
    setIsActive(false);
    setHasCompleted(true);
  }, []);

  const resetTour = useCallback(() => {
    safeLocalStorage('remove', storageKey);
    setHasCompleted(false);
  }, [storageKey]);

  return {
    isActive,
    hasCompleted,
    startTour,
    endTour,
    resetTour,
  };
}
