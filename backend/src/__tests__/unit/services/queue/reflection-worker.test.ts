// backend/src/__tests__/unit/services/queue/reflection-worker.test.ts
import { processWeeklyReflection } from '../../../../services/queue/workers/reflection-worker';

// Mock dependencies
const mockQueryContext = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryContext: (...args: any[]) => mockQueryContext(...args),
}));

const mockGenerateClaude = jest.fn();
jest.mock('../../../../services/claude/core', () => ({
  generateClaudeResponse: (...args: any[]) => mockGenerateClaude(...args),
}));

const mockStoreEpisodic = jest.fn();
jest.mock('../../../../services/memory/episodic-memory', () => ({
  episodicMemory: { store: (...args: any[]) => mockStoreEpisodic(...args) },
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Weekly Reflection Worker', () => {
  const mockJob = {
    id: 'test-job-1',
    data: {},
    log: jest.fn(),
    updateProgress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockResolvedValue({ rows: [] });
    mockGenerateClaude.mockResolvedValue('Weekly reflection summary');
    mockStoreEpisodic.mockResolvedValue(undefined);
  });

  it('should aggregate data from all 4 contexts', async () => {
    await processWeeklyReflection(mockJob as any);

    const contexts = ['operations', 'finance', 'people', 'strategy'];
    const contextCalls = mockQueryContext.mock.calls.map((c: any[]) => c[0]);
    for (const ctx of contexts) {
      expect(contextCalls).toContain(ctx);
    }
  });

  it('should query ideas created in the last 7 days', async () => {
    await processWeeklyReflection(mockJob as any);

    const ideaQueries = mockQueryContext.mock.calls.filter(
      (c: any[]) => typeof c[1] === 'string' && c[1].includes('ideas')
    );
    expect(ideaQueries.length).toBeGreaterThan(0);
    expect(ideaQueries[0][1]).toContain('7');
  });

  it('should call Claude to generate the reflection', async () => {
    await processWeeklyReflection(mockJob as any);

    expect(mockGenerateClaude).toHaveBeenCalledTimes(1);
    expect(mockGenerateClaude.mock.calls[0][0]).toContain('weekly reflection');
  });

  it('should store the reflection in episodic memory', async () => {
    await processWeeklyReflection(mockJob as any);

    expect(mockStoreEpisodic).toHaveBeenCalledTimes(1);
    expect(mockStoreEpisodic.mock.calls[0][0]).toContain('weekly_reflection');
  });

  it('should handle empty data gracefully', async () => {
    mockQueryContext.mockResolvedValue({ rows: [] });

    const result = await processWeeklyReflection(mockJob as any);
    expect(result).toBeDefined();
    // Should still generate a reflection even with no data
    expect(mockGenerateClaude).toHaveBeenCalledTimes(1);
  });

  it('should handle Claude API errors gracefully', async () => {
    mockGenerateClaude.mockRejectedValue(new Error('API rate limit'));

    await expect(processWeeklyReflection(mockJob as any))
      .rejects.toThrow('API rate limit');
  });
});
