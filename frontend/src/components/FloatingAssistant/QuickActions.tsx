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
  { icon: '\u{1F4A1}', label: 'Idee', prompt: 'Neue Idee: ' },
  { icon: '\u{1F50D}', label: 'Suche', prompt: 'Suche nach ' },
  { icon: '\u{1F4C5}', label: 'Termin', prompt: 'Erstelle einen Termin: ' },
  { icon: '\u{2753}', label: 'Hilfe', prompt: 'Wie funktioniert ' },
];

const PAGE_ACTIONS: Partial<Record<Page, QuickAction[]>> = {
  home: [
    { icon: '\u{1F4CA}', label: 'Status', prompt: 'Was steht heute an?' },
    { icon: '\u{1F4A1}', label: 'Idee', prompt: 'Neue Idee: ' },
    { icon: '\u{1F50D}', label: 'Suche', prompt: 'Suche nach ' },
    { icon: '\u{2753}', label: 'Hilfe', prompt: 'Was kann ich hier alles machen?' },
  ],
  chat: [
    { icon: '\u{1F4A1}', label: 'Idee', prompt: 'Neue Idee: ' },
    { icon: '\u{1F50D}', label: 'Suche', prompt: 'Suche nach ' },
    { icon: '\u{1F4DD}', label: 'Zusammenfassung', prompt: 'Fasse zusammen: ' },
    { icon: '\u{1F310}', label: 'Web', prompt: 'Suche im Web nach ' },
  ],
  ideas: [
    { icon: '\u{1F4A1}', label: 'Neue Idee', prompt: 'Neue Idee: ' },
    { icon: '\u{1F50D}', label: 'Suche', prompt: 'Suche nach meinen Ideen zu ' },
    { icon: '\u{1F4CA}', label: 'Statistik', prompt: 'Wie viele Ideen habe ich insgesamt?' },
  ],
  workshop: [
    { icon: '\u{2728}', label: 'Vorschlaege', prompt: 'Was schlaegst du vor?' },
    { icon: '\u{1F916}', label: 'Agent', prompt: 'Starte einen Agent-Task: ' },
    { icon: '\u{1F517}', label: 'Verbinden', prompt: 'Welche meiner Ideen passen zusammen?' },
  ],
  calendar: [
    { icon: '\u{1F4C5}', label: 'Termin', prompt: 'Erstelle einen Termin: ' },
    { icon: '\u{1F4CB}', label: 'Aufgabe', prompt: 'Erstelle eine Aufgabe: ' },
    { icon: '\u{1F4C6}', label: 'Heute', prompt: 'Was steht heute an?' },
  ],
  email: [
    { icon: '\u{2709}', label: 'E-Mail', prompt: 'Schreibe eine E-Mail an ' },
    { icon: '\u{1F4E5}', label: 'Posteingang', prompt: 'Zeige meine neuesten E-Mails' },
    { icon: '\u{1F4DD}', label: 'Entwurf', prompt: 'Erstelle einen E-Mail-Entwurf: ' },
  ],
  documents: [
    { icon: '\u{1F4C4}', label: 'Dokument', prompt: 'Analysiere mein Dokument ' },
    { icon: '\u{1F50D}', label: 'Suche', prompt: 'Suche in meinen Dokumenten nach ' },
    { icon: '\u{2753}', label: 'Hilfe', prompt: 'Wie funktioniert die Wissensbasis?' },
  ],
  insights: [
    { icon: '\u{1F4CA}', label: 'Insights', prompt: 'Was sind meine wichtigsten Insights?' },
    { icon: '\u{1F517}', label: 'Verbindungen', prompt: 'Welche Verbindungen gibt es zwischen meinen Ideen?' },
  ],
  business: [
    { icon: '\u{1F4C8}', label: 'Umsatz', prompt: 'Wie ist der aktuelle Umsatz?' },
    { icon: '\u{1F4CA}', label: 'Traffic', prompt: 'Zeige mir die Besucherzahlen' },
    { icon: '\u{1F4DD}', label: 'Bericht', prompt: 'Erstelle einen Business-Bericht' },
  ],
  learning: [
    { icon: '\u{1F4DA}', label: 'Lernziel', prompt: 'Neues Lernziel: ' },
    { icon: '\u{2753}', label: 'Erklaerung', prompt: 'Erklaere mir einfach: ' },
    { icon: '\u{1F9E9}', label: 'Quiz', prompt: 'Erstelle ein Quiz zu: ' },
  ],
  'my-ai': [
    { icon: '\u{1F9E0}', label: 'KI-Wissen', prompt: 'Was weisst du ueber mich?' },
    { icon: '\u{2699}', label: 'Anpassen', prompt: 'Wie kann ich dich besser anpassen?' },
  ],
  settings: [
    { icon: '\u{2753}', label: 'Hilfe', prompt: 'Welche Einstellungen gibt es?' },
    { icon: '\u{1F50D}', label: 'Suche', prompt: 'Wo finde ich die Einstellung fuer ' },
  ],
  contacts: [
    { icon: '\u{1F464}', label: 'Kontakt', prompt: 'Suche nach Kontakt ' },
    { icon: '\u{2795}', label: 'Neu', prompt: 'Erstelle einen neuen Kontakt: ' },
  ],
  finance: [
    { icon: '\u{1F4B0}', label: 'Ausgaben', prompt: 'Zeige meine letzten Ausgaben' },
    { icon: '\u{1F4CA}', label: 'Budget', prompt: 'Wie steht es um mein Budget?' },
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
