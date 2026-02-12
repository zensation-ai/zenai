/**
 * MemoryGovernance - GDPR-compliant Memory Privacy & Data Control
 *
 * Endpoints:
 * - GET /api/memory/privacy/:context     - Privacy settings
 * - PUT /api/memory/privacy/:context     - Update privacy settings
 * - DELETE /api/memory/erase/:context    - Full erasure (Art. 17)
 * - DELETE /api/memory/erase/:context/:layer - Layer erasure
 * - GET /api/memory/export/:context      - Data export (Art. 20)
 * - GET /api/memory/audit/:context       - Audit trail
 * - GET /api/memory/overview/:context    - Memory overview
 *
 * Embedded in Settings -> Privacy tab.
 */

import { useState, useEffect, useCallback, memo } from 'react';
import axios from 'axios';
import type { AIContext } from './ContextSwitcher';
import { SkeletonLoader } from './SkeletonLoader';
import { showToast } from './Toast';
import { logError } from '../utils/errors';
import './MemoryGovernance.css';

// ============================================
// Types
// ============================================

interface PrivacySettings {
  allowMemoryStorage: boolean;
  allowPatternDetection: boolean;
  allowLongTermMemory: boolean;
  allowCrossContextLinking: boolean;
  retentionDays: number;
}

interface MemoryOverview {
  workingMemory: number;
  episodicMemory: number;
  shortTermMemory: number;
  longTermMemory: number;
  totalFacts: number;
  totalPatterns: number;
}

interface AuditEntry {
  id: string;
  action: string;
  details: string;
  timestamp: string;
}

interface MemoryGovernanceProps {
  context: AIContext;
}

const MEMORY_LAYERS = [
  { id: 'working', label: 'Arbeitsgedächtnis', icon: '💭', desc: 'Aktiver Task-Fokus und Kontext' },
  { id: 'episodic', label: 'Episodisches Gedächtnis', icon: '📖', desc: 'Konkrete Erfahrungen und Interaktionen' },
  { id: 'short_term', label: 'Kurzzeitgedächtnis', icon: '🕐', desc: 'Session-Kontext und aktueller Gesprächsverlauf' },
  { id: 'long_term', label: 'Langzeitgedächtnis', icon: '🧠', desc: 'Persistentes Wissen und Präferenzen' },
] as const;

const CONTEXT_LABELS: Record<AIContext, string> = {
  personal: 'Privat',
  work: 'Arbeit',
  learning: 'Lernen',
  creative: 'Kreativ',
};

// ============================================
// Component
// ============================================

const MemoryGovernanceComponent: React.FC<MemoryGovernanceProps> = ({ context }) => {
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [overview, setOverview] = useState<MemoryOverview | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [confirmErase, setConfirmErase] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Load privacy settings + overview
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [privacyRes, overviewRes] = await Promise.allSettled([
          axios.get(`/api/memory/privacy/${context}`),
          axios.get(`/api/memory/overview/${context}`),
        ]);

        if (!cancelled) {
          if (privacyRes.status === 'fulfilled' && privacyRes.value.data?.success) {
            setPrivacy(privacyRes.value.data.settings);
          } else {
            // Default settings if endpoint not available yet
            setPrivacy({
              allowMemoryStorage: true,
              allowPatternDetection: true,
              allowLongTermMemory: true,
              allowCrossContextLinking: false,
              retentionDays: 365,
            });
          }

          if (overviewRes.status === 'fulfilled' && overviewRes.value.data?.success) {
            setOverview(overviewRes.value.data.overview);
          }
        }
      } catch (err) {
        logError('MemoryGovernance:load', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [context]);

  // Save privacy settings
  const savePrivacy = useCallback(async (updated: PrivacySettings) => {
    setSaving(true);
    try {
      await axios.put(`/api/memory/privacy/${context}`, updated);
      setPrivacy(updated);
      showToast('Datenschutz-Einstellungen gespeichert', 'success');
    } catch (err) {
      logError('MemoryGovernance:save', err);
      showToast('Fehler beim Speichern', 'error');
    } finally {
      setSaving(false);
    }
  }, [context]);

  const toggleSetting = useCallback((key: keyof PrivacySettings) => {
    if (!privacy) return;
    const updated = { ...privacy, [key]: !privacy[key] };
    setPrivacy(updated);
    savePrivacy(updated);
  }, [privacy, savePrivacy]);

  const updateRetention = useCallback((days: number) => {
    if (!privacy) return;
    const updated = { ...privacy, retentionDays: days };
    setPrivacy(updated);
    savePrivacy(updated);
  }, [privacy, savePrivacy]);

  // Erase memory (Art. 17 GDPR)
  const handleErase = useCallback(async (layer?: string) => {
    try {
      const url = layer
        ? `/api/memory/erase/${context}/${layer}`
        : `/api/memory/erase/${context}`;

      await axios.delete(url);
      showToast(
        layer ? `${layer}-Gedächtnis gelöscht` : 'Alle Daten gelöscht (Art. 17 DSGVO)',
        'success'
      );
      setConfirmErase(null);

      // Refresh overview
      try {
        const res = await axios.get(`/api/memory/overview/${context}`);
        if (res.data?.success) setOverview(res.data.overview);
      } catch { /* ignore */ }
    } catch (err) {
      logError('MemoryGovernance:erase', err);
      showToast('Fehler beim Löschen', 'error');
    }
  }, [context]);

  // Export data (Art. 20 GDPR)
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await axios.get(`/api/memory/export/${context}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `zenai-memory-export-${context}-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast('Datenexport heruntergeladen (Art. 20 DSGVO)', 'success');
    } catch (err) {
      logError('MemoryGovernance:export', err);
      showToast('Export fehlgeschlagen', 'error');
    } finally {
      setExporting(false);
    }
  }, [context]);

  // Load audit trail
  const loadAudit = useCallback(async () => {
    try {
      const res = await axios.get(`/api/memory/audit/${context}`);
      if (res.data?.success) {
        setAudit(res.data.entries || []);
      }
    } catch (err) {
      logError('MemoryGovernance:audit', err);
    }
  }, [context]);

  const handleShowAudit = useCallback(() => {
    setShowAudit(prev => {
      if (!prev) loadAudit();
      return !prev;
    });
  }, [loadAudit]);

  if (loading) {
    return <div className="memgov-loading"><SkeletonLoader type="card" count={3} /></div>;
  }

  return (
    <div className="memgov">
      {/* Context indicator */}
      <div className="memgov-context-info">
        Daten-Kontrolle für Kontext: <strong>{CONTEXT_LABELS[context]}</strong>
      </div>

      {/* Memory Overview */}
      {overview && (
        <div className="memgov-group">
          <h3 className="memgov-group-title">Gedächtnis-Übersicht</h3>
          <div className="memgov-overview-grid">
            {MEMORY_LAYERS.map((layer) => {
              const count = overview[`${layer.id}Memory` as keyof MemoryOverview] ?? 0;
              return (
                <div key={layer.id} className="memgov-layer-card">
                  <div className="memgov-layer-header">
                    <span className="memgov-layer-icon" aria-hidden="true">{layer.icon}</span>
                    <span className="memgov-layer-label">{layer.label}</span>
                  </div>
                  <span className="memgov-layer-count">{count} Einträge</span>
                  <span className="memgov-layer-desc">{layer.desc}</span>
                  <button
                    type="button"
                    className="memgov-layer-erase neuro-focus-ring"
                    onClick={() => setConfirmErase(layer.id)}
                  >
                    Löschen
                  </button>
                </div>
              );
            })}
          </div>
          <div className="memgov-overview-totals">
            <span>{overview.totalFacts} gelernte Fakten</span>
            <span>{overview.totalPatterns} erkannte Muster</span>
          </div>
        </div>
      )}

      {/* Privacy Settings */}
      {privacy && (
        <div className="memgov-group">
          <h3 className="memgov-group-title">Datenschutz-Einstellungen</h3>

          <div className="memgov-setting">
            <div className="memgov-setting-info">
              <span className="memgov-setting-label">Gedächtnis-Speicherung</span>
              <span className="memgov-setting-desc">KI merkt sich Konversationen und Präferenzen</span>
            </div>
            <label className="memgov-toggle" aria-label="Gedächtnis-Speicherung">
              <input
                type="checkbox"
                checked={privacy.allowMemoryStorage}
                onChange={() => toggleSetting('allowMemoryStorage')}
                disabled={saving}
              />
              <span className="memgov-toggle-slider" />
            </label>
          </div>

          <div className="memgov-setting">
            <div className="memgov-setting-info">
              <span className="memgov-setting-label">Muster-Erkennung</span>
              <span className="memgov-setting-desc">KI erkennt Gewohnheiten und Trends</span>
            </div>
            <label className="memgov-toggle" aria-label="Muster-Erkennung">
              <input
                type="checkbox"
                checked={privacy.allowPatternDetection}
                onChange={() => toggleSetting('allowPatternDetection')}
                disabled={saving}
              />
              <span className="memgov-toggle-slider" />
            </label>
          </div>

          <div className="memgov-setting">
            <div className="memgov-setting-info">
              <span className="memgov-setting-label">Langzeitgedächtnis</span>
              <span className="memgov-setting-desc">Fakten und Präferenzen dauerhaft speichern</span>
            </div>
            <label className="memgov-toggle" aria-label="Langzeitgedächtnis">
              <input
                type="checkbox"
                checked={privacy.allowLongTermMemory}
                onChange={() => toggleSetting('allowLongTermMemory')}
                disabled={saving}
              />
              <span className="memgov-toggle-slider" />
            </label>
          </div>

          <div className="memgov-setting">
            <div className="memgov-setting-info">
              <span className="memgov-setting-label">Kontextübergreifende Verknüpfung</span>
              <span className="memgov-setting-desc">Verbindungen zwischen Arbeit, Privat, Lernen, Kreativ</span>
            </div>
            <label className="memgov-toggle" aria-label="Kontextverknüpfung">
              <input
                type="checkbox"
                checked={privacy.allowCrossContextLinking}
                onChange={() => toggleSetting('allowCrossContextLinking')}
                disabled={saving}
              />
              <span className="memgov-toggle-slider" />
            </label>
          </div>

          <div className="memgov-setting">
            <div className="memgov-setting-info">
              <span className="memgov-setting-label">Aufbewahrungsdauer</span>
              <span className="memgov-setting-desc">Automatische Löschung nach Ablauf</span>
            </div>
            <select
              className="memgov-select neuro-focus-ring"
              value={privacy.retentionDays}
              onChange={(e) => updateRetention(Number(e.target.value))}
              disabled={saving}
              aria-label="Aufbewahrungsdauer"
            >
              <option value={30}>30 Tage</option>
              <option value={90}>90 Tage</option>
              <option value={180}>6 Monate</option>
              <option value={365}>1 Jahr</option>
              <option value={730}>2 Jahre</option>
              <option value={-1}>Unbegrenzt</option>
            </select>
          </div>
        </div>
      )}

      {/* GDPR Actions */}
      <div className="memgov-group">
        <h3 className="memgov-group-title">DSGVO-Rechte</h3>

        <div className="memgov-gdpr-actions">
          <div className="memgov-gdpr-card">
            <div className="memgov-gdpr-info">
              <span className="memgov-gdpr-icon" aria-hidden="true">📦</span>
              <div>
                <span className="memgov-gdpr-label">Datenexport (Art. 20)</span>
                <span className="memgov-gdpr-desc">Alle gespeicherten Daten als JSON herunterladen</span>
              </div>
            </div>
            <button
              type="button"
              className="memgov-gdpr-btn export neuro-focus-ring"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Exportiere...' : 'Exportieren'}
            </button>
          </div>

          <div className="memgov-gdpr-card">
            <div className="memgov-gdpr-info">
              <span className="memgov-gdpr-icon" aria-hidden="true">📋</span>
              <div>
                <span className="memgov-gdpr-label">Audit Trail</span>
                <span className="memgov-gdpr-desc">Protokoll aller Datenverarbeitungen einsehen</span>
              </div>
            </div>
            <button
              type="button"
              className="memgov-gdpr-btn neuro-focus-ring"
              onClick={handleShowAudit}
            >
              {showAudit ? 'Ausblenden' : 'Anzeigen'}
            </button>
          </div>

          <div className="memgov-gdpr-card danger">
            <div className="memgov-gdpr-info">
              <span className="memgov-gdpr-icon" aria-hidden="true">🗑️</span>
              <div>
                <span className="memgov-gdpr-label">Komplett-Löschung (Art. 17)</span>
                <span className="memgov-gdpr-desc">Alle KI-Daten für &quot;{CONTEXT_LABELS[context]}&quot; unwiderruflich löschen</span>
              </div>
            </div>
            <button
              type="button"
              className="memgov-gdpr-btn danger neuro-focus-ring"
              onClick={() => setConfirmErase('all')}
            >
              Alle Daten löschen
            </button>
          </div>
        </div>
      </div>

      {/* Audit Trail */}
      {showAudit && (
        <div className="memgov-audit">
          <h4 className="memgov-audit-title">Audit Trail</h4>
          {audit.length === 0 ? (
            <p className="memgov-audit-empty">Keine Einträge vorhanden.</p>
          ) : (
            <div className="memgov-audit-list">
              {audit.slice(0, 50).map((entry) => (
                <div key={entry.id} className="memgov-audit-entry">
                  <span className="memgov-audit-action">{entry.action}</span>
                  <span className="memgov-audit-details">{entry.details}</span>
                  <span className="memgov-audit-time">
                    {new Date(entry.timestamp).toLocaleString('de-DE')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Erase Confirmation Dialog */}
      {confirmErase && (
        <div className="memgov-confirm-overlay" role="alertdialog" aria-modal="true">
          <div className="memgov-confirm-backdrop" onClick={() => setConfirmErase(null)} aria-hidden="true" />
          <div className="memgov-confirm-dialog">
            <span className="memgov-confirm-icon" aria-hidden="true">⚠️</span>
            <h3 className="memgov-confirm-title">
              {confirmErase === 'all'
                ? 'Alle Daten löschen?'
                : `${MEMORY_LAYERS.find(l => l.id === confirmErase)?.label || confirmErase} löschen?`}
            </h3>
            <p className="memgov-confirm-text">
              {confirmErase === 'all'
                ? `Alle KI-gespeicherten Daten im Kontext "${CONTEXT_LABELS[context]}" werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`
                : 'Alle Einträge in dieser Gedächtnis-Ebene werden unwiderruflich gelöscht.'}
            </p>
            <div className="memgov-confirm-actions">
              <button
                type="button"
                className="memgov-confirm-cancel neuro-focus-ring"
                onClick={() => setConfirmErase(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="memgov-confirm-delete neuro-focus-ring"
                onClick={() => handleErase(confirmErase === 'all' ? undefined : confirmErase)}
              >
                Unwiderruflich löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const MemoryGovernance = memo(MemoryGovernanceComponent);
MemoryGovernance.displayName = 'MemoryGovernance';
export default MemoryGovernance;
