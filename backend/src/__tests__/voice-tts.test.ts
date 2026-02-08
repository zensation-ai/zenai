/**
 * Integration Tests for Voice/TTS API Endpoints
 *
 * Tests the TTS HTTP routes:
 * - GET /api/voice/status
 * - GET /api/voice/voices
 * - POST /api/voice/speak
 *
 * Phase 33 Sprint 4 - Feature 8
 */

import express, { Express } from 'express';
import request from 'supertest';
import { Readable } from 'stream';

// Mock dependencies BEFORE imports
jest.mock('../middleware/auth', () => ({
  apiKeyAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireScope: jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../services/tts', () => {
  const actual = jest.requireActual('../services/tts');
  return {
    ...actual,
    isTTSAvailable: jest.fn().mockReturnValue(true),
    streamSpeech: jest.fn().mockResolvedValue(
      Readable.from(Buffer.from('fake-audio-data'))
    ),
    synthesizeSpeech: jest.fn().mockResolvedValue({
      audioBuffer: Buffer.from('fake-audio-data'),
      format: 'mp3',
      durationMs: 150,
      voice: 'nova',
      textLength: 10,
    }),
  };
});

jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { voiceRouter } from '../routes/voice';
import { errorHandler } from '../middleware/errorHandler';
import { isTTSAvailable, streamSpeech } from '../services/tts';

const mockIsTTSAvailable = isTTSAvailable as jest.MockedFunction<typeof isTTSAvailable>;
const mockStreamSpeech = streamSpeech as jest.MockedFunction<typeof streamSpeech>;

describe('Voice/TTS API Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/voice', voiceRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsTTSAvailable.mockReturnValue(true);
    mockStreamSpeech.mockResolvedValue(
      Readable.from(Buffer.from('fake-audio-data'))
    );
  });

  // ============================================================
  // GET /api/voice/status
  // ============================================================

  describe('GET /api/voice/status', () => {
    it('should return TTS availability status', async () => {
      const response = await request(app)
        .get('/api/voice/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('ttsAvailable', true);
      expect(response.body.data).toHaveProperty('provider', 'openai');
      expect(response.body.data).toHaveProperty('model', 'tts-1');
      expect(response.body.data.voices).toBeInstanceOf(Array);
      expect(response.body.data.voices).toContain('nova');
    });

    it('should indicate unavailable when OpenAI not configured', async () => {
      mockIsTTSAvailable.mockReturnValue(false);

      const response = await request(app)
        .get('/api/voice/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ttsAvailable).toBe(false);
    });
  });

  // ============================================================
  // GET /api/voice/voices
  // ============================================================

  describe('GET /api/voice/voices', () => {
    it('should return available voices with descriptions', async () => {
      const response = await request(app)
        .get('/api/voice/voices')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.voices).toBeInstanceOf(Array);
      expect(response.body.data.voices.length).toBe(6);
      expect(response.body.data.defaultVoice).toBe('nova');

      const nova = response.body.data.voices.find(
        (v: { id: string }) => v.id === 'nova'
      );
      expect(nova).toBeDefined();
      expect(nova.name).toBe('Nova');
      expect(nova.description).toBeDefined();
    });
  });

  // ============================================================
  // POST /api/voice/speak
  // ============================================================

  describe('POST /api/voice/speak', () => {
    it('should return audio stream for valid text', async () => {
      const response = await request(app)
        .post('/api/voice/speak')
        .send({ text: 'Hallo Welt, dies ist ein Test.' })
        .expect(200);

      expect(response.headers['content-type']).toContain('audio/mpeg');
      expect(response.headers['transfer-encoding']).toBe('chunked');
      expect(mockStreamSpeech).toHaveBeenCalledWith(
        'Hallo Welt, dies ist ein Test.',
        expect.objectContaining({})
      );
    });

    it('should pass voice and speed options to TTS service', async () => {
      await request(app)
        .post('/api/voice/speak')
        .send({
          text: 'Test mit Optionen.',
          voice: 'echo',
          speed: 1.5,
          format: 'opus',
          model: 'tts-1-hd',
        })
        .expect(200);

      expect(mockStreamSpeech).toHaveBeenCalledWith(
        'Test mit Optionen.',
        expect.objectContaining({
          voice: 'echo',
          speed: 1.5,
          outputFormat: 'opus',
          model: 'tts-1-hd',
        })
      );
    });

    it('should reject empty text', async () => {
      const response = await request(app)
        .post('/api/voice/speak')
        .send({ text: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing text', async () => {
      const response = await request(app)
        .post('/api/voice/speak')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject text over 4096 characters', async () => {
      const longText = 'a'.repeat(4097);
      const response = await request(app)
        .post('/api/voice/speak')
        .send({ text: longText })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid voice', async () => {
      const response = await request(app)
        .post('/api/voice/speak')
        .send({ text: 'Test', voice: 'invalid_voice' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject speed below 0.25', async () => {
      const response = await request(app)
        .post('/api/voice/speak')
        .send({ text: 'Test', speed: 0.1 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject speed above 4.0', async () => {
      const response = await request(app)
        .post('/api/voice/speak')
        .send({ text: 'Test', speed: 5.0 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return error when TTS is unavailable', async () => {
      mockIsTTSAvailable.mockReturnValue(false);

      const response = await request(app)
        .post('/api/voice/speak')
        .send({ text: 'Hallo Welt' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not available');
    });

    it('should set correct Content-Type for opus format', async () => {
      const response = await request(app)
        .post('/api/voice/speak')
        .send({ text: 'Test opus format.', format: 'opus' })
        .expect(200);

      expect(response.headers['content-type']).toContain('audio/opus');
    });
  });

  // ============================================================
  // TTS Service Unit Tests
  // ============================================================

  describe('Sentence Chunker', () => {
    // Import directly (not mocked)
    const { createSentenceChunker } = jest.requireActual('../services/tts');

    it('should split text on sentence boundaries', () => {
      const chunker = createSentenceChunker();
      const sentences = chunker.push('Dies ist ein langer Satz. Hier ist noch ein anderer. ');
      expect(sentences.length).toBe(2);
      expect(sentences[0]).toBe('Dies ist ein langer Satz.');
      expect(sentences[1]).toBe('Hier ist noch ein anderer.');
    });

    it('should accumulate short fragments', () => {
      const chunker = createSentenceChunker();
      const sentences = chunker.push('Hi. ');
      expect(sentences.length).toBe(0); // Too short (< 20 chars)
    });

    it('should flush remaining buffer', () => {
      const chunker = createSentenceChunker();
      chunker.push('Dies ist ein unvollständiger');
      const remaining = chunker.flush();
      expect(remaining).toBe('Dies ist ein unvollständiger');
    });

    it('should return null on flush when buffer is empty', () => {
      const chunker = createSentenceChunker();
      const remaining = chunker.flush();
      expect(remaining).toBeNull();
    });

    it('should handle multiple pushes correctly', () => {
      const chunker = createSentenceChunker();
      chunker.push('Dies ist der ');
      chunker.push('erste Satz. ');
      const sentences = chunker.push('Und hier der zweite. ');
      expect(sentences.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle exclamation and question marks', () => {
      const chunker = createSentenceChunker();
      const sentences = chunker.push('Ist das wirklich ein richtiger Test? Ja, das ist es ganz bestimmt sicher! ');
      expect(sentences.length).toBe(2);
    });
  });
});
