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
      expect(call[1]).toContain('db-write-team');
      expect(call[1]).toContain('researcher');
      expect(call[1]).toContain('finding');
      expect(call[1]).toContain('Test content');

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
          team_id: 'restore-team',
          agent_role: 'researcher',
          entry_type: 'finding',
          content: 'DB finding',
          metadata: '{}',
          created_at: new Date().toISOString(),
        },
        {
          id: 'entry-2',
          team_id: 'restore-team',
          agent_role: 'writer',
          entry_type: 'artifact',
          content: 'DB artifact',
          metadata: null,
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
          team_id: 'existing-team',
          agent_role: 'writer',
          entry_type: 'artifact',
          content: 'From DB',
          metadata: null,
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
          team_id: 'l3-read-team',
          agent_role: 'coder',
          entry_type: 'finding',
          content: 'From L3',
          metadata: null,
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
          team_id: 'cold-team',
          agent_role: 'researcher',
          entry_type: 'plan',
          content: 'DB plan',
          metadata: '{}',
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
