/**
 * Extended Unit Tests for Episodic Memory Service
 *
 * Covers consolidation with LLM extraction, temporal merge,
 * session retrieval, emotional analysis edge cases, and error paths.
 *
 * @module tests/unit/services/memory/episodic-memory-extended
 */

import { EpisodicMemoryService, Episode } from '../../../../services/memory/episodic-memory';

// Mock dependencies
const mockQueryContext = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

const mockGenerateEmbedding = jest.fn();
jest.mock('../../../../services/ai', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}));

jest.mock('../../../../utils/embedding', () => ({
  formatForPgVector: jest.fn().mockReturnValue('[0.1,0.2,0.3]'),
}));

const mockExtractFacts = jest.fn();
jest.mock('../../../../services/memory/llm-consolidation', () => ({
  extractFactsFromEpisodes: (...args: unknown[]) => mockExtractFacts(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-001'),
}));

describe('EpisodicMemoryService - Extended', () => {
  let service: EpisodicMemoryService;

  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'ep-001',
    context: 'personal',
    session_id: 'sess-001',
    trigger: 'Test trigger',
    response: 'Test response',
    emotional_valence: 0.0,
    emotional_arousal: 0.3,
    time_of_day: 'morning',
    day_of_week: 'Monday',
    is_weekend: false,
    linked_episodes: [],
    linked_facts: [],
    retrieval_count: 0,
    last_retrieved: null,
    retrieval_strength: 1.0,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    ...overrides,
  });

  beforeEach(() => {
    service = new EpisodicMemoryService();
    jest.clearAllMocks();
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  // ===========================================
  // store() — Extended
  // ===========================================

  describe('store — linking and emotional analysis', () => {
    it('should link to similar episodes above similarity threshold', async () => {
      // findSimilarEpisodes returns episodes with high similarity
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'ep-linked-1', similarity: '0.85' },
          { id: 'ep-linked-2', similarity: '0.40' }, // below 0.65 threshold
        ],
      } as any);
      // INSERT RETURNING
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ linked_episodes: ['ep-linked-1'] })],
      } as any);

      const result = await service.store('question', 'answer', 'sess-1', 'personal');

      // INSERT call should include only ep-linked-1 (>= 0.65)
      const insertCall = mockQueryContext.mock.calls[1];
      const linkedParam = insertCall[2][9]; // linked_episodes param
      expect(linkedParam).toEqual(['ep-linked-1']);
      expect(result.linkedEpisodes).toEqual(['ep-linked-1']);
    });

    it('should detect negative emotional content', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // findSimilar
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow()],
      } as any);

      await service.store(
        'Ich habe ein Problem, es ist frustriert und schwierig',
        'Sorry, hier ist die Hilfe',
        'sess-1',
        'personal'
      );

      const insertCall = mockQueryContext.mock.calls[1];
      const valence = insertCall[2][4]; // emotional_valence param
      // 3 negative words (problem, frustriert, schwierig), 0 positive -> negative valence
      expect(valence).toBeLessThan(0);
    });

    it('should detect high arousal content', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [makeRow()] } as any);

      await service.store(
        'DRINGEND! Wichtig! Sofort erledigen!',
        'OK',
        'sess-1',
        'personal'
      );

      const insertCall = mockQueryContext.mock.calls[1];
      const arousal = insertCall[2][5]; // emotional_arousal param
      // 3 high arousal words: dringend, wichtig, sofort -> 0.3 + 3*0.15 = 0.75
      expect(arousal).toBeGreaterThanOrEqual(0.7);
    });

    it('should detect positive emotional content', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [makeRow()] } as any);

      await service.store(
        'Danke, das ist super toll!',
        'Gerne! Das ist perfekt.',
        'sess-1',
        'personal'
      );

      const insertCall = mockQueryContext.mock.calls[1];
      const valence = insertCall[2][4];
      expect(valence).toBeGreaterThan(0);
    });

    it('should return neutral valence for neutral text', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [makeRow()] } as any);

      await service.store('Was ist die Hauptstadt?', 'Berlin.', 'sess-1', 'personal');

      const insertCall = mockQueryContext.mock.calls[1];
      const valence = insertCall[2][4];
      expect(valence).toBe(0);
    });

    it('should rethrow on store failure', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockRejectedValueOnce(new Error('INSERT failed'));

      await expect(service.store('q', 'a', 's', 'personal')).rejects.toThrow('INSERT failed');
    });

    it('should skip findSimilarEpisodes when embedding is empty', async () => {
      mockGenerateEmbedding.mockResolvedValueOnce([]);
      // Only INSERT, no findSimilar
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow()],
      } as any);

      const result = await service.store('q', 'a', 'sess-1', 'personal');

      expect(result).toBeDefined();
      expect(mockQueryContext).toHaveBeenCalledTimes(1); // only INSERT
    });
  });

  // ===========================================
  // retrieve() — Extended
  // ===========================================

  describe('retrieve — filters and fallback', () => {
    it('should apply emotional filter with minValence', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.retrieve('query', 'personal', {
        emotionalFilter: { minValence: 0.5 },
      });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('emotional_valence >= $');
    });

    it('should apply emotional filter with maxValence', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.retrieve('query', 'personal', {
        emotionalFilter: { maxValence: -0.3 },
      });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('emotional_valence <= $');
    });

    it('should apply temporal filter for timeOfDay', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.retrieve('query', 'personal', {
        temporalFilter: { timeOfDay: 'morning' },
      });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('time_of_day = $');
    });

    it('should apply includeDecayed option', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.retrieve('query', 'personal', { includeDecayed: true });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      // When includeDecayed=true, the strength filter should NOT be added
      expect(sql).not.toContain('retrieval_strength >= $4');
    });

    it('should not update retrieval stats when no episodes found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.retrieve('query', 'personal');

      // Only 1 call (retrieval), no stats update
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================
  // getBySession()
  // ===========================================

  describe('getBySession', () => {
    it('should return episodes for a session', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ id: 'ep-1' }), makeRow({ id: 'ep-2' })],
      } as any);

      const result = await service.getBySession('sess-001', 'personal');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('ep-1');
    });

    it('should return empty array when no episodes found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.getBySession('sess-none', 'personal');

      expect(result).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeRow()] } as any);

      await service.getBySession('sess-1', 'personal', 3);

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[2]).toBe(3);
    });
  });

  // ===========================================
  // consolidate() — Extended
  // ===========================================

  describe('consolidate — LLM extraction', () => {
    it('should return early when no strong episodes exist', async () => {
      // hasMetadataColumn
      mockQueryContext.mockResolvedValueOnce({ rows: [{ column_name: 'metadata' }] } as any);
      // strong episodes query
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.consolidate('personal');

      expect(result.strongEpisodes).toBe(0);
      expect(result.factsExtracted).toBe(0);
      expect(result.episodesProcessed).toBe(0);
    });

    it('should extract facts from strong episodes via LLM', async () => {
      // hasMetadataColumn => true
      mockQueryContext.mockResolvedValueOnce({ rows: [{ column_name: 'metadata' }] } as any);
      // strong episodes
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeRow({ id: 'ep-strong-1', retrieval_count: 5, retrieval_strength: 0.9 }),
          makeRow({ id: 'ep-strong-2', retrieval_count: 4, retrieval_strength: 0.7 }),
        ],
      } as any);

      mockExtractFacts.mockResolvedValueOnce([
        { fact_type: 'preference', content: 'User prefers dark mode', confidence: 0.85 },
      ]);

      // INSERT fact
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.consolidate('personal');

      expect(result.episodesProcessed).toBe(2);
      expect(result.strongEpisodes).toBe(2);
      expect(result.factsExtracted).toBe(1);
      expect(mockExtractFacts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'ep-strong-1' }),
          expect.objectContaining({ id: 'ep-strong-2' }),
        ])
      );
    });

    it('should handle individual fact insert failures gracefully', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ column_name: 'metadata' }] } as any);
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ id: 'ep-1', retrieval_count: 5, retrieval_strength: 0.8 })],
      } as any);

      mockExtractFacts.mockResolvedValueOnce([
        { fact_type: 'preference', content: 'Fact 1', confidence: 0.9 },
        { fact_type: 'behavior', content: 'Fact 2', confidence: 0.8 },
      ]);

      // First fact insert fails
      mockQueryContext.mockRejectedValueOnce(new Error('Unique violation'));
      // Second fact insert succeeds
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.consolidate('personal');

      expect(result.factsExtracted).toBe(1); // only second succeeded
    });

    it('should use non-metadata query when column does not exist', async () => {
      // hasMetadataColumn => false
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // strong episodes
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.consolidate('personal');

      const episodeQuery = mockQueryContext.mock.calls[1][1] as string;
      expect(episodeQuery).not.toContain('metadata');
    });

    it('should return partial result on DB error during consolidation', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('Connection lost'));

      const result = await service.consolidate('personal');

      expect(result.episodesProcessed).toBe(0);
      expect(result.factsExtracted).toBe(0);
    });
  });

  // ===========================================
  // temporalMerge()
  // ===========================================

  describe('temporalMerge', () => {
    it('should merge weekly episodes into summary when >= 3 in a week', async () => {
      const weekEpisodes = [
        makeRow({ id: 'w1', trigger: 'Monday task', created_at: '2026-02-01T10:00:00Z', retrieval_strength: 0.2 }),
        makeRow({ id: 'w2', trigger: 'Tuesday task', created_at: '2026-02-02T10:00:00Z', retrieval_strength: 0.3 }),
        makeRow({ id: 'w3', trigger: 'Wednesday task', created_at: '2026-02-03T10:00:00Z', retrieval_strength: 0.1 }),
      ];

      // weekly eligible
      mockQueryContext.mockResolvedValueOnce({ rows: weekEpisodes } as any);
      // INSERT summary
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // DELETE merged
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // monthly eligible
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.temporalMerge('personal');

      expect(result.weeklyMerged).toBe(1);
      expect(result.episodesRemoved).toBe(3);
    });

    it('should not merge when fewer than 3 episodes in a week', async () => {
      const twoEpisodes = [
        makeRow({ id: 'w1', created_at: '2026-02-01T10:00:00Z', retrieval_strength: 0.2 }),
        makeRow({ id: 'w2', created_at: '2026-02-02T10:00:00Z', retrieval_strength: 0.3 }),
      ];

      mockQueryContext.mockResolvedValueOnce({ rows: twoEpisodes } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // monthly

      const result = await service.temporalMerge('personal');

      expect(result.weeklyMerged).toBe(0);
      expect(result.episodesRemoved).toBe(0);
    });

    it('should handle monthly merge for old episodes', async () => {
      // weekly eligible: none
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      // monthly eligible: 3 episodes from same month
      const monthEpisodes = [
        makeRow({ id: 'm1', trigger: 'Jan task 1', created_at: '2025-12-01T10:00:00Z', retrieval_strength: 0.2 }),
        makeRow({ id: 'm2', trigger: 'Jan task 2', created_at: '2025-12-10T10:00:00Z', retrieval_strength: 0.3 }),
        makeRow({ id: 'm3', trigger: 'Jan task 3', created_at: '2025-12-20T10:00:00Z', retrieval_strength: 0.1 }),
      ];
      mockQueryContext.mockResolvedValueOnce({ rows: monthEpisodes } as any);
      // INSERT monthly summary
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // DELETE merged
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.temporalMerge('personal');

      expect(result.monthlyMerged).toBe(1);
      expect(result.episodesRemoved).toBe(3);
    });

    it('should return zero results on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const result = await service.temporalMerge('personal');

      expect(result.weeklyMerged).toBe(0);
      expect(result.monthlyMerged).toBe(0);
      expect(result.episodesRemoved).toBe(0);
    });
  });

  // ===========================================
  // calculateEmotionalTone() — Extended
  // ===========================================

  describe('calculateEmotionalTone — mood detection', () => {
    const makeEpisode = (valence: number, arousal: number): Episode => ({
      id: 'e1',
      context: 'personal' as const,
      sessionId: 's1',
      timestamp: new Date(),
      trigger: 'Q',
      response: 'A',
      emotionalValence: valence,
      emotionalArousal: arousal,
      temporalContext: { timeOfDay: 'morning', dayOfWeek: 'Monday', isWeekend: false },
      linkedEpisodes: [],
      linkedFacts: [],
      retrievalCount: 0,
      lastRetrieved: null,
      retrievalStrength: 1.0,
    });

    it('should detect frustrated mood (negative + high arousal)', () => {
      const tone = service.calculateEmotionalTone([makeEpisode(-0.5, 0.8)]);
      expect(tone.dominantMood).toBe('frustrated');
    });

    it('should detect negative mood (negative + low arousal)', () => {
      const tone = service.calculateEmotionalTone([makeEpisode(-0.5, 0.4)]);
      expect(tone.dominantMood).toBe('negative');
    });

    it('should detect focused mood (neutral + high arousal)', () => {
      const tone = service.calculateEmotionalTone([makeEpisode(0.0, 0.8)]);
      expect(tone.dominantMood).toBe('focused');
    });
  });

  // ===========================================
  // getStats() — Extended
  // ===========================================

  describe('getStats — parsing edge cases', () => {
    it('should handle null aggregate values', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ total: '0', avg_strength: null, strong: '0', recent: '0' }],
      } as any);

      const stats = await service.getStats('personal');

      expect(stats.totalEpisodes).toBe(0);
      expect(stats.avgRetrievalStrength).toBe(0);
    });
  });

  // ===========================================
  // applyDecay() — Extended
  // ===========================================

  describe('applyDecay — importance-weighted fallback', () => {
    it('should use importance-weighted decay SQL in fallback', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('function not found'));
      mockQueryContext.mockResolvedValueOnce({ rowCount: 25 } as any);

      const count = await service.applyDecay('personal');

      expect(count).toBe(25);
      const fallbackSql = mockQueryContext.mock.calls[1][1] as string;
      expect(fallbackSql).toContain('CASE');
      expect(fallbackSql).toContain('emotional_valence');
      expect(fallbackSql).toContain('retrieval_count');
    });
  });
});
