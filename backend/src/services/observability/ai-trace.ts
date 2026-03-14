/**
 * Phase 73: AI Observability - Langfuse-style Trace & Span Service
 *
 * Lightweight built-in AI tracing that mirrors Langfuse's trace/span/generation model.
 * - In-memory buffer with periodic flush to PostgreSQL
 * - Fire-and-forget persistence (never blocks the response)
 * - Cost estimation based on model + token count
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

// ============================================================
// Types
// ============================================================

export type AISpanType = 'rag' | 'tool' | 'agent' | 'generation' | 'custom';

export interface AISpan {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  type: AISpanType;
  input?: unknown;
  output?: unknown;
  startTime: Date;
  endTime?: Date;
  tokens?: { input: number; output: number };
  cost?: number;
  metadata?: Record<string, unknown>;
}

export interface AITrace {
  id: string;
  sessionId?: string;
  userId?: string;
  name: string;
  input: unknown;
  output?: unknown;
  startTime: Date;
  endTime?: Date;
  metadata?: Record<string, unknown>;
  spans: AISpan[];
  totalTokens: number;
  totalCost: number;
}

// ============================================================
// Cost estimation per model (USD per 1M tokens)
// ============================================================

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-20250514': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-opus-4-20250514': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-3-5-sonnet-20241022': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-3-5-haiku-20241022': { inputPer1M: 0.8, outputPer1M: 4.0 },
  'claude-3-haiku-20240307': { inputPer1M: 0.25, outputPer1M: 1.25 },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1M: 3.0, outputPer1M: 15.0 };

/**
 * Estimate cost in USD for a given model and token counts.
 */
export function estimateCost(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = (model && MODEL_PRICING[model]) || DEFAULT_PRICING;
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}

// ============================================================
// Trace Builder (returned by startTrace)
// ============================================================

export interface TraceBuilder {
  readonly id: string;
  /** Add a span to this trace. Returns a SpanBuilder with end(). */
  addSpan(name: string, type: AISpanType, opts?: {
    parentId?: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
  }): SpanBuilder;
  /** Shorthand for addSpan with type='generation' and token tracking. */
  addGeneration(name: string, opts?: {
    parentId?: string;
    input?: unknown;
    model?: string;
    metadata?: Record<string, unknown>;
  }): GenerationBuilder;
  /** End the trace and schedule persistence. */
  end(output?: unknown): void;
}

export interface SpanBuilder {
  readonly id: string;
  end(output?: unknown): void;
}

export interface GenerationBuilder {
  readonly id: string;
  end(output?: unknown, tokens?: { input: number; output: number }): void;
}

// ============================================================
// In-memory buffer & flush logic
// ============================================================

/** Buffer of completed traces waiting to be flushed to DB. */
let traceBuffer: AITrace[] = [];

/** Active (not yet ended) traces, keyed by trace ID. */
const activeTraces = new Map<string, AITrace>();

/** Flush interval handle (for cleanup). */
let flushIntervalHandle: ReturnType<typeof setInterval> | null = null;

/** Maximum buffer size before a forced flush. */
const MAX_BUFFER_SIZE = 100;

/** Flush interval in milliseconds. */
const FLUSH_INTERVAL_MS = 5_000;

/** Param types accepted by the DB query function. */
type QueryParam = string | number | boolean | Date | null | undefined | Buffer | object;

/** Database query function — injected at init time to avoid circular imports. */
let queryFn: ((sql: string, params: QueryParam[]) => Promise<{ rows: unknown[] }>) | null = null;

/**
 * Initialize the AI trace service.
 * Must be called once at startup with a query function for the public schema.
 */
export function initAITracing(
  dbQueryFn: (sql: string, params?: QueryParam[]) => Promise<{ rows: unknown[] }>,
): void {
  queryFn = dbQueryFn;
  if (!flushIntervalHandle) {
    flushIntervalHandle = setInterval(() => {
      flushBuffer().catch((err) => {
        logger.warn('AI trace flush failed', {
          operation: 'ai-trace',
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, FLUSH_INTERVAL_MS);
  }
  logger.info('AI tracing service initialized', { operation: 'ai-trace' });
}

/**
 * Shut down the AI trace service — flush remaining buffer, clear interval.
 */
export async function shutdownAITracing(): Promise<void> {
  if (flushIntervalHandle) {
    clearInterval(flushIntervalHandle);
    flushIntervalHandle = null;
  }
  await flushBuffer();
  logger.info('AI tracing service shut down', { operation: 'ai-trace' });
}

// ============================================================
// Public API
// ============================================================

/**
 * Start a new AI trace.
 */
export function startTrace(
  name: string,
  input?: unknown,
  opts?: {
    sessionId?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  },
): TraceBuilder {
  const trace: AITrace = {
    id: uuidv4(),
    sessionId: opts?.sessionId,
    userId: opts?.userId,
    name,
    input,
    startTime: new Date(),
    metadata: opts?.metadata,
    spans: [],
    totalTokens: 0,
    totalCost: 0,
  };

  activeTraces.set(trace.id, trace);

  const builder: TraceBuilder = {
    id: trace.id,

    addSpan(spanName, type, spanOpts) {
      const span: AISpan = {
        id: uuidv4(),
        traceId: trace.id,
        parentId: spanOpts?.parentId,
        name: spanName,
        type,
        input: spanOpts?.input,
        startTime: new Date(),
        metadata: spanOpts?.metadata,
      };
      trace.spans.push(span);

      return {
        id: span.id,
        end(output?: unknown) {
          span.endTime = new Date();
          span.output = output;
        },
      };
    },

    addGeneration(genName, genOpts) {
      const model = genOpts?.model;
      const span: AISpan = {
        id: uuidv4(),
        traceId: trace.id,
        parentId: genOpts?.parentId,
        name: genName,
        type: 'generation',
        input: genOpts?.input,
        startTime: new Date(),
        metadata: { ...genOpts?.metadata, model },
      };
      trace.spans.push(span);

      return {
        id: span.id,
        end(output?: unknown, tokens?: { input: number; output: number }) {
          span.endTime = new Date();
          span.output = output;
          if (tokens) {
            span.tokens = tokens;
            const cost = estimateCost(model, tokens.input, tokens.output);
            span.cost = cost;
            trace.totalTokens += tokens.input + tokens.output;
            trace.totalCost += cost;
          }
        },
      };
    },

    end(output?: unknown) {
      trace.endTime = new Date();
      trace.output = output;
      activeTraces.delete(trace.id);
      enqueueTrace(trace);
    },
  };

  return builder;
}

/**
 * Get a specific trace by ID (from buffer or active set).
 * Primarily for testing; the routes read from DB.
 */
export function getActiveTrace(traceId: string): AITrace | undefined {
  return activeTraces.get(traceId);
}

/**
 * Get the current buffer size (for testing / observability).
 */
export function getBufferSize(): number {
  return traceBuffer.length;
}

/**
 * Get the number of active (not yet ended) traces.
 */
export function getActiveTraceCount(): number {
  return activeTraces.size;
}

// ============================================================
// Internal helpers
// ============================================================

function enqueueTrace(trace: AITrace): void {
  traceBuffer.push(trace);
  if (traceBuffer.length >= MAX_BUFFER_SIZE) {
    // Fire-and-forget flush
    flushBuffer().catch((err) => {
      logger.warn('AI trace forced flush failed', {
        operation: 'ai-trace',
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * Flush all buffered traces to the database.
 */
export async function flushBuffer(): Promise<number> {
  if (traceBuffer.length === 0 || !queryFn) {
    return 0;
  }

  // Swap out the buffer so new traces don't interfere
  const batch = traceBuffer;
  traceBuffer = [];

  let flushed = 0;
  for (const trace of batch) {
    try {
      await persistTrace(trace);
      flushed++;
    } catch (err) {
      logger.warn('Failed to persist AI trace', {
        operation: 'ai-trace',
        traceId: trace.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (flushed > 0) {
    logger.debug(`AI trace: flushed ${flushed} traces to DB`, { operation: 'ai-trace' });
  }
  return flushed;
}

async function persistTrace(trace: AITrace): Promise<void> {
  if (!queryFn) { return; }

  // Insert trace
  await queryFn(
    `INSERT INTO ai_traces (id, session_id, user_id, name, input, output, start_time, end_time, total_tokens, total_cost, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO NOTHING`,
    [
      trace.id,
      trace.sessionId || null,
      trace.userId || null,
      trace.name,
      trace.input ? JSON.stringify(trace.input) : null,
      trace.output ? JSON.stringify(trace.output) : null,
      trace.startTime.toISOString(),
      trace.endTime?.toISOString() || null,
      trace.totalTokens,
      trace.totalCost,
      JSON.stringify(trace.metadata || {}),
    ],
  );

  // Insert spans
  for (const span of trace.spans) {
    await queryFn(
      `INSERT INTO ai_spans (id, trace_id, parent_id, name, type, input, output, start_time, end_time, input_tokens, output_tokens, cost, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [
        span.id,
        span.traceId,
        span.parentId || null,
        span.name,
        span.type,
        span.input ? JSON.stringify(span.input) : null,
        span.output ? JSON.stringify(span.output) : null,
        span.startTime.toISOString(),
        span.endTime?.toISOString() || null,
        span.tokens?.input || 0,
        span.tokens?.output || 0,
        span.cost || 0,
        JSON.stringify(span.metadata || {}),
      ],
    );
  }
}

// ============================================================
// Test helpers (only use in tests)
// ============================================================

/** Reset all internal state. For testing only. */
export function _resetForTesting(): void {
  traceBuffer = [];
  activeTraces.clear();
  if (flushIntervalHandle) {
    clearInterval(flushIntervalHandle);
    flushIntervalHandle = null;
  }
  queryFn = null;
}
