/**
 * ChatPage Component
 *
 * Dedizierte Chat-Seite mit Session-Verlauf (ChatGPT-like).
 * Features:
 * - Session-Liste links (gruppiert nach Datum)
 * - Chat-Bereich rechts
 * - Neue Session erstellen
 * - Sessions löschen
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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
import { PageHeader } from './PageHeader';
import './ChatPage.css';
import { logError } from '../utils/errors';

interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ChatSession {
  id: string;
  context: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

interface ChatPageProps {
  context: AIContext;
  onBack: () => void;
}

interface GroupedSessions {
  label: string;
  sessions: ChatSession[];
}

export function ChatPage({ context, onBack }: ChatPageProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load sessions on mount
  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    loadSessions(abortControllerRef.current.signal);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [context]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Group sessions by date
  const groupedSessions = useCallback((): GroupedSessions[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const groups: GroupedSessions[] = [
      { label: 'Heute', sessions: [] },
      { label: 'Gestern', sessions: [] },
      { label: 'Letzte 7 Tage', sessions: [] },
      { label: 'Letzter Monat', sessions: [] },
      { label: 'Älter', sessions: [] },
    ];

    sessions.forEach(session => {
      const date = new Date(session.updatedAt);
      date.setHours(0, 0, 0, 0);

      if (date >= today) {
        groups[0].sessions.push(session);
      } else if (date >= yesterday) {
        groups[1].sessions.push(session);
      } else if (date >= lastWeek) {
        groups[2].sessions.push(session);
      } else if (date >= lastMonth) {
        groups[3].sessions.push(session);
      } else {
        groups[4].sessions.push(session);
      }
    });

    return groups.filter(g => g.sessions.length > 0);
  }, [sessions]);

  const loadSessions = async (signal?: AbortSignal) => {
    try {
      setLoadingSessions(true);
      const res = await axios.get(`/api/chat/sessions?context=${context}&limit=50`, { signal });
      const loadedSessions = res.data.data?.sessions || [];
      setSessions(loadedSessions);

      // Auto-select first session if available
      if (loadedSessions.length > 0 && !activeSessionId) {
        await loadSession(loadedSessions[0].id, signal);
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      logError('ChatPage:loadSessions', err);
      showToast('Chat-Sitzungen konnten nicht geladen werden', 'error');
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadSession = async (id: string, signal?: AbortSignal) => {
    try {
      setLoadingMessages(true);
      setActiveSessionId(id);
      const res = await axios.get(`/api/chat/sessions/${id}`, { signal });
      const session = res.data.data?.session;
      if (session) {
        setMessages(session.messages || []);
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      showToast('Konnte Session nicht laden', 'error');
    } finally {
      setLoadingMessages(false);
    }
  };

  const createNewSession = async (): Promise<string | null> => {
    try {
      const res = await axios.post('/api/chat/sessions', { context });
      const session = res.data.data?.session;
      if (session) {
        setSessions(prev => [session, ...prev]);
        setActiveSessionId(session.id);
        setMessages([]);
        showToast('Neue Session gestartet', 'success');
        return session.id;
      }
      return null;
    } catch (err) {
      showToast('Konnte keine neue Session erstellen', 'error');
      return null;
    }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Diese Session wirklich löschen?')) return;

    try {
      await axios.delete(`/api/chat/sessions/${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));

      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
      }

      showToast('Session gelöscht', 'success');
    } catch (err) {
      showToast('Konnte Session nicht löschen', 'error');
    }
  };

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || sending) return;

    const messageContent = inputValue.trim();
    setInputValue('');
    setSending(true);

    try {
      let currentSessionId = activeSessionId;
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

      // Send message
      const res = await axios.post(`/api/chat/sessions/${currentSessionId}/messages`, {
        message: messageContent,
      });

      const { userMessage, assistantMessage } = res.data.data;

      // Replace temp message with real ones
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempUserMessage.id);
        return [...filtered, userMessage, assistantMessage];
      });

      // Update session title in list if it was generated
      if (res.data.data.titleUpdated) {
        setSessions(prev =>
          prev.map(s =>
            s.id === currentSessionId
              ? { ...s, title: res.data.data.title, updatedAt: new Date().toISOString() }
              : s
          )
        );
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err, 'Nachricht fehlgeschlagen');
      showToast(errorMessage, 'error');
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
      setInputValue(messageContent);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [inputValue, sending, activeSessionId, context]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSessionTitle = (session: ChatSession) => {
    if (session.title) return session.title;
    return 'Neue Unterhaltung';
  };

  // Render message content with formatting
  const renderContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);

    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3).replace(/^\w+\n/, '');
        return (
          <pre key={i} className="code-block">
            <code>{code}</code>
          </pre>
        );
      }

      const renderInlineFormatting = (text: string): React.ReactNode[] => {
        const result: React.ReactNode[] = [];
        const inlineRegex = /(\*\*.*?\*\*|\*.*?\*|`[^`]+`|\n)/g;
        let lastIndex = 0;
        let match;
        let keyIndex = 0;

        while ((match = inlineRegex.exec(text)) !== null) {
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

        if (lastIndex < text.length) {
          result.push(text.slice(lastIndex));
        }

        return result;
      };

      return <span key={i}>{renderInlineFormatting(part)}</span>;
    });
  };

  return (
    <div className="chat-page">
      <PageHeader
        title="Gespräche"
        subtitle={`${sessions.length} Unterhaltungen`}
        onBack={onBack}
      >
        <button
          type="button"
          className="btn-new-chat neuro-hover-lift"
          onClick={createNewSession}
        >
          + Neuer Chat
        </button>
      </PageHeader>

      <div className="chat-page-content">
        {/* Sidebar - Session List */}
        <aside className={`chat-sidebar liquid-glass ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Sidebar öffnen' : 'Sidebar schließen'}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>

          {!sidebarCollapsed && (
            <div className="sessions-list">
              {loadingSessions ? (
                <div className="sessions-loading">
                  <div className="loading-spinner" />
                  <span>Lade Sessions...</span>
                </div>
              ) : sessions.length === 0 ? (
                <div className="sessions-empty">
                  <span className="sessions-empty-icon">💬</span>
                  <p>Noch keine Gespräche</p>
                  <button
                    type="button"
                    className="btn-start-chat"
                    onClick={createNewSession}
                  >
                    Starte dein erstes Gespräch
                  </button>
                </div>
              ) : (
                groupedSessions().map(group => (
                  <div key={group.label} className="session-group">
                    <div className="session-group-label">{group.label}</div>
                    {group.sessions.map(session => (
                      <button
                        key={session.id}
                        type="button"
                        className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
                        onClick={() => loadSession(session.id)}
                      >
                        <span className="session-icon">💬</span>
                        <span className="session-title">{getSessionTitle(session)}</span>
                        <button
                          type="button"
                          className="session-delete"
                          onClick={(e) => deleteSession(session.id, e)}
                          aria-label="Session löschen"
                        >
                          ×
                        </button>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </aside>

        {/* Main Chat Area */}
        <main className="chat-main">
          {/* Messages */}
          <div className="chat-messages" role="region" aria-label="Chat-Nachrichten" aria-live="polite">
            {loadingMessages ? (
              <div className="chat-loading">
                <div className="loading-spinner" />
              </div>
            ) : messages.length === 0 ? (
              <div className="chat-empty neuro-empty-state neuro-human-fade-in">
                <div className="chat-empty-avatar neuro-breathing">{AI_AVATAR.emoji}</div>
                <h3 className="chat-empty-title">{EMPTY_STATE_MESSAGES.chat.title}</h3>
                <p className="chat-empty-description">{EMPTY_STATE_MESSAGES.chat.description}</p>
                <span className="chat-empty-hint">{EMPTY_STATE_MESSAGES.chat.encouragement}</span>
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
                  >
                    <div className="chat-message-avatar">
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
                  <div className="chat-message assistant neuro-human-fade-in">
                    <div className="chat-message-avatar neuro-breathing">{AI_AVATAR.thinkingEmoji}</div>
                    <div className="chat-message-content">
                      <div className="chat-message-header">
                        <span className="chat-message-name">{AI_PERSONALITY.name}</span>
                        <span className="chat-message-status">{getRandomMessage('thinking')}</span>
                      </div>
                      <div className="typing-indicator neuro-typing">
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
                className="chat-input liquid-glass-input"
              />
              <button
                type="button"
                className="chat-send-btn neuro-hover-lift"
                onClick={handleSendMessage}
                disabled={sending || !inputValue.trim()}
              >
                {sending ? <span className="sending-dots">...</span> : <span className="send-arrow">↑</span>}
              </button>
            </div>
            <div className="chat-input-footer">
              <span className="chat-hint">Enter zum Senden, Shift+Enter für neue Zeile</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default ChatPage;
