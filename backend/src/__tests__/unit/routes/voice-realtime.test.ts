/**
 * Voice Realtime Route Tests
 *
 * Tests the REST API for voice session management and TTS.
 */

import express from 'express';
import request from 'supertest';
import { voiceRealtimeRouter } from '../../../routes/voice-realtime';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireScope: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../../utils/user-context', () => ({
  getUserId: () => '00000000-0000-0000-0000-000000000001',
}));

const mockStartSession = jest.fn();
const mockEndSession = jest.fn();
const mockGetSessionStatus = jest.fn();
const mockTextToSpeech = jest.fn();
const mockGenerateMorningBriefing = jest.fn();

jest.mock('../../../services/voice/voice-pipeline', () => ({
  voicePipeline: {
    startSession: (...args: unknown[]) => mockStartSession(...args),
    endSession: (...args: unknown[]) => mockEndSession(...args),
    getSessionStatus: (...args: unknown[]) => mockGetSessionStatus(...args),
    textToSpeech: (...args: unknown[]) => mockTextToSpeech(...args),
    generateMorningBriefing: (...args: unknown[]) => mockGenerateMorningBriefing(...args),
  },
}));

const mockGetVoices = jest.fn();

jest.mock('../../../services/voice/tts-service', () => ({
  multiTTSService: {
    getVoices: (...args: unknown[]) => mockGetVoices(...args),
    getAvailableProviders: () => ['edge-tts'],
    getCacheStats: () => ({ hits: 0, misses: 0 }),
  },
}));

jest.mock('../../../services/voice/stt-service', () => ({
  sttService: {
    getAvailableProviders: () => ['whisper'],
  },
}));

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn().mockResolvedValue({ rows: [] }),
  isValidContext: (ctx: string) => ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Voice Realtime Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', voiceRealtimeRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /:context/voice/session/start', () => {
    it('should start a voice session', async () => {
      mockStartSession.mockResolvedValue({ sessionId: 'sess-1', status: 'active' });
      const res = await request(app).post('/api/personal/voice/session/start').send({});
      expect(res.status).toBe(200);
      expect(res.body.data.sessionId).toBe('sess-1');
    });

    it('should reject invalid context', async () => {
      const res = await request(app).post('/api/invalid/voice/session/start').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /:context/voice/session/:id/end', () => {
    it('should end a voice session', async () => {
      mockEndSession.mockResolvedValue(undefined);
      const res = await request(app).post('/api/personal/voice/session/sess-1/end');
      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Session ended');
    });
  });

  describe('GET /:context/voice/session/:id/status', () => {
    it('should return session status', async () => {
      mockGetSessionStatus.mockReturnValue({ status: 'active', turns: 3 });
      const res = await request(app).get('/api/personal/voice/session/sess-1/status');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    it('should return 404 for non-existent session', async () => {
      mockGetSessionStatus.mockReturnValue(null);
      const res = await request(app).get('/api/personal/voice/session/nonexistent/status');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:context/voice/tts', () => {
    it('should generate TTS audio', async () => {
      const audioBuffer = Buffer.from('fake-audio-data');
      mockTextToSpeech.mockResolvedValue(audioBuffer);
      const res = await request(app).post('/api/personal/voice/tts').send({ text: 'Hello world' });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('audio/mpeg');
    });

    it('should reject empty text', async () => {
      const res = await request(app).post('/api/personal/voice/tts').send({ text: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:context/voice/voices', () => {
    it('should return available voices', async () => {
      mockGetVoices.mockResolvedValue([{ id: 'de-DE-ConradNeural', name: 'Conrad' }]);
      const res = await request(app).get('/api/personal/voice/voices');
      expect(res.status).toBe(200);
      expect(res.body.data.voices).toHaveLength(1);
    });
  });

  describe('GET /:context/voice/settings', () => {
    it('should return default settings when none exist', async () => {
      const res = await request(app).get('/api/personal/voice/settings');
      expect(res.status).toBe(200);
      expect(res.body.data.stt_provider).toBe('whisper');
    });
  });

  describe('GET /:context/voice/briefing', () => {
    it('should return text briefing', async () => {
      mockGenerateMorningBriefing.mockResolvedValue({ text: 'Guten Morgen!' });
      const res = await request(app).get('/api/personal/voice/briefing');
      expect(res.status).toBe(200);
      expect(res.body.data.text).toBe('Guten Morgen!');
    });
  });

  describe('GET /:context/voice/providers', () => {
    it('should return available providers', async () => {
      const res = await request(app).get('/api/personal/voice/providers');
      expect(res.status).toBe(200);
      expect(res.body.data.stt.available).toContain('whisper');
      expect(res.body.data.tts.available).toContain('edge-tts');
    });
  });
});
