/**
 * AG-UI Event Emission from Chat Streaming
 *
 * Tests that AgUIEventAdapter correctly serializes AG-UI protocol events
 * for embedding into SSE streams during chat.
 */

import { AgUIEventAdapter } from '../../../services/agui/event-adapter';

describe('AG-UI Event Adapter', () => {
  it('serializes CUSTOM event with correct SSE format', () => {
    const adapter = new AgUIEventAdapter('test-session');
    const event = adapter.custom('hypothesis_card', {
      hypothesis: 'Users prefer dark mode',
      confidence: 0.82,
    });
    expect(event).toContain('event: agui');
    expect(event).toContain('"type":"CUSTOM"');
    expect(event).toContain('"customType":"hypothesis_card"');
    expect(event).toContain('"confidence":0.82');
  });

  it('serializes STATE_SNAPSHOT for pipeline status', () => {
    const adapter = new AgUIEventAdapter('test-session');
    const event = adapter.stateSnapshot('pipeline_status', { stage: 'reranking' });
    expect(event).toContain('event: agui');
    expect(event).toContain('"type":"STATE_SNAPSHOT"');
    expect(event).toContain('"stateType":"pipeline_status"');
  });

  it('serializes RUN_STARTED with threadId', () => {
    const adapter = new AgUIEventAdapter('test-session');
    const event = adapter.runStarted('thread-123');
    expect(event).toContain('event: agui');
    expect(event).toContain('"type":"RUN_STARTED"');
    expect(event).toContain('"threadId":"thread-123"');
  });

  it('serializes RUN_FINISHED', () => {
    const adapter = new AgUIEventAdapter('test-session');
    const event = adapter.runFinished();
    expect(event).toContain('event: agui');
    expect(event).toContain('"type":"RUN_FINISHED"');
  });

  it('serializes RUN_FINISHED with token counts', () => {
    const adapter = new AgUIEventAdapter('test-session');
    const event = adapter.runFinished({ inputTokens: 100, outputTokens: 50, thinkingTokens: 200 });
    expect(event).toContain('"inputTokens":100');
    expect(event).toContain('"outputTokens":50');
    expect(event).toContain('"thinkingTokens":200');
  });

  it('maintains consistent runId across events', () => {
    const adapter = new AgUIEventAdapter('test-session');
    const runId = adapter.getRunId();
    const start = adapter.runStarted('thread-1');
    const custom = adapter.custom('pipeline_status', { step: 'rag' });
    const end = adapter.runFinished();
    expect(start).toContain(`"runId":"${runId}"`);
    expect(custom).toContain(`"runId":"${runId}"`);
    expect(end).toContain(`"runId":"${runId}"`);
  });
});
