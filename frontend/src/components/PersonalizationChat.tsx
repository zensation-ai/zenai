import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { AI_PERSONALITY, AI_AVATAR, FEEDBACK_REACTIONS } from '../utils/aiPersonality';
import { getContextLabel } from './ContextSwitcher';
import { PersonalizationMessages } from './PersonalizationMessages';
import { PersonalizationFacts } from './PersonalizationFacts';
import { PersonalizationSummary } from './PersonalizationSummary';
import { logError } from '../utils/errors';
import './PersonalizationChat.css';
import '../neurodesign.css';

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

      const [factsRes, progressRes, summaryRes] = await Promise.all([
        axios.get('/api/personalization/facts', { signal }).catch(() => ({ data: { data: { factsByCategory: {} } } })),
        axios.get('/api/personalization/progress', { signal }).catch(() => ({ data: { data: { topics: [] } } })),
        axios.get('/api/personalization/summary', { signal }).catch(() => ({ data: { data: { summary: null } } })),
      ]);

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
            await startNewConversation(signal);
          }
        } catch {
          await startNewConversation(signal);
        }
      } else {
        await startNewConversation(signal);
      }

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

      const progressData = progressRes.data?.data || progressRes.data;
      const progressItems: LearningProgress[] = (progressData?.topics || []).map((t: { topic: string; factsLearned: number; completionLevel: number }) => ({
        category: t.topic,
        facts_count: t.factsLearned,
        completeness: t.completionLevel,
      }));
      setProgress(progressItems);

      const summaryData = summaryRes.data?.data || summaryRes.data;
      setSummary(summaryData?.summary ? {
        summary: summaryData.summary,
        key_traits: summaryData.key_traits || [],
        interests: summaryData.interests || [],
        communication_style: summaryData.communication_style || '',
        generated_at: summaryData.generated_at || new Date().toISOString(),
      } : null);
    } catch (err) {
      if (axios.isCancel(err)) return;
      logError('PersonalizationChat:loadData', err);
    } finally {
      setLoading(false);
    }
  }, [startNewConversation]);

  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    loadData(abortControllerRef.current.signal);
    return () => { abortControllerRef.current?.abort(); };
  }, [context, loadData]);

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

      const newFacts = responseData?.newFacts || res.data.new_facts;
      if (newFacts && newFacts.length > 0) {
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
    } catch {
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

  const switchToChat = () => setActiveTab('chat');

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

      <div className="chat-tabs">
        <button type="button" className={`tab-btn neuro-press-effect ${activeTab === 'chat' ? 'active' : ''}`} onClick={switchToChat}>
          💬 Chat
        </button>
        <button type="button" className={`tab-btn neuro-press-effect ${activeTab === 'facts' ? 'active' : ''}`} onClick={() => setActiveTab('facts')}>
          📚 Fakten
          {facts.length > 0 && <span className="badge neuro-reward-badge">{facts.length}</span>}
        </button>
        <button type="button" className={`tab-btn neuro-press-effect ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>
          📋 Zusammenfassung
        </button>
      </div>

      {activeTab === 'chat' && (
        <div className="chat-container">
          {progress.length > 0 && (
            <div className="progress-overview">
              {progress.map(p => (
                <div key={p.category} className="progress-item">
                  <span className="progress-icon">{categoryLabels[p.category]?.icon || '📌'}</span>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={{ width: `${p.completeness * 100}%` }} />
                  </div>
                  <span className="progress-count">{p.facts_count}</span>
                </div>
              ))}
            </div>
          )}

          <PersonalizationMessages messages={messages} sending={sending} categoryLabels={categoryLabels} />

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
            <button type="button" className="send-button neuro-button" onClick={handleSendMessage} disabled={sending || !inputValue.trim()}>
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

      {activeTab === 'facts' && (
        <PersonalizationFacts
          facts={facts}
          deletingFact={deletingFact}
          categoryLabels={categoryLabels}
          onDeleteFact={handleDeleteFact}
          onSwitchToChat={switchToChat}
        />
      )}

      {activeTab === 'summary' && (
        <PersonalizationSummary summary={summary} onSwitchToChat={switchToChat} />
      )}
    </div>
  );
}
