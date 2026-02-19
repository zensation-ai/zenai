import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import '../neurodesign.css';
import './SyncDashboard.css';
import { logError } from '../utils/errors';

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
  embedded?: boolean;
}

export function SyncDashboard({ onBack, context, embedded }: SyncDashboardProps) {
  const greeting = getTimeBasedGreeting();
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
      logError('SyncDashboard:fetchSyncStatus', err);
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
      setPendingChanges(res.data.data?.changes || []);
    } catch (err) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;
      logError('SyncDashboard:fetchPendingChanges', err);
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
      logError('SyncDashboard:triggerSync', err);
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
      logError('SyncDashboard:removeDevice', err);
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
      <div className="sync-dashboard neuro-page-enter">
        <div className="loading-state neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Sync-Status...</p>
          <p className="neuro-loading-submessage">Verbindungen werden gepruft</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sync-dashboard neuro-page-enter">
      {!embedded && (
        <div className="sync-header liquid-glass-nav">
          <button type="button" className="back-button neuro-hover-lift" onClick={onBack}>
            ← Zurück
          </button>
          <div className="header-greeting">
            <h1>{greeting.emoji} Synchronisation</h1>
            <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
          </div>
          <span className={`context-indicator ${context}`}>
            {{ personal: 'Persönlich', work: 'Arbeit', learning: 'Lernen', creative: 'Kreativ' }[context] || context}
          </span>
        </div>
      )}

      <div className="sync-tabs liquid-glass">
        <button
          type="button"
          className={`tab-btn neuro-hover-lift ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          Status
        </button>
        <button
          type="button"
          className={`tab-btn neuro-hover-lift ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          Geräte
          {syncStatus && syncStatus.devices.length > 0 && (
            <span className="badge">{syncStatus.devices.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`tab-btn neuro-hover-lift ${activeTab === 'changes' ? 'active' : ''}`}
          onClick={() => setActiveTab('changes')}
        >
          Änderungen
          {syncStatus && syncStatus.pending_changes > 0 && (
            <span className="badge warning">{syncStatus.pending_changes}</span>
          )}
        </button>
      </div>

      {activeTab === 'status' && syncStatus && (
        <div className="status-content neuro-stagger-item">
          <div className="status-card main liquid-glass neuro-stagger-item neuro-hover-lift">
            <div className={`status-indicator ${syncStatus.sync_enabled ? 'active neuro-breathing' : 'inactive'}`}>
              <span className="status-icon">
                {syncStatus.sync_enabled ? '✓' : '✕'}
              </span>
            </div>
            <div className="status-info">
              <h3>{syncStatus.sync_enabled ? 'Sync aktiv' : 'Sync deaktiviert'}</h3>
              <p>Letzte Synchronisation: {formatDate(syncStatus.last_sync)}</p>
            </div>
            <button
              type="button"
              className="sync-btn neuro-button neuro-success-burst"
              onClick={handleManualSync}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <span className="neuro-loading-spinner" />
                  Synchronisiere...
                </>
              ) : (
                <>Jetzt synchronisieren</>
              )}
            </button>
          </div>

          <div className="stats-grid neuro-flow-list">
            <div className="stat-card liquid-glass neuro-stagger-item neuro-hover-lift">
              <span className="stat-icon">📱</span>
              <span className="stat-value">{syncStatus.devices.length}</span>
              <span className="stat-label">Verbundene Geräte</span>
            </div>
            <div className="stat-card liquid-glass neuro-stagger-item neuro-hover-lift">
              <span className="stat-icon">📝</span>
              <span className="stat-value">{syncStatus.pending_changes}</span>
              <span className="stat-label">Ausstehende Änderungen</span>
            </div>
            <div className="stat-card liquid-glass neuro-stagger-item neuro-hover-lift">
              <span className="stat-icon">⏱️</span>
              <span className="stat-value">30s</span>
              <span className="stat-label">Sync-Intervall</span>
            </div>
          </div>

          <div className="sync-info liquid-glass neuro-stagger-item">
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
        <div className="devices-content neuro-stagger-item">
          {syncStatus.devices.length === 0 ? (
            <div className="empty-state neuro-empty-state neuro-stagger-item">
              <span className="empty-icon neuro-empty-icon neuro-breathing">📱</span>
              <h3 className="neuro-empty-title">Keine Geräte verbunden</h3>
              <p className="neuro-empty-description">Melde dich auf anderen Geräten an, um sie hier zu sehen.</p>
              <p className="neuro-empty-encouragement">Deine Daten sind bereit zur Synchronisation!</p>
            </div>
          ) : (
            <div className="devices-list neuro-flow-list">
              {syncStatus.devices.slice(0, 7).map((device, index) => (
                <div key={device.id} className={`device-card liquid-glass neuro-stagger-item neuro-hover-lift ${device.is_current ? 'current' : ''}`} style={{ animationDelay: `${index * 50}ms` }}>
                  <span className="device-icon">{getDeviceIcon(device.type)}</span>
                  <div className="device-info">
                    <span className="device-name">
                      {device.name}
                      {device.is_current && <span className="current-badge">Dieses Gerat</span>}
                    </span>
                    <span className="device-last-seen">
                      Zuletzt aktiv: {formatDate(device.last_seen)}
                    </span>
                  </div>
                  {!device.is_current && (
                    <button
                      type="button"
                      className="remove-btn neuro-hover-lift"
                      onClick={() => handleRemoveDevice(device.id)}
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'changes' && (
        <div className="changes-content neuro-stagger-item">
          {pendingChanges.length === 0 ? (
            <div className="empty-state neuro-empty-state neuro-stagger-item">
              <span className="empty-icon neuro-empty-icon neuro-breathing">✓</span>
              <h3 className="neuro-empty-title">Alles synchronisiert</h3>
              <p className="neuro-empty-description">Keine ausstehenden Änderungen.</p>
              <p className="neuro-empty-encouragement">Perfekt - alles ist auf dem neuesten Stand!</p>
            </div>
          ) : (
            <div className="changes-list neuro-flow-list">
              {pendingChanges.slice(0, 7).map((change, index) => (
                <div key={change.id} className={`change-item liquid-glass neuro-stagger-item neuro-hover-lift ${change.synced ? 'synced' : 'pending'}`} style={{ animationDelay: `${index * 50}ms` }}>
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
