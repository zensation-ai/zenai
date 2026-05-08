/**
 * Unit Tests for AG-UI Protocol Layer
 *
 * Tests AG-UI event adapter, state manager, and protocol serialization.
 *
 * @module tests/unit/services/agui-adapter
 */

import { AgUIEventAdapter } from '../../../services/agui/event-adapter';
import { AgUIStateManager } from '../../../services/agui/state-manager';
import { serializeAgUIEvent, type AnyAgUIEvent } from '../../../services/agui/protocol';

// ============================================
// AgUIEventAdapter Tests
// ============================================

describe('AgUIEventAdapter', () => {
  let adapter: AgUIEventAdapter;

  beforeEach(() => {
    adapter = new AgUIEventAdapter('test-session-123');
  });

  it('generates valid RUN_STARTED event', () => {
    const result = adapter.runStarted('thread-1', { thinkingTier: 'high' });
    expect(result).toContain('event: agui');
    expect(result).toContain('"type":"RUN_STARTED"');
    expect(result).toContain('"threadId":"thread-1"');
    expect(result).toContain('"thinkingTier":"high"');

    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('RUN_STARTED');
    expect(parsed.runId).toBeDefined();
    expect(parsed.timestamp).toBeGreaterThan(0);
    expect(parsed.data.threadId).toBe('thread-1');
  });

  it('generates valid RUN_FINISHED event with token counts', () => {
    const result = adapter.runFinished({ inputTokens: 100, outputTokens: 200, thinkingTokens: 50 });
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('RUN_FINISHED');
    expect(parsed.data.inputTokens).toBe(100);
    expect(parsed.data.outputTokens).toBe(200);
    expect(parsed.data.thinkingTokens).toBe(50);
  });

  it('generates RUN_FINISHED with empty data when no tokens provided', () => {
    const result = adapter.runFinished();
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('RUN_FINISHED');
    expect(parsed.data).toEqual({});
  });

  it('generates valid RUN_ERROR event', () => {
    const result = adapter.runError('Something went wrong', 'ERR_TIMEOUT');
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('RUN_ERROR');
    expect(parsed.data.message).toBe('Something went wrong');
    expect(parsed.data.code).toBe('ERR_TIMEOUT');
  });

  it('generates TEXT_MESSAGE_START for assistant role', () => {
    const result = adapter.textMessageStart('assistant');
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('TEXT_MESSAGE_START');
    expect(parsed.data.role).toBe('assistant');
    expect(parsed.data.messageId).toBeDefined();
  });

  it('generates TEXT_MESSAGE_START for thinking role', () => {
    const result = adapter.textMessageStart('thinking');
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('TEXT_MESSAGE_START');
    expect(parsed.data.role).toBe('thinking');
  });

  it('generates TEXT_MESSAGE_CONTENT events', () => {
    const result = adapter.textMessageContent('Hello, world!');
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('TEXT_MESSAGE_CONTENT');
    expect(parsed.data.content).toBe('Hello, world!');
  });

  it('generates TEXT_MESSAGE_END event with matching messageId', () => {
    // Start a message to set messageId
    adapter.textMessageStart('assistant');
    const result = adapter.textMessageEnd();
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('TEXT_MESSAGE_END');
    expect(parsed.data.messageId).toBeDefined();
  });

  it('generates TOOL_CALL_START event', () => {
    const result = adapter.toolCallStart('web_search', { query: 'test' });
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('TOOL_CALL_START');
    expect(parsed.data.toolName).toBe('web_search');
    expect(parsed.data.toolCallId).toBeDefined();
    expect(parsed.data.input).toEqual({ query: 'test' });
  });

  it('generates TOOL_CALL_END event', () => {
    const result = adapter.toolCallEnd('web_search', 'Search results here');
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('TOOL_CALL_END');
    expect(parsed.data.toolName).toBe('web_search');
    expect(parsed.data.result).toBe('Search results here');
  });

  it('generates STATE_SNAPSHOT event', () => {
    const result = adapter.stateSnapshot('pipeline_status', { steps: { rag: 'complete' } });
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('STATE_SNAPSHOT');
    expect(parsed.data.stateType).toBe('pipeline_status');
    expect(parsed.data.state).toEqual({ steps: { rag: 'complete' } });
  });

  it('generates STATE_DELTA event', () => {
    const result = adapter.stateDelta('predicted_intent', { intent: 'search' });
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('STATE_DELTA');
    expect(parsed.data.stateType).toBe('predicted_intent');
    expect(parsed.data.delta).toEqual({ intent: 'search' });
  });

  it('generates CUSTOM events for hypothesis_card', () => {
    const result = adapter.custom('hypothesis_card', {
      hypothesis: 'User needs search',
      confidence: 0.85,
    });
    const parsed = parseSSEData(result);
    expect(parsed.type).toBe('CUSTOM');
    expect(parsed.data.customType).toBe('hypothesis_card');
    expect(parsed.data.payload.hypothesis).toBe('User needs search');
    expect(parsed.data.payload.confidence).toBe(0.85);
  });

  it('generates CUSTOM events for approval_request', () => {
    const result = adapter.custom('approval_request', {
      action: 'delete_memory',
      description: 'Delete old memories',
      risk: 'medium',
    });
    const parsed = parseSSEData(result);
    expect(parsed.data.customType).toBe('approval_request');
    expect(parsed.data.payload.action).toBe('delete_memory');
  });

  it('generates CUSTOM events for cognitive_insight', () => {
    const result = adapter.custom('cognitive_insight', {
      insight: 'Pattern detected',
      source: 'curiosity_engine',
    });
    const parsed = parseSSEData(result);
    expect(parsed.data.customType).toBe('cognitive_insight');
  });

  it('maintains consistent runId across events', () => {
    const started = parseSSEData(adapter.runStarted('t1'));
    const content = parseSSEData(adapter.textMessageContent('hi'));
    const finished = parseSSEData(adapter.runFinished());

    expect(started.runId).toBe(content.runId);
    expect(content.runId).toBe(finished.runId);
  });

  it('exposes runId via getRunId()', () => {
    const runId = adapter.getRunId();
    expect(runId).toBeDefined();
    expect(typeof runId).toBe('string');
    expect(runId.length).toBeGreaterThan(0);
  });
});

// ============================================
// serializeAgUIEvent Tests
// ============================================

describe('serializeAgUIEvent', () => {
  it('produces correct SSE format with agui event name', () => {
    const event: AnyAgUIEvent = {
      type: 'RUN_STARTED',
      timestamp: 1234567890,
      runId: 'run-1',
      data: { threadId: 'thread-1' },
    };

    const result = serializeAgUIEvent(event);
    expect(result).toBe(`event: agui\ndata: ${JSON.stringify(event)}\n\n`);
  });

  it('serializes all event types correctly', () => {
    const types = [
      'RUN_STARTED', 'RUN_FINISHED', 'RUN_ERROR',
      'TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END',
      'TOOL_CALL_START', 'TOOL_CALL_END',
      'STATE_SNAPSHOT', 'STATE_DELTA', 'CUSTOM',
    ];

    for (const type of types) {
      const event = {
        type,
        timestamp: Date.now(),
        runId: 'r1',
        data: {},
      } as unknown as AnyAgUIEvent;

      const result = serializeAgUIEvent(event);
      expect(result).toContain('event: agui\n');
      expect(result).toContain(`"type":"${type}"`);
      expect(result.endsWith('\n\n')).toBe(true);
    }
  });
});

// ============================================
// AgUIStateManager Tests
// ============================================

describe('AgUIStateManager', () => {
  let manager: AgUIStateManager;

  beforeEach(() => {
    manager = new AgUIStateManager();
  });

  it('returns undefined for unset state', () => {
    expect(manager.getState('nonexistent')).toBeUndefined();
  });

  it('tracks state updates and returns snapshot', () => {
    const { snapshot } = manager.updateState('test', { key1: 'value1', key2: 42 });
    expect(snapshot).toEqual({ key1: 'value1', key2: 42 });
    expect(manager.getState('test')).toEqual({ key1: 'value1', key2: 42 });
  });

  it('computes correct deltas on partial update', () => {
    manager.updateState('test', { key1: 'value1', key2: 42 });
    const { snapshot, delta } = manager.updateState('test', { key2: 99, key3: 'new' });

    expect(delta).toEqual({ key2: 99, key3: 'new' });
    expect(snapshot).toEqual({ key1: 'value1', key2: 99, key3: 'new' });
  });

  it('returns empty delta when no values changed', () => {
    manager.updateState('test', { key1: 'value1' });
    const { delta } = manager.updateState('test', { key1: 'value1' });
    expect(delta).toEqual({});
  });

  it('clears state', () => {
    manager.updateState('test', { key1: 'value1' });
    manager.clearState('test');
    expect(manager.getState('test')).toBeUndefined();
  });

  it('tracks pipeline step updates', () => {
    const pipeline = manager.updatePipelineStep('rag', 'running');
    expect(pipeline.steps).toBeDefined();
    expect((pipeline.steps as Record<string, { status: string }>).rag.status).toBe('running');
  });

  it('updates pipeline steps independently', () => {
    manager.updatePipelineStep('rag', 'complete');
    manager.updatePipelineStep('thinking', 'running');
    const pipeline = manager.updatePipelineStep('tools', 'pending');

    const steps = pipeline.steps as Record<string, { status: string }>;
    expect(steps.rag.status).toBe('complete');
    expect(steps.thinking.status).toBe('running');
    expect(steps.tools.status).toBe('pending');
  });

  it('includes details and updatedAt in pipeline steps', () => {
    const before = Date.now();
    const pipeline = manager.updatePipelineStep('rag', 'complete', { documentsFound: 5 });
    const step = (pipeline.steps as Record<string, Record<string, unknown>>).rag;

    expect(step.status).toBe('complete');
    expect(step.documentsFound).toBe(5);
    expect(step.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('manages multiple state types independently', () => {
    manager.updateState('pipeline_status', { active: true });
    manager.updateState('predicted_intent', { intent: 'search' });

    expect(manager.getState('pipeline_status')).toEqual({ active: true });
    expect(manager.getState('predicted_intent')).toEqual({ intent: 'search' });
  });
});

// ============================================
// Test Helpers
// ============================================

/** Parse the JSON data from an SSE-formatted string */
function parseSSEData(sse: string): Record<string, any> {
  const dataLine = sse.split('\n').find(line => line.startsWith('data: '));
  if (!dataLine) throw new Error('No data line found in SSE string');
  return JSON.parse(dataLine.slice(6));
}
