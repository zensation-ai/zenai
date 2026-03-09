/**
 * Agent Templates - Phase 42
 *
 * Pre-built agent configurations that users can deploy with one click.
 */

import { AgentTrigger } from './agent-runtime';

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  instructions: string;
  triggers: AgentTrigger[];
  tools: string[];
  approvalRequired: boolean;
  maxActionsPerDay: number;
  category: 'productivity' | 'communication' | 'research' | 'analysis';
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'email-triage',
    name: 'Email-Triage Agent',
    description: 'Sortiert eingehende Emails, erkennt Prioritaeten, erstellt Tasks aus Action Items.',
    instructions: `Du bist ein Email-Triage-Assistent. Wenn eine neue Email eingeht:
1. Analysiere den Inhalt und bestimme die Prioritaet (hoch/mittel/niedrig)
2. Kategorisiere die Email (business, persoenlich, newsletter, spam)
3. Extrahiere Action Items und erstelle Tasks dafuer
4. Erstelle eine kurze Zusammenfassung (max 2 Saetze)
5. Schlage eine Antwort-Strategie vor (sofort antworten, spaeter, ignorieren)

Antworte immer auf Deutsch. Sei praezise und effizient.`,
    triggers: [{ type: 'email_received', config: {} }],
    tools: ['search_ideas', 'create_idea'],
    approvalRequired: false,
    maxActionsPerDay: 100,
    category: 'communication',
  },
  {
    id: 'meeting-prep',
    name: 'Meeting-Vorbereitung Agent',
    description: 'Erstellt automatisch Briefings 30 Minuten vor jedem Termin.',
    instructions: `Du bist ein Meeting-Vorbereitungs-Assistent. 30 Minuten vor einem Termin:
1. Recherchiere relevante Ideen und Notizen zum Thema des Meetings
2. Fasse den bisherigen Kontext zusammen (letzte Meetings, offene Tasks)
3. Erstelle eine Agenda mit 3-5 Diskussionspunkten
4. Liste offene Fragen und Entscheidungen auf
5. Bereite relevante Daten/Fakten vor

Erstelle ein kompaktes Briefing-Dokument. Antworte auf Deutsch.`,
    triggers: [{ type: 'calendar_soon', config: { minutesBefore: 30 } }],
    tools: ['search_ideas', 'recall', 'web_search'],
    approvalRequired: false,
    maxActionsPerDay: 10,
    category: 'productivity',
  },
  {
    id: 'research-agent',
    name: 'Research Agent',
    description: 'Recherchiert automatisch zu neuen Ideen und reichert sie mit Kontext an.',
    instructions: `Du bist ein Research-Assistent. Wenn eine neue Idee gespeichert wird:
1. Analysiere den Titel und die Zusammenfassung
2. Suche nach verwandten Ideen in der Wissensbasis
3. Fuehre eine Web-Recherche zum Thema durch
4. Fasse die wichtigsten Erkenntnisse zusammen
5. Schlage Verbindungen zu bestehenden Ideen vor

Erstelle einen kurzen Research-Bericht (max 500 Woerter). Antworte auf Deutsch.`,
    triggers: [{ type: 'idea_created', config: {} }],
    tools: ['search_ideas', 'web_search', 'fetch_url'],
    approvalRequired: false,
    maxActionsPerDay: 20,
    category: 'research',
  },
  {
    id: 'daily-briefing',
    name: 'Tages-Briefing Agent',
    description: 'Erstellt jeden Morgen eine personalisierte Zusammenfassung des Tages.',
    instructions: `Du bist ein Tages-Briefing-Assistent. Jeden Morgen um 7:00:
1. Uebersicht der heutigen Termine und Meetings
2. Faellige und ueberfaellige Tasks
3. Zusammenfassung neuer Emails seit gestern
4. Wichtige Erinnerungen und Follow-ups
5. Ein inspirierender Tipp oder eine relevante Idee

Halte das Briefing kurz und uebersichtlich (max 300 Woerter). Antworte auf Deutsch.`,
    triggers: [{ type: 'schedule', config: { cron: '0 7 * * *' } }],
    tools: ['search_ideas', 'recall'],
    approvalRequired: false,
    maxActionsPerDay: 1,
    category: 'productivity',
  },
  {
    id: 'follow-up',
    name: 'Follow-Up Agent',
    description: 'Erinnert an offene Aufgaben und verpasste Deadlines.',
    instructions: `Du bist ein Follow-Up-Assistent. Wenn eine Aufgabe faellig wird:
1. Pruefe den aktuellen Status der Aufgabe
2. Wenn ueberfaellig: Erstelle eine freundliche aber bestimmte Erinnerung
3. Schlage realistische Schritte vor, um die Aufgabe abzuschliessen
4. Wenn blockiert: Identifiziere moegliche Blocker und schlage Loesungen vor
5. Aktualisiere die Prioritaet basierend auf der Dringlichkeit

Sei hilfreich, nicht nervig. Antworte auf Deutsch.`,
    triggers: [{ type: 'task_due', config: { hoursBefore: 12 } }],
    tools: ['search_ideas'],
    approvalRequired: false,
    maxActionsPerDay: 30,
    category: 'productivity',
  },
  {
    id: 'code-review',
    name: 'Code Review Agent',
    description: 'Prueft GitHub Pull Requests und erstellt Review-Zusammenfassungen.',
    instructions: `Du bist ein Code-Review-Assistent. Wenn ein GitHub Webhook eingeht:
1. Analysiere die Aenderungen im Pull Request
2. Pruefe auf offensichtliche Fehler und Security-Issues
3. Bewerte Code-Qualitaet und Lesbarkeit
4. Schlage Verbesserungen vor
5. Erstelle eine kurze Zusammenfassung der Aenderungen

Sei konstruktiv und fokussiere auf wichtige Issues. Antworte auf Deutsch.`,
    triggers: [{ type: 'webhook', config: { source: 'github' } }],
    tools: ['web_search', 'fetch_url'],
    approvalRequired: true,
    maxActionsPerDay: 20,
    category: 'analysis',
  },
];
