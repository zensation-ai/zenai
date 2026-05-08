/**
 * Sprint 1.13: Voice latency ring buffer + OTel helpers.
 */

jest.mock('../../../../services/observability/metrics', () => ({
  recordVoiceLatency: jest.fn(),
  recordVoiceFailover: jest.fn(),
}));

jest.mock('../../../../services/observability/tracing', () => {
  const span = {
    setAttributes: jest.fn(),
    setAttribute: jest.fn(),
    setStatus: jest.fn(),
    recordException: jest.fn(),
    end: jest.fn(),
  };
  return {
    getTracer: jest.fn().mockReturnValue({
      startActiveSpan: jest.fn(async (_name: string, fn: (s: typeof span) => unknown) => fn(span)),
    }),
  };
});

import {
  recordVoicePhase,
  recordFailover,
  getVoiceLatencyStats,
  getAllVoiceStats,
  getRecentRecords,
  withVoicePhaseSpan,
  clearVoiceMetrics,
} from '../../../../services/voice/voice-metrics';
import { recordVoiceLatency, recordVoiceFailover } from '../../../../services/observability/metrics';

const mockLatency = recordVoiceLatency as jest.Mock;
const mockFailover = recordVoiceFailover as jest.Mock;

describe('voice-metrics', () => {
  beforeEach(() => {
    clearVoiceMetrics();
    mockLatency.mockClear();
    mockFailover.mockClear();
  });

  describe('recordVoicePhase', () => {
    it('records a valid entry and forwards to OTel', () => {
      recordVoicePhase('stt', 120, { provider: 'whisper', outcome: 'ok' });
      const stats = getVoiceLatencyStats('stt');
      expect(stats.count).toBe(1);
      expect(stats.p50).toBe(120);
      expect(mockLatency).toHaveBeenCalledWith('stt', 120, { provider: 'whisper', outcome: 'ok' });
    });

    it('defaults outcome to "ok" when omitted', () => {
      recordVoicePhase('llm', 80);
      expect(mockLatency).toHaveBeenCalledWith('llm', 80, { provider: undefined, outcome: 'ok' });
    });

    it('drops non-finite durations', () => {
      recordVoicePhase('stt', Number.NaN);
      recordVoicePhase('stt', Number.POSITIVE_INFINITY);
      recordVoicePhase('stt', -5);
      expect(getVoiceLatencyStats('stt').count).toBe(0);
      expect(mockLatency).not.toHaveBeenCalled();
    });

    it('does not throw when the OTel backend throws', () => {
      mockLatency.mockImplementationOnce(() => {
        throw new Error('otel down');
      });
      expect(() => recordVoicePhase('tts', 50)).not.toThrow();
      expect(getVoiceLatencyStats('tts').count).toBe(1);
    });

    it('caps the ring buffer at 1000 records per phase', () => {
      for (let i = 0; i < 1100; i++) {
        recordVoicePhase('end_to_end', 10 + i);
      }
      const stats = getVoiceLatencyStats('end_to_end');
      expect(stats.count).toBe(1000);
      expect(stats.max).toBe(10 + 1099);
    });
  });

  describe('getVoiceLatencyStats', () => {
    it('returns zeros when no records exist', () => {
      expect(getVoiceLatencyStats('audio_ingest')).toEqual({
        count: 0,
        p50: 0,
        p95: 0,
        max: 0,
        mean: 0,
      });
    });

    it('computes p50, p95, max, mean correctly', () => {
      [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].forEach((v) =>
        recordVoicePhase('stt', v),
      );
      const stats = getVoiceLatencyStats('stt');
      expect(stats.count).toBe(10);
      expect(stats.max).toBe(1000);
      expect(stats.mean).toBe(550);
      expect(stats.p50).toBeGreaterThanOrEqual(500);
      expect(stats.p50).toBeLessThanOrEqual(600);
      expect(stats.p95).toBeGreaterThanOrEqual(900);
    });

    it('applies windowMs filter', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValueOnce(now - 10_000);
      recordVoicePhase('tts', 500);
      jest.spyOn(Date, 'now').mockReturnValue(now);
      recordVoicePhase('tts', 200);
      const stats = getVoiceLatencyStats('tts', 5_000);
      expect(stats.count).toBe(1);
      expect(stats.max).toBe(200);
      (Date.now as jest.Mock).mockRestore?.();
    });
  });

  describe('getAllVoiceStats', () => {
    it('returns a bucket for every phase', () => {
      recordVoicePhase('stt', 100);
      recordVoicePhase('tts', 150);
      const all = getAllVoiceStats();
      expect(Object.keys(all).sort()).toEqual(
        ['audio_ingest', 'end_to_end', 'llm', 'stt', 'tts'].sort(),
      );
      expect(all.stt.count).toBe(1);
      expect(all.tts.count).toBe(1);
      expect(all.llm.count).toBe(0);
    });
  });

  describe('getRecentRecords', () => {
    it('returns the most recent N records', () => {
      for (let i = 0; i < 30; i++) recordVoicePhase('stt', i);
      const recent = getRecentRecords('stt', 5);
      expect(recent.length).toBe(5);
      expect(recent[4].durationMs).toBe(29);
    });
  });

  describe('recordFailover', () => {
    it('forwards to OTel failover counter', () => {
      recordFailover('elevenlabs', 'edge-tts', 'http_503');
      expect(mockFailover).toHaveBeenCalledWith('elevenlabs', 'edge-tts', 'http_503');
    });

    it('swallows OTel failures', () => {
      mockFailover.mockImplementationOnce(() => {
        throw new Error('down');
      });
      expect(() => recordFailover('a', 'b', 'x')).not.toThrow();
    });
  });

  describe('withVoicePhaseSpan', () => {
    it('records phase duration on success', async () => {
      const result = await withVoicePhaseSpan('stt', 'whisper', async () => 'transcript');
      expect(result).toBe('transcript');
      const stats = getVoiceLatencyStats('stt');
      expect(stats.count).toBe(1);
      expect(mockLatency).toHaveBeenCalledWith(
        'stt',
        expect.any(Number),
        expect.objectContaining({ provider: 'whisper', outcome: 'ok' }),
      );
    });

    it('records duration + rethrows on error', async () => {
      await expect(
        withVoicePhaseSpan('tts', 'elevenlabs', async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(mockLatency).toHaveBeenCalledWith(
        'tts',
        expect.any(Number),
        expect.objectContaining({ provider: 'elevenlabs', outcome: 'error' }),
      );
    });
  });
});
