/**
 * Integration Tests for Meetings API
 *
 * Tests the Meetings router endpoints with mocked services.
 * Uses supertest to simulate HTTP requests.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { meetingsRouter } from '../../routes/meetings';

// Mock all external dependencies
jest.mock('../../services/meetings', () => ({
  createMeeting: jest.fn(),
  getMeetings: jest.fn(),
  getMeeting: jest.fn(),
  updateMeetingStatus: jest.fn(),
  processMeetingNotes: jest.fn(),
  getMeetingNotes: jest.fn(),
  searchMeetings: jest.fn(),
  getAllActionItems: jest.fn(),
}));

jest.mock('../../services/whisper', () => ({
  transcribeAudio: jest.fn(),
}));

// Mock auth middleware to bypass authentication in tests
jest.mock('../../middleware/auth', () => ({
  apiKeyAuth: jest.fn((req: any, res: any, next: any) => {
    req.apiKey = { id: 'test-key', name: 'Test', scopes: ['read', 'write', 'admin'], rateLimit: 10000 };
    next();
  }),
  requireScope: jest.fn(() => (req: any, res: any, next: any) => next()),
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
  updateMeetingStatus,
  processMeetingNotes,
  getMeetingNotes,
  searchMeetings,
  getAllActionItems,
} from '../../services/meetings';
import { errorHandler } from '../../middleware/errorHandler';

const mockCreateMeeting = createMeeting as jest.MockedFunction<typeof createMeeting>;
const mockGetMeetings = getMeetings as jest.MockedFunction<typeof getMeetings>;
const mockGetMeeting = getMeeting as jest.MockedFunction<typeof getMeeting>;
const mockUpdateMeetingStatus = updateMeetingStatus as jest.MockedFunction<typeof updateMeetingStatus>;
const mockProcessMeetingNotes = processMeetingNotes as jest.MockedFunction<typeof processMeetingNotes>;
const mockGetMeetingNotes = getMeetingNotes as jest.MockedFunction<typeof getMeetingNotes>;
const mockSearchMeetings = searchMeetings as jest.MockedFunction<typeof searchMeetings>;
const mockGetAllActionItems = getAllActionItems as jest.MockedFunction<typeof getAllActionItems>;

// Sample meeting data
const sampleMeeting = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  title: 'Test Meeting',
  date: '2026-01-20T10:00:00Z',
  company_id: 'company-123',
  duration_minutes: 60,
  participants: ['Alice', 'Bob'],
  location: 'Conference Room A',
  meeting_type: 'sync',
  status: 'scheduled',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const sampleNotes = {
  id: '123e4567-e89b-12d3-a456-426614174001',
  meeting_id: sampleMeeting.id,
  raw_notes: 'Raw meeting notes here',
  processed_summary: 'Processed summary',
  key_points: ['Point 1', 'Point 2'],
  action_items: [
    { task: 'Follow up with client', assignee: 'Alice', due_date: '2026-01-25' },
  ],
  decisions: ['Decision 1'],
  created_at: new Date().toISOString(),
};

describe('Meetings API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/meetings', meetingsRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // POST /api/meetings
  // ===========================================

  describe('POST /api/meetings', () => {
    it('should create a new meeting', async () => {
      mockCreateMeeting.mockResolvedValueOnce(sampleMeeting as any);

      const res = await request(app)
        .post('/api/meetings')
        .send({
          title: 'Test Meeting',
          date: '2026-01-20T10:00:00Z',
          company_id: 'company-123',
          duration_minutes: 60,
          participants: ['Alice', 'Bob'],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.meeting).toHaveProperty('id');
      expect(res.body.meeting.title).toBe('Test Meeting');
      expect(mockCreateMeeting).toHaveBeenCalledTimes(1);
    });

    it('should return 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/meetings')
        .send({
          date: '2026-01-20T10:00:00Z',
        })
        .expect(400);

      expect(res.body).toHaveProperty('error');
      expect(mockCreateMeeting).not.toHaveBeenCalled();
    });

    it('should return 400 when date is missing', async () => {
      const res = await request(app)
        .post('/api/meetings')
        .send({
          title: 'Test Meeting',
        })
        .expect(400);

      expect(res.body).toHaveProperty('error');
      expect(mockCreateMeeting).not.toHaveBeenCalled();
    });
  });

  // ===========================================
  // GET /api/meetings
  // ===========================================

  describe('GET /api/meetings', () => {
    it('should return paginated list of meetings', async () => {
      mockGetMeetings.mockResolvedValueOnce({
        meetings: [sampleMeeting] as any[],
        total: 1,
      });

      const res = await request(app)
        .get('/api/meetings')
        .expect(200);

      expect(res.body).toHaveProperty('meetings');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.meetings).toHaveLength(1);
      expect(res.body.meetings[0].title).toBe('Test Meeting');
    });

    it('should filter meetings by company_id', async () => {
      mockGetMeetings.mockResolvedValueOnce({
        meetings: [sampleMeeting] as any[],
        total: 1,
      });

      const res = await request(app)
        .get('/api/meetings?company_id=company-123')
        .expect(200);

      expect(mockGetMeetings).toHaveBeenCalledWith(
        expect.objectContaining({ company_id: 'company-123' })
      );
    });

    it('should filter meetings by status', async () => {
      mockGetMeetings.mockResolvedValueOnce({
        meetings: [sampleMeeting] as any[],
        total: 1,
      });

      const res = await request(app)
        .get('/api/meetings?status=scheduled')
        .expect(200);

      expect(mockGetMeetings).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'scheduled' })
      );
    });

    it('should filter meetings by date range', async () => {
      mockGetMeetings.mockResolvedValueOnce({
        meetings: [sampleMeeting] as any[],
        total: 1,
      });

      const res = await request(app)
        .get('/api/meetings?from_date=2026-01-01&to_date=2026-01-31')
        .expect(200);

      expect(mockGetMeetings).toHaveBeenCalledWith(
        expect.objectContaining({
          from_date: '2026-01-01',
          to_date: '2026-01-31',
        })
      );
    });

    it('should return empty array when no meetings found', async () => {
      mockGetMeetings.mockResolvedValueOnce({
        meetings: [],
        total: 0,
      });

      const res = await request(app)
        .get('/api/meetings')
        .expect(200);

      expect(res.body.meetings).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });
  });

  // ===========================================
  // GET /api/meetings/:id
  // ===========================================

  describe('GET /api/meetings/:id', () => {
    it('should return a single meeting by ID', async () => {
      mockGetMeeting.mockResolvedValueOnce(sampleMeeting as any);

      const res = await request(app)
        .get(`/api/meetings/${sampleMeeting.id}`)
        .expect(200);

      expect(res.body).toHaveProperty('meeting');
      expect(res.body.meeting.id).toBe(sampleMeeting.id);
      expect(res.body.meeting.title).toBe('Test Meeting');
    });

    it('should return 404 for non-existent meeting', async () => {
      mockGetMeeting.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/meetings/123e4567-e89b-12d3-a456-426614174999')
        .expect(404);

      expect(res.body).toHaveProperty('error');
    });
  });

  // ===========================================
  // PUT /api/meetings/:id/status
  // ===========================================

  describe('PUT /api/meetings/:id/status', () => {
    it('should update meeting status', async () => {
      mockUpdateMeetingStatus.mockResolvedValueOnce({
        ...sampleMeeting,
        status: 'completed',
      } as any);

      const res = await request(app)
        .put(`/api/meetings/${sampleMeeting.id}/status`)
        .send({ status: 'completed' })
        .expect(200);

      expect(res.body.meeting.status).toBe('completed');
      expect(mockUpdateMeetingStatus).toHaveBeenCalledWith(
        sampleMeeting.id,
        'completed'
      );
    });

    it('should return 400 for invalid status', async () => {
      const res = await request(app)
        .put(`/api/meetings/${sampleMeeting.id}/status`)
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });
  });

  // ===========================================
  // POST /api/meetings/:id/notes
  // ===========================================

  describe('POST /api/meetings/:id/notes', () => {
    it('should process and store meeting notes', async () => {
      // Need to mock getMeeting first since route checks if meeting exists
      mockGetMeeting.mockResolvedValueOnce(sampleMeeting as any);
      mockProcessMeetingNotes.mockResolvedValueOnce(sampleNotes as any);

      const res = await request(app)
        .post(`/api/meetings/${sampleMeeting.id}/notes`)
        .send({
          transcript: 'Raw meeting notes here',
        })
        .expect(200);

      expect(res.body).toHaveProperty('notes');
      expect(res.body.notes).toHaveProperty('processed_summary');
      expect(res.body.notes).toHaveProperty('key_points');
      expect(res.body.notes).toHaveProperty('action_items');
    });

    it('should return 400 when notes are missing', async () => {
      // Need to mock getMeeting first since route checks if meeting exists
      mockGetMeeting.mockResolvedValueOnce(sampleMeeting as any);

      const res = await request(app)
        .post(`/api/meetings/${sampleMeeting.id}/notes`)
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });
  });

  // ===========================================
  // GET /api/meetings/:id/notes
  // ===========================================

  describe('GET /api/meetings/:id/notes', () => {
    it('should return meeting notes', async () => {
      mockGetMeetingNotes.mockResolvedValueOnce(sampleNotes as any);

      const res = await request(app)
        .get(`/api/meetings/${sampleMeeting.id}/notes`)
        .expect(200);

      expect(res.body).toHaveProperty('notes');
      expect(res.body.notes.meeting_id).toBe(sampleMeeting.id);
    });

    it('should return 404 when notes not found', async () => {
      mockGetMeetingNotes.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/meetings/${sampleMeeting.id}/notes`)
        .expect(404);

      expect(res.body).toHaveProperty('error');
    });
  });

  // ===========================================
  // POST /api/meetings/search
  // ===========================================

  describe('POST /api/meetings/search', () => {
    it('should search meetings by query', async () => {
      mockSearchMeetings.mockResolvedValueOnce([sampleMeeting] as any[]);

      const res = await request(app)
        .post('/api/meetings/search')
        .send({ query: 'test meeting', limit: 10 })
        .expect(200);

      expect(res.body).toHaveProperty('results');
      expect(res.body).toHaveProperty('count');
      expect(res.body.results).toHaveLength(1);
    });

    it('should return 400 when query is missing', async () => {
      const res = await request(app)
        .post('/api/meetings/search')
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });

    it('should use default limit when not specified', async () => {
      mockSearchMeetings.mockResolvedValueOnce([]);

      await request(app)
        .post('/api/meetings/search')
        .send({ query: 'test' })
        .expect(200);

      expect(mockSearchMeetings).toHaveBeenCalledWith('test', 10);
    });
  });

  // ===========================================
  // GET /api/meetings/action-items/all
  // ===========================================

  describe('GET /api/meetings/action-items/all', () => {
    it('should return all action items', async () => {
      const actionItems = [
        { id: '1', task: 'Task 1', assignee: 'Alice', completed: false },
        { id: '2', task: 'Task 2', assignee: 'Bob', completed: true },
      ];
      mockGetAllActionItems.mockResolvedValueOnce(actionItems as any[]);

      const res = await request(app)
        .get('/api/meetings/action-items/all')
        .expect(200);

      expect(res.body).toHaveProperty('action_items');
      expect(res.body).toHaveProperty('count');
      expect(res.body.action_items).toHaveLength(2);
    });

    it('should filter action items by completed status', async () => {
      mockGetAllActionItems.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/meetings/action-items/all?completed=false')
        .expect(200);

      expect(mockGetAllActionItems).toHaveBeenCalledWith(
        expect.objectContaining({ completed: false })
      );
    });

    it('should filter action items by company_id', async () => {
      mockGetAllActionItems.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/meetings/action-items/all?company_id=company-123')
        .expect(200);

      expect(mockGetAllActionItems).toHaveBeenCalledWith(
        expect.objectContaining({ company_id: 'company-123' })
      );
    });
  });

  // ===========================================
  // Error Handling
  // ===========================================

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockGetMeetings.mockRejectedValueOnce(new Error('Database error'));

      const res = await request(app)
        .get('/api/meetings')
        .expect(500);

      expect(res.body).toHaveProperty('error');
    });
  });
});
