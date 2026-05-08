/**
 * AG-UI Cognitive Event Emitter
 * Provides fire-and-forget event emission for cognitive services.
 * Services call these helpers when agui=true is set on the request.
 *
 * @module services/agui/cognitive-emitter
 */

import { Response } from 'express';
import { AgUIEventAdapter } from './event-adapter';
import type { ZenAICustomType } from './protocol';

/**
 * Emit an AG-UI custom event to the SSE response.
 * Safe to call even when agui is not enabled (no-ops).
 */
export function emitCognitiveEvent(
  res: Response | null,
  adapter: AgUIEventAdapter | null,
  customType: ZenAICustomType,
  payload: Record<string, unknown>
): void {
  if (!res || !adapter) return;
  try {
    res.write(adapter.custom(customType, payload));
  } catch {
    // Stream may be closed — ignore
  }
}

/**
 * Emit a hypothesis card from Curiosity Engine
 */
export function emitHypothesisCard(
  res: Response | null,
  adapter: AgUIEventAdapter | null,
  hypothesis: { id: string; topic: string; statement: string; confidence: number; suggestedAction: string }
): void {
  emitCognitiveEvent(res, adapter, 'hypothesis_card', hypothesis);
}

/**
 * Emit predicted intent from Prediction Engine
 */
export function emitPredictedIntent(
  res: Response | null,
  adapter: AgUIEventAdapter | null,
  prediction: { intent: string; confidence: number; basis: string }
): void {
  emitCognitiveEvent(res, adapter, 'predicted_intent', prediction);
}

/**
 * Emit FSRS review prompt inline
 */
export function emitReviewPrompt(
  res: Response | null,
  adapter: AgUIEventAdapter | null,
  review: { factId: string; question: string; lastReview: string; difficulty: number }
): void {
  emitCognitiveEvent(res, adapter, 'review_prompt', review);
}

/**
 * Emit RAG pipeline status snapshot
 */
export function emitPipelineStatus(
  res: Response | null,
  adapter: AgUIEventAdapter | null,
  status: { step: string; progress: number; totalSteps: number; strategy: string }
): void {
  emitCognitiveEvent(res, adapter, 'pipeline_status', status);
}

/**
 * Emit approval request for governance
 */
export function emitApprovalRequest(
  res: Response | null,
  adapter: AgUIEventAdapter | null,
  request: { actionId: string; type: string; description: string; riskLevel: string }
): void {
  emitCognitiveEvent(res, adapter, 'approval_request', request);
}
