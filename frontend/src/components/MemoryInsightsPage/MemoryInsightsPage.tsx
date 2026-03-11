/**
 * Phase 53: Memory Insights Page
 *
 * Visualization and analysis tools for the HiMeS 4-layer memory system.
 * Tabs: Timeline, Conflicts, Curation, Impact
 *
 * Uses global axios instance (with auth interceptor from main.tsx).
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { MemoryTimeline } from './MemoryTimeline';
import { ConflictList } from './ConflictList';
import { CurationPanel } from './CurationPanel';
import './MemoryInsightsPage.css';

type Tab = 'timeline' | 'conflicts' | 'curation' | 'impact';

interface MemoryInsightsPageProps {
  context: string;
  initialTab?: Tab;
  onBack?: () => void;
}

interface MemoryImpact {
  memoryId: string;
  content: string;
  layer: string;
  accessCount: number;
  lastAccessed: string | null;
  influenceScore: number;
}

interface MemoryStats {
  totalMemories: number;
  byLayer: Record<string, number>;
  averageAge: number;
  oldestMemory: string | null;
  newestMemory: string | null;
  growthRate: number;
}

const LAYER_COLORS: Record<string, string> = {
  working: '#a855f7',
  episodic: '#22c55e',
  short_term: '#3b82f6',
  long_term: '#ff6b35',
};

const LAYER_LABELS: Record<string, string> = {
  working: 'Working Memory',
  episodic: 'Episodic Memory',
  short_term: 'Short-Term Memory',
  long_term: 'Long-Term Memory',
};

export function MemoryInsightsPage({ context, initialTab = 'timeline' }: MemoryInsightsPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [impacts, setImpacts] = useState<MemoryImpact[]>([]);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await axios.get(`/api/${context}/memory/insights/stats`);
      if (res.data?.success) setStats(res.data.data);
    } catch {
      // silent
    }
  }, [context]);

  const loadImpacts = useCallback(async () => {
    try {
      const res = await axios.get(`/api/${context}/memory/insights/impact?limit=20`);
      if (res.data?.success) setImpacts(res.data.data);
    } catch {
      // silent
    }
  }, [context]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStats(), loadImpacts()]).finally(() => setLoading(false));
  }, [loadStats, loadImpacts]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'timeline', label: 'Timeline', icon: 'schedule' },
    { id: 'conflicts', label: 'Konflikte', icon: 'warning' },
    { id: 'curation', label: 'Kuration', icon: 'auto_fix_high' },
    { id: 'impact', label: 'Einfluss', icon: 'insights' },
  ];

  return (
    <div className="memory-insights-page">
      <div className="memory-insights-header">
        <div className="memory-insights-title-row">
          <h1>Memory Insights</h1>
        </div>

        {stats && (
          <div className="memory-insights-stats-bar">
            <div className="stat-item">
              <span className="stat-value">{stats.totalMemories}</span>
              <span className="stat-label">Gesamt</span>
            </div>
            {Object.entries(stats.byLayer).map(([layer, count]) => (
              <div className="stat-item" key={layer}>
                <span className="stat-value" style={{ color: LAYER_COLORS[layer] }}>{count}</span>
                <span className="stat-label">{LAYER_LABELS[layer] || layer}</span>
              </div>
            ))}
            <div className="stat-item">
              <span className="stat-value">{stats.growthRate}/Tag</span>
              <span className="stat-label">Wachstum</span>
            </div>
          </div>
        )}
      </div>

      <div className="memory-insights-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`memory-insights-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="material-icons">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="memory-insights-content">
        {loading && <div className="memory-insights-loading">Laden...</div>}

        {!loading && activeTab === 'timeline' && (
          <MemoryTimeline context={context} />
        )}

        {!loading && activeTab === 'conflicts' && (
          <ConflictList context={context} />
        )}

        {!loading && activeTab === 'curation' && (
          <CurationPanel context={context} />
        )}

        {!loading && activeTab === 'impact' && (
          <div className="memory-impact-list">
            {impacts.length === 0 && (
              <div className="memory-insights-empty">Keine Einflussdaten vorhanden.</div>
            )}
            {impacts.map((impact, idx) => (
              <div className="impact-card" key={impact.memoryId}>
                <div className="impact-rank">#{idx + 1}</div>
                <div className="impact-content">
                  <div className="impact-text">{impact.content}</div>
                  <div className="impact-meta">
                    <span
                      className="impact-layer-badge"
                      style={{ backgroundColor: LAYER_COLORS[impact.layer] || '#666' }}
                    >
                      {LAYER_LABELS[impact.layer] || impact.layer}
                    </span>
                    {impact.accessCount > 0 && (
                      <span className="impact-access">{impact.accessCount}x zugegriffen</span>
                    )}
                    {impact.lastAccessed && (
                      <span className="impact-date">
                        Zuletzt: {new Date(impact.lastAccessed).toLocaleDateString('de-DE')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="impact-score-container">
                  <div
                    className="impact-score-bar"
                    style={{ width: `${Math.min(impact.influenceScore * 100, 100)}%` }}
                  />
                  <span className="impact-score-value">{(impact.influenceScore * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
