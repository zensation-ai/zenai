import { useState, useEffect, useCallback } from 'react';
import { SkeletonLoader } from '../SkeletonLoader';
import { apiCall, styles } from './admin-shared';
import type { QueueStats } from './admin-shared';

export function QueuesTab() {
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
