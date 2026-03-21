import { useState, useEffect, useCallback } from 'react';
import { SkeletonLoader } from '../SkeletonLoader';
import { apiCall, formatDate, SEVERITY_COLORS, styles } from './admin-shared';
import type { AuditLogEntry, SecurityAlert, RateLimitStats } from './admin-shared';

export function SecurityTab() {
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
