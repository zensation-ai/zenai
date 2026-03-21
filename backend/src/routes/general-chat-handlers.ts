/**
 * General Chat Route Handlers — Re-export Barrel
 *
 * Split into two sub-modules for maintainability (Phase 122):
 * - chat-session-handlers.ts: session CRUD (create, list, get, delete)
 * - chat-message-handlers.ts: messaging (send, stream, vision, edit, regenerate, versions, quick chat)
 *
 * The main general-chat.ts file imports all handlers from this barrel.
 *
 * @module routes/general-chat-handlers
 */

// Re-export session handlers
export {
  handleCreateSession,
  handleListSessions,
  handleGetSession,
  handleDeleteSession,
} from './chat-session-handlers';

// Re-export message handlers
export {
  buildMetadataResponse,
  handleSendMessage,
  handleQuickChat,
  handleVisionMessage,
  handleGetThinkingModes,
  handleGetMessageVersions,
  handleEditMessage,
  handleRegenerateMessage,
  handleStreamMessage,
} from './chat-message-handlers';
