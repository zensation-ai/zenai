/**
 * OnDeviceAISettings - Phase 94
 *
 * Settings panel for on-device AI:
 * - WebGPU capability display
 * - Privacy mode toggle
 * - Model management (download status, clear cache)
 * - Inference statistics (on-device vs cloud)
 * - Storage usage display
 */

import { memo, useEffect, useCallback, useState } from 'react';
import { useOnDeviceAI } from '../../hooks/useOnDeviceAI';
import { estimateStorageUsage } from '../../services/on-device-storage';
import { useConfirm } from '../ConfirmDialog';
import './OnDeviceAISettings.css';

interface OnDeviceAISettingsProps {
  context?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const MODELS = [
  {
    id: 'intent-classifier',
    name: 'Intent-Klassifikation',
    description: 'Erkennt Absichten: Suche, Befehl, Code, Frage, etc.',
    type: 'built-in' as const,
    size: '< 1 KB (Pure JS)',
  },
  {
    id: 'sentiment-analyzer',
    name: 'Sentiment-Analyse',
    description: 'Erkennt Stimmung: positiv, negativ, neutral',
    type: 'built-in' as const,
    size: '< 1 KB (Pure JS)',
  },
  {
    id: 'summarizer',
    name: 'Textzusammenfassung',
    description: 'Extraktive Zusammenfassung (TextRank-inspiriert)',
    type: 'built-in' as const,
    size: '< 1 KB (Pure JS)',
  },
  {
    id: 'text-completer',
    name: 'Textvervollstaendigung',
    description: 'Markov-Chain basiert auf deinen Eingaben',
    type: 'built-in' as const,
    size: 'Abhaengig vom Corpus',
  },
  {
    id: 'embedding-onnx',
    name: 'Embedding (all-MiniLM-L6-v2)',
    description: 'Semantische Vektoren fuer Aehnlichkeitssuche',
    type: 'planned' as const,
    size: '~23 MB (ONNX)',
  },
];

export const OnDeviceAISettings = memo(function OnDeviceAISettings(_props: OnDeviceAISettingsProps) {
  const confirm = useConfirm();
  const {
    isReady,
    isLoading,
    webGPUAvailable,
    privacyMode,
    capabilities,
    stats,
    config,
    setPrivacyMode,
    updateConfig,
    rebuildModels,
    clearStorage,
    clearInferenceCache,
    refreshStats,
  } = useOnDeviceAI();

  const [storageUsage, setStorageUsage] = useState(0);
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    estimateStorageUsage().then(setStorageUsage);
    refreshStats();
  }, [refreshStats]);

  const handleRebuild = useCallback(async () => {
    setRebuilding(true);
    try {
      await rebuildModels();
      await refreshStats();
    } finally {
      setRebuilding(false);
    }
  }, [rebuildModels, refreshStats]);

  const handleClearCache = useCallback(async () => {
    await clearInferenceCache();
    await refreshStats();
  }, [clearInferenceCache, refreshStats]);

  const handleClearAll = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Lokale KI-Daten loeschen',
      message: 'Alle lokalen KI-Daten loeschen? Dies entfernt Corpus, Cache und Vokabular.',
      confirmText: 'Loeschen',
      variant: 'danger',
    });
    if (confirmed) {
      await clearStorage();
      await refreshStats();
      setStorageUsage(0);
    }
  }, [clearStorage, refreshStats, confirm]);

  const totalQueries = stats.queriesOnDevice + stats.queriesCloud;
  const onDevicePercent = totalQueries > 0 ? Math.round((stats.queriesOnDevice / totalQueries) * 100) : 0;
  const storagePercent = Math.min((storageUsage / (50 * 1024 * 1024)) * 100, 100); // 50MB max reference

  return (
    <div className="on-device-settings">
      <h2>Lokale KI</h2>
      <p className="subtitle">
        On-Device AI Inferenz fuer sofortige, private Verarbeitung direkt im Browser.
      </p>

      {/* Capabilities */}
      <div className="odai-capabilities">
        <div className="odai-cap-card">
          <span className="odai-cap-icon">{webGPUAvailable ? '\u2705' : '\u274C'}</span>
          <div className="odai-cap-info">
            <div className="odai-cap-label">WebGPU</div>
            <div className={`odai-cap-status ${webGPUAvailable ? 'available' : 'unavailable'}`}>
              {webGPUAvailable ? 'Verfuegbar' : 'Nicht verfuegbar'}
            </div>
          </div>
        </div>
        <div className="odai-cap-card">
          <span className="odai-cap-icon">{capabilities.indexedDBAvailable ? '\u2705' : '\u274C'}</span>
          <div className="odai-cap-info">
            <div className="odai-cap-label">IndexedDB</div>
            <div className={`odai-cap-status ${capabilities.indexedDBAvailable ? 'available' : 'unavailable'}`}>
              {capabilities.indexedDBAvailable ? 'Verfuegbar' : 'Nicht verfuegbar'}
            </div>
          </div>
        </div>
        <div className="odai-cap-card">
          <span className="odai-cap-icon">{isReady ? '\u2705' : isLoading ? '\u23F3' : '\u274C'}</span>
          <div className="odai-cap-info">
            <div className="odai-cap-label">KI-Engine</div>
            <div className={`odai-cap-status ${isReady ? 'available' : 'unavailable'}`}>
              {isReady ? 'Bereit' : isLoading ? 'Wird geladen...' : 'Nicht bereit'}
            </div>
          </div>
        </div>
        <div className="odai-cap-card">
          <span className="odai-cap-icon">{capabilities.modelsReady.length > 0 ? '\u2705' : '\u23F3'}</span>
          <div className="odai-cap-info">
            <div className="odai-cap-label">Modelle</div>
            <div className="odai-cap-status available">
              {capabilities.modelsReady.length} bereit
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Mode */}
      <div className="odai-section">
        <div className="odai-section-header">
          <span className="odai-section-title">Datenschutz-Modus</span>
          <span className={`odai-privacy-badge ${privacyMode ? 'on' : 'off'}`}>
            {privacyMode ? '\uD83D\uDD12 Aktiv' : '\uD83C\uDF10 Standard'}
          </span>
        </div>
        <p className="odai-section-desc">
          Im Datenschutz-Modus werden alle Anfragen lokal auf deinem Geraet verarbeitet.
          Nichts wird an Server gesendet. Komplexe Anfragen werden mit lokalen Methoden
          beantwortet, auch wenn die Qualitaet eingeschraenkt sein kann.
        </p>
        <label className="odai-toggle">
          <input
            type="checkbox"
            checked={privacyMode}
            onChange={(e) => setPrivacyMode(e.target.checked)}
          />
          <span className="odai-toggle-track">
            <span className="odai-toggle-thumb" />
          </span>
          <span className="odai-toggle-label">
            Nichts verlaesst mein Geraet
          </span>
        </label>
      </div>

      {/* Routing Threshold */}
      <div className="odai-section">
        <span className="odai-section-title">Hybrid-Routing</span>
        <p className="odai-section-desc">
          Bestimme, ab welcher Komplexitaet Anfragen an die Cloud gesendet werden.
          Niedrig = mehr Cloud, Hoch = mehr lokal.
        </p>
        <div className="odai-slider-row">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Cloud</span>
          <input
            type="range"
            min={10}
            max={90}
            step={5}
            value={Math.round(config.complexityThreshold * 100)}
            onChange={(e) => updateConfig({ complexityThreshold: Number(e.target.value) / 100 })}
            disabled={privacyMode}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Lokal</span>
          <span className="odai-slider-value">{Math.round(config.complexityThreshold * 100)}%</span>
        </div>
      </div>

      {/* Models */}
      <div className="odai-section">
        <span className="odai-section-title">Modelle</span>
        <p className="odai-section-desc">
          Uebersicht der verfuegbaren On-Device KI-Modelle.
          Built-in Modelle sind sofort verfuegbar ohne Download.
        </p>
        <div className="odai-model-list">
          {MODELS.map(model => {
            const isModelReady = capabilities.modelsReady.includes(model.id);
            return (
              <div key={model.id} className="odai-model-item">
                <span className="odai-model-icon">
                  {model.type === 'planned' ? '\uD83D\uDCC5' : isModelReady ? '\u2705' : '\uD83D\uDCE6'}
                </span>
                <div className="odai-model-info">
                  <div className="odai-model-name">{model.name}</div>
                  <div className="odai-model-meta">{model.description} &middot; {model.size}</div>
                </div>
                <span className={`odai-model-badge ${model.type === 'planned' ? 'planned' : isModelReady ? 'ready' : 'built-in'}`}>
                  {model.type === 'planned' ? 'Geplant' : isModelReady ? 'Bereit' : 'Built-in'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Statistics */}
      <div className="odai-section">
        <span className="odai-section-title">Statistiken</span>
        <div className="odai-stats-grid" style={{ marginTop: 12 }}>
          <div className="odai-stat-card">
            <div className="odai-stat-value">{stats.queriesOnDevice}</div>
            <div className="odai-stat-label">Lokal verarbeitet</div>
          </div>
          <div className="odai-stat-card">
            <div className="odai-stat-value">{stats.queriesCloud}</div>
            <div className="odai-stat-label">Cloud-Anfragen</div>
          </div>
          <div className="odai-stat-card">
            <div className="odai-stat-value">{onDevicePercent}%</div>
            <div className="odai-stat-label">Lokal-Quote</div>
          </div>
          <div className="odai-stat-card">
            <div className="odai-stat-value">{stats.corpusSize}</div>
            <div className="odai-stat-label">Corpus-Eintraege</div>
          </div>
          <div className="odai-stat-card">
            <div className="odai-stat-value">{stats.cacheSize}</div>
            <div className="odai-stat-label">Cache-Eintraege</div>
          </div>
          <div className="odai-stat-card">
            <div className="odai-stat-value">{stats.vocabSize}</div>
            <div className="odai-stat-label">Vokabular-Groesse</div>
          </div>
        </div>

        {/* Storage Meter */}
        <div className="odai-storage-meter">
          <div className="odai-storage-bar">
            <div
              className="odai-storage-fill"
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <div className="odai-storage-label">
            Speicher: {formatBytes(storageUsage)} verwendet
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="odai-section">
        <span className="odai-section-title">Verwaltung</span>
        <div className="odai-actions">
          <button
            className="odai-btn primary"
            onClick={handleRebuild}
            disabled={rebuilding}
          >
            {rebuilding ? 'Wird trainiert...' : 'Modelle neu trainieren'}
          </button>
          <button className="odai-btn" onClick={handleClearCache}>
            Cache leeren
          </button>
          <button className="odai-btn destructive" onClick={handleClearAll}>
            Alle Daten loeschen
          </button>
        </div>
      </div>
    </div>
  );
});
