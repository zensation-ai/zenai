import { describe, it, expect, vi } from 'vitest';
import { parseSSEChunk, type SSEParseState } from '../../hooks/useStreamingChat';

// Mock dependencies that useStreamingChat imports
vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../services/sentry', () => ({
  captureException: vi.fn(),
}));

// ============================================
// parseSSEChunk Tests
// ============================================

describe('parseSSEChunk', () => {
  const freshState = (): SSEParseState => ({ currentEventType: '', buffer: '' });

  describe('basic SSE parsing', () => {
    it('parses a simple data line', () => {
      const chunk = 'data: {"content":"hello"}\n\n';
      const { events, state } = parseSSEChunk(chunk, freshState());
      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({ content: 'hello' });
      expect(events[0].eventType).toBe('');
      expect(state.buffer).toBe('');
    });

    it('parses data without space after colon', () => {
      const chunk = 'data:{"content":"hi"}\n\n';
      const { events } = parseSSEChunk(chunk, freshState());
      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({ content: 'hi' });
    });

    it('parses event type + data', () => {
      const chunk = 'event: tool_use_start\ndata: {"tool":{"name":"web_search"}}\n\n';
      const { events } = parseSSEChunk(chunk, freshState());
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('tool_use_start');
      expect(events[0].data).toEqual({ tool: { name: 'web_search' } });
    });

    it('parses multiple events in one chunk', () => {
      const chunk = [
        'event: tool_use_start',
        'data: {"tool":{"name":"recall"}}',
        '',
        'data: {"content":"Result"}',
        '',
      ].join('\n');
      const { events } = parseSSEChunk(chunk, freshState());
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('tool_use_start');
      expect(events[1].eventType).toBe(''); // reset after first data line
    });
  });

  describe('buffering incomplete data', () => {
    it('buffers incomplete lines across chunks', () => {
      const chunk1 = 'data: {"con';
      const { events: events1, state: state1 } = parseSSEChunk(chunk1, freshState());
      expect(events1).toHaveLength(0);
      expect(state1.buffer).toBe('data: {"con');

      const chunk2 = 'tent":"world"}\n\n';
      const { events: events2 } = parseSSEChunk(chunk2, state1);
      expect(events2).toHaveLength(1);
      expect(events2[0].data).toEqual({ content: 'world' });
    });

    it('preserves event type across chunks', () => {
      const chunk1 = 'event: done\n';
      const { events: events1, state: state1 } = parseSSEChunk(chunk1, freshState());
      expect(events1).toHaveLength(0);
      expect(state1.currentEventType).toBe('done');

      const chunk2 = 'data: {"complete":true}\n\n';
      const { events: events2 } = parseSSEChunk(chunk2, state1);
      expect(events2).toHaveLength(1);
      expect(events2[0].eventType).toBe('done');
    });
  });

  describe('error handling', () => {
    it('ignores unparseable JSON data', () => {
      const chunk = 'data: not-json\n\n';
      const { events } = parseSSEChunk(chunk, freshState());
      expect(events).toHaveLength(0);
    });

    it('ignores empty data lines', () => {
      const chunk = 'data: \n\n';
      const { events } = parseSSEChunk(chunk, freshState());
      // Empty string is not valid JSON, so it's ignored
      expect(events).toHaveLength(0);
    });
  });

  describe('tool use events', () => {
    it('parses tool_use_start event', () => {
      const chunk = 'event: tool_use_start\ndata: {"tool":{"name":"web_search","input":{}}}\n\n';
      const { events } = parseSSEChunk(chunk, freshState());
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('tool_use_start');
      expect((events[0].data.tool as { name: string }).name).toBe('web_search');
    });

    it('parses tool_use_end event', () => {
      const chunk = 'event: tool_use_end\ndata: {"tool":{"name":"recall","result":"found 3 memories"}}\n\n';
      const { events } = parseSSEChunk(chunk, freshState());
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('tool_use_end');
    });
  });

  describe('thinking events', () => {
    it('parses thinking content delta', () => {
      const chunk = 'data: {"thinking":"Let me consider..."}\n\n';
      const { events } = parseSSEChunk(chunk, freshState());
      expect(events).toHaveLength(1);
      expect(events[0].data.thinking).toBe('Let me consider...');
    });

    it('parses thinking_end event type', () => {
      const chunk = 'event: thinking_end\ndata: {"complete":true}\n\n';
      const { events } = parseSSEChunk(chunk, freshState());
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('thinking_end');
    });
  });

  describe('done event', () => {
    it('parses done event', () => {
      const chunk = 'event: done\ndata: {"content":"full response text"}\n\n';
      const { events } = parseSSEChunk(chunk, freshState());
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('done');
    });
  });

  describe('error in data', () => {
    it('parses error object in data', () => {
      const chunk = 'data: {"error":"Rate limit exceeded"}\n\n';
      const { events } = parseSSEChunk(chunk, freshState());
      expect(events).toHaveLength(1);
      expect(events[0].data.error).toBe('Rate limit exceeded');
    });
  });

  describe('event type reset', () => {
    it('resets event type after each data line', () => {
      const chunk = [
        'event: tool_use_start',
        'data: {"tool":{"name":"search"}}',
        '',
        'data: {"content":"hello"}',
        '',
      ].join('\n');
      const { events } = parseSSEChunk(chunk, freshState());
      expect(events[0].eventType).toBe('tool_use_start');
      expect(events[1].eventType).toBe(''); // reset
    });
  });
});
