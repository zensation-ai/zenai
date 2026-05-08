/**
 * Tests for Meeting Transcription Service (Task 9)
 *
 * Covers startSession, addTranscriptEntry, generateSummary, endSession, getSession.
 */

// Mock dependencies before imports
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: any[]) => mockQueryContext(...args),
}));

const mockGenerateClaudeResponse = jest.fn();
jest.mock('../../../services/claude/core', () => ({
  generateClaudeResponse: (...args: any[]) => mockGenerateClaudeResponse(...args),
}));

const mockEpisodicStore = jest.fn();
jest.mock('../../../services/memory/episodic-memory', () => ({
  episodicMemory: {
    store: (...args: any[]) => mockEpisodicStore(...args),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { MeetingTranscriptionService } from '../../../services/meeting-transcription';

describe('MeetingTranscriptionService', () => {
  let service: MeetingTranscriptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    mockGenerateClaudeResponse.mockReset();
    mockEpisodicStore.mockReset();
    service = new MeetingTranscriptionService();
  });

  // ===========================================
  // startSession
  // ===========================================

  describe('startSession', () => {
    it('should create a session with correct fields', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const session = await service.startSession('operations');

      expect(session.id).toBeDefined();
      expect(session.context).toBe('operations');
      expect(session.transcript).toEqual([]);
      expect(session.startedAt).toBeInstanceOf(Date);
      expect(session.status).toBe('recording');
    });

    it('should create session with calendarEventId when provided', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const session = await service.startSession('finance', 'event-123');

      expect(session.calendarEventId).toBe('event-123');
      expect(session.context).toBe('finance');
    });

    it('should proceed even when DB persist fails', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB unavailable'));

      const session = await service.startSession('operations');

      // Session should still be created in memory
      expect(session.id).toBeDefined();
      expect(session.status).toBe('recording');
    });

    it('should store session in in-memory map', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const session = await service.startSession('people');
      const retrieved = service.getSession(session.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(session.id);
    });
  });

  // ===========================================
  // addTranscriptEntry
  // ===========================================

  describe('addTranscriptEntry', () => {
    it('should push entry to transcript array', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      const session = await service.startSession('operations');

      service.addTranscriptEntry(session.id, {
        speaker: 'Alice',
        text: 'Hello everyone.',
        timestamp: new Date(),
      });

      const retrieved = service.getSession(session.id);
      expect(retrieved!.transcript).toHaveLength(1);
      expect(retrieved!.transcript[0].speaker).toBe('Alice');
      expect(retrieved!.transcript[0].text).toBe('Hello everyone.');
    });

    it('should append multiple entries in order', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      const session = await service.startSession('operations');

      service.addTranscriptEntry(session.id, { speaker: 'A', text: 'First', timestamp: new Date() });
      service.addTranscriptEntry(session.id, { speaker: 'B', text: 'Second', timestamp: new Date() });

      const retrieved = service.getSession(session.id);
      expect(retrieved!.transcript).toHaveLength(2);
      expect(retrieved!.transcript[0].text).toBe('First');
      expect(retrieved!.transcript[1].text).toBe('Second');
    });

    it('should throw when session does not exist', () => {
      expect(() =>
        service.addTranscriptEntry('non-existent-id', {
          speaker: 'X',
          text: 'test',
          timestamp: new Date(),
        })
      ).toThrow();
    });
  });

  // ===========================================
  // generateSummary
  // ===========================================

  describe('generateSummary', () => {
    it('should return structured summary from Claude', async () => {
      const mockSummary = {
        summary: 'Team discussed Q2 roadmap.',
        actionItems: ['Finish feature A', 'Schedule follow-up'],
        decisions: ['Adopt new architecture'],
        keyPoints: ['Budget approved', 'Timeline confirmed'],
      };

      mockGenerateClaudeResponse.mockResolvedValueOnce(JSON.stringify(mockSummary));

      const transcript = [
        { speaker: 'Alice', text: 'We need to finish feature A.', timestamp: new Date() },
        { speaker: 'Bob', text: 'Agreed, budget is approved.', timestamp: new Date() },
      ];

      const result = await service.generateSummary(transcript);

      expect(result.summary).toBe('Team discussed Q2 roadmap.');
      expect(result.actionItems).toHaveLength(2);
      expect(result.decisions).toContain('Adopt new architecture');
      expect(result.keyPoints).toContain('Budget approved');
    });

    it('should handle Claude returning JSON wrapped in markdown code block', async () => {
      const mockSummary = {
        summary: 'Short meeting.',
        actionItems: [],
        decisions: [],
        keyPoints: [],
      };

      mockGenerateClaudeResponse.mockResolvedValueOnce(
        '```json\n' + JSON.stringify(mockSummary) + '\n```'
      );

      const result = await service.generateSummary([
        { speaker: 'A', text: 'Hello', timestamp: new Date() },
      ]);

      expect(result.summary).toBe('Short meeting.');
    });

    it('should return fallback summary when Claude fails', async () => {
      mockGenerateClaudeResponse.mockRejectedValueOnce(new Error('Claude unavailable'));

      const result = await service.generateSummary([
        { speaker: 'A', text: 'test', timestamp: new Date() },
      ]);

      expect(result.summary).toBeDefined();
      expect(result.actionItems).toBeInstanceOf(Array);
    });
  });

  // ===========================================
  // endSession
  // ===========================================

  describe('endSession', () => {
    it('should return summary and mark session as completed', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockEpisodicStore.mockResolvedValueOnce({ id: 'ep-1' });

      const mockSummaryJson = JSON.stringify({
        summary: 'Meeting complete.',
        actionItems: ['Follow up'],
        decisions: ['Ship it'],
        keyPoints: ['All agreed'],
      });
      mockGenerateClaudeResponse.mockResolvedValueOnce(mockSummaryJson);

      const session = await service.startSession('operations');
      service.addTranscriptEntry(session.id, {
        speaker: 'Alice',
        text: 'Let us ship it.',
        timestamp: new Date(),
      });

      const result = await service.endSession(session.id);

      expect(result.summary).toBeDefined();
      expect(result.summary.summary).toBe('Meeting complete.');
      expect(result.session.status).toBe('completed');
    });

    it('should store episode in episodic memory after ending', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockEpisodicStore.mockResolvedValueOnce({ id: 'ep-2' });
      mockGenerateClaudeResponse.mockResolvedValueOnce(
        JSON.stringify({ summary: 'Done', actionItems: [], decisions: [], keyPoints: [] })
      );

      const session = await service.startSession('finance');
      service.addTranscriptEntry(session.id, {
        speaker: 'Bob',
        text: 'Work item resolved.',
        timestamp: new Date(),
      });

      await service.endSession(session.id);

      expect(mockEpisodicStore).toHaveBeenCalledWith(
        expect.stringContaining('meeting'),
        expect.any(String),
        session.id,
        'finance'
      );
    });

    it('should throw when session does not exist', async () => {
      await expect(service.endSession('unknown-session')).rejects.toThrow();
    });
  });

  // ===========================================
  // getSession
  // ===========================================

  describe('getSession', () => {
    it('should return null for unknown session id', () => {
      const result = service.getSession('does-not-exist');
      expect(result).toBeNull();
    });

    it('should return session by id', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const session = await service.startSession('strategy');
      const retrieved = service.getSession(session.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.context).toBe('strategy');
    });
  });
});
