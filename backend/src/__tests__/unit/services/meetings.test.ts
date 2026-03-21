/**
 * Unit Tests for Meetings Service
 *
 * Tests meeting CRUD, notes processing, search, and action items.
 */

import { queryContext } from '../../../utils/database-context';
import {
  createMeeting,
  getMeetings,
  getMeeting,
  updateMeetingStatus,
  processMeetingNotes,
  getMeetingNotes,
  searchMeetings,
  searchMeetingsFullText,
  searchMeetingsHybrid,
  getAllActionItems,
} from '../../../services/meetings';

// ===========================================
// Mocks
// ===========================================

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

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

jest.mock('../../../utils/ollama', () => ({
  structureWithOllama: jest.fn().mockResolvedValue({
    structured_summary: 'Meeting summary',
    key_decisions: ['Decision 1'],
    action_items: [{ task: 'Task 1', assignee: 'Alice', priority: 'high' }],
    topics_discussed: ['Topic A'],
    follow_ups: [{ topic: 'Follow up X', responsible: 'Bob' }],
    sentiment: 'positive',
  }),
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

jest.mock('../../../utils/embedding', () => ({
  formatForPgVector: jest.fn((arr: number[]) => `[${arr.join(',')}]`),
}));

jest.mock('../../../types', () => ({
  parseJsonbWithDefault: jest.fn((val: unknown, fallback: unknown) => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return fallback; }
    }
    return val;
  }),
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// Mock Data
// ===========================================

const mockMeetingRow = {
  id: 'meet-001',
  company_id: 'personal',
  title: 'Sprint Planning',
  date: '2026-03-20T10:00:00Z',
  duration_minutes: 60,
  participants: '["Alice","Bob"]',
  location: 'Room A',
  meeting_type: 'team',
  status: 'scheduled',
  created_at: '2026-03-20T09:00:00Z',
  updated_at: '2026-03-20T09:00:00Z',
};

const mockNotesRow = {
  id: 'note-001',
  meeting_id: 'meet-001',
  raw_transcript: 'We discussed the sprint goals...',
  structured_summary: 'Meeting summary',
  key_decisions: '["Decision 1"]',
  action_items: '[{"task":"Task 1","assignee":"Alice","priority":"high","completed":false}]',
  topics_discussed: '["Topic A"]',
  follow_ups: '[{"topic":"Follow up X","responsible":"Bob"}]',
  sentiment: 'positive',
  audio_storage_path: null,
  audio_duration_seconds: null,
  audio_size_bytes: null,
  audio_mime_type: null,
  created_at: '2026-03-20T11:00:00Z',
};

// ===========================================
// Tests
// ===========================================

describe('Meetings Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('createMeeting', () => {
    it('should create a meeting with default values', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockMeetingRow], rowCount: 1 } as any);

      const result = await createMeeting({ title: 'Sprint Planning', date: '2026-03-20T10:00:00Z' });

      expect(result.id).toBe('meet-001');
      expect(result.title).toBe('Sprint Planning');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('INSERT INTO meetings'),
        expect.any(Array)
      );
    });

    it('should use specified context', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockMeetingRow], rowCount: 1 } as any);

      await createMeeting({ title: 'Study Session', date: '2026-03-20', context: 'learning' });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'learning',
        expect.any(String),
        expect.any(Array)
      );
    });

    it('should pass participants as JSON string', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockMeetingRow], rowCount: 1 } as any);

      await createMeeting({
        title: 'Team meeting',
        date: '2026-03-20',
        participants: ['Alice', 'Bob'],
      });

      const args = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(args[5]).toBe(JSON.stringify(['Alice', 'Bob']));
    });
  });

  describe('getMeetings', () => {
    it('should return meetings with total count', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [mockMeetingRow], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '5' }], rowCount: 1 } as any);

      const result = await getMeetings();

      expect(result.meetings).toHaveLength(1);
      expect(result.total).toBe(5);
    });

    it('should apply status filter', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any);

      await getMeetings({ status: 'completed' });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('m.status = $');
    });

    it('should apply date range filters', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 } as any);

      await getMeetings({ from_date: '2026-01-01', to_date: '2026-12-31' });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('m.date >=');
      expect(sql).toContain('m.date <=');
    });
  });

  describe('getMeeting', () => {
    it('should return a meeting by id', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockMeetingRow], rowCount: 1 } as any);

      const result = await getMeeting('meet-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('meet-001');
    });

    it('should return null when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await getMeeting('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateMeetingStatus', () => {
    it('should update status and return meeting', async () => {
      const updatedRow = { ...mockMeetingRow, status: 'completed' };
      mockQueryContext.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 } as any);

      const result = await updateMeetingStatus('meet-001', 'completed');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
    });

    it('should return null when meeting not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await updateMeetingStatus('nonexistent', 'completed');

      expect(result).toBeNull();
    });
  });

  describe('processMeetingNotes', () => {
    it('should process transcript and create structured notes', async () => {
      // Insert notes query
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
      // updateMeetingStatus call
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockMeetingRow, status: 'completed' }], rowCount: 1 } as any);

      const result = await processMeetingNotes('meet-001', 'We discussed the sprint goals...');

      expect(result.meeting_id).toBe('meet-001');
      expect(result.structured_summary).toBe('Meeting summary');
      expect(result.key_decisions).toEqual(['Decision 1']);
      expect(result.action_items).toHaveLength(1);
      expect(result.action_items[0].task).toBe('Task 1');
      expect(result.sentiment).toBe('positive');
    });

    it('should include audio metadata when provided', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [mockMeetingRow], rowCount: 1 } as any);

      const audioMeta = {
        storagePath: '/audio/meeting.wav',
        durationSeconds: 3600,
        sizeBytes: 1024000,
        mimeType: 'audio/wav',
      };

      const result = await processMeetingNotes('meet-001', 'transcript', 'work', audioMeta);

      expect(result.audio_storage_path).toBe('/audio/meeting.wav');
      expect(result.audio_duration_seconds).toBe(3600);
      expect(result.audio_size_bytes).toBe(1024000);
    });
  });

  describe('getMeetingNotes', () => {
    it('should return notes for a meeting', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockNotesRow], rowCount: 1 } as any);

      const result = await getMeetingNotes('meet-001');

      expect(result).not.toBeNull();
      expect(result!.meeting_id).toBe('meet-001');
    });

    it('should return null when no notes exist', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await getMeetingNotes('meet-002');

      expect(result).toBeNull();
    });
  });

  describe('searchMeetings', () => {
    it('should return empty array when embedding is empty', async () => {
      const { generateEmbedding } = require('../../../utils/ollama');
      generateEmbedding.mockResolvedValueOnce([]);

      const result = await searchMeetings('test query');

      expect(result).toEqual([]);
    });
  });

  describe('getAllActionItems', () => {
    it('should return action items across meetings', async () => {
      const row = {
        ...mockMeetingRow,
        notes_id: 'note-001',
        action_items: [
          { task: 'Task 1', assignee: 'Alice', priority: 'high', completed: false },
          { task: 'Task 2', assignee: 'Bob', priority: 'low', completed: true },
        ],
      };
      mockQueryContext.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);

      const result = await getAllActionItems();

      expect(result).toHaveLength(2);
      expect(result[0].action_item.task).toBe('Task 1');
    });

    it('should filter by completed status', async () => {
      const row = {
        ...mockMeetingRow,
        notes_id: 'note-001',
        action_items: [
          { task: 'Done task', completed: true, priority: 'medium' },
          { task: 'Open task', completed: false, priority: 'high' },
        ],
      };
      mockQueryContext.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);

      const result = await getAllActionItems({ completed: false });

      expect(result).toHaveLength(1);
      expect(result[0].action_item.task).toBe('Open task');
    });
  });
});
