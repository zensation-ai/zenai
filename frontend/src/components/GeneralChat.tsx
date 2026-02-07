/**
 * GeneralChat Component
 *
 * A ChatGPT-like chat interface for general questions and conversations.
 * Integrated into the main hero section alongside the voice memo input.
 * Features humanized AI personality with consistent branding.
 */

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { AIContext } from './ContextSwitcher';
import axios from 'axios';
import { showToast } from './Toast';
import { getErrorMessage } from '../utils/errors';
import {
  AI_PERSONALITY,
  AI_AVATAR,
  EMPTY_STATE_MESSAGES,
  getRandomMessage,
} from '../utils/aiPersonality';
import { ImageUpload } from './ImageUpload';
import { VoiceInput } from './VoiceInput';
import { ArtifactButton } from './ArtifactButton';
import { ErrorBoundary } from './ErrorBoundary';
import { extractArtifacts, type Artifact } from '../types/artifacts';
import './GeneralChat.css';
import { logError } from '../utils/errors';

// Lazy-load ArtifactPanel (pulls in react-syntax-highlighter ~200KB + react-markdown)
const ArtifactPanel = lazy(() => import('./ArtifactPanel').then(m => ({ default: m.ArtifactPanel })));

interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// ChatSession type for API responses (exported for potential external use)
export interface ChatSession {
  id: string;
  context: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GeneralChatProps {
  context: AIContext;
  isCompact?: boolean;
}

export function GeneralChat({ context, isCompact = false }: GeneralChatProps) {
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
  // Artifacts state
  const [artifacts, setArtifacts] = useState<Map<string, Artifact[]>>(new Map());
  const [activeArtifact, setActiveArtifact] = useState<{ artifact: Artifact; messageId: string; index: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // AbortController ref to prevent memory leaks on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load last session on mount
  useEffect(() => {
    // Abort any previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    loadLastSession(abortControllerRef.current.signal);

    // Cleanup: abort on unmount or context change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [context]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadLastSession = async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      // Get list of sessions for current context
      const res = await axios.get(`/api/chat/sessions?context=${context}&limit=1`, { signal });
      const sessions = res.data.data?.sessions || [];

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
      const session = res.data.data?.session;
      if (session) {
        setSessionId(session.id);
        setMessages(session.messages || []);
      }
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;
      logError('GeneralChat:loadSession', err);
    }
  };

  const createNewSession = async (): Promise<string | null> => {
    try {
      const res = await axios.post('/api/chat/sessions', { context });
      const session = res.data.data?.session;
      if (session) {
        setSessionId(session.id);
        setMessages([]);
        return session.id;
      }
      return null;
    } catch (err) {
      showToast('Ups, ich konnte gerade keine neue Unterhaltung starten.', {
        type: 'error',
        duration: 8000,
        onUndo: () => {
          // Retry creating session
          createNewSession();
        },
        undoLabel: 'Erneut versuchen',
      });
      return null;
    }
  };

  /**
   * Send message with SSE streaming support
   * Uses Server-Sent Events for real-time token-by-token display
   */
  const handleSendMessage = useCallback(async () => {
    // Allow sending with only images (no text required)
    if ((!inputValue.trim() && selectedImages.length === 0) || sending) return;

    const messageContent = inputValue.trim();
    const imagesToSend = [...selectedImages];
    setInputValue('');
    setSelectedImages([]);
    setSending(true);

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

        const { userMessage, assistantMessage } = res.data.data;

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

        // Create a new AbortController for this streaming request
        const streamAbortController = new AbortController();
        // Store reference for cleanup on unmount
        abortControllerRef.current = streamAbortController;

        try {
          const response = await fetch(`/api/chat/sessions/${currentSessionId}/messages/stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: messageContent }),
            signal: streamAbortController.signal, // Add abort signal to prevent memory leaks
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let accumulatedContent = '';
          let buffer = '';

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              // Process complete SSE events from buffer
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer

              for (const line of lines) {
                if (line.startsWith('event: ')) {
                  // Event type line - handled with next data line
                  continue;
                }
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));

                    // Handle different event types based on data content
                    if (data.content !== undefined) {
                      accumulatedContent += data.content;
                      setStreamingContent(accumulatedContent);
                    }
                    if (data.thinking !== undefined) {
                      // Accumulate thinking deltas (backend now streams chunks)
                      setThinkingContent(prev => prev + data.thinking);
                    }
                    if (data.error) {
                      throw new Error(data.error);
                    }
                  } catch (parseError) {
                    // Skip malformed JSON
                    if (line.slice(6).trim() !== '') {
                      console.warn('Failed to parse SSE data:', line);
                    }
                  }
                }
              }
            }
          }

          // Stream complete - create final assistant message
          const finalAssistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            sessionId: currentSessionId,
            role: 'assistant',
            content: accumulatedContent,
            createdAt: new Date().toISOString(),
          };

          // Update messages with real user message (from temp) and assistant response
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== tempUserMessage.id);
            const realUserMessage: ChatMessage = {
              ...tempUserMessage,
              id: `user-${Date.now()}`,
            };
            return [...filtered, realUserMessage, finalAssistantMessage];
          });
        } finally {
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

      // Show error toast with retry button
      showToast(errorMessage, {
        type: 'error',
        duration: 8000, // Give more time to see the retry button
        onUndo: () => {
          // Focus input and trigger send after a tick (state needs to be restored first)
          setTimeout(() => {
            inputRef.current?.focus();
            // Input value is already restored, just need to submit
            // Using a custom event to trigger send without clearing input again
            const form = inputRef.current?.closest('form');
            if (form) {
              form.requestSubmit();
            }
          }, 100);
        },
        undoLabel: 'Erneut senden',
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [inputValue, sending, sessionId, selectedImages, context]);

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

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
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
  const renderContent = (content: string, messageId?: string) => {
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

      // Process inline formatting safely using React elements
      const renderInlineFormatting = (text: string): React.ReactNode[] => {
        const result: React.ReactNode[] = [];
        // Combined regex for bold, italic, inline code
        const inlineRegex = /(\*\*.*?\*\*|\*.*?\*|`[^`]+`|\n)/g;
        let lastIndex = 0;
        let match;
        let keyIndex = 0;

        while ((match = inlineRegex.exec(text)) !== null) {
          // Add text before match
          if (match.index > lastIndex) {
            result.push(text.slice(lastIndex, match.index));
          }

          const matched = match[0];
          if (matched === '\n') {
            result.push(<br key={`br-${keyIndex++}`} />);
          } else if (matched.startsWith('**') && matched.endsWith('**')) {
            result.push(<strong key={`strong-${keyIndex++}`}>{matched.slice(2, -2)}</strong>);
          } else if (matched.startsWith('*') && matched.endsWith('*')) {
            result.push(<em key={`em-${keyIndex++}`}>{matched.slice(1, -1)}</em>);
          } else if (matched.startsWith('`') && matched.endsWith('`')) {
            result.push(<code key={`code-${keyIndex++}`} className="inline-code">{matched.slice(1, -1)}</code>);
          }

          lastIndex = match.index + matched.length;
        }

        // Add remaining text
        if (lastIndex < text.length) {
          result.push(text.slice(lastIndex));
        }

        return result;
      };

      return <span key={i}>{renderInlineFormatting(part)}</span>;
    });
  };

  // Navigate between artifacts in the same message
  const navigateArtifact = useCallback((direction: 'prev' | 'next') => {
    if (!activeArtifact) return;

    const messageArtifacts = artifacts.get(activeArtifact.messageId) || [];
    const currentIndex = activeArtifact.index;

    if (direction === 'prev' && currentIndex > 0) {
      setActiveArtifact({
        artifact: messageArtifacts[currentIndex - 1],
        messageId: activeArtifact.messageId,
        index: currentIndex - 1,
      });
    } else if (direction === 'next' && currentIndex < messageArtifacts.length - 1) {
      setActiveArtifact({
        artifact: messageArtifacts[currentIndex + 1],
        messageId: activeArtifact.messageId,
        index: currentIndex + 1,
      });
    }
  }, [activeArtifact, artifacts]);

  if (loading) {
    return (
      <div className={`general-chat ${isCompact ? 'compact' : ''}`} role="status" aria-live="polite">
        <div className="chat-loading neuro-loading-contextual">
          <div className="loading-spinner neuro-loading-spinner" aria-label="Chat wird geladen" />
        </div>
      </div>
    );
  }

  return (
    <div className={`general-chat liquid-glass ${isCompact ? 'compact' : ''}`}>
      {/* Messages Area */}
      <div className="chat-messages" role="log" aria-label="Chat-Nachrichten" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty neuro-empty-state neuro-human-fade-in" role="status" aria-label="Leerer Chat - Beginne eine Unterhaltung">
            <div className="chat-empty-avatar neuro-breathing" aria-hidden="true">{AI_AVATAR.emoji}</div>
            <h3 className="chat-empty-title neuro-empty-title">{EMPTY_STATE_MESSAGES.chat.title}</h3>
            <p className="chat-empty-description neuro-empty-description">{EMPTY_STATE_MESSAGES.chat.description}</p>
            <span className="chat-empty-hint neuro-empty-encouragement">{EMPTY_STATE_MESSAGES.chat.encouragement}</span>
            <div className="chat-empty-name">
              <span>Ich bin {AI_PERSONALITY.name}</span>
            </div>
          </div>
        ) : (
          <>
            {messages.map(message => (
              <div
                key={message.id}
                className={`chat-message ${message.role} neuro-human-fade-in`}
                role="article"
                aria-label={`Nachricht von ${message.role === 'assistant' ? AI_PERSONALITY.name : 'Dir'}`}
              >
                <div className="chat-message-avatar" title={message.role === 'assistant' ? AI_PERSONALITY.name : 'Du'} aria-hidden="true">
                  {message.role === 'assistant' ? AI_AVATAR.emoji : '👤'}
                </div>
                <div className="chat-message-content">
                  <div className="chat-message-header">
                    <span className="chat-message-name">
                      {message.role === 'assistant' ? AI_PERSONALITY.name : 'Du'}
                    </span>
                    <span className="chat-message-time">{formatTime(message.createdAt)}</span>
                  </div>
                  <div className="chat-message-text">
                    {renderContent(message.content, message.id)}
                  </div>
                </div>
              </div>
            ))}
            {/* Streaming response - shows content as it arrives */}
            {isStreaming && streamingContent && (
              <div className="chat-message assistant neuro-human-fade-in streaming" role="status" aria-live="polite">
                <div className="chat-message-avatar" title={AI_PERSONALITY.name} aria-hidden="true">{AI_AVATAR.emoji}</div>
                <div className="chat-message-content">
                  <div className="chat-message-header">
                    <span className="chat-message-name">{AI_PERSONALITY.name}</span>
                    <span className="chat-message-status streaming-indicator">schreibt...</span>
                  </div>
                  {thinkingContent && (
                    <div className="chat-thinking-block" aria-label="KI denkt nach">
                      <span className="thinking-label">Denke nach...</span>
                      <span className="thinking-preview">{thinkingContent.slice(0, 100)}...</span>
                    </div>
                  )}
                  <div className="chat-message-text">
                    {renderContent(streamingContent)}
                    <span className="streaming-cursor" aria-hidden="true">▋</span>
                  </div>
                </div>
              </div>
            )}
            {/* Typing indicator - shown while waiting for stream to start */}
            {sending && !isStreaming && (
              <div className="chat-message assistant neuro-human-fade-in" role="status" aria-live="polite">
                <div className="chat-message-avatar neuro-breathing" title={AI_PERSONALITY.name} aria-hidden="true">{AI_AVATAR.thinkingEmoji}</div>
                <div className="chat-message-content">
                  <div className="chat-message-header">
                    <span className="chat-message-name">{AI_PERSONALITY.name}</span>
                    <span className="chat-message-status">{getRandomMessage('thinking')}</span>
                  </div>
                  <div className="typing-indicator neuro-typing" aria-label={`${AI_PERSONALITY.name} schreibt`}>
                    <span className="neuro-typing-dot"></span>
                    <span className="neuro-typing-dot"></span>
                    <span className="neuro-typing-dot"></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          {/* Image Upload Button */}
          <ImageUpload
            onImagesChange={setSelectedImages}
            images={selectedImages}
            disabled={sending}
            compact={true}
            maxImages={5}
          />
          {/* Voice Input Button */}
          <VoiceInput
            onTranscript={(text) => setInputValue((prev) => prev ? `${prev} ${text}` : text)}
            disabled={sending}
            context={context}
            compact={true}
          />
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedImages.length > 0 ? "Frage zum Bild..." : "Frag mich etwas..."}
            rows={1}
            disabled={sending}
            className="chat-input liquid-glass-input neuro-placeholder-animated"
            aria-label="Chat-Nachricht eingeben"
          />
          <button
            type="button"
            className="chat-send-btn neuro-hover-lift neuro-color-transition neuro-focus-ring"
            onClick={handleSendMessage}
            disabled={sending || (!inputValue.trim() && selectedImages.length === 0)}
            aria-label={sending ? 'Nachricht wird gesendet' : 'Nachricht senden'}
          >
            {sending ? (
              <span className="sending-dots">...</span>
            ) : (
              <span className="send-arrow">↑</span>
            )}
          </button>
        </div>
        <div className="chat-input-footer">
          <span className="chat-hint" title="Enter sendet die Nachricht, Shift+Enter für neue Zeile">
            Enter zum Senden · Shift+Enter für neue Zeile
          </span>
          {sessionId && (
            <button
              type="button"
              className="new-chat-btn neuro-hover-lift neuro-color-transition neuro-focus-ring"
              onClick={handleNewChat}
              aria-label="Neue Chat-Session starten (bisherige bleibt erhalten)"
            >
              + Neuer Chat
            </button>
          )}
        </div>
      </div>

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
              hasNext={activeArtifact.index >= 0 && activeArtifact.index < (artifacts.get(activeArtifact.messageId)?.length || 0) - 1}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
