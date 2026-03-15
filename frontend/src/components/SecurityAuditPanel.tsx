/**
 * SecurityAuditPanel - Sicherheits-Audit-Log und Rate Limits
 *
 * Sub-Views:
 * - Audit-Log: Filterbare Sicherheitsereignisse mit Details
 * - Rate Limits: Aktuelle Konfiguration und Statistiken
 */

import { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl, getApiFetchHeaders } from '../utils/apiConfig';
import './SecurityAuditPanel.css';

// ─── Types ────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
  user_id: string;
  details: Record<string, unknown> | null;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

interface RateLimitTier {
  tier: string;
  max_requests: number;
  window_seconds: number;
  [key: string]: unknown;
}

interface RateLimitStat {
  endpoint: string;
  hits: number;
  blocked: number;
  [key: string]: unknown;
}

type SubView = 'audit-log' | 'rate-limits';

const EVENT_TYPES = [
  { value: '', label: 'Alle Ereignisse' },
  { value: 'login_success', label: 'Login erfolgreich' },
  { value: 'login_failure', label: 'Login fehlgeschlagen' },
  { value: 'permission_denied', label: 'Zugriff verweigert' },
  { value: 'data_access', label: 'Datenzugriff' },
  { value: 'config_change', label: 'Konfiguration' },
  { value: 'api_key_created', label: 'API-Key erstellt' },
  { value: 'mfa_enabled', label: 'MFA aktiviert' },
  { value: 'suspicious_activity', label: 'Verdaechtige Aktivitaet' },
  { value: 'rate_limit_exceeded', label: 'Rate Limit' },
  { value: 'data_export', label: 'Datenexport' },
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'Alle Stufen' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warnung' },
  { value: 'critical', label: 'Kritisch' },
];

const EVENT_LABELS: Record<string, string> = {
  login_success: 'Login OK',
  login_failure: 'Login Fehl',
  permission_denied: 'Zugriff verw.',
  data_access: 'Datenzugriff',
  config_change: 'Konfig.',
  api_key_created: 'API-Key',
  mfa_enabled: 'MFA',
  suspicious_activity: 'Verdaechtig',
  rate_limit_exceeded: 'Rate Limit',
  data_export: 'Export',
};

const SEVERITY_LABELS: Record<string, string> = {
  info: 'Info',
  warning: 'Warnung',
  critical: 'Kritisch',
};

// ─── Component ────────────────────────────────────────────

export function SecurityAuditPanel() {
  const apiUrl = getApiBaseUrl();
  const [subView, setSubView] = useState<SubView>('audit-log');

  // Audit log state
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [alerts, setAlerts] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterEventType, setFilterEventType] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Rate limits state
  const [rateTiers, setRateTiers] = useState<RateLimitTier[]>([]);
  const [rateStats, setRateStats] = useState<RateLimitStat[]>([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  // ─── Fetch helpers ────────────────────────────────────

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterEventType) params.set('event_type', filterEventType);
      if (filterSeverity) params.set('severity', filterSeverity);
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      params.set('limit', '100');

      const qs = params.toString();
      const res = await fetch(`${apiUrl}/api/security/audit-log${qs ? `?${qs}` : ''}`, {
        headers: getApiFetchHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntries(data.data || data.entries || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, filterEventType, filterSeverity, filterFrom, filterTo]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/security/alerts`, {
        headers: getApiFetchHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setAlerts(data.data || data.alerts || []);
    } catch {
      // non-critical
    }
  }, [apiUrl]);

  const fetchRateLimits = useCallback(async () => {
    setRateLoading(true);
    setRateError(null);
    try {
      const [tiersRes, statsRes] = await Promise.all([
        fetch(`${apiUrl}/api/security/rate-limits`, { headers: getApiFetchHeaders() }),
        fetch(`${apiUrl}/api/security/rate-limits/stats`, { headers: getApiFetchHeaders() }),
      ]);

      if (tiersRes.ok) {
        const tiersData = await tiersRes.json();
        const raw = tiersData.data || tiersData.tiers || tiersData;
        if (Array.isArray(raw)) {
          setRateTiers(raw);
        } else if (typeof raw === 'object' && raw !== null) {
          setRateTiers(Object.entries(raw).map(([tier, config]) => ({
            tier,
            ...(typeof config === 'object' && config !== null ? config as Record<string, unknown> : {}),
            max_requests: (config as Record<string, unknown>)?.max_requests as number ?? 0,
            window_seconds: (config as Record<string, unknown>)?.window_seconds as number ?? 0,
          })));
        }
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const raw = statsData.data || statsData.stats || statsData;
        if (Array.isArray(raw)) {
          setRateStats(raw);
        } else if (typeof raw === 'object' && raw !== null) {
          setRateStats(Object.entries(raw).map(([endpoint, info]) => ({
            endpoint,
            ...(typeof info === 'object' && info !== null ? info as Record<string, unknown> : {}),
            hits: (info as Record<string, unknown>)?.hits as number ?? 0,
            blocked: (info as Record<string, unknown>)?.blocked as number ?? 0,
          })));
        }
      }
    } catch (e) {
      setRateError(e instanceof Error ? e.message : 'Fehler beim Laden');
    } finally {
      setRateLoading(false);
    }
  }, [apiUrl]);

  // ─── Effects ──────────────────────────────────────────

  useEffect(() => {
    fetchAuditLog();
    fetchAlerts();
  }, [fetchAuditLog, fetchAlerts]);

  useEffect(() => {
    if (subView === 'rate-limits') {
      fetchRateLimits();
    }
  }, [subView, fetchRateLimits]);

  // ─── Formatters ───────────────────────────────────────

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const formatRelative = (iso: string) => {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'gerade eben';
      if (mins < 60) return `vor ${mins} Min.`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `vor ${hours} Std.`;
      const days = Math.floor(hours / 24);
      return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
    } catch {
      return iso;
    }
  };

  const resetFilters = () => {
    setFilterEventType('');
    setFilterSeverity('');
    setFilterFrom('');
    setFilterTo('');
  };

  const hasFilters = filterEventType || filterSeverity || filterFrom || filterTo;

  // ─── Render: Alerts Banner ────────────────────────────

  const renderAlerts = () => {
    if (alerts.length === 0) return null;

    return (
      <div className="security-alerts-banner">
        <div className="security-alerts-header">
          <span className="security-alerts-header-icon">!</span>
          Kritische Sicherheitsereignisse ({alerts.length})
        </div>
        {alerts.slice(0, 5).map((alert) => (
          <div key={alert.id} className="security-alert-item">
            <span className="security-alert-dot" />
            <span>{EVENT_LABELS[alert.event_type] || alert.event_type}</span>
            {alert.ip_address && (
              <span className="security-log-ip">{alert.ip_address}</span>
            )}
            <span className="security-alert-time">{formatRelative(alert.created_at)}</span>
          </div>
        ))}
      </div>
    );
  };

  // ─── Render: Audit Log ────────────────────────────────

  const renderAuditLog = () => (
    <div>
      {renderAlerts()}

      {/* Filters */}
      <div className="security-filters" style={{ marginTop: alerts.length > 0 ? '0.75rem' : 0 }}>
        <select
          className="security-filter-select"
          value={filterEventType}
          onChange={(e) => setFilterEventType(e.target.value)}
          aria-label="Ereignistyp filtern"
        >
          {EVENT_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          className="security-filter-select"
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          aria-label="Schweregrad filtern"
        >
          {SEVERITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <input
          type="date"
          className="security-filter-input"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          aria-label="Datum von"
          placeholder="Von"
        />

        <input
          type="date"
          className="security-filter-input"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          aria-label="Datum bis"
          placeholder="Bis"
        />

        <button
          type="button"
          className="security-filter-btn"
          onClick={fetchAuditLog}
        >
          Filtern
        </button>

        {hasFilters && (
          <button
            type="button"
            className="security-filter-reset"
            onClick={resetFilters}
          >
            Zuruecksetzen
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="security-loading">
          <span className="security-spinner" />
          Lade Audit-Log...
        </div>
      ) : error ? (
        <div className="security-error">
          Fehler: {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="security-empty">
          <div className="security-empty-icon">
            {hasFilters ? '🔍' : '✓'}
          </div>
          {hasFilters
            ? 'Keine Eintraege fuer diese Filter gefunden.'
            : 'Keine Sicherheitsereignisse vorhanden.'
          }
        </div>
      ) : (
        <div className="security-log-list" style={{ marginTop: '0.75rem' }}>
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <div
                key={entry.id}
                className={`security-log-entry${isExpanded ? ' expanded' : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedId(isExpanded ? null : entry.id);
                  }
                }}
              >
                <div className="security-log-entry-header">
                  <span
                    className={`security-severity-dot ${entry.severity}`}
                    title={SEVERITY_LABELS[entry.severity] || entry.severity}
                  />
                  <span className={`security-event-badge ${entry.event_type}`}>
                    {EVENT_LABELS[entry.event_type] || entry.event_type}
                  </span>
                  <div className="security-log-meta">
                    {entry.ip_address && (
                      <span className="security-log-ip">{entry.ip_address}</span>
                    )}
                    <span className="security-log-time">{formatTime(entry.created_at)}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="security-log-details">
                    <div className="security-detail-row">
                      <span className="security-detail-label">Schweregrad</span>
                      <span className="security-detail-value">
                        {SEVERITY_LABELS[entry.severity] || entry.severity}
                      </span>
                    </div>
                    <div className="security-detail-row">
                      <span className="security-detail-label">Ereignis</span>
                      <span className="security-detail-value">{entry.event_type}</span>
                    </div>
                    <div className="security-detail-row">
                      <span className="security-detail-label">Benutzer-ID</span>
                      <span className="security-detail-value">{entry.user_id || '---'}</span>
                    </div>
                    <div className="security-detail-row">
                      <span className="security-detail-label">IP-Adresse</span>
                      <span className="security-detail-value">{entry.ip_address || '---'}</span>
                    </div>
                    <div className="security-detail-row">
                      <span className="security-detail-label">User-Agent</span>
                      <span className="security-detail-value">{entry.user_agent || '---'}</span>
                    </div>
                    <div className="security-detail-row">
                      <span className="security-detail-label">Zeitpunkt</span>
                      <span className="security-detail-value">{formatTime(entry.created_at)}</span>
                    </div>
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <div>
                        <span className="security-detail-label">Details</span>
                        <div className="security-detail-json">
                          {JSON.stringify(entry.details, null, 2)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─── Render: Rate Limits ──────────────────────────────

  const renderRateLimits = () => {
    if (rateLoading) {
      return (
        <div className="security-loading">
          <span className="security-spinner" />
          Lade Rate Limits...
        </div>
      );
    }

    if (rateError) {
      return <div className="security-error">Fehler: {rateError}</div>;
    }

    const maxHits = rateStats.length > 0
      ? Math.max(...rateStats.map((s) => s.hits || 0), 1)
      : 1;

    return (
      <div>
        {/* Tier configuration */}
        <div className="security-rate-section">
          <h4 className="security-rate-section-title">Rate-Limit-Konfiguration</h4>
          {rateTiers.length === 0 ? (
            <div className="security-empty">
              <div className="security-empty-icon">&#9881;</div>
              Keine Rate-Limit-Konfiguration verfuegbar.
            </div>
          ) : (
            <div className="security-rate-grid">
              {rateTiers.map((tier) => (
                <div key={tier.tier} className="security-rate-card">
                  <div className="security-rate-card-title">{tier.tier}</div>
                  <div className="security-rate-card-row">
                    <span className="security-rate-card-label">Max. Anfragen</span>
                    <span className="security-rate-card-value">{tier.max_requests}</span>
                  </div>
                  <div className="security-rate-card-row">
                    <span className="security-rate-card-label">Zeitfenster</span>
                    <span className="security-rate-card-value">{tier.window_seconds}s</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hit statistics */}
        <div className="security-rate-section">
          <h4 className="security-rate-section-title">Zugriffs-Statistiken</h4>
          {rateStats.length === 0 ? (
            <div className="security-empty">
              <div className="security-empty-icon">&#128202;</div>
              Keine Statistiken verfuegbar.
            </div>
          ) : (
            <div className="security-stats-list">
              {rateStats.map((stat) => {
                const pct = Math.round(((stat.hits || 0) / maxHits) * 100);
                const blockRatio = stat.hits > 0 ? (stat.blocked || 0) / stat.hits : 0;
                const barClass = blockRatio > 0.5 ? 'critical'
                  : blockRatio > 0.2 ? 'high'
                  : blockRatio > 0.05 ? 'medium'
                  : 'low';

                return (
                  <div key={stat.endpoint} className="security-stat-item">
                    <div className="security-stat-header">
                      <span className="security-stat-label">{stat.endpoint}</span>
                      <span className="security-stat-value">
                        {stat.hits.toLocaleString('de-DE')} Anfragen
                        {stat.blocked > 0 && (
                          <span style={{ color: '#ef4444', marginLeft: '0.4rem', fontSize: '0.75rem' }}>
                            ({stat.blocked} blockiert)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="security-stat-bar-bg">
                      <div
                        className={`security-stat-bar-fill ${barClass}`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Main Render ──────────────────────────────────────

  const criticalCount = alerts.length;

  return (
    <div className="security-audit-panel">
      {/* Sub-navigation */}
      <div className="security-nav">
        <button
          type="button"
          className={`security-nav-btn${subView === 'audit-log' ? ' active' : ''}`}
          onClick={() => setSubView('audit-log')}
        >
          Audit-Log
          {criticalCount > 0 && (
            <span className="security-nav-count">{criticalCount}</span>
          )}
        </button>
        <button
          type="button"
          className={`security-nav-btn${subView === 'rate-limits' ? ' active' : ''}`}
          onClick={() => setSubView('rate-limits')}
        >
          Rate Limits
        </button>
      </div>

      {/* Content */}
      {subView === 'audit-log' ? renderAuditLog() : renderRateLimits()}
    </div>
  );
}
