/**
 * Advanced Knowledge Graph Service
 *
 * Uses PostgreSQL for relationship storage.
 * Analyzes connections between ideas using LLM.
 * Supports full graph visualization and context-aware queries.
 */

// Core: Types, relationship analysis, storage
export {
  type IdeaRelation,
  type RelationType,
  type SuggestedConnection,
  VALID_RELATION_TYPES,
  RELATION_TYPE_METADATA,
  analyzeRelationships,
  getRelationships,
  getSuggestedConnections,
  getGraphStats,
} from './graph-core';

// Visualization: Full graph, subgraph, layout, multi-hop
export {
  type MultiHopPath,
  type GraphNode,
  type GraphEdge,
  type GraphData,
  multiHopSearch,
  getFullGraph,
  getSubgraph,
  calculateLayout,
} from './graph-visualization';

// Analytics: Discovery, analytics, graph-enhanced retrieval
export {
  type GraphRetrievalResult,
  type GraphRetrievalOptions,
  discoverAllRelationships,
  getGraphAnalytics,
  graphEnhancedRetrieval,
} from './graph-analytics';

// Re-export Evolution Module (Phase 3)
export {
  // Temporal Edge Management
  applyGraphDecay,
  reinforceRelation,
  getRelationsAtTime,
  getRelationHistory,
  // Auto-Discovery
  discoverRelationsForIdea,
  processDiscoveryQueue,
  queueForDiscovery,
  // Pattern Discovery
  storePattern,
  getActivePatterns,
  // Analytics
  getGraphEvolutionStats,
  runGraphEvolutionCycle,
  // Types
  TemporalEdge,
  RelationChange,
  DiscoveredPattern,
  AutoDiscoveryResult,
  DecayResult,
  DiscoveryMethod,
  // Config
  DECAY_CONFIG,
  DISCOVERY_CONFIG,
} from '../knowledge-graph-evolution';
