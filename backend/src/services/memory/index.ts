/**
 * Memory Module Exports
 *
 * HiMeS-inspired 4-Layer memory architecture for the Personal AI Brain.
 *
 * Memory Layers:
 * 1. Working Memory - Active task focus (Prefrontal Cortex)
 * 2. Episodic Memory - Concrete experiences (Hippocampus)
 * 3. Short-Term Memory - Session context (Hippocampus)
 * 4. Long-Term Memory - Persistent knowledge (Neocortex)
 */

// Working memory (active task focus)
export {
  workingMemory,
  WorkingMemorySlot,
  WorkingMemoryState,
  SlotType,
} from './working-memory';

// Episodic memory (concrete experiences)
export {
  episodicMemory,
  Episode,
  EpisodicRetrievalOptions,
  EpisodicConsolidationResult,
} from './episodic-memory';

// Short-term memory (session-based)
export {
  shortTermMemory,
  Interaction,
  PreRetrievedDocument,
  ShortTermMemory,
  EnrichedContext,
} from './short-term-memory';

// Long-term memory (persistent)
export {
  longTermMemory,
  PersonalizationFact,
  FrequentPattern,
  SignificantInteraction,
  LongTermMemory,
  LongTermRetrievalResult,
  ConsolidationResult,
  DecayClass,
} from './long-term-memory';

// Memory coordinator (main entry point)
export {
  memoryCoordinator,
  ContextPart,
  PreparedContext,
  EnhancedPreparedContext,
  MemorySessionOptions,
} from './memory-coordinator';

// Memory scheduler (cron jobs for consolidation and decay)
export {
  memoryScheduler,
  startMemoryScheduler,
  stopMemoryScheduler,
  ScheduledTask,
  SchedulerStats,
  ConsolidationStats,
} from './memory-scheduler';

// Implicit feedback tracking (learning from user behavior)
export {
  implicitFeedback,
  ImplicitFeedbackEvent,
  FeedbackSignal,
  SessionFeedbackStats,
} from './implicit-feedback';

// Cross-context insight sharing
export {
  crossContextSharing,
  SharedInsight,
  SharingResult,
} from './cross-context-sharing';

// Reflection & Metacognition
export {
  reflectionEngine,
  ReflectionInsight,
  ReflectionType,
  SessionReflection,
} from './reflection-engine';

// Memory Governance & GDPR
export {
  memoryGovernance,
  MemoryPrivacySettings,
  MemoryDeletionResult,
  MemoryExport,
  MemoryAuditEntry,
  MemoryLayer,
} from './memory-governance';

// Phase 145: Predictive Memory Architecture (PMA)
export { NeuromodulatorEngine } from './neuromodulator-engine';
export type { NeuromodulatorState, ModulationParams, NeuroEvent, EventType } from './neuromodulator-engine';
export { ReconsolidationEngine, reconsolidationEngine } from './reconsolidation-engine';
export type { ReconsolidationResult, LabilityWindow, UpdateMode } from './reconsolidation-engine';
export { TripleCopyMemory } from './triple-copy-memory';
export type { MemoryCopy, StoreResult } from './triple-copy-memory';
export { priorityMap, PriorityMap, bridgeEmotionalTagger } from './priority-map';
export type { PriorityInput, PriorityScore, NeuroState } from './priority-map';
export { StabilityProtector } from './stability-protector';
export { metacognitiveMonitor, MetacognitiveMonitor } from './metacognitive-monitor';
export type { BiasMetrics, EfficiencyTrend } from './metacognitive-monitor';
