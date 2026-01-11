import { useState, useEffect } from 'react';
import { safeLocalStorage } from '../utils/storage';

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
    <div className="context-switcher" role="region" aria-label="Kontext-Auswahl">
      <div className="context-toggle" role="group" aria-label="Kontext wählen">
        <button
          type="button"
          className={`context-option ${context === 'personal' ? 'active' : ''}`}
          onClick={() => onContextChange('personal')}
          title="Persönlicher Kontext"
          aria-pressed={context === 'personal'}
          aria-label="Privater Kontext"
        >
          <span className="context-icon" aria-hidden="true">🏠</span>
          <span className="context-label">Privat</span>
        </button>
        <button
          type="button"
          className={`context-option ${context === 'work' ? 'active' : ''}`}
          onClick={() => onContextChange('work')}
          title="Arbeits-Kontext"
          aria-pressed={context === 'work'}
          aria-label="Arbeits-Kontext"
        >
          <span className="context-icon" aria-hidden="true">💼</span>
          <span className="context-label">Arbeit</span>
        </button>
      </div>

      {showSuggestion && suggestedContext && (
        <div className="context-suggestion" role="alert" aria-live="polite">
          <span className="suggestion-text">
            Wechsel zu {suggestedContext === 'personal' ? '🏠 Privat' : '💼 Arbeit'}?
          </span>
          <button type="button" className="suggestion-accept" onClick={handleSuggestionAccept} aria-label="Kontextwechsel akzeptieren">
            Ja
          </button>
          <button type="button" className="suggestion-dismiss" onClick={handleSuggestionDismiss} aria-label="Kontextwechsel ablehnen">
            Nein
          </button>
        </div>
      )}
    </div>
  );
}

// Utility hook for context state management
export function useContextState() {
  const [context, setContext] = useState<AIContext>(() => {
    const saved = safeLocalStorage('get', 'aiContext');
    return (saved as AIContext) || 'personal';
  });

  useEffect(() => {
    safeLocalStorage('set', 'aiContext', context);

    // Update document class for theming
    document.documentElement.setAttribute('data-context', context);
  }, [context]);

  return [context, setContext] as const;
}

// Context-aware API base path
export function getApiPath(context: AIContext, endpoint: string) {
  return `/api/${context}${endpoint}`;
}
