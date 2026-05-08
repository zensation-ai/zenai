/**
 * useAgUIState - AG-UI Protocol State Management
 *
 * Manages AG-UI state snapshots, deltas, and custom cards
 * received from the SSE stream. Provides a reactive interface
 * for rendering AG-UI components alongside chat content.
 *
 * @module hooks/useAgUIState
 */

import { useState, useCallback } from 'react';

export interface AgUICard {
  id: string;
  type: 'hypothesis_card' | 'approval_request' | 'cognitive_insight' | 'pipeline_status' | 'fsrs_review' | 'predicted_intent';
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface AgUIStateHook {
  cards: AgUICard[];
  pipelineStatus: Record<string, unknown> | null;
  predictedIntent: Record<string, unknown> | null;
  handleAgUIEvent: (event: AgUIEventData) => void;
  clearCards: () => void;
}

/** Shape of a parsed AG-UI event from SSE */
export interface AgUIEventData {
  type: string;
  timestamp?: number;
  runId?: string;
  data?: {
    stateType?: string;
    state?: Record<string, unknown>;
    delta?: Record<string, unknown>;
    customType?: string;
    payload?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export function useAgUIState(): AgUIStateHook {
  const [cards, setCards] = useState<AgUICard[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState<Record<string, unknown> | null>(null);
  const [predictedIntent, setPredictedIntent] = useState<Record<string, unknown> | null>(null);

  const handleAgUIEvent = useCallback((event: AgUIEventData) => {
    switch (event.type) {
      case 'STATE_SNAPSHOT':
        if (event.data?.stateType === 'pipeline_status' && event.data.state) {
          setPipelineStatus(event.data.state);
        }
        break;
      case 'STATE_DELTA':
        if (event.data?.stateType === 'predicted_intent' && event.data.delta) {
          setPredictedIntent(prev => ({ ...prev, ...event.data!.delta }));
          setCards(prev => [...prev.filter(c => c.type !== 'predicted_intent'), {
            id: `predicted_intent-${Date.now()}`,
            type: 'predicted_intent' as AgUICard['type'],
            payload: event.data!.delta as Record<string, unknown>,
            timestamp: event.timestamp || Date.now(),
          }]);
        }
        break;
      case 'CUSTOM':
        if (event.data?.customType && event.data.payload) {
          setCards(prev => [...prev, {
            id: `${event.data!.customType}-${Date.now()}`,
            type: event.data!.customType as AgUICard['type'],
            payload: event.data!.payload as Record<string, unknown>,
            timestamp: event.timestamp || Date.now(),
          }]);
        }
        break;
    }
  }, []);

  const clearCards = useCallback(() => {
    setCards([]);
    setPipelineStatus(null);
    setPredictedIntent(null);
  }, []);

  return { cards, pipelineStatus, predictedIntent, handleAgUIEvent, clearCards };
}
