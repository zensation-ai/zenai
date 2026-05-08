/**
 * Cross-Learning Service Tests (Phase 143)
 *
 * Tests for extracting strategy insights from successful agent executions
 * and injecting them into future agent prompts.
 */

const mockQueryPublic = jest.fn();
jest.mock('../../../../utils/database', () => ({
  queryPublic: (...args: unknown[]) => mockQueryPublic(...args),
}));

const mockGenerateClaudeResponse = jest.fn();
jest.mock('../../../../services/claude/core', () => ({
  generateClaudeResponse: (...args: unknown[]) => mockGenerateClaudeResponse(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CrossLearningService, StrategyInsight } from '../../../../services/agents/cross-learning';

// =============================================================================
// Helpers
// =============================================================================

function makeMockInsightRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'ins-001',
    source_agent_role: 'researcher',
    strategy_type: 'decomposition',
    insight: 'Break complex queries into sub-questions before searching.',
    context: 'research task',
    success_rate: 0.85,
    sample_size: 10,
    applicable_roles: ['researcher', 'writer'],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function makeInsight(overrides: Partial<StrategyInsight> = {}): StrategyInsight {
  return {
    id: 'ins-001',
    sourceAgentRole: 'researcher',
    strategyType: 'decomposition',
    insight: 'Break complex queries into sub-questions before searching.',
    context: 'research task',
    successRate: 0.85,
    sampleSize: 10,
    applicableRoles: ['researcher', 'writer'],
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('CrossLearningService', () => {
  let service: CrossLearningService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
    mockGenerateClaudeResponse.mockReset();
    service = new CrossLearningService();
  });

  // ===========================================================================
  // extractInsight
  // ===========================================================================

  describe('extractInsight', () => {
    const highRatedExecution = {
      role: 'researcher',
      strategy: 'decomposition',
      result: 'Found 12 relevant papers by breaking query into sub-topics.',
      context: 'research task',
      rating: 5,
    };

    it('extracts insight from high-rated execution (rating >= 4)', async () => {
      const aiJson = JSON.stringify({
        insight: 'Decompose broad queries into focused sub-questions.',
        applicableRoles: ['researcher', 'writer'],
      });
      mockGenerateClaudeResponse.mockResolvedValue(aiJson);
      mockQueryPublic.mockResolvedValue({ rows: [makeMockInsightRow()] });

      const result = await service.extractInsight(highRatedExecution);

      expect(result).not.toBeNull();
      expect(result!.sourceAgentRole).toBe('researcher');
      expect(result!.strategyType).toBe('decomposition');
      expect(mockGenerateClaudeResponse).toHaveBeenCalledTimes(1);
      expect(mockQueryPublic).toHaveBeenCalledTimes(1);
    });

    it('returns null for low-rated execution (rating < 4)', async () => {
      const result = await service.extractInsight({
        ...highRatedExecution,
        rating: 3,
      });

      expect(result).toBeNull();
      expect(mockGenerateClaudeResponse).not.toHaveBeenCalled();
      expect(mockQueryPublic).not.toHaveBeenCalled();
    });

    it('returns null for missing rating', async () => {
      const result = await service.extractInsight({
        role: 'researcher',
        strategy: 'decomposition',
        result: 'Some result.',
        context: 'research task',
      });

      expect(result).toBeNull();
      expect(mockGenerateClaudeResponse).not.toHaveBeenCalled();
    });

    it('stores insight in database', async () => {
      const aiJson = JSON.stringify({
        insight: 'Use parallel searches for multi-faceted queries.',
        applicableRoles: ['researcher'],
      });
      mockGenerateClaudeResponse.mockResolvedValue(aiJson);
      mockQueryPublic.mockResolvedValue({
        rows: [
          makeMockInsightRow({
            insight: 'Use parallel searches for multi-faceted queries.',
            applicable_roles: ['researcher'],
          }),
        ],
      });

      await service.extractInsight(highRatedExecution);

      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_strategy_insights'),
        expect.arrayContaining([
          'researcher',
          'decomposition',
          'Use parallel searches for multi-faceted queries.',
          'research task',
          1.0,
          1,
          ['researcher'],
        ])
      );
    });

    it('handles non-JSON AI response gracefully', async () => {
      mockGenerateClaudeResponse.mockResolvedValue('Just a plain text insight about strategies');
      mockQueryPublic.mockResolvedValue({ rows: [makeMockInsightRow()] });

      const result = await service.extractInsight(highRatedExecution);

      expect(result).not.toBeNull();
      // Falls back to raw text as insight and role as applicable
      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('INSERT'),
        expect.arrayContaining(['Just a plain text insight about strategies'])
      );
    });
  });

  // ===========================================================================
  // getRelevantInsights
  // ===========================================================================

  describe('getRelevantInsights', () => {
    it('returns insights matching role', async () => {
      mockQueryPublic.mockResolvedValue({
        rows: [
          makeMockInsightRow({ id: 'ins-001' }),
          makeMockInsightRow({ id: 'ins-002', success_rate: 0.75 }),
        ],
      });

      const results = await service.getRelevantInsights('researcher', 'find papers');

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('ins-001');
      expect(results[1].id).toBe('ins-002');
    });

    it('limits to 5 results', async () => {
      mockQueryPublic.mockResolvedValue({
        rows: Array.from({ length: 5 }, (_, i) =>
          makeMockInsightRow({ id: `ins-${i}`, success_rate: 0.9 - i * 0.1 })
        ),
      });

      const results = await service.getRelevantInsights('researcher', 'research');

      expect(results).toHaveLength(5);
      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        ['researcher', 5]
      );
    });

    it('returns empty array when none found', async () => {
      mockQueryPublic.mockResolvedValue({ rows: [] });

      const results = await service.getRelevantInsights('unknown_role', 'task');

      expect(results).toEqual([]);
    });
  });

  // ===========================================================================
  // enrichAgentPrompt
  // ===========================================================================

  describe('enrichAgentPrompt', () => {
    const basePrompt = 'You are a research agent. Find relevant papers.';

    it('returns unchanged prompt when no insights', () => {
      const result = service.enrichAgentPrompt(basePrompt, []);

      expect(result).toBe(basePrompt);
    });

    it('appends insights section to prompt', () => {
      const insights = [makeInsight()];

      const result = service.enrichAgentPrompt(basePrompt, insights);

      expect(result).toContain(basePrompt);
      expect(result).toContain('## Cross-Learning Insights');
      expect(result).toContain(
        'The following strategies have worked well for similar tasks:'
      );
    });

    it('includes role and success rate for each insight', () => {
      const insights = [
        makeInsight({ sourceAgentRole: 'researcher', successRate: 0.85 }),
        makeInsight({
          id: 'ins-002',
          sourceAgentRole: 'writer',
          successRate: 0.92,
          insight: 'Outline before drafting improves coherence.',
        }),
      ];

      const result = service.enrichAgentPrompt(basePrompt, insights);

      expect(result).toContain('[from researcher, 85% success]');
      expect(result).toContain('[from writer, 92% success]');
      expect(result).toContain('Break complex queries into sub-questions');
      expect(result).toContain('Outline before drafting improves coherence.');
    });

    it('limits to provided insights (no extra fetching)', () => {
      const insights = [makeInsight()];

      const result = service.enrichAgentPrompt(basePrompt, insights);

      // Should not call any async/DB functions — pure function
      expect(mockQueryPublic).not.toHaveBeenCalled();
      expect(mockGenerateClaudeResponse).not.toHaveBeenCalled();
      expect(result.split('[from ').length - 1).toBe(1);
    });
  });

  // ===========================================================================
  // recordInsightOutcome
  // ===========================================================================

  describe('recordInsightOutcome', () => {
    it('updates success rate on helpful', async () => {
      mockQueryPublic.mockResolvedValue({ rowCount: 1 });

      await service.recordInsightOutcome('ins-001', true);

      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('success_rate = success_rate * 0.9 + $1 * 0.1'),
        [1, 'ins-001']
      );
    });

    it('decreases rate on unhelpful', async () => {
      mockQueryPublic.mockResolvedValue({ rowCount: 1 });

      await service.recordInsightOutcome('ins-001', false);

      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('success_rate = success_rate * 0.9 + $1 * 0.1'),
        [0, 'ins-001']
      );
    });

    it('increments sample_size', async () => {
      mockQueryPublic.mockResolvedValue({ rowCount: 1 });

      await service.recordInsightOutcome('ins-001', true);

      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('sample_size = sample_size + 1'),
        expect.any(Array)
      );
    });
  });

  // ===========================================================================
  // pruneWeakInsights
  // ===========================================================================

  describe('pruneWeakInsights', () => {
    it('deletes weak old insights', async () => {
      mockQueryPublic.mockResolvedValue({
        rows: [{ id: 'ins-old-1' }, { id: 'ins-old-2' }, { id: 'ins-old-3' }],
      });

      const deleted = await service.pruneWeakInsights(0.3);

      expect(deleted).toBe(3);
      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM agent_strategy_insights'),
        expect.arrayContaining(['30 days', 0.3])
      );
    });

    it('returns count of deleted', async () => {
      mockQueryPublic.mockResolvedValue({ rows: [] });

      const deleted = await service.pruneWeakInsights();

      expect(deleted).toBe(0);
    });

    it('uses default minSuccessRate of 0.3', async () => {
      mockQueryPublic.mockResolvedValue({ rows: [] });

      await service.pruneWeakInsights();

      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('success_rate < $2'),
        expect.arrayContaining([0.3])
      );
    });

    it('only deletes insights with sample_size >= 5', async () => {
      mockQueryPublic.mockResolvedValue({ rows: [] });

      await service.pruneWeakInsights(0.5);

      expect(mockQueryPublic).toHaveBeenCalledWith(
        expect.stringContaining('sample_size >= 5'),
        expect.any(Array)
      );
    });
  });
});
