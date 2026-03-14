/**
 * Phase 61: Custom Business Metrics
 *
 * OpenTelemetry-based metrics for AI operations, queue processing, and memory.
 * Graceful degradation: if OTel isn't available, metrics are no-ops.
 */

import { logger } from '../../utils/logger';

// In-memory metric snapshots for the observability API
interface MetricSnapshot {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  value: number;
  labels: Record<string, string>;
  recordedAt: string;
}

const metricSnapshots: MetricSnapshot[] = [];
const MAX_SNAPSHOTS = 10_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OtelInstrument = { add(value: number, attributes?: Record<string, string>): void } | { record(value: number, attributes?: Record<string, string>): void } | null;

let tokenCounter: OtelInstrument = null;
let ragLatencyHistogram: OtelInstrument = null;
let agentDurationHistogram: OtelInstrument = null;
let toolCallCounter: OtelInstrument = null;
let queueJobCounter: OtelInstrument = null;
let queueJobDurationHistogram: OtelInstrument = null;
let queueJobsActiveGauge: OtelInstrument = null;
let memoryOpsCounter: OtelInstrument = null;

let metricsInitialized = false;

function addInstrument(instrument: OtelInstrument, value: number, labels: Record<string, string>): void {
  if (!instrument) {return;}
  if ('add' in instrument) {
    instrument.add(value, labels);
  } else if ('record' in instrument) {
    instrument.record(value, labels);
  }
}

/**
 * Initialize OTel metrics instruments.
 * Called during startup; no-ops if OTel is unavailable.
 */
export async function initMetrics(): Promise<boolean> {
  if (metricsInitialized) {return true;}

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { metrics } = require('@opentelemetry/api');
    const meter = metrics.getMeter('zenai-backend', '1.0.0');

    tokenCounter = meter.createCounter('ai.tokens.total', {
      description: 'Total AI tokens consumed',
      unit: 'tokens',
    });

    ragLatencyHistogram = meter.createHistogram('ai.rag.latency', {
      description: 'RAG retrieval latency',
      unit: 'ms',
    });

    agentDurationHistogram = meter.createHistogram('ai.agent.duration', {
      description: 'Agent execution duration',
      unit: 'ms',
    });

    toolCallCounter = meter.createCounter('ai.tool.calls', {
      description: 'Tool invocations by tool name',
    });

    queueJobCounter = meter.createCounter('queue.jobs.total', {
      description: 'Total jobs enqueued by queue name',
    });

    queueJobDurationHistogram = meter.createHistogram('queue.jobs.duration', {
      description: 'Job processing duration',
      unit: 'ms',
    });

    queueJobsActiveGauge = meter.createUpDownCounter('queue.jobs.active', {
      description: 'Currently active jobs',
    });

    memoryOpsCounter = meter.createCounter('memory.operations', {
      description: 'Memory layer operations',
    });

    metricsInitialized = true;
    logger.info('OpenTelemetry metrics initialized', { operation: 'metrics' });
    return true;
  } catch (error) {
    logger.warn('OpenTelemetry metrics not available', {
      operation: 'metrics',
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function addSnapshot(name: string, type: MetricSnapshot['type'], value: number, labels: Record<string, string>): void {
  if (metricSnapshots.length >= MAX_SNAPSHOTS) {
    metricSnapshots.splice(0, metricSnapshots.length - MAX_SNAPSHOTS + 1000);
  }
  metricSnapshots.push({
    name,
    type,
    value,
    labels,
    recordedAt: new Date().toISOString(),
  });
}

/**
 * Record token usage for AI operations.
 */
export function recordTokenUsage(tokens: number, attrs?: { model?: string; operation?: string }): void {
  const labels: Record<string, string> = {};
  if (attrs?.model) {labels.model = attrs.model;}
  if (attrs?.operation) {labels.operation = attrs.operation;}

  addInstrument(tokenCounter, tokens, labels);
  addSnapshot('ai.tokens.total', 'counter', tokens, labels);
}

/**
 * Record RAG retrieval latency.
 */
export function recordRagLatency(durationMs: number, attrs?: { strategy?: string; context?: string }): void {
  const labels: Record<string, string> = {};
  if (attrs?.strategy) {labels.strategy = attrs.strategy;}
  if (attrs?.context) {labels.context = attrs.context;}

  addInstrument(ragLatencyHistogram, durationMs, labels);
  addSnapshot('ai.rag.latency', 'histogram', durationMs, labels);
}

/**
 * Record agent execution duration.
 */
export function recordAgentDuration(durationMs: number, attrs?: { strategy?: string; agent?: string }): void {
  const labels: Record<string, string> = {};
  if (attrs?.strategy) {labels.strategy = attrs.strategy;}
  if (attrs?.agent) {labels.agent = attrs.agent;}

  addInstrument(agentDurationHistogram, durationMs, labels);
  addSnapshot('ai.agent.duration', 'histogram', durationMs, labels);
}

/**
 * Record a tool invocation.
 */
export function recordToolCall(toolName: string, attrs?: { status?: string }): void {
  const labels: Record<string, string> = { tool: toolName };
  if (attrs?.status) {labels.status = attrs.status;}

  addInstrument(toolCallCounter, 1, labels);
  addSnapshot('ai.tool.calls', 'counter', 1, labels);
}

/**
 * Record a queue job event.
 */
export function recordQueueJob(
  queueName: string,
  event: 'enqueued' | 'completed' | 'failed',
  durationMs?: number,
): void {
  const labels: Record<string, string> = { queue: queueName, event };

  addInstrument(queueJobCounter, 1, labels);
  addSnapshot('queue.jobs.total', 'counter', 1, labels);

  if (durationMs !== undefined) {
    addInstrument(queueJobDurationHistogram, durationMs, { queue: queueName });
    addSnapshot('queue.jobs.duration', 'histogram', durationMs, { queue: queueName });
  }

  if (event === 'enqueued') {
    addInstrument(queueJobsActiveGauge, 1, { queue: queueName });
  } else {
    addInstrument(queueJobsActiveGauge, -1, { queue: queueName });
  }
}

/**
 * Record a memory layer operation.
 */
export function recordMemoryOp(layer: string, operation: string): void {
  const labels = { layer, operation };
  addInstrument(memoryOpsCounter, 1, labels);
  addSnapshot('memory.operations', 'counter', 1, labels);
}

/**
 * Get current metric snapshots for the observability API.
 */
export function getMetricSnapshots(limit: number = 100): MetricSnapshot[] {
  return metricSnapshots.slice(-limit);
}

/**
 * Get aggregated metrics summary.
 */
export function getMetricsSummary(): Record<string, { count: number; lastValue: number; lastRecorded: string }> {
  const summary: Record<string, { count: number; lastValue: number; lastRecorded: string }> = {};

  for (const snap of metricSnapshots) {
    if (!summary[snap.name]) {
      summary[snap.name] = { count: 0, lastValue: 0, lastRecorded: '' };
    }
    summary[snap.name].count++;
    summary[snap.name].lastValue = snap.value;
    summary[snap.name].lastRecorded = snap.recordedAt;
  }

  return summary;
}

/**
 * Check if metrics are initialized.
 */
export function isMetricsEnabled(): boolean {
  return metricsInitialized;
}

/**
 * Clear all in-memory snapshots (for testing).
 */
export function clearSnapshots(): void {
  metricSnapshots.length = 0;
}
