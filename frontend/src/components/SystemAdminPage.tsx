/**
 * SystemAdminPage - System Administration Dashboard
 *
 * Combines Observability (Phase 61), Security Admin (Phase 62),
 * and Sleep Compute (Phase 63) into a single admin hub page.
 *
 * Tabs: Uebersicht, Job Queues, Sicherheit, Sleep Compute
 */

import React, { Suspense, useState, useEffect, useCallback, memo } from 'react';
import type { AIContext } from './ContextSwitcher';
import { HubPage, type TabDef } from './HubPage';
import { SkeletonLoader } from './SkeletonLoader';
import { useTabNavigation } from '../hooks/useTabNavigation';
import { getApiBaseUrl, getApiFetchHeaders } from '../utils/apiConfig';

// ==========================================
// Types
// ==========================================

type AdminTab = 'overview' | 'queues' | 'security' | 'sleep';

interface SystemAdminPageProps {
  context: AIContext;
  onBack: () => void;
  initialTab?: AdminTab;
}

interface HealthData {
  status: string;
  uptime?: number;
  queues?: Record<string, unknown>;
  tracing?: Record<string, unknown>;
  [key: string]: unknown;
}

interface MetricSnapshot {
  name: string;
  value: number;
  type: string;
  timestamp?: string;
  [key: string]: unknown;
}

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  [key: string]: unknown;
}

interface AuditLogEntry {
  id: string;
  event_type: string;
  user_id?: string;
  severity?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
  [key: string]: unknown;
}

interface SecurityAlert {
  id: string;
  event_type: string;
  severity: string;
  description?: string;
  created_at: string;
  [key: string]: unknown;
}

interface RateLimitStats {
  tier: string;
  hits: number;
  blocked: number;
  [key: string]: unknown;
}

interface SleepLog {
  id: string;
  stage: string;
  status: string;
  items_processed?: number;
  duration_ms?: number;
  details?: Record<string, unknown>;
  created_at: string;
  [key: string]: unknown;
}

interface SleepStats {
  total_runs?: number;
  last_run?: string;
  stages?: Record<string, unknown>;
  [key: string]: unknown;
}

// ==========================================
// Helpers
// ==========================================

async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...getApiFetchHeaders('application/json'),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatUptime(seconds: number | undefined): string {
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: '#4ade80',
  medium: '#fbbf24',
  high: '#f97316',
  critical: '#ef4444',
  info: '#60a5fa',
  warning: '#fbbf24',
  error: '#ef4444',
};

const styles = {
  section: {
    marginBottom: '24px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '12px',
    color: 'var(--text-primary, #e2e8f0)',
  } as React.CSSProperties,
  card: {
    background: 'var(--bg-secondary, rgba(30, 41, 59, 0.8))',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.1))',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  } as React.CSSProperties,
  statCard: {
    background: 'var(--bg-secondary, rgba(30, 41, 59, 0.8))',
    borderRadius: '10px',
    padding: '16px',
    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.1))',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--accent-primary, #818cf8)',
  } as React.CSSProperties,
  statLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary, #94a3b8)',
    marginTop: '4px',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  } as React.CSSProperties,
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
    color: 'var(--text-secondary, #94a3b8)',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-color, rgba(148, 163, 184, 0.05))',
    color: 'var(--text-primary, #e2e8f0)',
  } as React.CSSProperties,
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 600,
    background: `${color}20`,
    color: color,
  } as React.CSSProperties),
  button: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
    background: 'var(--bg-secondary, rgba(30, 41, 59, 0.8))',
    color: 'var(--text-primary, #e2e8f0)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  } as React.CSSProperties,
  buttonPrimary: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--accent-primary, #818cf8)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  } as React.CSSProperties,
  errorBox: {
    padding: '12px 16px',
    borderRadius: '8px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#fca5a5',
    fontSize: '13px',
    marginBottom: '12px',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '32px',
    color: 'var(--text-secondary, #94a3b8)',
    fontSize: '14px',
  } as React.CSSProperties,
  filterBar: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  } as React.CSSProperties,
  input: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
    background: 'var(--bg-primary, rgba(15, 23, 42, 0.8))',
    color: 'var(--text-primary, #e2e8f0)',
    fontSize: '13px',
    minWidth: '140px',
  } as React.CSSProperties,
  select: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
    background: 'var(--bg-primary, rgba(15, 23, 42, 0.8))',
    color: 'var(--text-primary, #e2e8f0)',
    fontSize: '13px',
  } as React.CSSProperties,
};

// ==========================================
// Tab: Overview
// ==========================================

function OverviewTab() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [metrics, setMetrics] = useState<MetricSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [healthRes, metricsRes] = await Promise.allSettled([
        apiCall<{ data: HealthData }>('/api/observability/health'),
        apiCall<{ data: MetricSnapshot[] }>('/api/observability/metrics'),
      ]);
      if (healthRes.status === 'fulfilled') {
        setHealth(healthRes.value.data || healthRes.value as unknown as HealthData);
      }
      if (metricsRes.status === 'fulfilled') {
        const md = metricsRes.value.data || metricsRes.value;
        setMetrics(Array.isArray(md) ? md : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <SkeletonLoader type="card" count={3} />;

  return (
    <div>
      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>System Health</h3>
        <div style={styles.grid}>
          <div style={styles.statCard}>
            <div style={{
              ...styles.statValue,
              color: health?.status === 'ok' || health?.status === 'healthy'
                ? '#4ade80' : '#ef4444',
            }}>
              {health?.status === 'ok' || health?.status === 'healthy' ? 'Healthy' : health?.status || 'Unknown'}
            </div>
            <div style={styles.statLabel}>Status</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{formatUptime(health?.uptime as number | undefined)}</div>
            <div style={styles.statLabel}>Uptime</div>
          </div>
        </div>
      </div>

      {metrics.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Metriken</h3>
          <div style={styles.card}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Metrik</th>
                  <th style={styles.th}>Wert</th>
                  <th style={styles.th}>Typ</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m, i) => (
                  <tr key={i}>
                    <td style={styles.td}>{m.name}</td>
                    <td style={styles.td}>{typeof m.value === 'number' ? m.value.toLocaleString() : String(m.value)}</td>
                    <td style={styles.td}>
                      <span style={styles.badge('#60a5fa')}>{m.type}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'right' }}>
        <button style={styles.button} onClick={loadData}>
          Aktualisieren
        </button>
      </div>
    </div>
  );
}

// ==========================================
// Tab: Job Queues
// ==========================================

function QueuesTab() {
  const [queues, setQueues] = useState<QueueStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState<string | null>(null);

  const loadQueues = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiCall<{ data: QueueStats[] | Record<string, QueueStats> }>('/api/observability/queue-stats');
      const data = res.data || res;
      if (Array.isArray(data)) {
        setQueues(data);
      } else if (typeof data === 'object') {
        setQueues(Object.entries(data).map(([queueName, stats]) => ({
          ...(stats as QueueStats),
          name: queueName,
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQueues(); }, [loadQueues]);

  const handleClean = async (queueName: string) => {
    try {
      setCleaning(queueName);
      await apiCall(`/api/observability/queue/${queueName}/clean`, { method: 'POST' });
      await loadQueues();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Bereinigen');
    } finally {
      setCleaning(null);
    }
  };

  if (loading) return <SkeletonLoader type="card" count={4} />;

  return (
    <div>
      {error && <div style={styles.errorBox}>{error}</div>}

      {queues.length === 0 ? (
        <div style={styles.emptyState}>
          Keine Queues aktiv. Redis ist moeglicherweise nicht verbunden.
        </div>
      ) : (
        <>
          <div style={styles.grid}>
            {queues.map((q) => {
              const total = (q.waiting || 0) + (q.active || 0) + (q.completed || 0) + (q.failed || 0);
              return (
                <div key={q.name} style={styles.statCard}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary, #e2e8f0)' }}>
                    {q.name}
                  </div>
                  <div style={styles.statValue}>{total}</div>
                  <div style={styles.statLabel}>Gesamt</div>
                </div>
              );
            })}
          </div>

          <div style={styles.card}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Queue</th>
                  <th style={styles.th}>Wartend</th>
                  <th style={styles.th}>Aktiv</th>
                  <th style={styles.th}>Abgeschlossen</th>
                  <th style={styles.th}>Fehlgeschlagen</th>
                  <th style={styles.th}>Verzoegert</th>
                  <th style={styles.th}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => (
                  <tr key={q.name}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{q.name}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(q.waiting > 0 ? '#fbbf24' : '#4ade80')}>
                        {q.waiting || 0}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.badge(q.active > 0 ? '#818cf8' : '#64748b')}>
                        {q.active || 0}
                      </span>
                    </td>
                    <td style={styles.td}>{(q.completed || 0).toLocaleString()}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(q.failed > 0 ? '#ef4444' : '#4ade80')}>
                        {q.failed || 0}
                      </span>
                    </td>
                    <td style={styles.td}>{q.delayed || 0}</td>
                    <td style={styles.td}>
                      <button
                        style={styles.button}
                        onClick={() => handleClean(q.name)}
                        disabled={cleaning === q.name}
                      >
                        {cleaning === q.name ? 'Bereinige...' : 'Bereinigen'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ textAlign: 'right' }}>
        <button style={styles.button} onClick={loadQueues}>
          Aktualisieren
        </button>
      </div>
    </div>
  );
}

// ==========================================
// Tab: Security
// ==========================================

function SecurityTab() {
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [rateLimitStats, setRateLimitStats] = useState<RateLimitStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [subView, setSubView] = useState<'audit' | 'alerts' | 'rate-limits'>('audit');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (eventTypeFilter) params.set('event_type', eventTypeFilter);
      if (severityFilter) params.set('severity', severityFilter);

      const [auditRes, alertsRes, rlRes] = await Promise.allSettled([
        apiCall<{ data: AuditLogEntry[] }>(`/api/security/audit-log?${params.toString()}`),
        apiCall<{ data: SecurityAlert[] }>('/api/security/alerts'),
        apiCall<{ data: RateLimitStats[] }>('/api/security/rate-limits/stats'),
      ]);

      if (auditRes.status === 'fulfilled') {
        const d = auditRes.value.data || auditRes.value;
        setAuditLog(Array.isArray(d) ? d : []);
      }
      if (alertsRes.status === 'fulfilled') {
        const d = alertsRes.value.data || alertsRes.value;
        setAlerts(Array.isArray(d) ? d : []);
      }
      if (rlRes.status === 'fulfilled') {
        const d = rlRes.value.data || rlRes.value;
        setRateLimitStats(Array.isArray(d) ? d : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [eventTypeFilter, severityFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <SkeletonLoader type="card" count={3} />;

  return (
    <div>
      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Sub-view toggle */}
      <div style={{ ...styles.filterBar, marginBottom: '16px' }}>
        {(['audit', 'alerts', 'rate-limits'] as const).map((v) => (
          <button
            key={v}
            style={subView === v ? styles.buttonPrimary : styles.button}
            onClick={() => setSubView(v)}
          >
            {v === 'audit' ? 'Audit Log' : v === 'alerts' ? `Alerts (${alerts.length})` : 'Rate Limits'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={styles.button} onClick={loadData}>
          Aktualisieren
        </button>
      </div>

      {subView === 'audit' && (
        <>
          <div style={styles.filterBar}>
            <input
              style={styles.input}
              placeholder="Event-Typ filtern..."
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
            />
            <select
              style={styles.select}
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="">Alle Severity</option>
              <option value="info">Info</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {auditLog.length === 0 ? (
            <div style={styles.emptyState}>Keine Audit-Eintraege gefunden.</div>
          ) : (
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Zeitpunkt</th>
                    <th style={styles.th}>Event</th>
                    <th style={styles.th}>Severity</th>
                    <th style={styles.th}>Beschreibung</th>
                    <th style={styles.th}>User</th>
                    <th style={styles.th}>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.slice(0, 50).map((entry) => (
                    <tr key={entry.id}>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {formatDate(entry.created_at)}
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                          {entry.event_type}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.badge(SEVERITY_COLORS[entry.severity || 'info'] || '#64748b')}>
                          {entry.severity || 'info'}
                        </span>
                      </td>
                      <td style={{ ...styles.td, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {entry.description || '-'}
                      </td>
                      <td style={{ ...styles.td, fontSize: '12px' }}>{entry.user_id || '-'}</td>
                      <td style={{ ...styles.td, fontSize: '12px', fontFamily: 'monospace' }}>
                        {entry.ip_address || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditLog.length > 50 && (
                <div style={{ ...styles.emptyState, padding: '8px' }}>
                  Zeige 50 von {auditLog.length} Eintraegen
                </div>
              )}
            </div>
          )}
        </>
      )}

      {subView === 'alerts' && (
        <>
          {alerts.length === 0 ? (
            <div style={styles.emptyState}>Keine kritischen Alerts vorhanden.</div>
          ) : (
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Zeitpunkt</th>
                    <th style={styles.th}>Event</th>
                    <th style={styles.th}>Severity</th>
                    <th style={styles.th}>Beschreibung</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => (
                    <tr key={alert.id}>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {formatDate(alert.created_at)}
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                          {alert.event_type}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.badge(SEVERITY_COLORS[alert.severity] || '#ef4444')}>
                          {alert.severity}
                        </span>
                      </td>
                      <td style={styles.td}>{alert.description || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {subView === 'rate-limits' && (
        <>
          {rateLimitStats.length === 0 ? (
            <div style={styles.emptyState}>Keine Rate-Limit-Statistiken vorhanden.</div>
          ) : (
            <div style={styles.card}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Tier</th>
                    <th style={styles.th}>Anfragen</th>
                    <th style={styles.th}>Blockiert</th>
                    <th style={styles.th}>Block-Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rateLimitStats.map((rl, i) => {
                    const blockRate = rl.hits > 0 ? ((rl.blocked / rl.hits) * 100).toFixed(1) : '0';
                    return (
                      <tr key={i}>
                        <td style={{ ...styles.td, fontWeight: 600 }}>{rl.tier}</td>
                        <td style={styles.td}>{(rl.hits || 0).toLocaleString()}</td>
                        <td style={styles.td}>
                          <span style={styles.badge(rl.blocked > 0 ? '#ef4444' : '#4ade80')}>
                            {(rl.blocked || 0).toLocaleString()}
                          </span>
                        </td>
                        <td style={styles.td}>{blockRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==========================================
// Tab: Sleep Compute
// ==========================================

function SleepComputeTab({ context }: { context: AIContext }) {
  const [logs, setLogs] = useState<SleepLog[]>([]);
  const [stats, setStats] = useState<SleepStats | null>(null);
  const [idleStatus, setIdleStatus] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [logsRes, statsRes, idleRes] = await Promise.allSettled([
        apiCall<{ data: SleepLog[] }>(`/api/${context}/sleep-compute/logs`),
        apiCall<{ data: SleepStats }>(`/api/${context}/sleep-compute/stats`),
        apiCall<{ data: Record<string, unknown> }>(`/api/${context}/sleep-compute/idle-status`),
      ]);
      if (logsRes.status === 'fulfilled') {
        const d = logsRes.value.data || logsRes.value;
        setLogs(Array.isArray(d) ? d : []);
      }
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data || statsRes.value as unknown as SleepStats);
      }
      if (idleRes.status === 'fulfilled') {
        setIdleStatus(idleRes.value.data || idleRes.value as unknown as Record<string, unknown>);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleTrigger = async () => {
    try {
      setTriggering(true);
      setTriggerResult(null);
      const res = await apiCall<{ message?: string; data?: unknown }>(`/api/${context}/sleep-compute/trigger`, {
        method: 'POST',
      });
      setTriggerResult(res.message || 'Sleep-Zyklus gestartet');
      // Reload after short delay
      setTimeout(loadData, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Ausloesen');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) return <SkeletonLoader type="card" count={3} />;

  const STAGE_LABELS: Record<string, string> = {
    episodic_consolidation: 'Episodic Consolidation',
    contradiction_detection: 'Contradiction Detection',
    working_memory_preload: 'Working Memory Pre-Load',
    procedural_optimization: 'Procedural Optimization',
    entity_graph_maintenance: 'Entity Graph Maintenance',
  };

  const STATUS_COLORS: Record<string, string> = {
    completed: '#4ade80',
    running: '#818cf8',
    failed: '#ef4444',
    pending: '#fbbf24',
    skipped: '#64748b',
  };

  return (
    <div>
      {error && <div style={styles.errorBox}>{error}</div>}
      {triggerResult && (
        <div style={{
          ...styles.errorBox,
          background: 'rgba(74, 222, 128, 0.1)',
          border: '1px solid rgba(74, 222, 128, 0.3)',
          color: '#86efac',
        }}>
          {triggerResult}
        </div>
      )}

      {/* Stats + Idle Status */}
      <div style={styles.grid}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats?.total_runs ?? '-'}</div>
          <div style={styles.statLabel}>Laeufe (7 Tage)</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>
            {stats?.last_run ? formatDate(stats.last_run as string) : '-'}
          </div>
          <div style={styles.statLabel}>Letzter Lauf</div>
        </div>
        <div style={styles.statCard}>
          <div style={{
            ...styles.statValue,
            color: idleStatus?.is_idle ? '#4ade80' : '#fbbf24',
          }}>
            {idleStatus?.is_idle ? 'Idle' : 'Aktiv'}
          </div>
          <div style={styles.statLabel}>System-Status</div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ ...styles.filterBar, marginBottom: '16px' }}>
        <button
          style={styles.buttonPrimary}
          onClick={handleTrigger}
          disabled={triggering}
        >
          {triggering ? 'Wird ausgeloest...' : 'Sleep-Zyklus starten'}
        </button>
        <div style={{ flex: 1 }} />
        <button style={styles.button} onClick={loadData}>
          Aktualisieren
        </button>
      </div>

      {/* Stage Stats */}
      {stats?.stages && typeof stats.stages === 'object' && Object.keys(stats.stages).length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Stufen-Statistiken</h3>
          <div style={styles.card}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Stufe</th>
                  <th style={styles.th}>Laeufe</th>
                  <th style={styles.th}>Erfolgsrate</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.stages as Record<string, { runs?: number; success_rate?: number }>).map(([stage, data]) => (
                  <tr key={stage}>
                    <td style={styles.td}>{STAGE_LABELS[stage] || stage}</td>
                    <td style={styles.td}>{data.runs ?? '-'}</td>
                    <td style={styles.td}>
                      {data.success_rate != null
                        ? <span style={styles.badge(data.success_rate >= 0.8 ? '#4ade80' : '#fbbf24')}>
                            {(data.success_rate * 100).toFixed(0)}%
                          </span>
                        : '-'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Logs */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Letzte Logs</h3>
        {logs.length === 0 ? (
          <div style={styles.emptyState}>Keine Sleep-Compute-Logs vorhanden.</div>
        ) : (
          <div style={styles.card}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Zeitpunkt</th>
                  <th style={styles.th}>Stufe</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Verarbeitet</th>
                  <th style={styles.th}>Dauer</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 30).map((log) => (
                  <tr key={log.id}>
                    <td style={{ ...styles.td, whiteSpace: 'nowrap', fontSize: '12px' }}>
                      {formatDate(log.created_at)}
                    </td>
                    <td style={styles.td}>{STAGE_LABELS[log.stage] || log.stage}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(STATUS_COLORS[log.status] || '#64748b')}>
                        {log.status}
                      </span>
                    </td>
                    <td style={styles.td}>{log.items_processed ?? '-'}</td>
                    <td style={styles.td}>{formatDuration(log.duration_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length > 30 && (
              <div style={{ ...styles.emptyState, padding: '8px' }}>
                Zeige 30 von {logs.length} Eintraegen
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Tab Definitions
// ==========================================

const TABS: TabDef<AdminTab>[] = [
  { id: 'overview', label: 'Uebersicht', icon: '\u2699\uFE0F', description: 'System-Health und Metriken' },
  { id: 'queues', label: 'Job Queues', icon: '\uD83D\uDCE6', description: 'BullMQ Queue Monitoring' },
  { id: 'security', label: 'Sicherheit', icon: '\uD83D\uDD12', description: 'Audit Log und Security Alerts' },
  { id: 'sleep', label: 'Sleep Compute', icon: '\uD83C\uDF19', description: 'Sleep-Time Background Processing' },
];

const TabLoader = () => (
  <div className="hub-tab-loader">
    <SkeletonLoader type="card" count={3} />
  </div>
);

// ==========================================
// Main Component
// ==========================================

const SystemAdminPageComponent: React.FC<SystemAdminPageProps> = ({
  context,
  onBack,
  initialTab = 'overview',
}) => {
  const { activeTab, handleTabChange } = useTabNavigation<AdminTab>({
    initialTab,
    validTabs: ['overview', 'queues', 'security', 'sleep'],
    defaultTab: 'overview',
    basePath: '/admin',
    rootTab: 'overview',
  });

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <OverviewTab />
            </div>
          </Suspense>
        );
      case 'queues':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <QueuesTab />
            </div>
          </Suspense>
        );
      case 'security':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <SecurityTab />
            </div>
          </Suspense>
        );
      case 'sleep':
        return (
          <Suspense fallback={<TabLoader />}>
            <div className="hub-tab-content">
              <SleepComputeTab context={context} />
            </div>
          </Suspense>
        );
      default:
        return null;
    }
  };

  return (
    <HubPage
      title="System Administration"
      icon="\u2699\uFE0F"
      subtitle="Observability, Security und Background Processing"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onBack={onBack}
      context={context}
    >
      {renderTabContent()}
    </HubPage>
  );
};

export const SystemAdminPage = memo(SystemAdminPageComponent);
