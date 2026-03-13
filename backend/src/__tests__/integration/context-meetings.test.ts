/**
 * Integration Tests for Context-Aware Meetings API
 *
 * Tests the /api/:context/meetings/* routes with mocked services.
 * Uses supertest to simulate HTTP requests.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { contextMeetingsRouter } from '../../routes/meetings';
import { errorHandler } from '../../middleware/errorHandler';

// Mock all external dependencies
jest.mock('../../services/meetings', () => ({
  createMeeting: jest.fn(),
  getMeetings: jest.fn(),
  getMeeting: jest.fn(),
  updateMeetingStatus: jest.fn(),
  processMeetingNotes: jest.fn(),
  getMeetingNotes: jest.fn(),
  searchMeetings: jest.fn(),
  searchMeetingsFullText: jest.fn(),
  searchMeetingsHybrid: jest.fn(),
  getAllActionItems: jest.fn(),
}));

jest.mock('../../services/whisper', () => ({
  transcribeAudio: jest.fn(),
}));

jest.mock('../../services/audio-storage', () => ({
  uploadMeetingAudio: jest.fn(),
  getSignedAudioUrl: jest.fn(),
  isAudioStorageAvailable: jest.fn().mockReturnValue(true),
}));

jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: (_req: any, _res: any, next: any) => {
    _req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  },
  requireScope: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../utils/database-context', () => ({
  isValidContext: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  createMeeting,
  getMeetings,
  getMeeting,
  processMeetingNotes,
  getMeetingNotes,
  searchMeetingsHybrid,
  searchMeetingsFullText,
  searchMeetings,
} from '../../services/meetings';
import { getSignedAudioUrl } from '../../services/audio-storage';
import { isValidContext } from '../../utils/database-context';

const mockCreateMeeting = createMeeting as jest.MockedFunction<typeof createMeeting>;
const mockGetMeetings = getMeetings as jest.MockedFunction<typeof getMeetings>;
const mockGetMeeting = getMeeting as jest.MockedFunction<typeof getMeeting>;
const mockProcessMeetingNotes = processMeetingNotes as jest.MockedFunction<typeof processMeetingNotes>;
const mockGetMeetingNotes = getMeetingNotes as jest.MockedFunction<typeof getMeetingNotes>;
const mockSearchMeetingsHybrid = searchMeetingsHybrid as jest.MockedFunction<typeof searchMeetingsHybrid>;
const mockGetSignedAudioUrl = getSignedAudioUrl as jest.MockedFunction<typeof getSignedAudioUrl>;
const mockIsValidContext = isValidContext as jest.MockedFunction<typeof isValidContext>;

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';
const INVALID_UUID = 'not-a-uuid';

const sampleMeeting = {
  id: VALID_UUID,
  company_id: 'company-1',
  title: 'Sprint Planning',
  date: '2026-03-01T10:00:00Z',
  duration_minutes: 60,
  participants: ['Alice', 'Bob'],
  location: 'Room A',
  meeting_type: 'team' as const,
  status: 'scheduled' as const,
  created_at: '2026-03-01T09:00:00Z',
  updated_at: '2026-03-01T09:00:00Z',
};

const sampleNotes = {
  id: '123e4567-e89b-12d3-a456-426614174001',
  meeting_id: VALID_UUID,
  raw_transcript: 'We discussed the roadmap.',
  structured_summary: 'Roadmap discussion.',
  key_decisions: ['Approved roadmap'],
  action_items: [{ task: 'Update docs', assignee: 'Alice', priority: 'high' as const, completed: false }],
  topics_discussed: ['Roadmap'],
  follow_ups: [{ topic: 'Doc review', responsible: 'Bob' }],
  sentiment: 'positive' as const,
  audio_storage_path: null as string | null,
  audio_duration_seconds: undefined,
  audio_size_bytes: undefined,
  audio_mime_type: undefined,
  created_at: '2026-03-01T11:00:00Z',
};

describe('Context-Aware Meetings API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/:context/meetings', contextMeetingsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsValidContext.mockReturnValue(true);
  });

  // ===========================================
  // GET /api/:context/meetings
  // ===========================================

  describe('GET /api/:context/meetings', () => {
    it('should return meetings list', async () => {
      mockGetMeetings.mockResolvedValueOnce({
        meetings: [sampleMeeting],
        total: 1,
      });

      const res = await request(app)
        .get('/api/work/meetings')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Sprint Planning');
      expect(res.body.pagination.total).toBe(1);
    });

    it('should pass context to service', async () => {
      mockGetMeetings.mockResolvedValueOnce({ meetings: [], total: 0 });

      await request(app)
        .get('/api/personal/meetings')
        .expect(200);

      expect(mockGetMeetings).toHaveBeenCalledWith(
        expect.objectContaining({ context: 'personal' })
      );
    });

    it('should pass has_audio filter', async () => {
      mockGetMeetings.mockResolvedValueOnce({ meetings: [], total: 0 });

      await request(app)
        .get('/api/work/meetings?has_audio=true')
        .expect(200);

      expect(mockGetMeetings).toHaveBeenCalledWith(
        expect.objectContaining({ has_audio: true })
      );
    });

    it('should return empty list when no meetings found', async () => {
      mockGetMeetings.mockResolvedValueOnce({ meetings: [], total: 0 });

      const res = await request(app)
        .get('/api/work/meetings')
        .expect(200);

      expect(res.body.data).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });
  });

  // ===========================================
  // GET /api/:context/meetings/:id
  // ===========================================

  describe('GET /api/:context/meetings/:id', () => {
    it('should return meeting with notes', async () => {
      mockGetMeeting.mockResolvedValueOnce(sampleMeeting);
      mockGetMeetingNotes.mockResolvedValueOnce(sampleNotes as any);

      const res = await request(app)
        .get(`/api/work/meetings/${VALID_UUID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.meeting.id).toBe(VALID_UUID);
      expect(res.body.data.notes).toBeDefined();
    });

    it('should return 404 when meeting not found', async () => {
      mockGetMeeting.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/work/meetings/${VALID_UUID}`)
        .expect(404);

      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app)
        .get(`/api/work/meetings/${INVALID_UUID}`)
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });
  });

  // ===========================================
  // POST /api/:context/meetings
  // ===========================================

  describe('POST /api/:context/meetings', () => {
    it('should create a meeting', async () => {
      mockCreateMeeting.mockResolvedValueOnce(sampleMeeting);

      const res = await request(app)
        .post('/api/work/meetings')
        .send({
          title: 'Sprint Planning',
          date: '2026-03-01T10:00:00Z',
          participants: ['Alice', 'Bob'],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Sprint Planning');
    });

    it('should pass context from URL to service', async () => {
      mockCreateMeeting.mockResolvedValueOnce(sampleMeeting);

      await request(app)
        .post('/api/learning/meetings')
        .send({
          title: 'Study Session',
          date: '2026-03-01T10:00:00Z',
        })
        .expect(201);

      expect(mockCreateMeeting).toHaveBeenCalledWith(
        expect.objectContaining({ context: 'learning' })
      );
    });
  });

  // ===========================================
  // POST /api/:context/meetings/:id/notes
  // ===========================================

  describe('POST /api/:context/meetings/:id/notes', () => {
    it('should process transcript and return notes', async () => {
      mockGetMeeting.mockResolvedValueOnce(sampleMeeting);
      mockProcessMeetingNotes.mockResolvedValueOnce(sampleNotes as any);

      const res = await request(app)
        .post(`/api/work/meetings/${VALID_UUID}/notes`)
        .send({ transcript: 'We discussed the roadmap.' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notes).toBeDefined();
      expect(res.body.performance).toHaveProperty('totalMs');
    });

    it('should return 400 when no transcript or audio provided', async () => {
      mockGetMeeting.mockResolvedValueOnce(sampleMeeting);

      const res = await request(app)
        .post(`/api/work/meetings/${VALID_UUID}/notes`)
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    it('should return 404 when meeting does not exist', async () => {
      mockGetMeeting.mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/api/work/meetings/${VALID_UUID}/notes`)
        .send({ transcript: 'Some text' })
        .expect(404);

      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for invalid meeting UUID', async () => {
      const res = await request(app)
        .post(`/api/work/meetings/${INVALID_UUID}/notes`)
        .send({ transcript: 'Some text' })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });
  });

  // ===========================================
  // POST /api/:context/meetings/search
  // ===========================================

  describe('POST /api/:context/meetings/search', () => {
    it('should perform hybrid search by default', async () => {
      mockSearchMeetingsHybrid.mockResolvedValueOnce([
        { meeting: sampleMeeting, notes: sampleNotes, similarity: 0.85, snippet: '...roadmap...' },
      ] as any);

      const res = await request(app)
        .post('/api/work/meetings/search')
        .send({ query: 'roadmap' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.mode).toBe('hybrid');
      expect(res.body).toHaveProperty('processingTime');
    });

    it('should return 400 for empty query', async () => {
      const res = await request(app)
        .post('/api/work/meetings/search')
        .send({ query: '' })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for missing query', async () => {
      const res = await request(app)
        .post('/api/work/meetings/search')
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    it('should respect search limit (max 50)', async () => {
      mockSearchMeetingsHybrid.mockResolvedValueOnce([]);

      await request(app)
        .post('/api/work/meetings/search')
        .send({ query: 'test', limit: 100 })
        .expect(200);

      expect(mockSearchMeetingsHybrid).toHaveBeenCalledWith('test', 50, 'work');
    });
  });

  // ===========================================
  // GET /api/:context/meetings/:id/audio-url
  // ===========================================

  describe('GET /api/:context/meetings/:id/audio-url', () => {
    it('should return signed URL when audio exists', async () => {
      const notesWithAudio = {
        ...sampleNotes,
        audio_storage_path: 'work/meeting-123/1700000000.webm',
        audio_duration_seconds: 3600,
        audio_size_bytes: 5242880,
        audio_mime_type: 'audio/webm',
      };
      mockGetMeetingNotes.mockResolvedValueOnce(notesWithAudio as any);
      mockGetSignedAudioUrl.mockResolvedValueOnce('https://supabase.co/signed/abc');

      const res = await request(app)
        .get(`/api/work/meetings/${VALID_UUID}/audio-url`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.hasAudio).toBe(true);
      expect(res.body.data.audioUrl).toBe('https://supabase.co/signed/abc');
      expect(res.body.data.durationSeconds).toBe(3600);
      expect(res.body.data.sizeBytes).toBe(5242880);
      expect(res.body.data.mimeType).toBe('audio/webm');
    });

    it('should return hasAudio: false when no audio path', async () => {
      mockGetMeetingNotes.mockResolvedValueOnce(sampleNotes as any);

      const res = await request(app)
        .get(`/api/work/meetings/${VALID_UUID}/audio-url`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.hasAudio).toBe(false);
      expect(res.body.data.audioUrl).toBeNull();
    });

    it('should return 404 when notes not found', async () => {
      mockGetMeetingNotes.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/work/meetings/${VALID_UUID}/audio-url`)
        .expect(404);

      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await request(app)
        .get(`/api/work/meetings/${INVALID_UUID}/audio-url`)
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });
  });

  // ===========================================
  // Invalid context
  // ===========================================

  describe('Invalid context handling', () => {
    it('should return 400 for invalid context', async () => {
      mockIsValidContext.mockReturnValue(false);

      const res = await request(app)
        .get('/api/invalid_ctx/meetings')
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });
  });

  // ===========================================
  // Error handling
  // ===========================================

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockGetMeetings.mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app)
        .get('/api/work/meetings')
        .expect(500);

      expect(res.body).toHaveProperty('error');
    });
  });
});
