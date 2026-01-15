/**
 * Integration Tests for Voice Memo API
 *
 * Tests the voice memo router endpoints with mocked services.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { voiceMemoRouter } from '../../routes/voice-memo';

// Mock all external dependencies
jest.mock('../../services/whisper', () => ({
  transcribeAudio: jest.fn(),
  checkWhisperAvailable: jest.fn(),
}));

// Mock auth middleware to bypass authentication in tests
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((req, res, next) => {
    req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (req: any, res: any, next: any) => next()),
}));

jest.mock('../../utils/ollama', () => ({
  structureWithOllama: jest.fn(),
  generateEmbedding: jest.fn(),
}));

jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../services/knowledge-graph', () => ({
  analyzeRelationships: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../services/user-profile', () => ({
  trackInteraction: jest.fn().mockResolvedValue(undefined),
  suggestPriority: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../services/webhooks', () => ({
  triggerWebhook: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/learning-engine', () => ({
  learnFromThought: jest.fn().mockResolvedValue(undefined),
  suggestFromLearning: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/embedding', () => ({
  quantizeToInt8: jest.fn((arr) => arr.map(() => 0)),
  quantizeToBinary: jest.fn(() => '0'.repeat(768)),
  formatForPgVector: jest.fn((arr) => `[${arr.join(',')}]`),
}));

import { transcribeAudio, checkWhisperAvailable } from '../../services/whisper';
import { structureWithOllama, generateEmbedding } from '../../utils/ollama';
import { query } from '../../utils/database';
import { suggestFromLearning } from '../../services/learning-engine';

const mockTranscribeAudio = transcribeAudio as jest.MockedFunction<typeof transcribeAudio>;
const mockCheckWhisperAvailable = checkWhisperAvailable as jest.MockedFunction<typeof checkWhisperAvailable>;
const mockStructureWithOllama = structureWithOllama as jest.MockedFunction<typeof structureWithOllama>;
const mockGenerateEmbedding = generateEmbedding as jest.MockedFunction<typeof generateEmbedding>;
const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSuggestFromLearning = suggestFromLearning as jest.MockedFunction<typeof suggestFromLearning>;

describe('Voice Memo API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/voice-memo', voiceMemoRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockStructureWithOllama.mockResolvedValue({
      title: 'Test Idea',
      type: 'idea',
      category: 'business',
      priority: 'medium',
      summary: 'Test summary',
      next_steps: ['Step 1'],
      context_needed: [],
      keywords: ['test'],
    });

    mockGenerateEmbedding.mockResolvedValue(Array(768).fill(0.1));
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    mockSuggestFromLearning.mockResolvedValue(null);
  });

  // ===========================================
  // POST /api/voice-memo - Audio Upload
  // ===========================================

  describe('POST /api/voice-memo (audio upload)', () => {
    it('should process audio file and return structured idea', async () => {
      mockTranscribeAudio.mockResolvedValue({
        text: 'This is a test transcription',
        language: 'de',
        duration: 1500,
      });

      const response = await request(app)
        .post('/api/voice-memo')
        .attach('audio', Buffer.from('fake audio'), 'test.wav')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.ideaId).toBeDefined();
      expect(response.body.transcript).toBe('This is a test transcription');
      expect(response.body.structured).toBeDefined();
      expect(response.body.structured.title).toBe('Test Idea');
      expect(response.body.performance).toBeDefined();
      expect(mockTranscribeAudio).toHaveBeenCalled();
      expect(mockStructureWithOllama).toHaveBeenCalled();
    });

    it('should process m4a audio format', async () => {
      mockTranscribeAudio.mockResolvedValue({
        text: 'M4A transcription',
        language: 'de',
        duration: 2000,
      });

      const response = await request(app)
        .post('/api/voice-memo')
        .attach('audio', Buffer.from('fake m4a audio'), 'recording.m4a')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transcript).toBe('M4A transcription');
    });

    it('should fallback to body text if no audio file', async () => {
      const response = await request(app)
        .post('/api/voice-memo')
        .send({ text: 'Text from body' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transcript).toBe('Text from body');
      expect(mockTranscribeAudio).not.toHaveBeenCalled();
    });

    it('should return error if no audio or text provided', async () => {
      const response = await request(app)
        .post('/api/voice-memo')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('No audio file or transcript');
    });

    it('should apply learning suggestions when confidence is high', async () => {
      mockSuggestFromLearning.mockResolvedValue({
        suggested_type: 'task',
        suggested_category: 'technical',
        suggested_priority: 'high',
        confidence: 0.8,
        reasoning: 'Based on past behavior',
      });

      const response = await request(app)
        .post('/api/voice-memo')
        .send({ text: 'Test with learning' })
        .expect(200);

      expect(response.body.appliedLearning).toBe(true);
      expect(response.body.learningConfidence).toBe(0.8);
      // The structured result should have learning overrides applied
      expect(response.body.structured.category).toBe('technical');
      expect(response.body.structured.priority).toBe('high');
    });

    it('should not apply learning when confidence is low', async () => {
      mockSuggestFromLearning.mockResolvedValue({
        suggested_type: 'task',
        suggested_category: 'technical',
        suggested_priority: 'high',
        confidence: 0.3,
        reasoning: 'Low confidence',
      });

      const response = await request(app)
        .post('/api/voice-memo')
        .send({ text: 'Test without learning' })
        .expect(200);

      expect(response.body.appliedLearning).toBe(false);
      expect(response.body.learningConfidence).toBe(0.3);
    });

    it('should include performance metrics', async () => {
      mockTranscribeAudio.mockResolvedValue({
        text: 'Performance test',
        language: 'de',
        duration: 1000,
      });

      const response = await request(app)
        .post('/api/voice-memo')
        .attach('audio', Buffer.from('audio'), 'test.wav')
        .expect(200);

      expect(response.body.performance).toHaveProperty('totalMs');
      expect(response.body.performance).toHaveProperty('transcriptionMs');
      expect(response.body.performance).toHaveProperty('embeddingDimensions');
      expect(response.body.performance.embeddingDimensions).toBe(768);
    });
  });

  // ===========================================
  // POST /api/voice-memo/text - Text Only
  // ===========================================

  describe('POST /api/voice-memo/text', () => {
    it('should process plain text', async () => {
      const response = await request(app)
        .post('/api/voice-memo/text')
        .send({ text: 'This is my idea about improving productivity' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.ideaId).toBeDefined();
      expect(response.body.transcript).toBe('This is my idea about improving productivity');
      expect(response.body.structured).toBeDefined();
    });

    it('should return error if no text provided', async () => {
      const response = await request(app)
        .post('/api/voice-memo/text')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('No text provided');
    });

    it('should include suggested priority', async () => {
      const { suggestPriority } = require('../../services/user-profile');
      suggestPriority.mockResolvedValue('high');

      const response = await request(app)
        .post('/api/voice-memo/text')
        .send({ text: 'Urgent task' })
        .expect(200);

      expect(response.body.suggestedPriority).toBe('high');
    });

    it('should include processing time', async () => {
      const response = await request(app)
        .post('/api/voice-memo/text')
        .send({ text: 'Test' })
        .expect(200);

      expect(response.body.processingTime).toBeDefined();
      expect(typeof response.body.processingTime).toBe('number');
    });

    it('should store idea in database', async () => {
      await request(app)
        .post('/api/voice-memo/text')
        .send({ text: 'Database test' })
        .expect(200);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ideas'),
        expect.any(Array)
      );
    });
  });

  // ===========================================
  // POST /api/voice-memo/transcribe - Transcribe Only
  // ===========================================

  describe('POST /api/voice-memo/transcribe', () => {
    it('should transcribe audio without structuring', async () => {
      mockTranscribeAudio.mockResolvedValue({
        text: 'Transcribed text only',
        language: 'de',
        duration: 800,
      });

      const response = await request(app)
        .post('/api/voice-memo/transcribe')
        .attach('audio', Buffer.from('audio data'), 'test.wav')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.transcript).toBe('Transcribed text only');
      expect(response.body.language).toBe('de');
      expect(response.body.processingTime).toBeDefined();
      expect(mockStructureWithOllama).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should return error if no audio file', async () => {
      const response = await request(app)
        .post('/api/voice-memo/transcribe')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('No audio file');
    });
  });

  // ===========================================
  // GET /api/voice-memo/whisper-status
  // ===========================================

  describe('GET /api/voice-memo/whisper-status', () => {
    it('should return whisper availability status', async () => {
      mockCheckWhisperAvailable.mockResolvedValue(true);

      const response = await request(app)
        .get('/api/voice-memo/whisper-status')
        .expect(200);

      expect(response.body.whisperAvailable).toBe(true);
      expect(response.body.model).toBeDefined();
    });

    it('should return false when whisper not available', async () => {
      mockCheckWhisperAvailable.mockResolvedValue(false);

      const response = await request(app)
        .get('/api/voice-memo/whisper-status')
        .expect(200);

      expect(response.body.whisperAvailable).toBe(false);
    });
  });

  // ===========================================
  // Error Handling
  // ===========================================

  describe('Error Handling', () => {
    it('should handle transcription errors', async () => {
      mockTranscribeAudio.mockRejectedValue(new Error('Whisper not running'));

      const response = await request(app)
        .post('/api/voice-memo')
        .attach('audio', Buffer.from('audio'), 'test.wav')
        .expect(500);

      expect(response.body.error).toContain('Whisper');
    });

    it('should handle structuring errors gracefully', async () => {
      mockStructureWithOllama.mockRejectedValue(new Error('Ollama timeout'));

      const response = await request(app)
        .post('/api/voice-memo/text')
        .send({ text: 'Test' })
        .expect(500);

      expect(response.body.error).toContain('Ollama');
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Connection failed'));

      const response = await request(app)
        .post('/api/voice-memo/text')
        .send({ text: 'Test' })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });

    it('should continue even if background tasks fail', async () => {
      const { analyzeRelationships } = require('../../services/knowledge-graph');
      const { trackInteraction } = require('../../services/user-profile');

      analyzeRelationships.mockRejectedValue(new Error('Graph error'));
      trackInteraction.mockRejectedValue(new Error('Tracking error'));

      const response = await request(app)
        .post('/api/voice-memo/text')
        .send({ text: 'Test background failures' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // ===========================================
  // Embedding Handling
  // ===========================================

  describe('Embedding Handling', () => {
    it('should store idea with embedding when available', async () => {
      mockGenerateEmbedding.mockResolvedValue(Array(768).fill(0.5));

      await request(app)
        .post('/api/voice-memo/text')
        .send({ text: 'Test with embedding' })
        .expect(200);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('embedding'),
        expect.arrayContaining([expect.stringContaining('[')])
      );
    });

    it('should store idea without embedding when empty', async () => {
      mockGenerateEmbedding.mockResolvedValue([]);

      await request(app)
        .post('/api/voice-memo/text')
        .send({ text: 'Test without embedding' })
        .expect(200);

      // Should use query without embedding columns
      expect(mockQuery).toHaveBeenCalled();
    });
  });
});
