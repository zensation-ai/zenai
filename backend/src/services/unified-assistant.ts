/**
 * Unified AI Assistant Service (Phase 91)
 *
 * Classifies user intent from natural language and maps to concrete actions.
 * Uses heuristic classification (keyword matching + patterns) for fast response (<100ms).
 * No Claude API calls — pure deterministic logic.
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type IntentType = 'navigate' | 'create' | 'search' | 'action' | 'question';

export interface AssistantAction {
  type: IntentType;
  target?: string;
  params?: Record<string, unknown>;
  label: string;
  description?: string;
  page?: string;
  icon?: string;
}

export interface AssistantResult {
  intent: IntentType;
  confidence: number;
  actions: AssistantAction[];
  directAnswer?: string;
}

export interface AssistantInteraction {
  id: string;
  userId: string;
  query: string;
  intent: string | null;
  action: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  pageContext: string | null;
  responseTimeMs: number | null;
  createdAt: string;
}

export interface ContextSuggestion {
  label: string;
  query: string;
  icon: string;
  category: string;
}

// ===========================================
// Navigation Mappings
// ===========================================

interface NavTarget {
  page: string;
  label: string;
  icon: string;
  keywords: string[];
}

const NAV_TARGETS: NavTarget[] = [
  { page: 'dashboard', label: 'Dashboard', icon: '🏠', keywords: ['dashboard', 'startseite', 'home', 'uebersicht', 'start'] },
  { page: 'chat', label: 'Chat', icon: '💬', keywords: ['chat', 'gespraech', 'unterhaltung', 'ki', 'assistent'] },
  { page: 'ideas', label: 'Gedanken', icon: '💡', keywords: ['gedanken', 'ideen', 'ideas', 'notizen', 'brainstorm'] },
  { page: 'incubator', label: 'Inkubator', icon: '🧫', keywords: ['inkubator', 'incubator', 'brueten', 'entwickeln'] },
  { page: 'workshop', label: 'Werkstatt', icon: '🧪', keywords: ['werkstatt', 'workshop', 'labor', 'experiment'] },
  { page: 'calendar', label: 'Planer', icon: '📅', keywords: ['kalender', 'calendar', 'planer', 'termine', 'zeitplan'] },
  { page: 'tasks', label: 'Aufgaben', icon: '✅', keywords: ['aufgaben', 'tasks', 'todos', 'to-do', 'erledigungen'] },
  { page: 'kanban', label: 'Kanban', icon: '📋', keywords: ['kanban', 'board', 'spalten'] },
  { page: 'documents', label: 'Dokumente', icon: '📁', keywords: ['dokumente', 'documents', 'dateien', 'wissensbasis'] },
  { page: 'insights', label: 'Insights', icon: '📊', keywords: ['insights', 'statistiken', 'analytics', 'auswertung'] },
  { page: 'business', label: 'Business', icon: '📈', keywords: ['business', 'geschaeft', 'umsatz', 'revenue'] },
  { page: 'email', label: 'E-Mail', icon: '📧', keywords: ['email', 'e-mail', 'mail', 'posteingang', 'inbox'] },
  { page: 'contacts', label: 'Kontakte', icon: '👥', keywords: ['kontakte', 'contacts', 'crm', 'personen', 'adressen'] },
  { page: 'finance', label: 'Finanzen', icon: '💰', keywords: ['finanzen', 'finance', 'geld', 'budget', 'ausgaben', 'konto'] },
  { page: 'browser', label: 'Browser', icon: '🌐', keywords: ['browser', 'web', 'internet', 'surfen'] },
  { page: 'learning', label: 'Lernen', icon: '📚', keywords: ['lernen', 'learning', 'kurs', 'bildung', 'studieren'] },
  { page: 'my-ai', label: 'Meine KI', icon: '🤖', keywords: ['meine ki', 'my ai', 'ki einstellungen', 'personalisieren'] },
  { page: 'settings', label: 'Einstellungen', icon: '⚙️', keywords: ['einstellungen', 'settings', 'optionen', 'konfiguration'] },
  { page: 'notifications', label: 'Benachrichtigungen', icon: '🔔', keywords: ['benachrichtigungen', 'notifications', 'alerts'] },
  { page: 'agent-teams', label: 'Agenten-Teams', icon: '🤝', keywords: ['agenten', 'agents', 'teams', 'multi-agent'] },
  { page: 'canvas', label: 'Canvas', icon: '🎨', keywords: ['canvas', 'zeichnen', 'editor', 'whiteboard'] },
  { page: 'map', label: 'Karte', icon: '🗺️', keywords: ['karte', 'map', 'navigation', 'route', 'standort'] },
];

// ===========================================
// Create Action Patterns
// ===========================================

interface CreatePattern {
  target: string;
  label: string;
  icon: string;
  keywords: string[];
  page: string;
}

const CREATE_PATTERNS: CreatePattern[] = [
  { target: 'idea', label: 'Neue Idee erstellen', icon: '💡', keywords: ['idee', 'gedanke', 'notiz', 'idea'], page: 'ideas' },
  { target: 'task', label: 'Neue Aufgabe erstellen', icon: '✅', keywords: ['aufgabe', 'task', 'todo', 'to-do'], page: 'tasks' },
  { target: 'email', label: 'Neue E-Mail verfassen', icon: '📧', keywords: ['email', 'e-mail', 'mail', 'nachricht'], page: 'email' },
  { target: 'event', label: 'Neuen Termin erstellen', icon: '📅', keywords: ['termin', 'event', 'meeting', 'besprechung'], page: 'calendar' },
  { target: 'contact', label: 'Neuen Kontakt anlegen', icon: '👤', keywords: ['kontakt', 'contact', 'person'], page: 'contacts' },
  { target: 'document', label: 'Neues Dokument erstellen', icon: '📄', keywords: ['dokument', 'document', 'datei'], page: 'documents' },
  { target: 'project', label: 'Neues Projekt erstellen', icon: '📁', keywords: ['projekt', 'project'], page: 'projects' },
  { target: 'canvas', label: 'Neues Canvas erstellen', icon: '🎨', keywords: ['canvas', 'zeichnung', 'board'], page: 'canvas' },
];

// ===========================================
// Cross-Feature Action Patterns
// ===========================================

interface CrossFeaturePattern {
  id: string;
  label: string;
  description: string;
  icon: string;
  keywords: string[];
  sourceFeature: string;
  targetFeature: string;
}

const CROSS_FEATURE_PATTERNS: CrossFeaturePattern[] = [
  {
    id: 'email_to_task',
    label: 'Aufgabe aus E-Mail erstellen',
    description: 'Wandelt eine E-Mail in eine Aufgabe um',
    icon: '📧➡️✅',
    keywords: ['aufgabe aus email', 'email zu aufgabe', 'task from email'],
    sourceFeature: 'email',
    targetFeature: 'tasks',
  },
  {
    id: 'idea_to_task',
    label: 'Aufgabe aus Idee erstellen',
    description: 'Wandelt eine Idee in eine Aufgabe um',
    icon: '💡➡️✅',
    keywords: ['aufgabe aus idee', 'idee zu aufgabe', 'task from idea'],
    sourceFeature: 'ideas',
    targetFeature: 'tasks',
  },
  {
    id: 'email_to_contact',
    label: 'Kontakt aus E-Mail erstellen',
    description: 'Erstellt einen Kontakt aus einer E-Mail-Adresse',
    icon: '📧➡️👤',
    keywords: ['kontakt aus email', 'email zu kontakt', 'contact from email'],
    sourceFeature: 'email',
    targetFeature: 'contacts',
  },
  {
    id: 'task_to_event',
    label: 'Termin aus Aufgabe erstellen',
    description: 'Blockt Zeit im Kalender fuer eine Aufgabe',
    icon: '✅➡️📅',
    keywords: ['termin aus aufgabe', 'aufgabe einplanen', 'schedule task'],
    sourceFeature: 'tasks',
    targetFeature: 'calendar',
  },
  {
    id: 'idea_to_document',
    label: 'Dokument aus Idee erstellen',
    description: 'Erstellt ein strukturiertes Dokument aus einer Idee',
    icon: '💡➡️📄',
    keywords: ['dokument aus idee', 'idee zu dokument', 'document from idea'],
    sourceFeature: 'ideas',
    targetFeature: 'documents',
  },
];

// ===========================================
// Search Keywords
// ===========================================

const SEARCH_KEYWORDS = [
  'suche', 'suchen', 'finde', 'finden', 'search', 'find', 'wo ist', 'wo sind',
  'zeig mir', 'zeige', 'show', 'list', 'alle', 'auflisten',
];

const CREATE_KEYWORDS = [
  'erstelle', 'erstellen', 'create', 'neue', 'neuer', 'neues', 'neu',
  'anlegen', 'hinzufuegen', 'add', 'schreibe', 'schreiben', 'verfasse', 'verfassen',
];

const NAVIGATE_KEYWORDS = [
  'gehe zu', 'geh zu', 'oeffne', 'oeffnen', 'zeige', 'zeig', 'navigiere',
  'go to', 'open', 'show', 'navigate', 'wechsle zu', 'wechsel zu',
];

const ACTION_KEYWORDS = [
  'sende', 'senden', 'send', 'loesche', 'loeschen', 'delete', 'archiviere',
  'archivieren', 'archive', 'exportiere', 'exportieren', 'export',
  'synchronisiere', 'sync', 'starte', 'start', 'stoppe', 'stop',
];

const QUESTION_KEYWORDS = [
  'was ist', 'wie', 'warum', 'wann', 'wer', 'welche', 'erklaere', 'erklaeren',
  'what', 'how', 'why', 'when', 'who', 'which', 'explain', 'hilfe', 'help',
  'kann ich', 'wie kann', 'wie geht',
];

// ===========================================
// Intent Classification
// ===========================================

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/[ß]/g, 'ss')
    .trim();
}

function matchesKeywords(normalized: string, keywords: string[]): boolean {
  return keywords.some(kw => normalized.includes(kw));
}

function scoreKeywordMatch(normalized: string, keywords: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    if (normalized.includes(kw)) {
      // Longer keyword matches score higher
      score += kw.length;
      // Exact start scores highest
      if (normalized.startsWith(kw)) {
        score += 10;
      }
    }
  }
  return score;
}

export function classifyIntent(query: string): { intent: IntentType; confidence: number } {
  const normalized = normalizeQuery(query);

  if (!normalized || normalized.length < 2) {
    return { intent: 'question', confidence: 0.1 };
  }

  // Score each intent type
  const scores: Record<IntentType, number> = {
    navigate: scoreKeywordMatch(normalized, NAVIGATE_KEYWORDS),
    create: scoreKeywordMatch(normalized, CREATE_KEYWORDS),
    search: scoreKeywordMatch(normalized, SEARCH_KEYWORDS),
    action: scoreKeywordMatch(normalized, ACTION_KEYWORDS),
    question: scoreKeywordMatch(normalized, QUESTION_KEYWORDS),
  };

  // Boost navigate if a nav target is mentioned
  for (const target of NAV_TARGETS) {
    if (target.keywords.some(kw => normalized.includes(kw))) {
      scores.navigate += 5;
    }
  }

  // Boost create if a create target is mentioned
  for (const pattern of CREATE_PATTERNS) {
    if (pattern.keywords.some(kw => normalized.includes(kw))) {
      scores.create += 5;
    }
  }

  // Boost action if a cross-feature pattern is mentioned (high boost to override create)
  for (const pattern of CROSS_FEATURE_PATTERNS) {
    if (pattern.keywords.some(kw => normalized.includes(kw))) {
      scores.action += 30;
    }
  }

  // Find highest scoring intent
  let bestIntent: IntentType = 'question';
  let bestScore = 0;

  for (const [intent, score] of Object.entries(scores) as [IntentType, number][]) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  // Calculate confidence based on score magnitude
  const confidence = bestScore === 0
    ? 0.3
    : Math.min(0.95, 0.5 + bestScore * 0.03);

  return { intent: bestIntent, confidence };
}

// ===========================================
// Action Resolution
// ===========================================

function resolveNavigateActions(normalized: string): AssistantAction[] {
  const actions: AssistantAction[] = [];

  for (const target of NAV_TARGETS) {
    const matches = target.keywords.some(kw => normalized.includes(kw));
    if (matches) {
      actions.push({
        type: 'navigate',
        target: target.page,
        label: target.label,
        description: `Navigiere zu ${target.label}`,
        page: target.page,
        icon: target.icon,
      });
    }
  }

  return actions;
}

function resolveCreateActions(normalized: string): AssistantAction[] {
  const actions: AssistantAction[] = [];

  for (const pattern of CREATE_PATTERNS) {
    const matches = pattern.keywords.some(kw => normalized.includes(kw));
    if (matches) {
      actions.push({
        type: 'create',
        target: pattern.target,
        label: pattern.label,
        page: pattern.page,
        icon: pattern.icon,
      });
    }
  }

  return actions;
}

function resolveSearchActions(normalized: string): AssistantAction[] {
  // Extract the search term (everything after the search keyword)
  let searchTerm = normalized;
  for (const kw of SEARCH_KEYWORDS) {
    if (normalized.includes(kw)) {
      const idx = normalized.indexOf(kw);
      searchTerm = normalized.slice(idx + kw.length).trim();
      break;
    }
  }

  const actions: AssistantAction[] = [
    {
      type: 'search',
      target: 'global',
      params: { query: searchTerm || normalized },
      label: `Suche nach "${searchTerm || normalized}"`,
      description: 'Globale Suche ueber alle Bereiche',
      icon: '🔍',
    },
  ];

  // Add specific feature searches if a feature is mentioned
  for (const target of NAV_TARGETS) {
    if (target.keywords.some(kw => normalized.includes(kw))) {
      actions.push({
        type: 'search',
        target: target.page,
        params: { query: searchTerm, scope: target.page },
        label: `In ${target.label} suchen`,
        page: target.page,
        icon: target.icon,
      });
    }
  }

  return actions;
}

function resolveCrossFeatureActions(normalized: string): AssistantAction[] {
  const actions: AssistantAction[] = [];

  for (const pattern of CROSS_FEATURE_PATTERNS) {
    const matches = pattern.keywords.some(kw => normalized.includes(kw));
    if (matches) {
      actions.push({
        type: 'action',
        target: pattern.id,
        label: pattern.label,
        description: pattern.description,
        page: pattern.targetFeature,
        icon: pattern.icon,
        params: {
          sourceFeature: pattern.sourceFeature,
          targetFeature: pattern.targetFeature,
        },
      });
    }
  }

  return actions;
}

function resolveQuestionActions(_normalized: string): AssistantAction[] {
  return [
    {
      type: 'question',
      target: 'chat',
      label: 'Im Chat beantworten',
      description: 'Frage an den KI-Assistenten weiterleiten',
      page: 'chat',
      icon: '💬',
    },
  ];
}

// ===========================================
// Main Query Processing
// ===========================================

export function processQuery(query: string): AssistantResult {
  const normalized = normalizeQuery(query);
  const { intent, confidence } = classifyIntent(query);

  let actions: AssistantAction[] = [];

  switch (intent) {
    case 'navigate':
      actions = resolveNavigateActions(normalized);
      break;
    case 'create':
      actions = resolveCreateActions(normalized);
      break;
    case 'search':
      actions = resolveSearchActions(normalized);
      break;
    case 'action':
      actions = resolveCrossFeatureActions(normalized);
      break;
    case 'question':
      actions = resolveQuestionActions(normalized);
      break;
  }

  // Fallback: if no specific actions matched, suggest chat
  if (actions.length === 0) {
    actions = [
      {
        type: 'question',
        target: 'chat',
        label: 'Im Chat beantworten',
        description: 'Frage an den KI-Assistenten weiterleiten',
        page: 'chat',
        icon: '💬',
      },
    ];
  }

  // Limit to top 5 actions
  return {
    intent,
    confidence,
    actions: actions.slice(0, 5),
  };
}

// ===========================================
// Context-Aware Suggestions
// ===========================================

const PAGE_SUGGESTIONS: Record<string, ContextSuggestion[]> = {
  dashboard: [
    { label: 'Neue Idee erfassen', query: 'erstelle neue idee', icon: '💡', category: 'create' },
    { label: 'Aufgaben anzeigen', query: 'zeige aufgaben', icon: '✅', category: 'navigate' },
    { label: 'E-Mails pruefen', query: 'oeffne email', icon: '📧', category: 'navigate' },
    { label: 'Termine heute', query: 'oeffne kalender', icon: '📅', category: 'navigate' },
  ],
  ideas: [
    { label: 'Idee suchen', query: 'suche ideen', icon: '🔍', category: 'search' },
    { label: 'Neue Idee', query: 'erstelle neue idee', icon: '💡', category: 'create' },
    { label: 'Idee zu Aufgabe', query: 'aufgabe aus idee erstellen', icon: '✅', category: 'action' },
    { label: 'Insights anzeigen', query: 'oeffne insights', icon: '📊', category: 'navigate' },
  ],
  email: [
    { label: 'E-Mail verfassen', query: 'erstelle neue email', icon: '✉️', category: 'create' },
    { label: 'E-Mail suchen', query: 'suche emails', icon: '🔍', category: 'search' },
    { label: 'Aufgabe aus E-Mail', query: 'aufgabe aus email erstellen', icon: '✅', category: 'action' },
    { label: 'Kontakt aus E-Mail', query: 'kontakt aus email erstellen', icon: '👤', category: 'action' },
  ],
  calendar: [
    { label: 'Neuer Termin', query: 'erstelle neuen termin', icon: '📅', category: 'create' },
    { label: 'Aufgaben anzeigen', query: 'zeige aufgaben', icon: '✅', category: 'navigate' },
    { label: 'Kanban Board', query: 'oeffne kanban', icon: '📋', category: 'navigate' },
  ],
  tasks: [
    { label: 'Neue Aufgabe', query: 'erstelle neue aufgabe', icon: '✅', category: 'create' },
    { label: 'Aufgabe suchen', query: 'suche aufgaben', icon: '🔍', category: 'search' },
    { label: 'Aufgabe einplanen', query: 'termin aus aufgabe erstellen', icon: '📅', category: 'action' },
  ],
  contacts: [
    { label: 'Neuer Kontakt', query: 'erstelle neuen kontakt', icon: '👤', category: 'create' },
    { label: 'Kontakt suchen', query: 'suche kontakte', icon: '🔍', category: 'search' },
  ],
  chat: [
    { label: 'Gedanken oeffnen', query: 'oeffne gedanken', icon: '💡', category: 'navigate' },
    { label: 'Dokumente durchsuchen', query: 'suche dokumente', icon: '📁', category: 'search' },
  ],
  documents: [
    { label: 'Neues Dokument', query: 'erstelle neues dokument', icon: '📄', category: 'create' },
    { label: 'Dokument suchen', query: 'suche dokumente', icon: '🔍', category: 'search' },
  ],
  finance: [
    { label: 'Finanzen durchsuchen', query: 'suche finanzen', icon: '🔍', category: 'search' },
    { label: 'Business Dashboard', query: 'oeffne business', icon: '📈', category: 'navigate' },
  ],
};

const DEFAULT_SUGGESTIONS: ContextSuggestion[] = [
  { label: 'Neue Idee', query: 'erstelle neue idee', icon: '💡', category: 'create' },
  { label: 'E-Mails pruefen', query: 'oeffne email', icon: '📧', category: 'navigate' },
  { label: 'Globale Suche', query: 'suche', icon: '🔍', category: 'search' },
  { label: 'Chat oeffnen', query: 'oeffne chat', icon: '💬', category: 'navigate' },
];

export function getSuggestionsForPage(pageContext: string): ContextSuggestion[] {
  return PAGE_SUGGESTIONS[pageContext] ?? DEFAULT_SUGGESTIONS;
}

// ===========================================
// Database Operations
// ===========================================

export async function recordInteraction(
  context: AIContext,
  userId: string,
  data: {
    query: string;
    intent: string;
    action: Record<string, unknown> | null;
    result: Record<string, unknown> | null;
    pageContext: string | null;
    responseTimeMs: number;
  }
): Promise<string> {
  try {
    const res = await queryContext(
      context,
      `INSERT INTO assistant_interactions (user_id, query, intent, action, result, page_context, response_time_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        userId,
        data.query,
        data.intent,
        data.action ? JSON.stringify(data.action) : null,
        data.result ? JSON.stringify(data.result) : null,
        data.pageContext,
        data.responseTimeMs,
      ]
    );
    return res.rows[0]?.id ?? '';
  } catch (err) {
    logger.error('Failed to record assistant interaction', err as Error);
    return '';
  }
}

export async function getInteractionHistory(
  context: AIContext,
  userId: string,
  limit = 20
): Promise<AssistantInteraction[]> {
  try {
    const res = await queryContext(
      context,
      `SELECT id, user_id, query, intent, action, result, page_context, response_time_ms, created_at
       FROM assistant_interactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return res.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      userId: row.user_id as string,
      query: row.query as string,
      intent: row.intent as string | null,
      action: row.action as Record<string, unknown> | null,
      result: row.result as Record<string, unknown> | null,
      pageContext: row.page_context as string | null,
      responseTimeMs: row.response_time_ms as number | null,
      createdAt: row.created_at as string,
    }));
  } catch (err) {
    logger.error('Failed to get assistant interaction history', err as Error);
    return [];
  }
}
