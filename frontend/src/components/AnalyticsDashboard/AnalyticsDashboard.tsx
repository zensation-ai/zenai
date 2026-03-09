/**
 * Phase 50: Analytics Dashboard V2
 *
 * Main container with tabs: Overview, Productivity, Export.
 * Fetches data from /api/:context/analytics/v2/* endpoints.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { DateRangePicker, type DateRange } from './DateRangePicker';
import { ProductivityCharts } from './ProductivityCharts';
import { AIUsagePanel } from './AIUsagePanel';
import { MemoryHealthPanel, type MemoryHealthData } from './MemoryHealthPanel';
import { ExportPanel } from './ExportPanel';
import { logError } from '../../utils/errors';
import './AnalyticsDashboard.css';

type Tab = 'overview' | 'productivity' | 'ai-usage' | 'memory-health' | 'export';

interface AnalyticsDashboardV2Props {
  context: string;
  onBack: () => void;
}

interface OverviewData {
  ideas: { total: number; created: number; completed: number; trend: number };
  tasks: { total: number; completed: number; inProgress: number; trend: number };
  chats: { total: number; messages: number; avgDuration: number; trend: number };
  documents: { total: number; uploaded: number; trend: number };
}

interface TrendDataPoint {
  date: string;
  value: number;
}

interface TrendData {
  ideas: TrendDataPoint[];
  tasks: TrendDataPoint[];
  chats: TrendDataPoint[];
}

interface ProductivityInsight {
  taskCompletionRate: number;
  avgTaskDuration: number;
  mostProductiveHour: number;
  focusTimeMinutes: number;
  contextSwitches: number;
}

interface AIUsageStats {
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, { tokens: number; cost: number; count: number }>;
  byFeature: Record<string, { tokens: number; cost: number; count: number }>;
  dailyUsage: Array<{ date: string; tokens: number; cost: number }>;
}

interface DailyUsage {
  date: string;
  tokens: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  requestCount: number;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Uebersicht' },
  { id: 'productivity', label: 'Produktivitaet' },
  { id: 'ai-usage', label: 'KI-Nutzung' },
  { id: 'memory-health', label: 'Memory Health' },
  { id: 'export', label: 'Export' },
];

function getDefaultRange(): DateRange {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().split('T')[0],
    to: now.toISOString().split('T')[0],
  };
}

function getTrendIcon(trend: number): string {
  if (trend > 0) return '\u2191';
  if (trend < 0) return '\u2193';
  return '\u2192';
}

function getTrendClass(trend: number): string {
  if (trend > 0) return 'av2-trend-positive';
  if (trend < 0) return 'av2-trend-negative';
  return 'av2-trend-neutral';
}

const TabLoader: React.FC = () => (
  <div className="av2-tab-loader">
    <div className="av2-spinner" />
    <p>Lade Daten...</p>
  </div>
);

export const AnalyticsDashboardV2: React.FC<AnalyticsDashboardV2Props> = ({ context, onBack }) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [productivity, setProductivity] = useState<ProductivityInsight | null>(null);
  const [aiUsage, setAiUsage] = useState<AIUsageStats | null>(null);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [memoryHealth, setMemoryHealth] = useState<MemoryHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiUsageLoading, setAiUsageLoading] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiUsageError, setAiUsageError] = useState<string | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || '';
  const API_KEY = import.meta.env.VITE_API_KEY || '';

  const apiFetch = useCallback(async (url: string, signal?: AbortSignal) => {
    return fetch(`${API_URL}${url}`, {
      headers: { 'x-api-key': API_KEY },
      signal,
    });
  }, [API_URL, API_KEY]);

  const fetchData = useCallback(async (range: DateRange) => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();

    try {
      const qs = `from=${range.from}&to=${range.to}`;

      const [ovRes, trRes, prRes] = await Promise.all([
        apiFetch(`/api/${context}/analytics/v2/overview?${qs}`, controller.signal),
        apiFetch(`/api/${context}/analytics/v2/trends?${qs}&granularity=day`, controller.signal),
        apiFetch(`/api/${context}/analytics/v2/productivity?${qs}`, controller.signal),
      ]);

      const [ovJson, trJson, prJson] = await Promise.all([
        ovRes.json(),
        trRes.json(),
        prRes.json(),
      ]);

      if (ovJson.success) setOverview(ovJson.data);
      if (trJson.success) setTrends(trJson.data);
      if (prJson.success) setProductivity(prJson.data);

      if (!ovJson.success && !trJson.success && !prJson.success) {
        setError('Daten konnten nicht geladen werden.');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        logError('AnalyticsDashboardV2:fetchData', err instanceof Error ? err : new Error(String(err)));
        setError('Netzwerkfehler beim Laden der Daten.');
      }
    } finally {
      setLoading(false);
    }

    return () => controller.abort();
  }, [context, apiFetch]);

  const fetchAIUsage = useCallback(async (range: DateRange) => {
    setAiUsageLoading(true);
    setAiUsageError(null);
    try {
      const qs = `from=${range.from}&to=${range.to}`;
      const [statsRes, dailyRes] = await Promise.all([
        apiFetch(`/api/${context}/analytics/v2/ai-usage?${qs}`),
        apiFetch(`/api/${context}/analytics/v2/ai-usage/daily?${qs}`),
      ]);
      const [statsJson, dailyJson] = await Promise.all([statsRes.json(), dailyRes.json()]);
      if (statsJson.success) setAiUsage(statsJson.data);
      if (dailyJson.success) setDailyUsage(dailyJson.data);
      if (!statsJson.success && !dailyJson.success) {
        setAiUsageError('KI-Nutzungsdaten konnten nicht geladen werden.');
      }
    } catch (err) {
      logError('AnalyticsDashboardV2:fetchAIUsage', err instanceof Error ? err : new Error(String(err)));
      setAiUsageError('Netzwerkfehler beim Laden der KI-Nutzungsdaten.');
    } finally {
      setAiUsageLoading(false);
    }
  }, [context, apiFetch]);

  const fetchMemoryHealth = useCallback(async () => {
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      const res = await apiFetch(`/api/${context}/analytics/v2/memory-health`);
      const json = await res.json();
      if (json.success) setMemoryHealth(json.data);
      else setMemoryError('Memory-Daten konnten nicht geladen werden.');
    } catch (err) {
      logError('AnalyticsDashboardV2:fetchMemoryHealth', err instanceof Error ? err : new Error(String(err)));
      setMemoryError('Netzwerkfehler beim Laden der Memory-Daten.');
    } finally {
      setMemoryLoading(false);
    }
  }, [context, apiFetch]);

  useEffect(() => {
    const cleanup = fetchData(dateRange);
    return () => { cleanup.then(fn => fn?.()); };
  }, [dateRange, fetchData]);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setError(null);

    // Lazy-load data for tabs that need separate fetches
    if (tab === 'ai-usage' && !aiUsage && !aiUsageLoading) {
      fetchAIUsage(dateRange);
    }
    if (tab === 'memory-health' && !memoryHealth && !memoryLoading) {
      fetchMemoryHealth();
    }
  }, [aiUsage, aiUsageLoading, memoryHealth, memoryLoading, dateRange, fetchAIUsage, fetchMemoryHealth]);

  const renderOverview = () => {
    if (loading) return <TabLoader />;
    if (!overview) return <p className="av2-empty">Keine Daten vorhanden.</p>;

    const cards = [
      { label: 'Gedanken', value: overview.ideas.created, total: overview.ideas.total, trend: overview.ideas.trend },
      { label: 'Aufgaben erledigt', value: overview.tasks.completed, total: overview.tasks.total, trend: overview.tasks.trend },
      { label: 'Chat-Sessions', value: overview.chats.total, total: overview.chats.messages, trend: overview.chats.trend, subLabel: 'Nachrichten' },
      { label: 'Dokumente', value: overview.documents.uploaded, total: overview.documents.total, trend: overview.documents.trend },
    ];

    return (
      <div className="av2-overview-content">
        <div className="av2-overview-grid">
          {cards.map(card => (
            <div key={card.label} className="av2-stat-card">
              <div className="av2-stat-header">
                <span className="av2-stat-label">{card.label}</span>
                <span className={`av2-stat-trend ${getTrendClass(card.trend)}`}>
                  {getTrendIcon(card.trend)} {Math.abs(card.trend)}%
                </span>
              </div>
              <span className="av2-stat-value">{card.value}</span>
              <span className="av2-stat-total">
                {card.subLabel || 'Gesamt'}: {card.total}
              </span>
            </div>
          ))}
        </div>

        {/* Inline trend charts in overview */}
        {trends && (trends.ideas.length > 0 || trends.tasks.length > 0) && (
          <ProductivityCharts
            ideasTrend={trends.ideas}
            tasksTrend={trends.tasks}
            chatsTrend={trends.chats}
            productivity={null}
          />
        )}
      </div>
    );
  };

  return (
    <div className="av2-dashboard">
      <header className="av2-header">
        <div className="av2-header-left">
          <button type="button" className="av2-back-btn" onClick={onBack} aria-label="Zurueck">
            &larr;
          </button>
          <h1 className="av2-title">Analytics V2</h1>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </header>

      <nav className="av2-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={`av2-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => handleTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="av2-error" role="alert">
          {error}
        </div>
      )}

      <main className="av2-content">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'productivity' && (
          loading ? <TabLoader /> : (
            <ProductivityCharts
              ideasTrend={trends?.ideas ?? []}
              tasksTrend={trends?.tasks ?? []}
              chatsTrend={trends?.chats ?? []}
              productivity={productivity}
            />
          )
        )}
        {activeTab === 'ai-usage' && (
          aiUsageLoading ? <TabLoader /> : aiUsageError ? (
            <div className="av2-error" role="alert">{aiUsageError}</div>
          ) : aiUsage ? (
            <AIUsagePanel
              dailyUsage={dailyUsage}
              byModel={aiUsage.byModel}
              byFeature={aiUsage.byFeature}
              totalTokens={aiUsage.totalTokens}
              totalCost={aiUsage.totalCost}
            />
          ) : (
            <p className="av2-empty">Keine KI-Nutzungsdaten vorhanden.</p>
          )
        )}
        {activeTab === 'memory-health' && (
          <MemoryHealthPanel
            data={memoryHealth}
            loading={memoryLoading}
            error={memoryError}
          />
        )}
        {activeTab === 'export' && (
          <ExportPanel overview={overview} dateRange={dateRange} context={context} />
        )}
      </main>
    </div>
  );
};

export default AnalyticsDashboardV2;
