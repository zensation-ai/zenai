/**
 * Context Compaction Service Tests
 *
 * Tests for the Claude Context Compaction API integration
 * that enables infinite conversations.
 */

import {
  buildCompactionConfig,
  buildContextManagement,
  hasCompactionBlock,
  extractTextFromCompactedResponse,
  extractCompactionSummary,
  calculateTokensSaved,
  serializeResponseContent,
  deserializeMessageContent,
  estimateTokens,
  estimateConversationTokens,
  shouldEnableCompaction,
  getCompactionState,
  recordCompaction,
  clearCompactionState,
  COMPACTION_BETA,
} from '../../../services/claude/context-compaction';

describe('Context Compaction Service', () => {
  afterEach(() => {
    // Clean up session states between tests
    clearCompactionState('test-session-1');
    clearCompactionState('test-session-2');
  });

  describe('COMPACTION_BETA', () => {
    it('should export the correct beta identifier', () => {
      expect(COMPACTION_BETA).toBe('compact-2026-01-12');
    });
  });

  describe('buildCompactionConfig', () => {
    it('should return default config when no overrides', () => {
      const config = buildCompactionConfig();
      expect(config.enabled).toBe(true);
      expect(config.triggerThreshold).toBe(80000);
      expect(config.pauseAfterCompaction).toBe(false);
      expect(config.instructions).toBeDefined();
      expect(config.instructions).toContain('Zusammenfassung');
    });

    it('should allow overriding enabled', () => {
      const config = buildCompactionConfig({ enabled: false });
      expect(config.enabled).toBe(false);
    });

    it('should enforce minimum trigger threshold', () => {
      const config = buildCompactionConfig({ triggerThreshold: 10000 });
      expect(config.triggerThreshold).toBe(50000);
    });

    it('should allow threshold above minimum', () => {
      const config = buildCompactionConfig({ triggerThreshold: 100000 });
      expect(config.triggerThreshold).toBe(100000);
    });

    it('should allow custom instructions', () => {
      const config = buildCompactionConfig({ instructions: 'Custom instructions' });
      expect(config.instructions).toBe('Custom instructions');
    });
  });

  describe('buildContextManagement', () => {
    it('should return undefined when compaction disabled', () => {
      const config = buildCompactionConfig({ enabled: false });
      const result = buildContextManagement(config);
      expect(result).toBeUndefined();
    });

    it('should build valid context_management param', () => {
      const config = buildCompactionConfig();
      const result = buildContextManagement(config);
      expect(result).toBeDefined();
      expect(result!.edits).toHaveLength(1);
      expect(result!.edits[0].type).toBe('compact_20260112');
      expect(result!.edits[0].trigger).toEqual({
        type: 'input_tokens',
        value: 80000,
      });
    });

    it('should include instructions when provided', () => {
      const config = buildCompactionConfig({ instructions: 'Test instructions' });
      const result = buildContextManagement(config);
      expect(result!.edits[0].instructions).toBe('Test instructions');
    });

    it('should not include instructions when undefined', () => {
      const config = buildCompactionConfig();
      config.instructions = undefined;
      const result = buildContextManagement(config);
      expect(result!.edits[0]).not.toHaveProperty('instructions');
    });

    it('should set pause_after_compaction', () => {
      const config = buildCompactionConfig({ pauseAfterCompaction: true });
      const result = buildContextManagement(config);
      expect(result!.edits[0].pause_after_compaction).toBe(true);
    });
  });

  describe('hasCompactionBlock', () => {
    it('should return false for regular content', () => {
      const content = [
        { type: 'text', text: 'Hello' },
      ];
      expect(hasCompactionBlock(content)).toBe(false);
    });

    it('should return true when compaction block present', () => {
      const content = [
        { type: 'compaction', content: 'Summarized...' },
        { type: 'text', text: 'Response' },
      ];
      expect(hasCompactionBlock(content)).toBe(true);
    });

    it('should return false for empty content', () => {
      expect(hasCompactionBlock([])).toBe(false);
    });
  });

  describe('extractTextFromCompactedResponse', () => {
    it('should extract text from simple response', () => {
      const content = [{ type: 'text', text: 'Hello world' }];
      expect(extractTextFromCompactedResponse(content)).toBe('Hello world');
    });

    it('should concatenate multiple text blocks', () => {
      const content = [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ];
      expect(extractTextFromCompactedResponse(content)).toBe('Hello world');
    });

    it('should skip compaction blocks', () => {
      const content = [
        { type: 'compaction', content: 'Summary...' },
        { type: 'text', text: 'Actual response' },
      ];
      expect(extractTextFromCompactedResponse(content)).toBe('Actual response');
    });

    it('should return empty string for no text blocks', () => {
      const content = [{ type: 'compaction', content: 'Summary...' }];
      expect(extractTextFromCompactedResponse(content)).toBe('');
    });
  });

  describe('extractCompactionSummary', () => {
    it('should return null when no compaction block', () => {
      const content = [{ type: 'text', text: 'Hello' }];
      expect(extractCompactionSummary(content)).toBeNull();
    });

    it('should extract compaction summary', () => {
      const content = [
        { type: 'compaction', content: 'Zusammenfassung des Gesprächs...' },
        { type: 'text', text: 'Response' },
      ];
      expect(extractCompactionSummary(content)).toBe('Zusammenfassung des Gesprächs...');
    });

    it('should return null if compaction block has no content', () => {
      const content = [{ type: 'compaction' }];
      expect(extractCompactionSummary(content)).toBeNull();
    });
  });

  describe('calculateTokensSaved', () => {
    it('should return 0 with no iterations', () => {
      const usage = { input_tokens: 1000, output_tokens: 500 };
      expect(calculateTokensSaved(usage)).toBe(0);
    });

    it('should return 0 with single iteration', () => {
      const usage = {
        input_tokens: 1000,
        output_tokens: 500,
        iterations: [{ type: 'message', input_tokens: 1000, output_tokens: 500 }],
      };
      expect(calculateTokensSaved(usage)).toBe(0);
    });

    it('should calculate tokens saved from compaction', () => {
      const usage = {
        input_tokens: 30000,
        output_tokens: 500,
        iterations: [
          { type: 'compaction', input_tokens: 80000, output_tokens: 2000 },
          { type: 'message', input_tokens: 30000, output_tokens: 500 },
        ],
      };
      expect(calculateTokensSaved(usage)).toBe(50000);
    });

    it('should return 0 if missing compaction iteration', () => {
      const usage = {
        input_tokens: 1000,
        output_tokens: 500,
        iterations: [
          { type: 'message', input_tokens: 1000, output_tokens: 500 },
          { type: 'other', input_tokens: 2000, output_tokens: 100 },
        ],
      };
      expect(calculateTokensSaved(usage)).toBe(0);
    });
  });

  describe('serializeResponseContent', () => {
    it('should store plain text for non-compacted responses', () => {
      const content = [{ type: 'text', text: 'Hello world' }];
      expect(serializeResponseContent(content)).toBe('Hello world');
    });

    it('should store JSON for compacted responses', () => {
      const content = [
        { type: 'compaction', content: 'Summary...' },
        { type: 'text', text: 'Response' },
      ];
      const result = serializeResponseContent(content);
      expect(result.startsWith('[')).toBe(true);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].type).toBe('compaction');
    });
  });

  describe('deserializeMessageContent', () => {
    it('should return plain text as-is', () => {
      expect(deserializeMessageContent('Hello world')).toBe('Hello world');
    });

    it('should parse JSON content arrays', () => {
      const json = JSON.stringify([
        { type: 'compaction', content: 'Summary...' },
        { type: 'text', text: 'Response' },
      ]);
      const result = deserializeMessageContent(json);
      expect(Array.isArray(result)).toBe(true);
      expect((result as Array<{ type: string }>)[0].type).toBe('compaction');
    });

    it('should treat invalid JSON as plain text', () => {
      expect(deserializeMessageContent('[not valid json')).toBe('[not valid json');
    });

    it('should treat non-content-block arrays as plain text', () => {
      // Array of strings, not content blocks
      expect(deserializeMessageContent('["hello", "world"]')).toBe('["hello", "world"]');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate ~1 token per 4 characters', () => {
      expect(estimateTokens('1234')).toBe(1);
      expect(estimateTokens('12345678')).toBe(2);
    });

    it('should handle empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should round up', () => {
      expect(estimateTokens('12345')).toBe(2);
    });
  });

  describe('estimateConversationTokens', () => {
    it('should sum token estimates for all messages plus system prompt', () => {
      const messages = [
        { content: 'Hello' },       // ~2 tokens
        { content: 'Hi there!' },    // ~3 tokens
      ];
      const systemPrompt = 'You are helpful'; // ~4 tokens
      const estimate = estimateConversationTokens(messages, systemPrompt);
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(100);
    });

    it('should handle empty messages', () => {
      expect(estimateConversationTokens([], '')).toBe(0);
    });
  });

  describe('shouldEnableCompaction', () => {
    it('should return false for small conversations', () => {
      expect(shouldEnableCompaction(10000)).toBe(false);
    });

    it('should return true when approaching threshold', () => {
      // 70% of 80000 = 56000
      expect(shouldEnableCompaction(60000)).toBe(true);
    });

    it('should return true when over threshold', () => {
      expect(shouldEnableCompaction(100000)).toBe(true);
    });

    it('should use custom threshold', () => {
      expect(shouldEnableCompaction(40000, 50000)).toBe(true);  // 70% of 50000 = 35000
      expect(shouldEnableCompaction(30000, 50000)).toBe(false);
    });
  });

  describe('Session State Management', () => {
    it('should initialize state for new sessions', () => {
      const state = getCompactionState('test-session-1');
      expect(state.compactionCount).toBe(0);
      expect(state.totalTokensSaved).toBe(0);
      expect(state.lastCompactionAt).toBeNull();
      expect(state.hasCompactedContent).toBe(false);
    });

    it('should return same state for same session', () => {
      const state1 = getCompactionState('test-session-1');
      const state2 = getCompactionState('test-session-1');
      expect(state1).toBe(state2);
    });

    it('should track compaction events', () => {
      recordCompaction('test-session-1', 50000);
      const state = getCompactionState('test-session-1');
      expect(state.compactionCount).toBe(1);
      expect(state.totalTokensSaved).toBe(50000);
      expect(state.lastCompactionAt).toBeInstanceOf(Date);
      expect(state.hasCompactedContent).toBe(true);
    });

    it('should accumulate multiple compactions', () => {
      recordCompaction('test-session-1', 30000);
      recordCompaction('test-session-1', 20000);
      const state = getCompactionState('test-session-1');
      expect(state.compactionCount).toBe(2);
      expect(state.totalTokensSaved).toBe(50000);
    });

    it('should clear state on cleanup', () => {
      recordCompaction('test-session-1', 50000);
      clearCompactionState('test-session-1');
      const state = getCompactionState('test-session-1');
      expect(state.compactionCount).toBe(0);
    });

    it('should track separate state per session', () => {
      recordCompaction('test-session-1', 30000);
      recordCompaction('test-session-2', 20000);
      expect(getCompactionState('test-session-1').totalTokensSaved).toBe(30000);
      expect(getCompactionState('test-session-2').totalTokensSaved).toBe(20000);
    });
  });
});
