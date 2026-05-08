/**
 * Phase 143: Built-In Agent Definitions
 *
 * 8 domain agents that ship with ZenAI. Each maps to an AgentBlueprint
 * with source='built_in' when seeded by BlueprintRegistry.registerBuiltIns().
 */

import type { TriggerType } from './agent-runtime';

export type AgentCategory = 'productivity' | 'communication' | 'research' | 'finance' | 'knowledge' | 'development' | 'custom';

export interface ConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  defaultValue: string | number | boolean;
  options?: string[];
  description?: string;
}

export interface BuiltInAgent {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AgentCategory;
  tags: string[];
  tools: string[];
  instructions: string;
  triggers: Array<{ type: TriggerType; config: Record<string, unknown> }>;
  approvalRequired: boolean;
  maxActionsPerDay: number;
  tokenBudgetDaily: number;
  defaultContext: 'operations' | 'finance' | 'people' | 'strategy';
  configurable: ConfigField[];
}

export const BUILT_IN_AGENTS: BuiltInAgent[] = [
  {
    id: 'email_triage',
    name: 'Email Triage',
    description: 'Categorizes incoming emails by urgency and topic, drafts reply suggestions for high-priority messages.',
    icon: '📧',
    category: 'communication',
    tags: ['email', 'triage', 'priority', 'inbox'],
    tools: ['ask_inbox', 'inbox_summary', 'draft_email', 'recall', 'remember'],
    instructions: `You are an Email Triage agent. When triggered by a new email:
1. Analyze the sender, subject, and body for urgency (critical/high/normal/low).
2. Categorize by topic (meeting, action-item, FYI, newsletter, spam).
3. For critical/high emails: draft a brief reply suggestion.
4. Store a memory note summarizing the email for future recall.
5. If the email references a known contact or project, link the context.
Keep responses concise. Never send emails automatically — only draft suggestions.`,
    triggers: [{ type: 'email_received', config: {} }],
    approvalRequired: false,
    maxActionsPerDay: 100,
    tokenBudgetDaily: 50000,
    defaultContext: 'finance',
    configurable: [
      { key: 'urgencyThreshold', label: 'Mindest-Dringlichkeit für Antwortvorschlag', type: 'select', defaultValue: 'high', options: ['critical', 'high', 'normal'] },
      { key: 'autoCategories', label: 'Automatische Kategorien', type: 'boolean', defaultValue: true },
    ],
  },
  {
    id: 'meeting_prep',
    name: 'Meeting Prep',
    description: 'Prepares context briefings before calendar events — attendee info, previous discussions, relevant documents.',
    icon: '📋',
    category: 'productivity',
    tags: ['meeting', 'calendar', 'preparation', 'briefing'],
    tools: ['list_calendar_events', 'recall', 'search_ideas', 'search_documents', 'conversation_search'],
    instructions: `You are a Meeting Preparation agent. When triggered before a calendar event:
1. Retrieve the event details (title, attendees, agenda if available).
2. Search memory for previous interactions with each attendee.
3. Search ideas and documents for relevant context related to the meeting topic.
4. Search recent conversations for related discussions.
5. Compile a concise briefing with: attendee summaries, key context, open questions, suggested talking points.
Deliver the briefing 30 minutes before the meeting.`,
    triggers: [{ type: 'calendar_soon', config: { minutesBefore: 30 } }],
    approvalRequired: false,
    maxActionsPerDay: 10,
    tokenBudgetDaily: 30000,
    defaultContext: 'finance',
    configurable: [
      { key: 'minutesBefore', label: 'Minuten vor Meeting', type: 'number', defaultValue: 30 },
      { key: 'includeDocuments', label: 'Dokumente einbeziehen', type: 'boolean', defaultValue: true },
    ],
  },
  {
    id: 'daily_digest',
    name: 'Daily Digest',
    description: 'Generates a personalized morning briefing with task priorities, calendar overview, and memory insights.',
    icon: '☀️',
    category: 'productivity',
    tags: ['digest', 'morning', 'briefing', 'daily'],
    tools: ['recall', 'search_ideas', 'list_calendar_events', 'core_memory_read', 'memory_introspect'],
    instructions: `You are a Daily Digest agent. Every morning:
1. List today's calendar events with times and participants.
2. List high-priority tasks due today or overdue.
3. Recall recent memory highlights (last 24h).
4. Check for follow-up items from yesterday.
5. Identify any knowledge gaps or learning opportunities.
6. Compile into a structured morning briefing with sections:
   - Termine heute
   - Aufgaben & Prioritaeten
   - Erinnerungen & Insights
   - Fokus-Empfehlung
Keep it concise and actionable.`,
    triggers: [{ type: 'schedule', config: { cron: '0 7 * * 1-5' } }],
    approvalRequired: false,
    maxActionsPerDay: 1,
    tokenBudgetDaily: 20000,
    defaultContext: 'operations',
    configurable: [
      { key: 'scheduleTime', label: 'Uhrzeit (Stunde)', type: 'number', defaultValue: 7 },
      { key: 'includeWeekends', label: 'Auch am Wochenende', type: 'boolean', defaultValue: false },
    ],
  },
  {
    id: 'research_monitor',
    name: 'Research Monitor',
    description: 'Monitors configured topics via web search and saves relevant findings as ideas.',
    icon: '🔬',
    category: 'research',
    tags: ['research', 'monitoring', 'web', 'trends'],
    tools: ['web_search', 'fetch_url', 'search_ideas', 'create_idea', 'remember'],
    instructions: `You are a Research Monitor agent. On schedule:
1. For each configured topic, perform a web search for recent developments.
2. Fetch and analyze the top 3 results per topic.
3. Check existing ideas to avoid duplicates.
4. For genuinely new findings: create an idea with summary, source URL, and relevance assessment.
5. Store a memory note for future context.
Focus on quality over quantity. Skip clickbait and low-quality sources.`,
    triggers: [{ type: 'schedule', config: { cron: '0 9 * * 1-5' } }],
    approvalRequired: true,
    maxActionsPerDay: 20,
    tokenBudgetDaily: 80000,
    defaultContext: 'people',
    configurable: [
      { key: 'topics', label: 'Ueberwachte Themen (kommagetrennt)', type: 'string', defaultValue: 'AI, Machine Learning' },
      { key: 'maxResultsPerTopic', label: 'Max Ergebnisse pro Thema', type: 'number', defaultValue: 3 },
    ],
  },
  {
    id: 'content_calendar',
    name: 'Content Calendar',
    description: 'Suggests content ideas based on trends, calendar events, and existing knowledge.',
    icon: '📅',
    category: 'communication',
    tags: ['content', 'social', 'calendar', 'marketing'],
    tools: ['web_search', 'search_ideas', 'recall', 'create_idea', 'list_calendar_events', 'draft_social_post'],
    instructions: `You are a Content Calendar agent. Weekly:
1. Review upcoming events and milestones from the calendar.
2. Search memory for recent insights and achievements worth sharing.
3. Check web trends in configured domains.
4. Suggest 3-5 content ideas with: title, angle, platform, optimal timing, key message.
5. Save as ideas tagged with 'content-suggestion'.
Focus on authentic, value-driven content — no generic filler.`,
    triggers: [{ type: 'schedule', config: { cron: '0 10 * * 1' } }],
    approvalRequired: true,
    maxActionsPerDay: 5,
    tokenBudgetDaily: 40000,
    defaultContext: 'finance',
    configurable: [
      { key: 'platforms', label: 'Plattformen', type: 'string', defaultValue: 'LinkedIn, Twitter' },
      { key: 'contentFocus', label: 'Themen-Fokus', type: 'string', defaultValue: 'AI, Product Updates' },
    ],
  },
  {
    id: 'expense_tracker',
    name: 'Expense Tracker',
    description: 'Extracts expense information from emails and documents, categorizes spending.',
    icon: '💰',
    category: 'finance',
    tags: ['finance', 'expense', 'tracking', 'budget'],
    tools: ['ask_inbox', 'search_documents', 'recall', 'remember', 'create_idea'],
    instructions: `You are an Expense Tracker agent. When triggered:
1. Scan recent emails for receipts, invoices, and payment confirmations.
2. Extract: amount, vendor, date, category, payment method.
3. Check memory for existing expense records to avoid duplicates.
4. Create an idea tagged 'expense' with structured expense data.
5. If a monthly threshold is approached, add a warning note.
Never share financial data externally. All processing stays local.`,
    triggers: [{ type: 'email_received', config: { subjectPatterns: ['receipt', 'invoice', 'Rechnung', 'Quittung'] } }],
    approvalRequired: true,
    maxActionsPerDay: 30,
    tokenBudgetDaily: 25000,
    defaultContext: 'operations',
    configurable: [
      { key: 'currency', label: 'Waehrung', type: 'select', defaultValue: 'EUR', options: ['EUR', 'USD', 'GBP', 'CHF'] },
      { key: 'monthlyBudget', label: 'Monatsbudget-Warnung', type: 'number', defaultValue: 3000 },
    ],
  },
  {
    id: 'task_prioritizer',
    name: 'Task Prioritizer',
    description: 'Re-evaluates task priorities based on deadlines, dependencies, and calendar load.',
    icon: '🎯',
    category: 'productivity',
    tags: ['tasks', 'priority', 'planning', 'focus'],
    // search_ideas covers tasks (shared DB infrastructure). No separate list_tasks tool exists yet.
    tools: ['search_ideas', 'recall', 'list_calendar_events', 'memory_introspect', 'navigate_to'],
    instructions: `You are a Task Prioritizer agent. Daily:
1. Load all open tasks sorted by current priority.
2. Check calendar for free time blocks today.
3. Evaluate each task against: deadline urgency, dependency chains, estimated effort, calendar availability.
4. Re-rank tasks using Eisenhower matrix (urgent+important first).
5. Suggest a focus order for today with time estimates.
6. Flag any tasks at risk of missing deadlines.
Output a structured priority list. Do not modify task priorities directly — suggest changes for user approval.`,
    triggers: [{ type: 'schedule', config: { cron: '0 8 * * 1-5' } }],
    approvalRequired: false,
    maxActionsPerDay: 2,
    tokenBudgetDaily: 15000,
    defaultContext: 'finance',
    configurable: [
      { key: 'scheduleTime', label: 'Uhrzeit (Stunde)', type: 'number', defaultValue: 8 },
      { key: 'includePersonal', label: 'Persoenliche Aufgaben einbeziehen', type: 'boolean', defaultValue: false },
    ],
  },
  {
    id: 'knowledge_curator',
    name: 'Knowledge Curator',
    description: 'Discovers connections between ideas, suggests merges, and maintains knowledge graph quality.',
    icon: '🧠',
    category: 'knowledge',
    tags: ['knowledge', 'curation', 'connections', 'graph'],
    tools: ['search_ideas', 'recall', 'remember', 'memory_introspect', 'memory_update', 'core_memory_read', 'core_memory_update'],
    instructions: `You are a Knowledge Curator agent. When new ideas are created:
1. Search for existing ideas with similar content or overlapping themes.
2. Identify potential connections (supports, contradicts, extends, implements).
3. If duplicates found, suggest a merge with combined content.
4. If novel connections found, create a memory note linking the concepts.
5. Check for outdated or stale knowledge that conflicts with new information.
6. Suggest updates to core memory if fundamental understanding has evolved.
Focus on meaningful connections, not superficial keyword matches.`,
    triggers: [{ type: 'idea_created', config: {} }],
    approvalRequired: false,
    maxActionsPerDay: 50,
    tokenBudgetDaily: 60000,
    defaultContext: 'operations',
    configurable: [
      { key: 'similarityThreshold', label: 'Aehnlichkeits-Schwellwert (0-1)', type: 'number', defaultValue: 0.7 },
      { key: 'autoConnect', label: 'Automatisch verknuepfen', type: 'boolean', defaultValue: true },
    ],
  },
];
