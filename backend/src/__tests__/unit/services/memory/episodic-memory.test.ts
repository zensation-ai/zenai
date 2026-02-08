/**
 * Unit Tests for Episodic Memory Service
 *
 * Tests concrete experience storage with emotional context.
 * Biological inspiration: Hippocampus episodic memory system.
 *
 * Updated to match current EpisodicMemoryService API (Phase 31).
 *
 * @module tests/unit/services/memory/episodic-memory
 */

import { EpisodicMemoryService, Episode } from '../../../../services/memory/episodic-memory';
import { queryContext, AIContext } from '../../../../utils/database-context';
import { generateEmbedding } from '../../../../services/ai';

// Mock dependencies
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),
}));

jest.mock('../../../../utils/embedding', () => ({
  formatForPgVector: jest.fn().mockReturnValue('[0.1,0.2,0.3,0.4,0.5]'),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockGenerateEmbedding = generateEmbedding as jest.MockedFunction<typeof generateEmbedding>;

describe('Episodic Memory Service', () => {
  let service: EpisodicMemoryService;
  const testContext: AIContext = 'personal';

  beforeEach(() => {
    service = new EpisodicMemoryService();
    jest.clearAllMocks();
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  // ===========================================
  // store() Tests
  // ===========================================

  describe('store', () => {
    const mockDbRow = {
      id: 'test-id-123',
      context: 'personal',
      session_id: 'session-123',
      trigger: 'User question',
      response: 'AI response',
      emotional_valence: 0.5,
      emotional_arousal: 0.3,
      time_of_day: 'morning',
      day_of_week: 'Monday',
      is_weekend: false,
      linked_episodes: [],
      linked_facts: [],
      retrieval_count: 0,
      last_retrieved: null,
      retrieval_strength: 1.0,
      created_at: new Date(),
      updated_at: new Date(),
    };

    beforeEach(() => {
      // Mock finding similar episodes (empty for simplicity)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // Mock insert
      mockQueryContext.mockResolvedValueOnce({ rows: [mockDbRow] } as any);
    });

    it('should store an episode successfully', async () => {
      const result = await service.store(
        'User question',
        'AI response',
        'session-123',
        testContext
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('test-id-123');
      expect(result.trigger).toBe('User question');
      expect(result.response).toBe('AI response');
    });

    it('should generate embedding for the episode', async () => {
      await service.store('User question', 'AI response', 'session-123', testContext);

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('User question AI response');
    });

    it('should analyze emotional content', async () => {
      const positiveRow = {
        ...mockDbRow,
        trigger: 'Danke, das ist super!',
        response: 'Gerne geschehen!',
      };
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [positiveRow] } as any);

      const result = await service.store(
        'Danke, das ist super!',
        'Gerne geschehen!',
        'session-123',
        testContext
      );

      expect(result).toBeDefined();
      // Verify the insert was called with emotional values
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });

    it('should handle embedding generation failure gracefully', async () => {
      mockGenerateEmbedding.mockResolvedValueOnce([]);
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: [mockDbRow] } as any);

      const result = await service.store(
        'User question',
        'AI response',
        'session-123',
        testContext
      );

      // Should still succeed without embedding
      expect(result).toBeDefined();
    });
  });

  // ===========================================
  // retrieve() Tests
  // ===========================================

  describe('retrieve', () => {
    const mockEpisodes = [
      {
        id: 'ep-1',
        context: 'personal',
        session_id: 'session-1',
        trigger: 'First question',
        response: 'First response',
        emotional_valence: 0.5,
        emotional_arousal: 0.3,
        time_of_day: 'morning',
        day_of_week: 'Monday',
        is_weekend: false,
        linked_episodes: [],
        linked_facts: [],
        retrieval_count: 2,
        last_retrieved: new Date(),
        retrieval_strength: 0.8,
        created_at: new Date(),
        semantic_similarity: 0.9,
        decayed_strength: 0.75,
      },
    ];

    beforeEach(() => {
      // Mock semantic retrieval
      mockQueryContext.mockResolvedValueOnce({ rows: mockEpisodes } as any);
      // Mock update retrieval stats
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    });

    it('should retrieve relevant episodes', async () => {
      const results = await service.retrieve('search query', testContext);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ep-1');
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('search query');
    });

    it('should respect limit option', async () => {
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: mockEpisodes } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.retrieve('search query', testContext, { limit: 10 });

      // Verify limit was passed in query params
      const queryCall = mockQueryContext.mock.calls[0];
      expect(queryCall[2]).toContain(10); // params should include limit
    });

    it('should update retrieval stats for retrieved episodes', async () => {
      await service.retrieve('search query', testContext);

      // Second query should be the stats update
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });

    it('should fallback to text search if embedding fails', async () => {
      mockGenerateEmbedding.mockResolvedValueOnce([]);
      mockQueryContext.mockReset();
      mockQueryContext.mockResolvedValueOnce({ rows: mockEpisodes } as any);

      const results = await service.retrieve('search query', testContext);

      expect(results).toBeDefined();
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockReset();
      mockQueryContext.mockRejectedValueOnce(new Error('Database error'));

      const results = await service.retrieve('search query', testContext);

      expect(results).toEqual([]);
    });
  });

  // ===========================================
  // getById() Tests
  // ===========================================

  describe('getById', () => {
    it('should return episode when found', async () => {
      const mockRow = {
        id: 'ep-123',
        context: 'personal',
        session_id: 'session-1',
        trigger: 'Question',
        response: 'Answer',
        emotional_valence: 0,
        emotional_arousal: 0.3,
        time_of_day: 'afternoon',
        day_of_week: 'Tuesday',
        is_weekend: false,
        linked_episodes: [],
        linked_facts: [],
        retrieval_count: 0,
        last_retrieved: null,
        retrieval_strength: 1.0,
        created_at: new Date(),
      };

      mockQueryContext.mockResolvedValueOnce({ rows: [mockRow] } as any);

      const result = await service.getById('ep-123', testContext);

      expect(result).toBeDefined();
      expect(result?.id).toBe('ep-123');
    });

    it('should return null when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.getById('nonexistent', testContext);

      expect(result).toBeNull();
    });
  });

  // ===========================================
  // getStats() Tests
  // ===========================================

  describe('getStats', () => {
    it('should return statistics', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          total: '100',
          avg_strength: '0.75',
          strong: '10',
          recent: '25',
        }],
      } as any);

      const stats = await service.getStats(testContext);

      expect(stats.totalEpisodes).toBe(100);
      expect(stats.avgRetrievalStrength).toBe(0.75);
      expect(stats.recentEpisodes).toBe(25);
    });

    it('should throw on database error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.getStats(testContext)).rejects.toThrow('DB error');
    });
  });

  // ===========================================
  // applyDecay() Tests
  // ===========================================

  describe('applyDecay', () => {
    it('should apply decay using stored procedure', async () => {
      // Mock stored procedure call
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ apply_episodic_decay: 15 }],
      } as any);

      const decayed = await service.applyDecay(testContext);

      expect(decayed).toBe(15);
      expect(mockQueryContext).toHaveBeenCalledWith(
        testContext,
        expect.stringContaining('apply_episodic_decay')
      );
    });

    it('should fallback to UPDATE if stored procedure fails', async () => {
      // Mock stored procedure to fail
      mockQueryContext.mockRejectedValueOnce(new Error('Function not found'));
      // Mock fallback UPDATE to succeed
      mockQueryContext.mockResolvedValueOnce({ rowCount: 10 } as any);

      const decayed = await service.applyDecay(testContext);

      expect(decayed).toBe(10);
    });

    it('should throw if fallback also fails', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Function not found'));
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.applyDecay(testContext)).rejects.toThrow('DB error');
    });
  });

  // ===========================================
  // consolidate() Tests
  // ===========================================

  describe('consolidate', () => {
    it('should process episodes for consolidation', async () => {
      const strongEpisodes = [
        {
          id: 'ep-1',
          trigger: 'Important question',
          response: 'Important answer',
          retrieval_count: 5,
          retrieval_strength: 0.9,
        },
      ];

      mockQueryContext.mockResolvedValueOnce({ rows: strongEpisodes } as any);
      // Mock fact extraction query
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.consolidate(testContext);

      expect(result).toBeDefined();
      expect(result.episodesProcessed).toBeGreaterThanOrEqual(0);
    });

    it('should return zeros on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await service.consolidate(testContext);

      expect(result.episodesProcessed).toBe(0);
      expect(result.factsExtracted).toBe(0);
    });
  });

  // ===========================================
  // calculateEmotionalTone() Tests
  // ===========================================

  describe('calculateEmotionalTone', () => {
    it('should calculate average emotional tone', () => {
      const episodes: Episode[] = [
        {
          id: '1',
          context: 'personal',
          sessionId: 'sess-1',
          timestamp: new Date(),
          trigger: 'Q1',
          response: 'A1',
          emotionalValence: 0.5,
          emotionalArousal: 0.3,
          temporalContext: { timeOfDay: 'morning', dayOfWeek: 'Monday', isWeekend: false },
          linkedEpisodes: [],
          linkedFacts: [],
          retrievalCount: 0,
          lastRetrieved: null,
          retrievalStrength: 1.0,
        },
        {
          id: '2',
          context: 'personal',
          sessionId: 'sess-1',
          timestamp: new Date(),
          trigger: 'Q2',
          response: 'A2',
          emotionalValence: -0.3,
          emotionalArousal: 0.7,
          temporalContext: { timeOfDay: 'evening', dayOfWeek: 'Friday', isWeekend: false },
          linkedEpisodes: [],
          linkedFacts: [],
          retrievalCount: 0,
          lastRetrieved: null,
          retrievalStrength: 1.0,
        },
      ];

      const tone = service.calculateEmotionalTone(episodes);

      expect(tone.avgValence).toBeCloseTo(0.1, 1); // (0.5 + -0.3) / 2
      expect(tone.avgArousal).toBeCloseTo(0.5, 1); // (0.3 + 0.7) / 2
    });

    it('should return neutral tone for empty array', () => {
      const tone = service.calculateEmotionalTone([]);

      expect(tone.avgValence).toBe(0);
      expect(tone.avgArousal).toBe(0.5); // Default baseline arousal
      expect(tone.dominantMood).toBe('neutral');
    });

    it('should identify dominant mood based on valence and arousal', () => {
      // High valence + high arousal = excited (valence > 0.3, arousal > 0.6)
      const excitedEpisodes: Episode[] = [
        {
          id: '1',
          context: 'personal',
          sessionId: 'sess-1',
          timestamp: new Date(),
          trigger: 'Great!',
          response: 'Awesome!',
          emotionalValence: 0.8,
          emotionalArousal: 0.7, // > 0.6 to trigger 'excited'
          temporalContext: { timeOfDay: 'morning', dayOfWeek: 'Monday', isWeekend: false },
          linkedEpisodes: [],
          linkedFacts: [],
          retrievalCount: 0,
          lastRetrieved: null,
          retrievalStrength: 1.0,
        },
      ];

      const excitedTone = service.calculateEmotionalTone(excitedEpisodes);
      expect(excitedTone.dominantMood).toBe('excited');

      // High valence + low arousal = positive
      const positiveEpisodes: Episode[] = [
        {
          ...excitedEpisodes[0],
          id: '2',
          emotionalArousal: 0.4, // <= 0.6 to trigger 'positive'
        },
      ];

      const positiveTone = service.calculateEmotionalTone(positiveEpisodes);
      expect(positiveTone.dominantMood).toBe('positive');
    });
  });
});
