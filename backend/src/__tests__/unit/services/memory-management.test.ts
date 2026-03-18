/**
 * Phase 99: Memory Management Tools Tests
 */

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

import {
  handleMemoryPromote,
  handleMemoryDemote,
  handleMemoryForget,
} from '../../../services/tool-handlers/memory-management';

const execContext = {
  aiContext: 'personal' as const,
  sessionId: 'test-session',
};

describe('Memory Management Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('memory_promote', () => {
    it('promotes a fact to high importance', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'fact-1', content: 'User prefers dark mode' }],
      });

      const result = await handleMemoryPromote(
        { fact_id: 'fact-1', reason: 'Frequently referenced preference' },
        execContext
      );

      expect(result).toContain('hochgestuft');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('importance'),
        ['fact-1']
      );
    });

    it('returns error for missing fact', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await handleMemoryPromote(
        { fact_id: 'nonexistent', reason: 'test' },
        execContext
      );

      expect(result).toContain('nicht gefunden');
    });

    it('returns error for missing parameters', async () => {
      const result = await handleMemoryPromote({ fact_id: '' }, execContext);
      expect(result).toContain('Fehler');
    });
  });

  describe('memory_demote', () => {
    it('reduces fact confidence by 0.3', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'fact-1', content: 'Outdated info', confidence: 0.5 }],
      });

      const result = await handleMemoryDemote(
        { fact_id: 'fact-1', reason: 'Information is outdated' },
        execContext
      );

      expect(result).toContain('herabgestuft');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('confidence - 0.3'),
        ['fact-1']
      );
    });

    it('returns error for missing fact', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await handleMemoryDemote(
        { fact_id: 'nonexistent', reason: 'test' },
        execContext
      );

      expect(result).toContain('nicht gefunden');
    });
  });

  describe('memory_forget', () => {
    it('soft-deletes a fact with reason', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'fact-1', content: 'Incorrect fact' }],
      });

      const result = await handleMemoryForget(
        { fact_id: 'fact-1', reason: 'User corrected this information' },
        execContext
      );

      expect(result).toContain('vergessen');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('forgotten = true'),
        ['fact-1', 'User corrected this information']
      );
    });

    it('returns error for missing fact', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      const result = await handleMemoryForget(
        { fact_id: 'nonexistent', reason: 'test' },
        execContext
      );

      expect(result).toContain('nicht gefunden');
    });

    it('returns error for missing parameters', async () => {
      const result = await handleMemoryForget({ fact_id: 'x' }, execContext);
      expect(result).toContain('Fehler');
    });
  });
});
