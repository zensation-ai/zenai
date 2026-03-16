/**
 * useStreamingChat - SSE Streaming + React Query Integration
 *
 * Custom hook that manages SSE streaming for chat messages,
 * integrated with React Query for cache management.
 *
 * Features:
 * - useMutation for sending messages
 * - Optimistic user message insertion into query cache
 * - SSE streaming with RAF-throttled content updates
 * - Tool activity tracking (Phase 76)
 * - AbortController-based cancel support
 * - Query invalidation on stream completion
 * - Rollback on error
 *
 * @module hooks/useStreamingChat
 */

import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/query-keys';
import { safeLocalStorage } from '../utils/storage';
import { logError } from '../utils/errors';
import type { ChatMessage } from '../components/GeneralChat/types';
import type { AIContext } from '../components/ContextSwitcher';

// ============================================
// Types
// ============================================

export interface ToolResult {
  name: string;
  result: string;
}

export interface SendMessageParams {
  message: string;
  sessionId: string;
  thinkingMode?: string;
  assistantMode?: boolean;
}

export interface UseStreamingChatOptions {
  context: AIContext;
  /** Called when a tool_use_end event triggers a navigation action */
  onNavigate?: (page: string) => void;
  /** Called when the stream completes successfully */
  onStreamComplete?: (sessionId: string) => void;
}

export interface UseStreamingChatReturn {
  /** Send a message and start SSE streaming */
  sendMessage: (params: SendMessageParams) => void;
  /** Whether a stream is currently in progress */
  isStreaming: boolean;
  /** Accumulated response content from the stream */
  streamContent: string;
  /** Accumulated thinking/reasoning content */
  thinkingContent: string;
  /** Name of the currently executing tool (null when idle) */
  activeToolName: string | null;
  /** List of completed tool results (last 5) */
  toolResults: ToolResult[];
  /** Abort the current stream */
  cancelStream: () => void;
  /** Whether the mutation is pending (includes session creation + streaming) */
  isSending: boolean;
}

// ============================================
// SSE Line Parser
// ============================================

interface SSEParseState {
  currentEventType: string;
  buffer: string;
}

interface SSEEvent {
  eventType: string;
  data: Record<string, unknown>;
}

/**
 * Parse raw SSE text into structured events.
 * Returns parsed events and any remaining incomplete buffer.
 */
function parseSSEChunk(
  chunk: string,
  state: SSEParseState
): { events: SSEEvent[]; state: SSEParseState } {
  const events: SSEEvent[] = [];
  let { currentEventType, buffer } = state;

  buffer += chunk;
  const lines = buffer.split('\n');
  // Last element may be incomplete — keep it in buffer
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEventType = line.slice(7).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      const dataStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5);
      try {
        const data = JSON.parse(dataStr) as Record<string, unknown>;
        events.push({ eventType: currentEventType, data });
      } catch {
        // Ignore unparseable data lines (partial JSON, etc.)
      }
      currentEventType = '';
    }
  }

  return { events, state: { currentEventType, buffer } };
}

// ============================================
// Hook
// ============================================

export function useStreamingChat(options: UseStreamingChatOptions): UseStreamingChatReturn {
  const { context, onNavigate, onStreamComplete } = options;
  const queryClient = useQueryClient();

  // Streaming display state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);

  // RAF throttle refs
  const streamingRafRef = useRef<number | null>(null);
  const pendingStreamContentRef = useRef('');

  // Abort support
  const streamAbortRef = useRef<AbortController | null>(null);

  /**
   * Clean up RAF and reset all streaming state
   */
  const resetStreamingState = useCallback(() => {
    if (streamingRafRef.current) {
      cancelAnimationFrame(streamingRafRef.current);
      streamingRafRef.current = null;
    }
    pendingStreamContentRef.current = '';
    setIsStreaming(false);
    setStreamContent('');
    setThinkingContent('');
    setActiveToolName(null);
    setToolResults([]);
  }, []);

  /**
   * Cancel an in-progress stream
   */
  const cancelStream = useCallback(() => {
    streamAbortRef.current?.abort();
    resetStreamingState();
  }, [resetStreamingState]);

  // ---- Core mutation ----

  const mutation = useMutation<
    ChatMessage | null, // return: final assistant message (or null if empty)
    Error,
    SendMessageParams,
    { tempUserMessage: ChatMessage; previousMessages: ChatMessage[] | undefined }
  >({
    mutationFn: async (params) => {
      const { message, sessionId, thinkingMode, assistantMode } = params;

      // Reset streaming state for new request
      setIsStreaming(true);
      setStreamContent('');
      setThinkingContent('');
      setActiveToolName(null);
      setToolResults([]);

      // Set up abort
      const abortController = new AbortController();
      streamAbortRef.current = abortController;

      // Timeout: abort if no response within 30s
      const streamTimeout = setTimeout(() => {
        abortController.abort();
      }, 30_000);

      try {
        // Build auth header
        const baseUrl = import.meta.env.VITE_API_URL ?? '';
        const jwtToken = safeLocalStorage('get', 'zenai_access_token');
        const apiKey = safeLocalStorage('get', 'apiKey') ?? import.meta.env.VITE_API_KEY;
        const authToken = jwtToken || apiKey;

        const response = await fetch(
          `${baseUrl}/api/chat/sessions/${sessionId}/messages/stream`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken && { Authorization: `Bearer ${authToken}` }),
            },
            body: JSON.stringify({
              message,
              thinking_mode: thinkingMode ?? 'assist',
              ...(assistantMode && { assistantMode: true }),
            }),
            signal: abortController.signal,
          }
        );

        if (!response.ok) {
          const statusMessages: Record<number, string> = {
            401: 'Authentifizierung fehlgeschlagen. Bitte Seite neu laden.',
            403: 'Zugriff verweigert.',
            429: 'Zu viele Anfragen. Bitte kurz warten.',
            500: 'Serverfehler. Bitte erneut versuchen.',
            502: 'Server nicht erreichbar. Bitte spaeter versuchen.',
            503: 'Server ueberlastet. Bitte spaeter versuchen.',
          };
          throw new Error(statusMessages[response.status] || `Serverfehler (${response.status})`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Stream konnte nicht geoeffnet werden.');
        }

        const decoder = new TextDecoder();
        let accumulatedContent = '';
        let sseState: SSEParseState = { currentEventType: '', buffer: '' };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const { events, state: newState } = parseSSEChunk(chunk, sseState);
            sseState = newState;

            for (const { eventType, data } of events) {
              // Skip non-delta events that would duplicate content
              if (eventType === 'done' || eventType === 'compaction_info' || eventType === 'thinking_end') {
                continue;
              }

              // Tool use events
              if (eventType === 'tool_use_start' && data.tool) {
                const tool = data.tool as { name?: string };
                setActiveToolName(tool.name ?? null);
                continue;
              }
              if (eventType === 'tool_use_end' && data.tool) {
                setActiveToolName(null);
                const tool = data.tool as { name?: string; result?: string };
                const toolName = tool.name ?? 'unknown';
                const toolResult = tool.result ?? '';
                setToolResults(prev => [...prev.slice(-4), { name: toolName, result: toolResult }]);

                // Handle navigation actions from tools
                if (onNavigate) {
                  try {
                    const parsed = JSON.parse(toolResult) as { action?: string; page?: string };
                    if (parsed.action === 'navigate' && parsed.page) {
                      onNavigate(parsed.page);
                    }
                  } catch { /* not JSON or no navigation */ }
                }
                continue;
              }

              // Error in data
              if (data.error) {
                throw new Error(data.error as string);
              }

              // Content delta
              if (data.content !== undefined) {
                accumulatedContent += data.content as string;
                // RAF-throttled DOM update
                pendingStreamContentRef.current = accumulatedContent;
                if (!streamingRafRef.current) {
                  streamingRafRef.current = requestAnimationFrame(() => {
                    setStreamContent(pendingStreamContentRef.current);
                    streamingRafRef.current = null;
                  });
                }
              }

              // Thinking delta
              if (data.thinking !== undefined) {
                setThinkingContent(prev => prev + (data.thinking as string));
              }
            }
          }
        } catch (readerErr) {
          // AbortError should propagate; other reader errors use partial content
          if (readerErr instanceof Error && readerErr.name === 'AbortError') throw readerErr;
          console.warn('Stream reader error, using partial content:', readerErr);
        } finally {
          try { reader.releaseLock(); } catch { /* already released */ }
        }

        // Return final assistant message (or null if stream was empty)
        if (!accumulatedContent.trim()) return null;

        return {
          id: `assistant-${Date.now()}`,
          sessionId,
          role: 'assistant' as const,
          content: accumulatedContent,
          createdAt: new Date().toISOString(),
        };
      } finally {
        clearTimeout(streamTimeout);
      }
    },

    // ---- Optimistic update: insert user message into cache ----
    onMutate: async (params) => {
      const { message, sessionId } = params;
      const messagesKey = queryKeys.chat.messages(context, sessionId);

      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: messagesKey });

      // Snapshot previous messages for rollback
      const previousMessages = queryClient.getQueryData<ChatMessage[]>(messagesKey);

      // Create optimistic user message
      const tempUserMessage: ChatMessage = {
        id: `temp-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sessionId,
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
      };

      // Insert into cache
      queryClient.setQueryData<ChatMessage[]>(messagesKey, (old) =>
        old ? [...old, tempUserMessage] : [tempUserMessage]
      );

      return { tempUserMessage, previousMessages };
    },

    // ---- Success: replace temp message + add assistant response ----
    onSuccess: (assistantMessage, params, ctx) => {
      if (!ctx) return;
      const { sessionId } = params;
      const messagesKey = queryKeys.chat.messages(context, sessionId);

      // Replace temp user message with a stable ID and append assistant message
      queryClient.setQueryData<ChatMessage[]>(messagesKey, (old) => {
        if (!old) return old;
        const filtered = old.filter(m => m.id !== ctx.tempUserMessage.id);
        const realUserMessage: ChatMessage = {
          ...ctx.tempUserMessage,
          id: `user-${Date.now()}`,
        };
        if (assistantMessage) {
          return [...filtered, realUserMessage, assistantMessage];
        }
        return [...filtered, realUserMessage];
      });

      // Invalidate to get authoritative server state in background
      queryClient.invalidateQueries({ queryKey: messagesKey });
      // Also invalidate session list (title/updatedAt may have changed)
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.sessions(context) });

      onStreamComplete?.(sessionId);
    },

    // ---- Error: rollback optimistic update ----
    onError: (error, params, ctx) => {
      if (error.name === 'AbortError') return;

      if (ctx?.previousMessages !== undefined) {
        const messagesKey = queryKeys.chat.messages(context, params.sessionId);
        queryClient.setQueryData(messagesKey, ctx.previousMessages);
      }

      logError('useStreamingChat', error);
    },

    // ---- Always: reset streaming state ----
    onSettled: () => {
      resetStreamingState();
    },
  });

  // ---- Public API ----

  const sendMessage = useCallback(
    (params: SendMessageParams) => {
      // Prevent double-send
      if (mutation.isPending) return;
      mutation.mutate(params);
    },
    [mutation]
  );

  return {
    sendMessage,
    isStreaming,
    streamContent,
    thinkingContent,
    activeToolName,
    toolResults,
    cancelStream,
    isSending: mutation.isPending,
  };
}
