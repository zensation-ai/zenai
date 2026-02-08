/**
 * QuickActions - Suggested action chips for the floating assistant
 *
 * Renders horizontally scrollable quick action buttons that pre-fill
 * the chat input with common prompts. Context-aware: shows different
 * suggestions based on the current page.
 */

import type { Page } from '../../types';

interface QuickAction {
  icon: string;
  label: string;
  prompt: string;
}

interface QuickActionsProps {
  currentPage: Page;
  onAction: (prompt: string) => void;
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { icon: '\u{1F4C5}', label: 'Meeting', prompt: 'Erstelle ein Meeting ' },
  { icon: '\u{1F4A1}', label: 'Idee', prompt: 'Neue Idee: ' },
  { icon: '\u{1F50D}', label: 'Suche', prompt: 'Suche nach ' },
  { icon: '\u{2753}', label: 'Hilfe', prompt: 'Wie funktioniert ' },
];

const PAGE_ACTIONS: Partial<Record<Page, QuickAction[]>> = {
  meetings: [
    { icon: '\u{1F4C5}', label: 'Neues Meeting', prompt: 'Erstelle ein Meeting ' },
    { icon: '\u{1F50D}', label: 'Suche', prompt: 'Suche nach ' },
    { icon: '\u{2753}', label: 'Hilfe', prompt: 'Wie funktioniert die Meeting-Seite?' },
  ],
  ideas: [
    { icon: '\u{1F4A1}', label: 'Neue Idee', prompt: 'Neue Idee: ' },
    { icon: '\u{1F50D}', label: 'Suche', prompt: 'Suche nach meinen Ideen zu ' },
    { icon: '\u{2753}', label: 'Hilfe', prompt: 'Wie funktioniert die Gedanken-Seite?' },
  ],
  insights: [
    { icon: '\u{1F4CA}', label: 'Insights', prompt: 'Was sind meine wichtigsten Insights?' },
    { icon: '\u{2753}', label: 'Hilfe', prompt: 'Wie funktioniert die Insights-Seite?' },
  ],
  documents: [
    { icon: '\u{1F4C4}', label: 'Dokument', prompt: 'Analysiere mein Dokument ' },
    { icon: '\u{1F50D}', label: 'Suche', prompt: 'Suche in meinen Dokumenten nach ' },
    { icon: '\u{2753}', label: 'Hilfe', prompt: 'Wie funktioniert die Dokumente-Seite?' },
  ],
};

export function QuickActions({ currentPage, onAction }: QuickActionsProps) {
  const actions = PAGE_ACTIONS[currentPage] || DEFAULT_ACTIONS;

  return (
    <div className="assistant-quick-actions" role="toolbar" aria-label="Schnellaktionen">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="assistant-quick-action"
          onClick={() => onAction(action.prompt)}
          title={action.prompt}
        >
          <span className="assistant-quick-action-icon" aria-hidden="true">{action.icon}</span>
          {action.label}
        </button>
      ))}
    </div>
  );
}
