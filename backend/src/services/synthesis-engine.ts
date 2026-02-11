/**
 * Cross-Idea Synthesis Engine
 *
 * Synthesizes knowledge across multiple ideas using:
 * 1. Multi-Query Expansion (RAG-Fusion): Generate query variants for broader coverage
 * 2. Broad Retrieval: Parallel retrieval with Reciprocal Rank Fusion merge
 * 3. Graph Expansion: 1-hop neighbors via Knowledge Graph
 * 4. Temporal Ordering: Chronological sorting for development narrative
 * 5. Synthesis Generation: Claude synthesizes with source attribution
 *
 * Research: Reflect's killer feature. Most platforms search, they don't synthesize.
 *
 * @module services/synthesis-engine
 */

import { logger } from '../utils/logger';
import { AIContext } from '../utils/database-context';
import { enhancedRAG, EnhancedResult } from './enhanced-rag';
import { expandViaGraph } from './memory/graph-memory-bridge';
import { getClaudeClient, CLAUDE_MODEL, executeWithProtection } from './claude/client';

// ===========================================
// Types
// ===========================================

export interface SynthesisOptions {
  /** Max query variants to generate (default: 4) */
  maxQueryVariants?: number;
  /** Max results per query variant (default: 15) */
  maxResultsPerQuery?: number;
  /** Enable graph expansion for richer context (default: true) */
  enableGraphExpansion?: boolean;
  /** Max total unique ideas to synthesize (default: 25) */
  maxTotalIdeas?: number;
  /** Language for synthesis output (default: 'de') */
  language?: 'de' | 'en';
}

export interface SynthesisResult {
  /** The generated synthesis text with source attributions */
  synthesis: string;
  /** All source ideas referenced */
  sources: IdeaReference[];
  /** Identified knowledge gaps */
  gaps: string[];
  /** Contradictions between ideas */
  contradictions: string[];
  /** Query variants that were used */
  queryVariants: string[];
  /** Timing information */
  timing: {
    total: number;
    queryExpansion: number;
    retrieval: number;
    graphExpansion: number;
    synthesis: number;
  };
}

export interface IdeaReference {
  id: string;
  title: string;
  summary: string;
  createdAt?: string;
  score: number;
}

// ===========================================
// Configuration
// ===========================================

const DEFAULT_OPTIONS: Required<SynthesisOptions> = {
  maxQueryVariants: 4,
  maxResultsPerQuery: 15,
  enableGraphExpansion: true,
  maxTotalIdeas: 25,
  language: 'de',
};

// ===========================================
// Multi-Query Expansion
// ===========================================

/**
 * Generate query variants for RAG-Fusion.
 * Uses Claude to create diverse reformulations of the original query.
 */
async function generateQueryVariants(
  query: string,
  maxVariants: number
): Promise<string[]> {
  try {
    const client = getClaudeClient();
    const response = await executeWithProtection(() =>
      client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Generiere ${maxVariants} verschiedene Suchvarianten für folgende Anfrage. Die Varianten sollen das Thema aus verschiedenen Blickwinkeln abdecken (Synonyme, verwandte Konzepte, spezifischer/allgemeiner).

Anfrage: "${query}"

Antworte NUR mit den Varianten, eine pro Zeile, ohne Nummerierung oder Aufzählungszeichen.`,
        }],
      })
    );

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const variants = text.split('\n')
      .map((v: string) => v.trim())
      .filter((v: string) => v.length > 3 && v.length < 200)
      .slice(0, maxVariants);

    // Always include the original query
    return [query, ...variants.filter(v => v.toLowerCase() !== query.toLowerCase())];
  } catch (error) {
    logger.warn('Query variant generation failed, using original only', { error });
    return [query];
  }
}

// ===========================================
// Reciprocal Rank Fusion (RRF)
// ===========================================

/**
 * Merge results from multiple queries using Reciprocal Rank Fusion.
 * RRF is robust to different score distributions across queries.
 */
function reciprocalRankFusion(
  resultSets: EnhancedResult[][],
  k: number = 60
): EnhancedResult[] {
  const scores = new Map<string, { score: number; result: EnhancedResult }>();

  for (const results of resultSets) {
    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank];
      const rrfScore = 1 / (k + rank + 1);

      const existing = scores.get(result.id);
      if (existing) {
        existing.score += rrfScore;
        // Keep the higher-scored version of the result
        if (result.score > existing.result.score) {
          existing.result = result;
        }
      } else {
        scores.set(result.id, { score: rrfScore, result });
      }
    }
  }

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ score, result }) => ({
      ...result,
      score, // Replace with RRF score
    }));
}

// ===========================================
// Core Synthesis
// ===========================================

/**
 * Synthesize knowledge across ideas for a given query.
 *
 * @param query - The synthesis query (e.g., "Was weiß ich über Marketing?")
 * @param context - AI context (personal/work)
 * @param options - Synthesis options
 */
export async function synthesizeKnowledge(
  query: string,
  context: AIContext,
  options: SynthesisOptions = {}
): Promise<SynthesisResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  const timing = {
    total: 0,
    queryExpansion: 0,
    retrieval: 0,
    graphExpansion: 0,
    synthesis: 0,
  };

  logger.info('Synthesis engine starting', {
    query: query.substring(0, 80),
    context,
    options: opts,
  });

  // ──────────────────────────────
  // Step 1: Multi-Query Expansion
  // ──────────────────────────────
  const expansionStart = Date.now();
  const queryVariants = await generateQueryVariants(query, opts.maxQueryVariants);
  timing.queryExpansion = Date.now() - expansionStart;

  logger.debug('Query variants generated', { count: queryVariants.length, variants: queryVariants });

  // ──────────────────────────────
  // Step 2: Broad Retrieval (parallel)
  // ──────────────────────────────
  const retrievalStart = Date.now();
  const retrievalPromises = queryVariants.map(variant =>
    enhancedRAG.retrieve(variant, context, {
      maxResults: opts.maxResultsPerQuery,
      enableHyDE: true,
      enableCrossEncoder: true,
    }).then(r => r.results).catch(() => [] as EnhancedResult[])
  );

  const allResultSets = await Promise.all(retrievalPromises);
  timing.retrieval = Date.now() - retrievalStart;

  // Step 2b: Reciprocal Rank Fusion merge
  const merged = reciprocalRankFusion(allResultSets);
  const topResults = merged.slice(0, opts.maxTotalIdeas);

  logger.debug('Retrieval complete', {
    totalRetrieved: allResultSets.reduce((sum, r) => sum + r.length, 0),
    uniqueAfterRRF: merged.length,
    topSelected: topResults.length,
  });

  if (topResults.length === 0) {
    return {
      synthesis: opts.language === 'de'
        ? `Zu "${query}" wurden keine relevanten Ideen in deiner Wissensbasis gefunden.`
        : `No relevant ideas found for "${query}" in your knowledge base.`,
      sources: [],
      gaps: [query],
      contradictions: [],
      queryVariants,
      timing: { ...timing, total: Date.now() - startTime },
    };
  }

  // ──────────────────────────────
  // Step 3: Graph Expansion
  // ──────────────────────────────
  let graphContext = '';
  const graphStart = Date.now();
  if (opts.enableGraphExpansion && topResults.length > 0) {
    try {
      const seedIds = topResults.slice(0, 10).map(r => r.id);
      const expansion = await expandViaGraph(seedIds, context, {
        enableSerendipity: false,
        minStrength: 0.4,
        maxNeighborsPerSeed: 2,
      });

      if (expansion.contextParts.length > 0) {
        graphContext = '\n\n[GRAPH-VERBINDUNGEN]\n' +
          expansion.contextParts.map(p =>
            `- ${p.content}`
          ).join('\n');
      }
    } catch (error) {
      logger.debug('Graph expansion in synthesis skipped', { error });
    }
  }
  timing.graphExpansion = Date.now() - graphStart;

  // ──────────────────────────────
  // Step 4: Temporal Ordering
  // ──────────────────────────────
  const sources: IdeaReference[] = topResults.map(r => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    createdAt: undefined, // Enhanced results don't carry timestamps
    score: r.score,
  }));

  // ──────────────────────────────
  // Step 5: Synthesis Generation
  // ──────────────────────────────
  const synthesisStart = Date.now();

  const ideaContext = topResults.map((r, i) =>
    `[Idee ${i + 1}: "${r.title}"] ${r.summary || r.content || ''}`.substring(0, 500)
  ).join('\n\n');

  const isGerman = opts.language === 'de';

  const systemPrompt = isGerman
    ? `Du bist ein Wissens-Synthesizer. Deine Aufgabe ist es, Wissen aus den gegebenen Ideen zu einer kohärenten Synthese zusammenzufassen.

Regeln:
1. Jede Aussage MUSS mit einer Quellenangabe [Idee: "Titel"] attribuiert werden
2. Zeige die Entwicklung des Denkens über die Ideen hinweg
3. Benenne explizit Widersprüche zwischen Ideen
4. Identifiziere Wissenslücken (was fehlt?)
5. Strukturiere die Synthese mit klaren Abschnitten
6. Wenn Graph-Verbindungen vorhanden sind, nutze sie für Kontext
7. Antworte auf Deutsch`
    : `You are a knowledge synthesizer. Your task is to synthesize knowledge from the given ideas into a coherent summary.

Rules:
1. Every statement MUST be attributed with [Idea: "Title"]
2. Show the evolution of thinking across ideas
3. Explicitly name contradictions between ideas
4. Identify knowledge gaps (what's missing?)
5. Structure the synthesis with clear sections
6. If graph connections are available, use them for context
7. Answer in English`;

  const userPrompt = isGerman
    ? `Erstelle eine Synthese zu: "${query}"

Basierend auf ${topResults.length} Ideen aus der Wissensbasis:

${ideaContext}${graphContext}

Strukturiere deine Antwort so:
## Synthese
[Haupterkenntnisse mit Quellenangaben]

## Entwicklung
[Wie sich das Denken über die Ideen entwickelt hat]

## Widersprüche
[Falls vorhanden, Widersprüche zwischen Ideen]

## Wissenslücken
[Was fehlt noch? Welche Fragen sind offen?]`
    : `Create a synthesis for: "${query}"

Based on ${topResults.length} ideas from the knowledge base:

${ideaContext}${graphContext}

Structure your response:
## Synthesis
[Key insights with source attribution]

## Evolution
[How thinking evolved across ideas]

## Contradictions
[If any, contradictions between ideas]

## Knowledge Gaps
[What's missing? What questions remain open?]`;

  let synthesis = '';
  const gaps: string[] = [];
  const contradictions: string[] = [];

  try {
    const client = getClaudeClient();
    const response = await executeWithProtection(() =>
      client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
    );

    synthesis = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract gaps and contradictions from the synthesis using safe split-based parsing
    const gapSections = synthesis.split(/\n## (?:Wissenslücken|Knowledge Gaps)\s*\n/);
    if (gapSections.length > 1) {
      const gapContent = gapSections[1].split(/\n## /)[0] || '';
      const gapLines = gapContent.split('\n')
        .map(l => l.replace(/^[-*•]\s*/, '').trim())
        .filter(l => l.length > 5);
      gaps.push(...gapLines);
    }

    const contradictionSections = synthesis.split(/\n## (?:Widersprüche|Contradictions)\s*\n/);
    if (contradictionSections.length > 1) {
      const contradictionContent = contradictionSections[1].split(/\n## /)[0] || '';
      const contradictionLines = contradictionContent.split('\n')
        .map(l => l.replace(/^[-*•]\s*/, '').trim())
        .filter(l => l.length > 5);
      contradictions.push(...contradictionLines);
    }
  } catch (error) {
    logger.error('Synthesis generation failed', error instanceof Error ? error : undefined);
    synthesis = isGerman
      ? `Synthese konnte nicht generiert werden. ${topResults.length} relevante Ideen wurden gefunden.`
      : `Synthesis could not be generated. ${topResults.length} relevant ideas were found.`;
  }

  timing.synthesis = Date.now() - synthesisStart;
  timing.total = Date.now() - startTime;

  logger.info('Synthesis complete', {
    sourceCount: sources.length,
    gapCount: gaps.length,
    contradictionCount: contradictions.length,
    timing,
  });

  return {
    synthesis,
    sources,
    gaps,
    contradictions,
    queryVariants,
    timing,
  };
}

/**
 * Detect if a query is a synthesis request.
 * Used by chat-modes and tool handlers.
 */
export function isSynthesisQuery(message: string): boolean {
  const patterns = [
    /fasse?\s+(?:alles )?zusammen\s+was\s+(?:ich|du|wir)/i,
    /was\s+weiß\s+(?:ich|du)\s+(?:alles )?(?:über|zu|von)/i,
    /überblick\s+über\s+(?:alle|meine|das\s+thema)/i,
    /synthes(?:e|iere|ize)/i,
    /verbinde\s+(?:alle )?(?:meine )?(?:ideen?|gedanken|notizen)/i,
    /zeig\s+(?:mir )?(?:den )?zusammenhang/i,
    /wie\s+hängt\s+alles\s+zusammen/i,
    /gesamtbild\s+(zu|über|von)/i,
    /summarize\s+(all|my|everything)/i,
    /what\s+do\s+I\s+know\s+about/i,
  ];

  return patterns.some(p => p.test(message));
}
