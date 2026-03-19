/**
 * Claude Tool Use Module
 *
 * Implements Claude's native tool use (function calling) capability
 * for structured, reliable actions within conversations.
 *
 * Benefits over free-form responses:
 * - Guaranteed structured output
 * - Type-safe action execution
 * - Composable tool chains
 * - Better error handling
 *
 * @module services/claude/tool-use
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';
import { getClaudeClient, executeWithProtection, CLAUDE_MODEL } from './client';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Execution context passed to tool handlers
 * This replaces the global context state to enable request-scoped execution
 */
export interface ToolExecutionContext {
  /** The AI context (personal or work) */
  aiContext: 'personal' | 'work' | 'learning' | 'creative';
  /** Optional session ID for tracking */
  sessionId?: string;
  /** Optional user ID for audit */
  userId?: string;
}

/**
 * Tool definition following Claude's schema
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required: string[];
  };
}

/**
 * Result from a tool execution
 */
export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Tool call from Claude's response
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Handler function for tool execution
 * Now accepts ToolExecutionContext for request-scoped execution
 */
export type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<string>;

/**
 * Registered tool with definition and handler
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

/**
 * Options for tool-enabled calls
 */
export interface ToolUseOptions {
  /** Maximum iterations for multi-turn tool use */
  maxIterations?: number;
  /** System prompt */
  systemPrompt?: string;
  /** Temperature (0-1) */
  temperature?: number;
  /** Force specific tool usage */
  toolChoice?: { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string };
  /** Execution context for request-scoped tool execution */
  executionContext?: ToolExecutionContext;
}

/**
 * Result from a tool-enabled conversation
 */
export interface ToolUseResult {
  /** Final text response */
  response: string;
  /** Tools that were called */
  toolsCalled: Array<{ name: string; input: Record<string, unknown>; result: string }>;
  /** Number of iterations used */
  iterations: number;
  /** Stop reason */
  stopReason: string;
}

// ===========================================
// Built-in Tool Definitions
// ===========================================

/**
 * Search ideas tool - semantic search through user's ideas
 */
export const TOOL_SEARCH_IDEAS: ToolDefinition = {
  name: 'search_ideas',
  description: 'Durchsucht die Ideen des Benutzers nach relevanten Einträgen. Nutze dies um Kontext zu finden oder verwandte Ideen zu identifizieren.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Die Suchanfrage (semantische Suche)',
      },
      limit: {
        type: 'number',
        description: 'Maximale Anzahl Ergebnisse (Standard: 5)',
      },
    },
    required: ['query'],
  },
};

/**
 * Create idea tool - structure and save a new idea
 */
export const TOOL_CREATE_IDEA: ToolDefinition = {
  name: 'create_idea',
  description: 'Erstellt eine neue strukturierte Idee basierend auf dem Gespräch. Nutze dies wenn der Benutzer eine Idee, Aufgabe oder Erkenntnis festhalten möchte.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Kurzer, prägnanter Titel (max. 10 Wörter)',
      },
      type: {
        type: 'string',
        description: 'Art der Idee',
        enum: ['idea', 'task', 'insight', 'problem', 'question'],
      },
      summary: {
        type: 'string',
        description: 'Zusammenfassung in 1-2 Sätzen',
      },
      category: {
        type: 'string',
        description: 'Kategorie',
        enum: ['business', 'technical', 'personal', 'learning'],
      },
      priority: {
        type: 'string',
        description: 'Priorität',
        enum: ['low', 'medium', 'high'],
      },
      next_steps: {
        type: 'array',
        description: 'Nächste Schritte (optional)',
        items: { type: 'string' },
      },
    },
    required: ['title', 'type', 'summary'],
  },
};

/**
 * Get related ideas tool - find connected ideas via knowledge graph
 */
export const TOOL_GET_RELATED: ToolDefinition = {
  name: 'get_related_ideas',
  description: 'Findet verwandte Ideen über den Knowledge Graph. Nutze dies um Verbindungen und Zusammenhänge aufzuzeigen.',
  input_schema: {
    type: 'object',
    properties: {
      idea_id: {
        type: 'string',
        description: 'ID der Ausgangsidee',
      },
      relationship_types: {
        type: 'array',
        description: 'Arten von Beziehungen (optional)',
        items: { type: 'string' },
      },
    },
    required: ['idea_id'],
  },
};

/**
 * Web search tool - search the web for information
 */
export const TOOL_WEB_SEARCH: ToolDefinition = {
  name: 'web_search',
  description: 'Durchsucht das Web nach aktuellen Informationen. Nutze dies für Recherche zu aktuellen Themen, Nachrichten, oder wenn der Nutzer nach aktuellen Informationen fragt.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Die Suchanfrage',
      },
      count: {
        type: 'number',
        description: 'Anzahl der Ergebnisse (Standard: 5, Max: 10)',
      },
    },
    required: ['query'],
  },
};

/**
 * Fetch URL tool - fetch and extract content from a URL
 */
export const TOOL_FETCH_URL: ToolDefinition = {
  name: 'fetch_url',
  description: 'Ruft den Inhalt einer URL ab und extrahiert den lesbaren Text. Nutze dies wenn der Nutzer einen Link teilt und wissen möchte was darin steht, oder wenn du Details zu einem Suchergebnis brauchst.',
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Die URL die abgerufen werden soll',
      },
    },
    required: ['url'],
  },
};

/**
 * GitHub search repositories tool
 */
export const TOOL_GITHUB_SEARCH: ToolDefinition = {
  name: 'github_search',
  description: 'Durchsucht GitHub nach Repositories. Nutze dies wenn der Nutzer nach Code-Projekten, Libraries oder Open-Source Software sucht.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Suchanfrage (z.B. "react state management", "python web framework")',
      },
      limit: {
        type: 'number',
        description: 'Anzahl der Ergebnisse (Standard: 5, Max: 10)',
      },
    },
    required: ['query'],
  },
};

/**
 * GitHub create issue tool
 */
export const TOOL_GITHUB_CREATE_ISSUE: ToolDefinition = {
  name: 'github_create_issue',
  description: 'Erstellt ein neues Issue in einem GitHub Repository. Nutze dies wenn der Nutzer aus einer Idee oder einem Problem ein GitHub Issue erstellen möchte.',
  input_schema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository-Besitzer (Username oder Organisation)',
      },
      repo: {
        type: 'string',
        description: 'Repository-Name',
      },
      title: {
        type: 'string',
        description: 'Titel des Issues',
      },
      body: {
        type: 'string',
        description: 'Beschreibung des Issues (Markdown)',
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Labels für das Issue (optional)',
      },
    },
    required: ['owner', 'repo', 'title'],
  },
};

/**
 * GitHub get repository info tool
 */
export const TOOL_GITHUB_REPO_INFO: ToolDefinition = {
  name: 'github_repo_info',
  description: 'Ruft Informationen über ein GitHub Repository ab. Nutze dies um Details zu einem Projekt zu erfahren.',
  input_schema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository-Besitzer',
      },
      repo: {
        type: 'string',
        description: 'Repository-Name',
      },
    },
    required: ['owner', 'repo'],
  },
};

/**
 * GitHub list issues tool
 */
export const TOOL_GITHUB_LIST_ISSUES: ToolDefinition = {
  name: 'github_list_issues',
  description: 'Listet Issues eines GitHub Repositories auf. Nutze dies um offene Probleme oder Feature-Requests zu sehen.',
  input_schema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository-Besitzer',
      },
      repo: {
        type: 'string',
        description: 'Repository-Name',
      },
      state: {
        type: 'string',
        enum: ['open', 'closed', 'all'],
        description: 'Status der Issues (Standard: open)',
      },
      limit: {
        type: 'number',
        description: 'Anzahl der Issues (Standard: 5)',
      },
    },
    required: ['owner', 'repo'],
  },
};

/**
 * GitHub PR summary tool
 */
export const TOOL_GITHUB_PR_SUMMARY: ToolDefinition = {
  name: 'github_pr_summary',
  description: 'Ruft eine Zusammenfassung eines Pull Requests ab. Nutze dies um zu verstehen was ein PR ändert.',
  input_schema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository-Besitzer',
      },
      repo: {
        type: 'string',
        description: 'Repository-Name',
      },
      pr_number: {
        type: 'number',
        description: 'Pull Request Nummer',
      },
    },
    required: ['owner', 'repo', 'pr_number'],
  },
};

/**
 * Calculate tool - perform calculations
 */
export const TOOL_CALCULATE: ToolDefinition = {
  name: 'calculate',
  description: 'Führt mathematische Berechnungen durch. Nutze dies für exakte numerische Ergebnisse.',
  input_schema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematischer Ausdruck (z.B. "2 * 3 + 4")',
      },
    },
    required: ['expression'],
  },
};

/**
 * Remember tool - store important information in long-term memory
 * Used to persist facts, preferences, and knowledge about the user
 */
export const TOOL_REMEMBER: ToolDefinition = {
  name: 'remember',
  description:
    'Speichert wichtige Informationen im Langzeitgedächtnis. Nutze dies wenn der Nutzer explizit sagt "merk dir das", oder wenn wichtige Fakten, Präferenzen oder Erkenntnisse über den Nutzer aus dem Gespräch hervorgehen.',
  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Die zu merkende Information (klar und präzise formuliert)',
      },
      fact_type: {
        type: 'string',
        description: 'Art der Information',
        enum: ['preference', 'behavior', 'knowledge', 'goal', 'context'],
      },
      confidence: {
        type: 'number',
        description: 'Konfidenz 0.0-1.0 (wie sicher ist diese Info?). Standard: 0.8 für explizite Aussagen, 0.6 für Inferenzen.',
      },
    },
    required: ['content', 'fact_type'],
  },
};

/**
 * Recall tool - search through episodic and long-term memory
 * Used to remember past conversations and stored facts
 */
export const TOOL_RECALL: ToolDefinition = {
  name: 'recall',
  description:
    'Durchsucht Erinnerungen und frühere Gespräche. Nutze dies wenn der Nutzer fragt "erinnerst du dich", "was habe ich gesagt", "was weißt du über mich", oder wenn Kontext aus früheren Gesprächen relevant sein könnte.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Suchanfrage (was soll erinnert werden?)',
      },
      memory_type: {
        type: 'string',
        description: 'Art der Erinnerung',
        enum: ['episodes', 'facts', 'all'],
      },
      limit: {
        type: 'number',
        description: 'Maximale Anzahl Ergebnisse (Standard: 5)',
      },
    },
    required: ['query'],
  },
};

/**
 * Memory introspect tool - AI inspects its own memory state
 * Mem0 "Memory-as-a-Tool" pattern: AI queries memory on-demand
 * instead of relying solely on pre-loaded context.
 */
export const TOOL_MEMORY_INTROSPECT: ToolDefinition = {
  name: 'memory_introspect',
  description:
    'Inspiziert den eigenen Gedaechtniszustand. Zeigt aktive Arbeitsspeicher-Slots, langfristige Fakten, Episoden-Statistiken und kontextuebergreifende Insights. Nutze dies um besser zu verstehen was du ueber den Nutzer weisst, bevor du Annahmen triffst.',
  input_schema: {
    type: 'object',
    properties: {
      aspect: {
        type: 'string',
        description: 'Welcher Aspekt des Gedaechtnisses soll inspiziert werden?',
        enum: ['facts', 'episodes', 'working_memory', 'cross_context', 'overview'],
      },
      topic_filter: {
        type: 'string',
        description: 'Optionaler Themenfllter fuer gezieltere Ergebnisse',
      },
    },
    required: ['aspect'],
  },
};

/**
 * Analyze project tool - comprehensive project analysis
 */
export const TOOL_ANALYZE_PROJECT: ToolDefinition = {
  name: 'analyze_project',
  description: 'Analysiert ein Software-Projekt und liefert umfassenden Kontext. Nutze dies wenn der Nutzer über sein Projekt, seine Codebase oder technische Fragen spricht, oder wenn du Kontext über das Projekt benötigst um bessere Antworten zu geben.',
  input_schema: {
    type: 'object',
    properties: {
      project_path: {
        type: 'string',
        description: 'Pfad zum Projektverzeichnis',
      },
      include_readme: {
        type: 'string',
        description: 'README-Inhalt einbeziehen (true/false, Standard: true)',
        enum: ['true', 'false'],
      },
    },
    required: ['project_path'],
  },
};

/**
 * Get project summary tool - quick project overview
 */
export const TOOL_PROJECT_SUMMARY: ToolDefinition = {
  name: 'get_project_summary',
  description: 'Gibt eine kurze Zusammenfassung eines Projekts zurück. Schneller als analyze_project, ideal für einen schnellen Überblick.',
  input_schema: {
    type: 'object',
    properties: {
      project_path: {
        type: 'string',
        description: 'Pfad zum Projektverzeichnis',
      },
    },
    required: ['project_path'],
  },
};

/**
 * List project files tool - get project structure
 */
export const TOOL_LIST_PROJECT_FILES: ToolDefinition = {
  name: 'list_project_files',
  description: 'Listet die Dateistruktur eines Projekts auf. Nutze dies um zu verstehen wie ein Projekt organisiert ist.',
  input_schema: {
    type: 'object',
    properties: {
      project_path: {
        type: 'string',
        description: 'Pfad zum Projektverzeichnis',
      },
      max_depth: {
        type: 'number',
        description: 'Maximale Tiefe der Verzeichnisstruktur (Standard: 3)',
      },
      filter_extension: {
        type: 'string',
        description: 'Nur Dateien mit dieser Erweiterung anzeigen (z.B. "ts", "py")',
      },
    },
    required: ['project_path'],
  },
};

/**
 * Execute code tool - run code in a sandboxed environment
 */
export const TOOL_EXECUTE_CODE: ToolDefinition = {
  name: 'execute_code',
  description: 'Führt Code in einer sicheren Sandbox-Umgebung aus. Unterstützt Python, Node.js und Bash. Nutze dies wenn der Nutzer Code ausführen oder testen möchte, Berechnungen durchführen will, oder Datenanalyse benötigt.',
  input_schema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Der auszuführende Code',
      },
      language: {
        type: 'string',
        enum: ['python', 'nodejs', 'bash'],
        description: 'Programmiersprache: python, nodejs, oder bash',
      },
      input_data: {
        type: 'string',
        description: 'Optionale Eingabedaten für den Code (z.B. JSON, CSV)',
      },
    },
    required: ['code', 'language'],
  },
};

/**
 * Analyze document tool - analyze uploaded documents in chat
 */
export const TOOL_ANALYZE_DOCUMENT: ToolDefinition = {
  name: 'analyze_document',
  description: 'Analysiert ein hochgeladenes Dokument (PDF, Excel, CSV) mit einer gewählten Analyse-Vorlage. Nutze dies wenn der Nutzer ein Dokument hochgeladen hat und eine Analyse wünscht, z.B. "Analysiere das als Finanzanalyse" oder "Fasse dieses Dokument zusammen".',
  input_schema: {
    type: 'object',
    properties: {
      template: {
        type: 'string',
        description: 'Analyse-Vorlage: general (Allgemein), financial (Finanzen), contract (Vertrag), data (Daten), summary (Zusammenfassung)',
        enum: ['general', 'financial', 'contract', 'data', 'summary'],
      },
      custom_prompt: {
        type: 'string',
        description: 'Optionale eigene Anweisung für die Analyse (überschreibt die Vorlage)',
      },
      language: {
        type: 'string',
        description: 'Sprache der Analyse (de oder en, Standard: de)',
        enum: ['de', 'en'],
      },
    },
    required: ['template'],
  },
};

/**
 * Document search tool
 * Phase 32: Document Vault
 */
export const TOOL_SEARCH_DOCUMENTS: ToolDefinition = {
  name: 'search_documents',
  description: 'Durchsucht die hochgeladenen Dokumente des Nutzers semantisch. Nutze dies wenn der Nutzer nach Inhalten in seinen Dokumenten, PDFs, oder Dateien fragt. Liefert relevante Textauszüge mit Quellenangabe.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Die Suchanfrage - was im Dokument gesucht werden soll',
      },
      limit: {
        type: 'number',
        description: 'Maximale Anzahl Ergebnisse (Standard: 5)',
      },
      file_types: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: Nur bestimmte Dateitypen durchsuchen (z.B. ["pdf", "docx"])',
      },
    },
    required: ['query'],
  },
};

/**
 * Synthesize Knowledge - Cross-Idea Synthesis via RAG-Fusion
 * Phase 32B: Synthesis Engine
 */
export const TOOL_SYNTHESIZE_KNOWLEDGE: ToolDefinition = {
  name: 'synthesize_knowledge',
  description: 'Synthetisiert Wissen über mehrere Ideen hinweg zu einem kohärenten Überblick. Nutze dieses Tool wenn der Nutzer einen Überblick, eine Zusammenfassung oder eine Synthese über ein Thema aus seinen Ideen möchte. Zeigt Entwicklung, Widersprüche und Wissenslücken. Besser als einfache Suche für Fragen wie "Was weiß ich über X?" oder "Fasse zusammen was ich zu Y habe".',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Das Thema für die Synthese (z.B. "Marketing-Strategien" oder "KI im Gesundheitswesen")',
      },
      language: {
        type: 'string',
        description: 'Sprache der Synthese: "de" (Standard) oder "en"',
        enum: ['de', 'en'],
      },
    },
    required: ['query'],
  },
};

// ===========================================
// Assistant Tools (Floating Assistant)
// ===========================================

export const TOOL_CREATE_MEETING: ToolDefinition = {
  name: 'create_meeting',
  description: 'Erstellt ein neues Meeting/Termin. Nutze dies wenn der Nutzer ein Meeting, Termin, oder Besprechung erwähnt. Parse Datum, Uhrzeit, Teilnehmer und Dauer aus natürlicher Sprache.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Titel des Meetings',
      },
      date: {
        type: 'string',
        description: 'Datum und Uhrzeit im ISO 8601 Format (z.B. 2026-02-10T14:00:00)',
      },
      duration_minutes: {
        type: 'number',
        description: 'Dauer in Minuten (Standard: 60)',
      },
      participants: {
        type: 'array',
        description: 'Liste der Teilnehmer',
        items: { type: 'string' },
      },
      location: {
        type: 'string',
        description: 'Ort des Meetings (optional)',
      },
    },
    required: ['title', 'date'],
  },
};

export const TOOL_NAVIGATE_TO: ToolDefinition = {
  name: 'navigate_to',
  description: 'Navigiert den Nutzer zu einer bestimmten Seite der App. Nutze dies wenn der Nutzer eine Seite besuchen moechte oder nach einem Feature fragt.',
  input_schema: {
    type: 'object',
    properties: {
      page: {
        type: 'string',
        description: 'Zielseite',
        enum: [
          'home', 'chat', 'browser',
          'ideas', 'incubator', 'archive', 'triage',
          'workshop', 'agent-teams',
          'calendar', 'tasks', 'kanban', 'gantt', 'meetings',
          'contacts', 'email', 'documents', 'media', 'canvas',
          'insights', 'finance', 'business',
          'my-ai', 'voice-chat', 'learning', 'screen-memory',
          'settings', 'profile', 'automations', 'integrations',
          'notifications',
        ],
      },
      reason: {
        type: 'string',
        description: 'Kurze Erklaerung warum diese Seite relevant ist',
      },
    },
    required: ['page'],
  },
};

export const TOOL_APP_HELP: ToolDefinition = {
  name: 'app_help',
  description: 'Erklaert ein Feature oder eine Seite der ZenAI App. Nutze dies wenn der Nutzer fragt wie etwas funktioniert oder was eine Seite tut.',
  input_schema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Das Feature oder die Seite ueber die Hilfe gebraucht wird',
      },
    },
    required: ['topic'],
  },
};

// ===========================================
// CRUD Tools (Update, Archive, Delete)
// ===========================================

export const TOOL_UPDATE_IDEA: ToolDefinition = {
  name: 'update_idea',
  description: 'Aktualisiert eine bestehende Idee. Nutze dies wenn der Nutzer eine Idee aendern, umbenennen, die Prioritaet aendern oder Details hinzufuegen moechte.',
  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Die ID der zu aktualisierenden Idee',
      },
      title: {
        type: 'string',
        description: 'Neuer Titel (optional)',
      },
      summary: {
        type: 'string',
        description: 'Neue Zusammenfassung (optional)',
      },
      priority: {
        type: 'string',
        description: 'Neue Prioritaet',
        enum: ['low', 'medium', 'high'],
      },
      category: {
        type: 'string',
        description: 'Neue Kategorie',
        enum: ['business', 'technical', 'personal', 'learning'],
      },
      type: {
        type: 'string',
        description: 'Neuer Typ',
        enum: ['idea', 'task', 'insight', 'problem', 'question'],
      },
    },
    required: ['id'],
  },
};

export const TOOL_ARCHIVE_IDEA: ToolDefinition = {
  name: 'archive_idea',
  description: 'Archiviert eine Idee. Nutze dies wenn der Nutzer eine Idee archivieren, beiseitelegen oder als erledigt markieren moechte.',
  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Die ID der zu archivierenden Idee',
      },
    },
    required: ['id'],
  },
};

export const TOOL_DELETE_IDEA: ToolDefinition = {
  name: 'delete_idea',
  description: 'Loescht eine Idee dauerhaft. Nutze dies NUR wenn der Nutzer explizit sagt er will eine Idee loeschen. Frage vorher nach Bestaetigung.',
  input_schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Die ID der zu loeschenden Idee',
      },
    },
    required: ['id'],
  },
};

// ===========================================
// Phase 34: Business Manager Tools
// ===========================================

export const TOOL_GET_REVENUE_METRICS: ToolDefinition = {
  name: 'get_revenue_metrics',
  description: 'Ruft aktuelle Revenue-Metriken ab (MRR, ARR, Churn Rate, Subscriptions, letzte Zahlungen). Nutze dies wenn der Nutzer nach Umsatz, Revenue, MRR oder Zahlungen fragt.',
  input_schema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: 'Zeitraum (z.B. "30d", "7d", "90d"). Standard: 30d',
      },
    },
    required: [],
  },
};

export const TOOL_GET_TRAFFIC_ANALYTICS: ToolDefinition = {
  name: 'get_traffic_analytics',
  description: 'Ruft Traffic-Analysen ab (Besucher, Sessions, Seitenaufrufe, Bounce Rate, Top Seiten, Traffic-Quellen). Nutze dies wenn der Nutzer nach Website-Traffic, Besuchern oder Analytics fragt.',
  input_schema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: 'Zeitraum (z.B. "28d", "7d", "90d"). Standard: 28d',
      },
    },
    required: [],
  },
};

export const TOOL_GET_SEO_PERFORMANCE: ToolDefinition = {
  name: 'get_seo_performance',
  description: 'Ruft SEO-Performance-Daten ab (Impressionen, Klicks, CTR, Rankings, Top Suchanfragen). Nutze dies wenn der Nutzer nach SEO, Rankings, Suchmaschinen oder Google-Ergebnissen fragt.',
  input_schema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: 'Zeitraum (z.B. "28d", "7d", "90d"). Standard: 28d',
      },
    },
    required: [],
  },
};

export const TOOL_GET_SYSTEM_HEALTH: ToolDefinition = {
  name: 'get_system_health',
  description: 'Prüft System-Health: Uptime, Antwortzeiten, Lighthouse-Performance-Scores, Core Web Vitals. Nutze dies wenn der Nutzer nach Uptime, Performance, Website-Geschwindigkeit oder System-Status fragt.',
  input_schema: {
    type: 'object',
    properties: {
      include_performance: {
        type: 'boolean',
        description: 'Ob Lighthouse-Performance-Daten einbezogen werden sollen. Standard: true',
      },
    },
    required: [],
  },
};

export const TOOL_GENERATE_BUSINESS_REPORT: ToolDefinition = {
  name: 'generate_business_report',
  description: 'Ruft den neuesten Business-Bericht ab (Wochen- oder Monatsbericht mit Zusammenfassung, Kennzahlen und Empfehlungen). Nutze dies wenn der Nutzer nach einem Bericht, Report oder einer Geschäftszusammenfassung fragt.',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['weekly', 'monthly'],
        description: 'Art des Berichts. Standard: weekly',
      },
    },
    required: [],
  },
};

export const TOOL_IDENTIFY_ANOMALIES: ToolDefinition = {
  name: 'identify_anomalies',
  description: 'Identifiziert aktuelle Auffälligkeiten und Anomalien in den Business-Metriken (MRR-Einbrüche, Traffic-Drops, Uptime-Probleme). Nutze dies wenn der Nutzer nach Problemen, Auffälligkeiten oder ungewöhnlichen Trends fragt.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const TOOL_COMPARE_PERIODS: ToolDefinition = {
  name: 'compare_periods',
  description: 'Vergleicht Business-Metriken zwischen zwei Zeiträumen (Revenue, Traffic, SEO). Nutze dies wenn der Nutzer Zeiträume vergleichen will oder nach Veränderungen/Trends fragt.',
  input_schema: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        enum: ['all', 'revenue', 'traffic', 'seo'],
        description: 'Welche Metrik verglichen werden soll. Standard: all',
      },
    },
    required: [],
  },
};

// ===========================================
// Phase 35: Calendar, Email Draft & Travel Tools
// ===========================================

export const TOOL_CREATE_CALENDAR_EVENT: ToolDefinition = {
  name: 'create_calendar_event',
  description: 'Erstellt einen Kalender-Eintrag. Nutze dies wenn der Nutzer einen Termin, Deadline, Erinnerung oder Meeting erstellen moechte.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Titel des Ereignisses' },
      start_time: { type: 'string', description: 'Startzeit im ISO 8601 Format (z.B. 2026-02-15T14:00:00)' },
      end_time: { type: 'string', description: 'Endzeit im ISO 8601 Format (optional, Standard: +1 Stunde)' },
      event_type: { type: 'string', enum: ['appointment', 'reminder', 'deadline', 'focus_time'], description: 'Art des Ereignisses' },
      location: { type: 'string', description: 'Ort (optional)' },
      participants: { type: 'array', items: { type: 'string' }, description: 'Teilnehmer (optional)' },
      description: { type: 'string', description: 'Beschreibung (optional)' },
    },
    required: ['title', 'start_time'],
  },
};

export const TOOL_LIST_CALENDAR_EVENTS: ToolDefinition = {
  name: 'list_calendar_events',
  description: 'Listet Kalender-Eintraege fuer einen Zeitraum. Nutze dies wenn der Nutzer nach Terminen fragt oder seinen Kalender sehen will.',
  input_schema: {
    type: 'object',
    properties: {
      start: { type: 'string', description: 'Startdatum im ISO 8601 Format' },
      end: { type: 'string', description: 'Enddatum im ISO 8601 Format' },
      event_type: { type: 'string', enum: ['appointment', 'reminder', 'deadline', 'travel_block', 'focus_time'], description: 'Typ-Filter (optional)' },
    },
    required: ['start', 'end'],
  },
};

export const TOOL_DRAFT_EMAIL: ToolDefinition = {
  name: 'draft_email',
  description: 'Erstellt einen E-Mail-Entwurf basierend auf einer Beschreibung. Der Nutzer kann den Entwurf dann kopieren und in seinem Mail-Programm verwenden.',
  input_schema: {
    type: 'object',
    properties: {
      recipient: { type: 'string', description: 'Empfaenger (Name oder E-Mail)' },
      subject: { type: 'string', description: 'Betreff' },
      key_points: { type: 'array', items: { type: 'string' }, description: 'Kernpunkte die in der E-Mail enthalten sein sollen' },
      tone: { type: 'string', enum: ['formal', 'informal', 'friendly'], description: 'Ton der E-Mail (Standard: formal)' },
    },
    required: ['key_points'],
  },
};

export const TOOL_ESTIMATE_TRAVEL: ToolDefinition = {
  name: 'estimate_travel',
  description: 'Schaetzt die Reisezeit zwischen zwei Orten. Nutze dies wenn der Nutzer nach Fahrzeiten, Entfernungen oder Anreise fragt.',
  input_schema: {
    type: 'object',
    properties: {
      origin: { type: 'string', description: 'Startort (Adresse oder Ortsname)' },
      destination: { type: 'string', description: 'Zielort (Adresse oder Ortsname)' },
      mode: { type: 'string', enum: ['driving', 'transit', 'walking', 'cycling'], description: 'Transportmittel (Standard: driving)' },
    },
    required: ['origin', 'destination'],
  },
};

// ===========================================
// Phase 42: Self-Editing Memory Tools (Letta Pattern)
// ===========================================

/**
 * Memory update tool - AI updates existing facts in its own memory
 * Implements the Letta "self-editing memory" pattern where the AI
 * has agency over its own memory state.
 */
export const TOOL_MEMORY_UPDATE: ToolDefinition = {
  name: 'memory_update',
  description:
    'Aktualisiert einen bestehenden Fakt im Langzeitgedaechtnis. Nutze dies wenn der Nutzer eine fruehre Information korrigiert (z.B. "Ich arbeite jetzt bei X" statt "bei Y"), oder wenn du merkst dass ein gespeicherter Fakt veraltet ist. Ersetzt den alten Fakt mit der neuen Information.',
  input_schema: {
    type: 'object',
    properties: {
      fact_id: {
        type: 'string',
        description: 'ID des zu aktualisierenden Fakts (aus memory_introspect oder recall)',
      },
      search_content: {
        type: 'string',
        description: 'Alternativ: Suchtext um den Fakt zu finden (wenn keine ID bekannt)',
      },
      new_content: {
        type: 'string',
        description: 'Neuer Inhalt des Fakts',
      },
      new_fact_type: {
        type: 'string',
        description: 'Neuer Typ (optional, nur wenn sich der Typ aendert)',
        enum: ['preference', 'behavior', 'knowledge', 'goal', 'context'],
      },
      confidence: {
        type: 'number',
        description: 'Neue Konfidenz 0.0-1.0 (optional, Standard: 0.9 fuer explizite Korrekturen)',
      },
    },
    required: ['new_content'],
  },
};

/**
 * Memory delete tool - AI removes facts from its own memory
 * Enables explicit forgetting when facts are wrong, irrelevant, or privacy-sensitive.
 */
export const TOOL_MEMORY_DELETE: ToolDefinition = {
  name: 'memory_delete',
  description:
    'Loescht einen Fakt aus dem Langzeitgedaechtnis. Nutze dies wenn der Nutzer explizit sagt "vergiss das", "loesch das", oder wenn ein gespeicherter Fakt nachweislich falsch ist und nicht korrigiert werden kann.',
  input_schema: {
    type: 'object',
    properties: {
      fact_id: {
        type: 'string',
        description: 'ID des zu loeschenden Fakts',
      },
      search_content: {
        type: 'string',
        description: 'Alternativ: Suchtext um den Fakt zu finden',
      },
      reason: {
        type: 'string',
        description: 'Grund fuer die Loeschung (fuer Audit-Log)',
      },
    },
    required: [],
  },
};

/**
 * Memory update profile tool - AI updates personal profile facts
 * Bridges to the PersonalizationChat personal_facts table.
 */
export const TOOL_MEMORY_UPDATE_PROFILE: ToolDefinition = {
  name: 'memory_update_profile',
  description:
    'Aktualisiert das persoenliche Profil des Nutzers (Name, Beruf, Interessen, Kommunikationsstil etc.). Nutze dies wenn der Nutzer persoenliche Informationen teilt die sein Profil betreffen, z.B. "Nenn mich Alex", "Ich bin umgezogen nach Berlin", "Ich mag lieber Du als Sie".',
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Kategorie des Profil-Fakts',
        enum: [
          'basic_info', 'personality', 'work_life', 'goals_dreams',
          'interests_hobbies', 'communication_style', 'decision_making',
          'daily_routines', 'values_beliefs', 'challenges',
        ],
      },
      fact_key: {
        type: 'string',
        description: 'Schluessel des Fakts (z.B. "name", "beruf", "wohnort", "anrede")',
      },
      fact_value: {
        type: 'string',
        description: 'Wert des Fakts (z.B. "Alexander", "Software-Entwickler", "Berlin", "Du")',
      },
    },
    required: ['category', 'fact_key', 'fact_value'],
  },
};

// ===========================================
// Phase 41: Google Maps Tools
// ===========================================

/**
 * Get directions with real-time traffic
 */
export const TOOL_GET_DIRECTIONS: ToolDefinition = {
  name: 'get_directions',
  description: 'Berechnet die Route und Reisezeit zwischen zwei Orten mit Echtzeit-Verkehrsdaten. Nutze dies wenn der Nutzer nach Fahrzeiten, Entfernungen, Routen oder Anreise fragt. Ersetzt estimate_travel mit genaueren Google Maps Daten.',
  input_schema: {
    type: 'object',
    properties: {
      origin: { type: 'string', description: 'Startort (Adresse, Ortsname oder Koordinaten)' },
      destination: { type: 'string', description: 'Zielort (Adresse, Ortsname oder Koordinaten)' },
      mode: { type: 'string', enum: ['driving', 'transit', 'walking', 'bicycling'], description: 'Transportmittel (Standard: driving)' },
      departure_time: { type: 'string', description: 'Abfahrtszeit im ISO 8601 Format fuer Verkehrsprognose (optional, Standard: jetzt)' },
    },
    required: ['origin', 'destination'],
  },
};

/**
 * Get opening hours of a place
 */
export const TOOL_GET_OPENING_HOURS: ToolDefinition = {
  name: 'get_opening_hours',
  description: 'Ruft die Oeffnungszeiten, Adresse, Telefonnummer und Bewertung eines Geschaefts oder Ortes ab. Nutze dies wenn der Nutzer fragt ob ein Laden geoeffnet hat oder wann er aufmacht.',
  input_schema: {
    type: 'object',
    properties: {
      place: { type: 'string', description: 'Name des Geschaefts oder Ortes (z.B. "Bauhaus Muenchen", "Cafe Leopold")' },
    },
    required: ['place'],
  },
};

/**
 * Find nearby places
 */
export const TOOL_FIND_NEARBY: ToolDefinition = {
  name: 'find_nearby_places',
  description: 'Sucht nach Geschaeften, Restaurants oder anderen Orten in der Naehe eines Standorts. Nutze dies wenn der Nutzer nach "in der Naehe", "nah bei" oder "um ... herum" fragt.',
  input_schema: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'Standort fuer die Suche (Adresse oder Ortsname)' },
      keyword: { type: 'string', description: 'Suchbegriff (z.B. "Cafe", "Supermarkt", "Tankstelle")' },
      type: { type: 'string', description: 'Google Places Typ (z.B. "restaurant", "cafe", "gas_station", "pharmacy")' },
      radius: { type: 'number', description: 'Suchradius in Metern (Standard: 2000, Max: 50000)' },
    },
    required: ['location'],
  },
};

/**
 * Optimize route for multiple stops
 */
export const TOOL_OPTIMIZE_ROUTE: ToolDefinition = {
  name: 'optimize_day_route',
  description: 'Optimiert die Reihenfolge mehrerer Orte fuer den kuerzesten Gesamtweg. Nutze dies wenn der Nutzer mehrere Termine an einem Tag hat und die beste Route wissen will.',
  input_schema: {
    type: 'object',
    properties: {
      locations: { type: 'array', items: { type: 'string' }, description: 'Liste der Orte/Adressen die besucht werden sollen' },
      start_location: { type: 'string', description: 'Startpunkt (optional, z.B. "Zuhause" oder Bueroadresse)' },
      mode: { type: 'string', enum: ['driving', 'transit', 'walking', 'bicycling'], description: 'Transportmittel (Standard: driving)' },
    },
    required: ['locations'],
  },
};

// ===========================================
// Phase 43: Email Intelligence Tools
// ===========================================

/**
 * Ask My Inbox tool - natural language email search
 */
export const TOOL_ASK_INBOX: ToolDefinition = {
  name: 'ask_inbox',
  description: 'Durchsucht die E-Mails des Nutzers mit natuerlicher Sprache. Nutze dies wenn der Nutzer Fragen zu seinen E-Mails stellt, z.B. "Was hat mir X geschrieben?", "Gibt es dringende E-Mails?", "Zeig mir E-Mails von letzter Woche". Kann nach Absender, Datum, Kategorie, Prioritaet und Freitext filtern.',
  input_schema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'Die Frage oder Suchanfrage zu E-Mails in natuerlicher Sprache',
      },
      limit: {
        type: 'number',
        description: 'Maximale Anzahl Ergebnisse (Standard: 10)',
      },
    },
    required: ['question'],
  },
};

/**
 * Inbox Summary tool - quick inbox overview
 */
export const TOOL_INBOX_SUMMARY: ToolDefinition = {
  name: 'inbox_summary',
  description: 'Gibt einen Ueberblick ueber den aktuellen Inbox-Status: Anzahl E-Mails, ungelesen, Kategorien, Prioritaeten, haeufigste Absender, offene Aufgaben. Nutze dies wenn der Nutzer nach einem Inbox-Ueberblick oder E-Mail-Status fragt.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

// ===========================================
// Phase 44: MCP Ecosystem Tools
// ===========================================

/**
 * MCP Call Tool - call a tool on a connected external MCP server
 */
export const TOOL_MCP_CALL_TOOL: ToolDefinition = {
  name: 'mcp_call_tool',
  description: 'Ruft ein Tool auf einem verbundenen externen MCP-Server auf. Nutze zuerst mcp_list_tools um verfuegbare Tools zu sehen, dann rufe das gewuenschte Tool mit connection_id und tool_name auf.',
  input_schema: {
    type: 'object',
    properties: {
      connection_id: {
        type: 'string',
        description: 'Die UUID der MCP-Server-Verbindung',
      },
      tool_name: {
        type: 'string',
        description: 'Der Name des Tools auf dem externen Server',
      },
      arguments: {
        type: 'object',
        description: 'Die Argumente fuer das Tool (als JSON-Objekt)',
      },
    },
    required: ['connection_id', 'tool_name'],
  },
};

/**
 * MCP List Tools - list all available tools from connected MCP servers
 */
export const TOOL_MCP_LIST_TOOLS: ToolDefinition = {
  name: 'mcp_list_tools',
  description: 'Listet alle verfuegbaren Tools von verbundenen externen MCP-Servern auf. Zeigt Tool-Namen, Beschreibungen und den zugehoerigen Server.',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

// ===========================================
// Phase 77: Memory Self-Editing Tools (Letta V1 Pattern)
// ===========================================

/**
 * Memory rethink tool - AI re-evaluates and corrects an existing memory fact
 * Enables the AI to actively correct outdated or wrong memories with an audit trail.
 */
export const TOOL_MEMORY_RETHINK: ToolDefinition = {
  name: 'memory_rethink',
  description:
    'Reflektiert ueber eine bestehende Erinnerung und revidiert sie im neuen Kontext. Anders als memory_replace wird der alte Inhalt mit neuem Kontext synthetisiert — die KI fusioniert beide zu einem reichhaltigen, aktualisierten Fakt. Ideal wenn neue Informationen das bestehende Wissen ergaenzen statt ersetzen.',
  input_schema: {
    type: 'object',
    properties: {
      fact_id: {
        type: 'string',
        description: 'ID des zu revidierenden Fakts (aus memory_introspect oder recall)',
      },
      new_context: {
        type: 'string',
        description: 'Neuer Kontext oder Information die in den bestehenden Fakt eingearbeitet werden soll',
      },
    },
    required: ['fact_id', 'new_context'],
  },
};

/**
 * Memory restructure tool - AI merges, splits, promotes, or demotes memory facts
 * Enables the AI to actively reorganize its memory for better structure and relevance.
 */
export const TOOL_MEMORY_RESTRUCTURE: ToolDefinition = {
  name: 'memory_restructure',
  description:
    'Reorganisiert Fakten im Langzeitgedaechtnis. Nutze dies um zusammengehoerige Fakten zu verschmelzen (merge), einen komplexen Fakt in spezifischere aufzuteilen (split), oder die Wichtigkeit eines Fakts anzupassen (promote/demote). Hilft das Gedaechtnis sauber und relevant zu halten.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['merge', 'split', 'promote', 'demote'],
        description: 'merge: mehrere Fakten zu einem kombinieren, split: einen Fakt in mehrere aufteilen, promote: Wichtigkeit erhoehen, demote: Wichtigkeit verringern',
      },
      fact_ids: {
        type: 'string',
        description: 'Komma-separierte Liste von Fakt-IDs (fuer merge: alle zu verschmelzenden, fuer split/promote/demote: einzelne ID)',
      },
      new_content: {
        type: 'string',
        description: 'Neuer Inhalt (bei merge: kombinierter Fakt, bei split: komma-separierte neue Fakten)',
      },
      reason: {
        type: 'string',
        description: 'Begruendung fuer die Restrukturierung',
      },
    },
    required: ['action', 'fact_ids', 'reason'],
  },
};

// ===========================================
// Phase 100: Memory Self-Editing Tools
// ===========================================

/**
 * Memory replace tool - Find and replace a fact with audit trail
 */
export const TOOL_MEMORY_REPLACE: ToolDefinition = {
  name: 'memory_replace',
  description:
    'Ersetzt einen bestehenden Fakt im Langzeitgedaechtnis durch neuen Inhalt. Sucht per ID oder Inhalt und protokolliert den Aenderungsgrund als Audit-Trail.',
  input_schema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'Fakt-ID oder Suchbegriff zum Finden des Fakts',
      },
      new_content: {
        type: 'string',
        description: 'Der neue Inhalt fuer den Fakt',
      },
      reason: {
        type: 'string',
        description: 'Begruendung fuer die Aenderung (wird im Audit-Trail gespeichert)',
      },
    },
    required: ['key', 'new_content', 'reason'],
  },
};

/**
 * Memory abstract tool - Combine multiple facts into higher-level knowledge
 */
export const TOOL_MEMORY_ABSTRACT: ToolDefinition = {
  name: 'memory_abstract',
  description:
    'Abstrahiert mehrere spezifische Fakten zu einem uebergeordneten Wissenselement. Nutze dies wenn du mehrere aehnliche oder zusammengehoerige Fakten erkennst, die zu einem allgemeineren Muster zusammengefasst werden koennen. Die Original-Fakten werden als superseded markiert.',
  input_schema: {
    type: 'object',
    properties: {
      fact_ids: {
        type: 'string',
        description: 'Komma-separierte Liste von Fakt-IDs die abstrahiert werden sollen (mindestens 2)',
      },
      instruction: {
        type: 'string',
        description: 'Anweisung wie die Fakten abstrahiert werden sollen (z.B. "Fasse zu einer allgemeinen Praeferenz zusammen")',
      },
    },
    required: ['fact_ids', 'instruction'],
  },
};

/**
 * Memory search and link tool - Find and link related facts
 */
export const TOOL_MEMORY_SEARCH_AND_LINK: ToolDefinition = {
  name: 'memory_search_and_link',
  description:
    'Sucht semantisch verwandte Fakten im Gedaechtnis und erstellt Verknuepfungen zwischen ihnen. Nutze dies um versteckte Zusammenhaenge zwischen gespeicherten Fakten zu entdecken und das Wissens-Netzwerk zu staerken.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Suchbegriff oder Thema um verwandte Fakten zu finden',
      },
      link_type: {
        type: 'string',
        enum: ['related', 'supports', 'contradicts', 'extends', 'depends_on'],
        description: 'Art der Verknuepfung zwischen den gefundenen Fakten (Standard: related)',
      },
    },
    required: ['query'],
  },
};

// ===========================================
// Tool Registry
// ===========================================

/**
 * Global tool registry
 */
class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a tool with its handler
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
    logger.debug('Tool registered', { name: definition.name });
  }

  /**
   * Get a tool by name
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tool definitions
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  /**
   * Get specific tool definitions by name
   */
  getDefinitionsFor(names: string[]): ToolDefinition[] {
    return names
      .map(name => this.tools.get(name)?.definition)
      .filter((d): d is ToolDefinition => d !== undefined);
  }

  /**
   * Execute a tool by name with execution context
   * @param name - Tool name
   * @param input - Tool input parameters
   * @param context - Execution context (request-scoped)
   */
  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.handler(input, context);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export const toolRegistry = new ToolRegistry();

// ===========================================
// Core Tool Use Functions
// ===========================================

/**
 * Execute a conversation with tool use enabled
 *
 * @param messages - Conversation messages
 * @param tools - Tool names to enable (or 'all' for all registered tools)
 * @param options - Configuration options
 * @returns Tool use result with response and tool calls
 */
export async function executeWithTools(
  messages: Anthropic.MessageParam[],
  tools: string[] | 'all',
  options: ToolUseOptions = {}
): Promise<ToolUseResult> {
  const client = getClaudeClient();
  const {
    maxIterations = 5,
    systemPrompt,
    temperature = 0.7,
    toolChoice = { type: 'auto' },
    executionContext = { aiContext: 'personal' },
  } = options;

  // Get tool definitions
  const toolDefinitions = tools === 'all'
    ? toolRegistry.getDefinitions()
    : toolRegistry.getDefinitionsFor(tools);

  if (toolDefinitions.length === 0) {
    throw new Error('No tools available for execution');
  }

  const toolsCalled: ToolUseResult['toolsCalled'] = [];
  const currentMessages = [...messages];
  let iterations = 0;
  let stopReason = 'end_turn';
  let finalResponse = '';

  logger.info('Starting tool-enabled conversation', {
    toolCount: toolDefinitions.length,
    maxIterations,
  });

  while (iterations < maxIterations) {
    iterations++;

    // Make API call with tools
    const response = await executeWithProtection(async () => {
      const params: Anthropic.MessageCreateParams = {
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: currentMessages,
        tools: toolDefinitions as Anthropic.Tool[],
        tool_choice: toolChoice as Anthropic.ToolChoice,
      };

      if (systemPrompt) {
        params.system = systemPrompt;
      }

      if (temperature !== undefined) {
        params.temperature = temperature;
      }

      return client.messages.create(params);
    });

    stopReason = response.stop_reason || 'end_turn';

    // Process response content
    const toolCalls: ToolCall[] = [];
    const textBlocks: string[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textBlocks.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      finalResponse = textBlocks.join('\n');
      break;
    }

    // Execute tool calls
    const toolResults: ToolResult[] = [];

    for (const call of toolCalls) {
      logger.debug('Executing tool', { name: call.name, input: call.input });

      try {
        const result = await toolRegistry.execute(call.name, call.input, executionContext);
        toolResults.push({
          tool_use_id: call.id,
          content: result,
        });
        toolsCalled.push({
          name: call.name,
          input: call.input,
          result,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Tool execution failed', { name: call.name, error: errorMessage });
        toolResults.push({
          tool_use_id: call.id,
          content: `Error: ${errorMessage}`,
          is_error: true,
        });
        toolsCalled.push({
          name: call.name,
          input: call.input,
          result: `Error: ${errorMessage}`,
        });
      }
    }

    // Add assistant message with tool use
    currentMessages.push({
      role: 'assistant',
      content: response.content,
    });

    // Add tool results
    currentMessages.push({
      role: 'user',
      content: toolResults.map(r => ({
        type: 'tool_result' as const,
        tool_use_id: r.tool_use_id,
        content: r.content,
        is_error: r.is_error,
      })),
    });

    // If stop reason is end_turn after tool use, continue to get final response
    if (stopReason === 'end_turn') {
      // Continue the loop to get Claude's response after tool results
    }
  }

  // Guard against empty response when max iterations reached
  if (!finalResponse && toolsCalled.length > 0) {
    finalResponse = toolsCalled.map(t =>
      `[${t.name}]: ${t.result.substring(0, 200)}`
    ).join('\n\n');
    logger.warn('Tool iteration limit reached without final text response, using tool results as fallback', {
      iterations,
      toolsCalled: toolsCalled.length,
    });
  }

  logger.info('Tool-enabled conversation complete', {
    iterations,
    toolsCalled: toolsCalled.length,
    stopReason,
  });

  return {
    response: finalResponse,
    toolsCalled,
    iterations,
    stopReason,
  };
}

/**
 * Simple tool call - single message with tools
 */
export async function callWithTools(
  userMessage: string,
  tools: string[] | 'all',
  options: ToolUseOptions = {}
): Promise<ToolUseResult> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  return executeWithTools(messages, tools, options);
}

/**
 * Force a specific tool to be called
 */
export async function forceToolCall(
  userMessage: string,
  toolName: string,
  options: Omit<ToolUseOptions, 'toolChoice'> = {}
): Promise<ToolUseResult> {
  return callWithTools(userMessage, [toolName], {
    ...options,
    toolChoice: { type: 'tool', name: toolName },
  });
}

// ===========================================
// Utility Functions
// ===========================================

/**
 * Parse tool calls from a raw response
 */
export function parseToolCalls(content: Anthropic.ContentBlock[]): ToolCall[] {
  return content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    .map(block => ({
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    }));
}

/**
 * Check if response contains tool use
 */
export function hasToolUse(content: Anthropic.ContentBlock[]): boolean {
  return content.some(block => block.type === 'tool_use');
}

/**
 * Extract text from response (ignoring tool use blocks)
 */
export function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}

