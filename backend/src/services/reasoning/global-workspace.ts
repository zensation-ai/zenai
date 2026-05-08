/**
 * Global Workspace Theory (GWT) Engine
 * Phase 127, Task 2
 *
 * Implements a competitive context assembly system inspired by Global Workspace Theory
 * (Baars, 1988). Modules compete for a limited "cognitive broadcast" — the context
 * window that is injected into Claude's system prompt.
 *
 * Key behaviours:
 * - CoreMemory module is always included (reserved token budget)
 * - All other modules compute salience in parallel (2 s timeout)
 * - Top N modules by salience win the remaining token budget
 * - Token budget is split proportionally by salience score
 * - Fallback: if all modules score below threshold, top 2 are selected anyway
 *
 * @module services/reasoning/global-workspace
 */

import { logger } from '../../utils/logger';
import { evaluateIgnitionWithHysteresis, type ModuleActivation, type IgnitionResult } from './gwt-ignition';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface QueryAnalysis {
  /** High-level intent of the user's message */
  intent: 'question' | 'task' | 'discussion' | 'creative' | 'recall';
  /** Detected domain: 'general' | 'operations' | 'finance' | 'code' | 'finance' | … */
  domain: string;
  /** Normalised complexity 0–1 */
  complexity: number;
  /** Whether the query refers to a past, present, or future time frame */
  temporalReference: 'past' | 'present' | 'future' | null;
  /** Named entities detected in the query */
  entityMentions: string[];
  /** True when the user is continuing a previous topic */
  isFollowUp: boolean;
  /** Descriptive expected output type: 'text' | 'code' | 'list' | … */
  expectedOutputType: string;
  /** ISO 639-1 language code */
  language: string;
}

export interface SalienceResult {
  /** Normalised relevance score 0–1 */
  score: number;
  /** Short human-readable reason (used for debugging / logging) */
  reasoning: string;
  /** Module's own estimate of how many tokens it needs */
  estimatedTokens: number;
}

export interface ModuleContext {
  /** One of: 'operations' | 'finance' | 'people' | 'strategy' */
  aiContext: string;
  userId: string;
  sessionId: string;
}

export interface WorkspaceModule {
  id: string;
  name: string;
  /** When true the module is always selected, regardless of salience score */
  alwaysInclude: boolean;
  computeSalience(
    query: string,
    analysis: QueryAnalysis,
    context: ModuleContext,
  ): Promise<SalienceResult>;
  generateContent(
    query: string,
    tokenBudget: number,
    context: ModuleContext,
  ): Promise<string>;
}

export interface GWTConfig {
  /** Maximum total tokens available for all modules combined */
  maxTotalTokens: number;
  /** Tokens reserved for always-include modules (shared evenly among them) */
  reservedTokens: number;
  /** Per-module salience/generation timeout in milliseconds */
  moduleTimeoutMs: number;
  /** Maximum number of competitive (non-always-include) modules to select */
  maxModules: number;
  /** If the best competitive salience is below this threshold, trigger fallback */
  fallbackThreshold: number;
}

export const DEFAULT_GWT_CONFIG: GWTConfig = {
  maxTotalTokens: 12000,
  reservedTokens: 600,
  moduleTimeoutMs: 2000,
  maxModules: 4,
  fallbackThreshold: 0.2,
};

export interface GWTResult {
  /** All module outputs concatenated (always-include first, then competitive) */
  assembledContext: string;
  /** IDs of modules whose content appears in assembledContext */
  selectedModules: string[];
  /** Salience score for every module (failed/timed-out modules get 0) */
  salienceScores: Record<string, number>;
  /** Approximate total tokens used */
  tokenUsage: number;
  /** True if all competitive modules scored below fallbackThreshold */
  usedFallback: boolean;
  /** GWT ignition result with hysteresis (Nature 2025) */
  ignition?: IgnitionResult;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Wraps a promise with a timeout that resolves to `fallback` on expiry */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const FALLBACK_SALIENCE: SalienceResult = {
  score: 0,
  reasoning: 'timeout or error',
  estimatedTokens: 0,
};

// ─── GlobalWorkspace class ────────────────────────────────────────────────────

export class GlobalWorkspace {
  private readonly modules: WorkspaceModule[];
  private readonly config: GWTConfig;
  /** Track previously broadcasting modules for hysteresis stability */
  private previouslyBroadcasting: string[] = [];
  /** Optional PriorityMap scorer for blended salience adjustment */
  private priorityScorer?: {
    score(input: {
      saliency: number;
      emotionalValence: number;
      rewardRelevance: number;
      goalAlignment: number;
    }): { composite: number };
  };

  constructor(modules: WorkspaceModule[], config: Partial<GWTConfig> = {}) {
    this.modules = modules;
    this.config = { ...DEFAULT_GWT_CONFIG, ...config };
  }

  /**
   * Attach a PriorityMap scorer to adjust module salience during competition.
   * When set, each competitive module's salience is blended: 70% original + 30% PriorityMap composite.
   * Always-include modules are unaffected.
   * Pass `undefined` to remove the scorer.
   */
  setPriorityScorer(
    scorer:
      | {
          score(input: {
            saliency: number;
            emotionalValence: number;
            rewardRelevance: number;
            goalAlignment: number;
          }): { composite: number };
        }
      | undefined,
  ): void {
    this.priorityScorer = scorer;
  }

  /**
   * Assembles a context string by competitively selecting modules.
   *
   * Algorithm:
   * 1. Compute salience for all modules in parallel (with timeout + error guard)
   * 2. Separate always-include from competitive modules
   * 3. Sort competitive modules by salience (desc)
   * 4. Determine if fallback applies (best score < threshold)
   * 5. Select top N competitive modules
   * 6. Allocate token budget (reserved for always-include, proportional for competitive)
   * 7. Generate content for all selected modules in parallel
   * 8. Concatenate: always-include first, then competitive
   */
  async assembleContext(
    query: string,
    analysis: QueryAnalysis,
    moduleContext: ModuleContext,
  ): Promise<GWTResult> {
    if (this.modules.length === 0) {
      return {
        assembledContext: '',
        selectedModules: [],
        salienceScores: {},
        tokenUsage: 0,
        usedFallback: false,
      };
    }

    // ── Step 1: Compute salience for all modules in parallel ──────────────────
    const saliencePromises = this.modules.map(async mod => {
      const result = await withTimeout(
        mod.computeSalience(query, analysis, moduleContext).catch(err => {
          logger.warn('GWT: module salience error', { moduleId: mod.id, error: String(err) });
          return FALLBACK_SALIENCE;
        }),
        this.config.moduleTimeoutMs,
        FALLBACK_SALIENCE,
      );
      return { module: mod, salience: result };
    });

    const salienceResults = await Promise.all(saliencePromises);

    // Build the full salienceScores map
    const salienceScores: Record<string, number> = {};
    for (const { module, salience } of salienceResults) {
      salienceScores[module.id] = salience.score;
    }

    // PMA: Apply PriorityMap adjustment to salience scores
    if (this.priorityScorer) {
      for (const { module, salience } of salienceResults) {
        if (module.alwaysInclude) continue; // Don't modify always-include modules
        const pmScore = this.priorityScorer.score({
          saliency: salience.score,
          emotionalValence: 0, // Module-level emotional relevance not available yet
          rewardRelevance: 0.5, // Neutral default
          goalAlignment: salience.score, // Use salience as proxy for goal alignment
        });
        // Blend: 70% original salience + 30% PriorityMap composite
        const adjusted = 0.7 * salience.score + 0.3 * pmScore.composite;
        salienceScores[module.id] = adjusted;
        salience.score = adjusted; // Update for downstream sorting
      }
    }

    // ── Step 2: Separate always-include from competitive ──────────────────────
    const alwaysModules = salienceResults.filter(r => r.module.alwaysInclude);
    const competitiveModules = salienceResults
      .filter(r => !r.module.alwaysInclude)
      .sort((a, b) => b.salience.score - a.salience.score);

    // ── Step 3 & 4: GWT Ignition with hysteresis (Nature 2025) ──────────────
    // Use ignition threshold to determine which modules achieve broadcast status
    const ignitionModules: ModuleActivation[] = competitiveModules.map(r => ({
      id: r.module.id,
      activation: r.salience.score,
    }));

    const ignitionResult = evaluateIgnitionWithHysteresis(
      ignitionModules,
      this.previouslyBroadcasting,
    );

    // Modules that pass ignition threshold are selected; others filtered out
    const ignitedIds = new Set(ignitionResult.broadcast);
    let selectedCompetitive = competitiveModules.filter(r => ignitedIds.has(r.module.id));

    // Fallback: if ignition is too restrictive, fall back to top-N by salience
    const bestScore = competitiveModules[0]?.salience.score ?? 0;
    const usedFallback = selectedCompetitive.length === 0 && competitiveModules.length > 0;

    if (usedFallback || selectedCompetitive.length === 0) {
      selectedCompetitive = competitiveModules.slice(0, this.config.maxModules);
    } else {
      selectedCompetitive = selectedCompetitive.slice(0, this.config.maxModules);
    }

    // When fallback is triggered, ensure at least 2 competitive modules are selected
    if (usedFallback && selectedCompetitive.length < 2 && competitiveModules.length >= 2) {
      selectedCompetitive = competitiveModules.slice(0, 2);
    }

    // Update hysteresis state for next call
    this.previouslyBroadcasting = selectedCompetitive.map(r => r.module.id);

    // ── Step 5: Token budget allocation ──────────────────────────────────────
    const numAlways = alwaysModules.length;
    const perAlwaysBudget = numAlways > 0
      ? Math.floor(this.config.reservedTokens / numAlways)
      : 0;

    const remainingTokens = this.config.maxTotalTokens - this.config.reservedTokens;

    // Proportional allocation for competitive modules by salience score
    const competitiveScoreSum = selectedCompetitive.reduce(
      (acc, r) => acc + Math.max(r.salience.score, 0.01), // avoid divide-by-zero
      0,
    );

    const competitiveBudgets = selectedCompetitive.map(r => ({
      module: r.module,
      budget: competitiveScoreSum > 0
        ? Math.floor((Math.max(r.salience.score, 0.01) / competitiveScoreSum) * remainingTokens)
        : Math.floor(remainingTokens / Math.max(selectedCompetitive.length, 1)),
    }));

    // ── Step 6: Generate content in parallel ──────────────────────────────────
    const EMPTY_CONTENT = '';

    const generateAlways = alwaysModules.map(async ({ module }) => {
      const content = await withTimeout(
        module.generateContent(query, perAlwaysBudget, moduleContext).catch(err => {
          logger.warn('GWT: always-include content error', { moduleId: module.id, error: String(err) });
          return EMPTY_CONTENT;
        }),
        this.config.moduleTimeoutMs,
        EMPTY_CONTENT,
      );
      return { moduleId: module.id, content };
    });

    const generateCompetitive = competitiveBudgets.map(async ({ module, budget }) => {
      const content = await withTimeout(
        module.generateContent(query, budget, moduleContext).catch(err => {
          logger.warn('GWT: competitive content error', { moduleId: module.id, error: String(err) });
          return EMPTY_CONTENT;
        }),
        this.config.moduleTimeoutMs,
        EMPTY_CONTENT,
      );
      return { moduleId: module.id, content };
    });

    const [alwaysContents, competitiveContents] = await Promise.all([
      Promise.all(generateAlways),
      Promise.all(generateCompetitive),
    ]);

    // ── Step 7: Assemble final context ────────────────────────────────────────
    const allContents = [...alwaysContents, ...competitiveContents];
    const nonEmpty = allContents.filter(c => c.content.trim().length > 0);
    const assembledContext = nonEmpty.map(c => c.content).join('\n\n');

    const selectedModules = [
      ...alwaysModules.map(r => r.module.id),
      ...selectedCompetitive.map(r => r.module.id),
    ];

    // Rough token estimate: 1 token ≈ 4 chars
    const tokenUsage = Math.ceil(assembledContext.length / 4);

    logger.debug('GWT: context assembled', {
      selectedModules,
      usedFallback,
      tokenUsage,
      bestScore,
    });

    return {
      assembledContext,
      selectedModules,
      salienceScores,
      tokenUsage,
      usedFallback,
      ignition: ignitionResult,
    };
  }
}
