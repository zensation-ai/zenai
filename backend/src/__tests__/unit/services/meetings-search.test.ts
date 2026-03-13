/**
 * Meetings Search & Processing Tests
 *
 * Tests full-text search, hybrid search (RRF), and processMeetingNotes
 * with audio metadata support.
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../utils/ollama', () => ({
  structureWithOllama: jest.fn(),
  generateEmbedding: jest.fn(),
}));

jest.mock('../../../utils/embedding', () => ({
  formatForPgVector: jest.fn().mockReturnValue('[0.1,0.2,0.3]'),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('generated-uuid-001'),
}));

import {
  searchMeetingsFullText,
  searchMeetingsHybrid,
  processMeetingNotes,
  getMeetings,
} from '../../../services/meetings';
import { queryContext } from '../../../utils/database-context';
import { structureWithOllama, generateEmbedding } from '../../../utils/ollama';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockStructureWithOllama = structureWithOllama as jest.MockedFunction<typeof structureWithOllama>;
const mockGenerateEmbedding = generateEmbedding as jest.MockedFunction<typeof generateEmbedding>;

// Helper: create a mock meeting+notes row from a joined query
function makeMeetingNotesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notes-1',
    meeting_id: 'meeting-1',
    raw_transcript: 'We discussed the project timeline and budget allocation.',
    structured_summary: 'Project timeline and budget discussed.',
    key_decisions: JSON.stringify(['Approved Q2 budget']),
    action_items: JSON.stringify([{ task: 'Review budget', assignee: 'Alice', priority: 'high' }]),
    topics_discussed: JSON.stringify(['Timeline', 'Budget']),
    follow_ups: JSON.stringify([{ topic: 'Budget review', responsible: 'Bob' }]),
    sentiment: 'positive',
    audio_storage_path: null,
    audio_duration_seconds: null,
    audio_size_bytes: null,
    audio_mime_type: null,
    created_at: '2026-03-01T10:00:00Z',
    // Joined meeting fields
    m_id: 'meeting-1',
    company_id: 'company-1',
    title: 'Sprint Planning',
    date: '2026-03-01T10:00:00Z',
    duration_minutes: 60,
    participants: JSON.stringify(['Alice', 'Bob']),
    location: 'Room A',
    meeting_type: 'team' as const,
    status: 'completed' as const,
    m_created_at: '2026-03-01T09:00:00Z',
    updated_at: '2026-03-01T11:00:00Z',
    rank: 0.8,
    ...overrides,
  };
}

describe('Meetings Search & Processing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // searchMeetingsFullText
  // ===========================================

  describe('searchMeetingsFullText', () => {
    it('should return results with snippet', async () => {
      const row = makeMeetingNotesRow();
      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const results = await searchMeetingsFullText('budget', 10, 'work');

      expect(results).toHaveLength(1);
      expect(results[0].meeting.title).toBe('Sprint Planning');
      expect(results[0].notes.structured_summary).toBe('Project timeline and budget discussed.');
      expect(results[0].snippet).toBeDefined();
    });

    it('should extract snippet around matching text', async () => {
      const row = makeMeetingNotesRow({
        raw_transcript: 'Some intro text. We discussed the budget allocation for Q2. Then we moved on.',
      });
      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const results = await searchMeetingsFullText('budget', 10, 'work');

      expect(results[0].snippet).toContain('budget');
    });

    it('should return empty array for no matches', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const results = await searchMeetingsFullText('nonexistent', 10, 'work');

      expect(results).toEqual([]);
    });

    it('should pass search query and limit to database', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await searchMeetingsFullText('timeline', 5, 'personal');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('plainto_tsquery'),
        ['timeline', 5]
      );
    });

    it('should use rank as similarity score', async () => {
      const row = makeMeetingNotesRow({ rank: 0.95 });
      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const results = await searchMeetingsFullText('project', 10, 'work');

      expect(results[0].similarity).toBe(0.95);
    });

    it('should default similarity to 0 when rank is null', async () => {
      const row = makeMeetingNotesRow({ rank: null });
      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const results = await searchMeetingsFullText('project', 10, 'work');

      expect(results[0].similarity).toBe(0);
    });

    it('should parse JSONB fields in results', async () => {
      const row = makeMeetingNotesRow();
      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const results = await searchMeetingsFullText('budget', 10, 'work');

      expect(results[0].notes.key_decisions).toEqual(['Approved Q2 budget']);
      expect(results[0].notes.action_items).toHaveLength(1);
      expect(results[0].meeting.participants).toEqual(['Alice', 'Bob']);
    });
  });

  // ===========================================
  // searchMeetingsHybrid
  // ===========================================

  describe('searchMeetingsHybrid', () => {
    it('should merge semantic + fulltext results using RRF', async () => {
      // Mock generateEmbedding for semantic search
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      // Semantic search returns meeting A (rank 1) and B (rank 2)
      const semanticA = makeMeetingNotesRow({ id: 'notes-a', m_id: 'meeting-a', title: 'Meeting A', distance: 0.1 });
      const semanticB = makeMeetingNotesRow({ id: 'notes-b', m_id: 'meeting-b', title: 'Meeting B', distance: 0.3 });
      // Fulltext search returns meeting B (rank 1) and A (rank 2)
      const fulltextB = makeMeetingNotesRow({ id: 'notes-b', m_id: 'meeting-b', title: 'Meeting B', rank: 0.9 });
      const fulltextA = makeMeetingNotesRow({ id: 'notes-a', m_id: 'meeting-a', title: 'Meeting A', rank: 0.5 });

      // First call: semantic search (via searchMeetings which calls generateEmbedding + queryContext)
      mockQueryContext.mockResolvedValueOnce({ rows: [semanticA, semanticB] } as any);
      // Second call: fulltext search
      mockQueryContext.mockResolvedValueOnce({ rows: [fulltextB, fulltextA] } as any);

      const results = await searchMeetingsHybrid('project', 10, 'work');

      // Both meetings should appear, merged via RRF
      expect(results.length).toBeGreaterThanOrEqual(1);
      // Both should have combined scores higher than single-source
      const ids = results.map((r) => r.notes.id);
      expect(ids).toContain('notes-a');
      expect(ids).toContain('notes-b');
    });

    it('should handle results appearing in only semantic search', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      const semanticOnly = makeMeetingNotesRow({ id: 'notes-only-sem', m_id: 'meeting-sem', distance: 0.2 });
      mockQueryContext.mockResolvedValueOnce({ rows: [semanticOnly] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const results = await searchMeetingsHybrid('unique topic', 10, 'work');

      expect(results).toHaveLength(1);
      expect(results[0].notes.id).toBe('notes-only-sem');
    });

    it('should handle results appearing in only fulltext search', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      const fulltextOnly = makeMeetingNotesRow({ id: 'notes-only-ft', m_id: 'meeting-ft', rank: 0.7 });
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [fulltextOnly] } as any);

      const results = await searchMeetingsHybrid('keyword', 10, 'work');

      expect(results).toHaveLength(1);
      expect(results[0].notes.id).toBe('notes-only-ft');
    });

    it('should respect limit parameter', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      const rows = Array.from({ length: 5 }, (_, i) =>
        makeMeetingNotesRow({ id: `notes-${i}`, m_id: `meeting-${i}`, distance: 0.1 * (i + 1) })
      );
      mockQueryContext.mockResolvedValueOnce({ rows } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const results = await searchMeetingsHybrid('test', 3, 'work');

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should propagate snippet from fulltext results', async () => {
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

      const row = makeMeetingNotesRow({
        id: 'notes-snip',
        m_id: 'meeting-snip',
        distance: 0.1,
        rank: 0.8,
        raw_transcript: 'The budget was approved for the next quarter.',
      });

      // Semantic returns this row
      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);
      // Fulltext also returns this row (snippet will be generated)
      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const results = await searchMeetingsHybrid('budget', 10, 'work');

      expect(results[0].snippet).toBeDefined();
    });
  });

  // ===========================================
  // processMeetingNotes
  // ===========================================

  describe('processMeetingNotes', () => {
    const meetingId = 'meeting-123';
    const transcript = 'We decided to launch the product in Q3. Alice will prepare the launch plan.';

    beforeEach(() => {
      mockStructureWithOllama.mockResolvedValue({
        structured_summary: 'Product launch planned for Q3.',
        key_decisions: ['Launch in Q3'],
        action_items: [{ task: 'Prepare launch plan', assignee: 'Alice', priority: 'high' }],
        topics_discussed: ['Product launch'],
        follow_ups: [{ topic: 'Launch plan review', responsible: 'Alice' }],
        sentiment: 'positive',
      });
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      // INSERT for notes
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // UPDATE for meeting status
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: meetingId }] } as any);
    });

    it('should return structured meeting notes', async () => {
      const notes = await processMeetingNotes(meetingId, transcript, 'work');

      expect(notes.meeting_id).toBe(meetingId);
      expect(notes.structured_summary).toBe('Product launch planned for Q3.');
      expect(notes.key_decisions).toEqual(['Launch in Q3']);
      expect(notes.action_items).toHaveLength(1);
      expect(notes.action_items[0].task).toBe('Prepare launch plan');
    });

    it('should include audio metadata in INSERT when provided', async () => {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: meetingId }] } as any); // UPDATE status

      const audioMeta = {
        storagePath: 'work/meeting-123/1700000000.webm',
        durationSeconds: 3600,
        sizeBytes: 5242880,
        mimeType: 'audio/webm',
      };

      const notes = await processMeetingNotes(meetingId, transcript, 'work', audioMeta);

      // Verify the INSERT call includes audio metadata params
      const insertCall = mockQueryContext.mock.calls[0];
      const params = insertCall[2] as any[];
      expect(params[10]).toBe('work/meeting-123/1700000000.webm'); // audio_storage_path
      expect(params[11]).toBe(3600); // audio_duration_seconds
      expect(params[12]).toBe(5242880); // audio_size_bytes
      expect(params[13]).toBe('audio/webm'); // audio_mime_type

      // Result should also contain audio metadata
      expect(notes.audio_storage_path).toBe('work/meeting-123/1700000000.webm');
      expect(notes.audio_duration_seconds).toBe(3600);
      expect(notes.audio_size_bytes).toBe(5242880);
      expect(notes.audio_mime_type).toBe('audio/webm');
    });

    it('should work without audioMeta (backwards compatible)', async () => {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: meetingId }] } as any); // UPDATE status

      const notes = await processMeetingNotes(meetingId, transcript, 'work');

      // Audio metadata params should be null
      const insertCall = mockQueryContext.mock.calls[0];
      const params = insertCall[2] as any[];
      expect(params[10]).toBeNull(); // audio_storage_path
      expect(params[11]).toBeNull(); // audio_duration_seconds
      expect(params[12]).toBeNull(); // audio_size_bytes
      expect(params[13]).toBeNull(); // audio_mime_type

      expect(notes.audio_storage_path).toBeUndefined();
    });

    it('should populate search_vector via to_tsvector in INSERT', async () => {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: meetingId }] } as any);

      await processMeetingNotes(meetingId, transcript, 'work');

      const insertCall = mockQueryContext.mock.calls[0];
      const sql = insertCall[1] as string;
      expect(sql).toContain('search_vector');
      expect(sql).toContain("to_tsvector('german'");
    });

    it('should fall back to truncated transcript on LLM failure', async () => {
      mockStructureWithOllama.mockRejectedValueOnce(new Error('LLM unavailable'));
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: meetingId }] } as any);

      const notes = await processMeetingNotes(meetingId, transcript, 'work');

      expect(notes.structured_summary).toBe(transcript.substring(0, 200));
      expect(notes.key_decisions).toEqual([]);
      expect(notes.sentiment).toBe('neutral');
    });

    it('should set completed: false on all action items', async () => {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: meetingId }] } as any);

      const notes = await processMeetingNotes(meetingId, transcript, 'work');

      for (const item of notes.action_items) {
        expect(item.completed).toBe(false);
      }
    });

    it('should update meeting status to completed', async () => {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: meetingId }] } as any); // UPDATE

      await processMeetingNotes(meetingId, transcript, 'work');

      // Second call should be the status update
      const updateCall = mockQueryContext.mock.calls[1];
      expect(updateCall[1]).toContain('UPDATE meetings SET status');
      expect((updateCall[2] as any[])[1]).toBe('completed');
    });
  });

  // ===========================================
  // getMeetings with has_audio filter
  // ===========================================

  describe('getMeetings has_audio filter', () => {
    it('should join meeting_notes when has_audio is true', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] } as any) // meetings query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] } as any); // count query

      await getMeetings({ has_audio: true, context: 'work' });

      const meetingsQuery = mockQueryContext.mock.calls[0][1] as string;
      expect(meetingsQuery).toContain('LEFT JOIN meeting_notes');
      expect(meetingsQuery).toContain('audio_storage_path IS NOT NULL');
    });

    it('should not join meeting_notes when has_audio is not set', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ total: '0' }] } as any);

      await getMeetings({ context: 'work' });

      const meetingsQuery = mockQueryContext.mock.calls[0][1] as string;
      expect(meetingsQuery).not.toContain('LEFT JOIN meeting_notes');
    });
  });
});
