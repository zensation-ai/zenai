jest.mock('../../../utils/database-context', () => ({
  queryPublic: jest.fn(),
}));

import { queryPublic } from '../../../utils/database-context';
import * as auditService from '../../../services/tenant-audit-service';

const mockQueryPublic = queryPublic as jest.MockedFunction<typeof queryPublic>;

describe('tenant-audit-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryPublic.mockReset();
  });

  describe('appendAuditEntry', () => {
    it('creates hash-chained entry', async () => {
      // Single CTE query: fetch prev_hash + insert atomically
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{
          id: 1, workspace_id: 'ws-1', action: 'memory_store',
          entry_hash: 'new_hash_xyz', prev_hash: 'prev_hash_abc',
        }],
      } as any);

      const result = await auditService.appendAuditEntry({
        workspaceId: 'ws-1',
        userId: 'user-1',
        action: 'memory_store',
        entityType: 'memory',
        entityId: 'mem-1',
        raci: { responsible: 'ai:claude-sonnet', accountable: 'user-1' },
      });

      expect(result.prev_hash).toBe('prev_hash_abc');
      expect(result.entry_hash).toBeDefined();
    });

    it('handles first entry (no prev_hash)', async () => {
      // Single CTE query returns null prev_hash for first entry
      mockQueryPublic.mockResolvedValueOnce({
        rows: [{ id: 1, prev_hash: null, entry_hash: 'first_hash' }],
      } as any);

      const result = await auditService.appendAuditEntry({
        workspaceId: 'ws-1', userId: 'user-1', action: 'org_created',
        raci: { responsible: 'user-1', accountable: 'user-1' },
      });

      expect(result.prev_hash).toBeNull();
    });
  });

  describe('computeEntryHash', () => {
    it('produces deterministic SHA-256', () => {
      const hash1 = auditService.computeEntryHash('prev', 'action', 'type', 'id', '{}', '2026-04-02');
      const hash2 = auditService.computeEntryHash('prev', 'action', 'type', 'id', '{}', '2026-04-02');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  describe('getAuditLog', () => {
    it('returns paginated entries', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { id: 2, action: 'memory_store' },
          { id: 1, action: 'org_created' },
        ],
      } as any);

      const result = await auditService.getAuditLog('ws-1', { limit: 20, offset: 0 });
      expect(result).toHaveLength(2);
    });
  });

  describe('verifyChainIntegrity', () => {
    it('returns true for valid chain', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { id: 1, prev_hash: null, entry_hash: 'h1' },
          { id: 2, prev_hash: 'h1', entry_hash: 'h2' },
        ],
      } as any);

      expect(await auditService.verifyChainIntegrity('ws-1')).toBe(true);
    });

    it('returns false for broken chain', async () => {
      mockQueryPublic.mockResolvedValueOnce({
        rows: [
          { id: 1, prev_hash: null, entry_hash: 'h1' },
          { id: 2, prev_hash: 'WRONG', entry_hash: 'h2' },
        ],
      } as any);

      expect(await auditService.verifyChainIntegrity('ws-1')).toBe(false);
    });
  });
});
