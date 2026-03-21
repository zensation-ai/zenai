import { useState, useEffect, useCallback } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { SkeletonLoader } from '../SkeletonLoader';
import { apiCall, formatDate, formatDuration, styles } from './admin-shared';
import type { SleepLog, SleepStats } from './admin-shared';

export function SleepComputeTab({ context }: { context: AIContext }) {
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
