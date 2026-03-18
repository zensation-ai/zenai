/**
 * Tests for Memory Self-Editing Tools (Phase 100)
 *
 * Tests memory_replace, memory_abstract, memory_search_and_link
 */

import {
  handleMemoryReplace,
  handleMemoryAbstract,
  handleMemorySearchAndLink,
} from '../../../services/tool-handlers/memory-self-editing';
import type { ToolExecutionContext } from '../../../services/claude/tool-use';

// Mock dependencies
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  AIContext: {},
}));

jest.mock('../../../services/ai', () => ({
  generateEmbedding: jest.fn().mockResolvedValue(new Array(768).fill(0.1)),
}));

jest.mock('../../../services/claude/core', () => ({
  generateClaudeResponse: jest.fn().mockResolvedValue('[{"content":"Abstracted fact","fact_type":"knowledge","confidence":0.9}]'),
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
}));

jest.mock('../../../services/claude/client', () => ({
  MODEL_CONFIG: {
    default: 'claude-sonnet-4-20250514',
    haiku: 'claude-haiku-4-5-20251001',
  },
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  getClaudeClient: jest.fn(),
  executeWithProtection: jest.fn(),
}));

jest.mock('../../../services/memory', () => ({
  longTermMemory: {
    getFacts: jest.fn().mockResolvedValue([]),
    addFact: jest.fn().mockResolvedValue(undefined),
    removeFact: jest.fn(),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

const { queryContext } = require('../../../utils/database-context');
const { generateEmbedding } = require('../../../services/ai');
const { generateClaudeResponse } = require('../../../services/claude/core');

const mockExecContext: ToolExecutionContext = {
  aiContext: 'personal',
  sessionId: 'test-session-123',
  userId: 'test-user-123',
};

describe('Memory Self-Editing Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // memory_replace
  // ===========================================
  describe('handleMemoryReplace', () => {
    it('should return error if key is missing', async () => {
      const result = await handleMemoryReplace(
        { old_content: 'old', new_content: 'new', reason: 'test' },
        mockExecContext
      );
      expect(result).toContain('Fehler');
    });

    it('should return error if new_content is missing', async () => {
      const result = await handleMemoryReplace(
        { key: 'fact-123', reason: 'test' },
        mockExecContext
      );
      expect(result).toContain('Fehler');
    });

    it('should return error if reason is missing', async () => {
      const result = await handleMemoryReplace(
        { key: 'fact-123', new_content: 'new text' },
        mockExecContext
      );
      expect(result).toContain('Fehler');
    });

    it('should find fact by ID and update it', async () => {
      queryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'fact-123', content: 'old content', fact_type: 'knowledge', confidence: 0.8 }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'fact-123' }] }); // UPDATE

      const result = await handleMemoryReplace(
        { key: 'fact-123', new_content: 'new content', reason: 'correction' },
        mockExecContext
      );

      expect(result).toContain('ersetzt');
      expect(result).toContain('new content');
      expect(queryContext).toHaveBeenCalledTimes(2);
    });

    it('should find fact by content search when ID not found', async () => {
      queryContext
        .mockResolvedValueOnce({ rows: [] }) // ID search fails
        .mockResolvedValueOnce({
          rows: [{ id: 'fact-456', content: 'matching content', fact_type: 'preference', confidence: 0.7 }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'fact-456' }] }); // UPDATE

      const result = await handleMemoryReplace(
        { key: 'matching', new_content: 'updated content', reason: 'refinement' },
        mockExecContext
      );

      expect(result).toContain('ersetzt');
    });

    it('should return not-found message when no fact matches', async () => {
      // ID search fails, content search fails
      queryContext
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await handleMemoryReplace(
        { key: 'nonexistent-id', new_content: 'new', reason: 'test' },
        mockExecContext
      );

      expect(result).toContain('nicht gefunden');
    });

    it('should record the reason in the update', async () => {
      queryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'fact-123', content: 'old', fact_type: 'knowledge', confidence: 0.8 }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'fact-123' }] });

      const result = await handleMemoryReplace(
        { key: 'fact-123', new_content: 'new', reason: 'user corrected this' },
        mockExecContext
      );

      expect(result).toContain('user corrected this');
    });
  });

  // ===========================================
  // memory_abstract
  // ===========================================
  describe('handleMemoryAbstract', () => {
    it('should return error if fact_ids is missing', async () => {
      const result = await handleMemoryAbstract(
        { instruction: 'combine these' },
        mockExecContext
      );
      expect(result).toContain('Fehler');
    });

    it('should return error if instruction is missing', async () => {
      const result = await handleMemoryAbstract(
        { fact_ids: 'id1,id2' },
        mockExecContext
      );
      expect(result).toContain('Fehler');
    });

    it('should return error if fewer than 2 fact IDs provided', async () => {
      const result = await handleMemoryAbstract(
        { fact_ids: 'id1', instruction: 'combine' },
        mockExecContext
      );
      expect(result).toContain('Fehler');
    });

    it('should load facts, call Claude Haiku, and create abstracted fact', async () => {
      // Mock loading facts
      queryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'id1', content: 'Fact about cats', fact_type: 'knowledge', confidence: 0.8 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'id2', content: 'Fact about dogs', fact_type: 'knowledge', confidence: 0.7 }],
        })
        // Mark originals as superseded
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      generateClaudeResponse.mockResolvedValueOnce(
        '[{"content":"User likes pets in general","fact_type":"knowledge","confidence":0.85}]'
      );

      generateEmbedding.mockResolvedValueOnce(new Array(768).fill(0.1));

      const result = await handleMemoryAbstract(
        { fact_ids: 'id1,id2', instruction: 'combine into a general preference' },
        mockExecContext
      );

      expect(result).toContain('abstrahiert');
      expect(generateClaudeResponse).toHaveBeenCalled();
      // Verify Claude was called with Haiku model hint in system prompt
      const callArgs = generateClaudeResponse.mock.calls[0];
      expect(callArgs[0]).toContain('abstract'); // system prompt
    });

    it('should handle Claude API failure gracefully', async () => {
      queryContext
        .mockResolvedValueOnce({
          rows: [{ id: 'id1', content: 'Fact 1', fact_type: 'knowledge', confidence: 0.8 }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'id2', content: 'Fact 2', fact_type: 'knowledge', confidence: 0.7 }],
        });

      generateClaudeResponse.mockRejectedValueOnce(new Error('API error'));

      const result = await handleMemoryAbstract(
        { fact_ids: 'id1,id2', instruction: 'combine' },
        mockExecContext
      );

      expect(result).toContain('Fehler');
    });

    it('should handle fact not found', async () => {
      queryContext
        .mockResolvedValueOnce({ rows: [] }) // id1 not found
        .mockResolvedValueOnce({
          rows: [{ id: 'id2', content: 'Fact 2', fact_type: 'knowledge', confidence: 0.7 }],
        });

      const result = await handleMemoryAbstract(
        { fact_ids: 'id1,id2', instruction: 'combine' },
        mockExecContext
      );

      expect(result.toLowerCase()).toContain('nicht gefunden');
    });
  });

  // ===========================================
  // memory_search_and_link
  // ===========================================
  describe('handleMemorySearchAndLink', () => {
    it('should return error if query is missing', async () => {
      const result = await handleMemorySearchAndLink(
        { link_type: 'supports' },
        mockExecContext
      );
      expect(result).toContain('Fehler');
    });

    it('should search for related facts and create links', async () => {
      generateEmbedding.mockResolvedValueOnce(new Array(768).fill(0.5));

      // Semantic search results (similarity is a computed column)
      queryContext.mockResolvedValueOnce({
        rows: [
          { id: 'fact-a', content: 'TypeScript is great', confidence: 0.9, fact_type: 'knowledge', similarity: 0.85 },
          { id: 'fact-b', content: 'TypeScript has types', confidence: 0.85, fact_type: 'knowledge', similarity: 0.75 },
        ],
      });

      // Insert link
      queryContext.mockResolvedValueOnce({ rows: [] });

      const result = await handleMemorySearchAndLink(
        { query: 'TypeScript', link_type: 'related' },
        mockExecContext
      );

      expect(result).toContain('verwandte Fakten');
      expect(generateEmbedding).toHaveBeenCalledWith('TypeScript');
    });

    it('should use default link_type when not provided', async () => {
      generateEmbedding.mockResolvedValueOnce(new Array(768).fill(0.5));

      queryContext.mockResolvedValueOnce({
        rows: [
          { id: 'fact-a', content: 'Fact A', confidence: 0.9, fact_type: 'knowledge', similarity: 0.8 },
          { id: 'fact-b', content: 'Fact B', confidence: 0.85, fact_type: 'knowledge', similarity: 0.7 },
        ],
      });

      queryContext.mockResolvedValueOnce({ rows: [] });

      const result = await handleMemorySearchAndLink(
        { query: 'test query' },
        mockExecContext
      );

      expect(result).toContain('verwandte Fakten');
    });

    it('should return message when no related facts found', async () => {
      generateEmbedding.mockResolvedValueOnce(new Array(768).fill(0.5));
      queryContext.mockResolvedValueOnce({ rows: [] });

      const result = await handleMemorySearchAndLink(
        { query: 'obscure topic' },
        mockExecContext
      );

      expect(result).toContain('Keine');
    });

    it('should handle embedding generation failure', async () => {
      generateEmbedding.mockRejectedValueOnce(new Error('Embedding failed'));

      const result = await handleMemorySearchAndLink(
        { query: 'test' },
        mockExecContext
      );

      expect(result).toContain('Fehler');
    });
  });
});
