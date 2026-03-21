import { useState, useEffect, useCallback } from 'react';
import { SkeletonLoader } from '../SkeletonLoader';
import { apiCall, formatUptime, styles } from './admin-shared';
import type { HealthData, MetricSnapshot } from './admin-shared';

export function OverviewTab() {
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
