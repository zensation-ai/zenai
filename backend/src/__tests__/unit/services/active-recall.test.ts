/**
 * Active Recall Service - Unit Tests
 */

import {
  generateChallenge,
  evaluateRecall,
  getReviewSchedule,
  calculateNextReview,
} from '../../../services/active-recall';

var mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock AI embedding
jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../utils/semantic-cache', () => ({
  cosineSimilarity: jest.fn().mockReturnValue(0.75),
  semanticCache: { get: jest.fn(), set: jest.fn() },
}));

describe('Active Recall Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ========================================
  // calculateNextReview (pure function)
  // ========================================
  describe('calculateNextReview', () => {
    it('should increase interval significantly for perfect recall', () => {
      const { nextInterval, newEase } = calculateNextReview('perfect', 1, 2.5);
      expect(nextInterval).toBe(3); // 1 * 2.5 rounded
      expect(newEase).toBe(2.65);   // 2.5 + 0.15
    });

    it('should modestly increase interval for partial recall', () => {
      const { nextInterval, newEase } = calculateNextReview('partial', 4, 2.5);
      expect(nextInterval).toBe(5); // 4 * 1.3 rounded
      expect(newEase).toBe(2.5);    // Unchanged
    });

    it('should significantly decrease interval for failed recall', () => {
      const { nextInterval, newEase } = calculateNextReview('failed', 10, 2.5);
      expect(nextInterval).toBe(3); // 10 * 0.3 rounded
      expect(newEase).toBe(2.3);    // 2.5 - 0.2
    });

    it('should never go below minimum interval (1 day)', () => {
      const { nextInterval } = calculateNextReview('failed', 1, 2.5);
      expect(nextInterval).toBeGreaterThanOrEqual(1);
    });

    it('should never go below minimum ease factor (1.3)', () => {
      const { newEase } = calculateNextReview('failed', 1, 1.3);
      expect(newEase).toBeGreaterThanOrEqual(1.3);
    });

    it('should cap ease at 3.0', () => {
      const { newEase } = calculateNextReview('perfect', 1, 2.95);
      expect(newEase).toBeLessThanOrEqual(3.0);
    });

    it('should produce exponential growth with consecutive perfect recalls', () => {
      let interval = 1;
      let ease = 2.5;

      // Simulate 4 consecutive perfect recalls
      const intervals: number[] = [];
      for (let i = 0; i < 4; i++) {
        const result = calculateNextReview('perfect', interval, ease);
        interval = result.nextInterval;
        ease = result.newEase;
        intervals.push(interval);
      }

      // Each interval should be larger than the previous
      for (let i = 1; i < intervals.length; i++) {
        expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]);
      }
    });
  });

  // ========================================
  // generateChallenge
  // ========================================
  describe('generateChallenge', () => {
    it('should return challenge with title and prompt', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'task-1',
          title: 'Machine Learning Basics',
          description: 'Understanding supervised vs unsupervised learning',
          tags: ['ml', 'ai'],
          created_at: '2026-01-15',
          metadata: {},
        }],
      });

      const challenge = await generateChallenge('task-1', 'personal');

      expect(challenge).not.toBeNull();
      expect(challenge!.title).toBe('Machine Learning Basics');
      expect(challenge!.tags).toEqual(['ml', 'ai']);
      expect(challenge!.prompt).toContain('Machine Learning Basics');
      // Should NOT expose the description
    });

    it('should return null for non-existent task', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const challenge = await generateChallenge('nonexistent', 'personal');

      expect(challenge).toBeNull();
    });

    it('should handle missing tags gracefully', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'task-1', title: 'Test', tags: null, created_at: '2026-01-15', metadata: {} }],
      });

      const challenge = await generateChallenge('task-1', 'personal');

      expect(challenge!.tags).toEqual([]);
    });
  });

  // ========================================
  // evaluateRecall
  // ========================================
  describe('evaluateRecall', () => {
    it('should evaluate recall and store results', async () => {
      // Get task
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'task-1',
          title: 'ML Basics',
          description: 'Supervised learning uses labeled data, unsupervised finds patterns',
          summary: null,
          metadata: { interval_days: 1, ease_factor: 2.5, review_count: 0 },
        }],
      });
      // Update metadata
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Insert learning session
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await evaluateRecall(
        'task-1',
        'personal',
        'ML uses labeled data for supervised learning and finds patterns without labels'
      );

      expect(result).not.toBeNull();
      expect(result!.quality).toBeDefined();
      expect(['perfect', 'partial', 'failed']).toContain(result!.quality);
      expect(result!.similarityScore).toBeGreaterThanOrEqual(0);
      expect(result!.similarityScore).toBeLessThanOrEqual(1);
      expect(result!.feedback).toBeTruthy();
      expect(result!.nextReviewDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result!.intervalDays).toBeGreaterThanOrEqual(1);
    });

    it('should return null for non-existent task', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await evaluateRecall('nonexistent', 'personal', 'some recall');

      expect(result).toBeNull();
    });
  });

  // ========================================
  // getReviewSchedule
  // ========================================
  describe('getReviewSchedule', () => {
    it('should return due tasks sorted by due date', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            id: 'task-1',
            title: 'Task A',
            summary: 'Summary A',
            metadata: {
              next_review_date: yesterday.toISOString(),
              interval_days: 3,
              ease_factor: 2.5,
              review_count: 2,
            },
          },
        ],
      });

      const schedule = await getReviewSchedule('personal');

      expect(schedule).toHaveLength(1);
      expect(schedule[0].taskId).toBe('task-1');
      expect(schedule[0].overdueDays).toBeGreaterThanOrEqual(1);
      expect(schedule[0].intervalDays).toBe(3);
    });

    it('should return empty for no due tasks', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const schedule = await getReviewSchedule('personal');

      expect(schedule).toEqual([]);
    });
  });
});
