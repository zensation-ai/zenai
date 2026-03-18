/**
 * GeneralChat Types
 *
 * Shared interfaces for the GeneralChat component family.
 */

import type { AIContext } from '../ContextSwitcher';

export interface ChatMessageMetadata {
  rag_confidence?: number;
  rag_strategy?: string;
  tool_count?: number;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** Optional metadata from the AI response (RAG confidence, strategy, etc.) */
  metadata?: ChatMessageMetadata;
  /** Tool calls made during this message (persisted for history rendering) */
  tool_calls?: Array<{ name: string; duration_ms: number; status: 'success' | 'error' }>;
  /** Extended thinking content from the AI (persisted for history rendering) */
  thinking_content?: string;
}

// ChatSession type for API responses (exported for potential external use)
export interface ChatSession {
  id: string;
  context: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneralChatProps {
  context: AIContext;
  isCompact?: boolean;
  assistantMode?: boolean;
  fullPage?: boolean;
  /** Load a specific session by ID (from session sidebar) */
  initialSessionId?: string | null;
  /** Callback when session changes (new session created or loaded) */
  onSessionChange?: (sessionId: string | null) => void;
}
