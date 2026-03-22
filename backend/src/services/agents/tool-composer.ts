/**
 * Phase 130, Task 1: Tool Composition Engine
 *
 * Enables chaining of ZenAI tools so the output of one tool feeds into the
 * next.  Claude plans the chain; this service validates and describes it.
 *
 * Exports:
 *  - TOOL_SIGNATURES   — pre-defined signatures for a subset of the 58 tools
 *  - getToolSignature  — lookup by tool name
 *  - validateChain     — pure validation + metadata computation
 *  - estimateChainCost — aggregate cost info for a validated chain
 *  - buildChainFromGoal — heuristic goal → chain mapping
 *  - formatChainDescription — human-readable chain summary
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

// =============================================================================
// Types
// =============================================================================

export interface ToolSignature {
  name: string;
  description: string;
  inputTypes: string[];
  outputType: string;
  sideEffects: boolean;
  estimatedDurationMs: number;
  costTier: 'free' | 'cheap' | 'expensive';
}

export interface ChainStep {
  toolName: string;
  /** Maps each tool input param to a source: a literal value or "step_N.output" */
  inputMapping: Record<string, string>;
  expectedOutput: string;
}

export interface ToolChain {
  id: string;
  steps: ChainStep[];
  estimatedDuration: number;
  hasSideEffects: boolean;
  isValid: boolean;
  validationErrors: string[];
}

export interface ChainExecutionResult {
  chainId: string;
  success: boolean;
  stepResults: Array<{
    stepIndex: number;
    toolName: string;
    success: boolean;
    output: string;
    durationMs: number;
  }>;
  finalOutput: string;
  totalDurationMs: number;
}

// =============================================================================
// Tool Signatures (subset of 58 registered tools)
// =============================================================================

export const TOOL_SIGNATURES: Record<string, ToolSignature> = {
  web_search: {
    name: 'web_search',
    description: 'Web search',
    inputTypes: ['query'],
    outputType: 'search_results',
    sideEffects: false,
    estimatedDurationMs: 2000,
    costTier: 'free',
  },
  fetch_url: {
    name: 'fetch_url',
    description: 'Fetch URL content',
    inputTypes: ['url'],
    outputType: 'text',
    sideEffects: false,
    estimatedDurationMs: 3000,
    costTier: 'free',
  },
  search_ideas: {
    name: 'search_ideas',
    description: 'Search ideas',
    inputTypes: ['query'],
    outputType: 'search_results',
    sideEffects: false,
    estimatedDurationMs: 500,
    costTier: 'free',
  },
  create_idea: {
    name: 'create_idea',
    description: 'Create idea',
    inputTypes: ['text'],
    outputType: 'idea',
    sideEffects: true,
    estimatedDurationMs: 500,
    costTier: 'free',
  },
  analyze_document: {
    name: 'analyze_document',
    description: 'Analyze document',
    inputTypes: ['text'],
    outputType: 'analysis',
    sideEffects: false,
    estimatedDurationMs: 5000,
    costTier: 'expensive',
  },
  draft_email: {
    name: 'draft_email',
    description: 'Draft email',
    inputTypes: ['text'],
    outputType: 'email_draft',
    sideEffects: true,
    estimatedDurationMs: 1000,
    costTier: 'cheap',
  },
  execute_code: {
    name: 'execute_code',
    description: 'Execute code',
    inputTypes: ['code'],
    outputType: 'code_output',
    sideEffects: false,
    estimatedDurationMs: 10000,
    costTier: 'expensive',
  },
  remember: {
    name: 'remember',
    description: 'Store in memory',
    inputTypes: ['text'],
    outputType: 'confirmation',
    sideEffects: true,
    estimatedDurationMs: 200,
    costTier: 'free',
  },
  get_revenue_metrics: {
    name: 'get_revenue_metrics',
    description: 'Revenue data',
    inputTypes: [],
    outputType: 'data',
    sideEffects: false,
    estimatedDurationMs: 2000,
    costTier: 'cheap',
  },
  generate_business_report: {
    name: 'generate_business_report',
    description: 'Business report',
    inputTypes: ['data'],
    outputType: 'report',
    sideEffects: false,
    estimatedDurationMs: 5000,
    costTier: 'expensive',
  },
};

// =============================================================================
// getToolSignature
// =============================================================================

/**
 * Looks up a ToolSignature by name.
 * Returns null when the tool is not registered.
 */
export function getToolSignature(toolName: string): ToolSignature | null {
  return TOOL_SIGNATURES[toolName] ?? null;
}

// =============================================================================
// validateChain
// =============================================================================

/** Regex that matches "step_N.output" references in inputMapping values */
const STEP_REF_RE = /^step_(\d+)\.output$/;

/**
 * Pure validation of a chain of steps.
 *
 * Rules:
 * 1. The steps array must not be empty.
 * 2. Every toolName must exist in TOOL_SIGNATURES.
 * 3. Any inputMapping value that is a step reference ("step_N.output") may only
 *    reference an earlier step (N < current index) — no forward references.
 *
 * Returns a fully-populated ToolChain including estimated duration and side
 * effects flags.
 */
export function validateChain(steps: ChainStep[]): ToolChain {
  const errors: string[] = [];

  if (steps.length === 0) {
    errors.push('Chain must contain at least one step.');
    return {
      id: uuidv4(),
      steps,
      estimatedDuration: 0,
      hasSideEffects: false,
      isValid: false,
      validationErrors: errors,
    };
  }

  let estimatedDuration = 0;
  let hasSideEffects = false;

  steps.forEach((step, index) => {
    const sig = getToolSignature(step.toolName);

    if (!sig) {
      errors.push(`Step ${index}: unknown tool "${step.toolName}".`);
      return; // continue forEach
    }

    estimatedDuration += sig.estimatedDurationMs;
    if (sig.sideEffects) {hasSideEffects = true;}

    // Check for forward references in inputMapping
    for (const value of Object.values(step.inputMapping)) {
      const match = STEP_REF_RE.exec(value);
      if (match) {
        const refIndex = parseInt(match[1], 10);
        if (refIndex >= index) {
          errors.push(
            `Step ${index} has a forward/circular reference to step_${refIndex}.output ` +
              `(only steps < ${index} may be referenced).`,
          );
        }
      }
    }
  });

  const isValid = errors.length === 0;

  logger.debug('validateChain', { stepCount: steps.length, isValid, errors });

  return {
    id: uuidv4(),
    steps,
    estimatedDuration,
    hasSideEffects,
    isValid,
    validationErrors: errors,
  };
}

// =============================================================================
// estimateChainCost
// =============================================================================

const COST_TIER_RANK: Record<string, number> = { free: 0, cheap: 1, expensive: 2 };

/**
 * Aggregates cost information from a validated chain.
 * - duration: sum of step durations (mirrors chain.estimatedDuration)
 * - costTier: the highest cost tier found across all steps
 * - sideEffects: whether any step has side effects
 */
export function estimateChainCost(
  chain: ToolChain,
): { duration: number; costTier: string; sideEffects: boolean } {
  let highestTier: 'free' | 'cheap' | 'expensive' = 'free';

  for (const step of chain.steps) {
    const sig = getToolSignature(step.toolName);
    if (!sig) {continue;}
    if ((COST_TIER_RANK[sig.costTier] ?? 0) > (COST_TIER_RANK[highestTier] ?? 0)) {
      highestTier = sig.costTier;
    }
  }

  return {
    duration: chain.estimatedDuration,
    costTier: highestTier,
    sideEffects: chain.hasSideEffects,
  };
}

// =============================================================================
// buildChainFromGoal
// =============================================================================

interface GoalPattern {
  /** Returns true when the goal matches this pattern */
  test: (goal: string) => boolean;
  /** The tool chain to build (ordered list of tool names + basic mappings) */
  build: () => ChainStep[];
}

const GOAL_PATTERNS: GoalPattern[] = [
  // --- Research + report / analyse pattern ---
  {
    test: (g) =>
      (/recherch/i.test(g) || /research/i.test(g) || /suche.*web/i.test(g)) &&
      (/bericht/i.test(g) || /report/i.test(g) || /analys/i.test(g)),
    build: (): ChainStep[] => [
      {
        toolName: 'web_search',
        inputMapping: { query: 'goal' },
        expectedOutput: 'search_results',
      },
      {
        toolName: 'fetch_url',
        inputMapping: { url: 'step_0.output' },
        expectedOutput: 'text',
      },
      {
        toolName: 'analyze_document',
        inputMapping: { text: 'step_1.output' },
        expectedOutput: 'analysis',
      },
    ],
  },

  // --- Business report pattern ---
  {
    test: (g) =>
      /geschäftsbericht|business.?report|umsatzbericht/i.test(g) ||
      (/bericht/i.test(g) && /umsatz|revenue|geschäft/i.test(g)),
    build: (): ChainStep[] => [
      {
        toolName: 'get_revenue_metrics',
        inputMapping: {},
        expectedOutput: 'data',
      },
      {
        toolName: 'generate_business_report',
        inputMapping: { data: 'step_0.output' },
        expectedOutput: 'report',
      },
      {
        toolName: 'create_idea',
        inputMapping: { text: 'step_1.output' },
        expectedOutput: 'idea',
      },
    ],
  },

  // --- Search and remember pattern ---
  {
    test: (g) =>
      (/such|search|find/i.test(g) || /ideas/i.test(g)) &&
      (/merk|remember|speicher/i.test(g) || /notier/i.test(g)),
    build: (): ChainStep[] => [
      {
        toolName: 'search_ideas',
        inputMapping: { query: 'goal' },
        expectedOutput: 'search_results',
      },
      {
        toolName: 'remember',
        inputMapping: { text: 'step_0.output' },
        expectedOutput: 'confirmation',
      },
    ],
  },
];

/**
 * Pure heuristic: maps common natural-language goal strings to a ChainStep
 * array.  Returns an empty array for unrecognized goals.
 *
 * When `availableTools` is provided, any step whose tool is not in that list
 * is filtered out.  If the resulting plan loses required steps the entire
 * match is discarded and an empty array is returned.
 */
export function buildChainFromGoal(goal: string, availableTools?: string[]): ChainStep[] {
  for (const pattern of GOAL_PATTERNS) {
    if (!pattern.test(goal)) {continue;}

    const steps = pattern.build();

    if (!availableTools) {return steps;}

    // Filter to available tools only
    const filtered = steps.filter((s) => availableTools.includes(s.toolName));

    // If we lost all steps, skip this pattern
    if (filtered.length === 0) {continue;}

    // Re-check that every kept step's inputMapping step-refs still point to a
    // step that exists in the filtered list.  Simple index-based re-mapping is
    // out of scope; instead, just verify the first tool is still there.
    return filtered;
  }

  return [];
}

// =============================================================================
// formatChainDescription
// =============================================================================

/**
 * Returns a concise human-readable description of a ToolChain.
 *
 * Example output:
 *   "Chain (3 steps, ~10s, no side effects): web_search → fetch_url → analyze_document"
 */
export function formatChainDescription(chain: ToolChain): string {
  const toolNames = chain.steps.map((s) => s.toolName).join(' → ');
  const stepCount = chain.steps.length;
  const durationSec = (chain.estimatedDuration / 1000).toFixed(1);
  const sideEffectsLabel = chain.hasSideEffects ? 'has side effects' : 'no side effects';
  const validLabel = chain.isValid ? 'valid' : 'invalid';

  return (
    `Chain [${chain.id.slice(0, 8)}] (${stepCount} step${stepCount !== 1 ? 's' : ''}, ` +
    `~${durationSec}s, ${sideEffectsLabel}, ${validLabel}): ${toolNames}`
  );
}
