import { renderHook, act } from '@testing-library/react';
import { useAgUIState } from '../../../hooks/useAgUIState';

describe('AG-UI integration', () => {
  it('processes CUSTOM hypothesis_card event into cards array', () => {
    const { result } = renderHook(() => useAgUIState());
    act(() => {
      result.current.handleAgUIEvent({
        type: 'CUSTOM',
        timestamp: Date.now(),
        runId: 'test-run',
        data: {
          customType: 'hypothesis_card',
          payload: { hypothesis: 'Test hypothesis', confidence: 0.85, source: 'curiosity' },
        },
      });
    });
    expect(result.current.cards).toHaveLength(1);
    expect(result.current.cards[0].type).toBe('hypothesis_card');
    expect(result.current.cards[0].payload).toEqual({
      hypothesis: 'Test hypothesis',
      confidence: 0.85,
      source: 'curiosity',
    });
  });

  it('processes STATE_SNAPSHOT into pipelineStatus', () => {
    const { result } = renderHook(() => useAgUIState());
    act(() => {
      result.current.handleAgUIEvent({
        type: 'STATE_SNAPSHOT',
        timestamp: Date.now(),
        runId: 'test-run',
        data: {
          stateType: 'pipeline_status',
          state: { stage: 'retrieval', progress: 0.5 },
        },
      });
    });
    expect(result.current.pipelineStatus).toEqual({ stage: 'retrieval', progress: 0.5 });
  });

  it('processes STATE_DELTA predicted_intent into predictedIntent', () => {
    const { result } = renderHook(() => useAgUIState());
    act(() => {
      result.current.handleAgUIEvent({
        type: 'STATE_DELTA',
        timestamp: Date.now(),
        runId: 'test-run',
        data: {
          stateType: 'predicted_intent',
          delta: { intent: 'search', confidence: 0.9 },
        },
      });
    });
    expect(result.current.predictedIntent).toEqual({ intent: 'search', confidence: 0.9 });
  });

  it('clearCards resets all state', () => {
    const { result } = renderHook(() => useAgUIState());
    // Add a card and pipeline status
    act(() => {
      result.current.handleAgUIEvent({
        type: 'CUSTOM',
        data: { customType: 'cognitive_insight', payload: { insight: 'test' } },
      });
      result.current.handleAgUIEvent({
        type: 'STATE_SNAPSHOT',
        data: { stateType: 'pipeline_status', state: { stage: 'done' } },
      });
    });
    expect(result.current.cards).toHaveLength(1);
    expect(result.current.pipelineStatus).not.toBeNull();

    act(() => {
      result.current.clearCards();
    });
    expect(result.current.cards).toHaveLength(0);
    expect(result.current.pipelineStatus).toBeNull();
    expect(result.current.predictedIntent).toBeNull();
  });

  it('accumulates multiple CUSTOM cards', () => {
    const { result } = renderHook(() => useAgUIState());
    act(() => {
      result.current.handleAgUIEvent({
        type: 'CUSTOM',
        data: { customType: 'hypothesis_card', payload: { hypothesis: 'H1' } },
      });
      result.current.handleAgUIEvent({
        type: 'CUSTOM',
        data: { customType: 'approval_request', payload: { action: 'delete', risk: 'high' } },
      });
    });
    expect(result.current.cards).toHaveLength(2);
    expect(result.current.cards[0].type).toBe('hypothesis_card');
    expect(result.current.cards[1].type).toBe('approval_request');
  });

  it('ignores events with missing data fields', () => {
    const { result } = renderHook(() => useAgUIState());
    act(() => {
      // CUSTOM without payload
      result.current.handleAgUIEvent({ type: 'CUSTOM', data: { customType: 'hypothesis_card' } });
      // STATE_SNAPSHOT without state
      result.current.handleAgUIEvent({ type: 'STATE_SNAPSHOT', data: { stateType: 'pipeline_status' } });
      // Unknown event type
      result.current.handleAgUIEvent({ type: 'UNKNOWN', data: {} });
    });
    expect(result.current.cards).toHaveLength(0);
    expect(result.current.pipelineStatus).toBeNull();
  });
});
