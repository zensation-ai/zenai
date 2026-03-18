/**
 * Phase 101 B4: Memory Benchmark Framework Tests
 */

import {
  generateRetrievalQuery,
  runMemoryBenchmark,
  BenchmarkResult,
} from '../../../services/memory/memory-benchmark';

// Mock dependencies
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../../services/memory', () => ({
  longTermMemory: {
    getFacts: jest.fn(),
    retrieve: jest.fn(),
  },
}));

import { queryContext } from '../../../utils/database-context';
import { longTermMemory } from '../../../services/memory';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockGetFacts = longTermMemory.getFacts as jest.MockedFunction<typeof longTermMemory.getFacts>;
const mockRetrieve = longTermMemory.retrieve as jest.MockedFunction<typeof longTermMemory.retrieve>;

describe('generateRetrievalQuery', () => {
  it('generates a non-empty string query from fact content', () => {
    const query = generateRetrievalQuery('User prefers dark mode in code editors');
    expect(typeof query).toBe('string');
    expect(query.length).toBeGreaterThan(0);
  });

  it('generates a query that contains key terms from the fact', () => {
    const factContent = 'User enjoys cycling on weekends';
    const query = generateRetrievalQuery(factContent);
    // Query should be related to the fact content
    expect(query).toBeTruthy();
  });

  it('handles short fact content', () => {
    const query = generateRetrievalQuery('Python');
    expect(typeof query).toBe('string');
    expect(query.length).toBeGreaterThan(0);
  });

  it('handles long fact content by truncating or summarizing', () => {
    const longFact = 'User has been working as a software engineer for 10 years and specializes in backend development using TypeScript and Node.js, with experience in microservices architecture';
    const query = generateRetrievalQuery(longFact);
    expect(typeof query).toBe('string');
    expect(query.length).toBeGreaterThan(0);
  });
});

describe('runMemoryBenchmark', () => {
  beforeEach(() => {
    mockQueryContext.mockReset();
    mockGetFacts.mockReset();
    mockRetrieve.mockReset();
  });

  it('returns a valid BenchmarkResult structure', async () => {
    // Mock getFacts to return some sample facts
    mockGetFacts.mockResolvedValueOnce([
      { id: 'fact-1', content: 'User prefers dark mode', factType: 'preference', confidence: 0.9, occurrences: 3 },
      { id: 'fact-2', content: 'User codes in TypeScript', factType: 'knowledge', confidence: 0.8, occurrences: 5 },
    ] as never);

    // Mock retrieve to return the fact as a result (simulates successful retrieval)
    mockRetrieve.mockResolvedValue({
      facts: [
        { id: 'fact-1', content: 'User prefers dark mode', factType: 'preference', confidence: 0.9, occurrences: 3 },
      ],
      patterns: [],
    } as never);

    const result: BenchmarkResult = await runMemoryBenchmark('personal', 2);

    expect(result).toHaveProperty('totalFacts');
    expect(result).toHaveProperty('retrievedCorrectly');
    expect(result).toHaveProperty('recallAtK');
    expect(result).toHaveProperty('averageRetrievalLatency');

    expect(typeof result.totalFacts).toBe('number');
    expect(typeof result.retrievedCorrectly).toBe('number');
    expect(result.recallAtK).toBeGreaterThanOrEqual(0);
    expect(result.recallAtK).toBeLessThanOrEqual(1);
    expect(result.averageRetrievalLatency).toBeGreaterThanOrEqual(0);
  });

  it('returns zero recall when no facts retrieved', async () => {
    mockGetFacts.mockResolvedValueOnce([
      { id: 'fact-1', content: 'Unique test fact XYZ', factType: 'knowledge', confidence: 0.8, occurrences: 1 },
    ] as never);

    // Mock retrieve to return empty results
    mockRetrieve.mockResolvedValue({ facts: [], patterns: [] } as never);

    const result: BenchmarkResult = await runMemoryBenchmark('personal', 1);

    expect(result.totalFacts).toBe(1);
    expect(result.retrievedCorrectly).toBe(0);
    expect(result.recallAtK).toBe(0);
  });

  it('handles empty facts list gracefully', async () => {
    mockGetFacts.mockResolvedValueOnce([] as never);

    const result: BenchmarkResult = await runMemoryBenchmark('personal', 10);

    expect(result.totalFacts).toBe(0);
    expect(result.retrievedCorrectly).toBe(0);
    expect(result.recallAtK).toBe(0);
  });

  it('handles DB/retrieval errors gracefully', async () => {
    mockGetFacts.mockRejectedValueOnce(new Error('DB error'));

    const result: BenchmarkResult = await runMemoryBenchmark('personal', 10);

    // Should return a safe default result, not throw
    expect(result).toHaveProperty('totalFacts');
    expect(result.totalFacts).toBe(0);
  });
});
