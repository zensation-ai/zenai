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
import {
  AI_PERSONALITY,
  AI_AVATAR,
  EMPTY_STATE_MESSAGES,
  getRandomMessage,
} from '../utils/aiPersonality';
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

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || sending) return;

    const messageContent = inputValue.trim();
    setInputValue('');
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

      // Optimistically add user message
      const tempUserMessage: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        sessionId: currentSessionId,
        role: 'user',
        content: messageContent,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, tempUserMessage]);

      // Send message to API
      const res = await axios.post(`/api/chat/sessions/${currentSessionId}/messages`, {
        message: messageContent,
      });

      const { userMessage, assistantMessage } = res.data.data;

      // Replace temp message with real ones
      setMessages(prev => {
        // Remove temp message and add real messages
        const filtered = prev.filter(m => m.id !== tempUserMessage.id);
        return [...filtered, userMessage, assistantMessage];
      });

    } catch (err) {
      const axiosError = err as { response?: { data?: { error?: { message?: string } } } };
      const errorMessage = axiosError.response?.data?.error?.message || 'Nachricht fehlgeschlagen';
      showToast(errorMessage, 'error');

      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
      setInputValue(messageContent); // Restore input
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [inputValue, sending, sessionId, context]);

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
          <div className="chat-empty neuro-empty-state neuro-human-fade-in" role="status">
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
            {sending && (
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
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Frag mich etwas..."
            rows={1}
            disabled={sending}
            className="chat-input liquid-glass-input neuro-placeholder-animated"
            aria-label="Chat-Nachricht eingeben"
          />
          <button
            type="button"
            className="chat-send-btn neuro-hover-lift neuro-color-transition"
            onClick={handleSendMessage}
            disabled={sending || !inputValue.trim()}
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
