import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { getErrorMessage } from '../utils/errors';
import { getTimeBasedGreeting, EMPTY_STATE_MESSAGES } from '../utils/aiPersonality';
import { getContextLabel } from './ContextSwitcher';
import type { AIContext } from './ContextSwitcher';
import { DigestCard } from './DigestCard';
import { DigestGoals } from './DigestGoals';
import type { GoalFormState } from './DigestGoals';
import { DigestEntry, ProductivityGoals, adaptDigest, adaptGoals } from './DigestTypes';
import '../neurodesign.css';
import './DigestDashboard.css';

interface DigestDashboardProps {
  onBack: () => void;
  context: AIContext;
}

export function DigestDashboard({ onBack, context }: DigestDashboardProps) {
  const greeting = getTimeBasedGreeting();
  const [latestDigest, setLatestDigest] = useState<DigestEntry | null>(null);
  const [digestHistory, setDigestHistory] = useState<DigestEntry[]>([]);
  const [goals, setGoals] = useState<ProductivityGoals | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<'daily' | 'weekly' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'latest' | 'history' | 'goals'>('latest');
  const [savingGoals, setSavingGoals] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const [latestRes, historyRes, goalsRes] = await Promise.all([
        axios.get(`/api/${context}/digest/latest`, { signal }).catch(() => ({ data: { data: null } })),
        axios.get(`/api/${context}/digest/history?limit=10`, { signal }).catch(() => ({ data: { data: [] } })),
        axios.get(`/api/${context}/digest/goals`, { signal }).catch(() => ({ data: { data: null } })),
      ]);

      setLatestDigest(adaptDigest(latestRes.data.data));
      const historyItems = (historyRes.data.data || []) as Record<string, unknown>[];
      setDigestHistory(historyItems.map(adaptDigest).filter((d): d is DigestEntry => d !== null));

      const goalsData = adaptGoals(goalsRes.data.data);
      if (goalsData) setGoals(goalsData);

      setError(null);
    } catch (err) {
      if (axios.isCancel(err)) return;
      setError(getErrorMessage(err, 'Laden fehlgeschlagen'));
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    loadData(abortControllerRef.current.signal);
    return () => { abortControllerRef.current?.abort(); };
  }, [loadData]);

  const handleGenerateDigest = async (type: 'daily' | 'weekly') => {
    try {
      setGenerating(type);
      const res = await axios.post(`/api/${context}/digest/generate/${type}`);
      const generated = adaptDigest(res.data.data);
      if (generated) {
        setLatestDigest(generated);
        setDigestHistory(prev => [generated, ...prev]);
      }
      showToast(`${type === 'daily' ? 'Tages' : 'Wochen'}zusammenfassung erstellt!`, 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Generierung fehlgeschlagen'), 'error');
    } finally {
      setGenerating(null);
    }
  };

  const handleSaveGoals = async (form: GoalFormState) => {
    try {
      setSavingGoals(true);
      await axios.put(`/api/${context}/digest/goals`, {
        dailyIdeasTarget: form.daily_ideas_target,
        weeklyIdeasTarget: form.weekly_ideas_target,
        focusCategories: form.focus_categories,
      });
      setGoals(form as ProductivityGoals);
      showToast('Ziele gespeichert!', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Speichern fehlgeschlagen'), 'error');
    } finally {
      setSavingGoals(false);
    }
  };

  if (loading) {
    return (
      <div className="digest-dashboard neuro-page-enter">
        <div className="loading-state neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Zusammenfassungen...</p>
          <p className="neuro-loading-submessage">Deine Produktivität wird analysiert</p>
        </div>
      </div>
    );
  }

  return (
    <div className="digest-dashboard neuro-page-enter">
      <div className="digest-header liquid-glass-nav">
        <button type="button" className="back-button neuro-hover-lift" onClick={onBack} aria-label="Zurück zur vorherigen Seite">
          ← Zurück
        </button>
        <div className="header-greeting">
          <h1>{greeting.emoji} Zusammenfassungen</h1>
          <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
        </div>
        <span className={`context-indicator ${context}`}>{getContextLabel(context)}</span>
        <div className="generate-buttons">
          <button type="button" className="generate-btn daily neuro-button" onClick={() => handleGenerateDigest('daily')} disabled={generating !== null} aria-label="Tagesdigest generieren">
            {generating === 'daily' ? '...' : '📅 Tagesdigest'}
          </button>
          <button type="button" className="generate-btn weekly neuro-button" onClick={() => handleGenerateDigest('weekly')} disabled={generating !== null} aria-label="Wochendigest generieren">
            {generating === 'weekly' ? '...' : '📆 Wochendigest'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fehlermeldung schließen">×</button>
        </div>
      )}

      <div className="digest-tabs">
        <button type="button" className={`tab-btn ${activeTab === 'latest' ? 'active' : ''}`} onClick={() => setActiveTab('latest')} aria-label="Aktuelle Zusammenfassung anzeigen" aria-current={activeTab === 'latest' ? 'page' : undefined}>
          📋 Aktuell
        </button>
        <button type="button" className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')} aria-label="Verlauf anzeigen" aria-current={activeTab === 'history' ? 'page' : undefined}>
          📜 Verlauf
          {digestHistory.length > 0 && <span className="badge">{digestHistory.length}</span>}
        </button>
        <button type="button" className={`tab-btn ${activeTab === 'goals' ? 'active' : ''}`} onClick={() => setActiveTab('goals')} aria-label="Ziele anzeigen" aria-current={activeTab === 'goals' ? 'page' : undefined}>
          🎯 Ziele
        </button>
      </div>

      {activeTab === 'latest' && (
        <div className="tab-content">
          {latestDigest ? (
            <DigestCard digest={latestDigest} variant="featured" />
          ) : (
            <div className="empty-state neuro-empty-state">
              <span className="neuro-empty-icon">📊</span>
              <h3 className="neuro-empty-title">Noch keine Zusammenfassung</h3>
              <p className="neuro-empty-description">Erstelle deine erste Tages- oder Wochenzusammenfassung.</p>
              <p className="neuro-empty-encouragement">{EMPTY_STATE_MESSAGES.ideas.encouragement}</p>
              <div className="empty-actions">
                <button type="button" className="generate-btn daily neuro-button" onClick={() => handleGenerateDigest('daily')} disabled={generating !== null} aria-label="Ersten Tagesdigest erstellen">
                  📅 Tagesdigest erstellen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="tab-content">
          {digestHistory.length === 0 ? (
            <div className="empty-state neuro-empty-state">
              <span className="neuro-empty-icon">📜</span>
              <h3 className="neuro-empty-title">Noch keine Zusammenfassungen</h3>
              <p className="neuro-empty-description">Deine Zusammenfassungen erscheinen hier.</p>
            </div>
          ) : (
            <div className="digest-history-list neuro-flow-list">
              {digestHistory.slice(0, 7).map((digest, index) => (
                <DigestCard key={digest.id} digest={digest} variant="compact" index={index} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'goals' && (
        <div className="tab-content">
          <DigestGoals goals={goals} savingGoals={savingGoals} onSaveGoals={handleSaveGoals} />
        </div>
      )}
    </div>
  );
}
