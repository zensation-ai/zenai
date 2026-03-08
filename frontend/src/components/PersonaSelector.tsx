import { useState, useEffect } from 'react';
import axios from 'axios';
import type { AIContext } from './ContextSwitcher';
import { safeLocalStorage } from '../utils/storage';
import { showToast } from './Toast';
import { logError } from '../utils/errors';

export interface Persona {
  id: string;
  displayName: string;
  icon: string;
  description: string;
  isDefault: boolean;
}

interface PersonaSelectorProps {
  context: AIContext;
  selectedPersona: string | null;
  onPersonaChange: (personaId: string) => void;
}

export function PersonaSelector({ context, selectedPersona, onPersonaChange }: PersonaSelectorProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load personas when context changes (NOT when selectedPersona changes - avoids loop)
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const loadPersonas = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`/api/${context}/personas`, {
          signal: abortController.signal
        });

        if (!isMounted) return;

        const loadedPersonas = response.data.personas as Persona[];
        setPersonas(loadedPersonas);

        // Auto-select default if current persona is invalid for this context
        const currentPersonaValid = selectedPersona && loadedPersonas.some((p: Persona) => p.id === selectedPersona);
        if (!currentPersonaValid) {
          const defaultPersona = loadedPersonas.find((p: Persona) => p.isDefault);
          if (defaultPersona) {
            onPersonaChange(defaultPersona.id);
          }
        }
      } catch (error) {
        if (axios.isCancel(error)) return;
        if (!isMounted) return;

        logError('PersonaSelector:loadPersonas', error);
        showToast('Personas konnten nicht geladen werden', 'error');
        setPersonas([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadPersonas();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Only reload on context change, not on persona/callback changes
  }, [context]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.persona-selector')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen]);

  const currentPersona = personas.find(p => p.id === selectedPersona) || personas.find(p => p.isDefault);

  if (loading || personas.length === 0) {
    return null;
  }

  return (
    <div className="persona-selector">
      <button
        type="button"
        className="persona-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title={currentPersona?.description}
      >
        <span className="persona-icon">{currentPersona?.icon}</span>
        <span className="persona-name">{currentPersona?.displayName}</span>
        <span className="persona-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="persona-dropdown">
          {personas.map((persona) => (
            <button
              key={persona.id}
              type="button"
              className={`persona-option ${persona.id === selectedPersona ? 'active' : ''}`}
              onClick={() => {
                onPersonaChange(persona.id);
                setIsOpen(false);
              }}
            >
              <span className="persona-icon">{persona.icon}</span>
              <div className="persona-info">
                <span className="persona-name">{persona.displayName}</span>
                <span className="persona-description">{persona.description}</span>
              </div>
              {persona.isDefault && <span className="persona-default-badge">Standard</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Valid personas per context - must match backend config/personas.ts CONTEXT_PERSONAS
// learning and creative contexts reuse PERSONAL_PERSONAS on the backend
const VALID_PERSONAS: Record<AIContext, string[]> = {
  personal: ['companion', 'coach', 'creative'],
  work: ['coordinator', 'analyst', 'strategist'],
  learning: ['companion', 'coach', 'creative'],
  creative: ['companion', 'coach', 'creative'],
};

// Hook for managing persona state per context
export function usePersonaState(context: AIContext) {
  const storageKey = `${context}Persona`;

  const [persona, setPersona] = useState<string | null>(() => {
    const saved = safeLocalStorage('get', storageKey);
    // Validate that saved persona is valid for this context
    if (saved && VALID_PERSONAS[context]?.includes(saved)) {
      return saved;
    }
    return null; // Will use default
  });

  useEffect(() => {
    if (persona) {
      safeLocalStorage('set', storageKey, persona);
    }
  }, [persona, storageKey]);

  // Reset persona when context changes - validate against new context's valid personas
  useEffect(() => {
    const savedPersona = safeLocalStorage('get', storageKey);
    // Only use saved persona if it's valid for this context
    if (savedPersona && VALID_PERSONAS[context]?.includes(savedPersona)) {
      setPersona(savedPersona);
    } else {
      // Reset to null (will trigger default selection in PersonaSelector)
      setPersona(null);
    }
  }, [context, storageKey]);

  return [persona, setPersona] as const;
}
