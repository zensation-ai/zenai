/**
 * Reasoning Chain Store Tests
 * Phase 128, Task 2 — TDD
 *
 * Tests cover:
 * - storeChain: stores with embedding, returns ID
 * - findSimilarChains: similarity search, limit, minSimilarity, only reusable
 * - getChain: returns chain, null for missing
 * - markReusable: updates flag
 * - recordFeedback: stores rating, auto-marks reusable for high ratings
 * - incrementReuseCount: increments counter
 * - getReusableChainForQuery: convenience wrapper, returns null when no match
 */

import { queryContext } from '../../../../utils/database-context';
import { generateEmbedding } from '../../../../services/ai';
import {
  storeChain,
  findSimilarChains,
  getChain,
  markReusable,
  recordFeedback,
  incrementReuseCount,
  getReusableChainForQuery,
} from '../../../../services/reasoning/chain-store';
import type { ReasoningChain } from '../../../../services/reasoning/chain-store';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockGenerateEmbedding = generateEmbedding as jest.MockedFunction<typeof generateEmbedding>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockChainRow = {
  id: 'chain-001',
  user_id: 'user-001',
  query: 'What is the capital of France?',
  steps: [
    { stepNumber: 1, type: 'observation', content: 'The question is about geography', confidence: 0.9 },
    { stepNumber: 2, type: 'inference', content: 'France is a country in Europe', confidence: 0.95 },
    { stepNumber: 3, type: 'conclusion', content: 'The capital is Paris', confidence: 0.99 },
  ],
  conclusion: 'The capital of France is Paris.',
  confidence: 0.97,
  domain: 'geography',
  used_facts: ['fact-001', 'fact-002'],
  used_tools: ['web_search'],
  user_feedback: null,
  reusable: true,
  reuse_count: 0,
  created_at: new Date('2026-01-01T10:00:00Z'),
};

function toChainObject(row: typeof mockChainRow): ReasoningChain {
  return {
    id: row.id,
    userId: row.user_id,
    query: row.query,
    steps: row.steps,
    conclusion: row.conclusion,
    confidence: row.confidence,
    domain: row.domain,
    usedFacts: row.used_facts,
    usedTools: row.used_tools,
    userFeedback: row.user_feedback,
    reusable: row.reusable,
    reuseCount: row.reuse_count,
    createdAt: row.created_at,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('chain-store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── storeChain ────────────────────────────────────────────────────────────

  describe('storeChain', () => {
    it('should generate an embedding from the query', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockChainRow], rowCount: 1 } as any);

      await storeChain('personal', {
        userId: 'user-001',
        query: 'What is the capital of France?',
        steps: mockChainRow.steps,
        conclusion: mockChainRow.conclusion,
        confidence: 0.97,
        domain: 'geography',
        usedFacts: ['fact-001', 'fact-002'],
        usedTools: ['web_search'],
        userFeedback: null,
        reusable: true,
      });

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('What is the capital of France?');
    });

    it('should insert the chain and return the new ID', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockChainRow], rowCount: 1 } as any);

      const id = await storeChain('personal', {
        userId: 'user-001',
        query: 'What is the capital of France?',
        steps: mockChainRow.steps,
        conclusion: mockChainRow.conclusion,
        confidence: 0.97,
        domain: 'geography',
        usedFacts: ['fact-001', 'fact-002'],
        usedTools: ['web_search'],
        userFeedback: null,
        reusable: true,
      });

      expect(id).toBe('chain-001');
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
    });

    it('should pass the embedding vector to the query', async () => {
      const fakeEmbedding = new Array(1536).fill(0.42);
      mockGenerateEmbedding.mockResolvedValueOnce(fakeEmbedding);
      mockQueryContext.mockResolvedValueOnce({ rows: [mockChainRow], rowCount: 1 } as any);

      await storeChain('work', {
        userId: 'user-002',
        query: 'Explain TypeScript generics',
        steps: [],
        conclusion: null,
        confidence: 0.5,
        domain: 'code',
        usedFacts: [],
        usedTools: [],
        userFeedback: null,
        reusable: false,
      });

      const [, sql, params] = mockQueryContext.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO reasoning_chains/i);
      expect(params).toContain(JSON.stringify(fakeEmbedding));
    });

    it('should still store the chain even if embedding generation fails', async () => {
      mockGenerateEmbedding.mockRejectedValueOnce(new Error('embedding service down'));
      mockQueryContext.mockResolvedValueOnce({ rows: [{ ...mockChainRow, id: 'chain-002' }], rowCount: 1 } as any);

      const id = await storeChain('personal', {
        userId: 'user-001',
        query: 'fallback test',
        steps: [],
        conclusion: null,
        confidence: 0.3,
        domain: null,
        usedFacts: [],
        usedTools: [],
        userFeedback: null,
        reusable: false,
      });

      expect(id).toBe('chain-002');
    });

    it('should use the correct context for the DB call', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockChainRow], rowCount: 1 } as any);

      await storeChain('learning', {
        userId: 'user-001',
        query: 'test query',
        steps: [],
        conclusion: null,
        confidence: 0.5,
        domain: null,
        usedFacts: [],
        usedTools: [],
        userFeedback: null,
        reusable: false,
      });

      expect(mockQueryContext).toHaveBeenCalledWith('learning', expect.any(String), expect.any(Array));
    });
  });

  // ─── findSimilarChains ─────────────────────────────────────────────────────

  describe('findSimilarChains', () => {
    const similarRow = { ...mockChainRow, similarity: 0.92 };

    it('should return chains with similarity scores', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [similarRow], rowCount: 1 } as any);

      const results = await findSimilarChains('personal', 'What is Paris?');

      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBe(0.92);
      expect(results[0].id).toBe('chain-001');
    });

    it('should default to limit=3', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await findSimilarChains('personal', 'some query');

      const [, , params] = mockQueryContext.mock.calls[0];
      // limit is passed as a parameter
      expect(params).toContain(3);
    });

    it('should respect a custom limit', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await findSimilarChains('personal', 'some query', 10);

      const [, , params] = mockQueryContext.mock.calls[0];
      expect(params).toContain(10);
    });

    it('should default to minSimilarity=0.85', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await findSimilarChains('personal', 'some query');

      const [, , params] = mockQueryContext.mock.calls[0];
      expect(params).toContain(0.85);
    });

    it('should respect a custom minSimilarity', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await findSimilarChains('personal', 'some query', 3, 0.70);

      const [, , params] = mockQueryContext.mock.calls[0];
      expect(params).toContain(0.70);
    });

    it('should only query reusable chains', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await findSimilarChains('personal', 'some query');

      const [, sql] = mockQueryContext.mock.calls[0];
      expect(sql).toMatch(/reusable\s*=\s*true/i);
    });

    it('should order results by similarity DESC', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await findSimilarChains('personal', 'some query');

      const [, sql] = mockQueryContext.mock.calls[0];
      expect(sql).toMatch(/ORDER BY similarity DESC/i);
    });

    it('should map DB rows to ReasoningChain objects with similarity', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockChainRow, similarity: 0.91 }],
        rowCount: 1,
      } as any);

      const [chain] = await findSimilarChains('personal', 'What is Paris?');

      expect(chain.id).toBe('chain-001');
      expect(chain.userId).toBe('user-001');
      expect(chain.query).toBe('What is the capital of France?');
      expect(chain.steps).toHaveLength(3);
      expect(chain.reusable).toBe(true);
      expect(chain.similarity).toBe(0.91);
    });
  });

  // ─── getChain ──────────────────────────────────────────────────────────────

  describe('getChain', () => {
    it('should return a ReasoningChain when found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockChainRow], rowCount: 1 } as any);

      const chain = await getChain('personal', 'chain-001');

      expect(chain).not.toBeNull();
      expect(chain!.id).toBe('chain-001');
      expect(chain!.query).toBe('What is the capital of France?');
      expect(chain!.conclusion).toBe('The capital of France is Paris.');
      expect(chain!.createdAt).toEqual(new Date('2026-01-01T10:00:00Z'));
    });

    it('should return null when chain is not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const chain = await getChain('personal', 'nonexistent-id');

      expect(chain).toBeNull();
    });

    it('should query by the provided ID', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockChainRow], rowCount: 1 } as any);

      await getChain('work', 'chain-abc');

      const [context, , params] = mockQueryContext.mock.calls[0];
      expect(context).toBe('work');
      expect(params).toContain('chain-abc');
    });
  });

  // ─── markReusable ──────────────────────────────────────────────────────────

  describe('markReusable', () => {
    it('should update the reusable flag to true', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await markReusable('personal', 'chain-001', true);

      const [, sql, params] = mockQueryContext.mock.calls[0];
      expect(sql).toMatch(/UPDATE reasoning_chains/i);
      expect(params).toContain(true);
      expect(params).toContain('chain-001');
    });

    it('should update the reusable flag to false', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await markReusable('personal', 'chain-001', false);

      const [, , params] = mockQueryContext.mock.calls[0];
      expect(params).toContain(false);
    });

    it('should resolve without error on success', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await expect(markReusable('personal', 'chain-001', true)).resolves.toBeUndefined();
    });
  });

  // ─── recordFeedback ────────────────────────────────────────────────────────

  describe('recordFeedback', () => {
    it('should store the user feedback rating', async () => {
      // First call: update feedback, second call: markReusable (for high rating)
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await recordFeedback('personal', 'chain-001', 3);

      const [, sql, params] = mockQueryContext.mock.calls[0];
      expect(sql).toMatch(/UPDATE reasoning_chains/i);
      expect(params).toContain(3);
      expect(params).toContain('chain-001');
    });

    it('should auto-mark as reusable when rating >= 4', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await recordFeedback('personal', 'chain-001', 4);

      // Should make two DB calls: one for feedback, one for reusable
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
      const secondCall = mockQueryContext.mock.calls[1];
      expect(secondCall[1]).toMatch(/UPDATE reasoning_chains/i);
      expect(secondCall[2]).toContain(true); // reusable = true
    });

    it('should auto-mark as reusable for rating = 5', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await recordFeedback('personal', 'chain-001', 5);

      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });

    it('should NOT auto-mark as reusable when rating < 4', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await recordFeedback('personal', 'chain-001', 3);

      // Only the feedback update, no reusable update
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
    });

    it('should resolve without error', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await expect(recordFeedback('personal', 'chain-001', 5)).resolves.toBeUndefined();
    });
  });

  // ─── incrementReuseCount ───────────────────────────────────────────────────

  describe('incrementReuseCount', () => {
    it('should issue an UPDATE with reuse_count + 1', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await incrementReuseCount('personal', 'chain-001');

      const [, sql, params] = mockQueryContext.mock.calls[0];
      expect(sql).toMatch(/reuse_count\s*=\s*reuse_count\s*\+\s*1/i);
      expect(params).toContain('chain-001');
    });

    it('should use the correct context', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await incrementReuseCount('creative', 'chain-xyz');

      expect(mockQueryContext).toHaveBeenCalledWith('creative', expect.any(String), expect.any(Array));
    });

    it('should resolve without error', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await expect(incrementReuseCount('personal', 'chain-001')).resolves.toBeUndefined();
    });
  });

  // ─── getReusableChainForQuery ──────────────────────────────────────────────

  describe('getReusableChainForQuery', () => {
    it('should return the best matching chain when similarity > 0.85', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockChainRow, similarity: 0.93 }],
        rowCount: 1,
      } as any);

      const chain = await getReusableChainForQuery('personal', 'What is Paris the capital of?');

      expect(chain).not.toBeNull();
      expect(chain!.id).toBe('chain-001');
    });

    it('should return null when no similar chain exists', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const chain = await getReusableChainForQuery('personal', 'Something completely unrelated');

      expect(chain).toBeNull();
    });

    it('should return the first (best) result from findSimilarChains', async () => {
      const row1 = { ...mockChainRow, id: 'chain-best', similarity: 0.96 };
      const row2 = { ...mockChainRow, id: 'chain-second', similarity: 0.88 };
      mockQueryContext.mockResolvedValueOnce({ rows: [row1, row2], rowCount: 2 } as any);

      const chain = await getReusableChainForQuery('personal', 'France question');

      expect(chain!.id).toBe('chain-best');
    });

    it('should use limit=1 internally for efficiency', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await getReusableChainForQuery('personal', 'test');

      const [, , params] = mockQueryContext.mock.calls[0];
      expect(params).toContain(1);
    });
  });
});
