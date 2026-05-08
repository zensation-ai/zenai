/**
 * Tests for the Hebbian → PPR DB-loader.
 *
 * Phase H sprint reference: spec § H2 task 1 (HippoRAG 2 PPR binding).
 */

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['operations', 'finance', 'people', 'strategy'].includes(ctx),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { queryContext } from '../../../../utils/database-context';
import { loadHebbianSubgraphForPPR } from '../../../../services/knowledge-graph/hebbian-ppr-loader';

const mockQuery = queryContext as jest.MockedFunction<typeof queryContext>;

describe('loadHebbianSubgraphForPPR', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it('returns null when seed list is empty', async () => {
    const result = await loadHebbianSubgraphForPPR('operations', []);
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns null when none of the seeds exist in knowledge_entities', async () => {
    // filterValidSeeds: knowledge_entities query returns nothing.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const result = await loadHebbianSubgraphForPPR('operations', [
      'a',
      'b',
    ]);
    expect(result).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('builds a one-hop subgraph from entity_relations', async () => {
    // 1) filterValidSeeds — both seeds valid.
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'seed-1' }, { id: 'seed-2' }],
    } as any);
    // 2) entity_relations one-hop — direct edge between seeds + edge to neighbour-1.
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          source_entity_id: 'seed-1',
          target_entity_id: 'seed-2',
          weight: 0.8,
        },
        {
          source_entity_id: 'seed-1',
          target_entity_id: 'neighbour-1',
          weight: 0.5,
        },
      ],
    } as any);
    // 3) entity_coactivations one-hop — empty.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    // 4) entity_relations second hop (only neighbour-1 in frontier; returns empty).
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    // 5) entity_coactivations second hop — empty.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const result = await loadHebbianSubgraphForPPR(
      'operations',
      ['seed-1', 'seed-2'],
      { maxHops: 2 },
    );
    expect(result).not.toBeNull();
    expect(result!.graph.nodes).toEqual(
      expect.arrayContaining(['seed-1', 'seed-2', 'neighbour-1']),
    );
    expect(result!.graph.nodes.length).toBe(3);
    expect(result!.graph.edges.length).toBe(2);
    expect(result!.stats.relationEdges).toBe(2);
    expect(result!.stats.coactivationEdges).toBe(0);
    expect(result!.stats.hopsCovered).toBe(2);
    expect(result!.validSeeds).toEqual(['seed-1', 'seed-2']);
  });

  it('treats coactivations as undirected and emits two directed edges per row', async () => {
    // 1) filterValidSeeds.
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'seed-1' }] } as any);
    // 2) entity_relations — empty.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    // 3) entity_coactivations — one undirected pair.
    mockQuery.mockResolvedValueOnce({
      rows: [
        { entity_a_id: 'seed-1', entity_b_id: 'neighbour-1', weight: 3 },
      ],
    } as any);
    // 4-5) second hop — empty.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const result = await loadHebbianSubgraphForPPR(
      'operations',
      ['seed-1'],
      { maxHops: 2 },
    );
    expect(result).not.toBeNull();
    // Undirected expansion: one input row → two directed edges.
    expect(result!.graph.edges.length).toBe(2);
    const directions = result!.graph.edges.map((e) => `${e[0]}->${e[1]}`);
    expect(directions).toEqual(
      expect.arrayContaining([
        'seed-1->neighbour-1',
        'neighbour-1->seed-1',
      ]),
    );
    expect(result!.stats.coactivationEdges).toBe(1);
  });

  it('respects minRelationWeight and minCoactivationCount thresholds', async () => {
    // 1) filterValidSeeds.
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'seed' }] } as any);
    // 2) entity_relations — DB layer applies the `>= minRelationWeight`
    //    filter, so the query must have received the threshold value.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    // 3) entity_coactivations — DB layer applies `>= minCoactivationCount`.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    await loadHebbianSubgraphForPPR('operations', ['seed'], {
      maxHops: 1,
      minRelationWeight: 0.5,
      minCoactivationCount: 3,
    });
    // Inspect the SQL parameters we sent.
    const relCall = mockQuery.mock.calls[1];
    const coactCall = mockQuery.mock.calls[2];
    expect(relCall[2]).toEqual([['seed'], 0.5]);
    expect(coactCall[2]).toEqual([['seed'], 3]);
  });

  it('truncates the subgraph at maxNodes and reports it', async () => {
    // 1) filterValidSeeds.
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'seed' }] } as any);
    // 2) entity_relations — many neighbours, more than the budget.
    mockQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 10 }, (_, i) => ({
        source_entity_id: 'seed',
        target_entity_id: `n-${i}`,
        weight: 1.0,
      })),
    } as any);
    // 3) entity_coactivations — empty.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const result = await loadHebbianSubgraphForPPR(
      'operations',
      ['seed'],
      { maxHops: 1, maxNodes: 4 }, // 1 seed + 3 neighbours
    );
    expect(result).not.toBeNull();
    expect(result!.stats.truncated).toBe(true);
    // Node count must respect the budget.
    expect(result!.graph.nodes.length).toBeLessThanOrEqual(4);
    // Filtering should drop edges to nodes that didn't make it in.
    for (const [src, tgt] of result!.graph.edges) {
      expect(result!.graph.nodes).toContain(src);
      expect(result!.graph.nodes).toContain(tgt);
    }
  });

  it('expands two hops and includes second-hop edges', async () => {
    // 1) filterValidSeeds.
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'seed' }] } as any);
    // 2) hop 1 entity_relations — one edge to neighbour-1.
    mockQuery.mockResolvedValueOnce({
      rows: [
        { source_entity_id: 'seed', target_entity_id: 'neighbour-1', weight: 0.7 },
      ],
    } as any);
    // 3) hop 1 coactivations — empty.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    // 4) hop 2 entity_relations — neighbour-1 → far-1.
    mockQuery.mockResolvedValueOnce({
      rows: [
        { source_entity_id: 'neighbour-1', target_entity_id: 'far-1', weight: 0.5 },
      ],
    } as any);
    // 5) hop 2 coactivations — empty.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const result = await loadHebbianSubgraphForPPR('operations', ['seed'], {
      maxHops: 2,
    });
    expect(result).not.toBeNull();
    expect(result!.graph.nodes).toEqual(
      expect.arrayContaining(['seed', 'neighbour-1', 'far-1']),
    );
    expect(result!.stats.hopsCovered).toBe(2);
    expect(result!.stats.relationEdges).toBe(2);
  });

  it('drops invalid weights gracefully (NaN / negative)', async () => {
    // 1) filterValidSeeds.
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'seed' }] } as any);
    // 2) entity_relations — mixture of weights including NaN-string.
    mockQuery.mockResolvedValueOnce({
      rows: [
        { source_entity_id: 'seed', target_entity_id: 'a', weight: 0.5 },
        { source_entity_id: 'seed', target_entity_id: 'b', weight: 'not-a-number' },
      ],
    } as any);
    // 3) entity_coactivations — empty.
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const result = await loadHebbianSubgraphForPPR('operations', ['seed'], {
      maxHops: 1,
    });
    expect(result).not.toBeNull();
    // The NaN-weight edge should fall back to default 1.0 — both edges retained.
    expect(result!.stats.relationEdges).toBe(2);
    for (const [, , w] of result!.graph.edges) {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThan(0);
    }
  });

  it('handles entity_relations DB error and still returns coactivation graph', async () => {
    // 1) filterValidSeeds — OK.
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'seed' }] } as any);
    // 2) entity_relations — throws.
    mockQuery.mockRejectedValueOnce(new Error('relations table missing'));
    // 3) entity_coactivations — one row.
    mockQuery.mockResolvedValueOnce({
      rows: [{ entity_a_id: 'seed', entity_b_id: 'b', weight: 2 }],
    } as any);

    const result = await loadHebbianSubgraphForPPR('operations', ['seed'], {
      maxHops: 1,
    });
    expect(result).not.toBeNull();
    expect(result!.stats.relationEdges).toBe(0);
    expect(result!.stats.coactivationEdges).toBe(1);
    expect(result!.graph.nodes).toContain('b');
  });
});
