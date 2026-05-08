/**
 * Long-Term Memory Types
 *
 * Extracted to break circular dependency between long-term-memory.ts,
 * ltm-consolidation.ts, and ltm-search.ts.
 *
 * @module services/memory/ltm-types
 */

import type { AIContext } from '../../utils/database-context';

/**
 * Decay class controlling how quickly a fact loses relevance.
 */
export type DecayClass = 'permanent' | 'slow_decay' | 'normal_decay' | 'fast_decay';

export interface PersonalizationFact {
  id: string;
  factType: 'preference' | 'behavior' | 'knowledge' | 'goal' | 'context';
  content: string;
  confidence: number;
  source: 'explicit' | 'inferred' | 'consolidated';
  firstSeen: Date;
  lastConfirmed: Date;
  occurrences: number;
  embedding?: number[];
  /** How often this fact has been retrieved and used (for composite scoring) */
  retrievalCount: number;
  /** When this fact was last retrieved (for recency scoring) */
  lastRetrieved: Date | null;
  /** Graduated decay class controlling decay speed */
  decayClass: DecayClass;
}

export interface FrequentPattern {
  id: string;
  patternType: 'topic' | 'action' | 'time' | 'style';
  pattern: string;
  frequency: number;
  lastUsed: Date;
  associatedTopics: string[];
  confidence: number;
}

export interface SignificantInteraction {
  id: string;
  summary: string;
  topics: string[];
  outcome: string;
  timestamp: Date;
  significance: number;
}

export interface LongTermMemory {
  context: AIContext;
  facts: PersonalizationFact[];
  frequentPatterns: FrequentPattern[];
  significantInteractions: SignificantInteraction[];
  profileEmbedding: number[];
  lastConsolidation: Date;
  consolidationCount: number;
}

export interface LongTermRetrievalResult {
  facts: PersonalizationFact[];
  patterns: FrequentPattern[];
  relevantInteractions: SignificantInteraction[];
  contextualMemory: string;
}

export interface ConsolidationResult {
  patternsAdded: number;
  factsAdded: number;
  factsUpdated: number;
  interactionsStored: number;
}

/** Conversation message structure for memory processing */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

/** Session with messages for consolidation */
export interface SessionWithMessages {
  id: string;
  messages: ConversationMessage[];
  metadata: Record<string, unknown>;
  summary?: string;
}
