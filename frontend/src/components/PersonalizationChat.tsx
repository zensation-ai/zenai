import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import {
  AI_PERSONALITY,
  AI_AVATAR,
  EMPTY_STATE_MESSAGES,
  getRandomMessage,
  FEEDBACK_REACTIONS,
} from '../utils/aiPersonality';
import { getContextLabel } from './ContextSwitcher';
import './PersonalizationChat.css';
import '../neurodesign.css';
import { logError } from '../utils/errors';

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
  onBack?: () => void;
  context: string;
  embedded?: boolean;
}

const categoryLabels: Record<string, { label: string; icon: string }> = {
  // Backend topic keys (from personalization_topics table)
  basic_info: { label: 'Grundlegendes', icon: '👤' },
  personality: { label: 'Persönlichkeit', icon: '🧠' },
  work_life: { label: 'Arbeit & Beruf', icon: '💼' },
  goals_dreams: { label: 'Ziele & Träume', icon: '🎯' },
  interests_hobbies: { label: 'Interessen', icon: '❤️' },
  communication_style: { label: 'Kommunikation', icon: '💬' },
  decision_making: { label: 'Entscheidungen', icon: '🤔' },
  daily_routines: { label: 'Tagesablauf', icon: '⏰' },
  values_beliefs: { label: 'Werte', icon: '⭐' },
  challenges: { label: 'Herausforderungen', icon: '💪' },
  // Fact category keys (from personal_facts table)
  preferences: { label: 'Präferenzen', icon: '🎨' },
  work_style: { label: 'Arbeitsstil', icon: '🔧' },
  goals: { label: 'Ziele', icon: '🎯' },
  interests: { label: 'Interessen', icon: '❤️' },
  background: { label: 'Hintergrund', icon: '📚' },
  skills: { label: 'Fähigkeiten', icon: '🛠️' },
  communication: { label: 'Kommunikation', icon: '💬' },
};

const SESSION_STORAGE_KEY = 'zenai_personalization_session';

export function PersonalizationChat({ onBack, context, embedded }: PersonalizationChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(
    () => localStorage.getItem(SESSION_STORAGE_KEY)
  );
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

  const persistSessionId = useCallback((id: string) => {
    setSessionId(id);
    localStorage.setItem(SESSION_STORAGE_KEY, id);
  }, []);

  const startNewConversation = useCallback(async (signal?: AbortSignal) => {
    try {
      const startRes = await axios.get('/api/personalization/start', { signal });
      const data = startRes.data?.data || startRes.data;
      if (data?.sessionId) {
        persistSessionId(data.sessionId);
      }
      if (data?.message) {
        setMessages([{
          id: 'initial',
          role: 'assistant',
          content: data.message,
          timestamp: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      logError('PersonalizationChat:startNew', err);
    }
  }, [persistSessionId]);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);

      // Load facts, progress, summary in parallel
      const [factsRes, progressRes, summaryRes] = await Promise.all([
        axios.get('/api/personalization/facts', { signal }).catch(() => ({ data: { data: { factsByCategory: {} } } })),
        axios.get('/api/personalization/progress', { signal }).catch(() => ({ data: { data: { topics: [] } } })),
        axios.get('/api/personalization/summary', { signal }).catch(() => ({ data: { data: { summary: null } } })),
      ]);

      // Try loading existing conversation history
      const storedSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
      if (storedSessionId) {
        try {
          const historyRes = await axios.get('/api/personalization/history', {
            params: { session_id: storedSessionId },
            signal,
          });
          const history = historyRes.data?.data?.messages || [];
          if (history.length > 0) {
            setMessages(history.map((m: { role: string; content: string; created_at: string }, i: number) => ({
              id: `hist-${i}`,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: m.created_at,
            })));
            setSessionId(storedSessionId);
          } else {
            // Session exists but empty — start fresh
            await startNewConversation(signal);
          }
        } catch {
          // History load failed — start fresh
          await startNewConversation(signal);
        }
      } else {
        // No stored session — start fresh
        await startNewConversation(signal);
      }

      // Backend returns { success, data: { factsByCategory: { category: [fact, ...] }, totalFacts } }
      const factsData = factsRes.data?.data || factsRes.data;
      const allFacts: LearnedFact[] = [];
      if (factsData?.factsByCategory) {
        for (const [category, categoryFacts] of Object.entries(factsData.factsByCategory)) {
          for (const f of categoryFacts as Array<{ id: string; key: string; value: string; confidence: number; source: string; createdAt: string }>) {
            allFacts.push({
              id: f.id,
              category,
              fact: f.value,
              confidence: f.confidence,
              source: f.source,
              created_at: f.createdAt,
            });
          }
        }
      }
      setFacts(allFacts);

      // Backend wraps in { success, data: { topics, overallProgress, totalFactsLearned } }
      const progressData = progressRes.data?.data || progressRes.data;
      const progressItems: LearningProgress[] = (progressData?.topics || []).map((t: { topic: string; factsLearned: number; completionLevel: number }) => ({
        category: t.topic,
        facts_count: t.factsLearned,
        completeness: t.completionLevel,
      }));
      setProgress(progressItems);

      // Backend wraps in { success, data: { summary, factCount } }
      const summaryData = summaryRes.data?.data || summaryRes.data;
      setSummary(summaryData?.summary ? {
        summary: summaryData.summary,
        key_traits: summaryData.key_traits || [],
        interests: summaryData.interests || [],
        communication_style: summaryData.communication_style || '',
        generated_at: summaryData.generated_at || new Date().toISOString(),
      } : null);
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;
      logError('PersonalizationChat:loadData', err);
    } finally {
      setLoading(false);
    }
  }, [startNewConversation]);

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
        sessionId,
        message: userMessage.content,
        context,
      });

      const responseData = res.data?.data || res.data;

      // Persist sessionId from response if we didn't have one
      if (responseData?.sessionId && !sessionId) {
        persistSessionId(responseData.sessionId);
      }

      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: responseData?.response || res.data.response,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, aiMessage]);

      // Refresh facts if new ones were learned
      const newFacts = responseData?.newFacts || res.data.new_facts;
      if (newFacts && newFacts.length > 0) {
        // Backend returns {category, key, value} — map to LearnedFact shape
        const mappedFacts: LearnedFact[] = newFacts.map((f: { category: string; key: string; value: string }, i: number) => ({
          id: `new-${Date.now()}-${i}`,
          category: f.category,
          fact: f.value,
          confidence: 0.8,
          source: 'chat',
          created_at: new Date().toISOString(),
        }));
        setFacts(prev => [...mappedFacts, ...prev]);
        const reaction = FEEDBACK_REACTIONS.positive[Math.floor(Math.random() * FEEDBACK_REACTIONS.positive.length)];
        showToast(`${newFacts.length} neue(s) Fakt(en) gelernt! ${reaction}`, 'success');
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

  const rootClass = `personalization-chat neuro-page-enter${embedded ? ' personalization-embedded' : ''}`;

  if (loading) {
    return (
      <div className={rootClass}>
        <div className="neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Personalisierung...</p>
          <p className="neuro-loading-submessage">Einen Moment bitte</p>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {!embedded && (
        <div className="chat-header">
          <button type="button" className="back-button neuro-hover-lift" onClick={onBack}>
            ← Zurück
          </button>
          <h1>{AI_AVATAR.emoji} {AI_PERSONALITY.name} lernt dich kennen</h1>
          <span className={`context-indicator ${context}`}>
            {getContextLabel(context)}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="chat-tabs">
        <button
          type="button"
          className={`tab-btn neuro-press-effect ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          💬 Chat
        </button>
        <button
          type="button"
          className={`tab-btn neuro-press-effect ${activeTab === 'facts' ? 'active' : ''}`}
          onClick={() => setActiveTab('facts')}
        >
          📚 Fakten
          {facts.length > 0 && <span className="badge neuro-reward-badge">{facts.length}</span>}
        </button>
        <button
          type="button"
          className={`tab-btn neuro-press-effect ${activeTab === 'summary' ? 'active' : ''}`}
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

          {/* Empty state when no messages */}
          {messages.length === 0 && !sending && (
            <div className="chat-empty-state neuro-empty-state">
              <div className="empty-avatar neuro-breathing">{AI_AVATAR.emoji}</div>
              <h3 className="neuro-empty-title">{EMPTY_STATE_MESSAGES.personalization.title}</h3>
              <p className="neuro-empty-description">{EMPTY_STATE_MESSAGES.personalization.description}</p>
              <div className="chat-empty-categories">
                {Object.entries(categoryLabels).map(([key, { label, icon }]) => (
                  <span key={key} className="chat-empty-category-tag">
                    {icon} {label}
                  </span>
                ))}
              </div>
              <span className="empty-encouragement neuro-motivational">
                {EMPTY_STATE_MESSAGES.personalization.encouragement}
              </span>
            </div>
          )}

          {/* Messages */}
          {(messages.length > 0 || sending) && (
            <div className="messages-container neuro-flow-list">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`message ${message.role} neuro-human-fade-in`}
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
                <div className="message assistant neuro-human-fade-in">
                  <div className="message-avatar" title={AI_PERSONALITY.name}>{AI_AVATAR.thinkingEmoji}</div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-name">{AI_PERSONALITY.name}</span>
                      <span className="message-status neuro-motivational">{getRandomMessage('learning')}</span>
                    </div>
                    <div className="neuro-typing">
                      <span className="neuro-typing-dot"></span>
                      <span className="neuro-typing-dot"></span>
                      <span className="neuro-typing-dot"></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

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
              type="button"
              className="send-button neuro-button"
              onClick={handleSendMessage}
              disabled={sending || !inputValue.trim()}
            >
              {sending ? '...' : '→'}
            </button>
          </div>
          <div className="chat-footer">
            <p className="chat-hint">Enter zum Senden, Shift+Enter für neue Zeile</p>
            {messages.length > 2 && (
              <button
                type="button"
                className="new-conversation-btn"
                onClick={async () => {
                  localStorage.removeItem(SESSION_STORAGE_KEY);
                  setMessages([]);
                  setSessionId(null);
                  await startNewConversation();
                }}
              >
                Neues Gespräch
              </button>
            )}
          </div>
        </div>
      )}

      {/* Facts Tab */}
      {activeTab === 'facts' && (
        <div className="facts-container">
          {facts.length === 0 ? (
            <div className="empty-state neuro-empty-state">
              <div className="empty-avatar neuro-breathing">{AI_AVATAR.curiousEmoji}</div>
              <h3 className="neuro-empty-title">{EMPTY_STATE_MESSAGES.personalization.title}</h3>
              <p className="neuro-empty-description">Chatte mit {AI_PERSONALITY.name}, damit ich dich besser kennenlernen kann.</p>
              <span className="empty-encouragement neuro-motivational">{EMPTY_STATE_MESSAGES.personalization.encouragement}</span>
              <button
                type="button"
                className="action-btn neuro-button"
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
                          type="button"
                          className="delete-fact-btn neuro-press-effect"
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
            <div className="summary-card liquid-glass neuro-human-fade-in">
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
                <div className="summary-section neuro-stagger-item">
                  <h4>🎭 Wesentliche Eigenschaften</h4>
                  <div className="trait-tags">
                    {summary.key_traits.map((trait, i) => (
                      <span key={i} className="trait-tag neuro-reward-badge">{trait}</span>
                    ))}
                  </div>
                </div>
              )}

              {summary.interests.length > 0 && (
                <div className="summary-section neuro-stagger-item">
                  <h4>❤️ Interessen</h4>
                  <div className="interest-tags">
                    {summary.interests.map((interest, i) => (
                      <span key={i} className="interest-tag neuro-reward-badge">{interest}</span>
                    ))}
                  </div>
                </div>
              )}

              {summary.communication_style && (
                <div className="summary-section neuro-stagger-item">
                  <h4>💬 Kommunikationsstil</h4>
                  <p className="communication-style">{summary.communication_style}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state neuro-empty-state">
              <div className="empty-avatar neuro-breathing">{AI_AVATAR.curiousEmoji}</div>
              <h3 className="neuro-empty-title">Noch keine Zusammenfassung</h3>
              <p className="neuro-empty-description">Erzähl {AI_PERSONALITY.name} mehr über dich, damit ich eine Zusammenfassung erstellen kann.</p>
              <span className="empty-encouragement neuro-motivational">Je mehr wir plaudern, desto besser verstehe ich dich!</span>
              <button
                type="button"
                className="action-btn neuro-button"
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
