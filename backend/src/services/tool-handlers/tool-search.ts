/**
 * Phase 99: Tool Search Tool Pattern
 *
 * Meta-tool that allows Claude to discover available tools dynamically.
 * Instead of loading all 50+ tools into every request, we provide:
 * - A set of core tools (always available)
 * - A search_tools meta-tool that finds relevant tools by query
 *
 * This reduces token usage while maintaining full tool access.
 *
 * @module services/tool-handlers/tool-search
 */

import { logger } from '../../utils/logger';
import type { ToolDefinition, ToolExecutionContext } from '../claude/tool-use';

// ===========================================
// Types
// ===========================================

interface ToolRegistryEntry {
  definition: ToolDefinition;
  category: string;
  keywords: string[];
}

// ===========================================
// Core Tools (always available in every session)
// ===========================================

export const CORE_TOOL_NAMES = [
  'search_tools',
  'remember',
  'recall',
  'web_search',
  'navigate_to',
] as const;

// ===========================================
// Tool Registry
// ===========================================

let toolRegistryMap: Map<string, ToolRegistryEntry> = new Map();

/**
 * Extract keywords from a tool description for search matching.
 */
function extractKeywords(description: string): string[] {
  // Remove common German/English stop words and extract meaningful terms
  const stopWords = new Set([
    'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'für', 'mit', 'von',
    'zu', 'in', 'auf', 'an', 'bei', 'nach', 'über', 'unter', 'vor', 'wenn',
    'the', 'a', 'an', 'and', 'or', 'for', 'with', 'from', 'to', 'in', 'on',
    'at', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that',
    'nutze', 'dies', 'wenn', 'des', 'dem', 'den', 'es', 'er', 'sie', 'ist',
  ]);

  return description
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 20); // Cap to prevent excessive keyword lists
}

/**
 * Infer category from tool name.
 */
function inferCategory(toolName: string): string {
  if (toolName.startsWith('github_')) return 'github';
  if (toolName.startsWith('memory_') || toolName === 'remember' || toolName === 'recall' || toolName === 'memory_introspect') return 'memory';
  if (toolName.startsWith('get_') && (toolName.includes('revenue') || toolName.includes('traffic') || toolName.includes('seo') || toolName.includes('health'))) return 'business';
  if (toolName.includes('calendar') || toolName.includes('email') || toolName.includes('travel')) return 'productivity';
  if (toolName.includes('direction') || toolName.includes('nearby') || toolName.includes('opening') || toolName.includes('route')) return 'maps';
  if (toolName.includes('project') || toolName.includes('analyze') || toolName.includes('code')) return 'development';
  if (toolName.includes('document') || toolName.includes('synthesize') || toolName.includes('knowledge')) return 'documents';
  if (toolName.includes('inbox')) return 'email';
  if (toolName.includes('mcp')) return 'mcp';
  if (toolName.includes('web') || toolName.includes('fetch')) return 'web';
  if (toolName.includes('idea') || toolName.includes('related')) return 'ideas';
  return 'general';
}

/**
 * Initialize the tool registry from all available tool definitions.
 * Call this at startup after all tools are registered.
 */
export function initToolRegistry(allTools: ToolDefinition[]): void {
  toolRegistryMap = new Map();

  for (const tool of allTools) {
    const category = inferCategory(tool.name);
    const keywords = [
      ...extractKeywords(tool.description),
      ...tool.name.split('_'),
      category,
    ];

    toolRegistryMap.set(tool.name, {
      definition: tool,
      category,
      keywords,
    });
  }

  logger.info('Tool search registry initialized', {
    totalTools: toolRegistryMap.size,
    categories: [...new Set([...toolRegistryMap.values()].map(e => e.category))],
  });
}

/**
 * Search for tools matching a query string.
 * Uses keyword matching against tool names, descriptions, and categories.
 */
export function searchTools(query: string, maxResults: number = 10): ToolDefinition[] {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 1);

  if (queryTerms.length === 0) {
    return [];
  }

  const scored: Array<{ definition: ToolDefinition; score: number }> = [];

  for (const [, entry] of toolRegistryMap) {
    let score = 0;
    const nameWords = entry.definition.name.toLowerCase().split('_');

    for (const term of queryTerms) {
      // Exact name match is highest
      if (entry.definition.name.toLowerCase() === term) {
        score += 10;
      }
      // Name contains term
      if (nameWords.some(w => w.includes(term))) {
        score += 5;
      }
      // Category match
      if (entry.category.includes(term)) {
        score += 3;
      }
      // Keyword match
      const keywordMatches = entry.keywords.filter(k => k.includes(term)).length;
      score += keywordMatches;
    }

    if (score > 0) {
      scored.push({ definition: entry.definition, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.definition);
}

/**
 * Get tool definitions for core tools only.
 */
export function getCoreTools(): ToolDefinition[] {
  const coreDefs: ToolDefinition[] = [];
  for (const name of CORE_TOOL_NAMES) {
    const entry = toolRegistryMap.get(name);
    if (entry) {
      coreDefs.push(entry.definition);
    }
  }
  return coreDefs;
}

/**
 * Get all registered tool definitions.
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return [...toolRegistryMap.values()].map(e => e.definition);
}

// ===========================================
// search_tools Meta-Tool Definition
// ===========================================

export const searchToolsDefinition: ToolDefinition = {
  name: 'search_tools',
  description: 'Sucht nach verfuegbaren Tools basierend auf einer Beschreibung. Nutze dies um herauszufinden welche Tools fuer eine bestimmte Aufgabe zur Verfuegung stehen, bevor du sie verwendest.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Beschreibung der gewuenschten Funktionalitaet (z.B. "E-Mail senden", "Code ausfuehren", "Kalender")',
      },
      max_results: {
        type: 'number',
        description: 'Maximale Anzahl Ergebnisse (Standard: 10)',
      },
    },
    required: ['query'],
  },
};

/**
 * Handler for the search_tools meta-tool.
 */
export async function handleSearchTools(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const query = input.query as string;
  const maxResults = (input.max_results as number) || 10;

  if (!query) {
    return 'Fehler: Keine Suchanfrage angegeben.';
  }

  const results = searchTools(query, maxResults);

  if (results.length === 0) {
    return `Keine passenden Tools gefunden fuer: "${query}". Versuche andere Suchbegriffe.`;
  }

  const formatted = results.map((t, i) =>
    `${i + 1}. **${t.name}**: ${t.description.substring(0, 120)}${t.description.length > 120 ? '...' : ''}`
  ).join('\n');

  return `Verfuegbare Tools (${results.length}) fuer "${query}":\n\n${formatted}\n\nNutze das gewuenschte Tool direkt in deiner naechsten Antwort.`;
}
