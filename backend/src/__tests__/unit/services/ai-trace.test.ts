/**
 * Phase 73: AI Trace Service Tests
 *
 * Tests for trace creation, span nesting, cost calculation, and buffer flushing.
 */

import {
  startTrace,
  estimateCost,
  flushBuffer,
  getBufferSize,
  getActiveTraceCount,
  getActiveTrace,
  initAITracing,
  shutdownAITracing,
  _resetForTesting,
} from '../../../services/observability/ai-trace';

describe('AI Trace Service (Phase 73)', () => {
  // Mock DB query function
  const mockQuery = jest.fn().mockResolvedValue({ rows: [] });

  beforeEach(() => {
    _resetForTesting();
    mockQuery.mockClear();
    initAITracing(mockQuery);
  });

  afterEach(async () => {
    await shutdownAITracing();
  });

  // =============================================
  // Cost Estimation
  // =============================================

  describe('estimateCost', () => {
    it('should estimate cost for known models', () => {
      // Sonnet: $3/1M input, $15/1M output
      const cost = estimateCost('claude-sonnet-4-20250514', 1000, 500);
      expect(cost).toBeCloseTo(0.003 + 0.0075, 6);
    });

    it('should estimate cost for Opus model', () => {
      // Opus: $15/1M input, $75/1M output
      const cost = estimateCost('claude-opus-4-20250514', 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(15 + 75, 2);
    });

    it('should use default pricing for unknown models', () => {
      const cost = estimateCost('unknown-model-v9', 1_000_000, 1_000_000);
      // Default: $3/1M input, $15/1M output
      expect(cost).toBeCloseTo(3 + 15, 2);
    });

    it('should use default pricing when model is undefined', () => {
      const cost = estimateCost(undefined, 1000, 500);
      expect(cost).toBeGreaterThan(0);
    });

    it('should return 0 for zero tokens', () => {
      expect(estimateCost('claude-sonnet-4-20250514', 0, 0)).toBe(0);
    });
  });

  // =============================================
  // Trace Creation
  // =============================================

  describe('startTrace', () => {
    it('should create a trace with unique ID', () => {
      const trace = startTrace('test-op', { query: 'hello' });
      expect(trace.id).toBeDefined();
      expect(trace.id).toHaveLength(36); // UUID format
    });

    it('should track active traces', () => {
      expect(getActiveTraceCount()).toBe(0);
      const trace = startTrace('test-op');
      expect(getActiveTraceCount()).toBe(1);
      expect(getActiveTrace(trace.id)).toBeDefined();
    });

    it('should accept optional session/user/metadata', () => {
      const trace = startTrace('test-op', { q: 'hi' }, {
        sessionId: 'sess-1',
        userId: 'user-1',
        metadata: { context: 'personal' },
      });
      const active = getActiveTrace(trace.id);
      expect(active).toBeDefined();
      expect(active!.sessionId).toBe('sess-1');
      expect(active!.userId).toBe('user-1');
      expect(active!.metadata).toEqual({ context: 'personal' });
    });
  });

  // =============================================
  // Trace End & Buffering
  // =============================================

  describe('trace.end', () => {
    it('should move trace from active to buffer', () => {
      const trace = startTrace('test-op');
      expect(getActiveTraceCount()).toBe(1);
      expect(getBufferSize()).toBe(0);

      trace.end({ result: 'done' });
      expect(getActiveTraceCount()).toBe(0);
      expect(getBufferSize()).toBe(1);
    });

    it('should set endTime and output on end', () => {
      const trace = startTrace('test-op', 'input');

      // Get reference before ending
      const active = getActiveTrace(trace.id);
      expect(active!.endTime).toBeUndefined();

      trace.end('output');
      // Trace moved to buffer, no longer active
      expect(getActiveTrace(trace.id)).toBeUndefined();
    });
  });

  // =============================================
  // Spans
  // =============================================

  describe('addSpan', () => {
    it('should add a span to the trace', () => {
      const trace = startTrace('chat');
      const span = trace.addSpan('retrieve', 'rag', { input: { query: 'hello' } });
      expect(span.id).toHaveLength(36);

      const active = getActiveTrace(trace.id);
      expect(active!.spans).toHaveLength(1);
      expect(active!.spans[0].name).toBe('retrieve');
      expect(active!.spans[0].type).toBe('rag');
    });

    it('should support nested spans via parentId', () => {
      const trace = startTrace('chat');
      const parent = trace.addSpan('retrieve', 'rag');
      const child = trace.addSpan('rerank', 'custom', { parentId: parent.id });

      const active = getActiveTrace(trace.id);
      expect(active!.spans).toHaveLength(2);
      expect(active!.spans[1].parentId).toBe(parent.id);
      expect(child.id).not.toBe(parent.id);
    });

    it('should record endTime and output on span.end()', () => {
      const trace = startTrace('chat');
      const span = trace.addSpan('tool-call', 'tool', { input: { tool: 'web_search' } });

      const active = getActiveTrace(trace.id);
      expect(active!.spans[0].endTime).toBeUndefined();

      span.end({ results: ['r1', 'r2'] });
      expect(active!.spans[0].endTime).toBeInstanceOf(Date);
      expect(active!.spans[0].output).toEqual({ results: ['r1', 'r2'] });
    });
  });

  // =============================================
  // Generations
  // =============================================

  describe('addGeneration', () => {
    it('should create a generation span with type=generation', () => {
      const trace = startTrace('chat');
      trace.addGeneration('claude-call', { model: 'claude-sonnet-4-20250514' });

      const active = getActiveTrace(trace.id);
      expect(active!.spans[0].type).toBe('generation');
      expect(active!.spans[0].metadata).toEqual({ model: 'claude-sonnet-4-20250514' });
    });

    it('should track tokens and cost on end', () => {
      const trace = startTrace('chat');
      const gen = trace.addGeneration('claude-call', { model: 'claude-sonnet-4-20250514' });

      gen.end('response text', { input: 1000, output: 500 });

      const active = getActiveTrace(trace.id);
      expect(active!.spans[0].tokens).toEqual({ input: 1000, output: 500 });
      expect(active!.spans[0].cost).toBeGreaterThan(0);
      expect(active!.totalTokens).toBe(1500);
      expect(active!.totalCost).toBeGreaterThan(0);
    });

    it('should accumulate tokens across multiple generations', () => {
      const trace = startTrace('agent');
      const gen1 = trace.addGeneration('step1', { model: 'claude-sonnet-4-20250514' });
      gen1.end('r1', { input: 1000, output: 500 });

      const gen2 = trace.addGeneration('step2', { model: 'claude-sonnet-4-20250514' });
      gen2.end('r2', { input: 2000, output: 1000 });

      const active = getActiveTrace(trace.id);
      expect(active!.totalTokens).toBe(4500);
      expect(active!.totalCost).toBeCloseTo(
        estimateCost('claude-sonnet-4-20250514', 1000, 500) +
        estimateCost('claude-sonnet-4-20250514', 2000, 1000),
        6,
      );
    });

    it('should handle end without tokens gracefully', () => {
      const trace = startTrace('chat');
      const gen = trace.addGeneration('claude-call');
      gen.end('response');

      const active = getActiveTrace(trace.id);
      expect(active!.totalTokens).toBe(0);
      expect(active!.totalCost).toBe(0);
    });
  });

  // =============================================
  // Buffer Flushing
  // =============================================

  describe('flushBuffer', () => {
    it('should flush all buffered traces to DB', async () => {
      const t1 = startTrace('op1');
      const t2 = startTrace('op2');
      t1.end();
      t2.end();
      expect(getBufferSize()).toBe(2);

      const flushed = await flushBuffer();
      expect(flushed).toBe(2);
      expect(getBufferSize()).toBe(0);
      // 2 trace INSERTs (no spans)
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should persist trace with spans', async () => {
      const trace = startTrace('chat', { q: 'hi' });
      trace.addSpan('retrieve', 'rag').end({ docs: [] });
      const gen = trace.addGeneration('claude', { model: 'claude-sonnet-4-20250514' });
      gen.end('response', { input: 100, output: 50 });
      trace.end('final');

      await flushBuffer();
      // 1 trace INSERT + 2 span INSERTs = 3
      expect(mockQuery).toHaveBeenCalledTimes(3);

      // Check trace INSERT
      const traceCall = mockQuery.mock.calls[0];
      expect(traceCall[0]).toContain('INSERT INTO ai_traces');
      expect(traceCall[1][3]).toBe('chat'); // name

      // Check span INSERTs
      const spanCall1 = mockQuery.mock.calls[1];
      expect(spanCall1[0]).toContain('INSERT INTO ai_spans');
      expect(spanCall1[1][3]).toBe('retrieve'); // name
      expect(spanCall1[1][4]).toBe('rag'); // type
    });

    it('should return 0 when buffer is empty', async () => {
      const flushed = await flushBuffer();
      expect(flushed).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should handle DB errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      const trace = startTrace('op');
      trace.end();

      const flushed = await flushBuffer();
      expect(flushed).toBe(0); // Failed, not counted
      expect(getBufferSize()).toBe(0); // Buffer was cleared
    });

    it('should continue flushing after a single trace fails', async () => {
      mockQuery
        .mockRejectedValueOnce(new Error('fail')) // trace 1 fails
        .mockResolvedValue({ rows: [] }); // trace 2 succeeds

      const t1 = startTrace('op1');
      const t2 = startTrace('op2');
      t1.end();
      t2.end();

      const flushed = await flushBuffer();
      expect(flushed).toBe(1); // Only t2 succeeded
    });
  });

  // =============================================
  // Full Trace Lifecycle
  // =============================================

  describe('full lifecycle', () => {
    it('should support a complete chat trace with RAG + generation', async () => {
      const trace = startTrace('chat-message', { message: 'What is AI?' }, {
        sessionId: 'sess-abc',
        userId: 'user-123',
        metadata: { context: 'personal', mode: 'rag_enhanced' },
      });

      // RAG retrieval span
      const ragSpan = trace.addSpan('rag-retrieve', 'rag', {
        input: { query: 'What is AI?', strategy: 'hyde' },
      });
      ragSpan.end({ documents: 5, confidence: 0.85 });

      // Tool call span
      const toolSpan = trace.addSpan('web-search', 'tool', {
        input: { query: 'artificial intelligence definition' },
      });
      toolSpan.end({ results: 3 });

      // LLM generation
      const gen = trace.addGeneration('claude-response', {
        model: 'claude-sonnet-4-20250514',
        input: { systemPrompt: '...', userMessage: 'What is AI?' },
      });
      gen.end('AI is...', { input: 2500, output: 800 });

      // End trace
      trace.end({ response: 'AI is...' });

      expect(getBufferSize()).toBe(1);
      expect(getActiveTraceCount()).toBe(0);

      const flushed = await flushBuffer();
      expect(flushed).toBe(1);
      // 1 trace + 3 spans = 4 queries
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });

    it('should support agent traces with multiple generation steps', async () => {
      const trace = startTrace('agent-execution', { task: 'Research AI trends' });

      // Researcher agent
      const researcherSpan = trace.addSpan('researcher', 'agent');
      const gen1 = trace.addGeneration('researcher-llm', {
        parentId: researcherSpan.id,
        model: 'claude-sonnet-4-20250514',
      });
      gen1.end('research results', { input: 3000, output: 2000 });
      researcherSpan.end({ findings: '...' });

      // Writer agent
      const writerSpan = trace.addSpan('writer', 'agent');
      const gen2 = trace.addGeneration('writer-llm', {
        parentId: writerSpan.id,
        model: 'claude-sonnet-4-20250514',
      });
      gen2.end('article draft', { input: 5000, output: 3000 });
      writerSpan.end({ draft: '...' });

      trace.end({ article: '...' });

      const active = getActiveTrace(trace.id);
      expect(active).toBeUndefined(); // ended

      expect(getBufferSize()).toBe(1);
      await flushBuffer();
      // 1 trace + 4 spans = 5 queries
      expect(mockQuery).toHaveBeenCalledTimes(5);
    });
  });
});
