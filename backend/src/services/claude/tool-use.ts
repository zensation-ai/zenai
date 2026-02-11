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
 * Set reminder tool - create a reminder
 */
export const TOOL_SET_REMINDER: ToolDefinition = {
  name: 'set_reminder',
  description: 'Erstellt eine Erinnerung für den Benutzer.',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Der Erinnerungstext',
      },
      when: {
        type: 'string',
        description: 'Zeitpunkt (z.B. "in 1 hour", "tomorrow 9am", "2024-01-15 14:00")',
      },
    },
    required: ['message', 'when'],
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
  description: 'Navigiert den Nutzer zu einer bestimmten Seite der App. Nutze dies wenn der Nutzer eine Seite besuchen möchte oder nach einem Feature fragt.',
  input_schema: {
    type: 'object',
    properties: {
      page: {
        type: 'string',
        description: 'Zielseite',
        enum: [
          'home', 'ideas', 'insights', 'archive', 'settings',
          'ai-workshop', 'learning', 'profile', 'meetings', 'media',
          'stories', 'documents', 'automations', 'integrations',
          'notifications', 'export', 'sync', 'personalization',
          'canvas', 'triage', 'voice-chat', 'agent-teams',
        ],
      },
      reason: {
        type: 'string',
        description: 'Kurze Erklärung warum diese Seite relevant ist',
      },
    },
    required: ['page'],
  },
};

export const TOOL_APP_HELP: ToolDefinition = {
  name: 'app_help',
  description: 'Erklärt ein Feature oder eine Seite der ZenAI App. Nutze dies wenn der Nutzer fragt wie etwas funktioniert oder was eine Seite tut.',
  input_schema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Das Feature oder die Seite über die Hilfe gebraucht wird',
      },
    },
    required: ['topic'],
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

// ===========================================
// Default Tool Handlers (Placeholder)
// ===========================================

/**
 * Register default tools with placeholder handlers
 * Real handlers should be registered by the application
 */
export function registerDefaultTools(): void {
  // These are placeholders - real handlers should be injected
  toolRegistry.register(TOOL_CALCULATE, async (input, _context) => {
    const expr = input.expression as string;
    if (!expr || typeof expr !== 'string') {
      return 'Fehler: Ungültiger mathematischer Ausdruck';
    }

    try {
      // Safe math evaluation - only allow numbers, operators, and parentheses
      const sanitized = expr.replace(/[^0-9+\-*/().%\s,]/g, '');

      // Additional validation: check for valid expression structure
      // Prevent empty expressions or only whitespace
      if (!sanitized.trim() || !/\d/.test(sanitized)) {
        return 'Fehler: Ungültiger mathematischer Ausdruck';
      }

      // Check for balanced parentheses
      let parenCount = 0;
      for (const char of sanitized) {
        if (char === '(') {parenCount++;}
        if (char === ')') {parenCount--;}
        if (parenCount < 0) {
          return 'Fehler: Unbalancierte Klammern';
        }
      }
      if (parenCount !== 0) {
        return 'Fehler: Unbalancierte Klammern';
      }

      // Evaluate with strict mode
      const result = Function(`"use strict"; return (${sanitized})`)();

      // Validate result is a finite number
      if (typeof result !== 'number' || !Number.isFinite(result)) {
        return 'Fehler: Das Ergebnis ist keine gültige Zahl';
      }

      return `Ergebnis: ${result}`;
    } catch {
      return 'Fehler: Ungültiger mathematischer Ausdruck';
    }
  });

  logger.info('Default tools registered');
}
