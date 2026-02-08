import { useState, useEffect, useCallback } from 'react';
import '../neurodesign.css';

export type AIContext = 'personal' | 'work' | 'learning' | 'creative';

const CONTEXT_CONFIG: Record<AIContext, { icon: string; label: string; color: string }> = {
  personal: { icon: '🏠', label: 'Privat', color: 'var(--success)' },
  work: { icon: '💼', label: 'Arbeit', color: 'var(--info)' },
  learning: { icon: '📚', label: 'Lernen', color: 'var(--warning)' },
  creative: { icon: '🎨', label: 'Kreativ', color: 'var(--accent)' },
};

const STORAGE_KEY = 'zenai-context';

interface ContextSwitcherProps {
  context: AIContext;
  onContextChange: (context: AIContext) => void;
}

export function ContextSwitcher({ context, onContextChange }: ContextSwitcherProps) {
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [suggestedContext, setSuggestedContext] = useState<AIContext | null>(null);

  // Check for context suggestion based on time
  useEffect(() => {
    const checkContextSuggestion = () => {
      const now = new Date();
      const hour = now.getHours();
      const day = now.getDay();

      const isWeekday = day >= 1 && day <= 5;
      const isWorkHours = hour >= 8 && hour < 18;
      const isEveningLearning = hour >= 19 && hour < 22;

      // Suggest work during work hours on weekdays
      if (isWeekday && isWorkHours && context === 'personal') {
        setSuggestedContext('work');
        setShowSuggestion(true);
      }
      // Suggest learning in the evening
      else if (isEveningLearning && (context === 'work' || context === 'personal')) {
        setSuggestedContext('learning');
        setShowSuggestion(true);
      }
      // Suggest personal outside work hours
      else if ((!isWeekday || !isWorkHours) && context === 'work') {
        setSuggestedContext('personal');
        setShowSuggestion(true);
      } else {
        setShowSuggestion(false);
        setSuggestedContext(null);
      }
    };

    checkContextSuggestion();
    const interval = setInterval(checkContextSuggestion, 60000);

    return () => clearInterval(interval);
  }, [context]);

  const handleSuggestionAccept = () => {
    if (suggestedContext) {
      onContextChange(suggestedContext);
      setShowSuggestion(false);
    }
  };

  const handleSuggestionDismiss = () => {
    setShowSuggestion(false);
  };

  return (
    <div className="context-switcher" role="region" aria-label="Kontext-Auswahl">
      <div className="context-toggle" role="group" aria-label="Kontext wählen">
        {(Object.keys(CONTEXT_CONFIG) as AIContext[]).map((ctx) => {
          const config = CONTEXT_CONFIG[ctx];
          const isActive = context === ctx;
          return (
            <button
              key={ctx}
              type="button"
              className={`context-option neuro-press-effect neuro-focus-ring ${isActive ? 'active' : ''}`}
              onClick={() => onContextChange(ctx)}
              title={`${config.label}-Kontext`}
              aria-pressed={isActive ? 'true' : 'false'}
              aria-label={`Zum ${config.label}-Kontext wechseln`}
              data-context={ctx}
            >
              <span className="context-icon" aria-hidden="true">{config.icon}</span>
              <span className="context-label">{config.label}</span>
            </button>
          );
        })}
      </div>

      {showSuggestion && suggestedContext && (
        <div className="context-suggestion neuro-tooltip-enhanced" role="alert" aria-live="polite">
          <span className="suggestion-text">
            Wechsel zu {CONTEXT_CONFIG[suggestedContext].icon} {CONTEXT_CONFIG[suggestedContext].label}?
          </span>
          <button
            type="button"
            className="suggestion-accept neuro-press-effect neuro-focus-ring"
            onClick={handleSuggestionAccept}
            aria-label="Kontextwechsel akzeptieren"
          >
            Ja
          </button>
          <button
            type="button"
            className="suggestion-dismiss neuro-press-effect neuro-focus-ring"
            onClick={handleSuggestionDismiss}
            aria-label="Kontextwechsel ablehnen"
          >
            Nein
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Hook for context state management with localStorage persistence
 */
export function useContextState() {
  const [context, setContextInternal] = useState<AIContext>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && ['personal', 'work', 'learning', 'creative'].includes(saved)) {
        return saved as AIContext;
      }
    } catch {
      // localStorage not available
    }
    return 'personal';
  });

  const setContext = useCallback((newContext: AIContext) => {
    setContextInternal(newContext);
    try {
      localStorage.setItem(STORAGE_KEY, newContext);
    } catch {
      // localStorage not available
    }
    // Update document attribute for CSS theming
    document.documentElement.setAttribute('data-context', newContext);
  }, []);

  // Initialize document attribute on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-context', context);
  }, [context]);

  return [context, setContext] as const;
}

/**
 * Context-aware API base path
 */
export function getApiPath(context: AIContext, endpoint: string) {
  return `/api/${context}${endpoint}`;
}

/**
 * Get context configuration
 */
export function getContextConfig(context: AIContext) {
  return CONTEXT_CONFIG[context];
}
