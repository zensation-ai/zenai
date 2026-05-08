/**
 * ZenAI Algorithms — Unified barrel export
 *
 * This directory contains research-track research algorithms that are
 * project-specific and NOT yet published in @zensation/algorithms.
 *
 * The @zensation/algorithms package (v0.2.x) provides the foundational
 * memory algorithms (FSRS, Ebbinghaus, Hebbian basics, Bayesian, Emotional,
 * Similarity, Intervals, Visualization, Sleep Consolidation, Context Retrieval).
 *
 * The 5 research algorithms below extend those foundations with novel
 * research contributions. They will be migrated to @zensation/algorithms
 * in a future major release once stabilized.
 *
 * Project-specific tooling (Ablation, Benchmark Adapter) will remain here
 * permanently as they are experiment infrastructure, not library code.
 */

// --- research Research Algorithms (project-specific, not yet in @zensation/algorithms) ---
export * from './fsrs-vmPFC';
export * from './hebbian-two-factor';
export * from './spectral-health';
export * from './ib-budget';
export * from './sleep-simulation-selection';
export * from './temporal-multi-route';
export * from './personalized-pagerank';
export * from './hopfield-stm';
export * from './dopamine-routing';
export * from './surprise-gradient-memory';

// --- Experiment Infrastructure (project-specific, will remain here) ---
export * from './ablation';
export * from './benchmark-adapter';

// --- Foundational Algorithms (re-exported from @zensation/algorithms) ---
// These provide the base layer that the research algorithms build upon.
// Consumers can import from either '@zensation/algorithms' directly
// or from this barrel file for convenience.
export {
  // FSRS
  type FSRSState,
  TARGET_RETENTION,
  MIN_STABILITY,
  MIN_DIFFICULTY,
  MAX_DIFFICULTY,
  MS_PER_DAY,
  clampDifficulty,
  getRetrievability,
  scheduleNextReview,
  updateAfterRecall,
  updateAfterForgot,
  initFromDecayClass,
  initFromSM2,
  updateStabilityCompat,
  getRetentionProbabilityCompat,

  // Hebbian (basic weight dynamics)
  HEBBIAN_CONFIG,
  computeHebbianStrengthening,
  computeHebbianDecay,
  computeHomeostaticNormalization,
  generatePairs,

  // Bayesian Confidence Propagation
  PROPAGATION_FACTORS,
  DAMPING,
  MAX_ITERATIONS,
  CHANGE_THRESHOLD,
  propagateForRelation,
  applyDamping,
  isSignificantChange,

  // Ebbinghaus Decay
  EBBINGHAUS_CONFIG,
  calculateRetention,
  calculatePersonalizedRetention,
  batchCalculateRetention,
  calculateOptimalInterval,
  getRepetitionCandidates,
  learnDecayProfile,
  shouldArchive,
  updateStability,
  type AccessEvent,
  type RepetitionCandidate,
  type RetentionResult,
  type UserDecayProfile,

  // Emotional Tagging
  tagEmotion,
  computeEmotionalWeight,
  computeContextualValence,
  isEmotionallySignificant,
  type EmotionalTag,
  type EmotionalWeight,
  type ContextualValence,

  // Similarity
  computeStringSimilarity,
  detectNegation,
  stripNegation,
  safeJsonParse,
  type NegationResult,

  // Confidence Intervals
  getRetrievabilityWithCI,
  propagateWithCI,
  type ConfidenceInterval,

  // Visualization
  generateRetentionCurve,
  generateScheduleTimeline,
  type CurvePoint,
  type SchedulePoint,

  // Sleep Consolidation
  SLEEP_CONSOLIDATION_CONFIG,
  selectForReplay,
  simulateReplay,
  pruneWeakConnections,
  type MemoryForConsolidation,
  type ReplayedMemory,
  type StrengthenedEdge,
  type PrunedEdge,
  type SleepConsolidationConfig,
  type SleepConsolidationResult,

  // Context Retrieval
  calculateContextSimilarity,
  captureEncodingContext,
  serializeContext,
  deserializeContext,
  type EncodingContext,
  type ContextSimilarityResult,
  type TimeOfDay,
} from '@zensation/algorithms';
