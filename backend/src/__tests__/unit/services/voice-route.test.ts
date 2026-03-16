/**
 * Voice Realtime Route Tests
 * Phase 57: Real-Time Voice Pipeline
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../../services/voice/voice-pipeline', () => ({
  voicePipeline: {
    startSession: jest.fn(),
    endSession: jest.fn(),
    getSessionStatus: jest.fn(),
    textToSpeech: jest.fn(),
  },
}));

jest.mock('../../../services/voice/tts-service', () => ({
  multiTTSService: {
    getVoices: jest.fn(),
    getAvailableProviders: jest.fn(() => ['edge-tts']),
    getCacheStats: jest.fn(() => ({ size: 0, maxEntries: 200 })),
    isAvailable: jest.fn(() => true),
  },
}));

jest.mock('../../../services/voice/stt-service', () => ({
  sttService: {
    getAvailableProviders: jest.fn(() => ['whisper']),
    isAvailable: jest.fn(() => true),
  },
}));

import { voiceRealtimeRouter } from '../../../routes/voice-realtime';
import { errorHandler } from '../../../middleware/errorHandler';
import { queryContext } from '../../../utils/database-context';
import { voicePipeline } from '../../../services/voice/voice-pipeline';
import { multiTTSService } from '../../../services/voice/tts-service';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockStartSession = voicePipeline.startSession as jest.MockedFunction<typeof voicePipeline.startSession>;
const mockEndSession = voicePipeline.endSession as jest.MockedFunction<typeof voicePipeline.endSession>;
const mockGetSessionStatus = voicePipeline.getSessionStatus as jest.MockedFunction<typeof voicePipeline.getSessionStatus>;
const mockTextToSpeech = voicePipeline.textToSpeech as jest.MockedFunction<typeof voicePipeline.textToSpeech>;
const mockGetVoices = multiTTSService.getVoices as jest.MockedFunction<typeof multiTTSService.getVoices>;

let app: express.Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api', voiceRealtimeRouter);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

describe('POST /api/:context/voice/session/start', () => {
  it('should start a voice session', async () => {
    mockStartSession.mockResolvedValue({
      sessionId: 'session-123',
      chatSessionId: 'chat-456',
    });

    const res = await request(app)
      .post('/api/personal/voice/session/start')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBe('session-123');
    expect(res.body.data.chatSessionId).toBe('chat-456');
  });

  it('should accept config options', async () => {
    mockStartSession.mockResolvedValue({
      sessionId: 'session-abc',
      chatSessionId: 'chat-def',
    });

    const res = await request(app)
      .post('/api/work/voice/session/start')
      .send({
        ttsVoice: 'de-DE-KatjaNeural',
        language: 'de-DE',
        silenceThreshold_ms: 2000,
      });

    expect(res.status).toBe(200);
    expect(mockStartSession).toHaveBeenCalledWith('work', expect.objectContaining({
      ttsVoice: 'de-DE-KatjaNeural',
    }));
  });

  it('should reject invalid context', async () => {
    const res = await request(app)
      .post('/api/invalid/voice/session/start')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should reject invalid silenceThreshold', async () => {
    const res = await request(app)
      .post('/api/personal/voice/session/start')
      .send({ silenceThreshold_ms: 100 }); // below 500 minimum

    expect(res.status).toBe(400);
  });
});

describe('POST /api/:context/voice/session/:id/end', () => {
  it('should end a voice session', async () => {
    mockEndSession.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/personal/voice/session/session-123/end')
      .send();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockEndSession).toHaveBeenCalledWith('session-123');
  });
});

describe('GET /api/:context/voice/session/:id/status', () => {
  it('should return session status', async () => {
    mockGetSessionStatus.mockReturnValue({
      active: true,
      turnCount: 5,
      totalDuration_ms: 30000,
    });

    const res = await request(app)
      .get('/api/personal/voice/session/session-123/status');

    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(true);
    expect(res.body.data.turnCount).toBe(5);
  });

  it('should return 404 for unknown session', async () => {
    mockGetSessionStatus.mockReturnValue(null);

    const res = await request(app)
      .get('/api/personal/voice/session/unknown/status');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/:context/voice/tts', () => {
  it('should synthesize text to audio', async () => {
    mockTextToSpeech.mockResolvedValue(Buffer.from('audio-data'));

    const res = await request(app)
      .post('/api/personal/voice/tts')
      .send({ text: 'Hello World' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
  });

  it('should reject empty text', async () => {
    const res = await request(app)
      .post('/api/personal/voice/tts')
      .send({ text: '' });

    expect(res.status).toBe(400);
  });

  it('should reject missing text', async () => {
    const res = await request(app)
      .post('/api/personal/voice/tts')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/:context/voice/voices', () => {
  it('should return available voices', async () => {
    mockGetVoices.mockResolvedValue([
      { id: 'de-DE-ConradNeural', name: 'Conrad', language: 'de-DE', provider: 'edge-tts' },
    ]);

    const res = await request(app)
      .get('/api/personal/voice/voices');

    expect(res.status).toBe(200);
    expect(res.body.data.voices).toHaveLength(1);
    expect(res.body.data.voices[0].id).toBe('de-DE-ConradNeural');
  });
});

describe('GET /api/:context/voice/settings', () => {
  it('should return voice settings', async () => {
    mockQueryContext.mockResolvedValue({
      rows: [{
        stt_provider: 'whisper',
        tts_provider: 'edge-tts',
        tts_voice: 'de-DE-ConradNeural',
        language: 'de-DE',
        vad_sensitivity: 0.5,
        silence_threshold_ms: 1500,
        auto_send: true,
      }],
      rowCount: 1,
    } as any);

    const res = await request(app)
      .get('/api/personal/voice/settings');

    expect(res.status).toBe(200);
    expect(res.body.data.tts_voice).toBe('de-DE-ConradNeural');
  });

  it('should return defaults when no settings exist', async () => {
    mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

    const res = await request(app)
      .get('/api/personal/voice/settings');

    expect(res.status).toBe(200);
    expect(res.body.data.stt_provider).toBe('whisper');
    expect(res.body.data.tts_provider).toBe('edge-tts');
  });
});

describe('PUT /api/:context/voice/settings', () => {
  it('should create settings when none exist', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // SELECT
      .mockResolvedValueOnce({
        rows: [{
          stt_provider: 'whisper',
          tts_provider: 'edge-tts',
          tts_voice: 'de-DE-KatjaNeural',
          language: 'de-DE',
        }],
        rowCount: 1,
      } as any); // INSERT

    const res = await request(app)
      .put('/api/personal/voice/settings')
      .send({ tts_voice: 'de-DE-KatjaNeural' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should update existing settings', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ id: 'settings-1' }], rowCount: 1 } as any) // SELECT
      .mockResolvedValueOnce({
        rows: [{ tts_voice: 'de-DE-KatjaNeural' }],
        rowCount: 1,
      } as any); // UPDATE

    const res = await request(app)
      .put('/api/personal/voice/settings')
      .send({ tts_voice: 'de-DE-KatjaNeural' });

    expect(res.status).toBe(200);
  });

  it('should reject invalid vad_sensitivity', async () => {
    const res = await request(app)
      .put('/api/personal/voice/settings')
      .send({ vad_sensitivity: 1.5 }); // above 1

    expect(res.status).toBe(400);
  });
});

describe('GET /api/:context/voice/providers', () => {
  it('should return available providers', async () => {
    const res = await request(app)
      .get('/api/personal/voice/providers');

    expect(res.status).toBe(200);
    expect(res.body.data.stt.available).toContain('whisper');
    expect(res.body.data.tts.available).toContain('edge-tts');
  });
});

describe('context validation', () => {
  it('should reject invalid context for all endpoints', async () => {
    const endpoints = [
      { method: 'post', path: '/api/invalid/voice/session/start' },
      { method: 'post', path: '/api/invalid/voice/session/x/end' },
      { method: 'get', path: '/api/invalid/voice/session/x/status' },
      { method: 'post', path: '/api/invalid/voice/tts' },
      { method: 'get', path: '/api/invalid/voice/voices' },
      { method: 'get', path: '/api/invalid/voice/settings' },
      { method: 'put', path: '/api/invalid/voice/settings' },
      { method: 'get', path: '/api/invalid/voice/providers' },
    ];

    for (const ep of endpoints) {
      const req = ep.method === 'get'
        ? request(app).get(ep.path)
        : ep.method === 'put'
          ? request(app).put(ep.path).send({})
          : request(app).post(ep.path).send({ text: 'test' });

      const res = await req;
      expect(res.status).toBe(400);
    }
  });
});
