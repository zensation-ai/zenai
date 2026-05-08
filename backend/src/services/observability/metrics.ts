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

 
type OtelInstrument = { add(value: number, attributes?: Record<string, string>): void } | { record(value: number, attributes?: Record<string, string>): void } | null;

let tokenCounter: OtelInstrument = null;
let ragLatencyHistogram: OtelInstrument = null;
let agentDurationHistogram: OtelInstrument = null;
let toolCallCounter: OtelInstrument = null;
let queueJobCounter: OtelInstrument = null;
let queueJobDurationHistogram: OtelInstrument = null;
let queueJobsActiveGauge: OtelInstrument = null;
let memoryOpsCounter: OtelInstrument = null;
let dbPoolActiveGauge: OtelInstrument = null;
let dbPoolWaitingGauge: OtelInstrument = null;
let dbPoolErrorCounter: OtelInstrument = null;
let siemForwardCounter: OtelInstrument = null;
let guardrailBlockCounter: OtelInstrument = null;
let stripeWebhookReplayCounter: OtelInstrument = null;
let voiceLatencyHistogram: OtelInstrument = null;
let voiceFailoverCounter: OtelInstrument = null;
let voiceBreakerCounter: OtelInstrument = null;

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

    dbPoolActiveGauge = meter.createUpDownCounter('db.pool.active', {
      description: 'Active database pool connections',
    });

    dbPoolWaitingGauge = meter.createUpDownCounter('db.pool.waiting', {
      description: 'Queries waiting for a database connection',
    });

    dbPoolErrorCounter = meter.createCounter('db.pool.errors', {
      description: 'Database pool errors',
    });

    siemForwardCounter = meter.createCounter('security.siem.forward', {
      description: 'SIEM forward attempts labelled by provider + result',
    });

    guardrailBlockCounter = meter.createCounter('security.guardrail.blocks', {
      description: 'Chat guardrail output-scanner blocks by finding + surface',
    });

    stripeWebhookReplayCounter = meter.createCounter('billing.webhook.replay', {
      description: 'Stripe webhook replays by action + dry-run flag',
    });

    voiceLatencyHistogram = meter.createHistogram('voice.phase.latency', {
      description: 'Voice pipeline phase latency (audio_ingest | stt | llm | tts | end_to_end)',
      unit: 'ms',
    });

    voiceFailoverCounter = meter.createCounter('voice.provider.failover', {
      description: 'STT/TTS provider failovers by from/to provider + reason',
    });

    voiceBreakerCounter = meter.createCounter('voice.circuit_breaker.events', {
      description: 'Voice-provider circuit breaker state transitions',
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
 * Record a database pool event.
 * Phase 67.3: Tracks pool acquire/release/error/waiting events.
 */
export function recordPoolMetric(event: 'acquire' | 'release' | 'error' | 'waiting'): void {
  const labels = { event };

  switch (event) {
    case 'acquire':
      addInstrument(dbPoolActiveGauge, 1, labels);
      break;
    case 'release':
      addInstrument(dbPoolActiveGauge, -1, labels);
      break;
    case 'error':
      addInstrument(dbPoolErrorCounter, 1, labels);
      break;
    case 'waiting':
      addInstrument(dbPoolWaitingGauge, 1, labels);
      break;
  }

  addSnapshot(`db.pool.${event === 'acquire' || event === 'release' ? 'active' : event === 'error' ? 'errors' : 'waiting'}`, event === 'error' ? 'counter' : 'gauge', event === 'release' ? -1 : 1, labels);
}

/**
 * Record a SIEM forward attempt.
 *
 * Used by `siem-forwarder.ts` on every datadog/syslog/noop forward so the
 * Prometheus alert `SIEMForwardFailureRate` has data. Noop forwards count
 * as "ok=true, provider=noop" so the rule can filter them out via label.
 */
export function recordSIEMForward(
  provider: string,
  ok: boolean,
  attrs?: { severity?: string; error?: string },
): void {
  const labels: Record<string, string> = {
    provider,
    result: ok ? 'ok' : 'fail',
  };
  if (attrs?.severity) labels.severity = attrs.severity;
  if (attrs?.error) labels.error = attrs.error.slice(0, 64);

  addInstrument(siemForwardCounter, 1, labels);
  addSnapshot('security.siem.forward', 'counter', 1, labels);
}

/**
 * Record a chat guardrail block.
 *
 * Emitted from `streaming.ts` whenever `scanOutput()` trips. `finding` is the
 * first matched rule id (e.g. `openai_key`, `jailbreak_echo`) so we can chart
 * which rules fire in practice.
 */
export function recordGuardrailBlock(
  finding: string,
  attrs?: { surface?: string; context?: string },
): void {
  const labels: Record<string, string> = { finding };
  if (attrs?.surface) labels.surface = attrs.surface;
  if (attrs?.context) labels.context = attrs.context;

  addInstrument(guardrailBlockCounter, 1, labels);
  addSnapshot('security.guardrail.blocks', 'counter', 1, labels);
}

/**
 * Record a Stripe webhook replay attempt.
 *
 * Called from `billing.replayStripeEvent` for every admin-triggered replay so
 * we can alert on unusual spikes (e.g. an operator force-replaying dozens of
 * events in a short window).
 */
export function recordStripeWebhookReplay(
  action: string,
  attrs?: { dryRun?: boolean; processed?: boolean; eventType?: string },
): void {
  const labels: Record<string, string> = { action };
  if (attrs?.dryRun !== undefined) labels.dry_run = String(attrs.dryRun);
  if (attrs?.processed !== undefined) labels.processed = String(attrs.processed);
  if (attrs?.eventType) labels.event_type = attrs.eventType;

  addInstrument(stripeWebhookReplayCounter, 1, labels);
  addSnapshot('billing.webhook.replay', 'counter', 1, labels);
}

/**
 * Record a voice-pipeline phase duration.
 *
 * Sprint 1.13. `phase` is one of audio_ingest | stt | llm | tts | end_to_end.
 * Labels: provider (e.g. `whisper`, `elevenlabs`), outcome (`ok`|`fallback`|`error`).
 */
export function recordVoiceLatency(
  phase: string,
  durationMs: number,
  attrs?: { provider?: string; outcome?: string },
): void {
  const labels: Record<string, string> = { phase };
  if (attrs?.provider) labels.provider = attrs.provider;
  if (attrs?.outcome) labels.outcome = attrs.outcome;

  addInstrument(voiceLatencyHistogram, durationMs, labels);
  addSnapshot('voice.phase.latency', 'histogram', durationMs, labels);
}

/**
 * Record a voice-provider failover (preferred → fallback).
 *
 * Sprint 1.13. Labels: `from`, `to`, `reason` (status-503, rate-limit-429,
 * timeout, unavailable, etc).
 */
export function recordVoiceFailover(
  fromProvider: string,
  toProvider: string,
  reason: string,
): void {
  const labels = { from: fromProvider, to: toProvider, reason };
  addInstrument(voiceFailoverCounter, 1, labels);
  addSnapshot('voice.provider.failover', 'counter', 1, labels);
}

/**
 * Record a circuit-breaker state transition for a voice provider.
 *
 * Sprint 1.13. `state` is one of `open` (opened after N failures),
 * `half_open` (cool-down expired), `closed` (success probe).
 */
export function recordVoiceCircuitBreaker(
  provider: string,
  state: 'open' | 'half_open' | 'closed',
): void {
  const labels = { provider, state };
  addInstrument(voiceBreakerCounter, 1, labels);
  addSnapshot('voice.circuit_breaker.events', 'counter', 1, labels);
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

// ===========================================
// Agent Cost Tracking (Phase 114, Task 53)
// ===========================================

/**
 * Cost per 1K tokens in USD for each model (approximate, as of 2026).
 * Input and output tokens have different rates.
 */
const MODEL_COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  // Claude Haiku — cheapest
  'claude-haiku-4-5': { input: 0.00025, output: 0.00125 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
  // Claude Sonnet — balanced
  'claude-sonnet-4-5': { input: 0.003, output: 0.015 },
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  // Claude Opus — most powerful/expensive
  'claude-opus-4-5': { input: 0.015, output: 0.075 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
};

/** Default cost if model not found */
const DEFAULT_COST_PER_1K = { input: 0.003, output: 0.015 };

export interface AgentCostRecord {
  executionId: string;
  agentRole: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  recordedAt: string;
}

/** In-memory store for agent cost records */
const agentCostRecords: AgentCostRecord[] = [];
const MAX_COST_RECORDS = 5_000;

/**
 * Estimate the cost in USD for a given token usage.
 */
export function estimateTokenCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = MODEL_COST_PER_1K_TOKENS[model] ?? DEFAULT_COST_PER_1K;
  const inputCost = (inputTokens / 1000) * rates.input;
  const outputCost = (outputTokens / 1000) * rates.output;
  return inputCost + outputCost;
}

/**
 * Record agent execution cost metrics.
 *
 * Tracks model used, tokens consumed, and estimated USD cost.
 * Stores in in-memory buffer for the observability API.
 *
 * @param executionId - Unique execution identifier (e.g., team ID)
 * @param agentRole - The agent role (researcher, writer, coder, reviewer)
 * @param model - The Claude model used
 * @param inputTokens - Number of input tokens consumed
 * @param outputTokens - Number of output tokens generated
 */
export function recordAgentCost(
  executionId: string,
  agentRole: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): void {
  const estimatedCostUsd = estimateTokenCost(model, inputTokens, outputTokens);
  const record: AgentCostRecord = {
    executionId,
    agentRole,
    model,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    recordedAt: new Date().toISOString(),
  };

  // Evict oldest records if buffer is full
  if (agentCostRecords.length >= MAX_COST_RECORDS) {
    agentCostRecords.splice(0, agentCostRecords.length - MAX_COST_RECORDS + 500);
  }
  agentCostRecords.push(record);

  // Also record as OTel metrics
  const labels: Record<string, string> = {
    model,
    agent: agentRole,
    execution_id: executionId,
  };
  addInstrument(tokenCounter, inputTokens + outputTokens, labels);
  addSnapshot('ai.tokens.total', 'counter', inputTokens + outputTokens, labels);
  addSnapshot('ai.agent.cost_usd', 'counter', estimatedCostUsd, labels);

  logger.debug('Agent cost recorded', {
    operation: 'agent-cost',
    executionId,
    agentRole,
    model,
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimatedCostUsd.toFixed(6),
  });
}

/**
 * Get recent agent cost records for the observability API.
 */
export function getAgentCostRecords(limit: number = 100): AgentCostRecord[] {
  return agentCostRecords.slice(-limit);
}

/**
 * Get cost summary grouped by model and agent role.
 */
export function getAgentCostSummary(): {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, { costUsd: number; inputTokens: number; outputTokens: number; calls: number }>;
  byRole: Record<string, { costUsd: number; inputTokens: number; outputTokens: number; calls: number }>;
} {
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const byModel: Record<string, { costUsd: number; inputTokens: number; outputTokens: number; calls: number }> = {};
  const byRole: Record<string, { costUsd: number; inputTokens: number; outputTokens: number; calls: number }> = {};

  for (const rec of agentCostRecords) {
    totalCostUsd += rec.estimatedCostUsd;
    totalInputTokens += rec.inputTokens;
    totalOutputTokens += rec.outputTokens;

    if (!byModel[rec.model]) {
      byModel[rec.model] = { costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
    }
    byModel[rec.model].costUsd += rec.estimatedCostUsd;
    byModel[rec.model].inputTokens += rec.inputTokens;
    byModel[rec.model].outputTokens += rec.outputTokens;
    byModel[rec.model].calls++;

    if (!byRole[rec.agentRole]) {
      byRole[rec.agentRole] = { costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
    }
    byRole[rec.agentRole].costUsd += rec.estimatedCostUsd;
    byRole[rec.agentRole].inputTokens += rec.inputTokens;
    byRole[rec.agentRole].outputTokens += rec.outputTokens;
    byRole[rec.agentRole].calls++;
  }

  return { totalCostUsd, totalInputTokens, totalOutputTokens, byModel, byRole };
}

/**
 * Clear agent cost records (for testing).
 */
export function clearAgentCostRecords(): void {
  agentCostRecords.length = 0;
}
