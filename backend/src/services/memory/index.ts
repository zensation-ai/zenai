/**
 * Memory Module Exports
 *
 * HiMeS-inspired memory architecture for the Personal AI Brain.
 * Provides short-term, long-term, and coordinated memory management.
 */

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
} from './long-term-memory';

// Memory coordinator (main entry point)
export {
  memoryCoordinator,
  ContextPart,
  PreparedContext,
  MemorySessionOptions,
} from './memory-coordinator';
