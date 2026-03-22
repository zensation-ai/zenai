/**
 * Multi-Model Orchestrator
 *
 * Routes requests to the optimal model based on complexity, cost,
 * and quality requirements. Tracks token usage and costs.
 *
 * Research: a16z 2025 - 81% of enterprises use 3+ model families.
 * Model lock-in is a risk. Smart routing reduces costs by 40-60%.
 *
 * Routing Logic:
 * - simple_query → Haiku (fast, cheap)
 * - standard_query → Sonnet (balanced)
 * - complex_synthesis → Opus (max quality)
 * - embedding → Ollama (local) or OpenAI (fallback)
 *
 * @module services/model-orchestrator
 */

import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type ModelProvider = 'anthropic' | 'mistral' | 'openai' | 'ollama';

export type ModelTier = 'fast' | 'balanced' | 'premium';

export type QueryComplexity = 'simple' | 'standard' | 'complex';

export interface ModelConfig {
  provider: ModelProvider;
  modelId: string;
  tier: ModelTier;
  /** Cost per 1K input tokens (USD) */
  inputCostPer1K: number;
  /** Cost per 1K output tokens (USD) */
  outputCostPer1K: number;
  /** Max context window */
  maxTokens: number;
  /** Whether this model is currently available */
  available: boolean;
}

export interface RoutingDecision {
  model: ModelConfig;
  reason: string;
  estimatedCost: number;
  complexity: QueryComplexity;
}

export interface UsageRecord {
  modelId: string;
  provider: ModelProvider;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
  context: string;
}

export interface UsageStats {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, { cost: number; calls: number; inputTokens: number; outputTokens: number }>;
  period: { start: number; end: number };
}

export interface OrchestratorConfig {
  /** Monthly budget limit in USD (0 = unlimited) */
  monthlyBudgetUSD: number;
  /** Default tier when complexity is uncertain */
  defaultTier: ModelTier;
  /** Enable cost tracking */
  enableCostTracking: boolean;
  /** Fallback chain order */
  fallbackOrder: ModelProvider[];
}

// ===========================================
// Model Registry
// ===========================================

const MODELS: Record<string, ModelConfig> = {
  'claude-haiku': {
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5-20251001',
    tier: 'fast',
    inputCostPer1K: 0.001,
    outputCostPer1K: 0.005,
    maxTokens: 8192,
    available: true,
  },
  'claude-sonnet': {
    provider: 'anthropic',
    modelId: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    tier: 'balanced',
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015,
    maxTokens: 8192,
    available: true,
  },
  'claude-opus': {
    provider: 'anthropic',
    modelId: 'claude-opus-4-20250514',
    tier: 'premium',
    inputCostPer1K: 0.015,
    outputCostPer1K: 0.075,
    maxTokens: 8192,
    available: true,
  },
  'mistral-small': {
    provider: 'mistral',
    modelId: process.env.MISTRAL_MODEL || 'mistral-small-latest',
    tier: 'fast',
    inputCostPer1K: 0.001,
    outputCostPer1K: 0.003,
    maxTokens: 8192,
    available: !!process.env.MISTRAL_API_KEY,
  },
  'mistral-large': {
    provider: 'mistral',
    modelId: 'mistral-large-latest',
    tier: 'balanced',
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.009,
    maxTokens: 8192,
    available: !!process.env.MISTRAL_API_KEY,
  },
  'ollama-local': {
    provider: 'ollama',
    modelId: 'mistral',
    tier: 'fast',
    inputCostPer1K: 0,
    outputCostPer1K: 0,
    maxTokens: 4096,
    available: !!process.env.OLLAMA_BASE_URL,
  },
};

// ===========================================
// Configuration
// ===========================================

const DEFAULT_CONFIG: OrchestratorConfig = {
  monthlyBudgetUSD: 0, // Unlimited by default
  defaultTier: 'balanced',
  enableCostTracking: true,
  fallbackOrder: ['anthropic', 'mistral', 'ollama'],
};

// ===========================================
// Usage Tracking (in-memory, periodic flush)
// ===========================================

const usageHistory: UsageRecord[] = [];
let currentMonthCost = 0;

// ===========================================
// Complexity Classification
// ===========================================

/**
 * Classify query complexity based on heuristics.
 */
export function classifyComplexity(
  message: string,
  options: {
    hasConversationHistory?: boolean;
    requiresTools?: boolean;
    requiresSynthesis?: boolean;
  } = {}
): QueryComplexity {
  const length = message.length;

  // Explicit complex indicators
  if (options.requiresSynthesis) {return 'complex';}
  if (options.requiresTools && length > 200) {return 'complex';}

  // Simple indicators
  const simplePatterns = [
    /^(ja|nein|ok|danke|bitte|gut|super)\s*[.!?]?$/i,
    /^.{1,30}$/,  // Very short messages
    /^(hallo|hi|hey|guten\s+(morgen|tag|abend))/i,
  ];

  if (simplePatterns.some(p => p.test(message.trim()))) {
    return 'simple';
  }

  // Complex indicators
  const complexPatterns = [
    /analysiere\s+.{20,}/i,
    /vergleiche\s+.{10,}\s+mit\s+/i,
    /erstelle\s+.{10,}\s+(bericht|analyse|strategie|plan)/i,
    /synthes(e|iere)/i,
    /fasse\s+(?:alles )?zusammen/i,
  ];

  if (complexPatterns.some(p => p.test(message))) {
    return 'complex';
  }

  // Medium-length with questions
  if (length > 100 && /\?/.test(message)) {
    return 'standard';
  }

  // Default based on length
  if (length > 300) {return 'standard';}

  return 'simple';
}

// ===========================================
// Model Routing
// ===========================================

/**
 * Select the optimal model for a given query.
 */
export function routeToModel(
  message: string,
  options: {
    complexity?: QueryComplexity;
    preferredTier?: ModelTier;
    requiresTools?: boolean;
    requiresSynthesis?: boolean;
    hasConversationHistory?: boolean;
  } = {},
  config: Partial<OrchestratorConfig> = {}
): RoutingDecision {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const complexity = options.complexity || classifyComplexity(message, options);

  // Check budget
  if (cfg.monthlyBudgetUSD > 0 && currentMonthCost >= cfg.monthlyBudgetUSD) {
    logger.warn('Monthly budget exceeded, routing to cheapest model', {
      budget: cfg.monthlyBudgetUSD,
      spent: currentMonthCost,
    });
    return {
      model: MODELS['ollama-local'].available ? MODELS['ollama-local'] : MODELS['claude-haiku'],
      reason: 'Budget limit reached, using cheapest available model',
      estimatedCost: 0,
      complexity,
    };
  }

  // Determine target tier
  let targetTier: ModelTier;
  if (options.preferredTier) {
    targetTier = options.preferredTier;
  } else {
    switch (complexity) {
      case 'simple':
        targetTier = 'fast';
        break;
      case 'complex':
        targetTier = 'premium';
        break;
      default:
        targetTier = cfg.defaultTier;
    }
  }

  // Find best model for tier
  const model = selectModel(targetTier, cfg.fallbackOrder);
  const estimatedTokens = Math.ceil(message.length / 4); // Rough estimate
  const estimatedCost = (estimatedTokens / 1000) * model.inputCostPer1K +
    (estimatedTokens / 1000) * model.outputCostPer1K;

  const reason = `Complexity: ${complexity} → Tier: ${targetTier} → Model: ${model.modelId}`;

  logger.debug('Model routing decision', {
    complexity,
    targetTier,
    modelId: model.modelId,
    estimatedCost: estimatedCost.toFixed(6),
  });

  return { model, reason, estimatedCost, complexity };
}

function selectModel(tier: ModelTier, fallbackOrder: ModelProvider[]): ModelConfig {
  // Find models matching the tier
  const candidates = Object.values(MODELS).filter(m => m.tier === tier && m.available);

  // Sort by fallback order preference
  candidates.sort((a, b) => {
    const aIdx = fallbackOrder.indexOf(a.provider);
    const bIdx = fallbackOrder.indexOf(b.provider);
    return aIdx - bIdx;
  });

  if (candidates.length > 0) {
    return candidates[0];
  }

  // Fallback: return balanced Sonnet
  return MODELS['claude-sonnet'];
}

// ===========================================
// Usage Tracking
// ===========================================

/**
 * Record token usage for a model call.
 */
export function recordUsage(
  modelId: string,
  provider: ModelProvider,
  inputTokens: number,
  outputTokens: number,
  context: string = 'unknown'
): void {
  const model = Object.values(MODELS).find(m => m.modelId === modelId);
  const cost = model
    ? (inputTokens / 1000) * model.inputCostPer1K + (outputTokens / 1000) * model.outputCostPer1K
    : 0;

  const record: UsageRecord = {
    modelId,
    provider,
    inputTokens,
    outputTokens,
    cost,
    timestamp: Date.now(),
    context,
  };

  usageHistory.push(record);
  currentMonthCost += cost;

  // Keep only last 30 days of history
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  while (usageHistory.length > 0 && usageHistory[0].timestamp < thirtyDaysAgo) {
    usageHistory.shift();
  }

  logger.debug('Usage recorded', {
    modelId,
    inputTokens,
    outputTokens,
    cost: cost.toFixed(6),
    totalMonthCost: currentMonthCost.toFixed(4),
  });
}

/**
 * Get usage statistics for a time period.
 */
export function getUsageStats(periodDays: number = 30): UsageStats {
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const relevantRecords = usageHistory.filter(r => r.timestamp >= cutoff);

  const byModel: UsageStats['byModel'] = {};
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const record of relevantRecords) {
    totalCost += record.cost;
    totalInputTokens += record.inputTokens;
    totalOutputTokens += record.outputTokens;

    if (!byModel[record.modelId]) {
      byModel[record.modelId] = { cost: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
    }
    byModel[record.modelId].cost += record.cost;
    byModel[record.modelId].calls++;
    byModel[record.modelId].inputTokens += record.inputTokens;
    byModel[record.modelId].outputTokens += record.outputTokens;
  }

  return {
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    byModel,
    period: { start: cutoff, end: Date.now() },
  };
}

/**
 * Get the current monthly spend.
 */
export function getCurrentMonthSpend(): number {
  return currentMonthCost;
}

/**
 * Get all registered model configurations.
 */
export function getRegisteredModels(): ModelConfig[] {
  return Object.values(MODELS);
}

/**
 * Reset usage tracking (for testing).
 */
export function resetUsageTracking(): void {
  usageHistory.length = 0;
  currentMonthCost = 0;
}
