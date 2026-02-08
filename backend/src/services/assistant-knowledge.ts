/**
 * Assistant Knowledge Service
 *
 * Provides app-specific knowledge for the floating AI assistant ("Zen").
 * Contains navigation structure, feature descriptions, and capabilities.
 * Used to build the assistant's system prompt so it can answer app questions
 * and guide users through features.
 */

import { logger } from '../utils/logger';

// Feature descriptions keyed by topic keywords
const FEATURE_MAP: Record<string, { title: string; page: string; description: string }> = {
  gedanken: {
    title: 'Meine Gedanken',
    page: '/ideas',
    description: 'Hier verwaltest du alle deine Ideen, Notizen und Gedanken. Du kannst per Spracheingabe oder Text neue Gedanken erfassen. Die KI strukturiert sie automatisch mit Titel, Typ, Kategorie und Priorität.',
  },
  ideas: {
    title: 'Meine Gedanken',
    page: '/ideas',
    description: 'Die Hauptseite für deine Ideen. Du kannst nach Ideen suchen, sie filtern, priorisieren und archivieren. Jede Idee wird automatisch mit einem Embedding versehen für semantische Suche.',
  },
  archiv: {
    title: 'Archiv',
    page: '/archive',
    description: 'Archivierte Gedanken durchsuchen und wiederherstellen. Hier findest du Ideen die du archiviert hast.',
  },
  sortieren: {
    title: 'Sortieren (Triage)',
    page: '/triage',
    description: 'Neue Gedanken einordnen, priorisieren und kategorisieren. Ideal um unbearbeitete Ideen schnell zu sortieren.',
  },
  triage: {
    title: 'Sortieren (Triage)',
    page: '/triage',
    description: 'Schnelles Sortieren neuer Gedanken. Wische oder klicke um Ideen zu priorisieren und einzuordnen.',
  },
  insights: {
    title: 'Insights',
    page: '/insights',
    description: 'Dashboard mit Analytics, Digest und Knowledge Graph. Zeigt dir Muster in deinen Gedanken, Verbindungen zwischen Ideen und einen regelmäßigen Digest.',
  },
  'ki-werkstatt': {
    title: 'KI-Werkstatt',
    page: '/ai-workshop',
    description: 'Inkubator für Ideen-Evolution und proaktive KI-Vorschläge. Die KI analysiert deine Ideen und schlägt Verbesserungen, Verbindungen und neue Perspektiven vor.',
  },
  'ai-workshop': {
    title: 'KI-Werkstatt',
    page: '/ai-workshop',
    description: 'Der AI Workshop hilft dir Ideen weiterzuentwickeln. Die KI kann Ideen kombinieren, hinterfragen und evolutionieren.',
  },
  lernen: {
    title: 'Lernen',
    page: '/learning',
    description: 'Lernziele setzen und Aufgaben verwalten. Die KI erstellt personalisierte Lernpfade basierend auf deinen Interessen.',
  },
  learning: {
    title: 'Lernen',
    page: '/learning',
    description: 'Lernbereich mit personalisierten Lernaufgaben und Fortschrittstracking.',
  },
  personalisierung: {
    title: 'Personalisierung',
    page: '/personalization',
    description: 'KI-Verhalten anpassen und trainieren. Stelle ein wie die KI antwortet, welche Persona sie nutzt und wie sie lernt.',
  },
  dokumente: {
    title: 'Dokumente',
    page: '/documents',
    description: 'Dokumentenverwaltung und -analyse. Lade Dokumente hoch und die KI analysiert sie mit verschiedenen Templates (Zusammenfassung, Extraktion, Bewertung).',
  },
  documents: {
    title: 'Dokumente',
    page: '/documents',
    description: 'Document Vault - Dokumente hochladen, analysieren und durchsuchen. Unterstützt semantische Suche über Dokumentinhalte.',
  },
  canvas: {
    title: 'Canvas',
    page: '/canvas',
    description: 'Interaktiver visueller Editor. Hier kannst du Ideen visuell anordnen, verbinden und strukturieren.',
  },
  meetings: {
    title: 'Meetings',
    page: '/meetings',
    description: 'Meeting-Verwaltung mit Notizen, Transkriptionen und Action Items. Erstelle Meetings, füge Teilnehmer hinzu und lass die KI Zusammenfassungen generieren.',
  },
  medien: {
    title: 'Medien',
    page: '/media',
    description: 'Bilder und Dateien verwalten. Die KI kann Bilder analysieren, Text extrahieren (OCR) und Ideen aus Bildern ableiten.',
  },
  media: {
    title: 'Medien',
    page: '/media',
    description: 'Medienverwaltung mit KI-gestützter Bildanalyse und OCR.',
  },
  stories: {
    title: 'Stories',
    page: '/stories',
    description: 'Gedanken als zusammenhängende Geschichten darstellen. Die KI fasst verwandte Ideen zu narrativen Texten zusammen.',
  },
  automationen: {
    title: 'Automationen',
    page: '/automations',
    description: 'Workflows automatisieren. Erstelle Regeln wie "Wenn eine neue Idee mit Priorität hoch erstellt wird, sende eine Benachrichtigung".',
  },
  automations: {
    title: 'Automationen',
    page: '/automations',
    description: 'Automation-Engine mit Triggern (Webhook, Schedule, Event, Pattern) und Actions (Notification, Tag, Archive, etc.).',
  },
  integrationen: {
    title: 'Integrationen',
    page: '/integrations',
    description: 'Externe Dienste verbinden. GitHub-Integration, Webhooks und API-Schlüssel verwalten.',
  },
  export: {
    title: 'Export',
    page: '/export',
    description: 'Daten exportieren in verschiedenen Formaten.',
  },
  sync: {
    title: 'Sync',
    page: '/sync',
    description: 'Geräte synchronisieren. Offline-Aktionen werden automatisch synchronisiert wenn du wieder online bist.',
  },
  profil: {
    title: 'Profil',
    page: '/profile',
    description: 'Nutzerprofil mit Statistiken. Zeigt deine Aktivität, Gedanken-Anzahl und Nutzungsmuster.',
  },
  profile: {
    title: 'Profil',
    page: '/profile',
    description: 'Dein Nutzerprofil mit persönlichen Statistiken und Einstellungen.',
  },
  benachrichtigungen: {
    title: 'Benachrichtigungen',
    page: '/notifications',
    description: 'Benachrichtigungen verwalten. Push-Notifications und In-App-Benachrichtigungen konfigurieren.',
  },
  notifications: {
    title: 'Benachrichtigungen',
    page: '/notifications',
    description: 'Notification Center für alle App-Benachrichtigungen.',
  },
  einstellungen: {
    title: 'Einstellungen',
    page: '/settings',
    description: 'App-Konfiguration. API-Schlüssel, Theme, Sprache und weitere Einstellungen.',
  },
  settings: {
    title: 'Einstellungen',
    page: '/settings',
    description: 'Allgemeine App-Einstellungen und Konfiguration.',
  },
  dashboard: {
    title: 'Dashboard',
    page: '/',
    description: 'Startseite mit Schnellzugriff auf häufig genutzte Features, aktuelle Statistiken und Quick Actions.',
  },
  'agent-teams': {
    title: 'Agent Teams',
    page: '/agent-teams',
    description: 'Multi-Agent Teams für komplexe Aufgaben. Mehrere KI-Agenten arbeiten zusammen an einem Problem.',
  },
  'voice-chat': {
    title: 'Sprachkonversation',
    page: '/voice-chat',
    description: 'Echtzeit-Sprachkonversation mit der KI. Sprich natürlich und erhalte gesprochene Antworten.',
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
  return `Ich konnte kein Feature zu "${topic}" finden. Verfügbare Bereiche: Gedanken, Insights, KI-Werkstatt, Dokumente, Meetings, Canvas, Medien, Stories, Automationen, Integrationen, Lernen, Profil, Einstellungen.`;
}

/**
 * Build the assistant-specific system prompt with full app knowledge
 */
export function getAssistantSystemPrompt(): string {
  return `Du bist Zen, der eingebaute KI-Assistent der ZenAI App.

Deine Rolle:
- Du hilfst Nutzern die App zu bedienen
- Du führst Aktionen aus (Meetings erstellen, Ideen notieren, suchen, navigieren)
- Du beantwortest Fragen zu Features und Funktionen
- Du bist freundlich, schnell und präzise
- Du nutzt Tools aktiv wenn eine Aktion gefordert ist
- Du gibst kurze, hilfreiche Antworten (max 2-3 Sätze für einfache Fragen)
- Du sprichst Deutsch, es sei denn der Nutzer schreibt auf Englisch

[APP-WISSEN: ZenAI Platform]

## Verfügbare Seiten & Navigation

### Gedanken
- **Meine Gedanken** (/ideas) - Ideen, Notizen und Gedanken verwalten. Spracheingabe, Text, KI-Strukturierung.
- **Archiv** (/archive) - Archivierte Gedanken durchsuchen und wiederherstellen.
- **Sortieren** (/triage) - Neue Gedanken einordnen, priorisieren, kategorisieren.

### KI & Insights
- **Insights** (/insights) - Dashboard mit Analytics, Digest, Knowledge Graph.
- **KI-Werkstatt** (/ai-workshop) - Inkubator für Ideen-Evolution, proaktive Vorschläge.
- **Lernen** (/learning) - Lernziele setzen und Aufgaben verwalten.
- **Personalisierung** (/personalization) - KI-Verhalten anpassen und trainieren.

### Inhalte
- **Dokumente** (/documents) - Dokumentenverwaltung und -analyse.
- **Canvas** (/canvas) - Interaktiver visueller Editor.
- **Meetings** (/meetings) - Meeting-Notizen, Transkriptionen, Action Items.
- **Medien** (/media) - Bilder und Dateien verwalten (Vision AI, OCR).
- **Stories** (/stories) - Gedanken als zusammenhängende Geschichten.

### System
- **Automationen** (/automations) - Workflows automatisieren (Trigger + Actions).
- **Integrationen** (/integrations) - Externe Dienste verbinden (GitHub, Webhooks).
- **Export** (/export) - Daten exportieren.
- **Sync** (/sync) - Geräte synchronisieren.
- **Dashboard** (/) - Startseite mit Statistiken und Schnellzugriff.
- **Profil** (/profile) - Nutzerprofil und Statistiken.
- **Einstellungen** (/settings) - App-Konfiguration.

## Was du kannst
- **Meetings erstellen**: "Ich habe ein Meeting am Donnerstag um 14 Uhr mit Peter" → Erstelle es mit dem create_meeting Tool.
- **Ideen erstellen**: "Notiere mir eine Idee: ..." → Erstelle mit create_idea Tool.
- **Suchen**: "Suche nach meinen Ideen zu React" → Nutze search_ideas Tool.
- **Navigieren**: "Wo finde ich die Meetings?" → Nutze navigate_to Tool und erkläre die Seite.
- **Erklären**: "Wie funktioniert die KI-Werkstatt?" → Nutze app_help Tool.
- **Web-Suche**: "Suche im Web nach ..." → Nutze web_search Tool.
- **Code ausführen**: "Führe Python-Code aus: ..." → Nutze execute_code Tool.
- **Erinnern**: "Merke dir dass ..." → Nutze remember Tool.

## Dein Verhalten
- Sei proaktiv: Wenn jemand sagt "Meeting erstellen" - frag direkt nach den Details (Wann? Mit wem?).
- Nutze IMMER Tools wenn der Nutzer eine Aktion will - erkläre nicht nur wie es geht.
- Gib Navigationshinweise mit Seitenname und Pfad.
- Halte Antworten kurz und auf den Punkt.`;
}

logger.debug('Assistant knowledge service loaded');
