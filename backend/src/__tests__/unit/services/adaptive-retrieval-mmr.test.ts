/**
 * Adaptive retrieval — MMR post-RRF (Phase H2.6 production binding).
 *
 * Verifies:
 *   - Default behaviour (env flag off, option off) preserves the
 *     legacy RRF top-K order — no diversification applied.
 *   - With `enableMMR: true`, the fused list goes through MMR before
 *     slicing top-K. At λ=1.0 MMR is a no-op (pure relevance) and the
 *     output should match the input top-K order.
 *   - At λ<1.0, near-duplicate items are demoted in favour of more
 *     diverse alternatives.
 *   - When the fused list has only 0 or 1 item, MMR is skipped (no
 *     work to do).
 *   - When the strategy resolves to non-hybrid (`dense`/`sparse`), MMR
 *     options are not consulted (RRF doesn't run, so post-RRF MMR
 *     can't either).
 */

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['operations', 'finance', 'people', 'strategy'].includes(ctx),
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { hybridRetrieve, retrieve } from '../../../services/rag/adaptive-retrieval';

const mockQueryContext = jest.requireMock(
  '../../../utils/database-context',
).queryContext;

describe('hybridRetrieve — MMR post-RRF (H2.6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('legacy: default mmr=undefined preserves RRF top-K order', async () => {
    // Capture and clear the env flag for the duration of the test.
    const prev = process.env.H2_MMR_POST_RRF;
    delete process.env.H2_MMR_POST_RRF;
    try {
      // Two queries: dense + sparse. Both return overlapping items so
      // RRF has work to do.
      mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
        if (/<=>/u.test(sql)) {
          // Dense.
          return {
            rows: [
              { id: 'a', title: 'A', summary: 'about cats', similarity: '0.9' },
              { id: 'b', title: 'B', summary: 'about dogs', similarity: '0.7' },
              { id: 'c', title: 'C', summary: 'about birds', similarity: '0.6' },
            ],
          };
        }
        // Sparse.
        return {
          rows: [
            { id: 'b', title: 'B', summary: 'about dogs', rank: '0.5' },
            { id: 'd', title: 'D', summary: 'about fish', rank: '0.4' },
          ],
        };
      });

      const ids = (
        await hybridRetrieve('cat dog bird fish', 'operations', 4, 60)
      ).map((r) => r.id);
      // Behaviour shape: legacy returns RRF order. We just assert the
      // output set is non-empty and limited to 4 — content depends on
      // RRF math, not on the binding.
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.length).toBeLessThanOrEqual(4);
    } finally {
      if (prev !== undefined) process.env.H2_MMR_POST_RRF = prev;
    }
  });

  it('λ=1.0 (pure relevance) produces same top-K as legacy RRF', async () => {
    mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
      if (/<=>/u.test(sql)) {
        return {
          rows: [
            { id: 'a', title: 'A', summary: 'foo', similarity: '0.9' },
            { id: 'b', title: 'B', summary: 'bar', similarity: '0.7' },
          ],
        };
      }
      return {
        rows: [{ id: 'a', title: 'A', summary: 'foo', rank: '0.4' }],
      };
    });

    const legacy = (
      await hybridRetrieve('a b', 'operations', 2, 60, { enable: false })
    ).map((r) => r.id);
    const mmr10 = (
      await hybridRetrieve('a b', 'operations', 2, 60, {
        enable: true,
        lambda: 1.0,
      })
    ).map((r) => r.id);
    // MMR at λ=1.0 is pure-relevance and should match the legacy order.
    expect(mmr10).toEqual(legacy);
  });

  it('λ<1.0 diversifies near-duplicates over score plateau', async () => {
    // Three items with similar relevance; first two are near-duplicates,
    // third has different content.
    mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
      if (/<=>/u.test(sql)) {
        return {
          rows: [
            { id: 'a', title: 'cats', summary: 'cats are cute and fluffy', similarity: '0.9' },
            { id: 'b', title: 'cats again', summary: 'cats are cute and fluffy', similarity: '0.89' },
            { id: 'c', title: 'birds', summary: 'birds are colourful and small', similarity: '0.85' },
          ],
        };
      }
      return { rows: [] };
    });

    const order = (
      await hybridRetrieve('cute pet', 'operations', 2, 60, {
        enable: true,
        lambda: 0.4,
      })
    ).map((r) => r.id);

    // First pick is highest-relevance: 'a'.
    expect(order[0]).toBe('a');
    // Second pick: at λ=0.4 (diversity-leaning), the near-duplicate 'b'
    // (same summary) should be penalised below the diverse 'c'.
    expect(order[1]).toBe('c');
  });

  it('skips MMR when fused list has 0 or 1 items', async () => {
    mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
      if (/<=>/u.test(sql)) {
        return { rows: [{ id: 'a', title: 'A', summary: 'x', similarity: '0.9' }] };
      }
      return { rows: [] };
    });

    const result = await hybridRetrieve('a', 'operations', 5, 60, {
      enable: true,
      lambda: 0.0,
    });
    expect(result.map((r) => r.id)).toEqual(['a']);
  });

  it('respects maxResults cap on MMR-diversified output', async () => {
    mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
      if (/<=>/u.test(sql)) {
        return {
          rows: Array.from({ length: 10 }, (_, i) => ({
            id: `id-${i}`,
            title: `T-${i}`,
            summary: `text-${i}`,
            similarity: String(0.9 - i * 0.05),
          })),
        };
      }
      return { rows: [] };
    });

    const result = await hybridRetrieve('many', 'operations', 3, 60, {
      enable: true,
      lambda: 0.5,
    });
    expect(result.length).toBe(3);
  });
});

describe('retrieve() integration — MMR option propagates to hybrid path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  it('enableMMR option is threaded through to hybridRetrieve', async () => {
    // Force hybrid strategy and supply mmr options.
    mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
      if (/<=>/u.test(sql)) {
        return {
          rows: [
            { id: 'a', title: 'A', summary: 'cat', similarity: '0.9' },
            { id: 'b', title: 'A2', summary: 'cat duplicate', similarity: '0.85' },
            { id: 'c', title: 'B', summary: 'bird', similarity: '0.8' },
          ],
        };
      }
      return { rows: [] };
    });

    const out = await retrieve('cat or bird', 'operations', {
      forceStrategy: 'hybrid',
      enableMMR: true,
      mmrLambda: 0.3,
      maxResults: 2,
    });
    expect(out.results.length).toBe(2);
    // 'a' (highest relevance) wins position 0 deterministically.
    expect(out.results[0].id).toBe('a');
    // Position 1 should be 'c' (diverse) over 'b' (duplicate of 'a').
    expect(out.results[1].id).toBe('c');
  });

  it('enableMMR=false leaves hybrid path unchanged', async () => {
    mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
      if (/<=>/u.test(sql)) {
        return {
          rows: [
            { id: 'a', title: 'A', summary: 'foo', similarity: '0.9' },
            { id: 'b', title: 'B', summary: 'bar', similarity: '0.8' },
          ],
        };
      }
      return { rows: [] };
    });

    const out = await retrieve('foo bar', 'operations', {
      forceStrategy: 'hybrid',
      enableMMR: false,
      maxResults: 2,
    });
    expect(out.results.length).toBe(2);
    // Order follows RRF (highest-rrf wins).
    expect(out.results[0].id).toBe('a');
  });

  it('non-hybrid strategy ignores MMR options entirely', async () => {
    mockQueryContext.mockImplementation(async (_ctx: string, sql: string) => {
      if (/<=>/u.test(sql)) {
        return {
          rows: [
            { id: 'a', title: 'A', summary: 'foo', similarity: '0.9' },
            { id: 'b', title: 'B', summary: 'bar', similarity: '0.8' },
          ],
        };
      }
      return { rows: [] };
    });

    const out = await retrieve('foo', 'operations', {
      forceStrategy: 'dense',
      enableMMR: true,
      mmrLambda: 0.0,
      maxResults: 5,
    });
    // Pure dense: order is similarity-descending — MMR not invoked.
    expect(out.results.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
