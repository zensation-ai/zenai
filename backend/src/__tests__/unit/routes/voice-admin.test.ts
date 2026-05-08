/**
 * Sprint 1.13: Voice Admin Routes — status + breaker reset.
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../middleware/plan-gate', () => ({
  requirePlan: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => '00000000-0000-0000-0000-000000000001',
}));

jest.mock('../../../services/voice/voice-pipeline', () => ({
  voicePipeline: {
    startSession: jest.fn(),
    endSession: jest.fn(),
    getSessionStatus: jest.fn(),
    textToSpeech: jest.fn(),
    generateMorningBriefing: jest.fn(),
  },
}));

jest.mock('../../../services/voice/tts-service', () => ({
  multiTTSService: {
    getVoices: jest.fn().mockResolvedValue([]),
    getAvailableProviders: () => ['elevenlabs', 'edge-tts'],
    getCacheStats: () => ({ size: 42, maxEntries: 100 }),
  },
}));

jest.mock('../../../services/voice/stt-service', () => ({
  sttService: {
    getAvailableProviders: () => ['whisper', 'deepgram'],
  },
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  isValidContext: (ctx: string) => ['operations', 'finance', 'people', 'strategy'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { voiceRealtimeRouter } from '../../../routes/voice-realtime';
import { errorHandler } from '../../../middleware/errorHandler';
import { sttCircuitBreaker, ttsCircuitBreaker } from '../../../services/voice/provider-registry';
import { clearVoiceMetrics, recordVoicePhase } from '../../../services/voice/voice-metrics';

describe('Voice Admin Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', voiceRealtimeRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    sttCircuitBreaker.reset();
    ttsCircuitBreaker.reset();
    clearVoiceMetrics();
  });

  describe('GET /api/voice/admin/status', () => {
    it('returns provider availability + empty breaker state when healthy', async () => {
      const res = await request(app).get('/api/voice/admin/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stt.available).toEqual(['whisper', 'deepgram']);
      expect(res.body.data.stt.default).toBe('whisper');
      expect(res.body.data.stt.breaker).toEqual({});
      expect(res.body.data.stt.breakerConfig.failureThreshold).toBe(3);
      expect(res.body.data.stt.breakerConfig.cooldownMs).toBe(60_000);
      expect(res.body.data.tts.available).toEqual(['elevenlabs', 'edge-tts']);
      expect(res.body.data.tts.cache).toEqual({ size: 42, maxEntries: 100 });
    });

    it('surfaces open breakers in the status response', async () => {
      sttCircuitBreaker.recordFailure('deepgram');
      sttCircuitBreaker.recordFailure('deepgram');
      sttCircuitBreaker.recordFailure('deepgram');

      const res = await request(app).get('/api/voice/admin/status');
      expect(res.status).toBe(200);
      expect(res.body.data.stt.breaker.deepgram.isOpen).toBe(true);
      expect(res.body.data.stt.breaker.deepgram.remainingCooldownMs).toBeGreaterThan(0);
    });

    it('includes latency stats for all five phases', async () => {
      recordVoicePhase('stt', 120);
      recordVoicePhase('llm', 600);
      recordVoicePhase('end_to_end', 1200);

      const res = await request(app).get('/api/voice/admin/status');
      expect(res.status).toBe(200);
      expect(res.body.data.latency).toHaveProperty('audio_ingest');
      expect(res.body.data.latency).toHaveProperty('stt');
      expect(res.body.data.latency).toHaveProperty('llm');
      expect(res.body.data.latency).toHaveProperty('tts');
      expect(res.body.data.latency).toHaveProperty('end_to_end');
      expect(res.body.data.latency.stt.count).toBe(1);
      expect(res.body.data.latency.end_to_end.p95).toBeGreaterThanOrEqual(1200);
    });

    it('respects windowMs query parameter', async () => {
      const res = await request(app).get('/api/voice/admin/status?windowMs=300000');
      expect(res.status).toBe(200);
      expect(res.body.data.windowMs).toBe(300_000);
    });

    it('ignores invalid windowMs values', async () => {
      const res = await request(app).get('/api/voice/admin/status?windowMs=not-a-number');
      expect(res.status).toBe(200);
      expect(res.body.data.windowMs).toBeNull();
    });
  });

  describe('POST /api/voice/admin/breaker/:kind/:provider/reset', () => {
    it('resets an open STT breaker', async () => {
      sttCircuitBreaker.recordFailure('deepgram');
      sttCircuitBreaker.recordFailure('deepgram');
      sttCircuitBreaker.recordFailure('deepgram');
      expect(sttCircuitBreaker.isOpen('deepgram')).toBe(true);

      const res = await request(app).post('/api/voice/admin/breaker/stt/deepgram/reset');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.kind).toBe('stt');
      expect(res.body.data.provider).toBe('deepgram');
      expect(sttCircuitBreaker.isOpen('deepgram')).toBe(false);
    });

    it('resets a TTS breaker', async () => {
      ttsCircuitBreaker.recordFailure('elevenlabs');
      const res = await request(app).post('/api/voice/admin/breaker/tts/elevenlabs/reset');
      expect(res.status).toBe(200);
      expect(ttsCircuitBreaker.getStatus()).toEqual({});
    });

    it('returns 400 for invalid kind', async () => {
      const res = await request(app).post('/api/voice/admin/breaker/invalid/whisper/reset');
      expect(res.status).toBe(400);
    });

    it('returns 400 for overly long provider name', async () => {
      const long = 'a'.repeat(65);
      const res = await request(app).post(`/api/voice/admin/breaker/stt/${long}/reset`);
      expect(res.status).toBe(400);
    });

    it('is a no-op when the breaker for provider does not exist', async () => {
      const res = await request(app).post('/api/voice/admin/breaker/stt/never-registered/reset');
      expect(res.status).toBe(200);
      expect(res.body.data.breaker).toBeNull();
    });
  });
});
