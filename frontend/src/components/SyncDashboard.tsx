import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import './SyncDashboard.css';

interface Device {
  id: string;
  name: string;
  type: 'ios' | 'web' | 'desktop';
  last_seen: string;
  is_current: boolean;
}

interface SyncStatus {
  last_sync: string;
  pending_changes: number;
  sync_enabled: boolean;
  devices: Device[];
}

interface PendingChange {
  id: string;
  type: string;
  action: string;
  timestamp: string;
  synced: boolean;
}

interface SyncDashboardProps {
  onBack: () => void;
  context: string;
}

export function SyncDashboard({ onBack, context }: SyncDashboardProps) {
  const [activeTab, setActiveTab] = useState<'status' | 'devices' | 'changes'>('status');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);

  // AbortController refs to prevent memory leaks on unmount
  const statusAbortRef = useRef<AbortController | null>(null);
  const changesAbortRef = useRef<AbortController | null>(null);

  const loadSyncStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/${context}/sync/status`, { signal });
      setSyncStatus(res.data);
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;
      console.error('Failed to load sync status:', err);
      // Set default status if API not available
      setSyncStatus({
        last_sync: new Date().toISOString(),
        pending_changes: 0,
        sync_enabled: true,
        devices: []
      });
    } finally {
      setLoading(false);
    }
  }, [context]);

  const loadPendingChanges = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await axios.get(`/api/${context}/sync/pending`, { signal });
      setPendingChanges(res.data.changes || []);
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;
      console.error('Failed to load pending changes:', err);
      setPendingChanges([]);
    }
  }, [context]);

  useEffect(() => {
    // Abort any previous request
    statusAbortRef.current?.abort();
    statusAbortRef.current = new AbortController();
    loadSyncStatus(statusAbortRef.current.signal);

    // Cleanup on unmount
    return () => {
      statusAbortRef.current?.abort();
    };
  }, [loadSyncStatus]);

  useEffect(() => {
    if (activeTab === 'changes') {
      // Abort any previous request
      changesAbortRef.current?.abort();
      changesAbortRef.current = new AbortController();
      loadPendingChanges(changesAbortRef.current.signal);
    }

    // Cleanup on unmount
    return () => {
      changesAbortRef.current?.abort();
    };
  }, [activeTab, loadPendingChanges]);

  // Manual reload handlers
  const handleReloadStatus = useCallback(() => {
    statusAbortRef.current?.abort();
    statusAbortRef.current = new AbortController();
    loadSyncStatus(statusAbortRef.current.signal);
  }, [loadSyncStatus]);

  const handleReloadChanges = useCallback(() => {
    changesAbortRef.current?.abort();
    changesAbortRef.current = new AbortController();
    loadPendingChanges(changesAbortRef.current.signal);
  }, [loadPendingChanges]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await axios.post(`/api/${context}/sync/trigger`);
      showToast('Sync erfolgreich!', 'success');
      handleReloadStatus();
      handleReloadChanges();
    } catch (err) {
      console.error('Sync failed:', err);
      showToast('Sync fehlgeschlagen', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      await axios.delete(`/api/sync/devices/${deviceId}`);
      showToast('Gerät entfernt', 'success');
      handleReloadStatus();
    } catch (err) {
      console.error('Failed to remove device:', err);
      showToast('Fehler beim Entfernen', 'error');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Gerade eben';
    if (minutes < 60) return `Vor ${minutes} Min.`;
    if (hours < 24) return `Vor ${hours} Std.`;
    if (days < 7) return `Vor ${days} Tagen`;

    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'ios': return '📱';
      case 'web': return '🌐';
      case 'desktop': return '💻';
      default: return '📟';
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'create': return 'Erstellt';
      case 'update': return 'Aktualisiert';
      case 'delete': return 'Gelöscht';
      default: return action;
    }
  };

  if (loading) {
    return (
      <div className="sync-dashboard">
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Lade Sync-Status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sync-dashboard">
      <div className="sync-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h1>🔄 Synchronisation</h1>
        <span className={`context-indicator ${context}`}>
          {context === 'personal' ? '🏠 Privat' : '💼 Arbeit'}
        </span>
      </div>

      <div className="sync-tabs">
        <button
          className={`tab-btn ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          📊 Status
        </button>
        <button
          className={`tab-btn ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          📱 Geräte
          {syncStatus && syncStatus.devices.length > 0 && (
            <span className="badge">{syncStatus.devices.length}</span>
          )}
        </button>
        <button
          className={`tab-btn ${activeTab === 'changes' ? 'active' : ''}`}
          onClick={() => setActiveTab('changes')}
        >
          📝 Änderungen
          {syncStatus && syncStatus.pending_changes > 0 && (
            <span className="badge warning">{syncStatus.pending_changes}</span>
          )}
        </button>
      </div>

      {activeTab === 'status' && syncStatus && (
        <div className="status-content">
          <div className="status-card main">
            <div className={`status-indicator ${syncStatus.sync_enabled ? 'active' : 'inactive'}`}>
              <span className="status-icon">
                {syncStatus.sync_enabled ? '✓' : '✕'}
              </span>
            </div>
            <div className="status-info">
              <h3>{syncStatus.sync_enabled ? 'Sync aktiv' : 'Sync deaktiviert'}</h3>
              <p>Letzte Synchronisation: {formatDate(syncStatus.last_sync)}</p>
            </div>
            <button
              className="sync-btn"
              onClick={handleManualSync}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <span className="loading-spinner" />
                  Synchronisiere...
                </>
              ) : (
                <>🔄 Jetzt synchronisieren</>
              )}
            </button>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-icon">📱</span>
              <span className="stat-value">{syncStatus.devices.length}</span>
              <span className="stat-label">Verbundene Geräte</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">📝</span>
              <span className="stat-value">{syncStatus.pending_changes}</span>
              <span className="stat-label">Ausstehende Änderungen</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">⏱️</span>
              <span className="stat-value">30s</span>
              <span className="stat-label">Sync-Intervall</span>
            </div>
          </div>

          <div className="sync-info">
            <h4>So funktioniert die Synchronisation</h4>
            <ul>
              <li>Änderungen werden automatisch alle 30 Sekunden synchronisiert</li>
              <li>Bei Konflikten gewinnt die neueste Änderung</li>
              <li>Offline-Änderungen werden beim nächsten Online-Status synchronisiert</li>
              <li>Push-Benachrichtigungen informieren über wichtige Updates</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'devices' && syncStatus && (
        <div className="devices-content">
          {syncStatus.devices.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📱</span>
              <h3>Keine Geräte verbunden</h3>
              <p>Melde dich auf anderen Geräten an, um sie hier zu sehen.</p>
            </div>
          ) : (
            <div className="devices-list">
              {syncStatus.devices.map(device => (
                <div key={device.id} className={`device-card ${device.is_current ? 'current' : ''}`}>
                  <span className="device-icon">{getDeviceIcon(device.type)}</span>
                  <div className="device-info">
                    <span className="device-name">
                      {device.name}
                      {device.is_current && <span className="current-badge">Dieses Gerät</span>}
                    </span>
                    <span className="device-last-seen">
                      Zuletzt aktiv: {formatDate(device.last_seen)}
                    </span>
                  </div>
                  {!device.is_current && (
                    <button
                      className="remove-btn"
                      onClick={() => handleRemoveDevice(device.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'changes' && (
        <div className="changes-content">
          {pendingChanges.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✓</span>
              <h3>Alles synchronisiert</h3>
              <p>Keine ausstehenden Änderungen.</p>
            </div>
          ) : (
            <div className="changes-list">
              {pendingChanges.map(change => (
                <div key={change.id} className={`change-item ${change.synced ? 'synced' : 'pending'}`}>
                  <div className="change-status">
                    {change.synced ? '✓' : '⏳'}
                  </div>
                  <div className="change-info">
                    <span className="change-type">{change.type}</span>
                    <span className="change-action">{getActionLabel(change.action)}</span>
                  </div>
                  <span className="change-time">{formatDate(change.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
