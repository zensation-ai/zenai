/**
 * Central Configuration Constants
 *
 * All magic numbers and configurable values should be defined here
 * to make the codebase more maintainable and configurable.
 */

// ===========================================
// Database Configuration
// ===========================================
export const DATABASE = {
  /** Maximum connections per pool */
  MAX_POOL_CONNECTIONS: 20,
  /** Idle timeout in milliseconds */
  IDLE_TIMEOUT_MS: 30000,
  /** Connection timeout in milliseconds */
  CONNECTION_TIMEOUT_MS: 2000,
} as const;

// ===========================================
// Learning Engine Configuration
// ===========================================
export const LEARNING = {
  /** Minimum number of samples before making suggestions */
  MIN_SAMPLES_FOR_SUGGESTIONS: 3,
  /** Confidence threshold to override LLM suggestions (0-1) */
  CONFIDENCE_FOR_OVERRIDE: 0.5,
  /** Minimum frequency for phrase insights */
  PHRASE_MIN_FREQUENCY: 2,
  /** Weight for similarity-based suggestions (0-1) */
  SIMILARITY_WEIGHT: 0.6,
  /** Weight for preference-based suggestions (0-1) */
  PREFERENCE_WEIGHT: 0.3,
  /** Weight for keyword-based suggestions (0-1) */
  KEYWORD_WEIGHT: 0.1,
  /** Decay rate for preference aging (0-1, where 0.98 = 2% decay per event) */
  PREFERENCE_DECAY_RATE: 0.98,
  /** Maximum keywords per priority category */
  MAX_PRIORITY_KEYWORDS: 30,
} as const;

// ===========================================
// Embedding & Search Configuration
// ===========================================
export const EMBEDDING = {
  /** Similarity threshold for story clustering (0-1) */
  STORY_SIMILARITY_THRESHOLD: 0.75,
  /** Minimum similarity for relationship detection (0-1) */
  RELATIONSHIP_SIMILARITY_THRESHOLD: 0.5,
  /** Number of candidates for 2-stage search */
  SEARCH_CANDIDATE_COUNT: 50,
  /** Maximum items for story clustering */
  MAX_STORY_ITEMS: 200,
} as const;

// ===========================================
// Ollama / LLM Configuration
// ===========================================
export const OLLAMA = {
  /** Default Ollama URL */
  DEFAULT_URL: 'http://localhost:11434',
  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 60000,
  /** Model for text generation */
  TEXT_MODEL: 'mistral',
  /** Model for embeddings */
  EMBEDDING_MODEL: 'nomic-embed-text',
} as const;

// ===========================================
// Whisper / Transcription Configuration
// ===========================================
export const WHISPER = {
  /** Default Whisper model */
  DEFAULT_MODEL: 'base',
  /** Transcription timeout in milliseconds (5 minutes) */
  TIMEOUT_MS: 5 * 60 * 1000,
  /** Default language */
  DEFAULT_LANGUAGE: 'de',
} as const;

// ===========================================
// File Upload Configuration
// ===========================================
export const UPLOAD = {
  /** Maximum audio file size in bytes (50MB) */
  MAX_AUDIO_SIZE: 50 * 1024 * 1024,
  /** Maximum media file size in bytes (100MB) */
  MAX_MEDIA_SIZE: 100 * 1024 * 1024,
  /** Request body size limit */
  BODY_SIZE_LIMIT: '50mb',
} as const;

// ===========================================
// API Rate Limiting Configuration
// ===========================================
export const RATE_LIMIT = {
  /** Rate limit cleanup interval in milliseconds (1 hour) */
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000,
} as const;

// ===========================================
// Knowledge Graph Configuration
// ===========================================
export const KNOWLEDGE_GRAPH = {
  /** Minimum strength for relationships to be stored (0-1) */
  MIN_RELATIONSHIP_STRENGTH: 0.5,
  /** Maximum hops for multi-hop search */
  MAX_SEARCH_HOPS: 2,
  /** Maximum candidates for LLM analysis */
  MAX_LLM_CANDIDATES: 5,
  /** Batch size for relationship discovery */
  DISCOVERY_BATCH_SIZE: 10,
  /** Delay between batches in milliseconds */
  DISCOVERY_BATCH_DELAY_MS: 500,
} as const;

// ===========================================
// API Response Limits
// ===========================================
export const API_LIMITS = {
  /** Default page size for list endpoints */
  DEFAULT_PAGE_SIZE: 20,
  /** Maximum page size for list endpoints */
  MAX_PAGE_SIZE: 100,
  /** Maximum results for graph queries */
  MAX_GRAPH_NODES: 500,
} as const;
