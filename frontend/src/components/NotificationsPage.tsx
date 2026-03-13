import { useState, useEffect } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { getRandomReward } from '../utils/aiPersonality';
import type { AIContext } from './ContextSwitcher';
import { getContextLabel } from './ContextSwitcher';
import { UnifiedInbox } from './UnifiedInbox/UnifiedInbox';
import './NotificationsPage.css';
import '../neurodesign.css';

interface Device {
  id: string;
  device_token: string;
  device_name: string;
  device_model: string;
  os_version: string;
  app_version: string;
  is_active: boolean;
  last_used_at: string;
  created_at: string;
}

interface NotificationPreferences {
  draft_ready: boolean;
  feedback_reminder: boolean;
  idea_connections: boolean;
  learning_suggestions: boolean;
  weekly_summary: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string;
  max_per_hour: number;
  max_per_day: number;
}

interface NotificationHistory {
  id: string;
  type: string;
  title: string;
  body: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'opened';
  sent_at: string;
  opened_at: string | null;
}

interface NotificationStats {
  total_sent: number;
  total_opened: number;
  open_rate: number;
  by_type: Record<string, number>;
}

interface PushStatus {
  configured: boolean;
  provider: string;
  active_devices: number;
}

interface NotificationsPageProps {
  onBack: () => void;
  context: AIContext;
  onNavigate?: (page: string) => void;
}

const notificationTypeLabels: Record<string, { label: string; icon: string; description: string }> = {
  draft_ready: { label: 'Entwurf fertig', icon: '📝', description: 'Wenn ein KI-Entwurf generiert wurde' },
  feedback_reminder: { label: 'Feedback Erinnerung', icon: '💬', description: 'Erinnerung um Feedback zu geben' },
  idea_connections: { label: 'Ideen-Verbindungen', icon: '🔗', description: 'Wenn verwandte Ideen gefunden werden' },
  learning_suggestions: { label: 'Lern-Vorschläge', icon: '🧠', description: 'KI-Verbesserungsvorschläge' },
  weekly_summary: { label: 'Wochenzusammenfassung', icon: '📊', description: 'Wöchentlicher Aktivitätsbericht' },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ausstehend', color: '#f59e0b' },
  sent: { label: 'Gesendet', color: '#3b82f6' },
  delivered: { label: 'Zugestellt', color: '#10b981' },
  failed: { label: 'Fehlgeschlagen', color: '#ef4444' },
  opened: { label: 'Geöffnet', color: '#8b5cf6' },
};

export function NotificationsPage({ onBack, context, onNavigate }: NotificationsPageProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [history, setHistory] = useState<NotificationHistory[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inbox' | 'overview' | 'preferences' | 'devices' | 'history'>('inbox');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const confirmDialog = useConfirm();
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [context]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statusRes, devicesRes, historyRes, statsRes] = await Promise.all([
        axios.get(`/api/${context}/notifications/status`).catch(() => ({ data: { configured: false } })),
        axios.get(`/api/${context}/notifications/devices`).catch(() => ({ data: { devices: [] } })),
        axios.get(`/api/${context}/notifications/history?limit=50`).catch(() => ({ data: { notifications: [] } })),
        axios.get(`/api/${context}/notifications/stats`).catch(() => ({ data: null })),
      ]);

      setPushStatus(statusRes.data);
      setDevices(devicesRes.data.devices || []);
      setHistory(historyRes.data.notifications || []);
      setStats(statsRes.data);

      // Load preferences for first device if available
      if (devicesRes.data.devices?.length > 0) {
        const firstDevice = devicesRes.data.devices[0];
        setSelectedDevice(firstDevice.id);
        await loadDevicePreferences(firstDevice.id);
      }

      setError(null);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Hmm, das Laden hat gerade nicht geklappt. Versuch es gleich noch mal.'
        : 'Hmm, das Laden hat gerade nicht geklappt. Versuch es gleich noch mal.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadDevicePreferences = async (deviceId: string) => {
    try {
      const res = await axios.get(`/api/${context}/notifications/preferences/${deviceId}`);
      setPreferences(res.data.preferences);
    } catch {
      // Device might not have preferences yet
      setPreferences({
        draft_ready: true,
        feedback_reminder: true,
        idea_connections: true,
        learning_suggestions: true,
        weekly_summary: true,
        quiet_hours_start: null,
        quiet_hours_end: null,
        quiet_hours_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        max_per_hour: 5,
        max_per_day: 20,
      });
    }
  };

  const handleTogglePreference = async (key: keyof NotificationPreferences) => {
    if (!preferences || !selectedDevice) return;

    const newValue = !preferences[key];
    const updated = { ...preferences, [key]: newValue };
    setPreferences(updated);

    try {
      setSavingPrefs(true);
      await axios.put(`/api/${context}/notifications/preferences/${selectedDevice}`, updated);
      showToast('Einstellung gespeichert', 'success');
    } catch {
      // Revert on error
      setPreferences(preferences);
      showToast('Die Einstellung konnte nicht gespeichert werden. Prüf deine Verbindung und versuch es noch mal.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleUpdateQuietHours = async (start: string | null, end: string | null) => {
    if (!preferences || !selectedDevice) return;

    const updated = { ...preferences, quiet_hours_start: start, quiet_hours_end: end };
    setPreferences(updated);

    try {
      setSavingPrefs(true);
      await axios.put(`/api/${context}/notifications/preferences/${selectedDevice}`, updated);
      showToast('Ruhezeiten gespeichert', 'success');
    } catch {
      setPreferences(preferences);
      showToast('Die Ruhezeiten konnten nicht gespeichert werden. Versuch es gleich noch mal.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    const confirmed = await confirmDialog({ title: 'Gerät entfernen', message: 'Gerät wirklich entfernen? Du erhältst dann keine Push-Benachrichtigungen mehr auf diesem Gerät.', confirmText: 'Entfernen', variant: 'warning' });
    if (!confirmed) {
      return;
    }

    try {
      await axios.delete(`/api/${context}/notifications/device`, { data: { deviceId } });
      setDevices(prev => prev.filter(d => d.id !== deviceId));
      showToast('Gerät entfernt', 'success');
    } catch {
      showToast('Das Gerät konnte nicht entfernt werden. Ist deine Verbindung stabil?', 'error');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
    if (hours > 0) return `vor ${hours} Stunde${hours > 1 ? 'n' : ''}`;
    if (minutes > 0) return `vor ${minutes} Minute${minutes > 1 ? 'n' : ''}`;
    return 'gerade eben';
  };

  // Show reward on successful preference save (available for future use)
  const _showSaveReward = () => {
    const reward = getRandomReward('ideaCreated');
    showToast(`${reward.emoji} ${reward.message}`, 'success');
  };
  void _showSaveReward; // Suppress unused warning

  if (loading) {
    return (
      <div className="notifications-page neuro-page-enter">
        <div className="neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Benachrichtigungen...</p>
          <p className="neuro-loading-submessage">Einen Moment bitte</p>
        </div>
      </div>
    );
  }

  return (
    <div className="notifications-page neuro-page-enter">
      <div className="notifications-header">
        <button
          type="button"
          className="back-button neuro-hover-lift"
          onClick={onBack}
          aria-label="Zurück zur Übersicht"
        >
          ← Zurück
        </button>
        <h1>🔔 Benachrichtigungen</h1>
        <span className={`context-indicator ${context}`}>
          {getContextLabel(context)}
        </span>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Fehlermeldung schließen"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="notifications-tabs" role="group" aria-label="Benachrichtigungs-Tabs">
        <button
          type="button"
          className={`tab-btn neuro-press-effect ${activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('inbox')}
          aria-current={activeTab === 'inbox' ? 'true' : undefined}
        >
          📥 Inbox
        </button>
        <button
          type="button"
          className={`tab-btn neuro-press-effect ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          aria-current={activeTab === 'overview' ? 'true' : undefined}
        >
          📊 Übersicht
        </button>
        <button
          type="button"
          className={`tab-btn neuro-press-effect ${activeTab === 'preferences' ? 'active' : ''}`}
          onClick={() => setActiveTab('preferences')}
          aria-current={activeTab === 'preferences' ? 'true' : undefined}
        >
          ⚙️ Einstellungen
        </button>
        <button
          type="button"
          className={`tab-btn neuro-press-effect ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
          aria-current={activeTab === 'devices' ? 'true' : undefined}
        >
          📱 Geräte
          {devices.length > 0 && <span className="badge neuro-reward-badge">{devices.length}</span>}
        </button>
        <button
          type="button"
          className={`tab-btn neuro-press-effect ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          aria-current={activeTab === 'history' ? 'true' : undefined}
        >
          📜 Verlauf
        </button>
      </div>

      {/* Inbox Tab */}
      {activeTab === 'inbox' && (
        <div className="tab-content">
          <UnifiedInbox context={context} onNavigate={onNavigate} />
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          {/* Push Status */}
          <div className="status-card">
            <div className="status-header">
              <h3>Push-Status</h3>
              <span className={`status-badge ${pushStatus?.configured ? 'active' : 'inactive'}`}>
                {pushStatus?.configured ? '✓ Aktiv' : '○ Nicht konfiguriert'}
              </span>
            </div>
            {pushStatus?.configured && (
              <div className="status-details">
                <div className="status-item">
                  <span className="status-label">Anbieter</span>
                  <span className="status-value">{pushStatus.provider || 'APNs'}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Aktive Geräte</span>
                  <span className="status-value">{pushStatus.active_devices || devices.length}</span>
                </div>
              </div>
            )}
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-icon">📤</span>
                <div className="stat-content">
                  <span className="stat-value">{stats.total_sent}</span>
                  <span className="stat-label">Gesendet</span>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">👁️</span>
                <div className="stat-content">
                  <span className="stat-value">{stats.total_opened}</span>
                  <span className="stat-label">Geöffnet</span>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">📈</span>
                <div className="stat-content">
                  <span className="stat-value">{(stats.open_rate * 100).toFixed(0)}%</span>
                  <span className="stat-label">Öffnungsrate</span>
                </div>
              </div>
            </div>
          )}

          {/* Stats by Type */}
          {stats?.by_type && Object.keys(stats.by_type).length > 0 && (
            <div className="type-stats-section">
              <h3>Nach Typ</h3>
              <div className="type-stats-grid">
                {Object.entries(stats.by_type).map(([type, count]) => (
                  <div key={type} className="type-stat-item">
                    <span className="type-icon">{notificationTypeLabels[type]?.icon || '📌'}</span>
                    <span className="type-label">{notificationTypeLabels[type]?.label || type}</span>
                    <span className="type-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!stats && devices.length === 0 && (
            <div className="neuro-empty-state">
              <span className="neuro-empty-icon">📱</span>
              <h3 className="neuro-empty-title">Keine Geräte registriert</h3>
              <p className="neuro-empty-description">Öffne die iOS App und erlaube Push-Benachrichtigungen, um Nachrichten zu erhalten.</p>
              <p className="neuro-empty-encouragement">Bleib informiert, wo immer du bist.</p>
            </div>
          )}
        </div>
      )}

      {/* Preferences Tab */}
      {activeTab === 'preferences' && (
        <div className="tab-content">
          {devices.length === 0 ? (
            <div className="neuro-empty-state">
              <span className="neuro-empty-icon">⚙️</span>
              <h3 className="neuro-empty-title">Keine Geräte vorhanden</h3>
              <p className="neuro-empty-description">Registriere zuerst ein Gerät, um Einstellungen zu konfigurieren.</p>
              <p className="neuro-empty-encouragement">Einstellungen machen alles persönlicher.</p>
            </div>
          ) : (
            <>
              {/* Device Selector */}
              {devices.length > 1 && (
                <div className="device-selector">
                  <label>Einstellungen für:</label>
                  <select
                    value={selectedDevice || ''}
                    onChange={(e) => {
                      setSelectedDevice(e.target.value);
                      loadDevicePreferences(e.target.value);
                    }}
                  >
                    {devices.map(device => (
                      <option key={device.id} value={device.id}>
                        {device.device_name || device.device_model}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notification Types - Miller's Law: Max 7 items visible */}
              <div className="preferences-section neuro-chunk">
                <h3>Benachrichtigungstypen</h3>
                <div className="preferences-list neuro-flow-list">
                  {Object.entries(notificationTypeLabels).map(([key, { label, icon, description }]) => (
                    <div key={key} className="preference-item">
                      <div className="preference-info">
                        <span className="preference-icon">{icon}</span>
                        <div className="preference-text">
                          <strong>{label}</strong>
                          <p>{description}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`toggle-btn neuro-press-effect ${preferences?.[key as keyof NotificationPreferences] ? 'active' : ''}`}
                        onClick={() => handleTogglePreference(key as keyof NotificationPreferences)}
                        disabled={savingPrefs}
                        aria-label={`${label} ${preferences?.[key as keyof NotificationPreferences] ? 'deaktivieren' : 'aktivieren'}`}
                      >
                        {preferences?.[key as keyof NotificationPreferences] ? 'AN' : 'AUS'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quiet Hours */}
              <div className="preferences-section neuro-chunk">
                <h3>🌙 Ruhezeiten</h3>
                <p className="section-hint">Keine Benachrichtigungen während dieser Zeit</p>
                <div className="quiet-hours-form">
                  <div className="time-inputs">
                    <div className="time-input-group">
                      <label>Von</label>
                      <input
                        type="time"
                        value={preferences?.quiet_hours_start || ''}
                        onChange={(e) => handleUpdateQuietHours(e.target.value || null, preferences?.quiet_hours_end || null)}
                      />
                    </div>
                    <span className="time-separator">bis</span>
                    <div className="time-input-group">
                      <label>Bis</label>
                      <input
                        type="time"
                        value={preferences?.quiet_hours_end || ''}
                        onChange={(e) => handleUpdateQuietHours(preferences?.quiet_hours_start || null, e.target.value || null)}
                      />
                    </div>
                  </div>
                  {(preferences?.quiet_hours_start || preferences?.quiet_hours_end) && (
                    <button
                      type="button"
                      className="clear-quiet-hours neuro-hover-lift"
                      onClick={() => handleUpdateQuietHours(null, null)}
                      aria-label="Ruhezeiten deaktivieren"
                    >
                      Ruhezeiten deaktivieren
                    </button>
                  )}
                </div>
              </div>

              {/* Rate Limits */}
              <div className="preferences-section neuro-chunk">
                <h3>📊 Limits</h3>
                <div className="limits-display">
                  <div className="limit-item">
                    <span className="limit-label">Max. pro Stunde</span>
                    <span className="limit-value">{preferences?.max_per_hour || 5}</span>
                  </div>
                  <div className="limit-item">
                    <span className="limit-label">Max. pro Tag</span>
                    <span className="limit-value">{preferences?.max_per_day || 20}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Devices Tab */}
      {activeTab === 'devices' && (
        <div className="tab-content">
          {devices.length === 0 ? (
            <div className="neuro-empty-state">
              <span className="neuro-empty-icon">📱</span>
              <h3 className="neuro-empty-title">Keine Geräte registriert</h3>
              <p className="neuro-empty-description">Öffne die iOS App und erlaube Push-Benachrichtigungen.</p>
              <p className="neuro-empty-encouragement">Verbinde dein erstes Gerät.</p>
            </div>
          ) : (
            <div className="devices-list neuro-flow-list">
              {devices.map(device => (
                <div key={device.id} className={`device-card ${device.is_active ? 'active' : 'inactive'}`}>
                  <div className="device-icon">
                    {device.device_model?.includes('iPhone') ? '📱' :
                     device.device_model?.includes('iPad') ? '📱' : '💻'}
                  </div>
                  <div className="device-info">
                    <div className="device-name">
                      {device.device_name || device.device_model || 'Unbekanntes Gerät'}
                      {device.is_active && <span className="active-badge">Aktiv</span>}
                    </div>
                    <div className="device-meta">
                      <span>{device.device_model}</span>
                      <span>•</span>
                      <span>{device.os_version}</span>
                      <span>•</span>
                      <span>App v{device.app_version}</span>
                    </div>
                    <div className="device-last-used">
                      Zuletzt aktiv: {formatRelativeTime(device.last_used_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="remove-device-btn neuro-hover-lift"
                    onClick={() => handleRemoveDevice(device.id)}
                    aria-label={`Gerät ${device.device_name || device.device_model || 'Unbekannt'} entfernen`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="tab-content">
          {history.length === 0 ? (
            <div className="neuro-empty-state">
              <span className="neuro-empty-icon">📜</span>
              <h3 className="neuro-empty-title">Noch keine Benachrichtigungen</h3>
              <p className="neuro-empty-description">Gesendete Benachrichtigungen erscheinen hier.</p>
              <p className="neuro-empty-encouragement">Der Verlauf füllt sich mit der Zeit.</p>
            </div>
          ) : (
            <div className="history-list neuro-flow-list">
              {history.map(notification => (
                <div key={notification.id} className="history-item">
                  <div className="history-icon">
                    {notificationTypeLabels[notification.type]?.icon || '📌'}
                  </div>
                  <div className="history-content">
                    <div className="history-title">{notification.title}</div>
                    <div className="history-body">{notification.body}</div>
                    <div className="history-meta">
                      <span className="history-time">{formatDate(notification.sent_at)}</span>
                      <span
                        className="history-status"
                        style={{ color: statusLabels[notification.status]?.color }}
                      >
                        {statusLabels[notification.status]?.label || notification.status}
                      </span>
                      {notification.opened_at && (
                        <span className="history-opened">
                          Geöffnet: {formatDate(notification.opened_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
