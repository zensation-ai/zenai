/**
 * MCP (Model Context Protocol) Server for ZenAI Enterprise Platform
 *
 * ZenAI - Enterprise AI Platform by ZenSation Enterprise Solutions
 * © Alexander Bering. All rights reserved.
 * https://zensation.ai | https://zensation.app | https://zensation.sh
 *
 * Exposes ZenAI functionality via MCP for integration
 * with Claude Desktop, other MCP clients, and AI assistants.
 *
 * Tools:
 * - create_idea: Structure and save a new idea from transcript
 * - search_ideas: Semantic search through ideas
 * - get_suggestions: Get proactive AI suggestions
 * - chat: Personalized chat with context
 * - get_related_ideas: Find related ideas via knowledge graph
 *
 * Resources:
 * - zenai://ideas/{id}: Individual idea details
 * - zenai://ideas: List of recent ideas
 * - zenai://drafts/{id}: Individual draft
 * - zenai://context/{name}: Context-specific data
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import {
  structureWithClaudePersonalized,
  generateClaudeResponse,
} from '../services/claude';
import { proactiveSuggestionEngine } from '../services/proactive-suggestions';
import { getSuggestedConnections, multiHopSearch } from '../services/knowledge-graph';
import { deepSearch } from '../services/enhanced-rag';
import { generateWithExtendedThinking } from '../services/claude/extended-thinking';
import { memoryCoordinator } from '../services/memory';
import { synthesizeKnowledge } from '../services/synthesis-engine';
import { generateChallenge, evaluateRecall, getReviewSchedule } from '../services/active-recall';
import { getProductivityDashboard } from '../services/productivity-analytics';
import { getDecisionLogs, generateComplianceReport } from '../services/compliance-logger';
import { findDuplicates } from '../services/duplicate-detection';

// Phase 7: New domain services
import {
  getContacts,
  getContact,
  getFollowUpSuggestions as getContactFollowUps,
  getContactStats,
  getInteractions as getContactInteractions,
} from '../services/contacts';
import {
  getTransactions,
  getBudgets,
  getOverview as getFinanceOverview,
  getCategoryBreakdown,
} from '../services/finance';
import {
  getCaptures as getScreenCaptures,
  getStats as getScreenMemoryStats,
} from '../services/screen-memory';
import {
  generateMorningBriefing,
  getFollowUpSuggestions as getProactiveFollowUps,
  getSmartSchedule,
  getWorkflowPatterns,
  getBriefings,
} from '../services/proactive/proactive-engine';

// ===========================================
// Types
// ===========================================

interface MCPServerConfig {
  name: string;
  version: string;
  defaultContext: AIContext;
}

interface MCPToolProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
}

/**
 * MCP Tool with optional structured output schema (MCP 2026 Spec)
 * outputSchema defines the JSON structure clients can expect
 */
interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, MCPToolProperty>;
    required?: string[];
  };
  /** Structured output schema (MCP 2026 spec) */
  outputSchema?: {
    type: string;
    properties: Record<string, MCPToolProperty>;
    required?: string[];
  };
}

interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

interface MCPRequest {
  method: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    uri?: string;
  };
}

interface MCPResponse {
  content?: Array<{ type: string; text: string }>;
  contents?: Array<{ uri: string; mimeType: string; text: string }>;
  tools?: MCPTool[];
  resources?: MCPResource[];
  isError?: boolean;
}

// ===========================================
// Tool Definitions
// ===========================================

const TOOLS: MCPTool[] = [
  {
    name: 'create_idea',
    description: 'Strukturiert und speichert eine neue Idee aus einem Transkript oder Text. Nutzt Claude AI für intelligente Kategorisierung.',
    inputSchema: {
      type: 'object',
      properties: {
        transcript: {
          type: 'string',
          description: 'Der Text oder das Transkript der Idee',
        },
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Der Kontext für die Idee (default: personal)',
        },
      },
      required: ['transcript'],
    },
  },
  {
    name: 'search_ideas',
    description: 'Durchsucht alle Ideen semantisch. Findet relevante Ideen basierend auf Bedeutung, nicht nur Keywords.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Die Suchanfrage',
        },
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Optionaler Kontext-Filter',
        },
        limit: {
          type: 'number',
          description: 'Maximale Anzahl der Ergebnisse (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_suggestions',
    description: 'Holt proaktive KI-Vorschläge basierend auf erkannten Mustern und Routinen.',
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Der Kontext für Vorschläge (default: personal)',
        },
        limit: {
          type: 'number',
          description: 'Maximale Anzahl der Vorschläge (default: 5)',
        },
      },
    },
  },
  {
    name: 'chat',
    description: 'Führt ein personalisiertes Gespräch mit dem KI-Assistenten, der den Kontext und die Historie kennt.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Die Nachricht an den Assistenten',
        },
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Der Kontext für das Gespräch (default: personal)',
        },
        sessionId: {
          type: 'string',
          description: 'Optionale Session-ID für Konversations-Kontinuität',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'get_related_ideas',
    description: 'Findet verwandte Ideen über den Knowledge Graph. Entdeckt Verbindungen und Cluster.',
    inputSchema: {
      type: 'object',
      properties: {
        ideaId: {
          type: 'string',
          description: 'Die UUID der Ausgangs-Idee',
        },
        depth: {
          type: 'number',
          description: 'Tiefe der Graph-Traversierung (1-3, default: 2)',
        },
      },
      required: ['ideaId'],
    },
  },
  {
    name: 'get_stats',
    description: 'Holt Statistiken über das Personal AI Brain - Anzahl Ideen, Kategorien, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Optionaler Kontext-Filter',
        },
      },
    },
  },

  // === Phase 33B: 10 neue MCP Tools ===

  {
    name: 'deep_analysis',
    description: 'Führt eine tiefgehende Analyse mit Extended Thinking durch. Ideal für komplexe Fragen, die sorgfältiges Nachdenken erfordern.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Die Frage oder das Thema für die Tiefenanalyse',
        },
        thinkingBudget: {
          type: 'number',
          description: 'Token-Budget für Extended Thinking (default: 20000, max: 50000)',
        },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        analysis: { type: 'string', description: 'Die tiefgehende Analyse' },
        hadThinking: { type: 'boolean', description: 'Ob Extended Thinking genutzt wurde' },
        thinkingBudget: { type: 'number', description: 'Genutztes Thinking-Budget' },
      },
      required: ['analysis', 'hadThinking'],
    },
  },
  {
    name: 'explore_connections',
    description: 'Erkundet Verbindungen zwischen Ideen über den Knowledge Graph. Findet versteckte Zusammenhänge und Cluster.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Suchbegriff oder Thema für die Graph-Exploration',
        },
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Kontext-Filter (default: personal)',
        },
        maxDistance: {
          type: 'number',
          description: 'Maximale Graph-Distanz (1-3, default: 2)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_memory',
    description: 'Durchsucht das gesamte 4-Schicht-Gedächtnis (Working, Short-Term, Episodic, Long-Term). Findet Erinnerungen und Kontext aus allen Ebenen.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Die Suchanfrage ans Gedächtnis',
        },
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Kontext (default: personal)',
        },
        includeEpisodic: {
          type: 'boolean',
          description: 'Episodische Erinnerungen einschließen (default: true)',
        },
        includeLongTerm: {
          type: 'boolean',
          description: 'Langzeitgedächtnis einschließen (default: true)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'generate_draft',
    description: 'Generiert einen strukturierten Entwurf basierend auf einer Idee oder einem Thema. Kann E-Mails, Artikel, Proposals und Dokumente erstellen.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Der Text oder die Idee als Grundlage für den Entwurf',
        },
        type: {
          type: 'string',
          enum: ['email', 'article', 'proposal', 'document', 'generic'],
          description: 'Art des Entwurfs (default: generic)',
        },
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Kontext (default: personal)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'deep_search',
    description: 'Tiefensuche mit HyDE (Hypothetical Document Embeddings) und Cross-Encoder Re-Ranking. Findet auch semantisch verwandte Ergebnisse.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Die Suchanfrage',
        },
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Kontext-Filter (default: personal)',
        },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        results: { type: 'array', items: { type: 'object' } },
        confidence: { type: 'number', description: '0-1 Konfidenz-Score' },
        methodsUsed: { type: 'array', items: { type: 'string' } },
        totalResults: { type: 'number' },
      },
      required: ['query', 'results', 'confidence'],
    },
  },
  {
    name: 'find_contradictions',
    description: 'Findet widersprüchliche oder doppelte Ideen. Hilft bei der Konsistenz des Wissens und identifiziert Duplikate.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Der Inhalt, gegen den auf Widersprüche/Duplikate geprüft wird',
        },
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Kontext (default: personal)',
        },
        threshold: {
          type: 'number',
          description: 'Ähnlichkeitsschwelle (0-1, default: 0.6 für breitere Suche)',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'productivity_report',
    description: 'Erstellt einen Produktivitätsbericht mit AI-ROI-Kennzahlen, Zeitersparnis, Aktivitätsmuster und Wissens-Wachstum.',
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Kontext (default: personal)',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        dashboard: { type: 'object', description: 'Vollständiges Produktivitäts-Dashboard' },
        context: { type: 'string' },
        generatedAt: { type: 'string', description: 'ISO-Timestamp der Generierung' },
      },
      required: ['dashboard', 'generatedAt'],
    },
  },
  {
    name: 'active_recall_quiz',
    description: 'Spaced-Repetition-Lernquiz basierend auf dem FSRS-Algorithmus. Generiert Lernkarten und bewertet Wiedergabe.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['generate', 'evaluate', 'schedule'],
          description: 'Aktion: generate (Quiz erstellen), evaluate (Antwort bewerten), schedule (Nächste Reviews)',
        },
        taskId: {
          type: 'string',
          description: 'Task-ID für generate/evaluate',
        },
        userRecall: {
          type: 'string',
          description: 'Benutzerantwort für evaluate',
        },
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Kontext (default: personal)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'synthesize_knowledge',
    description: 'Multi-Schritt-Wissens-Synthese: Sammelt Informationen aus mehreren Quellen (RAG, Graph, Memory) und erstellt eine kohärente Zusammenfassung.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Das Thema für die Wissens-Synthese',
        },
        context: {
          type: 'string',
          enum: ['personal', 'work', 'health', 'finance', 'learning'],
          description: 'Kontext (default: personal)',
        },
        enableGraphExpansion: {
          type: 'boolean',
          description: 'Knowledge Graph für Querverbindungen nutzen (default: true)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'compliance_check',
    description: 'EU AI Act Compliance-Status: Zeigt AI-Entscheidungsprotokolle, generiert Compliance-Berichte und ermöglicht Daten-Lineage-Nachverfolgung.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['report', 'logs', 'status'],
          description: 'Aktion: report (Compliance-Bericht), logs (Entscheidungs-Logs), status (Schnellübersicht)',
        },
        limit: {
          type: 'number',
          description: 'Maximale Anzahl der Log-Einträge (default: 20)',
        },
        context: {
          type: 'string',
          description: 'Optionaler Kontext-Filter',
        },
      },
      required: ['action'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Compliance-Status (compliant/warning/violation)' },
        totalDecisions: { type: 'number' },
        averageConfidence: { type: 'number' },
        report: { type: 'object', description: 'Vollständiger Compliance-Bericht' },
        logs: { type: 'array', items: { type: 'object' }, description: 'AI-Entscheidungsprotokolle' },
      },
    },
  },

  // === Phase 7: Domain Tools ===

  // --- Contacts ---
  {
    name: 'search_contacts',
    description: 'Durchsucht Kontakte nach Name, E-Mail, Organisation oder Tags. Findet Personen im CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Suchbegriff (Name, Email, Organisation)' },
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
        relationship_type: { type: 'string', description: 'Filter: colleague, friend, family, client, vendor' },
        limit: { type: 'number', description: 'Max Ergebnisse (default: 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_contact_timeline',
    description: 'Zeigt die Interaktions-Timeline eines Kontakts: E-Mails, Meetings, Aufgaben, Anrufe.',
    inputSchema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string', description: 'UUID des Kontakts' },
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
        limit: { type: 'number', description: 'Max Interaktionen (default: 20)' },
      },
      required: ['contact_id'],
    },
  },
  {
    name: 'contact_follow_ups',
    description: 'Zeigt Kontakte an, mit denen seit längerem keine Interaktion stattfand. Empfiehlt Follow-ups.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
        days_threshold: { type: 'number', description: 'Tage ohne Kontakt (default: 30)' },
        limit: { type: 'number', description: 'Max Ergebnisse (default: 10)' },
      },
    },
  },
  {
    name: 'contact_stats',
    description: 'Übersicht über Kontakte: Gesamtzahl, Organisationen, Beziehungstypen, Favoriten.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
      },
    },
  },

  // --- Finance ---
  {
    name: 'financial_overview',
    description: 'Finanz-Übersicht: Einnahmen, Ausgaben, Kontostand, Trends über die letzten Monate.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
        months: { type: 'number', description: 'Zeitraum in Monaten (default: 6)' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        overview: { type: 'object', description: 'Finanz-Übersicht mit Einnahmen/Ausgaben/Trends' },
        context: { type: 'string' },
      },
      required: ['overview'],
    },
  },
  {
    name: 'get_transactions',
    description: 'Listet Finanztransaktionen mit Filtern nach Kategorie, Typ, Zeitraum und Betrag.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
        category: { type: 'string', description: 'Kategorie-Filter (z.B. Lebensmittel, Transport)' },
        transaction_type: { type: 'string', enum: ['income', 'expense', 'transfer'], description: 'Typ-Filter' },
        date_from: { type: 'string', description: 'Startdatum (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Enddatum (YYYY-MM-DD)' },
        limit: { type: 'number', description: 'Max Ergebnisse (default: 50)' },
      },
    },
  },
  {
    name: 'budget_status',
    description: 'Zeigt den aktuellen Status aller Budgets: Limit, verbraucht, verbleibend, Prozent.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
        active_only: { type: 'boolean', description: 'Nur aktive Budgets (default: true)' },
      },
    },
  },
  {
    name: 'expense_categories',
    description: 'Aufschlüsselung der Ausgaben nach Kategorien mit Summen und Prozentanteilen.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
        date_from: { type: 'string', description: 'Startdatum (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Enddatum (YYYY-MM-DD)' },
      },
    },
  },

  // --- Screen Memory ---
  {
    name: 'search_screen_memory',
    description: 'Durchsucht die Screen-Memory-Aufzeichnungen nach OCR-Text, App-Name oder Fenstertitel.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Suchbegriff (im OCR-Text, Titel, App)' },
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
        app_name: { type: 'string', description: 'Filter nach App-Name' },
        date_from: { type: 'string', description: 'Startdatum (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'Enddatum (YYYY-MM-DD)' },
        limit: { type: 'number', description: 'Max Ergebnisse (default: 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'screen_memory_stats',
    description: 'Statistiken zur Bildschirmaufzeichnung: Gesamtaufnahmen, Apps, Nutzungsdauer.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
      },
    },
  },

  // --- Proactive Intelligence ---
  {
    name: 'morning_briefing',
    description: 'Erstellt ein KI-generiertes Morgen-Briefing: Meetings, Aufgaben, E-Mails, Follow-ups, Tagesplanung.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
      },
    },
  },
  {
    name: 'smart_schedule',
    description: 'KI-optimierter Tagesplan: Analysiert Meetings, Aufgaben und schlägt eine optimale Reihenfolge vor.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
      },
    },
  },
  {
    name: 'proactive_follow_ups',
    description: 'Zeigt proaktive Follow-up-Vorschläge: Kontakte die Aufmerksamkeit brauchen, basierend auf Interaktionsmuster.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
        days: { type: 'number', description: 'Zeitfenster in Tagen (default: 14)' },
      },
    },
  },
  {
    name: 'workflow_patterns',
    description: 'Zeigt erkannte Arbeitsablauf-Muster und Automatisierungsvorschläge.',
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string', enum: ['personal', 'work', 'learning', 'creative'], description: 'Kontext (default: personal)' },
        confirmed_only: { type: 'boolean', description: 'Nur bestätigte Patterns (default: false)' },
      },
    },
  },
];

// ===========================================
// Chat System Prompt
// ===========================================

const CHAT_SYSTEM_PROMPT = `Du bist ein hilfreicher persönlicher KI-Assistent im "Personal AI Brain" System.
Du hilfst dem Nutzer dabei, seine Gedanken, Ideen und Aufgaben zu organisieren.

Dein Stil:
- Freundlich und professionell
- Prägnant aber vollständig
- Proaktiv mit Vorschlägen, wenn sinnvoll
- Du sprichst Deutsch, außer der Nutzer wechselt auf eine andere Sprache

Du hast Zugriff auf:
- Die gespeicherten Ideen und Notizen des Nutzers
- Erkannte Muster und Routinen
- Den Knowledge Graph der Verbindungen zwischen Ideen`;

// ===========================================
// MCP Server Class
// ===========================================

export class KIABMCPServer {
  private config: MCPServerConfig;
  private isRunning: boolean = false;

  constructor(config: Partial<MCPServerConfig> = {}) {
    this.config = {
      name: config.name || 'zenai-brain',
      version: config.version || '1.0.0',
      defaultContext: config.defaultContext || 'personal',
    };
  }

  // ===========================================
  // Request Handler
  // ===========================================

  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      switch (request.method) {
        case 'tools/list':
          return { tools: TOOLS };

        case 'tools/call':
          return await this.handleToolCall(
            request.params?.name ?? '',
            request.params?.arguments ?? {}
          );

        case 'resources/list':
          return { resources: await this.listResources() };

        case 'resources/read':
          return await this.handleResourceRead(request.params?.uri ?? '');

        default:
          return {
            content: [{ type: 'text', text: `Unbekannte Methode: ${request.method}` }],
            isError: true,
          };
      }
    } catch (error) {
      logger.error('MCP request failed', error instanceof Error ? error : undefined);
      return {
        content: [{
          type: 'text',
          text: `Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
        }],
        isError: true,
      };
    }
  }

  // ===========================================
  // Tool Handlers
  // ===========================================

  private async handleToolCall(name: string, args: Record<string, unknown>): Promise<MCPResponse> {
    let result: unknown;

    switch (name) {
      case 'create_idea':
        result = await this.handleCreateIdea(args);
        break;

      case 'search_ideas':
        result = await this.handleSearchIdeas(args);
        break;

      case 'get_suggestions':
        result = await this.handleGetSuggestions(args);
        break;

      case 'chat':
        result = await this.handleChat(args);
        break;

      case 'get_related_ideas':
        result = await this.handleGetRelatedIdeas(args);
        break;

      case 'get_stats':
        result = await this.handleGetStats(args);
        break;

      // Phase 33B: 10 neue Tools
      case 'deep_analysis':
        result = await this.handleDeepAnalysis(args);
        break;

      case 'explore_connections':
        result = await this.handleExploreConnections(args);
        break;

      case 'query_memory':
        result = await this.handleQueryMemory(args);
        break;

      case 'generate_draft':
        result = await this.handleGenerateDraft(args);
        break;

      case 'deep_search':
        result = await this.handleDeepSearch(args);
        break;

      case 'find_contradictions':
        result = await this.handleFindContradictions(args);
        break;

      case 'productivity_report':
        result = await this.handleProductivityReport(args);
        break;

      case 'active_recall_quiz':
        result = await this.handleActiveRecallQuiz(args);
        break;

      case 'synthesize_knowledge':
        result = await this.handleSynthesizeKnowledge(args);
        break;

      case 'compliance_check':
        result = await this.handleComplianceCheck(args);
        break;

      // Phase 7: Domain Tools
      case 'search_contacts':
        result = await this.handleSearchContacts(args);
        break;
      case 'get_contact_timeline':
        result = await this.handleGetContactTimeline(args);
        break;
      case 'contact_follow_ups':
        result = await this.handleContactFollowUps(args);
        break;
      case 'contact_stats':
        result = await this.handleContactStats(args);
        break;
      case 'financial_overview':
        result = await this.handleFinancialOverview(args);
        break;
      case 'get_transactions':
        result = await this.handleGetTransactions(args);
        break;
      case 'budget_status':
        result = await this.handleBudgetStatus(args);
        break;
      case 'expense_categories':
        result = await this.handleExpenseCategories(args);
        break;
      case 'search_screen_memory':
        result = await this.handleSearchScreenMemory(args);
        break;
      case 'screen_memory_stats':
        result = await this.handleScreenMemoryStats(args);
        break;
      case 'morning_briefing':
        result = await this.handleMorningBriefing(args);
        break;
      case 'smart_schedule':
        result = await this.handleSmartSchedule(args);
        break;
      case 'proactive_follow_ups':
        result = await this.handleProactiveFollowUps(args);
        break;
      case 'workflow_patterns':
        result = await this.handleWorkflowPatterns(args);
        break;

      default:
        throw new Error(`Unbekanntes Tool: ${name}`);
    }

    return {
      content: [{
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      }],
    };
  }

  private async handleCreateIdea(args: Record<string, unknown>): Promise<unknown> {
    const transcript = args.transcript as string | undefined;
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;

    if (!transcript) {
      throw new Error('Transkript ist erforderlich');
    }

    // Structure the idea using Claude
    const structured = await structureWithClaudePersonalized(transcript, context);

    // Save to database
    const result = await queryContext(
      context,
      `INSERT INTO ideas (context, type, category, title, summary, raw_transcript, priority, is_archived, keywords)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
       RETURNING id, type, category, title, summary, priority, created_at`,
      [
        context,
        structured.type,
        structured.category,
        structured.title,
        structured.summary,
        transcript,
        structured.priority,
        structured.keywords || [],
      ]
    );

    return {
      success: true,
      idea: result.rows[0],
      message: `Idee "${structured.title}" wurde erstellt`,
    };
  }

  private async handleSearchIdeas(args: Record<string, unknown>): Promise<unknown> {
    const query = args.query as string | undefined;
    const context = args.context as AIContext | undefined;
    const limit = (args.limit as number | undefined) ?? 10;

    if (!query) {
      throw new Error('Suchanfrage ist erforderlich');
    }

    let sql = `
      SELECT id, type, category, title, summary, priority, created_at,
             ts_rank(to_tsvector('german', title || ' ' || COALESCE(summary, '')),
                     plainto_tsquery('german', $1)) as relevance
      FROM ideas
      WHERE is_archived = false
        AND to_tsvector('german', title || ' ' || COALESCE(summary, ''))
            @@ plainto_tsquery('german', $1)
    `;
    const params: (string | number)[] = [query];

    if (context) {
      sql += ` AND context = $${params.length + 1}`;
      params.push(context);
    }

    sql += ` ORDER BY relevance DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await queryContext(
      context ?? this.config.defaultContext,
      sql,
      params
    );

    return {
      results: result.rows,
      count: result.rows.length,
      query,
    };
  }

  private async handleGetSuggestions(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const limit = (args.limit as number | undefined) ?? 5;

    const suggestions = await proactiveSuggestionEngine.getSuggestions(context);

    return {
      suggestions: suggestions.slice(0, limit),
      hasMore: suggestions.length > limit,
    };
  }

  private async handleChat(args: Record<string, unknown>): Promise<unknown> {
    const message = args.message as string | undefined;
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;

    if (!message) {
      throw new Error('Nachricht ist erforderlich');
    }

    // Get some recent ideas for context
    const recentIdeas = await queryContext(
      context,
      `SELECT title, summary, type FROM ideas
       WHERE context = $1 AND is_archived = false
       ORDER BY created_at DESC LIMIT 5`,
      [context]
    );

    const contextInfo = recentIdeas.rows.length > 0
      ? `\n\nKontext - Letzte Ideen des Nutzers:\n${recentIdeas.rows.map(i => `- ${i.title} (${i.type}): ${i.summary}`).join('\n')}`
      : '';

    const response = await generateClaudeResponse(
      CHAT_SYSTEM_PROMPT + contextInfo,
      message
    );

    return {
      response,
      context,
    };
  }

  private async handleGetRelatedIdeas(args: Record<string, unknown>): Promise<unknown> {
    const ideaId = args.ideaId as string | undefined;
    const depth = (args.depth as number | undefined) ?? 2;

    if (!ideaId) {
      throw new Error('Idea-ID ist erforderlich');
    }

    // Use getSuggestedConnections for direct relations
    const suggestions = await getSuggestedConnections(ideaId);

    // Use multiHopSearch for deeper connections if depth > 1
    let deepConnections: unknown[] = [];
    if (depth > 1) {
      // Get the idea title for multi-hop search
      const idea = await queryContext(
        this.config.defaultContext,
        `SELECT title FROM ideas WHERE id = $1`,
        [ideaId]
      );

      if (idea.rows.length > 0) {
        deepConnections = await multiHopSearch(idea.rows[0].title, Math.min(depth, 3));
      }
    }

    return {
      ideaId,
      directConnections: suggestions,
      deepConnections,
      depth,
    };
  }

  // ===========================================
  // Phase 33B: New Tool Handlers (10 tools)
  // ===========================================

  private async handleDeepAnalysis(args: Record<string, unknown>): Promise<unknown> {
    const queryStr = args.query as string | undefined;
    const thinkingBudget = Math.min((args.thinkingBudget as number | undefined) ?? 20000, 50000);

    if (!queryStr) {
      throw new Error('Query ist erforderlich');
    }

    const systemPrompt = `Du bist ein analytischer Denker. Analysiere die folgende Frage gründlich.
Strukturiere deine Analyse in:
1. **Kernfrage** - Was genau wird gefragt?
2. **Analyse** - Tiefgehende Betrachtung mit Pro/Contra
3. **Erkenntnisse** - Die wichtigsten Einsichten
4. **Empfehlung** - Klare Handlungsempfehlung

Antworte auf Deutsch.`;

    const result = await generateWithExtendedThinking(systemPrompt, queryStr, {
      thinkingBudget,
      maxTokens: 8000,
    });

    return {
      analysis: result.response,
      hadThinking: !!result.thinking,
      thinkingBudget,
    };
  }

  private async handleExploreConnections(args: Record<string, unknown>): Promise<unknown> {
    const queryStr = args.query as string | undefined;
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const maxDistance = Math.min((args.maxDistance as number | undefined) ?? 2, 3);

    if (!queryStr) {
      throw new Error('Query ist erforderlich');
    }

    // First, find seed ideas via deep search
    const searchResults = await deepSearch(queryStr, context);
    const seedIds = searchResults.results.slice(0, 3).map(r => r.id).filter(Boolean);

    // Then explore connections via multi-hop graph traversal
    const connections: unknown[] = [];
    for (const seedId of seedIds) {
      try {
        const hops = await multiHopSearch(seedId as string, maxDistance);
        connections.push(...hops);
      } catch {
        // Skip if idea has no graph connections
      }
    }

    // Get direct connection suggestions for top result
    let directSuggestions: unknown[] = [];
    if (seedIds.length > 0) {
      try {
        directSuggestions = await getSuggestedConnections(seedIds[0] as string);
      } catch {
        // Skip if no suggestions available
      }
    }

    return {
      query: queryStr,
      seedIdeas: searchResults.results.slice(0, 3).map(r => ({
        title: r.title,
        summary: r.summary,
        score: r.score,
      })),
      graphConnections: connections,
      suggestedConnections: directSuggestions,
      maxDistance,
    };
  }

  private async handleQueryMemory(args: Record<string, unknown>): Promise<unknown> {
    const queryStr = args.query as string | undefined;
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const includeEpisodic = (args.includeEpisodic as boolean | undefined) ?? true;
    const includeLongTerm = (args.includeLongTerm as boolean | undefined) ?? true;

    if (!queryStr) {
      throw new Error('Query ist erforderlich');
    }

    // Use a temporary session ID for MCP queries
    const sessionId = `mcp-memory-${Date.now()}`;

    const memoryResult = await memoryCoordinator.prepareEnhancedContext(
      sessionId,
      queryStr,
      context,
      {
        includeEpisodic,
        includeLongTerm,
        includeWorking: true,
        maxContextTokens: 4000,
      }
    );

    return {
      query: queryStr,
      context,
      systemEnhancement: memoryResult.systemEnhancement,
      stats: memoryResult.stats,
    };
  }

  private async handleGenerateDraft(args: Record<string, unknown>): Promise<unknown> {
    const text = args.text as string | undefined;
    const draftType = (args.type as string | undefined) ?? 'generic';
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;

    if (!text) {
      throw new Error('Text ist erforderlich');
    }

    const typePrompts: Record<string, string> = {
      email: 'Erstelle eine professionelle E-Mail basierend auf dem folgenden Input.',
      article: 'Erstelle einen gut strukturierten Artikel basierend auf dem folgenden Input.',
      proposal: 'Erstelle ein überzeugendes Proposal/Angebot basierend auf dem folgenden Input.',
      document: 'Erstelle ein strukturiertes Dokument basierend auf dem folgenden Input.',
      generic: 'Erstelle einen gut strukturierten Entwurf basierend auf dem folgenden Input.',
    };

    const systemPrompt = `${typePrompts[draftType] || typePrompts.generic}
Kontext: ${context}

Regeln:
- Schreibe auf Deutsch, es sei denn der Input ist auf Englisch
- Nutze eine professionelle, klare Sprache
- Strukturiere den Text mit Überschriften und Absätzen
- Liefere einen fertigen, sofort nutzbaren Entwurf`;

    const result = await generateClaudeResponse(systemPrompt, text);

    return {
      draft: result,
      type: draftType,
      context,
      inputLength: text.length,
    };
  }

  private async handleDeepSearch(args: Record<string, unknown>): Promise<unknown> {
    const queryStr = args.query as string | undefined;
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;

    if (!queryStr) {
      throw new Error('Query ist erforderlich');
    }

    const results = await deepSearch(queryStr, context);

    return {
      query: queryStr,
      results: results.results.map(r => ({
        title: r.title,
        summary: r.summary,
        score: r.score,
        relevanceReason: r.relevanceReason,
      })),
      confidence: results.confidence,
      methodsUsed: results.methodsUsed,
      timing: results.timing,
      totalResults: results.results.length,
    };
  }

  private async handleFindContradictions(args: Record<string, unknown>): Promise<unknown> {
    const content = args.content as string | undefined;
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const threshold = (args.threshold as number | undefined) ?? 0.6;

    if (!content) {
      throw new Error('Content ist erforderlich');
    }

    const duplicates = await findDuplicates(context, content, threshold);

    return {
      hasDuplicatesOrContradictions: duplicates.hasDuplicates,
      count: duplicates.count,
      suggestions: duplicates.suggestions,
      threshold,
    };
  }

  private async handleProductivityReport(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;

    const dashboard = await getProductivityDashboard(context);

    return {
      dashboard,
      context,
      generatedAt: new Date().toISOString(),
    };
  }

  private async handleActiveRecallQuiz(args: Record<string, unknown>): Promise<unknown> {
    const action = args.action as string;
    const taskId = args.taskId as string | undefined;
    const userRecall = args.userRecall as string | undefined;
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;

    switch (action) {
      case 'generate': {
        if (!taskId) {
          throw new Error('taskId ist erforderlich für generate');
        }
        const challenge = await generateChallenge(taskId, context);
        if (!challenge) {
          return { success: false, message: 'Keine Lernkarte für diese Task-ID gefunden' };
        }
        return { success: true, challenge };
      }

      case 'evaluate': {
        if (!taskId || !userRecall) {
          throw new Error('taskId und userRecall sind erforderlich für evaluate');
        }
        const result = await evaluateRecall(taskId, context, userRecall);
        if (!result) {
          return { success: false, message: 'Bewertung fehlgeschlagen' };
        }
        return { success: true, result };
      }

      case 'schedule': {
        const schedule = await getReviewSchedule(context);
        return {
          success: true,
          schedule,
          totalDue: schedule.length,
        };
      }

      default:
        throw new Error(`Unbekannte Aktion: ${action}. Erlaubt: generate, evaluate, schedule`);
    }
  }

  private async handleSynthesizeKnowledge(args: Record<string, unknown>): Promise<unknown> {
    const queryStr = args.query as string | undefined;
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const enableGraphExpansion = (args.enableGraphExpansion as boolean | undefined) ?? true;

    if (!queryStr) {
      throw new Error('Query ist erforderlich');
    }

    const result = await synthesizeKnowledge(queryStr, context, {
      enableGraphExpansion,
      maxTotalIdeas: 20,
    });

    return {
      synthesis: result.synthesis,
      sources: result.sources,
      contradictions: result.contradictions,
      gaps: result.gaps,
      timing: result.timing,
    };
  }

  private async handleComplianceCheck(args: Record<string, unknown>): Promise<unknown> {
    const action = args.action as string;
    const limit = (args.limit as number | undefined) ?? 20;
    const context = args.context as string | undefined;

    switch (action) {
      case 'report': {
        const report = generateComplianceReport();
        return {
          report,
          generatedAt: new Date().toISOString(),
        };
      }

      case 'logs': {
        const logs = getDecisionLogs({
          limit,
          context,
        });
        return logs;
      }

      case 'status': {
        const report = generateComplianceReport();
        return {
          status: 'compliant',
          totalDecisions: report.summary.totalDecisions,
          averageConfidence: report.summary.averageConfidence,
          modelBreakdown: report.modelBreakdown,
          period: report.period,
        };
      }

      default:
        throw new Error(`Unbekannte Aktion: ${action}. Erlaubt: report, logs, status`);
    }
  }

  // ===========================================
  // Phase 7: Domain Tool Handlers
  // ===========================================

  private async handleSearchContacts(args: Record<string, unknown>): Promise<unknown> {
    const query = args.query as string | undefined;
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const relationship_type = args.relationship_type as string | undefined;
    const limit = (args.limit as number | undefined) ?? 20;

    if (!query) { throw new Error('Suchbegriff ist erforderlich'); }

    const result = await getContacts(context, {
      search: query,
      relationship_type,
      limit,
    });

    return {
      contacts: result.contacts.map(c => ({
        id: c.id,
        display_name: c.display_name,
        email: c.email,
        organization_id: c.organization_id,
        role: c.role,
        relationship_type: c.relationship_type,
        last_interaction_at: c.last_interaction_at,
        interaction_count: c.interaction_count,
      })),
      total: result.total,
      query,
    };
  }

  private async handleGetContactTimeline(args: Record<string, unknown>): Promise<unknown> {
    const contactId = args.contact_id as string | undefined;
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const limit = (args.limit as number | undefined) ?? 20;

    if (!contactId) { throw new Error('contact_id ist erforderlich'); }

    const contact = await getContact(context, contactId);
    if (!contact) { throw new Error('Kontakt nicht gefunden'); }

    const interactions = await getContactInteractions(context, contactId, limit);

    return {
      contact: {
        id: contact.id,
        display_name: contact.display_name,
        email: contact.email,
        role: contact.role,
        ai_summary: contact.ai_summary,
      },
      interactions: interactions.interactions,
      total: interactions.total,
    };
  }

  private async handleContactFollowUps(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const daysThreshold = (args.days_threshold as number | undefined) ?? 30;
    const limit = (args.limit as number | undefined) ?? 10;

    const contacts = await getContactFollowUps(context, daysThreshold, limit);

    return {
      follow_ups: contacts,
      days_threshold: daysThreshold,
      count: contacts.length,
    };
  }

  private async handleContactStats(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    return await getContactStats(context);
  }

  private async handleFinancialOverview(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const months = (args.months as number | undefined) ?? 6;

    const overview = await getFinanceOverview(context, months);
    return { overview, context };
  }

  private async handleGetTransactions(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;

    const result = await getTransactions(context, {
      category: args.category as string | undefined,
      transaction_type: args.transaction_type as 'income' | 'expense' | 'transfer' | undefined,
      date_from: args.date_from as string | undefined,
      date_to: args.date_to as string | undefined,
      limit: (args.limit as number | undefined) ?? 50,
    });

    return {
      transactions: result.transactions.map(t => ({
        id: t.id,
        amount: t.amount,
        currency: t.currency,
        transaction_type: t.transaction_type,
        category: t.category,
        payee: t.payee,
        description: t.description,
        transaction_date: t.transaction_date,
        is_recurring: t.is_recurring,
      })),
      total: result.total,
    };
  }

  private async handleBudgetStatus(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const activeOnly = (args.active_only as boolean | undefined) ?? true;

    const budgets = await getBudgets(context, activeOnly);

    return {
      budgets: budgets.map(b => ({
        id: b.id,
        name: b.name,
        category: b.category,
        amount_limit: b.amount_limit,
        current_spent: b.current_spent,
        remaining: Number(b.amount_limit) - Number(b.current_spent),
        percentage: Number(b.amount_limit) > 0
          ? Math.round((Number(b.current_spent) / Number(b.amount_limit)) * 100)
          : 0,
        period: b.period,
        is_active: b.is_active,
      })),
      count: budgets.length,
    };
  }

  private async handleExpenseCategories(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const dateFrom = args.date_from as string | undefined;
    const dateTo = args.date_to as string | undefined;

    const categories = await getCategoryBreakdown(context, dateFrom, dateTo);
    return { categories, context };
  }

  private async handleSearchScreenMemory(args: Record<string, unknown>): Promise<unknown> {
    const query = args.query as string | undefined;
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;

    if (!query) { throw new Error('Suchbegriff ist erforderlich'); }

    const result = await getScreenCaptures(context, {
      search: query,
      app_name: args.app_name as string | undefined,
      date_from: args.date_from as string | undefined,
      date_to: args.date_to as string | undefined,
      limit: (args.limit as number | undefined) ?? 20,
    });

    return {
      captures: result.captures.map(c => ({
        id: c.id,
        timestamp: c.timestamp,
        app_name: c.app_name,
        window_title: c.window_title,
        url: c.url,
        ocr_text: c.ocr_text?.substring(0, 200),
        duration_seconds: c.duration_seconds,
      })),
      total: result.total,
      query,
    };
  }

  private async handleScreenMemoryStats(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    return await getScreenMemoryStats(context);
  }

  private async handleMorningBriefing(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;

    const briefing = await generateMorningBriefing(context);
    return {
      briefing_id: briefing.id,
      type: briefing.briefing_type,
      content: briefing.content,
      generated_at: briefing.generated_at,
    };
  }

  private async handleSmartSchedule(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    return await getSmartSchedule(context);
  }

  private async handleProactiveFollowUps(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const days = (args.days as number | undefined) ?? 14;

    const followUps = await getProactiveFollowUps(context, days);
    return { follow_ups: followUps, days, count: followUps.length };
  }

  private async handleWorkflowPatterns(args: Record<string, unknown>): Promise<unknown> {
    const context = (args.context as AIContext | undefined) ?? this.config.defaultContext;
    const confirmedOnly = (args.confirmed_only as boolean | undefined) ?? false;

    const patterns = await getWorkflowPatterns(context, confirmedOnly);
    return { patterns, count: patterns.length };
  }

  // ===========================================
  // Original Tool Handlers (continued)
  // ===========================================

  private async handleGetStats(args: Record<string, unknown>): Promise<unknown> {
    const context = args.context as AIContext | undefined;

    let whereClause = 'WHERE is_archived = false';
    const params: string[] = [];

    if (context) {
      whereClause += ` AND context = $1`;
      params.push(context);
    }

    const statsResult = await queryContext(
      context ?? this.config.defaultContext,
      `SELECT
         COUNT(*) as total_ideas,
         COUNT(DISTINCT category) as categories,
         COUNT(*) FILTER (WHERE status = 'new') as new_ideas,
         COUNT(*) FILTER (WHERE priority >= 4) as high_priority,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as this_week
       FROM ideas
       ${whereClause}`,
      params
    );

    const typeDistribution = await queryContext(
      context ?? this.config.defaultContext,
      `SELECT type, COUNT(*) as count
       FROM ideas
       ${whereClause}
       GROUP BY type
       ORDER BY count DESC`,
      params
    );

    return {
      stats: statsResult.rows[0],
      typeDistribution: typeDistribution.rows,
      context: context ?? 'all',
    };
  }

  // ===========================================
  // Resource Handlers
  // ===========================================

  private async listResources(): Promise<MCPResource[]> {
    // Get recent ideas for resource listing
    const recentIdeas = await queryContext(
      this.config.defaultContext,
      `SELECT id, title, type FROM ideas
       WHERE is_archived = false
       ORDER BY created_at DESC
       LIMIT 20`
    );

    const resources: MCPResource[] = [
      {
        uri: 'zenai://ideas',
        name: 'Alle Ideen',
        description: 'Liste aller Ideen im Personal AI Brain',
        mimeType: 'application/json',
      },
      {
        uri: 'zenai://stats',
        name: 'Statistiken',
        description: 'Übersicht und Statistiken',
        mimeType: 'application/json',
      },
      // Phase 7: New domain resources
      {
        uri: 'zenai://contacts',
        name: 'Kontakte',
        description: 'Liste aller Kontakte im CRM',
        mimeType: 'application/json',
      },
      {
        uri: 'zenai://finance',
        name: 'Finanzen',
        description: 'Finanz-Übersicht mit Einnahmen und Ausgaben',
        mimeType: 'application/json',
      },
      {
        uri: 'zenai://briefings',
        name: 'Proaktive Briefings',
        description: 'Aktuelle KI-Briefings und Vorschläge',
        mimeType: 'application/json',
      },
    ];

    // Add individual ideas as resources
    for (const idea of recentIdeas.rows) {
      resources.push({
        uri: `zenai://ideas/${idea.id}`,
        name: idea.title,
        description: `${idea.type} - Details zur Idee`,
        mimeType: 'application/json',
      });
    }

    return resources;
  }

  private async handleResourceRead(uri: string): Promise<MCPResponse> {
    if (!uri) {
      throw new Error('URI ist erforderlich');
    }

    let content: unknown;

    if (uri === 'zenai://ideas') {
      // List all ideas
      const result = await queryContext(
        this.config.defaultContext,
        `SELECT id, context, type, category, title, summary, priority, status, created_at
         FROM ideas
         WHERE is_archived = false
         ORDER BY created_at DESC
         LIMIT 100`
      );
      content = { ideas: result.rows };
    } else if (uri === 'zenai://stats') {
      content = await this.handleGetStats({});
    } else if (uri === 'zenai://contacts') {
      const result = await getContacts(this.config.defaultContext, { limit: 50 });
      content = { contacts: result.contacts, total: result.total };
    } else if (uri === 'zenai://finance') {
      content = await getFinanceOverview(this.config.defaultContext);
    } else if (uri === 'zenai://briefings') {
      const briefingList = await getBriefings(this.config.defaultContext, { limit: 10 });
      content = { briefings: briefingList };
    } else {
      // Individual idea
      const ideaMatch = uri.match(/zenai:\/\/ideas\/([a-f0-9-]+)/);
      if (ideaMatch) {
        const ideaId = ideaMatch[1];
        const result = await queryContext(
          this.config.defaultContext,
          `SELECT * FROM ideas WHERE id = $1`,
          [ideaId]
        );

        if (result.rows.length === 0) {
          throw new Error(`Idee nicht gefunden: ${ideaId}`);
        }

        content = result.rows[0];
      } else {
        throw new Error(`Unbekannte Resource: ${uri}`);
      }
    }

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(content, null, 2),
      }],
    };
  }

  // ===========================================
  // Server Lifecycle
  // ===========================================

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('MCP Server is already running');
      return;
    }

    this.isRunning = true;
    logger.info('MCP Server started', {
      name: this.config.name,
      version: this.config.version,
    });

    // Read from stdin
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', async (line: string) => {
      try {
        const request = JSON.parse(line) as MCPRequest;
        const response = await this.handleRequest(request);
        // STDIO protocol: console.log writes to stdout as required by MCP stdio transport
        console.log(JSON.stringify(response));
      } catch (error) {
        // STDIO protocol: error responses must also go to stdout for the MCP client
        console.log(JSON.stringify({
          content: [{
            type: 'text',
            text: `Parse-Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`,
          }],
          isError: true,
        }));
      }
    });

    rl.on('close', () => {
      this.stop();
    });
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    logger.info('MCP Server stopped');
  }

  // ===========================================
  // Utility Methods
  // ===========================================

  getConfig(): MCPServerConfig {
    return { ...this.config };
  }

  getTools(): MCPTool[] {
    return [...TOOLS];
  }
}

// ===========================================
// Standalone Execution
// ===========================================

// If run directly, start the server
if (require.main === module) {
  const server = new KIABMCPServer();
  server.start().catch((error) => {
    logger.error('Failed to start MCP server', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  });
}

// ===========================================
// Export
// ===========================================

export const createMCPServer = (config?: Partial<MCPServerConfig>) => new KIABMCPServer(config);
