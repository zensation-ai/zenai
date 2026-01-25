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
} from './long-term-memory';

// Memory coordinator (main entry point)
export {
  memoryCoordinator,
  ContextPart,
  PreparedContext,
  EnhancedPreparedContext,
  MemorySessionOptions,
} from './memory-coordinator';
