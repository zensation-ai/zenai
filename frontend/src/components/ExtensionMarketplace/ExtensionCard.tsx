/**
 * Phase 75: Extension Card Component
 *
 * Displays a single extension with icon, metadata, and action buttons.
 * Supports install (with permission dialog), uninstall, enable, and disable.
 */

import { useState } from 'react';
import './ExtensionCard.css';

// ===========================================
// Types
// ===========================================

export type ExtensionType = 'tool' | 'widget' | 'theme' | 'integration' | 'agent';

export interface ExtensionData {
  id: string;
  name: string;
  version: string;
  type: ExtensionType;
  manifest: {
    name: string;
    description: string;
    version: string;
    author: string;
    type: ExtensionType;
    category: string;
    icon: string;
    permissions: string[];
    entry_point: string;
  };
  author: string;
  category: string;
  permissions: string[];
  installed: boolean;
  enabled: boolean;
  installed_at?: string;
  permissions_granted?: string[];
}

interface ExtensionCardProps {
  extension: ExtensionData;
  onInstall: (id: string, permissions: string[]) => Promise<void>;
  onUninstall: (id: string) => Promise<void>;
  onEnable: (id: string) => Promise<void>;
  onDisable: (id: string) => Promise<void>;
}

// ===========================================
// Type Badge Colors
// ===========================================

const TYPE_COLORS: Record<ExtensionType, string> = {
  tool: '#3b82f6',
  widget: '#8b5cf6',
  theme: '#f59e0b',
  integration: '#10b981',
  agent: '#ef4444',
};

const TYPE_LABELS: Record<ExtensionType, string> = {
  tool: 'Tool',
  widget: 'Widget',
  theme: 'Theme',
  integration: 'Integration',
  agent: 'Agent',
};

const ICON_MAP: Record<string, string> = {
  timer: '\u23F1',
  palette: '\uD83C\uDFA8',
  'git-commit': '\uD83D\uDD17',
  sparkles: '\u2728',
  search: '\uD83D\uDD0D',
};

// ===========================================
// Permission Labels
// ===========================================

const PERMISSION_LABELS: Record<string, string> = {
  'tasks.read': 'Aufgaben lesen',
  'notifications.send': 'Benachrichtigungen senden',
  'ui.theme': 'Erscheinungsbild aendern',
  'github.read': 'GitHub-Daten lesen',
  'dashboard.widget': 'Dashboard-Widget anzeigen',
  'documents.read': 'Dokumente lesen',
  'documents.write': 'Dokumente schreiben',
  'emails.read': 'E-Mails lesen',
  'ai.invoke': 'KI-Modell nutzen',
  'web.search': 'Web-Suche ausfuehren',
  'memory.write': 'Wissensspeicher schreiben',
};

// ===========================================
// Component
// ===========================================

export function ExtensionCard({
  extension,
  onInstall,
  onUninstall,
  onEnable,
  onDisable,
}: ExtensionCardProps) {
  const [showPermissions, setShowPermissions] = useState(false);
  const [loading, setLoading] = useState(false);

  const icon = ICON_MAP[extension.manifest?.icon] || '\uD83E\uDDE9';

  const handleInstall = async () => {
    setShowPermissions(true);
  };

  const confirmInstall = async () => {
    setLoading(true);
    try {
      await onInstall(extension.id, extension.permissions);
      setShowPermissions(false);
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = async () => {
    setLoading(true);
    try {
      await onUninstall(extension.id);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (extension.enabled) {
        await onDisable(extension.id);
      } else {
        await onEnable(extension.id);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`extension-card ${extension.installed ? 'installed' : ''}`}>
      <div className="extension-card-header">
        <span className="extension-card-icon">{icon}</span>
        <div className="extension-card-meta">
          <h3 className="extension-card-name">{extension.name}</h3>
          <span className="extension-card-author">{extension.author}</span>
        </div>
        <span
          className="extension-card-type-badge"
          style={{
            background: `${TYPE_COLORS[extension.type]}20`,
            color: TYPE_COLORS[extension.type],
            borderColor: `${TYPE_COLORS[extension.type]}40`,
          }}
        >
          {TYPE_LABELS[extension.type]}
        </span>
      </div>

      <p className="extension-card-description">{extension.manifest?.description || ''}</p>

      <div className="extension-card-footer">
        <span className="extension-card-version">v{extension.version}</span>

        {!extension.installed ? (
          <button
            type="button"
            className="extension-card-btn install"
            onClick={handleInstall}
            disabled={loading}
          >
            {loading ? 'Wird installiert...' : 'Installieren'}
          </button>
        ) : (
          <div className="extension-card-actions">
            <label className="extension-card-toggle">
              <input
                type="checkbox"
                checked={extension.enabled}
                onChange={handleToggle}
                disabled={loading}
                aria-label={extension.enabled ? 'Deaktivieren' : 'Aktivieren'}
              />
              <span className="extension-card-toggle-slider" />
            </label>
            <button
              type="button"
              className="extension-card-btn uninstall"
              onClick={handleUninstall}
              disabled={loading}
            >
              Entfernen
            </button>
          </div>
        )}
      </div>

      {/* Permission Dialog */}
      {showPermissions && (
        <div className="extension-permission-overlay">
          <div className="extension-permission-dialog">
            <h4>Berechtigungen fuer "{extension.name}"</h4>
            <p className="extension-permission-subtitle">
              Diese Erweiterung benoetigt folgende Berechtigungen:
            </p>
            <ul className="extension-permission-list">
              {extension.permissions.map(perm => (
                <li key={perm} className="extension-permission-item">
                  <span className="extension-permission-check">&#10003;</span>
                  <span>{PERMISSION_LABELS[perm] || perm}</span>
                </li>
              ))}
            </ul>
            <div className="extension-permission-actions">
              <button
                type="button"
                className="extension-card-btn cancel"
                onClick={() => setShowPermissions(false)}
                disabled={loading}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="extension-card-btn confirm"
                onClick={confirmInstall}
                disabled={loading}
              >
                {loading ? 'Wird installiert...' : 'Installieren & erlauben'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
