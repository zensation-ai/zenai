/**
 * GeneralChat Component
 *
 * A ChatGPT-like chat interface for general questions and conversations.
 * Integrated into the main hero section alongside the voice memo input.
 * Features humanized AI personality with consistent branding.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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
import './GeneralChat.css';

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
  context: 'personal' | 'work';
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
      console.error('Failed to load session:', err);
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
      showToast('Konnte keine neue Chat-Session erstellen', 'error');
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

        const res = await axios.post(
          `/api/chat/sessions/${currentSessionId}/messages/vision`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
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

        try {
          const response = await fetch(`/api/chat/sessions/${currentSessionId}/messages/stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: messageContent }),
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
                      setThinkingContent(data.thinking);
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
      const errorMessage = getErrorMessage(err, 'Nachricht fehlgeschlagen');
      showToast(errorMessage, 'error');

      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
      setInputValue(messageContent); // Restore input
      setSelectedImages(imagesToSend); // Restore images
      setIsStreaming(false);
      setStreamingContent('');
      setThinkingContent('');
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

  // Render markdown-like formatting (safe, no dangerouslySetInnerHTML)
  const renderContent = (content: string) => {
    // Split by code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        // Code block
        const code = part.slice(3, -3).replace(/^\w+\n/, ''); // Remove language identifier
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
                    {renderContent(message.content)}
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
            className="chat-send-btn neuro-hover-lift neuro-color-transition"
            onClick={handleSendMessage}
            disabled={sending || (!inputValue.trim() && selectedImages.length === 0)}
            title="Nachricht senden"
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
          <span className="chat-hint">Enter zum Senden</span>
          {sessionId && (
            <button
              type="button"
              className="new-chat-btn neuro-hover-lift neuro-color-transition"
              onClick={handleNewChat}
              title="Neuer Chat"
              aria-label="Neue Chat-Session starten"
            >
              + Neuer Chat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
