/**
 * Voice Latency Metrics
 *
 * Sprint 1.13: Production-Hardening for Voice-Realtime.
 *
 * Instruments the four phases of the cascading voice pipeline
 * (audio ingest → STT → LLM → TTS) so we can track the
 * p50/p95 end-to-end latency against the < 1.5 s SLA.
 *
 * Records go to both OTel (via recordVoiceLatency in metrics.ts)
 * and a bounded in-memory ring buffer that powers the admin
 * dashboard and Prometheus alert pre-computation.
 */
import { getTracer } from '../observability/tracing';
import { recordVoiceLatency, recordVoiceFailover } from '../observability/metrics';

export type VoicePhase = 'audio_ingest' | 'stt' | 'llm' | 'tts' | 'end_to_end';

export type VoiceOutcome = 'ok' | 'fallback' | 'error';

export interface VoiceLatencyRecord {
  phase: VoicePhase;
  durationMs: number;
  provider?: string;
  outcome: VoiceOutcome;
  recordedAt: number;
}

export interface VoiceLatencyStats {
  count: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

const MAX_RECORDS_PER_PHASE = 1000;
const records: Record<VoicePhase, VoiceLatencyRecord[]> = {
  audio_ingest: [],
  stt: [],
  llm: [],
  tts: [],
  end_to_end: [],
};

/**
 * Record a single phase duration. Hot-path — must never throw.
 */
export function recordVoicePhase(
  phase: VoicePhase,
  durationMs: number,
  attrs?: { provider?: string; outcome?: VoiceOutcome },
): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;

  const entry: VoiceLatencyRecord = {
    phase,
    durationMs,
    provider: attrs?.provider,
    outcome: attrs?.outcome ?? 'ok',
    recordedAt: Date.now(),
  };

  const bucket = records[phase];
  bucket.push(entry);
  if (bucket.length > MAX_RECORDS_PER_PHASE) {
    bucket.splice(0, bucket.length - MAX_RECORDS_PER_PHASE);
  }

  try {
    recordVoiceLatency(phase, durationMs, {
      provider: entry.provider,
      outcome: entry.outcome,
    });
  } catch {
    // Metric backends must never break the voice hot path
  }
}

/**
 * Record a failover event — used when STT/TTS falls from the
 * preferred provider to the next available one.
 */
export function recordFailover(fromProvider: string, toProvider: string, reason: string): void {
  try {
    recordVoiceFailover(fromProvider, toProvider, reason);
  } catch {
    // swallow
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Compute latency stats for a phase from the ring buffer.
 * Optional windowMs filters to the recent window (e.g. last 5 minutes).
 */
export function getVoiceLatencyStats(phase: VoicePhase, windowMs?: number): VoiceLatencyStats {
  const bucket = records[phase];
  const cutoff = windowMs ? Date.now() - windowMs : 0;
  const durations = bucket
    .filter(r => r.recordedAt >= cutoff)
    .map(r => r.durationMs)
    .sort((a, b) => a - b);

  if (durations.length === 0) {
    return { count: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  }

  const sum = durations.reduce((acc, v) => acc + v, 0);
  return {
    count: durations.length,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    max: durations[durations.length - 1],
    mean: sum / durations.length,
  };
}

/**
 * Get stats for every phase at once — used by the admin dashboard.
 */
export function getAllVoiceStats(windowMs?: number): Record<VoicePhase, VoiceLatencyStats> {
  return {
    audio_ingest: getVoiceLatencyStats('audio_ingest', windowMs),
    stt: getVoiceLatencyStats('stt', windowMs),
    llm: getVoiceLatencyStats('llm', windowMs),
    tts: getVoiceLatencyStats('tts', windowMs),
    end_to_end: getVoiceLatencyStats('end_to_end', windowMs),
  };
}

/**
 * Return the most recent N records for a phase — debug view.
 */
export function getRecentRecords(phase: VoicePhase, limit = 20): VoiceLatencyRecord[] {
  const bucket = records[phase];
  return bucket.slice(-limit);
}

/**
 * Wrap an async call in an OTel span AND record its duration to
 * the phase ring buffer. Returns whatever the inner function returned.
 *
 * Usage:
 *   const audio = await withVoicePhaseSpan('tts', 'elevenlabs', () => provider.synthesize(text));
 */
export async function withVoicePhaseSpan<T>(
  phase: VoicePhase,
  provider: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = getTracer('voice');
  const spanName = `voice.${phase}`;
  const start = Date.now();

  return tracer.startActiveSpan(spanName, async (span) => {
    span.setAttributes({
      'voice.phase': phase,
      ...(provider ? { 'voice.provider': provider } : {}),
    });

    try {
      const result = await fn();
      const duration = Date.now() - start;
      recordVoicePhase(phase, duration, { provider, outcome: 'ok' });
      span.setAttribute('voice.duration_ms', duration);
      span.end();
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      recordVoicePhase(phase, duration, { provider, outcome: 'error' });
      span.setAttribute('voice.duration_ms', duration);
      span.recordException(err);
      span.setStatus({ code: 2, message: err instanceof Error ? err.message : String(err) });
      span.end();
      throw err;
    }
  });
}

/**
 * Reset all in-memory ring buffers. For tests only.
 */
export function clearVoiceMetrics(): void {
  (Object.keys(records) as VoicePhase[]).forEach((phase) => {
    records[phase].length = 0;
  });
}
