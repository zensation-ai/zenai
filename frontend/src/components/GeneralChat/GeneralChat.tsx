/**
 * GeneralChat Component
 *
 * A ChatGPT-like chat interface for general questions and conversations.
 * Integrated into the main hero section alongside the voice memo input.
 * Features humanized AI personality with consistent branding.
 */

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import axios from 'axios';
import { showToast } from '../Toast';
import { getErrorMessage, logError } from '../../utils/errors';
import { safeLocalStorage } from '../../utils/storage';
import { ArtifactButton } from '../ArtifactButton';
import { ErrorBoundary } from '../ErrorBoundary';
import { extractArtifacts, type Artifact } from '../../types/artifacts';
import '../GeneralChat.css';

import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import type { ChatMessage, GeneralChatProps } from './types';

// Lazy-load ArtifactPanel (pulls in react-syntax-highlighter ~200KB + react-markdown)
const ArtifactPanel = lazy(() => import('../ArtifactPanel').then(m => ({ default: m.ArtifactPanel })));
// Lazy-load VoiceChat overlay
const VoiceChatOverlay = lazy(() => import('../VoiceChat').then(m => ({ default: m.VoiceChat })));

export function GeneralChat({ context, isCompact = false, assistantMode = false, fullPage = false, initialSessionId, onSessionChange }: GeneralChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  // Streaming state for real-time token display
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinkingContent, setThinkingContent] = useState<string>('');
  // Inline error message for assistant mode (toast is hidden behind panel)
  const [inlineError, setInlineError] = useState<string | null>(null);
  // RAF-based throttle for streaming content updates (caps at ~60fps instead of per-token)
  const streamingRafRef = useRef<number | null>(null);
  const pendingStreamContentRef = useRef<string>('');
  // Thinking partner mode state (Phase 32C-1)
  const [thinkingMode, setThinkingMode] = useState<'assist' | 'challenge' | 'coach' | 'synthesize'>('assist');
  // Voice chat overlay state
  const [voiceChatOpen, setVoiceChatOpen] = useState(false);
  // Artifacts state
  const [artifacts, setArtifacts] = useState<Map<string, Artifact[]>>(new Map());
  const [activeArtifact, setActiveArtifact] = useState<{ artifact: Artifact; messageId: string; index: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // AbortController for session-loading requests only
  const abortControllerRef = useRef<AbortController | null>(null);
  // Separate AbortController for streaming — useEffect must NOT abort this
  const streamAbortRef = useRef<AbortController | null>(null);
  // Guard: skip useEffect reload when we caused the session change internally
  const skipNextSessionLoadRef = useRef(false);

  // Load session on mount, context change, or external initialSessionId change
  useEffect(() => {
    // If WE triggered this change (e.g. createNewSession), skip the reload
    if (skipNextSessionLoadRef.current) {
      skipNextSessionLoadRef.current = false;
      return;
    }

    // Abort any previous session-loading request (NOT streaming)
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    loadLastSession(abortControllerRef.current.signal);

    // Cleanup: abort session load + streaming on unmount or context change + cancel pending RAF
    return () => {
      abortControllerRef.current?.abort();
      streamAbortRef.current?.abort();
      if (streamingRafRef.current) {
        cancelAnimationFrame(streamingRafRef.current);
        streamingRafRef.current = null;
      }
    };
  }, [context, initialSessionId]);

  // Track whether this is an initial/session-switch load (instant scroll) vs new message (smooth)
  const isInitialScrollRef = useRef(true);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
    // After first render with messages, switch to smooth scrolling for new messages
    if (messages.length > 0) {
      isInitialScrollRef.current = false;
    }
  }, [messages]);

  // Auto-scroll during streaming as new content arrives
  useEffect(() => {
    if (isStreaming && streamingContent) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isStreaming, streamingContent]);

  const scrollToBottom = () => {
    // Use instant scroll on initial load / session switch, smooth for new messages
    const behavior = isInitialScrollRef.current ? 'instant' as ScrollBehavior : 'smooth';
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Listen for quick action input events from FloatingAssistant and ChatPage
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent).detail?.prompt;
      if (prompt) {
        setInputValue(prompt);
        inputRef.current?.focus();
      }
    };
    // FloatingAssistant sends this event
    if (assistantMode) {
      window.addEventListener('zenai-assistant-fill-input', handler);
    }
    // ChatPage Quick Actions send this event
    if (fullPage) {
      window.addEventListener('zenai-chat-quick-action', handler);
    }
    return () => {
      window.removeEventListener('zenai-assistant-fill-input', handler);
      window.removeEventListener('zenai-chat-quick-action', handler);
    };
  }, [assistantMode, fullPage]);

  const loadLastSession = async (signal?: AbortSignal) => {
    try {
      setLoading(true);

      // If initialSessionId is provided, load that session directly
      if (initialSessionId) {
        await loadSession(initialSessionId, signal);
        return;
      }

      // Get list of sessions for current context
      const typeFilter = assistantMode ? '&type=assistant' : '';
      const res = await axios.get(`/api/chat/sessions?context=${context}&limit=1${typeFilter}`, { signal });
      const sessions = res.data?.sessions ?? [];

      if (sessions.length > 0) {
        // Load the most recent session
        const lastSession = sessions[0];
        await loadSession(lastSession.id, signal);
      }
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;
      // No existing session, that's fine - user will start fresh
    } finally {
      setLoading(false);
    }
  };

  const loadSession = async (id: string, signal?: AbortSignal) => {
    try {
      const res = await axios.get(`/api/chat/sessions/${id}`, { signal });
      const session = res.data?.session;
      if (session) {
        isInitialScrollRef.current = true; // Reset to instant scroll for session switch
        setSessionId(session.id);
        setMessages(session.messages ?? []);
        onSessionChange?.(session.id);
      }
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;
      logError('GeneralChat:loadSession', err);
    }
  };

  const createNewSession = async (): Promise<string | null> => {
    try {
      const sessionPayload: Record<string, string> = { context };
      if (assistantMode) sessionPayload.type = 'assistant';
      const res = await axios.post('/api/chat/sessions', sessionPayload);
      const session = res.data?.session;
      if (session) {
        setSessionId(session.id);
        setMessages([]);
        // Guard: prevent useEffect from reloading/aborting when WE change the session
        skipNextSessionLoadRef.current = true;
        onSessionChange?.(session.id);
        return session.id;
      }
      return null;
    } catch (err) {
      const msg = 'Ups, ich konnte gerade keine neue Unterhaltung starten.';
      if (assistantMode) {
        setInlineError(msg);
      } else {
        showToast(msg, {
          type: 'error',
          duration: 8000,
          onUndo: () => {
            createNewSession();
          },
          undoLabel: 'Erneut versuchen',
        });
      }
      return null;
    }
  };

  /**
   * Send message with SSE streaming support
   * Uses Server-Sent Events for real-time token-by-token display
   */
  const handleSendMessage = useCallback(async () => {
    // Allow sending with only images (no text required)
    // Guard against sending while session is still loading (race condition)
    if ((!inputValue.trim() && selectedImages.length === 0) || sending || loading) return;

    const messageContent = inputValue.trim();
    const imagesToSend = [...selectedImages];
    setInputValue('');
    setSelectedImages([]);
    setSending(true);
    setInlineError(null);

    try {
      // Get or create session
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        currentSessionId = await createNewSession();
        if (!currentSessionId) {
          setSending(false);
          return;
        }
      }

      // Build display content for user message
      const imageIndicator = imagesToSend.length > 0
        ? (imagesToSend.length === 1 ? ' [Bild]' : ` [${imagesToSend.length} Bilder]`)
        : '';
      const displayContent = messageContent + imageIndicator;

      // Optimistically add user message
      const tempUserMessage: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        sessionId: currentSessionId,
        role: 'user',
        content: displayContent,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, tempUserMessage]);

      if (imagesToSend.length > 0) {
        // Use vision endpoint with FormData (no streaming for vision)
        const formData = new FormData();
        formData.append('message', messageContent);
        imagesToSend.forEach(img => formData.append('images', img));

        // RELIABILITY FIX: Add timeout for image processing to prevent infinite loading
        const res = await axios.post(
          `/api/chat/sessions/${currentSessionId}/messages/vision`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            timeout: 120000, // 2 minute timeout for image processing
          }
        );

        const { userMessage, assistantMessage } = res.data;

        // Replace temp message with real ones
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUserMessage.id);
          return [...filtered, userMessage, assistantMessage];
        });
      } else {
        // Use SSE streaming for text-only messages
        setIsStreaming(true);
        setStreamingContent('');
        setThinkingContent('');

        // Create a new AbortController for this streaming request (separate from session-load ref)
        const streamAbortController = new AbortController();
        streamAbortRef.current = streamAbortController;

        // Timeout: abort if no response starts within 30 seconds
        const streamTimeout = setTimeout(() => {
          streamAbortController.abort();
        }, 30000);

        try {
          // Build full URL: native fetch doesn't use axios baseURL
          const baseUrl = import.meta.env.VITE_API_URL ?? '';
          const apiKey = safeLocalStorage('get', 'apiKey') ?? import.meta.env.VITE_API_KEY;

          const response = await fetch(`${baseUrl}/api/chat/sessions/${currentSessionId}/messages/stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
            },
            body: JSON.stringify({
              message: messageContent,
              thinking_mode: assistantMode ? 'assist' : thinkingMode,
              ...(assistantMode && { assistantMode: true }),
            }),
            signal: streamAbortController.signal, // Add abort signal to prevent memory leaks
          });

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
          const decoder = new TextDecoder();
          let accumulatedContent = '';
          let buffer = '';

          if (reader) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE events from buffer
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                let currentEventType = '';
                for (const line of lines) {
                  if (line.startsWith('event: ')) {
                    // Track event type for the next data line
                    currentEventType = line.slice(7).trim();
                    continue;
                  }
                  // Handle data lines - SSE spec allows both "data: " and "data:" (no space)
                  if (line.startsWith('data:')) {
                    const dataStr = line.startsWith('data: ') ? line.slice(6) : line.slice(5);
                    try {
                      const data = JSON.parse(dataStr);

                      // Skip non-delta events that contain full content (would duplicate)
                      if (currentEventType === 'done' || currentEventType === 'compaction_info' || currentEventType === 'thinking_end') {
                        currentEventType = '';
                        continue;
                      }

                      // Handle tool use events - dispatch navigation actions to the app
                      if (currentEventType === 'tool_use_end' && data.tool) {
                        try {
                          const toolResult = JSON.parse(data.tool.result || '{}');
                          if (toolResult.action === 'navigate' && toolResult.page) {
                            window.dispatchEvent(new CustomEvent('zenai-assistant-navigate', {
                              detail: { action: 'navigate', page: toolResult.page },
                            }));
                          }
                        } catch { /* tool result not JSON, skip */ }
                        currentEventType = '';
                        continue;
                      }
                      if (currentEventType === 'tool_use_start') {
                        currentEventType = '';
                        continue;
                      }

                      if (data.error) {
                        throw new Error(data.error);
                      }

                      // Handle delta events
                      if (data.content !== undefined) {
                        accumulatedContent += data.content;
                        // Throttle DOM updates to animation frame rate (~60fps)
                        pendingStreamContentRef.current = accumulatedContent;
                        if (!streamingRafRef.current) {
                          streamingRafRef.current = requestAnimationFrame(() => {
                            setStreamingContent(pendingStreamContentRef.current);
                            streamingRafRef.current = null;
                          });
                        }
                      }
                      if (data.thinking !== undefined) {
                        // Accumulate thinking deltas (backend now streams chunks)
                        setThinkingContent(prev => prev + data.thinking);
                      }
                    } catch (parseErr) {
                      if (parseErr instanceof Error && parseErr.message && !parseErr.message.includes('JSON')) {
                        throw parseErr; // Re-throw non-JSON errors (e.g. server error messages)
                      }
                    }
                    currentEventType = '';
                  }
                  // Reset event type after processing data line
                  currentEventType = '';
                }
              }
            } catch (readerErr) {
              // Reader errors (connection lost, stream broken) - use partial content if available
              if (readerErr instanceof Error && readerErr.name === 'AbortError') throw readerErr;
              console.warn('Stream reader error, using partial content:', readerErr);
            } finally {
              // Always release the reader lock to prevent resource leaks
              try { reader.releaseLock(); } catch { /* already released */ }
            }
          }

          // Stream complete - update messages
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== tempUserMessage.id);
            const realUserMessage: ChatMessage = {
              ...tempUserMessage,
              id: `user-${Date.now()}`,
            };

            // Guard: only add assistant message if stream returned content
            if (accumulatedContent.trim()) {
              const finalAssistantMessage: ChatMessage = {
                id: `assistant-${Date.now()}`,
                sessionId: currentSessionId,
                role: 'assistant',
                content: accumulatedContent,
                createdAt: new Date().toISOString(),
              };
              return [...filtered, realUserMessage, finalAssistantMessage];
            }
            return [...filtered, realUserMessage];
          });

          // Notify sidebar that session content was updated (title/updatedAt changed)
          window.dispatchEvent(new CustomEvent('zenai-chat-message-sent', {
            detail: { sessionId: currentSessionId },
          }));
        } finally {
          // Always clear the stream timeout to prevent late aborts
          clearTimeout(streamTimeout);
          // Cancel any pending RAF and reset streaming state
          if (streamingRafRef.current) {
            cancelAnimationFrame(streamingRafRef.current);
            streamingRafRef.current = null;
          }
          pendingStreamContentRef.current = '';
          setIsStreaming(false);
          setStreamingContent('');
          setThinkingContent('');
        }
      }

    } catch (err) {
      // Don't show error for aborted requests (e.g., component unmount or context change)
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const errorMessage = getErrorMessage(err, 'Deine Nachricht konnte nicht gesendet werden.');

      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
      setInputValue(messageContent); // Restore input
      setSelectedImages(imagesToSend); // Restore images
      setIsStreaming(false);
      setStreamingContent('');
      setThinkingContent('');

      if (assistantMode) {
        // In assistant mode, show error inline (toast is hidden behind the panel)
        setInlineError(errorMessage);
      } else {
        // Show error toast with retry button
        showToast(errorMessage, {
          type: 'error',
          duration: 8000,
          onUndo: () => {
            // Re-trigger send after restoring input (via setTimeout to let state update)
            setTimeout(() => {
              handleSendMessage();
            }, 100);
          },
          undoLabel: 'Erneut senden',
        });
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [inputValue, sending, loading, sessionId, selectedImages, context, assistantMode, thinkingMode]);

  const handleStopGenerating = useCallback(() => {
    streamAbortRef.current?.abort();
    setSending(false);
    setIsStreaming(false);
    setStreamingContent('');
    setThinkingContent('');
    if (streamingRafRef.current) {
      cancelAnimationFrame(streamingRafRef.current);
      streamingRafRef.current = null;
    }
    pendingStreamContentRef.current = '';
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewChat = async () => {
    await createNewSession();
    showToast('Neue Chat-Session gestartet', 'success');
  };

  // Extract and cache artifacts from message content
  const getMessageArtifacts = useCallback((messageId: string, content: string): { text: string; messageArtifacts: Artifact[] } => {
    // Check cache first
    const cached = artifacts.get(messageId);
    if (cached) {
      // Return processed text with artifact references
      const { text } = extractArtifacts(content);
      return { text, messageArtifacts: cached };
    }

    // Extract artifacts
    const { text, artifacts: extracted } = extractArtifacts(content);

    // Cache if any found
    if (extracted.length > 0) {
      setArtifacts(prev => new Map(prev).set(messageId, extracted));
    }

    return { text, messageArtifacts: extracted };
  }, [artifacts]);

  // Render markdown-like formatting (safe, no dangerouslySetInnerHTML)
  const renderContent = useCallback((content: string, messageId?: string) => {
    // Extract artifacts if messageId provided
    let processedContent = content;
    let messageArtifacts: Artifact[] = [];

    if (messageId) {
      const result = getMessageArtifacts(messageId, content);
      processedContent = result.text;
      messageArtifacts = result.messageArtifacts;
    }

    // Split by code blocks and artifact references
    const parts = processedContent.split(/(```[\s\S]*?```|\[\[ARTIFACT:[^\]]+\]\])/g);

    return parts.map((part, i) => {
      // Check for artifact reference
      const artifactMatch = part.match(/\[\[ARTIFACT:([^\]]+)\]\]/);
      if (artifactMatch) {
        const artifactId = artifactMatch[1];
        const artifact = messageArtifacts.find(a => a.id === artifactId);
        if (artifact && messageId) {
          const artifactIndex = messageArtifacts.indexOf(artifact);
          return (
            <ArtifactButton
              key={i}
              artifact={artifact}
              onClick={() => setActiveArtifact({ artifact, messageId, index: artifactIndex })}
            />
          );
        }
        return null;
      }

      if (part.startsWith('```') && part.endsWith('```')) {
        // Code block - check if it's large enough to be an artifact
        const codeContent = part.slice(3, -3);
        const langMatch = codeContent.match(/^(\w+)\n/);
        const language = langMatch ? langMatch[1] : 'text';
        const code = langMatch ? codeContent.slice(langMatch[0].length) : codeContent;

        // Large code blocks become inline artifacts
        if (code.split('\n').length >= 15 && messageId) {
          const inlineArtifact: Artifact = {
            id: `inline-${messageId}-${i}`,
            title: `${language.charAt(0).toUpperCase() + language.slice(1)} Code`,
            type: 'code',
            language,
            content: code,
          };
          return (
            <ArtifactButton
              key={i}
              artifact={inlineArtifact}
              onClick={() => setActiveArtifact({ artifact: inlineArtifact, messageId, index: -1 })}
            />
          );
        }

        // Small code blocks render inline
        return (
          <pre key={i} className="code-block">
            <code>{code}</code>
          </pre>
        );
      }

      // Process block-level formatting (headings, lists) then inline
      const renderBlockFormatting = (text: string): React.ReactNode[] => {
        const lines = text.split('\n');
        const result: React.ReactNode[] = [];
        let keyIndex = 0;
        let listItems: string[] = [];
        let listType: 'ul' | 'ol' | null = null;

        const flushList = () => {
          if (listItems.length > 0 && listType) {
            const Tag = listType;
            result.push(
              <Tag key={`list-${keyIndex++}`} className="chat-list">
                {listItems.map((item, li) => (
                  <li key={li}>{renderInline(item)}</li>
                ))}
              </Tag>
            );
            listItems = [];
            listType = null;
          }
        };

        for (const line of lines) {
          // Headings
          const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
          if (headingMatch) {
            flushList();
            const level = headingMatch[1].length;
            const Tag = `h${Math.min(level + 2, 6)}` as keyof JSX.IntrinsicElements;
            result.push(<Tag key={`h-${keyIndex++}`} className="chat-heading">{renderInline(headingMatch[2])}</Tag>);
            continue;
          }

          // Unordered list
          const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
          if (ulMatch) {
            if (listType === 'ol') flushList();
            listType = 'ul';
            listItems.push(ulMatch[1]);
            continue;
          }

          // Ordered list
          const olMatch = line.match(/^[\s]*\d+[.)]\s+(.+)$/);
          if (olMatch) {
            if (listType === 'ul') flushList();
            listType = 'ol';
            listItems.push(olMatch[1]);
            continue;
          }

          // Regular line
          flushList();
          if (line.trim() === '') {
            result.push(<br key={`br-${keyIndex++}`} />);
          } else {
            result.push(<span key={`p-${keyIndex++}`}>{renderInline(line)}<br /></span>);
          }
        }
        flushList();
        return result;
      };

      // Inline formatting: bold, italic, inline code, links
      const renderInline = (text: string): React.ReactNode[] => {
        const result: React.ReactNode[] = [];
        const inlineRegex = /(\*\*.*?\*\*|\*.*?\*|`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g;
        let lastIndex = 0;
        let match;
        let ki = 0;

        while ((match = inlineRegex.exec(text)) !== null) {
          if (match.index > lastIndex) {
            result.push(text.slice(lastIndex, match.index));
          }

          const matched = match[0];
          if (match[2] && match[3]) {
            // Link: [text](url) - validate protocol to prevent javascript: XSS
            const url = match[3];
            const isSafeUrl = /^https?:\/\//.test(url) || url.startsWith('mailto:');
            if (isSafeUrl) {
              result.push(<a key={`a-${ki++}`} href={url} target="_blank" rel="noopener noreferrer" className="chat-link">{match[2]}</a>);
            } else {
              result.push(<span key={`a-${ki++}`} className="chat-link-text">{match[2]}</span>);
            }
          } else if (matched.startsWith('**') && matched.endsWith('**')) {
            result.push(<strong key={`b-${ki++}`}>{matched.slice(2, -2)}</strong>);
          } else if (matched.startsWith('*') && matched.endsWith('*')) {
            result.push(<em key={`i-${ki++}`}>{matched.slice(1, -1)}</em>);
          } else if (matched.startsWith('`') && matched.endsWith('`')) {
            result.push(<code key={`c-${ki++}`} className="inline-code">{matched.slice(1, -1)}</code>);
          }

          lastIndex = match.index + matched.length;
        }

        if (lastIndex < text.length) {
          result.push(text.slice(lastIndex));
        }
        return result;
      };

      return <span key={i}>{renderBlockFormatting(part)}</span>;
    });
  }, [getMessageArtifacts, setActiveArtifact]);

  // Navigate between artifacts in the same message (skip inline artifacts with index -1)
  const navigateArtifact = useCallback((direction: 'prev' | 'next') => {
    if (!activeArtifact || activeArtifact.index < 0) return;

    const messageArtifacts = artifacts.get(activeArtifact.messageId) ?? [];
    const currentIndex = activeArtifact.index;

    if (direction === 'prev' && currentIndex > 0) {
      const target = messageArtifacts[currentIndex - 1];
      if (target) {
        setActiveArtifact({ artifact: target, messageId: activeArtifact.messageId, index: currentIndex - 1 });
      }
    } else if (direction === 'next' && currentIndex < messageArtifacts.length - 1) {
      const target = messageArtifacts[currentIndex + 1];
      if (target) {
        setActiveArtifact({ artifact: target, messageId: activeArtifact.messageId, index: currentIndex + 1 });
      }
    }
  }, [activeArtifact, artifacts]);

  if (loading) {
    return (
      <div className={`general-chat ${isCompact ? 'compact' : ''} ${fullPage ? 'full-page' : ''}`} role="status" aria-live="polite">
        <div className="chat-loading neuro-loading-contextual">
          <div className="loading-spinner neuro-loading-spinner" aria-label="Chat wird geladen" />
        </div>
      </div>
    );
  }

  return (
    <div className={`general-chat liquid-glass ${isCompact ? 'compact' : ''} ${fullPage ? 'full-page' : ''}`}>
      {/* Messages Area */}
      <ChatMessageList
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        thinkingContent={thinkingContent}
        sending={sending}
        renderContent={renderContent}
        messagesEndRef={messagesEndRef}
        onStopGenerating={handleStopGenerating}
      />

      {/* Input Area with Thinking Mode and Error Display */}
      <ChatInput
        inputValue={inputValue}
        setInputValue={setInputValue}
        selectedImages={selectedImages}
        setSelectedImages={setSelectedImages}
        sending={sending}
        handleSendMessage={handleSendMessage}
        handleKeyDown={handleKeyDown}
        handleNewChat={handleNewChat}
        sessionId={sessionId}
        inlineError={inlineError}
        setInlineError={setInlineError}
        thinkingMode={thinkingMode}
        setThinkingMode={setThinkingMode}
        voiceChatOpen={voiceChatOpen}
        setVoiceChatOpen={setVoiceChatOpen}
        inputRef={inputRef}
        context={context}
        assistantMode={assistantMode}
      />

      {/* Artifact Panel - lazy-loaded to reduce initial bundle (~200KB saved) */}
      {activeArtifact && (
        <ErrorBoundary fallback={<div className="artifact-error">Artifact konnte nicht angezeigt werden.</div>}>
          <Suspense fallback={<div className="artifact-loading">Lade Artifact...</div>}>
            <ArtifactPanel
              artifact={activeArtifact.artifact}
              onClose={() => setActiveArtifact(null)}
              onPrevious={() => navigateArtifact('prev')}
              onNext={() => navigateArtifact('next')}
              hasPrevious={activeArtifact.index > 0}
              hasNext={activeArtifact.index >= 0 && activeArtifact.index < (artifacts.get(activeArtifact.messageId)?.length ?? 0) - 1}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Voice Chat Overlay */}
      {voiceChatOpen && (
        <div
          className="voice-chat-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Sprachkonversation"
          onKeyDown={(e) => { if (e.key === 'Escape') setVoiceChatOpen(false); }}
        >
          <div
            className="voice-chat-overlay-backdrop"
            onClick={() => setVoiceChatOpen(false)}
            role="presentation"
          />
          <div className="voice-chat-overlay-content">
            <Suspense fallback={<div className="voice-chat-loading">Lade Sprachkonversation...</div>}>
              <VoiceChatOverlay
                context={context}
                apiUrl={import.meta.env.VITE_API_URL ?? ''}
                apiKey={import.meta.env.VITE_API_KEY ?? ''}
                onClose={() => setVoiceChatOpen(false)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
