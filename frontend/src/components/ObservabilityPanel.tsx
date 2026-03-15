/**
 * ObservabilityPanel - System-Ueberwachung
 *
 * Zeigt System-Health, Queue-Statistiken und KI-Metriken.
 * Backend: GET /api/observability/metrics, /queue-stats, /health
 */

import { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl, getApiFetchHeaders } from '../utils/apiConfig';
import './ObservabilityPanel.css';

// ─── Types ────────────────────────────────────────────────

interface PoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  activeCount?: number;
  errors?: number;
}

interface HealthData {
  status: string;
  uptime: number;
  database?: {
    pool?: PoolStats;
    [key: string]: unknown;
  };
  redis?: {
    connected: boolean;
    [key: string]: unknown;
  };
  queues?: Record<string, QueueStats>;
  tracing?: {
    enabled: boolean;
    provider: string;
  };
}

interface QueueStats {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
  paused?: number;
}

interface MetricSnapshot {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: string;
}

// ─── Helpers ──────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}T ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString('de-DE');
}

const QUEUE_LABELS: Record<string, string> = {
  'memory-consolidation': 'Memory-Konsolidierung',
  'rag-indexing': 'RAG-Indexierung',
  'email-processing': 'E-Mail-Verarbeitung',
  'graph-indexing': 'Graph-Indexierung',
  'sleep-compute': 'Sleep-Compute',
};

const METRIC_LABELS: Record<string, string> = {
  'ai.tokens.total': 'KI-Tokens gesamt',
  'ai.rag.latency': 'RAG-Latenz (ms)',
  'ai.agent.duration': 'Agent-Dauer (ms)',
  'ai.tool.calls': 'Tool-Aufrufe',
  'queue.jobs.completed': 'Jobs abgeschlossen',
  'queue.jobs.failed': 'Jobs fehlgeschlagen',
  'memory.operations': 'Memory-Operationen',
};

const METRIC_ICONS: Record<string, string> = {
  'ai.tokens.total': '🔤',
  'ai.rag.latency': '⏱',
  'ai.agent.duration': '🤖',
  'ai.tool.calls': '🔧',
  'queue.jobs.completed': '✓',
  'queue.jobs.failed': '✗',
  'memory.operations': '🧠',
};

// ─── Component ────────────────────────────────────────────

export function ObservabilityPanel() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [queueStats, setQueueStats] = useState<Record<string, QueueStats> | null>(null);
  const [metrics, setMetrics] = useState<MetricSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const apiUrl = getApiBaseUrl();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getApiFetchHeaders();
      const [healthRes, queueRes, metricsRes] = await Promise.allSettled([
        fetch(`${apiUrl}/api/observability/health`, { headers }),
        fetch(`${apiUrl}/api/observability/queue-stats`, { headers }),
        fetch(`${apiUrl}/api/observability/metrics`, { headers }),
      ]);

      if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
        const data = await healthRes.value.json();
        setHealth(data.data || data);
      }

      if (queueRes.status === 'fulfilled' && queueRes.value.ok) {
        const data = await queueRes.value.json();
        setQueueStats(data.data || data.queues || {});
      }

      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        const data = await metricsRes.value.json();
        setMetrics(data.data || data.metrics || []);
      }

      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der System-Daten');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchAll();
    // Auto-refresh every 30s
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Derive status color
  const statusColor = health?.status === 'ok' || health?.status === 'healthy'
    ? '#22c55e'
    : health?.status === 'degraded'
    ? '#f59e0b'
    : '#ef4444';

  const statusLabel = health?.status === 'ok' || health?.status === 'healthy'
    ? 'Gesund'
    : health?.status === 'degraded'
    ? 'Eingeschraenkt'
    : health?.status || 'Unbekannt';

  return (
    <div className="obs-panel">
      {/* Header with refresh */}
      <div className="obs-header">
        <div>
          <h3 className="obs-title">System-Ueberwachung</h3>
          <p className="obs-subtitle">
            Zuletzt aktualisiert: {lastRefresh.toLocaleTimeString('de-DE')}
          </p>
        </div>
        <button
          type="button"
          className="obs-refresh-btn"
          onClick={fetchAll}
          disabled={loading}
          title="Aktualisieren"
        >
          {loading ? (
            <span className="obs-refresh-spinner" />
          ) : (
            '↻'
          )}
        </button>
      </div>

      {error && (
        <div className="obs-error">
          <span>{error}</span>
          <button type="button" className="obs-retry-btn" onClick={fetchAll}>
            Erneut versuchen
          </button>
        </div>
      )}

      {/* ─── System Health ────────────────────────────── */}
      <div className="obs-section">
        <h4 className="obs-section-title">System-Gesundheit</h4>
        <div className="obs-health-grid">
          {/* Overall Status */}
          <div className="obs-health-card obs-health-status">
            <div className="obs-health-indicator" style={{ backgroundColor: statusColor }} />
            <div className="obs-health-info">
              <span className="obs-health-label">Status</span>
              <span className="obs-health-value" style={{ color: statusColor }}>
                {statusLabel}
              </span>
            </div>
          </div>

          {/* Uptime */}
          {health?.uptime != null && (
            <div className="obs-health-card">
              <div className="obs-health-icon">⏱</div>
              <div className="obs-health-info">
                <span className="obs-health-label">Laufzeit</span>
                <span className="obs-health-value">{formatUptime(health.uptime)}</span>
              </div>
            </div>
          )}

          {/* Database Pool */}
          {health?.database?.pool && (
            <div className="obs-health-card">
              <div className="obs-health-icon">🗄</div>
              <div className="obs-health-info">
                <span className="obs-health-label">DB-Pool</span>
                <span className="obs-health-value">
                  {health.database.pool.activeCount ?? (health.database.pool.totalCount - health.database.pool.idleCount)}/{health.database.pool.totalCount}
                </span>
                <span className="obs-health-detail">
                  Aktiv/Gesamt &middot; {health.database.pool.idleCount} frei
                  {(health.database.pool.waitingCount ?? 0) > 0 && (
                    <> &middot; <span className="obs-warn">{health.database.pool.waitingCount} wartend</span></>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Redis */}
          <div className="obs-health-card">
            <div className="obs-health-icon">⚡</div>
            <div className="obs-health-info">
              <span className="obs-health-label">Redis</span>
              <span className="obs-health-value" style={{
                color: health?.redis?.connected ? '#22c55e' : '#ef4444',
              }}>
                {health?.redis?.connected ? 'Verbunden' : 'Nicht verbunden'}
              </span>
            </div>
          </div>

          {/* Tracing */}
          {health?.tracing && (
            <div className="obs-health-card">
              <div className="obs-health-icon">📡</div>
              <div className="obs-health-info">
                <span className="obs-health-label">Tracing</span>
                <span className="obs-health-value" style={{
                  color: health.tracing.enabled ? '#22c55e' : 'var(--text-secondary)',
                }}>
                  {health.tracing.enabled ? 'Aktiv' : 'Inaktiv'}
                </span>
                {health.tracing.provider && (
                  <span className="obs-health-detail">{health.tracing.provider}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Queue Statistics ─────────────────────────── */}
      <div className="obs-section">
        <h4 className="obs-section-title">Queue-Statistiken</h4>
        {!queueStats || Object.keys(queueStats).length === 0 ? (
          <div className="obs-empty">Keine Queue-Daten verfuegbar</div>
        ) : (
          <div className="obs-queue-grid">
            {Object.entries(queueStats).map(([name, stats]) => {
              const total = stats.completed + stats.failed;
              const failRate = total > 0 ? (stats.failed / total * 100) : 0;
              return (
                <div key={name} className="obs-queue-card">
                  <div className="obs-queue-header">
                    <span className="obs-queue-name">{QUEUE_LABELS[name] || name}</span>
                    {stats.active > 0 && (
                      <span className="obs-queue-active-badge">{stats.active} aktiv</span>
                    )}
                  </div>
                  <div className="obs-queue-stats">
                    <div className="obs-queue-stat">
                      <span className="obs-queue-stat-value obs-color-waiting">{formatNumber(stats.waiting)}</span>
                      <span className="obs-queue-stat-label">Wartend</span>
                    </div>
                    <div className="obs-queue-stat">
                      <span className="obs-queue-stat-value obs-color-active">{formatNumber(stats.active)}</span>
                      <span className="obs-queue-stat-label">Aktiv</span>
                    </div>
                    <div className="obs-queue-stat">
                      <span className="obs-queue-stat-value obs-color-completed">{formatNumber(stats.completed)}</span>
                      <span className="obs-queue-stat-label">Fertig</span>
                    </div>
                    <div className="obs-queue-stat">
                      <span className="obs-queue-stat-value obs-color-failed">{formatNumber(stats.failed)}</span>
                      <span className="obs-queue-stat-label">Fehler</span>
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="obs-queue-bar-wrap">
                      <div className="obs-queue-bar">
                        <div
                          className="obs-queue-bar-success"
                          style={{ width: `${100 - failRate}%` }}
                        />
                        {failRate > 0 && (
                          <div
                            className="obs-queue-bar-fail"
                            style={{ width: `${failRate}%` }}
                          />
                        )}
                      </div>
                      <span className="obs-queue-bar-label">
                        {(100 - failRate).toFixed(1)}% Erfolg
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Metrics Overview ─────────────────────────── */}
      <div className="obs-section">
        <h4 className="obs-section-title">Metriken-Uebersicht</h4>
        {metrics.length === 0 ? (
          <div className="obs-empty">Keine Metriken verfuegbar</div>
        ) : (
          <div className="obs-metrics-grid">
            {metrics.map((m, i) => (
              <div key={`${m.name}-${i}`} className="obs-metric-card">
                <div className="obs-metric-icon">
                  {METRIC_ICONS[m.name] || '📊'}
                </div>
                <div className="obs-metric-info">
                  <span className="obs-metric-value">{formatNumber(m.value)}</span>
                  <span className="obs-metric-label">
                    {METRIC_LABELS[m.name] || m.name}
                  </span>
                  {m.labels && Object.keys(m.labels).length > 0 && (
                    <span className="obs-metric-tags">
                      {Object.entries(m.labels).map(([k, v]) => (
                        <span key={k} className="obs-metric-tag">{k}: {v}</span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
