/**
 * Phase 100 B2: Persistent Shared Memory Tests
 */

// Mock database
const mockPoolQuery = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
  queryContext: jest.fn(),
}));

// Mock cache (Redis)
jest.mock('../../../utils/cache', () => ({
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  },
  getRedisClient: jest.fn().mockReturnValue(null),
}));

import { sharedMemory } from '../../../services/memory/shared-memory';

describe('Persistent Shared Memory (DB Layer L3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolQuery.mockReset();
    // Clear any existing teams
    sharedMemory.clear('test-team');
  });

  describe('write with DB persistence', () => {
    it('should fire-and-forget DB INSERT on write', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      sharedMemory.initialize('db-write-team');
      sharedMemory.write('db-write-team', 'researcher', 'finding', 'Test content');

      // Give fire-and-forget time to execute
      await new Promise(r => setTimeout(r, 50));

      expect(mockPoolQuery).toHaveBeenCalled();
      const call = mockPoolQuery.mock.calls[0];
      expect(call[0]).toContain('INSERT INTO public.agent_shared_memory');
      // execution_id = teamId
      expect(call[1]).toContain('db-write-team');
      // agent_role
      expect(call[1]).toContain('researcher');
      // value is JSONB containing type, content, metadata
      const valueParam = call[1].find((p: unknown) => typeof p === 'string' && p.includes('"type"'));
      expect(valueParam).toBeDefined();
      expect(valueParam).toContain('"content":"Test content"');
      expect(valueParam).toContain('"type":"finding"');

      sharedMemory.clear('db-write-team');
    });

    it('should not block write if DB fails', () => {
      mockPoolQuery.mockRejectedValue(new Error('DB connection failed'));

      sharedMemory.initialize('db-fail-team');
      // Should not throw
      const entry = sharedMemory.write('db-fail-team', 'writer', 'artifact', 'Content');
      expect(entry.id).toBeDefined();
      expect(entry.content).toBe('Content');

      sharedMemory.clear('db-fail-team');
    });
  });

  describe('restoreFromDB', () => {
    it('should load entries from DB when L1 and L2 are empty', async () => {
      const mockDbEntries = [
        {
          id: 'entry-1',
          execution_id: 'restore-team',
          key: 'entry-1',
          value: { type: 'finding', content: 'DB finding', metadata: {} },
          agent_role: 'researcher',
          created_at: new Date().toISOString(),
        },
        {
          id: 'entry-2',
          execution_id: 'restore-team',
          key: 'entry-2',
          value: { type: 'artifact', content: 'DB artifact' },
          agent_role: 'writer',
          created_at: new Date().toISOString(),
        },
      ];

      mockPoolQuery.mockResolvedValue({ rows: mockDbEntries, rowCount: 2 });

      await sharedMemory.restoreFromDB('restore-team');

      const entries = sharedMemory.read('restore-team');
      expect(entries).toHaveLength(2);
      expect(entries.map(e => e.content)).toContain('DB finding');
      expect(entries.map(e => e.content)).toContain('DB artifact');

      sharedMemory.clear('restore-team');
    });

    it('should not overwrite existing L1 data on restore', async () => {
      sharedMemory.initialize('existing-team');
      sharedMemory.write('existing-team', 'researcher', 'finding', 'Existing');

      mockPoolQuery.mockResolvedValue({
        rows: [{
          id: 'db-1',
          execution_id: 'existing-team',
          key: 'db-1',
          value: { type: 'artifact', content: 'From DB' },
          agent_role: 'writer',
          created_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });

      await sharedMemory.restoreFromDB('existing-team');

      // Should still have original entry, not overwritten
      const entries = sharedMemory.read('existing-team');
      expect(entries.some(e => e.content === 'Existing')).toBe(true);

      sharedMemory.clear('existing-team');
    });

    it('should handle DB errors gracefully during restore', async () => {
      mockPoolQuery.mockRejectedValue(new Error('Connection refused'));

      // Should not throw
      await expect(sharedMemory.restoreFromDB('fail-team')).resolves.not.toThrow();
    });
  });

  describe('read with L3 fallback', () => {
    it('should check DB when L1 and L2 have no data', async () => {
      mockPoolQuery.mockResolvedValue({
        rows: [{
          id: 'db-entry',
          execution_id: 'l3-read-team',
          key: 'db-entry',
          value: { type: 'finding', content: 'From L3' },
          agent_role: 'coder',
          created_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });

      // Read from a team that's not initialized (no L1/L2)
      // After restoreFromDB, should have data
      await sharedMemory.restoreFromDB('l3-read-team');

      const entries = sharedMemory.read('l3-read-team');
      expect(entries).toHaveLength(1);
      expect(entries[0].content).toBe('From L3');

      sharedMemory.clear('l3-read-team');
    });
  });

  describe('initialize precedence', () => {
    it('should prefer DB data on cold start over empty Redis', async () => {
      const { cache } = require('../../../utils/cache');
      cache.get.mockResolvedValue(null); // Redis empty

      mockPoolQuery.mockResolvedValue({
        rows: [{
          id: 'cold-1',
          execution_id: 'cold-team',
          key: 'cold-1',
          value: { type: 'plan', content: 'DB plan', metadata: {} },
          agent_role: 'researcher',
          created_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });

      // restoreFromDB should populate from DB
      await sharedMemory.restoreFromDB('cold-team');

      const entries = sharedMemory.read('cold-team');
      expect(entries.some(e => e.content === 'DB plan')).toBe(true);

      sharedMemory.clear('cold-team');
    });
  });
});
