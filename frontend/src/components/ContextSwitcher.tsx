import { useState, useEffect } from 'react';
import '../neurodesign.css';

export type AIContext = 'personal' | 'work';

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

      // Suggest work during work hours on weekdays
      if (isWeekday && isWorkHours && context === 'personal') {
        setSuggestedContext('work');
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
    const interval = setInterval(checkContextSuggestion, 60000); // Check every minute

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
    <div className="context-switcher liquid-glass-nav" role="region" aria-label="Kontext-Auswahl">
      <div className="context-toggle" role="group" aria-label="Kontext wählen">
        <button
          type="button"
          className={`context-option neuro-press-effect ${context === 'personal' ? 'active' : ''}`}
          onClick={() => onContextChange('personal')}
          title="Persönlicher Kontext"
          aria-pressed={context === 'personal'}
          aria-label="Zum privaten Kontext wechseln"
        >
          <span className="context-icon" aria-hidden="true">🏠</span>
          <span className="context-label">Privat</span>
        </button>
        <button
          type="button"
          className={`context-option neuro-press-effect ${context === 'work' ? 'active' : ''}`}
          onClick={() => onContextChange('work')}
          title="Arbeits-Kontext"
          aria-pressed={context === 'work'}
          aria-label="Zum Arbeits-Kontext wechseln"
        >
          <span className="context-icon" aria-hidden="true">💼</span>
          <span className="context-label">Arbeit</span>
        </button>
      </div>

      {showSuggestion && suggestedContext && (
        <div className="context-suggestion neuro-tooltip-enhanced" role="alert" aria-live="polite">
          <span className="suggestion-text">
            Wechsel zu {suggestedContext === 'personal' ? '🏠 Privat' : '💼 Arbeit'}?
          </span>
          <button type="button" className="suggestion-accept neuro-press-effect" onClick={handleSuggestionAccept} aria-label="Kontextwechsel akzeptieren">
            Ja
          </button>
          <button type="button" className="suggestion-dismiss neuro-press-effect" onClick={handleSuggestionDismiss} aria-label="Kontextwechsel ablehnen">
            Nein
          </button>
        </div>
      )}
    </div>
  );
}

// Utility hook for context state management
// SIMPLIFIED: Always returns 'personal' - context switching disabled
export function useContextState() {
  const context: AIContext = 'personal';

  useEffect(() => {
    // Always set to personal
    document.documentElement.setAttribute('data-context', 'personal');
  }, []);

  // setContext is a no-op since we always use 'personal'
  const setContext = () => {};

  return [context, setContext] as const;
}

// Context-aware API base path
export function getApiPath(context: AIContext, endpoint: string) {
  return `/api/${context}${endpoint}`;
}
