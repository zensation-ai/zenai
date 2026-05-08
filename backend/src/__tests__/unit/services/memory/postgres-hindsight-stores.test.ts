/**
 * Postgres-backed Hindsight stores (Phase H4 prod-binding C-D) tests.
 *
 * Mocks queryContext and verifies:
 *   - Each store method emits the expected SQL shape + params
 *   - Result rows are mapped correctly to domain types
 *   - Error paths log + return defensive defaults (null / [] / throw)
 *   - Factory functions accept any AIContext value
 */

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: () => true,
}));

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { queryContext } from '../../../../utils/database-context';
import {
  createPostgresEntitySummaryStore,
  createPostgresBeliefStore,
  createPostgresHindsightStores,
} from '../../../../services/memory/hindsight-networks/postgres-stores';
import type { EvolvingBelief } from '../../../../services/memory/hindsight-networks/evolving-beliefs';

const mockQuery = queryContext as jest.MockedFunction<typeof queryContext>;

describe('PostgresEntitySummaryStore', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('get', () => {
    it('returns null when no row matches', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      const store = createPostgresEntitySummaryStore('operations');
      const out = await store.get('caroline');
      expect(out).toBeNull();
      expect(mockQuery).toHaveBeenCalledWith(
        'operations',
        expect.stringContaining('FROM entity_summaries'),
        ['caroline'],
      );
    });

    it('maps row to EntitySummary correctly', async () => {
      const lastUpdated = new Date('2024-06-01T12:00:00Z');
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            entity_id: 'caroline',
            summary: 'lives in Madrid',
            fact_count: 7,
            last_updated: lastUpdated.toISOString(),
            confidence: 0.85,
          },
        ],
      } as any);
      const store = createPostgresEntitySummaryStore('people');
      const out = await store.get('caroline');
      expect(out).toEqual({
        entityId: 'caroline',
        summary: 'lives in Madrid',
        factCount: 7,
        lastUpdated,
        confidence: 0.85,
      });
    });

    it('returns null on query error (logged, not thrown)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection refused'));
      const store = createPostgresEntitySummaryStore('operations');
      const out = await store.get('caroline');
      expect(out).toBeNull();
    });

    it('handles missing fields with defensive defaults', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ entity_id: 'x' }], // most fields missing
      } as any);
      const store = createPostgresEntitySummaryStore('operations');
      const out = await store.get('x');
      expect(out?.entityId).toBe('x');
      expect(out?.factCount).toBe(0);
      expect(out?.confidence).toBe(0);
      expect(out?.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('upsert', () => {
    it('emits INSERT ... ON CONFLICT with mapped params', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      const store = createPostgresEntitySummaryStore('operations');
      const updated = new Date('2024-06-01T12:00:00Z');
      await store.upsert({
        entityId: 'caroline',
        summary: 'lives in Madrid',
        factCount: 7,
        lastUpdated: updated,
        confidence: 0.85,
      });
      const [ctx, sql, params] = mockQuery.mock.calls[0];
      expect(ctx).toBe('operations');
      expect(sql).toContain('INSERT INTO entity_summaries');
      expect(sql).toContain('ON CONFLICT (entity_id) DO UPDATE');
      expect(params).toEqual([
        'caroline',
        'lives in Madrid',
        7,
        updated.toISOString(),
        0.85,
      ]);
    });

    it('rethrows on query error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('disk full'));
      const store = createPostgresEntitySummaryStore('operations');
      await expect(
        store.upsert({
          entityId: 'x',
          summary: 'y',
          factCount: 0,
          lastUpdated: new Date(),
          confidence: 0,
        }),
      ).rejects.toThrow(/disk full/);
    });
  });

  describe('search', () => {
    it('empty query returns most-recently-updated', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            entity_id: 'a',
            summary: 'A',
            fact_count: 1,
            last_updated: '2024-06-01',
            confidence: 0.5,
          },
        ],
      } as any);
      const store = createPostgresEntitySummaryStore('operations');
      const out = await store.search('', 5);
      expect(out.length).toBe(1);
      expect(mockQuery.mock.calls[0][1]).toContain('ORDER BY last_updated DESC');
      expect(mockQuery.mock.calls[0][2]).toEqual([5]);
    });

    it('non-empty query uses BM25 (ts_rank)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ entity_id: 'caroline', summary: 'lives in Madrid', fact_count: 1, last_updated: '2024-01-01', confidence: 0.5 }],
      } as any);
      const store = createPostgresEntitySummaryStore('operations');
      await store.search('Caroline Madrid', 5);
      const [, sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('ts_rank');
      expect(sql).toContain('plainto_tsquery');
      expect(params).toEqual([
        'Caroline Madrid', // sanitized (no punct in this case)
        '%caroline madrid%', // ILIKE pattern
        5,
      ]);
    });

    it('falls back to ILIKE when BM25 fails', async () => {
      mockQuery
        .mockRejectedValueOnce(new Error('ts_query syntax error'))
        .mockResolvedValueOnce({
          rows: [{ entity_id: 'caroline', summary: 'X', fact_count: 0, last_updated: '2024-01-01', confidence: 0.5 }],
        } as any);
      const store = createPostgresEntitySummaryStore('operations');
      const out = await store.search('caroline', 5);
      expect(out.length).toBe(1);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      const fallbackSql = mockQuery.mock.calls[1][1];
      expect(fallbackSql).toContain('LIKE');
      expect(fallbackSql).not.toContain('ts_rank');
    });

    it('returns [] when both BM25 and fallback fail', async () => {
      mockQuery
        .mockRejectedValueOnce(new Error('boom1'))
        .mockRejectedValueOnce(new Error('boom2'));
      const store = createPostgresEntitySummaryStore('operations');
      const out = await store.search('q', 5);
      expect(out).toEqual([]);
    });
  });
});

describe('PostgresBeliefStore', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('getById', () => {
    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      const store = createPostgresBeliefStore('operations');
      const out = await store.getById('belief-1');
      expect(out).toBeNull();
    });

    it('maps row to EvolvingBelief correctly', async () => {
      const revised = new Date('2024-06-01');
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            belief_id: 'belief-1',
            entity_id: 'caroline',
            claim: 'lives in Madrid',
            confidence: 0.7,
            evidence_for: 5,
            evidence_against: 1,
            last_revised: revised.toISOString(),
            superseded_at: null,
            superseded_by: null,
          },
        ],
      } as any);
      const store = createPostgresBeliefStore('people');
      const out = await store.getById('belief-1');
      expect(out).toEqual({
        beliefId: 'belief-1',
        entityId: 'caroline',
        claim: 'lives in Madrid',
        confidence: 0.7,
        evidenceFor: 5,
        evidenceAgainst: 1,
        lastRevised: revised,
        supersededAt: null,
        supersededBy: null,
      });
    });

    it('parses superseded fields when present', async () => {
      const revised = new Date('2024-06-01');
      const supersededAt = new Date('2024-06-15');
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            belief_id: 'old',
            entity_id: 'x',
            claim: 'y',
            confidence: 0.3,
            evidence_for: 1,
            evidence_against: 4,
            last_revised: revised.toISOString(),
            superseded_at: supersededAt.toISOString(),
            superseded_by: 'new',
          },
        ],
      } as any);
      const store = createPostgresBeliefStore('operations');
      const out = await store.getById('old');
      expect(out?.supersededAt).toEqual(supersededAt);
      expect(out?.supersededBy).toBe('new');
    });

    it('returns null on query error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('boom'));
      const store = createPostgresBeliefStore('operations');
      const out = await store.getById('x');
      expect(out).toBeNull();
    });
  });

  describe('listActiveByEntity', () => {
    it('emits SELECT ... WHERE superseded_at IS NULL ORDER BY confidence DESC', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            belief_id: 'b',
            entity_id: 'caroline',
            claim: 'X',
            confidence: 0.8,
            evidence_for: 3,
            evidence_against: 0,
            last_revised: '2024-06-01',
            superseded_at: null,
            superseded_by: null,
          },
        ],
      } as any);
      const store = createPostgresBeliefStore('people');
      const out = await store.listActiveByEntity('caroline');
      expect(out.length).toBe(1);
      const [ctx, sql, params] = mockQuery.mock.calls[0];
      expect(ctx).toBe('people');
      expect(sql).toContain('WHERE entity_id = $1 AND superseded_at IS NULL');
      expect(sql).toContain('ORDER BY confidence DESC');
      expect(params).toEqual(['caroline']);
    });

    it('returns [] on query error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('boom'));
      const store = createPostgresBeliefStore('operations');
      const out = await store.listActiveByEntity('x');
      expect(out).toEqual([]);
    });
  });

  describe('insert', () => {
    it('emits INSERT ... RETURNING belief_id with mapped params', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ belief_id: 'new-id-123' }],
      } as any);
      const store = createPostgresBeliefStore('operations');
      const revised = new Date('2024-06-01');
      const id = await store.insert({
        entityId: 'caroline',
        claim: 'lives in Madrid',
        confidence: 0.7,
        evidenceFor: 1,
        evidenceAgainst: 0,
        lastRevised: revised,
        supersededAt: null,
        supersededBy: null,
      });
      expect(id).toBe('new-id-123');
      const [, sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO evolving_beliefs');
      expect(sql).toContain('RETURNING belief_id');
      expect(params).toEqual([
        'caroline',
        'lives in Madrid',
        0.7,
        1,
        0,
        revised.toISOString(),
        null,
        null,
      ]);
    });

    it('throws when no belief_id is returned', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      const store = createPostgresBeliefStore('operations');
      const belief: Omit<EvolvingBelief, 'beliefId'> = {
        entityId: 'x',
        claim: 'y',
        confidence: 0.5,
        evidenceFor: 0,
        evidenceAgainst: 0,
        lastRevised: new Date(),
        supersededAt: null,
        supersededBy: null,
      };
      await expect(store.insert(belief)).rejects.toThrow(/no belief_id/);
    });

    it('rethrows on query error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('FK violation'));
      const store = createPostgresBeliefStore('operations');
      await expect(
        store.insert({
          entityId: 'x',
          claim: 'y',
          confidence: 0,
          evidenceFor: 0,
          evidenceAgainst: 0,
          lastRevised: new Date(),
          supersededAt: null,
          supersededBy: null,
        }),
      ).rejects.toThrow(/FK violation/);
    });
  });

  describe('update', () => {
    it('emits UPDATE with all mutable fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      const store = createPostgresBeliefStore('operations');
      const revised = new Date('2024-06-01');
      const supersededAt = new Date('2024-06-15');
      await store.update({
        beliefId: 'belief-1',
        entityId: 'caroline',
        claim: 'X',
        confidence: 0.3,
        evidenceFor: 1,
        evidenceAgainst: 4,
        lastRevised: revised,
        supersededAt,
        supersededBy: 'belief-2',
      });
      const [, sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE evolving_beliefs');
      expect(sql).toContain('WHERE belief_id = $1');
      expect(params[0]).toBe('belief-1');
      expect(params[7]).toBe(supersededAt.toISOString());
      expect(params[8]).toBe('belief-2');
    });

    it('rethrows on query error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('row locked'));
      const store = createPostgresBeliefStore('operations');
      await expect(
        store.update({
          beliefId: 'x',
          entityId: 'y',
          claim: 'z',
          confidence: 0,
          evidenceFor: 0,
          evidenceAgainst: 0,
          lastRevised: new Date(),
          supersededAt: null,
          supersededBy: null,
        }),
      ).rejects.toThrow(/row locked/);
    });
  });
});

describe('createPostgresHindsightStores convenience factory', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns both stores wired to the same context', () => {
    const stores = createPostgresHindsightStores('finance');
    expect(stores.entitySummaryStore).toBeDefined();
    expect(stores.beliefStore).toBeDefined();
    expect(typeof stores.entitySummaryStore.get).toBe('function');
    expect(typeof stores.beliefStore.getById).toBe('function');
  });

  it('different contexts produce different store instances', () => {
    const a = createPostgresHindsightStores('operations');
    const b = createPostgresHindsightStores('finance');
    expect(a.entitySummaryStore).not.toBe(b.entitySummaryStore);
    expect(a.beliefStore).not.toBe(b.beliefStore);
  });

  it('store calls route to the correct schema (queryContext arg verification)', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as any);
    const opsStores = createPostgresHindsightStores('operations');
    const finStores = createPostgresHindsightStores('finance');
    await opsStores.entitySummaryStore.get('x');
    await finStores.entitySummaryStore.get('y');
    expect(mockQuery).toHaveBeenNthCalledWith(1, 'operations', expect.any(String), ['x']);
    expect(mockQuery).toHaveBeenNthCalledWith(2, 'finance', expect.any(String), ['y']);
  });
});
