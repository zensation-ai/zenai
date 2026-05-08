import { useState, useEffect, useCallback } from 'react';
import { SkeletonLoader } from '../SkeletonLoader';
import { apiCall, formatDate, SEVERITY_COLORS, styles } from './admin-shared';
import type { AuditLogEntry, SecurityAlert, RateLimitStats, SIEMStatus, SIEMConfigInput } from './admin-shared';

type SIEMProvider = 'noop' | 'datadog' | 'syslog';

export function SecurityTab() {
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [rateLimitStats, setRateLimitStats] = useState<RateLimitStats[]>([]);
  const [siemStatus, setSiemStatus] = useState<SIEMStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [subView, setSubView] = useState<'audit' | 'alerts' | 'rate-limits' | 'siem' | 'siem-config'>('audit');

  // Sprint 1.9: per-org SIEM config form state
  const [orgIdInput, setOrgIdInput] = useState('');
  const [siemProvider, setSiemProvider] = useState<SIEMProvider>('noop');
  const [siemEndpoint, setSiemEndpoint] = useState('https://http-intake.logs.datadoghq.eu/api/v2/logs');
  const [siemApiKey, setSiemApiKey] = useState('');
  const [siemHost, setSiemHost] = useState('');
  const [siemPort, setSiemPort] = useState('');
  const [siemFacility, setSiemFacility] = useState('');
  const [siemAppName, setSiemAppName] = useState('');
  const [siemConfigStatus, setSiemConfigStatus] = useState<string | null>(null);
  const [siemConfigBusy, setSiemConfigBusy] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (eventTypeFilter) params.set('event_type', eventTypeFilter);
      if (severityFilter) params.set('severity', severityFilter);

      const [auditRes, alertsRes, rlRes, siemRes] = await Promise.allSettled([
        apiCall<{ data: AuditLogEntry[] }>(`/api/security/audit-log?${params.toString()}`),
        apiCall<{ data: SecurityAlert[] }>('/api/security/alerts'),
        apiCall<{ data: RateLimitStats[] }>('/api/security/rate-limits/stats'),
        apiCall<{ data: SIEMStatus }>('/api/security/siem/status'),
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
      if (siemRes.status === 'fulfilled') {
        const d = (siemRes.value as { data?: SIEMStatus }).data;
        setSiemStatus(d ?? null);
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
      <div style={styles.filterBar} className="mb-4">
        {(['audit', 'alerts', 'rate-limits', 'siem', 'siem-config'] as const).map((v) => (
          <button
            key={v}
            style={subView === v ? styles.buttonPrimary : styles.button}
            onClick={() => setSubView(v)}
          >
            {v === 'audit'
              ? 'Audit Log'
              : v === 'alerts'
              ? `Alerts (${alerts.length})`
              : v === 'rate-limits'
              ? 'Rate Limits'
              : v === 'siem'
              ? `SIEM${siemStatus && siemStatus.failureCount > 0 ? ` (${siemStatus.failureCount})` : ''}`
              : 'SIEM Config'}
          </button>
        ))}
        <div className="flex-1" />
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
            <div style={styles.emptyState}>Keine Audit-Einträge gefunden.</div>
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
                      <td style={styles.td} className="whitespace-nowrap text-xs">
                        {formatDate(entry.created_at)}
                      </td>
                      <td style={styles.td}>
                        <span className="font-mono text-xs">
                          {entry.event_type}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.badge(SEVERITY_COLORS[entry.severity || 'info'] || '#64748b')}>
                          {entry.severity || 'info'}
                        </span>
                      </td>
                      <td style={styles.td} className="max-w-[300px] overflow-hidden text-ellipsis">
                        {entry.description || '-'}
                      </td>
                      <td style={styles.td} className="text-xs">{entry.user_id || '-'}</td>
                      <td style={styles.td} className="text-xs font-mono">
                        {entry.ip_address || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditLog.length > 50 && (
                <div style={styles.emptyState} className="!p-2">
                  Zeige 50 von {auditLog.length} Einträgen
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
                      <td style={styles.td} className="whitespace-nowrap text-xs">
                        {formatDate(alert.created_at)}
                      </td>
                      <td style={styles.td}>
                        <span className="font-mono text-xs">
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

      {subView === 'siem' && (
        <>
          {!siemStatus ? (
            <div style={styles.emptyState}>Kein SIEM-Status verfügbar.</div>
          ) : (
            <>
              <div style={styles.card} className="mb-4">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Provider</div>
                    <div className="font-mono text-sm font-semibold">{siemStatus.provider}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Erfolgreich</div>
                    <div className="font-mono text-sm font-semibold text-green-600">
                      {siemStatus.successCount.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Fehlgeschlagen</div>
                    <div className="font-mono text-sm font-semibold text-red-600">
                      {siemStatus.failureCount.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Fehlerrate</div>
                    <div className="font-mono text-sm font-semibold">
                      {(siemStatus.failureRate * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                {siemStatus.lastFailure && (
                  <div className="mt-3 p-2 rounded bg-red-50 text-xs">
                    <div className="font-semibold text-red-700">Letzter Fehler</div>
                    <div className="font-mono">
                      {formatDate(new Date(siemStatus.lastFailure.ts).toISOString())} ·{' '}
                      {siemStatus.lastFailure.eventType} · {siemStatus.lastFailure.error ?? 'unknown'}
                    </div>
                  </div>
                )}
              </div>

              {siemStatus.recent.length === 0 ? (
                <div style={styles.emptyState}>Noch keine SIEM-Forwards beobachtet.</div>
              ) : (
                <div style={styles.card}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Zeitpunkt</th>
                        <th style={styles.th}>Event</th>
                        <th style={styles.th}>Severity</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Fehler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siemStatus.recent.map((rec, i) => (
                        <tr key={`${rec.ts}-${i}`}>
                          <td style={styles.td} className="whitespace-nowrap text-xs">
                            {formatDate(new Date(rec.ts).toISOString())}
                          </td>
                          <td style={styles.td}>
                            <span className="font-mono text-xs">{rec.eventType}</span>
                          </td>
                          <td style={styles.td}>
                            <span style={styles.badge(SEVERITY_COLORS[rec.severity] || '#64748b')}>
                              {rec.severity}
                            </span>
                          </td>
                          <td style={styles.td}>
                            <span style={styles.badge(rec.ok ? '#4ade80' : '#ef4444')}>
                              {rec.ok ? 'ok' : 'fail'}
                            </span>
                          </td>
                          <td style={styles.td} className="text-xs">
                            {rec.error ?? '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {subView === 'siem-config' && (
        <div style={styles.card}>
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1">Organisation-ID</div>
            <input
              style={styles.input}
              placeholder="uuid"
              value={orgIdInput}
              onChange={(e) => setOrgIdInput(e.target.value)}
            />
          </div>

          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1">Provider</div>
            <select
              style={styles.select}
              value={siemProvider}
              onChange={(e) => setSiemProvider(e.target.value as SIEMProvider)}
            >
              <option value="noop">noop (disabled)</option>
              <option value="datadog">datadog</option>
              <option value="syslog">syslog</option>
            </select>
          </div>

          {siemProvider === 'datadog' && (
            <>
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">Endpoint (HTTPS)</div>
                <input
                  style={styles.input}
                  value={siemEndpoint}
                  onChange={(e) => setSiemEndpoint(e.target.value)}
                />
              </div>
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">API Key</div>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="DD API key (wird verschlüsselt gespeichert)"
                  value={siemApiKey}
                  onChange={(e) => setSiemApiKey(e.target.value)}
                />
              </div>
            </>
          )}

          {siemProvider === 'syslog' && (
            <>
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">Host</div>
                <input
                  style={styles.input}
                  placeholder="siem.acme.internal"
                  value={siemHost}
                  onChange={(e) => setSiemHost(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Port</div>
                  <input
                    style={styles.input}
                    placeholder="514"
                    value={siemPort}
                    onChange={(e) => setSiemPort(e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Facility (0-23)</div>
                  <input
                    style={styles.input}
                    placeholder="13"
                    value={siemFacility}
                    onChange={(e) => setSiemFacility(e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">App-Name</div>
                  <input
                    style={styles.input}
                    placeholder="zenai"
                    value={siemAppName}
                    onChange={(e) => setSiemAppName(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2">
            <button
              style={styles.buttonPrimary}
              disabled={siemConfigBusy || !orgIdInput}
              onClick={async () => {
                setSiemConfigStatus(null);
                setSiemConfigBusy(true);
                try {
                  let body: SIEMConfigInput;
                  if (siemProvider === 'datadog') {
                    body = {
                      provider: 'datadog',
                      endpoint: siemEndpoint,
                      apiKey: siemApiKey,
                    };
                  } else if (siemProvider === 'syslog') {
                    body = {
                      provider: 'syslog',
                      host: siemHost,
                      port: siemPort ? Number(siemPort) : undefined,
                      facility: siemFacility ? Number(siemFacility) : undefined,
                      appName: siemAppName || undefined,
                    };
                  } else {
                    body = { provider: 'noop' };
                  }
                  await apiCall(`/api/security/siem/config/${encodeURIComponent(orgIdInput)}`, {
                    method: 'PUT',
                    body: JSON.stringify(body),
                  });
                  setSiemConfigStatus('Gespeichert.');
                } catch (e) {
                  setSiemConfigStatus(e instanceof Error ? e.message : 'Fehler beim Speichern');
                } finally {
                  setSiemConfigBusy(false);
                }
              }}
            >
              Speichern
            </button>
            <button
              style={styles.button}
              disabled={siemConfigBusy || !orgIdInput}
              onClick={async () => {
                setSiemConfigStatus(null);
                setSiemConfigBusy(true);
                try {
                  await apiCall(`/api/security/siem/config/${encodeURIComponent(orgIdInput)}`, {
                    method: 'DELETE',
                  });
                  setSiemConfigStatus('Entfernt (fällt auf Env-Fallback zurück).');
                } catch (e) {
                  setSiemConfigStatus(e instanceof Error ? e.message : 'Fehler beim Entfernen');
                } finally {
                  setSiemConfigBusy(false);
                }
              }}
            >
              Entfernen
            </button>
          </div>
          {siemConfigStatus && (
            <div className="mt-3 text-xs">{siemConfigStatus}</div>
          )}
        </div>
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
                        <td style={styles.td} className="font-semibold">{rl.tier}</td>
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
