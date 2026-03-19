/**
 * Tests for memory_rethink Tool (Phase 101)
 *
 * Tests contextual memory revision via Claude Haiku synthesis.
 * The tool loads an existing fact, synthesizes it with new context,
 * and records the revision in fact lineage.
 */

import { handleMemoryRethink } from '../../../services/tool-handlers/memory-tools';
import type { ToolExecutionContext } from '../../../services/claude/tool-use';

// Mock dependencies
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  AIContext: {},
}));

jest.mock('../../../services/claude/core', () => ({
  generateClaudeResponse: jest.fn().mockResolvedValue('Synthesized revised fact content.'),
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
  episodicMemory: {},
  workingMemory: {},
  crossContextSharing: {},
}));

jest.mock('../../../services/personal-facts-bridge', () => ({
  invalidatePersonalFactsCache: jest.fn(),
  CATEGORY_LABELS: {},
  VALID_CATEGORIES: ['identity', 'preferences', 'work', 'goals'],
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
  v4: jest.fn().mockReturnValue('mock-uuid-rethink'),
}));

const { queryContext } = require('../../../utils/database-context');
const { generateClaudeResponse } = require('../../../services/claude/core');
const { longTermMemory } = require('../../../services/memory');

const mockExecContext: ToolExecutionContext = {
  aiContext: 'personal',
  sessionId: 'test-session-rethink',
  userId: 'test-user-rethink',
};

const MOCK_FACT_ID = 'fact-id-abc-123';
const MOCK_OLD_CONTENT = 'User prefers short meetings of 30 minutes.';
const MOCK_NEW_CONTEXT = 'User mentioned they now prefer 45-minute meetings for complex topics.';

describe('memory_rethink Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // Input validation
  // ===========================================

  describe('input validation', () => {
    it('should return error when fact_id is missing', async () => {
      const result = await handleMemoryRethink(
        { new_context: MOCK_NEW_CONTEXT },
        mockExecContext
      );
      expect(result).toContain('Fehler');
      expect(result).toContain('fact_id');
    });

    it('should return error when new_context is missing', async () => {
      const result = await handleMemoryRethink(
        { fact_id: MOCK_FACT_ID },
        mockExecContext
      );
      expect(result).toContain('Fehler');
      expect(result).toContain('new_context');
    });

    it('should return error when both inputs are missing', async () => {
      const result = await handleMemoryRethink({}, mockExecContext);
      expect(result).toContain('Fehler');
    });
  });

  // ===========================================
  // Fact not found
  // ===========================================

  describe('fact not found', () => {
    it('should return not-found message when fact does not exist in DB or memory cache', async () => {
      queryContext.mockResolvedValueOnce({ rows: [] }); // DB lookup returns nothing
      longTermMemory.getFacts.mockResolvedValueOnce([]); // Memory cache also empty

      const result = await handleMemoryRethink(
        { fact_id: 'nonexistent-id', new_context: MOCK_NEW_CONTEXT },
        mockExecContext
      );

      expect(result).toContain('nicht gefunden');
    });
  });

  // ===========================================
  // Successful synthesis via DB fact
  // ===========================================

  describe('successful synthesis (DB fact)', () => {
    beforeEach(() => {
      // DB returns an existing fact
      queryContext.mockResolvedValueOnce({
        rows: [{
          id: MOCK_FACT_ID,
          content: MOCK_OLD_CONTENT,
          fact_type: 'preference',
          confidence: 0.85,
          metadata: null,
        }],
      });
      // In-memory cache returns empty (no cached version)
      longTermMemory.getFacts.mockResolvedValueOnce([]);
      // DB UPDATE succeeds
      queryContext.mockResolvedValueOnce({ rows: [] });
    });

    it('should call generateClaudeResponse with old content and new context', async () => {
      await handleMemoryRethink(
        { fact_id: MOCK_FACT_ID, new_context: MOCK_NEW_CONTEXT },
        mockExecContext
      );

      expect(generateClaudeResponse).toHaveBeenCalledTimes(1);
      const [systemPrompt, userPrompt] = generateClaudeResponse.mock.calls[0];
      expect(systemPrompt).toContain('memory revision');
      expect(userPrompt).toContain(MOCK_OLD_CONTENT);
      expect(userPrompt).toContain(MOCK_NEW_CONTEXT);
    });

    it('should return success message showing old content, new context, and synthesized result', async () => {
      const result = await handleMemoryRethink(
        { fact_id: MOCK_FACT_ID, new_context: MOCK_NEW_CONTEXT },
        mockExecContext
      );

      expect(result).toContain('Vorher');
      expect(result).toContain('Nachher');
      expect(result).toContain('Synthesized revised fact content.');
      expect(result).not.toContain('Fehler');
    });

    it('should update fact in DB with synthesized content and lineage metadata', async () => {
      await handleMemoryRethink(
        { fact_id: MOCK_FACT_ID, new_context: MOCK_NEW_CONTEXT },
        mockExecContext
      );

      // Second queryContext call is the UPDATE
      const updateCall = queryContext.mock.calls[1];
      expect(updateCall[1]).toContain('UPDATE personalization_facts');
      expect(updateCall[2][0]).toBe('Synthesized revised fact content.');
      expect(updateCall[2][1]).toContain('rethought_at');
      expect(updateCall[2][1]).toContain('old_content');
      expect(updateCall[2][2]).toBe(MOCK_FACT_ID);
    });
  });

  // ===========================================
  // Synthesis from in-memory cache fallback
  // ===========================================

  describe('synthesis from in-memory cache fallback', () => {
    it('should fall back to longTermMemory when DB returns no rows', async () => {
      queryContext.mockResolvedValueOnce({ rows: [] }); // DB lookup returns nothing
      longTermMemory.getFacts.mockResolvedValueOnce([
        {
          id: MOCK_FACT_ID,
          content: MOCK_OLD_CONTENT,
          factType: 'preference' as const,
          confidence: 0.8,
          occurrences: 3,
          lastConfirmed: new Date(),
          firstSeen: new Date(),
          source: 'explicit' as const,
          retrievalCount: 1,
          lastRetrieved: null,
          decayClass: 'normal_decay' as const,
        },
      ]);
      // DB UPDATE via fallback path
      queryContext.mockResolvedValueOnce({ rows: [] });

      const result = await handleMemoryRethink(
        { fact_id: MOCK_FACT_ID, new_context: MOCK_NEW_CONTEXT },
        mockExecContext
      );

      expect(generateClaudeResponse).toHaveBeenCalledTimes(1);
      expect(result).toContain('Nachher');
    });
  });

  // ===========================================
  // LLM failure handling
  // ===========================================

  describe('LLM failure handling', () => {
    it('should return error message when Claude synthesis fails', async () => {
      queryContext.mockResolvedValueOnce({
        rows: [{
          id: MOCK_FACT_ID,
          content: MOCK_OLD_CONTENT,
          fact_type: 'preference',
          confidence: 0.85,
          metadata: null,
        }],
      });
      longTermMemory.getFacts.mockResolvedValueOnce([]);
      generateClaudeResponse.mockRejectedValueOnce(new Error('API timeout'));

      const result = await handleMemoryRethink(
        { fact_id: MOCK_FACT_ID, new_context: MOCK_NEW_CONTEXT },
        mockExecContext
      );

      expect(result).toContain('Fehler');
      expect(result).toContain('KI-Synthese');
    });

    it('should return error when synthesis produces empty string', async () => {
      queryContext.mockResolvedValueOnce({
        rows: [{
          id: MOCK_FACT_ID,
          content: MOCK_OLD_CONTENT,
          fact_type: 'preference',
          confidence: 0.85,
          metadata: null,
        }],
      });
      longTermMemory.getFacts.mockResolvedValueOnce([]);
      generateClaudeResponse.mockResolvedValueOnce('   '); // Empty/whitespace response

      const result = await handleMemoryRethink(
        { fact_id: MOCK_FACT_ID, new_context: MOCK_NEW_CONTEXT },
        mockExecContext
      );

      expect(result).toContain('Fehler');
    });
  });

  // ===========================================
  // DB update failure with fallback
  // ===========================================

  describe('DB update fallback', () => {
    it('should fall back to simple UPDATE when jsonb merge fails', async () => {
      queryContext.mockResolvedValueOnce({
        rows: [{
          id: MOCK_FACT_ID,
          content: MOCK_OLD_CONTENT,
          fact_type: 'preference',
          confidence: 0.85,
          metadata: null,
        }],
      });
      longTermMemory.getFacts.mockResolvedValueOnce([]);
      // First UPDATE (with metadata) fails
      queryContext.mockRejectedValueOnce(new Error('jsonb operator not supported'));
      // Fallback simple UPDATE succeeds
      queryContext.mockResolvedValueOnce({ rows: [] });

      const result = await handleMemoryRethink(
        { fact_id: MOCK_FACT_ID, new_context: MOCK_NEW_CONTEXT },
        mockExecContext
      );

      // Should still succeed with the fallback
      expect(result).toContain('synthetisiert');
      expect(queryContext).toHaveBeenCalledTimes(3); // DB lookup + failed UPDATE + fallback UPDATE
    });
  });

  // ===========================================
  // In-memory cache update
  // ===========================================

  describe('in-memory cache update', () => {
    it('should update in-memory fact when cache entry exists', async () => {
      queryContext.mockResolvedValueOnce({
        rows: [{
          id: MOCK_FACT_ID,
          content: MOCK_OLD_CONTENT,
          fact_type: 'preference',
          confidence: 0.85,
          metadata: null,
        }],
      });

      const cachedFact = {
        id: MOCK_FACT_ID,
        content: MOCK_OLD_CONTENT,
        factType: 'preference' as const,
        confidence: 0.85,
        occurrences: 2,
        lastConfirmed: new Date('2026-01-01'),
        firstSeen: new Date('2026-01-01'),
        source: 'explicit' as const,
        retrievalCount: 1,
        lastRetrieved: null,
        decayClass: 'normal_decay' as const,
      };
      longTermMemory.getFacts.mockResolvedValueOnce([cachedFact]);
      queryContext.mockResolvedValueOnce({ rows: [] });

      await handleMemoryRethink(
        { fact_id: MOCK_FACT_ID, new_context: MOCK_NEW_CONTEXT },
        mockExecContext
      );

      // In-memory fact should be updated
      expect(cachedFact.content).toBe('Synthesized revised fact content.');
      expect(cachedFact.occurrences).toBe(3);
    });
  });
});
