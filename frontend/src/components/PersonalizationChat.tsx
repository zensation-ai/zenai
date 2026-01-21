import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import {
  AI_PERSONALITY,
  AI_AVATAR,
  EMPTY_STATE_MESSAGES,
  getRandomMessage,
} from '../utils/aiPersonality';
import './PersonalizationChat.css';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface LearnedFact {
  id: string;
  category: string;
  fact: string;
  confidence: number;
  source: string;
  created_at: string;
}

interface LearningProgress {
  category: string;
  facts_count: number;
  completeness: number;
}

interface UserSummary {
  summary: string;
  key_traits: string[];
  interests: string[];
  communication_style: string;
  generated_at: string;
}

interface PersonalizationChatProps {
  onBack: () => void;
  context: string;
}

const categoryLabels: Record<string, { label: string; icon: string }> = {
  personality: { label: 'Persönlichkeit', icon: '🧠' },
  preferences: { label: 'Präferenzen', icon: '⭐' },
  work_style: { label: 'Arbeitsstil', icon: '💼' },
  communication: { label: 'Kommunikation', icon: '💬' },
  goals: { label: 'Ziele', icon: '🎯' },
  interests: { label: 'Interessen', icon: '❤️' },
  background: { label: 'Hintergrund', icon: '📚' },
  skills: { label: 'Fähigkeiten', icon: '🛠️' },
};

export function PersonalizationChat({ onBack, context }: PersonalizationChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [facts, setFacts] = useState<LearnedFact[]>([]);
  const [progress, setProgress] = useState<LearningProgress[]>([]);
  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'facts' | 'summary'>('chat');
  const [deletingFact, setDeletingFact] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // AbortController ref to prevent memory leaks on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const [startRes, factsRes, progressRes, summaryRes] = await Promise.all([
        axios.get('/api/personalization/start', { signal }).catch(() => ({ data: { question: null } })),
        axios.get('/api/personalization/facts', { signal }).catch(() => ({ data: { facts: [] } })),
        axios.get('/api/personalization/progress', { signal }).catch(() => ({ data: { progress: [] } })),
        axios.get('/api/personalization/summary', { signal }).catch(() => ({ data: { summary: null } })),
      ]);

      // Add initial AI message if no messages yet
      if (startRes.data.question && messages.length === 0) {
        setMessages([{
          id: 'initial',
          role: 'assistant',
          content: startRes.data.question,
          timestamp: new Date().toISOString(),
        }]);
      }

      setFacts(factsRes.data.facts || []);
      setProgress(progressRes.data.progress || []);
      setSummary(summaryRes.data.summary);
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;
      console.error('Failed to load personalization data:', err);
    } finally {
      setLoading(false);
    }
  }, [messages.length]);

  useEffect(() => {
    // Abort any previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    loadData(abortControllerRef.current.signal);

    // Cleanup: abort on unmount or context change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [context, loadData]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || sending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setSending(true);

    try {
      const res = await axios.post('/api/personalization/chat', {
        message: userMessage.content,
        context,
      });

      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: res.data.response,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, aiMessage]);

      // Refresh facts if new ones were learned
      if (res.data.new_facts && res.data.new_facts.length > 0) {
        setFacts(prev => [...res.data.new_facts, ...prev]);
        showToast(`${res.data.new_facts.length} neue(s) Fakt(en) gelernt!`, 'success');
      }
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Nachricht fehlgeschlagen'
        : 'Nachricht fehlgeschlagen';
      showToast(message, 'error');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleDeleteFact = async (factId: string) => {
    try {
      setDeletingFact(factId);
      await axios.delete(`/api/personalization/facts/${factId}`);
      setFacts(prev => prev.filter(f => f.id !== factId));
      showToast('Fakt gelöscht', 'success');
    } catch (err) {
      showToast('Löschen fehlgeschlagen', 'error');
    } finally {
      setDeletingFact(null);
    }
  };

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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return '#22c55e';
    if (confidence >= 0.6) return '#f59e0b';
    return '#9ca3af';
  };

  if (loading) {
    return (
      <div className="personalization-chat">
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Lade Personalisierung...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="personalization-chat">
      <div className="chat-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h1>{AI_AVATAR.emoji} {AI_PERSONALITY.name} lernt dich kennen</h1>
        <span className={`context-indicator ${context}`}>
          {context === 'personal' ? '🏠 Privat' : '💼 Arbeit'}
        </span>
      </div>

      {/* Tabs */}
      <div className="chat-tabs">
        <button
          className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          💬 Chat
        </button>
        <button
          className={`tab-btn ${activeTab === 'facts' ? 'active' : ''}`}
          onClick={() => setActiveTab('facts')}
        >
          📚 Fakten
          {facts.length > 0 && <span className="badge">{facts.length}</span>}
        </button>
        <button
          className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          📋 Zusammenfassung
        </button>
      </div>

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <div className="chat-container">
          {/* Progress Overview */}
          {progress.length > 0 && (
            <div className="progress-overview">
              {progress.map(p => (
                <div key={p.category} className="progress-item">
                  <span className="progress-icon">
                    {categoryLabels[p.category]?.icon || '📌'}
                  </span>
                  <div className="progress-bar-container">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${p.completeness * 100}%` }}
                    />
                  </div>
                  <span className="progress-count">{p.facts_count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Messages */}
          <div className="messages-container">
            {messages.map(message => (
              <div
                key={message.id}
                className={`message ${message.role}`}
              >
                <div className="message-avatar" title={message.role === 'assistant' ? AI_PERSONALITY.name : 'Du'}>
                  {message.role === 'assistant' ? AI_AVATAR.emoji : '👤'}
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-name">
                      {message.role === 'assistant' ? AI_PERSONALITY.name : 'Du'}
                    </span>
                    <span className="message-time">{formatTime(message.timestamp)}</span>
                  </div>
                  <p>{message.content}</p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="message assistant">
                <div className="message-avatar" title={AI_PERSONALITY.name}>{AI_AVATAR.thinkingEmoji}</div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-name">{AI_PERSONALITY.name}</span>
                    <span className="message-status">{getRandomMessage('learning')}</span>
                  </div>
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-container">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Erzähl mir etwas über dich..."
              rows={2}
              disabled={sending}
            />
            <button
              className="send-button"
              onClick={handleSendMessage}
              disabled={sending || !inputValue.trim()}
            >
              {sending ? '...' : '→'}
            </button>
          </div>
          <p className="chat-hint">Enter zum Senden, Shift+Enter für neue Zeile</p>
        </div>
      )}

      {/* Facts Tab */}
      {activeTab === 'facts' && (
        <div className="facts-container">
          {facts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-avatar">{AI_AVATAR.curiousEmoji}</div>
              <h3>{EMPTY_STATE_MESSAGES.personalization.title}</h3>
              <p>Chatte mit {AI_PERSONALITY.name}, damit ich dich besser kennenlernen kann.</p>
              <span className="empty-encouragement">{EMPTY_STATE_MESSAGES.personalization.encouragement}</span>
              <button
                className="action-btn"
                onClick={() => setActiveTab('chat')}
              >
                💬 Zum Chat
              </button>
            </div>
          ) : (
            <>
              {/* Facts by Category */}
              {Object.entries(
                facts.reduce((acc, fact) => {
                  const cat = fact.category || 'other';
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(fact);
                  return acc;
                }, {} as Record<string, LearnedFact[]>)
              ).map(([category, categoryFacts]) => (
                <div key={category} className="facts-category">
                  <h3>
                    {categoryLabels[category]?.icon || '📌'}{' '}
                    {categoryLabels[category]?.label || category}
                    <span className="facts-count">{categoryFacts.length}</span>
                  </h3>
                  <div className="facts-list">
                    {categoryFacts.map(fact => (
                      <div key={fact.id} className="fact-card">
                        <div className="fact-content">
                          <p>{fact.fact}</p>
                          <div className="fact-meta">
                            <span
                              className="confidence-badge"
                              style={{ background: getConfidenceColor(fact.confidence) }}
                            >
                              {Math.round(fact.confidence * 100)}%
                            </span>
                            <span className="fact-date">{formatDate(fact.created_at)}</span>
                          </div>
                        </div>
                        <button
                          className="delete-fact-btn"
                          onClick={() => handleDeleteFact(fact.id)}
                          disabled={deletingFact === fact.id}
                          title="Fakt löschen"
                        >
                          {deletingFact === fact.id ? '...' : '✕'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="summary-container">
          {summary ? (
            <div className="summary-card">
              <div className="summary-header">
                <h3>📋 Dein Profil-Summary</h3>
                <span className="summary-date">
                  Erstellt: {formatDate(summary.generated_at)}
                </span>
              </div>

              <div className="summary-content">
                <p className="summary-text">{summary.summary}</p>
              </div>

              {summary.key_traits.length > 0 && (
                <div className="summary-section">
                  <h4>🎭 Wesentliche Eigenschaften</h4>
                  <div className="trait-tags">
                    {summary.key_traits.map((trait, i) => (
                      <span key={i} className="trait-tag">{trait}</span>
                    ))}
                  </div>
                </div>
              )}

              {summary.interests.length > 0 && (
                <div className="summary-section">
                  <h4>❤️ Interessen</h4>
                  <div className="interest-tags">
                    {summary.interests.map((interest, i) => (
                      <span key={i} className="interest-tag">{interest}</span>
                    ))}
                  </div>
                </div>
              )}

              {summary.communication_style && (
                <div className="summary-section">
                  <h4>💬 Kommunikationsstil</h4>
                  <p className="communication-style">{summary.communication_style}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-avatar">{AI_AVATAR.curiousEmoji}</div>
              <h3>Noch keine Zusammenfassung</h3>
              <p>Erzähl {AI_PERSONALITY.name} mehr über dich, damit ich eine Zusammenfassung erstellen kann.</p>
              <span className="empty-encouragement">Je mehr wir plaudern, desto besser verstehe ich dich!</span>
              <button
                className="action-btn"
                onClick={() => setActiveTab('chat')}
              >
                💬 Zum Chat
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
