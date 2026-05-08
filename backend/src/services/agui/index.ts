/**
 * AG-UI Protocol Module
 *
 * Provides AG-UI (Agent-User Interaction Protocol) support for ZenAI.
 * This is a parallel event layer alongside existing SSE events.
 *
 * @module services/agui
 */

export { AgUIEventAdapter } from './event-adapter';
export { AgUIStateManager } from './state-manager';
export {
  serializeAgUIEvent,
  type AgUIEventType,
  type AgUIEvent,
  type AgUIRunStarted,
  type AgUIRunFinished,
  type AgUIRunError,
  type AgUITextMessageStart,
  type AgUITextMessageContent,
  type AgUITextMessageEnd,
  type AgUIToolCallStart,
  type AgUIToolCallEnd,
  type AgUIStateSnapshot,
  type AgUIStateDelta,
  type AgUICustomEvent,
  type ZenAICustomType,
  type AnyAgUIEvent,
} from './protocol';
export {
  emitCognitiveEvent,
  emitHypothesisCard,
  emitPredictedIntent,
  emitReviewPrompt,
  emitPipelineStatus,
  emitApprovalRequest,
} from './cognitive-emitter';
