/**
 * Assistant Knowledge Service
 *
 * Provides app-specific knowledge for the floating AI assistant ("Zen").
 * Contains navigation structure, feature descriptions, and capabilities.
 * Used to build the assistant's system prompt so it can answer app questions
 * and guide users through features.
 *
 * IMPORTANT: Keep routes in sync with frontend/src/navigation.ts
 */

import { logger } from '../utils/logger';

// Feature descriptions keyed by topic keywords
const FEATURE_MAP: Record<string, { title: string; page: string; description: string }> = {
  // === Dashboard ===
  dashboard: {
    title: 'Dashboard',
    page: '/',
    description: 'Startseite mit Schnellzugriff auf haeufig genutzte Features, aktuelle Statistiken und Quick Actions.',
  },

  // === Chat ===
  chat: {
    title: 'Chat',
    page: '/chat',
    description: 'Vollbild-Chat mit der KI. Hier kannst du laenger und ausfuehrlicher mit der KI sprechen. Unterstuetzt Bilder, Spracheingabe, Extended Thinking und Code-Ausfuehrung.',
  },

  // === Browser ===
  browser: {
    title: 'Browser',
    page: '/browser',
    description: 'Eingebetteter Browser zum Durchsuchen und Speichern von Webseiten direkt in der App.',
  },

  // === Ideen Sektion ===
  gedanken: {
    title: 'Gedanken',
    page: '/ideas',
    description: 'Alle Ideen, Notizen und Gedanken verwalten. 4 Tabs: Aktiv, Inkubator, Archiv, Sortieren. Per Spracheingabe oder Text neue Gedanken erfassen. Die KI strukturiert sie automatisch.',
  },
  ideas: {
    title: 'Gedanken',
    page: '/ideas',
    description: 'Die Hauptseite fuer deine Ideen. Suchen, filtern, priorisieren, archivieren. Semantische Suche ueber Embeddings.',
  },
  inkubator: {
    title: 'Inkubator',
    page: '/ideas/incubator',
    description: 'Ideen reifen lassen. Die KI entwickelt Gedanken im Hintergrund weiter und schlaegt Verbindungen vor.',
  },
  archiv: {
    title: 'Archiv',
    page: '/ideas/archive',
    description: 'Archivierte Gedanken durchsuchen und wiederherstellen.',
  },
  sortieren: {
    title: 'Sortieren (Triage)',
    page: '/ideas/triage',
    description: 'Neue Gedanken einordnen, priorisieren und kategorisieren. Schnelles Wischen zum Sortieren.',
  },
  triage: {
    title: 'Sortieren (Triage)',
    page: '/ideas/triage',
    description: 'Schnelles Sortieren neuer Gedanken per Wischen oder Klick.',
  },
  werkstatt: {
    title: 'KI-Werkstatt',
    page: '/workshop',
    description: '3 Tabs: Vorschlaege, Entwicklung, Agenten. Die KI analysiert deine Ideen und schlaegt Verbesserungen, Verbindungen und neue Perspektiven vor.',
  },
  workshop: {
    title: 'KI-Werkstatt',
    page: '/workshop',
    description: 'AI Workshop mit proaktiven Vorschlaegen, Ideen-Evolution und Multi-Agent Teams fuer komplexe Aufgaben.',
  },
  'ki-werkstatt': {
    title: 'KI-Werkstatt',
    page: '/workshop',
    description: 'Inkubator fuer Ideen-Evolution und proaktive KI-Vorschlaege.',
  },
  'agent-teams': {
    title: 'Agent Teams',
    page: '/workshop/agent-teams',
    description: 'Multi-Agent Teams fuer komplexe Aufgaben. Mehrere KI-Agenten arbeiten zusammen.',
  },

  // === Organisieren Sektion ===
  planer: {
    title: 'Planer',
    page: '/calendar',
    description: 'Zentrale Planungs-Hub mit 4 Tabs: Kalender, Aufgaben, Projekte, Meetings. Kanban-Board, Gantt-Chart, Meeting-Protokolle.',
  },
  kalender: {
    title: 'Kalender',
    page: '/calendar',
    description: 'Kalender mit Terminen, Deadlines und Erinnerungen. Drag-and-Drop, Tages-/Wochen-/Monatsansicht.',
  },
  calendar: {
    title: 'Planer',
    page: '/calendar',
    description: 'Planer mit Kalender, Aufgaben (Kanban + Gantt), Projekten und Meeting-Protokollen.',
  },
  aufgaben: {
    title: 'Aufgaben',
    page: '/calendar/tasks',
    description: 'Aufgaben-Management mit Kanban-Board (Backlog, Todo, In Arbeit, Erledigt) und Gantt-Chart.',
  },
  tasks: {
    title: 'Aufgaben',
    page: '/calendar/tasks',
    description: 'Task-Management mit Drag-and-Drop Kanban, Projekt-Zuweisungen und Abhaengigkeiten.',
  },
  kanban: {
    title: 'Kanban-Board',
    page: '/calendar/kanban',
    description: '4-Spalten Kanban: Backlog, Todo, In Arbeit, Erledigt. HTML5 Drag-and-Drop, Projekt-Filter.',
  },
  gantt: {
    title: 'Gantt-Chart',
    page: '/calendar/gantt',
    description: 'Gantt-Diagramm mit 3 Zoom-Stufen (Tag/Woche/Monat), Projekt-Gruppierung und Today-Line.',
  },
  meetings: {
    title: 'Meetings',
    page: '/calendar/meetings',
    description: 'Meeting-Protokolle mit VoiceInput und KI-Strukturierung: Zusammenfassung, Entscheidungen, Action Items.',
  },
  kontakte: {
    title: 'Kontakte',
    page: '/contacts',
    description: 'Kontakte und Organisationen verwalten. Kontaktdaten, Notizen und Verbindungen.',
  },
  contacts: {
    title: 'Kontakte',
    page: '/contacts',
    description: 'Kontaktverwaltung mit Organisationen und Verbindungen.',
  },
  email: {
    title: 'E-Mail',
    page: '/email',
    description: 'E-Mails senden und empfangen. KI-Analyse mit Zusammenfassung, Kategorie, Prioritaet, Sentiment und Antwort-Vorschlaegen.',
  },
  'e-mail': {
    title: 'E-Mail',
    page: '/email',
    description: 'E-Mail-Verwaltung mit KI-gestuetzter Verarbeitung und intelligenten Antwort-Vorschlaegen.',
  },
  wissensbasis: {
    title: 'Wissensbasis',
    page: '/documents',
    description: '3 Tabs: Dokumente, Editor, Medien. Dokumente hochladen, analysieren und durchsuchen. Semantische Suche.',
  },
  dokumente: {
    title: 'Dokumente',
    page: '/documents',
    description: 'Document Vault - Dokumente hochladen, analysieren und durchsuchen mit KI-Templates.',
  },
  documents: {
    title: 'Wissensbasis',
    page: '/documents',
    description: 'Wissensbasis mit Dokumenten, Editor und Medien.',
  },
  medien: {
    title: 'Medien',
    page: '/documents/media',
    description: 'Bilder und Dateien verwalten. KI-gestützte Bildanalyse, OCR und Ideen-Extraktion.',
  },
  media: {
    title: 'Medien',
    page: '/documents/media',
    description: 'Medienverwaltung mit Vision-AI und OCR.',
  },

  // === Auswerten Sektion ===
  insights: {
    title: 'Insights',
    page: '/insights',
    description: '3 Tabs: Statistiken, Zusammenfassung, Verbindungen (Knowledge Graph). Muster und Trends in deinen Gedanken.',
  },
  finanzen: {
    title: 'Finanzen',
    page: '/finance',
    description: 'Ausgaben, Budgets und Sparziele verwalten.',
  },
  finance: {
    title: 'Finanzen',
    page: '/finance',
    description: 'Finanz-Dashboard mit Ausgaben-Tracking und Budget-Planung.',
  },
  business: {
    title: 'Business',
    page: '/business',
    description: '8 Tabs: Revenue (Stripe), Traffic (GA4), SEO (Search Console), Performance (Lighthouse), Berichte, Anomalien, und mehr.',
  },

  // === KI & Lernen Sektion ===
  'meine ki': {
    title: 'Meine KI',
    page: '/my-ai',
    description: '3 Tabs: KI anpassen, KI-Wissen, Sprach-Chat. Persoenlichkeit, Verhalten und Wissen der KI konfigurieren.',
  },
  'my-ai': {
    title: 'Meine KI',
    page: '/my-ai',
    description: 'KI-Personalisierung mit Memory-Transparenz und Voice-Chat.',
  },
  personalisierung: {
    title: 'KI anpassen',
    page: '/my-ai',
    description: 'KI-Verhalten anpassen. Persoenlichkeit, Antwort-Stil und Lernverhalten konfigurieren.',
  },
  'voice-chat': {
    title: 'Sprach-Chat',
    page: '/my-ai/voice-chat',
    description: 'Echtzeit-Sprachkonversation mit der KI. Natuerliches Sprechen mit gesprochenen Antworten.',
  },
  lernen: {
    title: 'Lernen',
    page: '/learning',
    description: 'Lernziele setzen und Aufgaben verwalten. Personalisierte Lernpfade basierend auf Interessen.',
  },
  learning: {
    title: 'Lernen',
    page: '/learning',
    description: 'Lernbereich mit personalisierten Aufgaben und Fortschrittstracking.',
  },
  'screen-memory': {
    title: 'Screen Memory',
    page: '/screen-memory',
    description: 'Bildschirmaktivitaet durchsuchen und wiederfinden.',
  },

  // === Footer ===
  einstellungen: {
    title: 'Einstellungen',
    page: '/settings',
    description: '7 Tabs: Profil, Allgemein, KI, Datenschutz, Automationen, Integrationen, Daten. Komplette App-Konfiguration.',
  },
  settings: {
    title: 'Einstellungen',
    page: '/settings',
    description: 'Allgemeine App-Einstellungen, Profil, Automationen und Integrationen.',
  },
  profil: {
    title: 'Profil',
    page: '/settings/profile',
    description: 'Nutzerprofil mit persoenlichen Statistiken und Einstellungen.',
  },
  profile: {
    title: 'Profil',
    page: '/settings/profile',
    description: 'Nutzerprofil und persoenliche Daten.',
  },
  automationen: {
    title: 'Automationen',
    page: '/settings/automations',
    description: 'Workflows automatisieren mit Triggern (Webhook, Schedule, Event, Pattern) und Actions.',
  },
  automations: {
    title: 'Automationen',
    page: '/settings/automations',
    description: 'Automation-Engine mit Triggern und Actions.',
  },
  integrationen: {
    title: 'Integrationen',
    page: '/settings/integrations',
    description: 'Externe Dienste verbinden: GitHub, Webhooks, API-Schluessel.',
  },
  benachrichtigungen: {
    title: 'Benachrichtigungen',
    page: '/notifications',
    description: 'Benachrichtigungs-Center fuer alle App-Benachrichtigungen.',
  },
  notifications: {
    title: 'Benachrichtigungen',
    page: '/notifications',
    description: 'Notification Center fuer Push- und In-App-Benachrichtigungen.',
  },
};

/**
 * Get help text for a specific feature/topic
 */
export function getFeatureHelp(topic: string): string {
  const normalized = topic.toLowerCase().trim();

  // Direct match
  if (FEATURE_MAP[normalized]) {
    const f = FEATURE_MAP[normalized];
    return `**${f.title}** (${f.page})\n\n${f.description}`;
  }

  // Partial match - search through keys and titles
  for (const [key, feature] of Object.entries(FEATURE_MAP)) {
    if (
      normalized.includes(key) ||
      key.includes(normalized) ||
      feature.title.toLowerCase().includes(normalized)
    ) {
      return `**${feature.title}** (${feature.page})\n\n${feature.description}`;
    }
  }

  // No match found
  return `Ich konnte kein Feature zu "${topic}" finden. Verfuegbare Bereiche: Dashboard, Chat, Gedanken, Werkstatt, Planer, Kontakte, E-Mail, Wissensbasis, Insights, Finanzen, Business, Meine KI, Lernen, Einstellungen.`;
}

/**
 * Build the assistant-specific system prompt with full app knowledge
 */
export function getAssistantSystemPrompt(): string {
  return `Du bist Zen, der eingebaute KI-Assistent der ZenAI App. Du bist wie Siri fuer diese Anwendung.

Deine Rolle:
- Du hilfst Nutzern die App zu bedienen und steuerst sie aktiv
- Du fuehrst Aktionen aus (Meetings erstellen, Ideen notieren, suchen, navigieren, E-Mails verwalten)
- Du beantwortest Fragen zu Features und Funktionen
- Du bist freundlich, schnell und praezise
- Du nutzt Tools IMMER aktiv wenn eine Aktion gefordert ist - erklaere nie nur wie es geht
- Du gibst kurze, hilfreiche Antworten (max 2-3 Saetze fuer einfache Fragen)
- Du sprichst Deutsch, es sei denn der Nutzer schreibt auf Englisch

[APP-WISSEN: ZenAI Platform]

## Navigation & Seiten

### Hauptseiten
- **Dashboard** (/) - Startseite mit Statistiken und Schnellzugriff
- **Chat** (/chat) - Vollbild-Chat mit KI (Bilder, Sprache, Code)
- **Browser** (/browser) - Eingebetteter Browser

### Ideen
- **Gedanken** (/ideas) - Ideen sammeln & ordnen (4 Tabs: Aktiv, Inkubator, Archiv, Sortieren)
- **Werkstatt** (/workshop) - KI entwickelt Ideen weiter (Vorschlaege, Evolution, Agent Teams)

### Organisieren
- **Planer** (/calendar) - Kalender, Aufgaben, Kanban, Gantt, Meetings
- **Kontakte** (/contacts) - Kontakte & Organisationen
- **E-Mail** (/email) - E-Mails mit KI-Analyse & Antwort-Vorschlaegen
- **Wissensbasis** (/documents) - Dokumente, Editor, Medien

### Auswerten
- **Insights** (/insights) - Statistiken, Zusammenfassung, Knowledge Graph
- **Finanzen** (/finance) - Ausgaben, Budgets, Sparziele
- **Business** (/business) - Revenue, Traffic, SEO, Performance

### KI & Lernen
- **Meine KI** (/my-ai) - KI personalisieren, KI-Wissen, Sprach-Chat
- **Lernen** (/learning) - Lernziele & Aufgaben
- **Screen Memory** (/screen-memory) - Bildschirmaktivitaet durchsuchen

### System
- **Einstellungen** (/settings) - Profil, Allgemein, KI, Datenschutz, Automationen, Integrationen, Daten
- **Benachrichtigungen** (/notifications) - Notification Center

## Was du kannst (Tools)
- **Ideen erstellen**: "Notiere: ..." → create_idea Tool
- **Ideen suchen**: "Suche nach React" → search_ideas Tool
- **Ideen aktualisieren**: "Aendere Prioritaet auf hoch" → update_idea Tool
- **Ideen archivieren/loeschen**: "Archiviere diese Idee" → archive_idea / delete_idea Tool
- **Meetings erstellen**: "Meeting am Donnerstag 14 Uhr mit Peter" → create_meeting Tool
- **Kalender**: "Termin am Freitag" → create_calendar_event Tool
- **Kalender anzeigen**: "Was steht heute an?" → list_calendar_events Tool
- **Navigieren**: "Zeig mir die Einstellungen" → navigate_to Tool
- **Feature-Hilfe**: "Wie funktioniert die Werkstatt?" → app_help Tool
- **Web-Suche**: "Suche im Web nach ..." → web_search Tool
- **URL abrufen**: "Was steht auf dieser Seite?" → fetch_url Tool
- **Code ausfuehren**: "Berechne ..." → execute_code Tool
- **E-Mail schreiben**: "Schreib eine E-Mail an ..." → draft_email Tool
- **Erinnern**: "Merke dir dass ..." → remember Tool
- **Erinnern abrufen**: "Was weisst du ueber ...?" → recall Tool
- **Business-Daten**: "Wie ist der Umsatz?" → get_revenue_metrics Tool
- **Traffic**: "Zeig mir die Besucherzahlen" → get_traffic_analytics Tool
- **Route berechnen**: "Wie komme ich nach ...?" → get_directions Tool
- **Oeffnungszeiten**: "Hat der Baumarkt offen?" → get_opening_hours Tool
- **In der Naehe**: "Wo ist das naechste Cafe?" → find_nearby_places Tool
- **Dokumente suchen**: "Suche in meinen Dokumenten" → search_documents Tool

## Dein Verhalten
- Sei proaktiv: Wenn jemand sagt "Meeting erstellen" - frag direkt nach den Details (Wann? Mit wem?).
- Nutze IMMER Tools wenn der Nutzer eine Aktion will - erklaere nicht nur wie es geht.
- Bei Navigation: Nutze navigate_to UND erklaere kurz was die Seite bietet.
- Halte Antworten kurz und auf den Punkt.
- Wenn du eine Aktion ausfuehrst, bestaetige kurz was du getan hast.`;
}

logger.debug('Assistant knowledge service loaded');
