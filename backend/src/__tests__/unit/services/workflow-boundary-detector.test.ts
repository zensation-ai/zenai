/**
 * Workflow Boundary Detector - Unit Tests
 */

import {
  processWorkflowBoundary,
  resetFrequencyState,
  getFrequencyState,
} from '../../../services/workflow-boundary-detector';

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Workflow Boundary Detector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    resetFrequencyState();
    // Pin time to noon so quiet hours (22:00–07:00) never block suggestions
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-09T12:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ========================================
  // idea_saved trigger
  // ========================================
  describe('idea_saved', () => {
    it('should suggest similar ideas when found', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'similar-1', title: 'Related Marketing Idea' },
          { id: 'similar-2', title: 'Another Marketing Thought' },
        ],
      });

      const result = await processWorkflowBoundary('idea_saved', 'personal', {
        ideaId: 'new-idea',
        ideaTitle: 'Marketing Strategy',
      });

      expect(result).not.toBeNull();
      expect(result!.trigger).toBe('idea_saved');
      expect(result!.message).toContain('Marketing Strategy');
      expect(result!.relatedIds).toHaveLength(2);
      expect(result!.action.type).toBe('review_ideas');
    });

    it('should return null when no similar ideas exist', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await processWorkflowBoundary('idea_saved', 'personal', {
        ideaId: 'new-idea',
        ideaTitle: 'Unique Topic',
      });

      expect(result).toBeNull();
    });
  });

  // ========================================
  // chat_session_end trigger
  // ========================================
  describe('chat_session_end', () => {
    it('should suggest creating idea from substantive chat', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ count: '5' }],
      });

      const result = await processWorkflowBoundary('chat_session_end', 'personal', {
        sessionId: 'session-123',
      });

      expect(result).not.toBeNull();
      expect(result!.trigger).toBe('chat_session_end');
      expect(result!.action.type).toBe('create_idea');
      expect(result!.message).toContain('Idee');
    });

    it('should not suggest for very short chats', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ count: '1' }],
      });

      const result = await processWorkflowBoundary('chat_session_end', 'personal', {
        sessionId: 'session-short',
      });

      expect(result).toBeNull();
    });
  });

  // ========================================
  // login_after_absence trigger
  // ========================================
  describe('login_after_absence', () => {
    it('should show summary after long absence with new content', async () => {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

      // New ideas count
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      // New drafts count
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const state = getFrequencyState('personal');
      // Verify clean state
      expect(state.hourlyCount).toBe(0);

      const result = await processWorkflowBoundary('login_after_absence', 'personal', {
        lastActiveAt: sixHoursAgo,
      });

      expect(result).not.toBeNull();
      expect(result!.trigger).toBe('login_after_absence');
      expect(result!.message).toContain('3 neue Ideen');
      expect(result!.action.type).toBe('view_summary');
    });

    it('should not trigger for short absence', async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

      const result = await processWorkflowBoundary('login_after_absence', 'personal', {
        lastActiveAt: oneHourAgo,
      });

      expect(result).toBeNull();
    });

    it('should not trigger when no new content', async () => {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQueryContext.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await processWorkflowBoundary('login_after_absence', 'personal', {
        lastActiveAt: sixHoursAgo,
      });

      expect(result).toBeNull();
    });
  });

  // ========================================
  // draft_completed trigger
  // ========================================
  describe('draft_completed', () => {
    it('should suggest reviewing related ideas', async () => {
      const result = await processWorkflowBoundary('draft_completed', 'personal', {
        draftId: 'draft-1',
        ideaTitle: 'AI Strategy Paper',
      });

      expect(result).not.toBeNull();
      expect(result!.trigger).toBe('draft_completed');
      expect(result!.message).toContain('AI Strategy Paper');
      expect(result!.action.type).toBe('review_ideas');
    });
  });

  // ========================================
  // Frequency Control
  // ========================================
  describe('frequency control', () => {
    it('should track suggestion count', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [{ id: 'sim-1', title: 'Similar' }],
      });

      await processWorkflowBoundary('idea_saved', 'personal', {
        ideaId: 'id-1',
        ideaTitle: 'Test',
      });

      const state = getFrequencyState('personal');
      expect(state.hourlyCount).toBe(1);
      expect(state.dailyCount).toBe(1);
    });

    it('should reset state per context', () => {
      resetFrequencyState('personal');
      const state = getFrequencyState('personal');
      expect(state.hourlyCount).toBe(0);
      expect(state.dailyCount).toBe(0);
    });
  });
});
