/**
 * Phase 70: A-RAG Strategy Agent
 *
 * Claude-based meta-agent that creates retrieval plans by analyzing
 * query complexity and selecting optimal retrieval interfaces.
 *
 * Uses a lightweight prompt (< 500 tokens) for speed.
 * Falls back to a heuristic default plan if Claude fails.
 *
 * @module services/arag/strategy-agent
 */

import { logger } from '../../utils/logger';
import { queryClaudeJSON } from '../claude';
import type {
  RetrievalInterface,
  RetrievalPlan,
  RetrievalStep,
  QueryClassification,
} from './retrieval-interfaces';

// ===========================================
// Strategy Agent Prompt
// ===========================================

const STRATEGY_SYSTEM_PROMPT = `You are a retrieval strategy planner. Given a user query, output a JSON retrieval plan.

Available interfaces:
- keyword: Full-text search (best for specific terms, names, codes)
- semantic: Embedding similarity (best for conceptual/thematic queries)
- chunk_read: Direct lookup by ID (use when you have specific IDs from prior steps)
- graph: Knowledge graph traversal (best for relationships, connections)
- community: Community summaries (best for broad topic overviews)

Query types:
- simple_lookup: Direct fact or item retrieval
- multi_hop: Requires connecting information from multiple sources
- comparison: Comparing two or more items
- temporal: Time-based queries (recent, last week, etc.)
- analytical: Deep analysis or synthesis

Output JSON only:
{
  "queryType": "simple_lookup|multi_hop|comparison|temporal|analytical",
  "steps": [
    { "interface": "semantic", "params": { "query": "..." } },
    { "interface": "keyword", "params": { "terms": "..." } }
  ],
  "reasoning": "Brief explanation",
  "expectedConfidence": 0.0-1.0
}

Rules:
- Max 4 steps per plan
- Use dependsOn (step index) for sequential dependencies
- Prefer fewer steps for simple queries
- Combine semantic + keyword for best coverage on complex queries`;

// ===========================================
// Heuristic Classifier
// ===========================================

/**
 * Fast heuristic query classification (no LLM needed).
 * Used as fallback and to inform the strategy agent.
 */
export function classifyQueryHeuristic(query: string): QueryClassification {
  const q = query.toLowerCase();

  // Temporal indicators
  if (/\b(letzte|kürzlich|vor \d|gestern|heute|diese woche|letzten|recent|last|ago|yesterday|today)\b/i.test(q)) {
    return 'temporal';
  }

  // Comparison indicators
  if (/\b(vergleich|unterschied|vs\.?|versus|compared|difference|besser|worse|better)\b/i.test(q)) {
    return 'comparison';
  }

  // Analytical indicators
  if (/\b(analys\w*|zusammenfass\w*|erkläre?\w*|warum|why|how does|wie funktioniert|synthes\w*|overview|überblick)\b/i.test(q)) {
    return 'analytical';
  }

  // Multi-hop indicators
  if (/\b(verbind\w*|bezieh\w*|zusammen\w*|between|across|und.*auch|related|connection)\b/i.test(q)) {
    return 'multi_hop';
  }

  return 'simple_lookup';
}

// ===========================================
// Default Plan Builder
// ===========================================

/**
 * Build a default retrieval plan based on heuristic classification.
 * Used as fallback when Claude fails or is unavailable.
 */
export function buildDefaultPlan(query: string, availableInterfaces: RetrievalInterface[]): RetrievalPlan {
  const queryType = classifyQueryHeuristic(query);
  const steps: RetrievalStep[] = [];

  const has = (iface: RetrievalInterface) => availableInterfaces.includes(iface);

  switch (queryType) {
    case 'simple_lookup':
      if (has('semantic')) steps.push({ interface: 'semantic', params: { query } });
      if (has('keyword')) steps.push({ interface: 'keyword', params: { terms: query } });
      break;

    case 'temporal':
      if (has('keyword')) steps.push({ interface: 'keyword', params: { terms: query } });
      if (has('semantic')) steps.push({ interface: 'semantic', params: { query } });
      break;

    case 'comparison':
      if (has('semantic')) steps.push({ interface: 'semantic', params: { query } });
      if (has('keyword')) steps.push({ interface: 'keyword', params: { terms: query } });
      if (has('graph')) steps.push({ interface: 'graph', params: { query } });
      break;

    case 'multi_hop':
      if (has('semantic')) steps.push({ interface: 'semantic', params: { query } });
      if (has('graph')) steps.push({ interface: 'graph', params: { query }, dependsOn: 0 });
      if (has('community')) steps.push({ interface: 'community', params: { query } });
      break;

    case 'analytical':
      if (has('semantic')) steps.push({ interface: 'semantic', params: { query } });
      if (has('community')) steps.push({ interface: 'community', params: { query } });
      if (has('keyword')) steps.push({ interface: 'keyword', params: { terms: query } });
      break;
  }

  // Ensure at least one step
  if (steps.length === 0 && has('semantic')) {
    steps.push({ interface: 'semantic', params: { query } });
  }

  return {
    steps,
    reasoning: `Default plan for ${queryType} query`,
    expectedConfidence: 0.6,
    queryType,
  };
}

// ===========================================
// Strategy Agent
// ===========================================

/**
 * Use Claude to create an optimized retrieval plan.
 * Falls back to heuristic plan on any failure.
 */
export async function planRetrieval(
  query: string,
  context: string,
  availableInterfaces: RetrievalInterface[]
): Promise<RetrievalPlan> {
  const defaultPlan = buildDefaultPlan(query, availableInterfaces);

  try {
    const userPrompt = `Query: "${query}"
Context: ${context}
Available interfaces: ${availableInterfaces.join(', ')}

Create retrieval plan (JSON only):`;

    const planResponse = await queryClaudeJSON<{
      queryType?: string;
      steps?: Array<{ interface?: string; params?: Record<string, unknown>; dependsOn?: number }>;
      reasoning?: string;
      expectedConfidence?: number;
    }>(STRATEGY_SYSTEM_PROMPT, userPrompt);

    // Validate and sanitize the response
    if (!planResponse?.steps || !Array.isArray(planResponse.steps) || planResponse.steps.length === 0) {
      logger.debug('Strategy agent returned invalid plan, using default');
      return defaultPlan;
    }

    // Filter to only valid interfaces and limit to 4 steps
    const validSteps: RetrievalStep[] = planResponse.steps
      .filter(step => step.interface && availableInterfaces.includes(step.interface as RetrievalInterface))
      .slice(0, 4)
      .map(step => ({
        interface: step.interface as RetrievalInterface,
        params: step.params || { query },
        dependsOn: typeof step.dependsOn === 'number' ? step.dependsOn : undefined,
      }));

    if (validSteps.length === 0) {
      logger.debug('Strategy agent returned no valid steps, using default');
      return defaultPlan;
    }

    const validQueryTypes: QueryClassification[] = ['simple_lookup', 'multi_hop', 'comparison', 'temporal', 'analytical'];
    const queryType = validQueryTypes.includes(planResponse.queryType as QueryClassification)
      ? planResponse.queryType as QueryClassification
      : defaultPlan.queryType;

    return {
      steps: validSteps,
      reasoning: planResponse.reasoning || 'Strategy agent plan',
      expectedConfidence: typeof planResponse.expectedConfidence === 'number'
        ? Math.min(Math.max(planResponse.expectedConfidence, 0), 1)
        : 0.7,
      queryType,
    };
  } catch (error) {
    logger.warn('Strategy agent failed, using default plan', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return defaultPlan;
  }
}
