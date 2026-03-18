/**
 * Centralized Timeout Configuration
 *
 * Single source of truth for all timeout values across the backend.
 * Keeps magic numbers out of individual service/middleware files.
 *
 * @module config/timeouts
 */

export const TIMEOUTS = {
  // ---- Claude API ----
  /** Safety timeout for a single SSE streaming call (90 s) */
  CLAUDE_STREAM: 90_000,
  /** Total time budget for all tool calls inside one request (60 s) */
  CLAUDE_TOOL_BUDGET: 60_000,

  // ---- Web Search ----
  /** Brave / DuckDuckGo search request (10 s) */
  WEB_SEARCH: 10_000,
  /** Deep-fetch of individual result URLs (5 s) */
  WEB_SEARCH_DEEP_FETCH: 5_000,

  // ---- Database ----
  /** Maximum time to wait for a DB query result (5 s) */
  DB_QUERY: 5_000,

  // ---- RAG ----
  /** HyDE hypothesis generation timeout (5 s) */
  HYDE_GENERATION: 5_000,

  // ---- HTTP Request Middleware ----
  /** Default timeout for standard API requests (30 s) */
  REQUEST_DEFAULT: 30_000,
  /** Extended timeout for streaming / voice endpoints (120 s) */
  REQUEST_STREAMING: 120_000,
  /** Extended timeout for vision processing endpoints (180 s) */
  REQUEST_VISION: 180_000,

  // ---- Circuit Breaker reset timeouts ----
  /** Time before attempting a probe on the Claude breaker (60 s) */
  CIRCUIT_BREAKER_CLAUDE: 60_000,
  /** Time before attempting a probe on the Brave Search breaker (120 s) */
  CIRCUIT_BREAKER_BRAVE: 120_000,
  /** Time before attempting a probe on the database breaker (30 s) */
  CIRCUIT_BREAKER_DB: 30_000,

  // ---- Agent ----
  /** Maximum wall-clock time for a single agent execution (60 s) */
  AGENT_EXECUTION: 60_000,
  /** Timeout for a single MCP tool call (30 s) */
  MCP_TOOL_CALL: 30_000,

  // ---- Voice ----
  /** Speech-to-text transcription timeout (15 s) */
  VOICE_STT: 15_000,
  /** Text-to-speech synthesis timeout (10 s) */
  VOICE_TTS: 10_000,
} as const;

export type TimeoutKey = keyof typeof TIMEOUTS;
