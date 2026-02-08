/**
 * Lightweight Metrics Collection (OpenTelemetry-Light)
 *
 * Collects request timing, database query stats, and AI token usage
 * without external dependencies. Exposes Prometheus-compatible text format.
 *
 * Uses fixed-size ring buffers for histogram approximation.
 */

import { getPoolStats } from './database-context';

// ============================================
// Histogram with fixed-size buckets
// ============================================

const HISTOGRAM_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, Infinity];

interface Histogram {
  buckets: number[];
  sum: number;
  count: number;
}

function createHistogram(): Histogram {
  return {
    buckets: new Array(HISTOGRAM_BUCKETS.length).fill(0),
    sum: 0,
    count: 0,
  };
}

function observeHistogram(h: Histogram, value: number): void {
  h.sum += value;
  h.count++;
  for (let i = 0; i < HISTOGRAM_BUCKETS.length; i++) {
    if (value <= HISTOGRAM_BUCKETS[i]) {
      h.buckets[i]++;
    }
  }
}

// ============================================
// Counter
// ============================================

interface CounterMap {
  [label: string]: number;
}

// ============================================
// Metrics Store (module-level singletons)
// ============================================

const httpRequestDuration = createHistogram();
const httpRequestsByStatus: CounterMap = {};
const httpRequestsByMethod: CounterMap = {};

const dbQueryDuration = createHistogram();
let dbQueryTotal = 0;
let dbSlowQueryTotal = 0;

const claudeTokensInput: CounterMap = {};
const claudeTokensOutput: CounterMap = {};
let claudeRequestTotal = 0;

const toolExecutionDuration = createHistogram();
const toolExecutionsByName: CounterMap = {};

// ============================================
// Public Recording API
// ============================================

/** Record an HTTP request duration (ms) */
export function recordHttpRequest(method: string, statusCode: number, durationMs: number): void {
  observeHistogram(httpRequestDuration, durationMs);
  httpRequestsByStatus[String(statusCode)] = (httpRequestsByStatus[String(statusCode)] || 0) + 1;
  httpRequestsByMethod[method] = (httpRequestsByMethod[method] || 0) + 1;
}

/** Record a database query duration (ms) */
export function recordDbQuery(durationMs: number, slow: boolean): void {
  observeHistogram(dbQueryDuration, durationMs);
  dbQueryTotal++;
  if (slow) {dbSlowQueryTotal++;}
}

/** Record Claude API token usage */
export function recordClaudeTokens(model: string, inputTokens: number, outputTokens: number): void {
  claudeTokensInput[model] = (claudeTokensInput[model] || 0) + inputTokens;
  claudeTokensOutput[model] = (claudeTokensOutput[model] || 0) + outputTokens;
  claudeRequestTotal++;
}

/** Record tool execution duration (ms) */
export function recordToolExecution(toolName: string, durationMs: number): void {
  observeHistogram(toolExecutionDuration, durationMs);
  toolExecutionsByName[toolName] = (toolExecutionsByName[toolName] || 0) + 1;
}

// ============================================
// Prometheus Text Format Export
// ============================================

function formatHistogram(name: string, help: string, h: Histogram): string {
  const lines: string[] = [];
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} histogram`);

  let cumulative = 0;
  for (let i = 0; i < HISTOGRAM_BUCKETS.length; i++) {
    cumulative += h.buckets[i];
    const le = HISTOGRAM_BUCKETS[i] === Infinity ? '+Inf' : String(HISTOGRAM_BUCKETS[i]);
    lines.push(`${name}_bucket{le="${le}"} ${cumulative}`);
  }
  lines.push(`${name}_sum ${h.sum}`);
  lines.push(`${name}_count ${h.count}`);
  return lines.join('\n');
}

function formatCounter(name: string, help: string, labels: CounterMap): string {
  const lines: string[] = [];
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} counter`);
  for (const [label, value] of Object.entries(labels)) {
    lines.push(`${name}{label="${label}"} ${value}`);
  }
  return lines.join('\n');
}

/** Generate Prometheus text format metrics output */
export function getPrometheusMetrics(): string {
  const sections: string[] = [];

  // HTTP metrics
  sections.push(
    formatHistogram('zenai_http_request_duration_ms', 'HTTP request duration in milliseconds', httpRequestDuration),
  );
  sections.push(
    formatCounter('zenai_http_requests_total', 'Total HTTP requests by status code', httpRequestsByStatus),
  );
  sections.push(
    formatCounter('zenai_http_requests_by_method', 'Total HTTP requests by method', httpRequestsByMethod),
  );

  // Database metrics
  sections.push(
    formatHistogram('zenai_db_query_duration_ms', 'Database query duration in milliseconds', dbQueryDuration),
  );
  sections.push(`# HELP zenai_db_queries_total Total database queries\n# TYPE zenai_db_queries_total counter\nzenai_db_queries_total ${dbQueryTotal}`);
  sections.push(`# HELP zenai_db_slow_queries_total Total slow database queries\n# TYPE zenai_db_slow_queries_total counter\nzenai_db_slow_queries_total ${dbSlowQueryTotal}`);

  // Database pool stats (gauge)
  try {
    const poolStats = getPoolStats();
    for (const [ctx, stats] of Object.entries(poolStats)) {
      sections.push(`# HELP zenai_db_pool_size Current pool size\n# TYPE zenai_db_pool_size gauge`);
      sections.push(`zenai_db_pool_size{context="${ctx}"} ${stats.poolSize}`);
      sections.push(`zenai_db_pool_idle{context="${ctx}"} ${stats.idleCount}`);
      sections.push(`zenai_db_pool_waiting{context="${ctx}"} ${stats.waitingCount}`);
    }
  } catch {
    // DB not initialized, skip pool stats
  }

  // Claude API metrics
  sections.push(
    formatCounter('zenai_claude_tokens_input', 'Claude API input tokens by model', claudeTokensInput),
  );
  sections.push(
    formatCounter('zenai_claude_tokens_output', 'Claude API output tokens by model', claudeTokensOutput),
  );
  sections.push(`# HELP zenai_claude_requests_total Total Claude API requests\n# TYPE zenai_claude_requests_total counter\nzenai_claude_requests_total ${claudeRequestTotal}`);

  // Tool execution metrics
  sections.push(
    formatHistogram('zenai_tool_execution_duration_ms', 'Tool execution duration in milliseconds', toolExecutionDuration),
  );
  sections.push(
    formatCounter('zenai_tool_executions_total', 'Tool executions by name', toolExecutionsByName),
  );

  // Process metrics (gauge)
  const mem = process.memoryUsage();
  sections.push(`# HELP zenai_process_memory_rss_bytes Process RSS memory\n# TYPE zenai_process_memory_rss_bytes gauge\nzenai_process_memory_rss_bytes ${mem.rss}`);
  sections.push(`# HELP zenai_process_memory_heap_used_bytes Process heap used\n# TYPE zenai_process_memory_heap_used_bytes gauge\nzenai_process_memory_heap_used_bytes ${mem.heapUsed}`);
  sections.push(`# HELP zenai_process_uptime_seconds Process uptime\n# TYPE zenai_process_uptime_seconds gauge\nzenai_process_uptime_seconds ${Math.floor(process.uptime())}`);

  return sections.join('\n\n') + '\n';
}
