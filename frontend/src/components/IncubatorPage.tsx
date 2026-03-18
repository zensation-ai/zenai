/**
 * Thought Incubator Page - Neuro-UX Optimized 2026
 *
 * Displays loose thoughts that are incubating into structured ideas.
 * Shows clusters of related thoughts and allows consolidation.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { getTimeBasedGreeting, getRandomReward, AI_PERSONALITY, DOPAMINE_REWARDS } from '../utils/aiPersonality';
import { IncubatorQuickInput } from './IncubatorQuickInput';
import { IncubatorClusterCard } from './IncubatorClusterCard';
import type { ThoughtCluster, IncubatorStats } from './IncubatorTypes';
import { MILLER_CHUNK_SIZE } from './IncubatorTypes';
import { logError } from '../utils/errors';
import { useContextState } from './ContextSwitcher';
import './IncubatorPage.css';
import '../neurodesign.css';

interface Props {
  onBack: () => void;
  onIdeaCreated?: (ideaId: string) => void;
  embedded?: boolean;
}

export function IncubatorPage({ onBack, onIdeaCreated, embedded }: Props) {
  const [context] = useContextState();
  const [clusters, setClusters] = useState<ThoughtCluster[]>([]);
  const [stats, setStats] = useState<IncubatorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickThought, setQuickThought] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [consolidating, setConsolidating] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState<{ emoji: string; message: string } | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const isMountedRef = useRef<boolean>(true);
  const timeoutRef = useRef<number | null>(null);
  const celebrationTimeoutRef = useRef<number | null>(null);

  const greeting = useMemo(() => getTimeBasedGreeting(), []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const loadData = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    try {
      const [clustersRes, statsRes] = await Promise.all([
        axios.get('/api/incubator/clusters', { params: { context } }),
        axios.get('/api/incubator/stats', { params: { context } }),
      ]);
      if (isMountedRef.current) {
        setClusters(clustersRes.data.clusters);
        setStats(statsRes.data);
      }
    } catch (error) {
      logError('IncubatorPage:loadData', error);
      if (isMountedRef.current) showToast('Inkubator konnte nicht geladen werden', 'error');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    isMountedRef.current = true;
    loadData();
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current);
    };
  }, [loadData]);

  const triggerCelebration = useCallback((message: string, emoji: string) => {
    if (prefersReducedMotion) {
      showToast(`${emoji} ${message}`, 'success');
      return;
    }
    setCelebrationMessage({ emoji, message });
    setShowCelebration(true);
    celebrationTimeoutRef.current = window.setTimeout(() => {
      if (isMountedRef.current) { setShowCelebration(false); setCelebrationMessage(null); }
    }, 2500);
  }, [prefersReducedMotion]);

  const submitQuickThought = async () => {
    if (!quickThought.trim()) return;
    setSubmitting(true);
    try {
      await axios.post('/api/incubator/thought', { text: quickThought, source: 'quick_jot', context });
      if (isMountedRef.current) {
        setQuickThought('');
        const reward = getRandomReward('ideaCreated');
        showToast(`${reward.emoji} ${reward.message}`, 'success');
        timeoutRef.current = window.setTimeout(() => { if (isMountedRef.current) loadData(); }, 500);
      }
    } catch (error) {
      logError('IncubatorPage:submitThought', error);
      if (isMountedRef.current) showToast('Gedanke konnte nicht gespeichert werden', 'error');
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  };

  const generateSummary = async (clusterId: string) => {
    setSummarizing(clusterId);
    try {
      const response = await axios.post(`/api/incubator/clusters/${clusterId}/summarize`, { context });
      if (isMountedRef.current) {
        setClusters(clusters.map(c =>
          c.id === clusterId
            ? { ...c, title: response.data.title, summary: response.data.summary, suggested_type: response.data.suggested_type, suggested_category: response.data.suggested_category }
            : c
        ));
        showToast('Zusammenfassung erstellt', 'success');
      }
    } catch (error) {
      logError('IncubatorPage:generateSummary', error);
      if (isMountedRef.current) showToast('Zusammenfassung fehlgeschlagen', 'error');
    } finally {
      if (isMountedRef.current) setSummarizing(null);
    }
  };

  const consolidateCluster = async (clusterId: string) => {
    setConsolidating(clusterId);
    try {
      const response = await axios.post(`/api/incubator/clusters/${clusterId}/consolidate`, { context });
      if (isMountedRef.current) {
        const milestoneRewards = DOPAMINE_REWARDS.milestoneReached;
        const randomMilestone = milestoneRewards[Math.floor(Math.random() * milestoneRewards.length)];
        triggerCelebration('Idee erfolgreich erstellt!', randomMilestone.emoji);
        loadData();
        if (onIdeaCreated) onIdeaCreated(response.data.ideaId);
      }
    } catch (error) {
      logError('IncubatorPage:consolidateCluster', error);
      if (isMountedRef.current) showToast('Konsolidierung fehlgeschlagen', 'error');
    } finally {
      if (isMountedRef.current) setConsolidating(null);
    }
  };

  const dismissCluster = async (clusterId: string) => {
    try {
      await axios.post(`/api/incubator/clusters/${clusterId}/dismiss`, { context });
      if (isMountedRef.current) { showToast('Cluster verworfen', 'info'); loadData(); }
    } catch (error) {
      logError('IncubatorPage:dismissCluster', error);
      if (isMountedRef.current) showToast('Verwerfen fehlgeschlagen', 'error');
    }
  };

  const readyClusters = clusters.filter(c => c.status === 'ready');
  const growingClusters = clusters.filter(c => c.status === 'growing');
  const chunkedReadyClusters = readyClusters.slice(0, MILLER_CHUNK_SIZE);
  const hasMoreReadyClusters = readyClusters.length > MILLER_CHUNK_SIZE;
  const chunkedGrowingClusters = growingClusters.slice(0, MILLER_CHUNK_SIZE);
  const hasMoreGrowingClusters = growingClusters.length > MILLER_CHUNK_SIZE;

  return (
    <div className="incubator-page neuro-page-enter">
      {showCelebration && celebrationMessage && (
        <div className="neuro-variable-reward" role="alert" aria-live="polite">
          <span className="reward-emoji">{celebrationMessage.emoji}</span>
          <span>{celebrationMessage.message}</span>
        </div>
      )}

      {!embedded && (
        <header className="incubator-header liquid-glass-dark">
          <button className="back-button neuro-hover-lift neuro-anticipate" onClick={onBack} data-anticipate="Zurück zur Übersicht" aria-label="Zurück zur Hauptseite">← Zurück</button>
          <div className="header-title">
            <h1 className="neuro-greeting-adaptive">
              <span className="greeting-emoji" aria-hidden="true">{greeting.emoji}</span>{' '}Gedanken-Inkubator
            </h1>
            <span className="subtitle neuro-subtext-emotional">{greeting.subtext}</span>
          </div>
          <button className="refresh-button neuro-hover-lift neuro-anticipate" onClick={loadData} data-anticipate="Daten aktualisieren" aria-label="Inkubator aktualisieren">↻ Aktualisieren</button>
        </header>
      )}

      <IncubatorQuickInput
        quickThought={quickThought}
        submitting={submitting}
        suggestedAction={greeting.suggestedAction}
        onQuickThoughtChange={setQuickThought}
        onSubmit={submitQuickThought}
      />

      {stats && (
        <section className="incubator-stats neuro-flow-list" aria-label="Inkubator-Statistiken">
          <div className="stat-card neuro-chunk neuro-stagger-item"><span className="stat-value">{stats.total_thoughts}</span><span className="stat-label">Gedanken</span></div>
          <div className="stat-card neuro-chunk neuro-stagger-item"><span className="stat-value">{stats.growing_clusters}</span><span className="stat-label">Wachsend</span></div>
          <div className="stat-card highlight neuro-chunk neuro-stagger-item neuro-heartbeat"><span className="stat-value">{stats.ready_clusters}</span><span className="stat-label">Bereit</span></div>
          <div className="stat-card neuro-chunk neuro-stagger-item"><span className="stat-value">{stats.consolidated_clusters}</span><span className="stat-label">Konsolidiert</span></div>
        </section>
      )}

      {loading ? (
        <div className="loading-state neuro-loading-contextual" aria-live="polite" aria-busy="true">
          <div className="neuro-loading-spinner" aria-hidden="true" />
          <p className="neuro-loading-message">Lade Inkubator...</p>
          <p className="neuro-loading-submessage">Deine Gedanken werden organisiert</p>
          <div className="skeleton-preview">
            <div className="neuro-skeleton" aria-hidden="true" />
            <div className="neuro-skeleton" aria-hidden="true" />
            <div className="neuro-skeleton" aria-hidden="true" />
          </div>
        </div>
      ) : (
        <>
          {chunkedReadyClusters.length > 0 && (
            <section className="clusters-section ready-section neuro-chunk" aria-labelledby="ready-clusters-heading">
              <h2 id="ready-clusters-heading"><span className="section-icon" aria-hidden="true">✨</span> Bereit zur Konsolidierung <span className="badge">{readyClusters.length}</span></h2>
              <div className="clusters-grid neuro-flow-list">
                {chunkedReadyClusters.map((cluster, index) => (
                  <IncubatorClusterCard key={cluster.id} cluster={cluster} index={index} variant="ready" summarizing={summarizing} consolidating={consolidating} onSummarize={generateSummary} onConsolidate={consolidateCluster} onDismiss={dismissCluster} />
                ))}
              </div>
              {hasMoreReadyClusters && (
                <div className="more-clusters-hint neuro-inspirational"><span aria-hidden="true">↓</span> {readyClusters.length - MILLER_CHUNK_SIZE} weitere Cluster verfügbar</div>
              )}
            </section>
          )}

          {chunkedGrowingClusters.length > 0 && (
            <section className="clusters-section growing-section neuro-chunk" aria-labelledby="growing-clusters-heading">
              <h2 id="growing-clusters-heading"><span className="section-icon" aria-hidden="true">🌱</span> Wachsende Themen <span className="badge muted">{growingClusters.length}</span></h2>
              <div className="clusters-grid compact neuro-flow-list">
                {chunkedGrowingClusters.map((cluster, index) => (
                  <IncubatorClusterCard key={cluster.id} cluster={cluster} index={index} variant="growing" summarizing={summarizing} consolidating={consolidating} onSummarize={generateSummary} onConsolidate={consolidateCluster} onDismiss={dismissCluster} />
                ))}
              </div>
              {hasMoreGrowingClusters && (
                <div className="more-clusters-hint neuro-inspirational"><span aria-hidden="true">↓</span> {growingClusters.length - MILLER_CHUNK_SIZE} weitere Cluster wachsen</div>
              )}
            </section>
          )}

          {clusters.length === 0 && (
            <div className="incubator-empty" role="status">
              <div className="incubator-empty-icon" aria-hidden="true">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="18" y="8" width="28" height="4" rx="2" fill="currentColor" opacity="0.3" />
                  <path d="M22 12V28C22 28 16 34 16 42C16 50 22 54 32 54C42 54 48 50 48 42C48 34 42 28 42 28V12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
                  <circle cx="28" cy="38" r="2.5" fill="currentColor" opacity="0.4" />
                  <circle cx="36" cy="34" r="2" fill="currentColor" opacity="0.3" />
                  <circle cx="32" cy="44" r="3" fill="currentColor" opacity="0.5" />
                  <path d="M26 54C26 54 26 58 32 58C38 58 38 54 38 54" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                </svg>
              </div>
              <h3 className="incubator-empty-title">Der Inkubator wartet</h3>
              <p className="incubator-empty-desc">
                Hier entstehen aus losen Gedanken strukturierte Ideen. Erfasse Gedanken im Tab &bdquo;Gedanken&ldquo; &ndash;
                {AI_PERSONALITY.name} erkennt automatisch Muster und bildet Cluster.
              </p>
              <div className="incubator-empty-features">
                <span className="incubator-empty-feature"><span aria-hidden="true">🔍</span> Muster erkennen</span>
                <span className="incubator-empty-feature"><span aria-hidden="true">🧩</span> Cluster bilden</span>
                <span className="incubator-empty-feature"><span aria-hidden="true">🌱</span> Ideen reifen</span>
              </div>
              <button type="button" className="incubator-empty-cta" onClick={onBack}>Gedanken erfassen</button>
            </div>
          )}
        </>
      )}

      <style>{`
        .cluster-mood-fresh { border-left: 3px solid var(--neuro-success, #10b981); }
        .cluster-mood-aging { border-left: 3px solid var(--neuro-anticipation, #8b5cf6); }
        .cluster-mood-dormant { border-left: 3px solid var(--neuro-reward, #ff6b35); }
        .dormant-reminder { margin: 0.5rem 0 1rem; font-size: 0.8rem; }
        .thoughts-toggle { background: none; border: none; width: 100%; text-align: left; cursor: pointer; padding: 0; color: inherit; }
        .thoughts-toggle h4 { display: flex; align-items: center; justify-content: space-between; margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--text-muted); font-weight: 500; }
        .toggle-icon { font-size: 0.7rem; opacity: 0.7; transition: transform var(--neuro-timing-quick, 150ms) ease; }
        .thoughts-toggle[aria-expanded="true"] .toggle-icon { transform: rotate(0deg); }
        .more-clusters-hint { text-align: center; margin-top: 1.5rem; padding: 0.75rem; background: var(--surface-light, rgba(235, 242, 248, 0.65)); border-radius: var(--radius-sm, 8px); border: 1px solid var(--border-light); }
        .greeting-emoji { font-size: 1.2em; }
        [style*="--stagger-index"] { animation-delay: calc(var(--stagger-index, 0) * 60ms); }
        @media (prefers-reduced-motion: reduce) {
          .cluster-card, .stat-card, .neuro-stagger-item { animation: none !important; opacity: 1 !important; transform: none !important; }
          .neuro-breathing, .neuro-heartbeat, .neuro-pulse-interactive { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
