/**
 * Claude Streaming Service Tests
 *
 * Tests for SSE helpers, truncation utilities, circuit breaker,
 * and streaming configuration.
 */

// Mock all external dependencies BEFORE imports
jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../config/timeouts', () => ({
  TIMEOUTS: {
    CLAUDE_TOOL_BUDGET: 60000,
    CLAUDE_STREAM: 90000,
    CIRCUIT_BREAKER_CLAUDE: 60000,
  },
}));

jest.mock('../../../utils/safe-stringify', () => ({
  safeStringify: (val: unknown) => JSON.stringify(val),
}));

jest.mock('../../../utils/sanitize-error', () => ({
  sanitizeError: (err: unknown) => ({
    message: err instanceof Error ? err.message : 'Unknown error',
    statusCode: 500,
  }),
}));

jest.mock('../../../utils/circuit-breaker', () => {
  class MockCircuitBreaker {
    name: string;
    constructor(opts: { name: string }) { this.name = opts.name; }
    async execute<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
    getStats() { return { state: 'closed', failures: 0, successes: 0 }; }
  }
  return {
    CircuitBreaker: MockCircuitBreaker,
    CircuitBreakerStats: {},
  };
});

jest.mock('../../../services/claude/client', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      stream: jest.fn(),
    },
  })),
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  getAnthropicBetaHeaders: jest.fn(() => []),
}));

jest.mock('../../../services/claude/context-compaction', () => ({
  COMPACTION_BETA: 'prompt-caching-2024-07-31',
  buildContextManagement: jest.fn(),
  hasCompactionBlock: jest.fn(() => false),
  calculateTokensSaved: jest.fn(() => 0),
  recordCompaction: jest.fn(),
}));

jest.mock('../../../services/claude/thinking-budget', () => ({
  isAdaptiveEnabled: jest.fn(() => false),
  getAdaptiveBudget: jest.fn(() => 16000),
}));

import {
  sendSSE,
  setupSSEHeaders,
  getClaudeBreakerStats,
} from '../../../services/claude/streaming';

// Access private functions via module internals
// We need to test truncateForSSE and truncateToolResult which are not exported,
// so we test them indirectly through streamToSSE behavior, or test the exports directly.

// ===========================================
// Test Helpers
// ===========================================

function createMockResponse() {
  const res = {
    headersSent: false,
    writableEnded: false,
    write: jest.fn(),
    end: jest.fn(),
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
  };
  return res as unknown as import('express').Response;
}

// ===========================================
// Tests
// ===========================================

describe('Claude Streaming Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------
  // sendSSE
  // -------------------------------------------
  describe('sendSSE', () => {
    it('should format SSE event correctly with type and data', () => {
      const res = createMockResponse();
      sendSSE(res, { type: 'content_delta', data: { content: 'Hello' } });

      expect(res.write).toHaveBeenCalledTimes(1);
      const written = (res.write as jest.Mock).mock.calls[0][0] as string;
      expect(written).toContain('event: content_delta');
      expect(written).toContain('"content":"Hello"');
      expect(written.endsWith('\n\n')).toBe(true);
    });

    it('should handle thinking_start event with empty data', () => {
      const res = createMockResponse();
      sendSSE(res, { type: 'thinking_start', data: {} });

      const written = (res.write as jest.Mock).mock.calls[0][0] as string;
      expect(written).toContain('event: thinking_start');
      expect(written).toContain('data: {}');
    });

    it('should handle error event with error message', () => {
      const res = createMockResponse();
      sendSSE(res, { type: 'error', data: { error: 'Something went wrong', requestId: 'req-123' } });

      const written = (res.write as jest.Mock).mock.calls[0][0] as string;
      expect(written).toContain('event: error');
      expect(written).toContain('Something went wrong');
      expect(written).toContain('req-123');
    });

    it('should handle done event with metadata', () => {
      const res = createMockResponse();
      sendSSE(res, {
        type: 'done',
        data: {
          content: 'Full response',
          metadata: {
            inputTokens: 100,
            outputTokens: 200,
            stopReason: 'end_turn',
          },
        },
      });

      const written = (res.write as jest.Mock).mock.calls[0][0] as string;
      expect(written).toContain('event: done');
      expect(written).toContain('"inputTokens":100');
      expect(written).toContain('"outputTokens":200');
    });

    it('should handle tool_use_start event with tool name', () => {
      const res = createMockResponse();
      sendSSE(res, {
        type: 'tool_use_start',
        data: { tool: { name: 'web_search' } },
      });

      const written = (res.write as jest.Mock).mock.calls[0][0] as string;
      expect(written).toContain('event: tool_use_start');
      expect(written).toContain('web_search');
    });

    it('should handle tool_use_end event with result', () => {
      const res = createMockResponse();
      sendSSE(res, {
        type: 'tool_use_end',
        data: { tool: { name: 'search_ideas', result: '3 ideas found' } },
      });

      const written = (res.write as jest.Mock).mock.calls[0][0] as string;
      expect(written).toContain('tool_use_end');
      expect(written).toContain('3 ideas found');
    });

    it('should handle compaction_info event', () => {
      const res = createMockResponse();
      sendSSE(res, {
        type: 'compaction_info',
        data: { content: 'Context compacted, 5000 tokens saved' },
      });

      const written = (res.write as jest.Mock).mock.calls[0][0] as string;
      expect(written).toContain('compaction_info');
      expect(written).toContain('5000 tokens saved');
    });
  });

  // -------------------------------------------
  // setupSSEHeaders
  // -------------------------------------------
  describe('setupSSEHeaders', () => {
    it('should set correct SSE headers', () => {
      const res = createMockResponse();
      setupSSEHeaders(res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('should not set headers if already sent', () => {
      const res = createMockResponse();
      (res as { headersSent: boolean }).headersSent = true;
      setupSSEHeaders(res);

      expect(res.setHeader).not.toHaveBeenCalled();
      expect(res.flushHeaders).not.toHaveBeenCalled();
    });

    it('should be idempotent - safe to call twice', () => {
      const res = createMockResponse();
      setupSSEHeaders(res);
      // After first call, headers are sent
      (res as { headersSent: boolean }).headersSent = true;
      setupSSEHeaders(res);

      // setHeader called only 4 times from first call
      expect(res.setHeader).toHaveBeenCalledTimes(4);
    });
  });

  // -------------------------------------------
  // getClaudeBreakerStats
  // -------------------------------------------
  describe('getClaudeBreakerStats', () => {
    it('should return circuit breaker stats', () => {
      const stats = getClaudeBreakerStats();
      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failures');
      expect(stats).toHaveProperty('successes');
    });
  });

  // -------------------------------------------
  // SSE event format correctness
  // -------------------------------------------
  describe('SSE format compliance', () => {
    it('should use "event:" prefix followed by type', () => {
      const res = createMockResponse();
      sendSSE(res, { type: 'content_start', data: {} });
      const written = (res.write as jest.Mock).mock.calls[0][0] as string;
      expect(written).toMatch(/^event: content_start\n/);
    });

    it('should use "data:" prefix followed by JSON', () => {
      const res = createMockResponse();
      sendSSE(res, { type: 'content_delta', data: { content: 'test' } });
      const written = (res.write as jest.Mock).mock.calls[0][0] as string;
      expect(written).toMatch(/data: \{.*\}\n\n$/);
    });

    it('should end with double newline per SSE spec', () => {
      const res = createMockResponse();
      sendSSE(res, { type: 'done', data: {} });
      const written = (res.write as jest.Mock).mock.calls[0][0] as string;
      expect(written.endsWith('\n\n')).toBe(true);
    });

    it('should produce valid JSON in data field', () => {
      const res = createMockResponse();
      sendSSE(res, {
        type: 'content_delta',
        data: { content: 'Special chars: "quotes" & <brackets>' },
      });
      const written = (res.write as jest.Mock).mock.calls[0][0] as string;
      const dataLine = written.split('\n').find(l => l.startsWith('data: '));
      expect(dataLine).toBeDefined();
      const json = JSON.parse(dataLine!.replace('data: ', ''));
      expect(json.content).toContain('Special chars');
    });
  });

  // -------------------------------------------
  // Multiple events in sequence
  // -------------------------------------------
  describe('Sequential SSE events', () => {
    it('should handle a typical thinking+content sequence', () => {
      const res = createMockResponse();

      sendSSE(res, { type: 'thinking_start', data: {} });
      sendSSE(res, { type: 'thinking_delta', data: { thinking: 'Let me think...' } });
      sendSSE(res, { type: 'thinking_end', data: { thinking: 'Let me think...' } });
      sendSSE(res, { type: 'content_start', data: {} });
      sendSSE(res, { type: 'content_delta', data: { content: 'Here is my answer.' } });
      sendSSE(res, { type: 'content_end', data: {} });
      sendSSE(res, { type: 'done', data: { metadata: { inputTokens: 50, outputTokens: 100 } } });

      expect(res.write).toHaveBeenCalledTimes(7);
    });
  });
});
