import './ContextSelectorCards.css';

type ContextId = 'personal' | 'work' | 'learning' | 'creative';

interface ContextCard {
  id: ContextId;
  label: string;
  description: string;
}

const CONTEXTS: ContextCard[] = [
  {
    id: 'personal',
    label: 'Persoenlich',
    description: 'Notizen, Ideen, private Gedanken',
  },
  {
    id: 'work',
    label: 'Arbeit',
    description: 'Projekte, Meetings, berufliche Aufgaben',
  },
  {
    id: 'learning',
    label: 'Lernen',
    description: 'Kurse, Fakten, Wissensaufbau',
  },
  {
    id: 'creative',
    label: 'Kreativ',
    description: 'Ideen, Entwuerfe, kreative Projekte',
  },
];

interface ContextSelectorCardsProps {
  onSelect: (context: ContextId) => void;
  selectedContext?: ContextId;
}

export function ContextSelectorCards({ onSelect, selectedContext }: ContextSelectorCardsProps) {
  return (
    <div className="context-selector-cards">
      {CONTEXTS.map(ctx => (
        <button
          key={ctx.id}
          type="button"
          className={`context-selector-cards__card context-selector-cards__card--${ctx.id}${selectedContext === ctx.id ? ' context-selector-cards__card--selected' : ''}`}
          onClick={() => onSelect(ctx.id)}
          aria-pressed={selectedContext === ctx.id}
        >
          <span className="context-selector-cards__dot" aria-hidden="true" />
          <span className="context-selector-cards__label">{ctx.label}</span>
          <span className="context-selector-cards__desc">{ctx.description}</span>
        </button>
      ))}
    </div>
  );
}
