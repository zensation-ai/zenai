/**
 * AITracesPanel - KI-Traces Tab
 *
 * Phase 73+: AI Observability Dashboard
 * Shows trace list, model breakdown, daily trends, cost tracking,
 * and span-level detail for individual traces.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import type { AIContext } from '../ContextSwitcher';
import './AITracesPanel.css';

// --- Types ---

interface AITrace {
  id: string;
  name: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  duration_ms: number;
  status: 'success' | 'error';
  metadata: Record<string, unknown>;
  created_at: string;
  spans?: TraceSpan[];
}

interface TraceSpan {
  id: string;
  name: string;
  duration_ms: number;
  type: string;
}

interface DailyStats {
  date: string;
  traces: number;
  tokens: number;
  cost: number;
  by_model: Record<string, number>;
}

interface ModelStats {
  model: string;
  count: number;
  tokens: number;
  cost: number;
}

interface StatsData {
  daily: DailyStats[];
  totals: { traces: number; tokens: number; cost: number; avg_duration: number };
  by_model: ModelStats[];
}

interface AITracesPanelProps {
  context: AIContext;
}

// --- Helpers ---

const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-20250514': '#8b5cf6',
  'claude-sonnet-4-20250514': '#3b82f6',
  'claude-haiku-3-20250307': '#10b981',
};

function getModelColor(model: string): string {
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (model.includes(key.split('-')[1])) return color;
  }
  return '#6b7280';
}

function getModelShort(model: string): string {
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model.length > 20 ? model.slice(0, 18) + '...' : model;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toString();
}

function formatCost(usd: number): string {
  const eur = usd * 0.92;
  return eur < 0.01 ? '<0,01' : eur.toFixed(2).replace('.', ',');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

type DateRange = '7d' | '30d';

// --- Component ---

export function AITracesPanel({ context }: AITracesPanelProps) {
  const [traces, setTraces] = useState<AITrace[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [expandedTrace, setExpandedTrace] = useState<AITrace | null>(null);

  // Filters
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>('7d');

  const dateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (dateRange === '7d' ? 7 : 30));
    return d.toISOString();
  }, [dateRange]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`/api/${context}/ai-traces/stats`);
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch {
      // stats are optional, don't block
    }
  }, [context]);

  // Fetch traces
  const fetchTraces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: '50', from: dateFrom };
      if (modelFilter !== 'all') params.model = modelFilter;

      const res = await axios.get(`/api/${context}/ai-traces`, { params });
      if (res.data.success) {
        let list: AITrace[] = res.data.data;
        if (statusFilter !== 'all') {
          list = list.filter(t => t.status === statusFilter);
        }
        setTraces(list);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Traces');
    } finally {
      setLoading(false);
    }
  }, [context, dateFrom, modelFilter, statusFilter]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchTraces(); }, [fetchTraces]);

  // Load trace detail with spans
  const handleExpandTrace = useCallback(async (traceId: string) => {
    if (expandedTraceId === traceId) {
      setExpandedTraceId(null);
      setExpandedTrace(null);
      return;
    }
    setExpandedTraceId(traceId);
    try {
      const res = await axios.get(`/api/${context}/ai-traces/${traceId}`);
      if (res.data.success) {
        setExpandedTrace(res.data.data);
      }
    } catch {
      setExpandedTrace(null);
    }
  }, [context, expandedTraceId]);

  // Available models for filter
  const availableModels = useMemo(() => {
    if (!stats?.by_model) return [];
    return stats.by_model.map(m => m.model);
  }, [stats]);

  // Daily chart data
  const chartData = useMemo(() => {
    if (!stats?.daily) return [];
    return stats.daily.slice(dateRange === '7d' ? -7 : -30).map(d => ({
      date: formatShortDate(d.date),
      Traces: d.traces,
      Tokens: Math.round(d.tokens / 1000),
      Kosten: Math.round(d.cost * 92) / 100,
    }));
  }, [stats, dateRange]);

  // --- Render ---

  if (loading && !stats) {
    return (
      <div className="ait-loading">
        <div className="ait-spinner" />
        Lade KI-Traces...
      </div>
    );
  }

  if (error && traces.length === 0) {
    return (
      <div className="ait-error">
        <span>Fehler: {error}</span>
        <button className="ait-retry" onClick={fetchTraces}>Erneut versuchen</button>
      </div>
    );
  }

  return (
    <div className="ait-panel">
      {/* Stats Overview */}
      {stats && (
        <div className="ait-stats-grid">
          <div className="ait-stat-card">
            <div className="ait-stat-value">{stats.totals.traces.toLocaleString('de-DE')}</div>
            <div className="ait-stat-label">Traces gesamt</div>
          </div>
          <div className="ait-stat-card">
            <div className="ait-stat-value">{formatTokens(stats.totals.tokens)}</div>
            <div className="ait-stat-label">Tokens gesamt</div>
          </div>
          <div className="ait-stat-card">
            <div className="ait-stat-value">{formatCost(stats.totals.cost)} EUR</div>
            <div className="ait-stat-label">Kosten gesamt</div>
          </div>
          <div className="ait-stat-card">
            <div className="ait-stat-value">{formatDuration(stats.totals.avg_duration)}</div>
            <div className="ait-stat-label">Durchschn. Dauer</div>
          </div>
        </div>
      )}

      {/* Model Breakdown */}
      {stats && stats.by_model.length > 0 && (
        <div className="ait-section">
          <h3 className="ait-section-title">Modell-Verteilung</h3>
          <div className="ait-model-grid">
            {stats.by_model.map(m => (
              <div
                key={m.model}
                className="ait-model-card"
                style={{ borderColor: getModelColor(m.model) }}
              >
                <div className="ait-model-badge" style={{ background: getModelColor(m.model) }}>
                  {getModelShort(m.model)}
                </div>
                <div className="ait-model-stats">
                  <span>{m.count.toLocaleString('de-DE')} Aufrufe</span>
                  <span>{formatTokens(m.tokens)} Tokens</span>
                  <span>{formatCost(m.cost)} EUR</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Trend Chart */}
      {chartData.length > 0 && (
        <div className="ait-section">
          <div className="ait-section-header">
            <h3 className="ait-section-title">Tagestrend</h3>
            <div className="ait-range-toggle">
              <button
                className={`ait-range-btn ${dateRange === '7d' ? 'active' : ''}`}
                onClick={() => setDateRange('7d')}
              >
                7 Tage
              </button>
              <button
                className={`ait-range-btn ${dateRange === '30d' ? 'active' : ''}`}
                onClick={() => setDateRange('30d')}
              >
                30 Tage
              </button>
            </div>
          </div>
          <div className="ait-chart-container">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(20,20,30,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 12,
                  }}
                  formatter={(value: unknown, name: unknown) => {
                    const v = Number(value) || 0;
                    const n = String(name);
                    if (n === 'Tokens') return [`${v}k`, n];
                    if (n === 'Kosten') return [`${v.toFixed(2).replace('.', ',')} EUR`, n];
                    return [v, n];
                  }}
                />
                <Bar dataKey="Traces" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="rgba(139,92,246,0.7)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="ait-section">
        <div className="ait-section-header">
          <h3 className="ait-section-title">Trace-Liste</h3>
          <div className="ait-filters">
            <select
              className="ait-filter-select"
              value={modelFilter}
              onChange={e => setModelFilter(e.target.value)}
            >
              <option value="all">Alle Modelle</option>
              {availableModels.map(m => (
                <option key={m} value={m}>{getModelShort(m)}</option>
              ))}
            </select>
            <select
              className="ait-filter-select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">Alle Status</option>
              <option value="success">Erfolgreich</option>
              <option value="error">Fehler</option>
            </select>
          </div>
        </div>

        {/* Trace List */}
        {traces.length === 0 ? (
          <div className="ait-empty">
            <span>Keine Traces gefunden</span>
            <span className="ait-empty-sub">Aendere die Filter oder den Zeitraum.</span>
          </div>
        ) : (
          <div className="ait-trace-list">
            {traces.map(trace => (
              <div key={trace.id} className="ait-trace-item-wrapper">
                <button
                  className={`ait-trace-item ${expandedTraceId === trace.id ? 'expanded' : ''}`}
                  onClick={() => handleExpandTrace(trace.id)}
                >
                  <div className="ait-trace-name">
                    <span className={`ait-status-dot ${trace.status}`} />
                    {trace.name}
                  </div>
                  <div className="ait-trace-meta">
                    <span
                      className="ait-trace-model"
                      style={{ background: `${getModelColor(trace.model)}22`, color: getModelColor(trace.model) }}
                    >
                      {getModelShort(trace.model)}
                    </span>
                    <span className="ait-trace-tokens">{formatTokens(trace.total_tokens)} Tok</span>
                    <span className="ait-trace-cost">{formatCost(trace.estimated_cost)} EUR</span>
                    <span className="ait-trace-duration">{formatDuration(trace.duration_ms)}</span>
                    <span className="ait-trace-date">{formatDate(trace.created_at)}</span>
                  </div>
                  <span className="ait-trace-chevron">{expandedTraceId === trace.id ? '\u25B2' : '\u25BC'}</span>
                </button>

                {/* Expanded detail */}
                {expandedTraceId === trace.id && expandedTrace && (
                  <div className="ait-trace-detail">
                    <div className="ait-detail-row">
                      <span className="ait-detail-label">ID</span>
                      <span className="ait-detail-value ait-mono">{trace.id}</span>
                    </div>
                    <div className="ait-detail-row">
                      <span className="ait-detail-label">Modell</span>
                      <span className="ait-detail-value">{trace.model}</span>
                    </div>
                    <div className="ait-detail-row">
                      <span className="ait-detail-label">Tokens</span>
                      <span className="ait-detail-value">
                        {trace.input_tokens.toLocaleString('de-DE')} ein / {trace.output_tokens.toLocaleString('de-DE')} aus
                      </span>
                    </div>
                    <div className="ait-detail-row">
                      <span className="ait-detail-label">Status</span>
                      <span className={`ait-detail-value ait-status-text ${trace.status}`}>
                        {trace.status === 'success' ? 'Erfolgreich' : 'Fehler'}
                      </span>
                    </div>

                    {/* Spans Timeline */}
                    {expandedTrace.spans && expandedTrace.spans.length > 0 && (
                      <div className="ait-spans-section">
                        <div className="ait-spans-title">Spans</div>
                        <div className="ait-spans-timeline">
                          {expandedTrace.spans.map(span => {
                            const totalMs = expandedTrace.duration_ms || 1;
                            const widthPct = Math.max(2, (span.duration_ms / totalMs) * 100);
                            return (
                              <div key={span.id} className="ait-span-row">
                                <div className="ait-span-name">{span.name}</div>
                                <div className="ait-span-bar-container">
                                  <div
                                    className="ait-span-bar"
                                    style={{
                                      width: `${widthPct}%`,
                                      background: span.type === 'generation'
                                        ? 'rgba(139,92,246,0.6)'
                                        : 'rgba(59,130,246,0.5)',
                                    }}
                                  />
                                </div>
                                <div className="ait-span-duration">{formatDuration(span.duration_ms)}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AITracesPanel;
