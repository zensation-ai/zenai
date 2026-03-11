/**
 * ChatSessionSidebar - Konversationsverlauf
 *
 * Zeigt alle Chat-Sessions für den aktuellen Kontext.
 * Ermöglicht Wechseln, Löschen und neue Sessions.
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import axios from 'axios';
import type { AIContext } from './ContextSwitcher';
import type { ChatSession } from './GeneralChat/types';
import { logError } from '../utils/errors';
import { showToast } from './Toast';
import './ChatSessionSidebar.css';

interface ChatSessionSidebarProps {
  context: AIContext;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function ChatSessionSidebarComponent({
  context,
  activeSessionId,
  onSelectSession,
  onNewChat,
  collapsed,
  onToggleCollapse,
}: ChatSessionSidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSessions = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      setLoading(true);
      const res = await axios.get(
        `/api/chat/sessions?context=${context}&limit=50`,
        { signal: abortRef.current.signal }
      );
      setSessions(res.data.sessions || []);
    } catch (err) {
      if (!axios.isCancel(err)) {
        logError('ChatSessionSidebar:fetch', err);
      }
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    fetchSessions();
    return () => { abortRef.current?.abort(); };
  }, [fetchSessions]);

  // Refresh when activeSessionId changes (new session created)
  useEffect(() => {
    if (activeSessionId) {
      fetchSessions();
    }
  }, [activeSessionId, fetchSessions]);

  // Refresh when a new message is sent (session title/updatedAt may change)
  useEffect(() => {
    const handler = () => { fetchSessions(); };
    window.addEventListener('zenai-chat-message-sent', handler);
    return () => { window.removeEventListener('zenai-chat-message-sent', handler); };
  }, [fetchSessions]);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    try {
      await axios.delete(`/api/chat/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        onNewChat();
      }
      showToast('Konversation gelöscht', 'success');
    } catch (err) {
      logError('ChatSessionSidebar:delete', err);
      showToast('Konnte nicht gelöscht werden', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Unbekannt';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Unbekannt';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return 'Heute';
    if (diffDays === 1) return 'Gestern';
    if (diffDays < 7) return `Vor ${diffDays} Tagen`;
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  };

  const filtered = search.trim()
    ? sessions.filter(s =>
        s.title?.toLowerCase().includes(search.toLowerCase())
      )
    : sessions;

  // Group sessions by date category
  const grouped = groupByDate(filtered);

  if (collapsed) {
    return (
      <div className="chat-sidebar collapsed">
        <button
          type="button"
          className="chat-sidebar-toggle neuro-focus-ring"
          onClick={onToggleCollapse}
          title="Verlauf anzeigen"
          aria-label="Konversationsverlauf anzeigen"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button
          type="button"
          className="chat-sidebar-new-mini neuro-focus-ring"
          onClick={onNewChat}
          title="Neuer Chat"
          aria-label="Neuen Chat starten"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <h3 className="chat-sidebar-title">Konversationen</h3>
        <button
          type="button"
          className="chat-sidebar-toggle neuro-focus-ring"
          onClick={onToggleCollapse}
          title="Verlauf ausblenden"
          aria-label="Konversationsverlauf ausblenden"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        className="chat-sidebar-new neuro-focus-ring"
        onClick={onNewChat}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Neuer Chat
      </button>

      {sessions.length > 5 && (
        <div className="chat-sidebar-search">
          <input
            type="text"
            placeholder="Suchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="chat-sidebar-search-input"
            aria-label="Konversationen durchsuchen"
          />
        </div>
      )}

      <div className="chat-sidebar-list" role="list">
        {loading ? (
          <div className="chat-sidebar-loading">
            <div className="loading-spinner" aria-label="Lade Konversationen" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="chat-sidebar-empty">
            {search ? 'Keine Treffer' : 'Noch keine Konversationen'}
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.label} className="chat-sidebar-group">
              <div className="chat-sidebar-group-label">{group.label}</div>
              {group.sessions.map(session => (
                <button
                  key={session.id}
                  type="button"
                  role="listitem"
                  className={`chat-sidebar-item neuro-focus-ring ${session.id === activeSessionId ? 'active' : ''}`}
                  onClick={() => onSelectSession(session.id)}
                  title={session.title || 'Unbenannte Konversation'}
                >
                  <span className="chat-sidebar-item-title">
                    {session.title || 'Neue Konversation'}
                  </span>
                  <span className="chat-sidebar-item-date">
                    {formatDate(session.updatedAt)}
                  </span>
                  <button
                    type="button"
                    className="chat-sidebar-item-delete"
                    onClick={(e) => handleDelete(e, session.id)}
                    disabled={deletingId === session.id}
                    title="Löschen"
                    aria-label={`Konversation "${session.title || 'Unbenannt'}" löschen`}
                  >
                    {deletingId === session.id ? '...' : '×'}
                  </button>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function groupByDate(sessions: ChatSession[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const monthAgo = new Date(today.getTime() - 30 * 86400000);

  const groups: { label: string; sessions: ChatSession[] }[] = [
    { label: 'Heute', sessions: [] },
    { label: 'Gestern', sessions: [] },
    { label: 'Letzte 7 Tage', sessions: [] },
    { label: 'Letzte 30 Tage', sessions: [] },
    { label: 'Älter', sessions: [] },
  ];

  for (const session of sessions) {
    const date = new Date(session.updatedAt);
    if (isNaN(date.getTime())) {
      groups[4].sessions.push(session); // Invalid dates go to "Älter"
      continue;
    }
    if (date >= today) groups[0].sessions.push(session);
    else if (date >= yesterday) groups[1].sessions.push(session);
    else if (date >= weekAgo) groups[2].sessions.push(session);
    else if (date >= monthAgo) groups[3].sessions.push(session);
    else groups[4].sessions.push(session);
  }

  return groups.filter(g => g.sessions.length > 0);
}

export const ChatSessionSidebar = memo(ChatSessionSidebarComponent);
