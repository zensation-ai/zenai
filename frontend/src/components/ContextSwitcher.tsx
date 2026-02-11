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

/**
 * Get display label with icon for a context (e.g. "🏠 Privat")
 */
export function getContextLabel(context: string): string {
  const config = CONTEXT_CONFIG[context as AIContext];
  return config ? `${config.icon} ${config.label}` : context;
}
