/**
 * Memory Coordinator Types
 *
 * Extracted to break circular dependency between memory-coordinator.ts
 * and memory-stats.ts.
 *
 * @module services/memory/memory-types
 */

export interface ContextPart {
  type: 'summary' | 'fact' | 'pattern' | 'document' | 'interaction' | 'hint' | 'episode' | 'working';
  content: string;
  relevance: number;
  source: 'short_term' | 'long_term' | 'pre_retrieved' | 'episodic' | 'working' | 'knowledge_graph';
  timestamp?: number;
}
