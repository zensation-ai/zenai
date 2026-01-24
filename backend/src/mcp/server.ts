/**
 * MCP (Model Context Protocol) Server for KI-AB Personal AI Brain
 *
 * Exposes the Personal AI Brain functionality via MCP for integration
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
 * - kiab://ideas/{id}: Individual idea details
 * - kiab://ideas: List of recent ideas
 * - kiab://drafts/{id}: Individual draft
 * - kiab://context/{name}: Context-specific data
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import {
  structureWithClaudePersonalized,
  generateClaudeResponse,
} from '../services/claude';
import { proactiveSuggestionEngine } from '../services/proactive-suggestions';
import { getSuggestedConnections, multiHopSearch } from '../services/knowledge-graph';

// ===========================================
// Types
// ===========================================

interface MCPServerConfig {
  name: string;
  version: string;
  defaultContext: AIContext;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
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
  params?: Record<string, any>;
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
      name: config.name || 'ki-ab-brain',
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
            request.params?.name,
            request.params?.arguments || {}
          );

        case 'resources/list':
          return { resources: await this.listResources() };

        case 'resources/read':
          return await this.handleResourceRead(request.params?.uri);

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

  private async handleToolCall(name: string, args: Record<string, any>): Promise<MCPResponse> {
    let result: any;

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

  private async handleCreateIdea(args: Record<string, any>): Promise<any> {
    const { transcript, context = this.config.defaultContext } = args;

    if (!transcript) {
      throw new Error('Transkript ist erforderlich');
    }

    // Structure the idea using Claude
    const structured = await structureWithClaudePersonalized(transcript, context as AIContext);

    // Save to database
    const result = await queryContext(
      context as AIContext,
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

  private async handleSearchIdeas(args: Record<string, any>): Promise<any> {
    const { query, context, limit = 10 } = args;

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
    const params: any[] = [query];

    if (context) {
      sql += ` AND context = $${params.length + 1}`;
      params.push(context);
    }

    sql += ` ORDER BY relevance DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await queryContext(
      (context as AIContext) || this.config.defaultContext,
      sql,
      params
    );

    return {
      results: result.rows,
      count: result.rows.length,
      query,
    };
  }

  private async handleGetSuggestions(args: Record<string, any>): Promise<any> {
    const { context = this.config.defaultContext, limit = 5 } = args;

    const suggestions = await proactiveSuggestionEngine.getSuggestions(context as AIContext);

    return {
      suggestions: suggestions.slice(0, limit),
      hasMore: suggestions.length > limit,
    };
  }

  private async handleChat(args: Record<string, any>): Promise<any> {
    const { message, context = this.config.defaultContext } = args;

    if (!message) {
      throw new Error('Nachricht ist erforderlich');
    }

    // Get some recent ideas for context
    const recentIdeas = await queryContext(
      context as AIContext,
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

  private async handleGetRelatedIdeas(args: Record<string, any>): Promise<any> {
    const { ideaId, depth = 2 } = args;

    if (!ideaId) {
      throw new Error('Idea-ID ist erforderlich');
    }

    // Use getSuggestedConnections for direct relations
    const suggestions = await getSuggestedConnections(ideaId);

    // Use multiHopSearch for deeper connections if depth > 1
    let deepConnections: any[] = [];
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

  private async handleGetStats(args: Record<string, any>): Promise<any> {
    const { context } = args;

    let whereClause = 'WHERE is_archived = false';
    const params: any[] = [];

    if (context) {
      whereClause += ` AND context = $1`;
      params.push(context);
    }

    const statsResult = await queryContext(
      (context as AIContext) || this.config.defaultContext,
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
      (context as AIContext) || this.config.defaultContext,
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
      context: context || 'all',
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
        uri: 'kiab://ideas',
        name: 'Alle Ideen',
        description: 'Liste aller Ideen im Personal AI Brain',
        mimeType: 'application/json',
      },
      {
        uri: 'kiab://stats',
        name: 'Statistiken',
        description: 'Übersicht und Statistiken',
        mimeType: 'application/json',
      },
    ];

    // Add individual ideas as resources
    for (const idea of recentIdeas.rows) {
      resources.push({
        uri: `kiab://ideas/${idea.id}`,
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

    let content: any;

    if (uri === 'kiab://ideas') {
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
    } else if (uri === 'kiab://stats') {
      content = await this.handleGetStats({});
    } else {
      // Individual idea
      const ideaMatch = uri.match(/kiab:\/\/ideas\/([a-f0-9-]+)/);
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
        console.log(JSON.stringify(response));
      } catch (error) {
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
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}

// ===========================================
// Export
// ===========================================

export const createMCPServer = (config?: Partial<MCPServerConfig>) => new KIABMCPServer(config);
