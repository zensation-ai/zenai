/**
 * General Chat Service
 *
 * Provides a general-purpose chat interface using Claude AI.
 * Users can ask questions and get direct answers, similar to ChatGPT.
 */

// Sessions: Types, session CRUD, message CRUD
export {
  type ChatSession,
  type ChatMessage,
  type ChatSessionWithMessages,
  type RAGQualityMetrics,
  type ResponseMetadata,
  type EnhancedResponse,
  type SendMessageResult,
  type VisionResponseMetadata,
  type VisionMessageResult,
  createSession,
  getSession,
  getSessions,
  deleteSession,
  addMessage,
  updateSessionTitle,
} from './chat-sessions';

// Messages: AI response generation, RAG, tool execution
export {
  GENERAL_CHAT_SYSTEM_PROMPT,
  generateResponse,
  generateEnhancedResponse,
  sendMessage,
} from './chat-messages';

// Vision: Vision-enhanced message processing
export {
  sendMessageWithVision,
} from './chat-vision';
