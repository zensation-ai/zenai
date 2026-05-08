/**
 * Sprint 1.8 Commit 1: streaming-hot-path guardrail scanner
 *
 * Validates that `streamToSSE()` (from services/claude/streaming.ts) aborts
 * the stream and emits a `guardrail_block` SSE event when the model's
 * streamed output trips `scanOutput()`. The pipeline sees only deterministic
 * text chunks — no real Anthropic API calls.
 */

import { EventEmitter } from 'events';

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
  return { CircuitBreaker: MockCircuitBreaker, CircuitBreakerStats: {} };
});

// Capture the mock stream so each test can script its emissions.
let currentStream: MockStream | null = null;

class MockStream extends EventEmitter {
  aborted = false;
  finalMessagePromise: Promise<unknown>;
  private resolveFinal!: (v: unknown) => void;

  constructor() {
    super();
    this.finalMessagePromise = new Promise((resolve) => {
      this.resolveFinal = resolve;
    });
  }

  finalMessage(): Promise<unknown> {
    return this.finalMessagePromise;
  }

  abort(): void {
    this.aborted = true;
    this.resolveFinal({
      content: [],
      usage: { input_tokens: 0, output_tokens: 0 },
      stop_reason: 'end_turn',
    });
  }

  finish(): void {
    this.resolveFinal({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 10 },
      stop_reason: 'end_turn',
    });
  }
}

jest.mock('../../../services/claude/client', () => ({
  getClaudeClient: jest.fn(() => ({
    messages: {
      stream: jest.fn(() => {
        currentStream = new MockStream();
        return currentStream;
      }),
    },
  })),
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  getAnthropicBetaHeaders: jest.fn(() => []),
}));

jest.mock('../../../services/claude/context-compaction', () => ({
  COMPACTION_BETA: 'compaction-beta',
  buildContextManagement: jest.fn(() => undefined),
  hasCompactionBlock: jest.fn(() => false),
  calculateTokensSaved: jest.fn(() => 0),
  recordCompaction: jest.fn(),
}));

jest.mock('../../../services/claude/thinking-budget', () => ({
  isAdaptiveEnabled: jest.fn(() => false),
  getAdaptiveBudget: jest.fn(() => 16000),
  getThinkingBudget: jest.fn(() => ({ tier: 'low', display: 'Standard', label: 'std', budget: 2000 })),
}));

// audit-logger fan-out: capture calls so we can assert.
const auditSpy = jest.fn().mockResolvedValue(null);
jest.mock('../../../services/security/audit-logger', () => ({
  getAuditLogger: () => ({ logSecurityEvent: auditSpy }),
}));

// AG-UI: stub to noop (not under test here).
jest.mock('../../../services/agui/event-adapter', () => ({
  AgUIEventAdapter: class {
    textMessageStart(): string { return ''; }
    textMessageContent(): string { return ''; }
    textMessageEnd(): string { return ''; }
    runStarted(): string { return ''; }
    runError(): string { return ''; }
    runFinished(): string { return ''; }
    toolCallStart(): string { return ''; }
    toolCallEnd(): string { return ''; }
  },
}));
jest.mock('../../../services/agui/state-manager', () => ({
  AgUIStateManager: class {},
}));

import { Response } from 'express';
import {
  extendGuardrailWindow,
  streamToSSE,
  GUARDRAIL_OUTPUT_WINDOW,
} from '../../../services/claude/streaming';

function createMockResponse(): Response & { _written: string[] } {
  const written: string[] = [];
  const res = {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    write: jest.fn((chunk: string) => { written.push(chunk); return true; }),
    end: jest.fn(),
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    _written: written,
  };
  return res as unknown as Response & { _written: string[] };
}

// Small helper: wait for microtasks to drain after emitting events.
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('Sprint 1.8 — streaming guardrail output scanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentStream = null;
  });

  describe('extendGuardrailWindow()', () => {
    it('appends when combined length is below the window', () => {
      const next = extendGuardrailWindow('abc', 'def');
      expect(next).toBe('abcdef');
    });

    it('clips to the last GUARDRAIL_OUTPUT_WINDOW chars when overflowing', () => {
      const base = 'x'.repeat(GUARDRAIL_OUTPUT_WINDOW);
      const next = extendGuardrailWindow(base, 'NEWTAIL');
      expect(next.length).toBe(GUARDRAIL_OUTPUT_WINDOW);
      expect(next.endsWith('NEWTAIL')).toBe(true);
      expect(next.startsWith('x')).toBe(true);
    });

    it('handles empty prev and empty chunk cleanly', () => {
      expect(extendGuardrailWindow('', '')).toBe('');
      expect(extendGuardrailWindow('', 'hi')).toBe('hi');
      expect(extendGuardrailWindow('hi', '')).toBe('hi');
    });

    it('keeps only the overflow tail when chunk alone exceeds the window', () => {
      const giant = 'y'.repeat(GUARDRAIL_OUTPUT_WINDOW + 500);
      const next = extendGuardrailWindow('prev', giant);
      expect(next.length).toBe(GUARDRAIL_OUTPUT_WINDOW);
      expect(next.endsWith('y')).toBe(true);
    });
  });

  describe('streamToSSE() guardrail integration', () => {
    it('emits guardrail_block and stops forwarding deltas when a plaintext Stripe key appears', async () => {
      const res = createMockResponse();

      const streamPromise = streamToSSE(res, [{ role: 'user', content: 'hi' }], {
        enableThinking: false,
        userId: 'user-123',
        context: 'operations',
      });

      // Wait for messages.stream() to run + listener to install.
      await tick();
      expect(currentStream).not.toBeNull();
      const s = currentStream!;

      // First chunk: safe.
      s.emit('text', 'Sure, here is a friendly note.\n');
      await tick();

      // Second chunk: a live Stripe key — scanOutput must trip.
      s.emit('text', 'Your key is sk_' + 'live_AAAAAAAAAAAAAAAAAAAAAAAA\n');
      await tick();

      // Third chunk: must be dropped.
      s.emit('text', 'Here is more text that should never be forwarded.');
      await tick();

      // Finalize — abort() was called by the guardrail, so finalMessage already resolved.
      await streamPromise;

      const eventTypes = res._written
        .map((w) => /event: (\w+)/.exec(w)?.[1])
        .filter((x): x is string => Boolean(x));

      expect(eventTypes).toContain('guardrail_block');

      // At most one content_delta should have been forwarded (the safe chunk).
      const contentDeltas = res._written.filter((w) => w.startsWith('event: content_delta'));
      expect(contentDeltas.length).toBe(1);
      expect(contentDeltas[0]).toContain('friendly note');

      // Verify the guardrail event carries the finding.
      const blockEvent = res._written.find((w) => w.startsWith('event: guardrail_block')) ?? '';
      expect(blockEvent).toContain('plaintext_secret');

      // Audit event should have been emitted once.
      expect(auditSpy).toHaveBeenCalledTimes(1);
      const auditCall = auditSpy.mock.calls[0][0];
      expect(auditCall.eventType).toBe('sensitive_data_access');
      expect(auditCall.userId).toBe('user-123');
      expect(auditCall.context).toBe('operations');
      expect(auditCall.severity).toBe('warning');
      expect(auditCall.details.surface).toBe('chat.stream.output');
      expect(auditCall.details.findings).toContain('plaintext_secret');

      // Stream should have been aborted.
      expect(s.aborted).toBe(true);
    });

    it('does NOT emit guardrail_block for innocuous output', async () => {
      const res = createMockResponse();

      const streamPromise = streamToSSE(res, [{ role: 'user', content: 'hi' }], {
        enableThinking: false,
      });

      await tick();
      const s = currentStream!;
      s.emit('text', 'Hello, the weather is sunny in Munich today.');
      await tick();
      s.emit('text', 'Would you like a summary of yesterday?');
      await tick();
      s.finish();

      await streamPromise;

      const guardrail = res._written.filter((w) => w.startsWith('event: guardrail_block'));
      expect(guardrail.length).toBe(0);

      const deltas = res._written.filter((w) => w.startsWith('event: content_delta'));
      expect(deltas.length).toBe(2);

      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('does NOT log an audit event when userId is omitted (anonymous stream)', async () => {
      const res = createMockResponse();

      const streamPromise = streamToSSE(res, [{ role: 'user', content: 'hi' }], {
        enableThinking: false,
        // userId intentionally omitted
      });

      await tick();
      const s = currentStream!;
      s.emit('text', 'Leaking sk_' + 'live_BBBBBBBBBBBBBBBBBBBBBBBB now.');
      await tick();

      await streamPromise;

      const blockEvent = res._written.find((w) => w.startsWith('event: guardrail_block'));
      expect(blockEvent).toBeDefined(); // block still fires (client-side is still protected)
      expect(auditSpy).not.toHaveBeenCalled(); // but no audit row written without userId
    });

    it('catches secrets that span two chunk boundaries (sliding window)', async () => {
      const res = createMockResponse();

      const streamPromise = streamToSSE(res, [{ role: 'user', content: 'hi' }], {
        enableThinking: false,
        userId: 'u1',
      });

      await tick();
      const s = currentStream!;

      // Split a secret across two token emissions — the sliding window must stitch it.
      s.emit('text', 'Key prefix: sk_' + 'live_');
      await tick();
      s.emit('text', 'CCCCCCCCCCCCCCCCCCCCCCCC');
      await tick();
      s.emit('text', 'trailing noise');
      await tick();

      await streamPromise;

      const blockEvent = res._written.find((w) => w.startsWith('event: guardrail_block'));
      expect(blockEvent).toBeDefined();
      expect(blockEvent).toContain('plaintext_secret');
    });
  });
});
