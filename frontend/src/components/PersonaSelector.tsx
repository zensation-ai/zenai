import { useState, useEffect } from 'react';
import axios from 'axios';
import type { AIContext } from './ContextSwitcher';

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

  // Load personas when context changes
  useEffect(() => {
    const loadPersonas = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`/api/${context}/personas`);
        setPersonas(response.data.personas);

        // If no persona selected, use the default
        if (!selectedPersona) {
          const defaultPersona = response.data.personas.find((p: Persona) => p.isDefault);
          if (defaultPersona) {
            onPersonaChange(defaultPersona.id);
          }
        }
      } catch (error) {
        console.error('Failed to load personas:', error);
        setPersonas([]);
      } finally {
        setLoading(false);
      }
    };

    loadPersonas();
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

// Hook for managing persona state per context
export function usePersonaState(context: AIContext) {
  const storageKey = `${context}Persona`;

  const [persona, setPersona] = useState<string | null>(() => {
    return localStorage.getItem(storageKey);
  });

  useEffect(() => {
    if (persona) {
      localStorage.setItem(storageKey, persona);
    }
  }, [persona, storageKey]);

  // Reset to null (use default) when context changes
  useEffect(() => {
    const savedPersona = localStorage.getItem(storageKey);
    setPersona(savedPersona);
  }, [context, storageKey]);

  return [persona, setPersona] as const;
}
