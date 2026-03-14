/**
 * Phase 59: Procedural Memory Service Tests
 */

import { queryContext } from '../../../utils/database-context';
import { ProceduralMemory } from '../../../services/memory/procedural-memory';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['personal', 'work', 'learning', 'creative'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// Mock Data
// ===========================================

const mockProcedure = {
  id: 'proc-001',
  trigger_description: 'User asks to send an email',
  steps: ['Parse recipient', 'Draft email', 'Send via Resend'],
  tools_used: ['email_compose', 'email_send'],
  outcome: 'success' as const,
  duration_ms: 3500,
  usage_count: 5,
  success_rate: 0.9,
  feedback_score: 4.5,
  metadata: { domain: 'email' },
  created_at: new Date('2026-03-14'),
  updated_at: new Date('2026-03-14'),
};

// ===========================================
// Tests
// ===========================================

describe('ProceduralMemory', () => {
  let proceduralMemory: ProceduralMemory;

  beforeEach(() => {
    jest.clearAllMocks();
    proceduralMemory = new ProceduralMemory();
  });

  describe('recordProcedure', () => {
    it('should store a procedure with embedding', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockProcedure], rowCount: 1 } as any);

      const result = await proceduralMemory.recordProcedure('personal', {
        triggerDescription: 'User asks to send an email',
        steps: ['Parse recipient', 'Draft email', 'Send via Resend'],
        toolsUsed: ['email_compose', 'email_send'],
        outcome: 'success',
        durationMs: 3500,
        metadata: { domain: 'email' },
      });

      expect(result.id).toBe('proc-001');
      expect(result.triggerDescription).toBe('User asks to send an email');
      expect(result.steps).toEqual(['Parse recipient', 'Draft email', 'Send via Resend']);
      expect(result.outcome).toBe('success');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT INTO procedural_memories'),
        expect.any(Array)
      );
    });

    it('should handle missing optional fields', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ ...mockProcedure, duration_ms: null, metadata: {} }],
        rowCount: 1,
      } as any);

      const result = await proceduralMemory.recordProcedure('work', {
        triggerDescription: 'Simple task',
        steps: ['Do it'],
        toolsUsed: [],
        outcome: 'partial',
      });

      expect(result.outcome).toBe('success'); // from mock
    });

    it('should store with null embedding when generation fails', async () => {
      const { generateEmbedding } = require('../../../services/ai');
      generateEmbedding.mockRejectedValueOnce(new Error('Embedding API down'));
      mockQueryContext.mockResolvedValueOnce({ rows: [mockProcedure], rowCount: 1 } as any);

      await proceduralMemory.recordProcedure('personal', {
        triggerDescription: 'Test',
        steps: ['step1'],
        toolsUsed: [],
        outcome: 'success',
      });

      // Should still insert with null embedding
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('INSERT'),
        expect.arrayContaining([null]) // null embedding
      );
    });
  });

  describe('recallProcedure', () => {
    it('should return ranked results by similarity', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [
            { ...mockProcedure, similarity: 0.95 },
            { ...mockProcedure, id: 'proc-002', similarity: 0.85 },
          ],
          rowCount: 2,
        } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // usage update

      const results = await proceduralMemory.recallProcedure('personal', 'send email to user');

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('proc-001');
    });

    it('should update usage count for recalled procedures', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [mockProcedure], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await proceduralMemory.recallProcedure('personal', 'test query');

      expect(mockQueryContext).toHaveBeenCalledTimes(2);
      expect(mockQueryContext).toHaveBeenLastCalledWith(
        'personal',
        expect.stringContaining('UPDATE procedural_memories SET usage_count'),
        expect.any(Array)
      );
    });

    it('should return empty array when embedding fails', async () => {
      const { generateEmbedding } = require('../../../services/ai');
      generateEmbedding.mockRejectedValueOnce(new Error('fail'));

      const results = await proceduralMemory.recallProcedure('personal', 'test');

      expect(results).toEqual([]);
    });

    it('should respect the limit parameter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await proceduralMemory.recallProcedure('personal', 'test', 3);

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        expect.arrayContaining([3])
      );
    });
  });

  describe('optimizeProcedure', () => {
    it('should update success_rate on positive feedback', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ usage_count: 10, success_rate: 0.8 }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [mockProcedure], rowCount: 1 } as any);

      const result = await proceduralMemory.optimizeProcedure('proc-001', 'personal', {
        success: true,
        score: 5,
      });

      expect(result).not.toBeNull();
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });

    it('should decrease success_rate on negative feedback', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ usage_count: 10, success_rate: 0.8 }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ ...mockProcedure, success_rate: 0.7 }], rowCount: 1 } as any);

      const result = await proceduralMemory.optimizeProcedure('proc-001', 'personal', {
        success: false,
      });

      expect(result).not.toBeNull();
    });

    it('should return null for non-existent procedure', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await proceduralMemory.optimizeProcedure('non-existent', 'personal', {
        success: true,
      });

      expect(result).toBeNull();
    });
  });

  describe('getTopProcedures', () => {
    it('should return ordered by success_rate DESC', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { ...mockProcedure, success_rate: 1.0 },
          { ...mockProcedure, id: 'proc-002', success_rate: 0.8 },
        ],
        rowCount: 2,
      } as any);

      const results = await proceduralMemory.getTopProcedures('personal', 5);

      expect(results).toHaveLength(2);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('ORDER BY success_rate DESC'),
        [5]
      );
    });

    it('should exclude failures', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await proceduralMemory.getTopProcedures('personal');

      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("outcome != 'failure'"),
        [10]
      );
    });
  });

  describe('deleteProcedure', () => {
    it('should return true when procedure is deleted', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const result = await proceduralMemory.deleteProcedure('proc-001', 'personal');

      expect(result).toBe(true);
    });

    it('should return false when procedure not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await proceduralMemory.deleteProcedure('non-existent', 'personal');

      expect(result).toBe(false);
    });
  });

  describe('getProcedure', () => {
    it('should return procedure by ID', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockProcedure], rowCount: 1 } as any);

      const result = await proceduralMemory.getProcedure('proc-001', 'personal');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('proc-001');
    });

    it('should return null when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await proceduralMemory.getProcedure('non-existent', 'personal');

      expect(result).toBeNull();
    });
  });

  describe('listProcedures', () => {
    it('should list with default options', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [mockProcedure], rowCount: 1 } as any);

      const results = await proceduralMemory.listProcedures('personal', {});

      expect(results).toHaveLength(1);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining('ORDER BY created_at DESC'),
        [20]
      );
    });

    it('should filter by outcome', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await proceduralMemory.listProcedures('work', { outcome: 'success', limit: 5 });

      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('WHERE outcome = $1'),
        ['success', 5]
      );
    });
  });
});
