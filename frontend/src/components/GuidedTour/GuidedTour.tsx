/**
 * GuidedTour — Spotlight Overlay Tour Component
 *
 * Renders a full-screen dimmed overlay with a spotlight cutout around the
 * target element and a glass tooltip card positioned relative to it.
 * Calls onNavigate when the step changes so the app routes to the right page.
 */

import { useEffect, useState, useRef } from 'react';
import type { TourStep } from './tour-steps';
import './GuidedTour.css';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface GuidedTourProps {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  step: TourStep;
  next: () => void;
  back: () => void;
  skip: () => void;
  onNavigate: (page: string) => void;
}

const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT_EST = 200;
const GAP = 16;

function getTooltipStyle(
  spotlight: SpotlightRect | null,
  position: TourStep['position'],
): React.CSSProperties {
  if (!spotlight) {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  const { top, left, width, height } = spotlight;

  switch (position) {
    case 'bottom':
      return {
        position: 'fixed',
        top: top + height + GAP,
        left: Math.max(GAP, Math.min(left + width / 2 - TOOLTIP_WIDTH / 2, window.innerWidth - TOOLTIP_WIDTH - GAP)),
      };
    case 'top':
      return {
        position: 'fixed',
        top: Math.max(GAP, top - TOOLTIP_HEIGHT_EST - GAP),
        left: Math.max(GAP, Math.min(left + width / 2 - TOOLTIP_WIDTH / 2, window.innerWidth - TOOLTIP_WIDTH - GAP)),
      };
    case 'right':
      return {
        position: 'fixed',
        top: Math.max(GAP, top + height / 2 - TOOLTIP_HEIGHT_EST / 2),
        left: left + width + GAP,
      };
    case 'left':
      return {
        position: 'fixed',
        top: Math.max(GAP, top + height / 2 - TOOLTIP_HEIGHT_EST / 2),
        left: Math.max(GAP, left - TOOLTIP_WIDTH - GAP),
      };
    default:
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
  }
}

export function GuidedTour({
  isActive,
  currentStep,
  totalSteps,
  step,
  next,
  back,
  skip,
  onNavigate,
}: GuidedTourProps) {
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const prevPageRef = useRef<string>('');

  // Navigate to the step's page when the step changes
  useEffect(() => {
    if (!isActive) return;
    if (step.page !== prevPageRef.current) {
      prevPageRef.current = step.page;
      onNavigate(step.page);
    }
  }, [isActive, step.page, onNavigate]);

  // Find the target element and measure its position
  useEffect(() => {
    if (!isActive) return;

    function measureTarget() {
      const el = document.querySelector(step.targetSelector);
      if (el) {
        const rect = el.getBoundingClientRect();
        setSpotlight({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      } else {
        setSpotlight(null);
      }
    }

    // Give the page a moment to render after navigation
    const timer = setTimeout(measureTarget, 300);
    window.addEventListener('resize', measureTarget);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measureTarget);
    };
  }, [isActive, step.targetSelector, currentStep]);

  // Escape key skips the tour
  useEffect(() => {
    if (!isActive) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isActive, skip]);

  if (!isActive) return null;

  const tooltipStyle = getTooltipStyle(spotlight, step.position);

  const spotlightBoxShadow = spotlight
    ? `0 0 0 9999px rgba(0, 0, 0, 0.72)`
    : undefined;

  return (
    <div className="guided-tour-overlay" role="dialog" aria-modal="true" aria-label={`Tour Schritt ${currentStep + 1} von ${totalSteps}: ${step.title}`}>
      {/* Spotlight cutout */}
      {spotlight && (
        <div
          className="guided-tour-spotlight"
          style={{
            top: spotlight.top - 6,
            left: spotlight.left - 6,
            width: spotlight.width + 12,
            height: spotlight.height + 12,
            boxShadow: spotlightBoxShadow,
          }}
          aria-hidden="true"
        />
      )}

      {/* Dim backdrop when no spotlight */}
      {!spotlight && (
        <div className="guided-tour-backdrop" aria-hidden="true" />
      )}

      {/* Tooltip card */}
      <div
        className="guided-tour-tooltip animate-spring-in"
        style={tooltipStyle}
      >
        {/* Step indicator */}
        <div className="guided-tour-step-indicator">
          <span className="guided-tour-step-label">Schritt {currentStep + 1} / {totalSteps}</span>
        </div>

        {/* Content */}
        <h3 className="guided-tour-title">{step.title}</h3>
        <p className="guided-tour-description">{step.description}</p>

        {/* Progress dots */}
        <div className="guided-tour-dots" role="list" aria-label="Tour-Fortschritt">
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={`guided-tour-dot${i === currentStep ? ' guided-tour-dot--active' : ''}`}
              role="listitem"
              aria-label={`Schritt ${i + 1}${i === currentStep ? ' (aktuell)' : ''}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="guided-tour-actions">
          <button
            type="button"
            className="guided-tour-btn guided-tour-btn--ghost"
            onClick={skip}
          >
            Überspringen
          </button>

          <div className="guided-tour-nav">
            {currentStep > 0 && (
              <button
                type="button"
                className="guided-tour-btn guided-tour-btn--secondary"
                onClick={back}
              >
                Zurück
              </button>
            )}
            <button
              type="button"
              className="guided-tour-btn guided-tour-btn--primary"
              onClick={next}
              autoFocus
            >
              {currentStep === totalSteps - 1 ? 'Fertig' : 'Weiter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GuidedTour;
