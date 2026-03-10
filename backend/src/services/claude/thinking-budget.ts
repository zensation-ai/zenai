/**
 * Dynamic Thinking Budget System
 *
 * Optimizes Extended Thinking token budget based on:
 * - Task complexity analysis
 * - Historical performance data
 * - Query characteristics
 *
 * Goal: Use optimal budget - not too little (poor quality), not too much (waste)
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
// Lazy import to break circular dependency: ai.ts -> claude/ -> thinking-budget -> ai.ts
let _generateEmbedding: typeof import('../ai').generateEmbedding | null = null;
async function getGenerateEmbedding() {
  if (!_generateEmbedding) {
    const ai = await import('../ai');
    _generateEmbedding = ai.generateEmbedding;
  }
  return _generateEmbedding;
}
import { formatForPgVector } from '../../utils/embedding';
import crypto from 'crypto';

// ===========================================
// Types & Interfaces
// ===========================================

export type TaskType =
  | 'simple_structuring'      // Basic memo structuring
  | 'complex_structuring'     // Multi-part memos with context
  | 'analysis'                // Business/technical analysis
  | 'synthesis'               // Multi-document synthesis
  | 'strategic_planning'      // Long-term planning
  | 'creative_generation'     // Draft generation
  | 'problem_solving'         // Complex problem resolution
  | 'knowledge_extraction';   // Fact/pattern extraction

export interface ThinkingBudgetStrategy {
  taskType: TaskType;
  baseTokens: number;
  complexityMultiplier: number;
  minTokens: number;
  maxTokens: number;
}

export interface ComplexityScore {
  documentCount: number;
  questionDepth: number;           // 1-5, 5 = very deep
  crossReferenceNeed: number;      // 0-1, likelihood of needing cross-references
  temporalComplexity: number;      // 0-1, involves time-based reasoning
  ambiguity: number;               // 0-1, how ambiguous the input is
  score: number;                   // 0-1, overall complexity
}

export interface ThinkingChain {
  id: string;
  sessionId: string;
  context: AIContext;
  taskType: TaskType;
  inputHash: string;
  inputPreview: string;
  thinkingContent: string;
  thinkingTokensUsed: number;
  responseQuality: number | null;
  feedbackText: string | null;
  feedbackAt: Date | null;
  embedding: number[] | null;
  createdAt: Date;
}

export interface BudgetRecommendation {
  recommendedBudget: number;
  taskType: TaskType;
  complexity: ComplexityScore;
  reasoning: string;
  similarChains: ThinkingChain[];
}

// ===========================================
// Configuration
// ===========================================

/** Base strategies per task type */
const BUDGET_STRATEGIES: Record<TaskType, ThinkingBudgetStrategy> = {
  'simple_structuring': {
    taskType: 'simple_structuring',
    baseTokens: 2000,
    complexityMultiplier: 1.0,
    minTokens: 1000,
    maxTokens: 5000,
  },
  'complex_structuring': {
    taskType: 'complex_structuring',
    baseTokens: 5000,
    complexityMultiplier: 1.2,
    minTokens: 3000,
    maxTokens: 15000,
  },
  'analysis': {
    taskType: 'analysis',
    baseTokens: 15000,
    complexityMultiplier: 1.5,
    minTokens: 8000,
    maxTokens: 40000,
  },
  'synthesis': {
    taskType: 'synthesis',
    baseTokens: 25000,
    complexityMultiplier: 1.8,
    minTokens: 15000,
    maxTokens: 80000,
  },
  'strategic_planning': {
    taskType: 'strategic_planning',
    baseTokens: 40000,
    complexityMultiplier: 2.0,
    minTokens: 25000,
    maxTokens: 100000,
  },
  'creative_generation': {
    taskType: 'creative_generation',
    baseTokens: 8000,
    complexityMultiplier: 1.3,
    minTokens: 5000,
    maxTokens: 25000,
  },
  'problem_solving': {
    taskType: 'problem_solving',
    baseTokens: 20000,
    complexityMultiplier: 1.6,
    minTokens: 10000,
    maxTokens: 60000,
  },
  'knowledge_extraction': {
    taskType: 'knowledge_extraction',
    baseTokens: 10000,
    complexityMultiplier: 1.4,
    minTokens: 5000,
    maxTokens: 30000,
  },
};

const CONFIG = {
  /** Minimum quality for chain to be considered successful */
  MIN_QUALITY_FOR_PRIMING: 0.7,
  /** Maximum similar chains to retrieve for priming */
  MAX_SIMILAR_CHAINS: 3,
  /** Minimum similarity for chain matching */
  MIN_CHAIN_SIMILARITY: 0.6,
  /** Learning rate for strategy adjustment */
  LEARNING_RATE: 0.1,
};

// ===========================================
// Task Type Classification
// ===========================================

/**
 * Classify the task type from input text
 */
export function classifyTaskType(input: string, hint?: string): TaskType {
  const inputLower = input.toLowerCase();

  // If hint provided, use it
  if (hint && Object.keys(BUDGET_STRATEGIES).includes(hint)) {
    return hint as TaskType;
  }

  // Pattern-based classification
  const patterns: Array<{ type: TaskType; patterns: RegExp[] }> = [
    {
      type: 'strategic_planning',
      patterns: [
        /strategi|langfristig|roadmap|vision|planung/i,
        /business plan|geschäftsplan|wachstum/i,
      ],
    },
    {
      type: 'synthesis',
      patterns: [
        /zusammenfass|synthes|kombini|verbind|mehrere/i,
        /dokument.*analys|überblick|gesamtbild/i,
      ],
    },
    {
      type: 'analysis',
      patterns: [
        /analys|bewert|evaluier|prüf|untersu/i,
        /vor.*nachteil|risiko|chance/i,
      ],
    },
    {
      type: 'problem_solving',
      patterns: [
        /problem|fehler|bug|issue|schwierig/i,
        /lösung|beheb|fix|resolv/i,
      ],
    },
    {
      type: 'creative_generation',
      patterns: [
        /schreib|erstell|generier|verfass|entwurf/i,
        /e-mail|artikel|brief|proposal|dokument/i,
      ],
    },
    {
      type: 'knowledge_extraction',
      patterns: [
        /extrahier|identifizier|erkenn|find.*muster/i,
        /fakt|erkenntnis|insight|pattern/i,
      ],
    },
    {
      type: 'complex_structuring',
      patterns: [
        /strukturier|organis|kategorisier|sortier/i,
        /mehrere.*punkt|verschiedene.*aspekt/i,
      ],
    },
  ];

  for (const { type, patterns: typePatterns } of patterns) {
    if (typePatterns.some(p => p.test(inputLower))) {
      return type;
    }
  }

  // Default based on length
  if (input.length > 2000) {
    return 'complex_structuring';
  }

  return 'simple_structuring';
}

// ===========================================
// Complexity Analysis
// ===========================================

/**
 * Analyze complexity of input for budget calculation
 */
export function analyzeComplexity(input: string, _context?: AIContext): ComplexityScore {
  const inputLower = input.toLowerCase();

  // Document count (markers for multiple documents/sources)
  const documentMarkers = [
    /dokument|quelle|referenz|anhang|beilage/gi,
    /\[.*?\]/g,  // Bracketed references
    /https?:\/\//g,  // URLs
  ];
  let documentCount = 0;
  for (const marker of documentMarkers) {
    const matches = input.match(marker);
    documentCount += matches ? matches.length : 0;
  }
  documentCount = Math.min(documentCount, 10);

  // Question depth
  const deepQuestionMarkers = [
    /warum|weshalb|wieso/gi,
    /wie.*funktioniert|wie.*zusammenhang/gi,
    /was.*bedeutet.*für/gi,
    /implikation|konsequenz|auswirkung/gi,
  ];
  let questionDepth = 1;
  for (const marker of deepQuestionMarkers) {
    if (marker.test(inputLower)) {questionDepth++;}
  }
  questionDepth = Math.min(questionDepth, 5);

  // Cross-reference need
  const crossRefMarkers = [
    /vergleich|unterschied|ähnlich|anders/gi,
    /zusammenhang|verbindung|bezug/gi,
    /vorher.*nachher|früher.*jetzt/gi,
  ];
  let crossRefCount = 0;
  for (const marker of crossRefMarkers) {
    if (marker.test(inputLower)) {crossRefCount++;}
  }
  const crossReferenceNeed = Math.min(crossRefCount / 3, 1);

  // Temporal complexity
  const temporalMarkers = [
    /wann|zeitraum|seit|bis|dauer/gi,
    /vergangenheit|zukunft|entwicklung/gi,
    /trend|prognose|forecast/gi,
  ];
  let temporalCount = 0;
  for (const marker of temporalMarkers) {
    if (marker.test(inputLower)) {temporalCount++;}
  }
  const temporalComplexity = Math.min(temporalCount / 3, 1);

  // Ambiguity (lack of specifics)
  const specificityMarkers = [
    /genau|konkret|spezifisch|präzise/gi,
    /\d+/g,  // Numbers
    /beispiel|instanz|fall/gi,
  ];
  let specificityCount = 0;
  for (const marker of specificityMarkers) {
    const matches = input.match(marker);
    specificityCount += matches ? matches.length : 0;
  }
  const ambiguity = Math.max(0, 1 - specificityCount / 10);

  // Overall score (weighted average)
  const score = (
    (documentCount / 10) * 0.2 +
    ((questionDepth - 1) / 4) * 0.25 +
    crossReferenceNeed * 0.2 +
    temporalComplexity * 0.15 +
    ambiguity * 0.2
  );

  return {
    documentCount,
    questionDepth,
    crossReferenceNeed,
    temporalComplexity,
    ambiguity,
    score: Math.min(Math.max(score, 0), 1),
  };
}

// ===========================================
// Budget Calculation
// ===========================================

/**
 * Calculate dynamic thinking budget
 */
export async function calculateDynamicBudget(
  input: string,
  taskType: TaskType,
  context: AIContext
): Promise<BudgetRecommendation> {
  const strategy = BUDGET_STRATEGIES[taskType];
  const complexity = analyzeComplexity(input, context);

  // Base calculation
  let budget = strategy.baseTokens * (1 + complexity.score * strategy.complexityMultiplier);

  // Get similar successful chains for refinement
  const similarChains = await findSimilarSuccessfulChains(input, taskType, context);

  // Adjust based on similar chains
  if (similarChains.length > 0) {
    const avgTokensUsed = similarChains.reduce((sum, c) => sum + c.thinkingTokensUsed, 0) / similarChains.length;
    const avgQuality = similarChains.reduce((sum, c) => sum + (c.responseQuality || 0), 0) / similarChains.length;

    // If similar tasks used fewer tokens with good quality, reduce budget
    if (avgQuality >= 0.8 && avgTokensUsed < budget * 0.8) {
      budget = avgTokensUsed * 1.1;  // Use 10% more than historical average
    }
    // If similar tasks had poor quality, increase budget
    else if (avgQuality < 0.6) {
      budget *= 1.3;
    }
  }

  // Apply min/max bounds
  budget = Math.max(strategy.minTokens, Math.min(strategy.maxTokens, Math.round(budget)));

  // Generate reasoning
  const reasoning = generateBudgetReasoning(taskType, complexity, budget, similarChains);

  return {
    recommendedBudget: budget,
    taskType,
    complexity,
    reasoning,
    similarChains,
  };
}

/**
 * Generate human-readable reasoning for budget decision
 */
function generateBudgetReasoning(
  taskType: TaskType,
  complexity: ComplexityScore,
  budget: number,
  similarChains: ThinkingChain[]
): string {
  const parts: string[] = [];

  parts.push(`Task type: ${taskType}`);
  parts.push(`Complexity score: ${(complexity.score * 100).toFixed(0)}%`);

  if (complexity.documentCount > 2) {
    parts.push(`Multiple documents detected (${complexity.documentCount})`);
  }
  if (complexity.questionDepth >= 3) {
    parts.push(`Deep reasoning required (depth: ${complexity.questionDepth})`);
  }
  if (complexity.crossReferenceNeed > 0.5) {
    parts.push(`Cross-referencing likely needed`);
  }

  if (similarChains.length > 0) {
    const avgQuality = similarChains.reduce((sum, c) => sum + (c.responseQuality || 0), 0) / similarChains.length;
    parts.push(`Based on ${similarChains.length} similar tasks (avg quality: ${(avgQuality * 100).toFixed(0)}%)`);
  }

  parts.push(`Recommended budget: ${budget.toLocaleString()} tokens`);

  return parts.join('. ');
}

// ===========================================
// Thinking Chain Persistence
// ===========================================

/**
 * Store a thinking chain for learning
 */
export async function storeThinkingChain(
  sessionId: string,
  context: AIContext,
  taskType: TaskType,
  input: string,
  thinkingContent: string,
  thinkingTokensUsed: number
): Promise<string> {
  try {
    // Generate input hash for deduplication
    const inputHash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 64);

    // Generate embedding for similarity search
    const genEmbedding = await getGenerateEmbedding();
    const embedding = await genEmbedding(input.substring(0, 1000));

    const result = await queryContext(
      context,
      `INSERT INTO thinking_chains (
        session_id, context, task_type, input_hash, input_preview,
        thinking_content, thinking_tokens_used, embedding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        sessionId,
        context,
        taskType,
        inputHash,
        input.substring(0, 500),
        thinkingContent,
        thinkingTokensUsed,
        embedding.length > 0 ? formatForPgVector(embedding) : null,
      ]
    );

    const chainId = result.rows[0]?.id;
    if (!chainId) {
      throw new Error('Failed to store thinking chain: no ID returned');
    }

    logger.debug('Thinking chain stored', {
      chainId,
      taskType,
      tokensUsed: thinkingTokensUsed,
    });

    return chainId;
  } catch (error) {
    logger.error('Failed to store thinking chain', error instanceof Error ? error : undefined, {
      sessionId,
      taskType,
    });
    throw error;
  }
}

/**
 * Find similar successful thinking chains for priming
 */
export async function findSimilarSuccessfulChains(
  input: string,
  taskType: TaskType,
  context: AIContext,
  limit: number = CONFIG.MAX_SIMILAR_CHAINS
): Promise<ThinkingChain[]> {
  try {
    const genEmbedding = await getGenerateEmbedding();
    const embedding = await genEmbedding(input.substring(0, 1000));

    if (embedding.length === 0) {
      return [];
    }

    const result = await queryContext(
      context,
      `SELECT *,
              1 - (embedding <=> $3) as similarity
       FROM thinking_chains
       WHERE context = $1
         AND task_type = $2
         AND response_quality >= $4
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $3
       LIMIT $5`,
      [
        context,
        taskType,
        formatForPgVector(embedding),
        CONFIG.MIN_QUALITY_FOR_PRIMING,
        limit,
      ]
    );

    return result.rows
      .filter((row: ThinkingChainRow) => (row.similarity ?? 0) >= CONFIG.MIN_CHAIN_SIMILARITY)
      .map((row: ThinkingChainRow) => rowToThinkingChain(row));
  } catch (error) {
    logger.debug('Failed to find similar chains', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return [];
  }
}

/**
 * Record feedback for a thinking chain
 */
export async function recordThinkingFeedback(
  chainId: string,
  context: AIContext,
  feedback: {
    wasHelpful: boolean;
    qualityRating: 1 | 2 | 3 | 4 | 5;
    feedbackText?: string;
  }
): Promise<void> {
  try {
    const normalizedQuality = feedback.qualityRating / 5;

    await queryContext(
      context,
      `UPDATE thinking_chains
       SET response_quality = $2,
           feedback_text = $3,
           feedback_at = NOW()
       WHERE id = $1`,
      [chainId, normalizedQuality, feedback.feedbackText || null]
    );

    logger.debug('Thinking feedback recorded', {
      chainId,
      quality: normalizedQuality,
    });

    // Trigger strategy optimization (async)
    optimizeBudgetStrategies(context).catch(err => logger.debug('Budget optimization skipped', { context, error: err instanceof Error ? err.message : String(err) }));
  } catch (error) {
    logger.error('Failed to record thinking feedback', error instanceof Error ? error : undefined, {
      chainId,
    });
  }
}

/**
 * Generate priming prompt from successful chains
 */
export function generatePrimingPrompt(similarChains: ThinkingChain[]): string {
  if (similarChains.length === 0) {return '';}

  const insights = similarChains.map((chain, i) => {
    // Extract key reasoning patterns from thinking content
    const keyInsights = extractKeyInsights(chain.thinkingContent);
    return `Strategie ${i + 1} (Qualität: ${((chain.responseQuality || 0) * 100).toFixed(0)}%):\n${keyInsights}`;
  });

  return `
[ERFOLGREICHE DENKSTRATEGIEN FÜR ÄHNLICHE AUFGABEN]
${insights.join('\n\n')}

Nutze diese Strategien als Inspiration, aber entwickle eigenständige Gedanken.
`;
}

/**
 * Extract key insights from thinking content
 */
function extractKeyInsights(thinkingContent: string): string {
  // Take first and last parts (usually contain problem framing and conclusion)
  const lines = thinkingContent.split('\n').filter(l => l.trim().length > 20);

  if (lines.length <= 3) {
    return lines.join('\n');
  }

  // First 2 lines (problem framing) + last 2 lines (conclusion)
  const selected = [
    ...lines.slice(0, 2),
    '...',
    ...lines.slice(-2),
  ];

  return selected.join('\n').substring(0, 500);
}

// ===========================================
// Strategy Optimization (Learning)
// ===========================================

/**
 * Optimize budget strategies based on feedback data
 */
async function optimizeBudgetStrategies(context: AIContext): Promise<void> {
  try {
    // Analyze recent performance by task type
    const result = await queryContext(
      context,
      `SELECT task_type,
              AVG(thinking_tokens_used) as avg_tokens,
              AVG(response_quality) as avg_quality,
              STDDEV(thinking_tokens_used) as std_tokens,
              COUNT(*) as sample_count,
              CORR(thinking_tokens_used, response_quality) as token_quality_correlation
       FROM thinking_chains
       WHERE context = $1
         AND created_at > NOW() - INTERVAL '30 days'
         AND response_quality IS NOT NULL
       GROUP BY task_type
       HAVING COUNT(*) >= 5`,
      [context]
    );

    for (const row of result.rows) {
      const taskType = row.task_type as TaskType;
      const strategy = BUDGET_STRATEGIES[taskType];

      if (!strategy) {continue;}

      const correlation = parseFloat(row.token_quality_correlation) || 0;
      const avgQuality = parseFloat(row.avg_quality) || 0;
      const avgTokens = parseFloat(row.avg_tokens) || strategy.baseTokens;

      // Adjust base tokens based on correlation
      if (correlation > 0.3) {
        // More tokens = better quality -> increase base
        strategy.baseTokens = Math.round(
          strategy.baseTokens + (strategy.baseTokens * CONFIG.LEARNING_RATE)
        );
      } else if (correlation < -0.1 && avgQuality > 0.7) {
        // More tokens doesn't help, quality is good -> can reduce
        strategy.baseTokens = Math.round(
          strategy.baseTokens - (strategy.baseTokens * CONFIG.LEARNING_RATE * 0.5)
        );
      }

      // Adjust based on average quality
      if (avgQuality < 0.6) {
        // Poor quality -> increase complexity multiplier
        strategy.complexityMultiplier = Math.min(
          3.0,
          strategy.complexityMultiplier * (1 + CONFIG.LEARNING_RATE)
        );
      } else if (avgQuality > 0.85 && avgTokens < strategy.baseTokens * 0.7) {
        // Great quality with fewer tokens -> reduce base
        strategy.baseTokens = Math.round(avgTokens * 1.1);
      }

      // Ensure min/max bounds make sense
      strategy.minTokens = Math.max(1000, Math.round(strategy.baseTokens * 0.5));
      strategy.maxTokens = Math.max(strategy.baseTokens * 3, 128000);

      logger.debug('Strategy optimized', {
        taskType,
        newBaseTokens: strategy.baseTokens,
        newMultiplier: strategy.complexityMultiplier,
        correlation,
        avgQuality,
      });
    }
  } catch (error) {
    logger.debug('Strategy optimization failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
}

// ===========================================
// Statistics
// ===========================================

/**
 * Get thinking chain statistics
 */
export async function getThinkingStats(context: AIContext): Promise<{
  totalChains: number;
  avgQuality: number;
  avgTokensUsed: number;
  byTaskType: Record<string, { count: number; avgQuality: number; avgTokens: number }>;
}> {
  try {
    const result = await queryContext(
      context,
      `SELECT
         COUNT(*) as total,
         AVG(response_quality) FILTER (WHERE response_quality IS NOT NULL) as avg_quality,
         AVG(thinking_tokens_used) as avg_tokens
       FROM thinking_chains
       WHERE context = $1`,
      [context]
    );

    const byTypeResult = await queryContext(
      context,
      `SELECT task_type,
              COUNT(*) as count,
              AVG(response_quality) FILTER (WHERE response_quality IS NOT NULL) as avg_quality,
              AVG(thinking_tokens_used) as avg_tokens
       FROM thinking_chains
       WHERE context = $1
       GROUP BY task_type`,
      [context]
    );

    const byTaskType: Record<string, { count: number; avgQuality: number; avgTokens: number }> = {};
    for (const row of byTypeResult.rows) {
      byTaskType[row.task_type] = {
        count: parseInt(row.count, 10) || 0,
        avgQuality: parseFloat(row.avg_quality) || 0,
        avgTokens: parseFloat(row.avg_tokens) || 0,
      };
    }

    const statsRow = result.rows[0];
    return {
      totalChains: statsRow ? parseInt(statsRow.total, 10) || 0 : 0,
      avgQuality: statsRow ? parseFloat(statsRow.avg_quality) || 0 : 0,
      avgTokensUsed: statsRow ? parseFloat(statsRow.avg_tokens) || 0 : 0,
      byTaskType,
    };
  } catch (error) {
    logger.debug('Failed to get thinking stats', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return {
      totalChains: 0,
      avgQuality: 0,
      avgTokensUsed: 0,
      byTaskType: {},
    };
  }
}

// ===========================================
// Helper Functions
// ===========================================

/** Database row type for thinking chains */
interface ThinkingChainRow {
  id: string;
  session_id: string;
  context: AIContext;
  task_type: TaskType;
  input_hash: string;
  input_preview: string;
  thinking_content: string;
  thinking_tokens_used: number;
  response_quality: string | null;
  feedback_text: string | null;
  feedback_at: string | null;
  embedding: string | number[] | null;
  created_at: string;
  similarity?: number;
}

/**
 * Convert database row to ThinkingChain
 */
function rowToThinkingChain(row: ThinkingChainRow): ThinkingChain {
  return {
    id: row.id,
    sessionId: row.session_id,
    context: row.context,
    taskType: row.task_type,
    inputHash: row.input_hash,
    inputPreview: row.input_preview,
    thinkingContent: row.thinking_content,
    thinkingTokensUsed: row.thinking_tokens_used,
    responseQuality: row.response_quality ? parseFloat(row.response_quality) : null,
    feedbackText: row.feedback_text,
    feedbackAt: row.feedback_at ? new Date(row.feedback_at) : null,
    embedding: row.embedding ? parseEmbedding(row.embedding) : null,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Parse embedding from database format
 */
function parseEmbedding(embedding: string | number[]): number[] {
  if (Array.isArray(embedding)) {return embedding;}
  if (typeof embedding === 'string') {
    const cleaned = embedding.replace(/[[\]]/g, '');
    return cleaned.split(',').map(Number);
  }
  return [];
}

// ===========================================
// Exports
// ===========================================

export { BUDGET_STRATEGIES };
