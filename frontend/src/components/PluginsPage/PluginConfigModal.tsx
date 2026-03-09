/**
 * PluginConfigModal Component
 *
 * Modal for configuring a plugin's settings.
 * Renders config fields dynamically from the plugin's config object.
 *
 * Phase 51 - Plugin & Extension System
 */

import React, { useState } from 'react';

interface PluginInstance {
  id: string;
  pluginId: string;
  name: string;
  version: string;
  status: string;
  config: Record<string, unknown>;
  permissions: string[];
  installedAt: string;
  updatedAt: string;
  errorMessage?: string;
}

interface PluginConfigModalProps {
  plugin: PluginInstance;
  onSave: (config: Record<string, unknown>) => void;
  onClose: () => void;
}

export function PluginConfigModal({ plugin, onSave, onClose }: PluginConfigModalProps) {
  const [config, setConfig] = useState<Record<string, unknown>>({ ...plugin.config });
  const [saving, setSaving] = useState(false);

  const handleChange = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(config);
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const renderField = (key: string, value: unknown) => {
    if (typeof value === 'boolean') {
      return (
        <label className="plugins-config-toggle-label" key={key}>
          <span>{key}</span>
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => handleChange(key, e.target.checked)}
            className="plugins-config-checkbox"
          />
        </label>
      );
    }

    if (typeof value === 'number') {
      return (
        <label className="plugins-config-field" key={key}>
          <span>{key}</span>
          <input
            type="number"
            value={value}
            onChange={(e) => handleChange(key, Number(e.target.value))}
            className="plugins-config-input"
          />
        </label>
      );
    }

    // Default: string input
    return (
      <label className="plugins-config-field" key={key}>
        <span>{key}</span>
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => handleChange(key, e.target.value)}
          className="plugins-config-input"
        />
      </label>
    );
  };

  const configKeys = Object.keys(config);

  return (
    <div className="plugins-modal-backdrop" onClick={handleBackdropClick}>
      <div className="plugins-modal">
        <div className="plugins-modal-header">
          <h2>{plugin.name}</h2>
          <span className="plugins-modal-version">v{plugin.version}</span>
          <button className="plugins-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="plugins-modal-body">
          {configKeys.length === 0 ? (
            <p className="plugins-config-empty">Keine konfigurierbaren Einstellungen.</p>
          ) : (
            <div className="plugins-config-fields">
              {configKeys.map((key) => renderField(key, config[key]))}
            </div>
          )}
        </div>
        <div className="plugins-modal-footer">
          <button className="plugins-btn-secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button className="plugins-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
