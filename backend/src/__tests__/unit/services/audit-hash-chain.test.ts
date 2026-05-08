/**
 * Sprint 1.2 — Hash-Chain Audit-Log Tests
 */

jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));

import { queryPublic } from '../../../utils/database-context';
import {
  verifyAuditChain,
  canonicalJson,
  debugRecomputeHash,
  computeEntryHash,
} from '../../../services/security/audit-hash-chain';

const mockQueryPublic = queryPublic as jest.MockedFunction<typeof queryPublic>;

describe('audit-hash-chain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  describe('canonicalJson', () => {
    it('produces stable output regardless of key order', () => {
      const a = canonicalJson({ b: 2, a: 1, c: { z: 3, y: 4 } });
      const b = canonicalJson({ a: 1, c: { y: 4, z: 3 }, b: 2 });
      expect(a).toBe(b);
    });

    it('preserves array order', () => {
      expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    });

    it('handles null and primitives', () => {
      expect(canonicalJson(null)).toBe('null');
      expect(canonicalJson(42)).toBe('42');
      expect(canonicalJson('hello')).toBe('"hello"');
    });
  });

  describe('verifyAuditChain', () => {
    const raci = { responsible: 'user-1', accountable: 'user-1' };
    const raciJson = JSON.stringify(raci);

    function makeRow(params: {
      id: number;
      action: string;
      prevHash: string | null;
      createdAt: string;
      overrideHash?: string;
    }) {
      const hash = params.overrideHash
        ?? computeEntryHash(params.prevHash, params.action, null, null, raciJson, params.createdAt);
      return {
        id: params.id,
        action: params.action,
        entity_type: null,
        entity_id: null,
        raci,
        prev_hash: params.prevHash,
        entry_hash: hash,
        created_at: params.createdAt,
      };
    }

    it('returns valid=true on well-formed chain', async () => {
      const r1 = makeRow({ id: 1, action: 'org_created', prevHash: null, createdAt: '2026-04-16T10:00:00Z' });
      const r2 = makeRow({ id: 2, action: 'memory_store', prevHash: r1.entry_hash, createdAt: '2026-04-16T10:01:00Z' });
      const r3 = makeRow({ id: 3, action: 'memory_update', prevHash: r2.entry_hash, createdAt: '2026-04-16T10:02:00Z' });

      mockQueryPublic.mockResolvedValueOnce({ rows: [r1, r2, r3] } as never);

      const result = await verifyAuditChain('ws-1');

      expect(result.valid).toBe(true);
      expect(result.totalChecked).toBe(3);
      expect(result.brokenAt).toBeNull();
    });

    it('detects prev_hash mismatch (tamper)', async () => {
      const r1 = makeRow({ id: 1, action: 'org_created', prevHash: null, createdAt: '2026-04-16T10:00:00Z' });
      const r2 = makeRow({ id: 2, action: 'memory_store', prevHash: 'wrong_prev_hash', createdAt: '2026-04-16T10:01:00Z' });

      mockQueryPublic.mockResolvedValueOnce({ rows: [r1, r2] } as never);

      const result = await verifyAuditChain('ws-1');

      expect(result.valid).toBe(false);
      expect(result.brokenAt?.index).toBe(1);
      expect(result.brokenAt?.id).toBe(2);
    });

    it('detects entry_hash corruption (tampered row)', async () => {
      const r1 = makeRow({ id: 1, action: 'org_created', prevHash: null, createdAt: '2026-04-16T10:00:00Z' });
      // r2 prev_hash matches r1.entry_hash but entry_hash itself is wrong
      const r2 = makeRow({
        id: 2,
        action: 'memory_store',
        prevHash: r1.entry_hash,
        createdAt: '2026-04-16T10:01:00Z',
        overrideHash: 'fabricated_hash_that_does_not_match',
      });

      mockQueryPublic.mockResolvedValueOnce({ rows: [r1, r2] } as never);

      const result = await verifyAuditChain('ws-1');

      expect(result.valid).toBe(false);
      expect(result.brokenAt?.id).toBe(2);
      expect(result.brokenAt?.actualEntryHash).toBe('fabricated_hash_that_does_not_match');
    });

    it('returns valid=true on empty chain', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as never);
      const result = await verifyAuditChain('ws-empty');
      expect(result.valid).toBe(true);
      expect(result.totalChecked).toBe(0);
    });

    it('passes fromTs to SQL (time-range query)', async () => {
      mockQueryPublic.mockResolvedValueOnce({ rows: [] } as never);
      const fromTs = new Date('2026-04-16T12:00:00Z');
      await verifyAuditChain('ws-1', { fromTs });
      expect(mockQueryPublic).toHaveBeenCalled();
      const [sql, params] = mockQueryPublic.mock.calls[0];
      expect(sql).toContain('created_at >= $2');
      expect((params as unknown[])[1]).toBe(fromTs.toISOString());
    });
  });

  describe('debugRecomputeHash', () => {
    it('matches stored hash when inputs are identical', () => {
      const params = {
        prevHash: null,
        action: 'test_action',
        entityType: null,
        entityId: null,
        raci: { responsible: 'user-1', accountable: 'user-1' },
        createdAt: '2026-04-16T10:00:00Z',
      };
      const h1 = debugRecomputeHash(params);
      const h2 = debugRecomputeHash(params);
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(64); // sha256 hex
    });
  });
});
