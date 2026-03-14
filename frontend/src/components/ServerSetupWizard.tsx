/**
 * ServerSetupWizard - Step-by-step MCP Server Setup (Phase 71)
 *
 * Guides users through installing a community MCP server:
 * Step 1: Server info + description
 * Step 2: Credential input (based on template)
 * Step 3: Confirm + connect
 */

import { useState, useEffect } from 'react';
import type { AIContext } from './ContextSwitcher';
import './ServerSetupWizard.css';

const API_URL = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_API_KEY || '';

// ===========================================
// Types
// ===========================================

interface MCPCredentialField {
  key: string;
  label: string;
  description: string;
  required: boolean;
  type: 'text' | 'password' | 'url';
}

interface MCPSetupTemplate {
  name: string;
  displayName: string;
  transport: string;
  command: string | null;
  args: string[];
  npmPackage: string | null;
  urlTemplate: string | null;
  requiredCredentials: MCPCredentialField[];
  instructions: string;
}

interface MCPCatalogEntry {
  name: string;
  displayName: string;
  description: string;
  category: string;
  npmPackage: string | null;
  repoUrl: string;
  requiredCredentials: MCPCredentialField[];
  popularity: number;
  estimatedTools: number;
  icon: string;
  premium: boolean;
}

// ===========================================
// API helpers
// ===========================================

function apiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...apiHeaders(), ...options?.headers },
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Request failed: ${res.status}`);
  }
  return json.data as T;
}

// ===========================================
// Component
// ===========================================

interface ServerSetupWizardProps {
  context: AIContext;
  serverName: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function ServerSetupWizard({ context, serverName, onComplete, onCancel }: ServerSetupWizardProps) {
  const [step, setStep] = useState(1);
  const [template, setTemplate] = useState<MCPSetupTemplate | null>(null);
  const [serverInfo, setServerInfo] = useState<MCPCatalogEntry | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<string | null>(null);

  // Load template on mount
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        setLoading(true);
        const result = await apiFetch<{
          template: MCPSetupTemplate;
          server: MCPCatalogEntry;
        }>(`/api/${context}/mcp/discover/${serverName}/template`);

        setTemplate(result.template);
        setServerInfo(result.server);

        // Initialize credentials with empty values
        const initialCreds: Record<string, string> = {};
        for (const field of result.template.requiredCredentials) {
          initialCreds[field.key] = '';
        }
        setCredentials(initialCreds);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load setup template');
      } finally {
        setLoading(false);
      }
    };
    loadTemplate();
  }, [context, serverName]);

  // Credential validation
  const areCredentialsValid = (): boolean => {
    if (!template) return false;
    for (const field of template.requiredCredentials) {
      if (field.required && (!credentials[field.key] || credentials[field.key].trim().length === 0)) {
        return false;
      }
    }
    return true;
  };

  // Install / create server
  const handleInstall = async () => {
    if (!template) return;

    setInstalling(true);
    setError(null);

    try {
      // Build server config from template
      const body: Record<string, unknown> = {
        name: template.displayName,
        transport: template.transport,
        enabled: true,
      };

      if (template.transport === 'stdio') {
        body.command = template.command;
        body.args = template.args;
      } else if (template.urlTemplate) {
        body.url = template.urlTemplate;
      }

      // Add credentials as env vars
      const envVars: Record<string, string> = {};
      for (const [key, value] of Object.entries(credentials)) {
        if (value.trim().length > 0) {
          envVars[key] = value.trim();
        }
      }
      if (Object.keys(envVars).length > 0) {
        body.envVars = envVars;
      }

      // Create server connection
      await apiFetch(`/api/${context}/mcp/servers`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setInstallResult('Server erfolgreich hinzugefuegt!');
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation fehlgeschlagen');
    } finally {
      setInstalling(false);
    }
  };

  // ===========================================
  // Render
  // ===========================================

  if (loading) {
    return (
      <div className="setup-wizard">
        <div className="sw-loading">Lade Setup-Vorlage...</div>
      </div>
    );
  }

  if (!template || !serverInfo) {
    return (
      <div className="setup-wizard">
        <div className="sw-error-panel">
          <p>{error || 'Template nicht gefunden'}</p>
          <button className="sw-btn sw-btn--secondary" onClick={onCancel}>
            Zurueck
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-wizard">
      {/* Wizard Header */}
      <div className="sw-header">
        <h3>{serverInfo.displayName} einrichten</h3>
        <div className="sw-steps">
          <div className={`sw-step ${step >= 1 ? 'sw-step--active' : ''}`}>
            <span className="sw-step-num">1</span>
            <span className="sw-step-label">Info</span>
          </div>
          <div className="sw-step-line" />
          <div className={`sw-step ${step >= 2 ? 'sw-step--active' : ''}`}>
            <span className="sw-step-num">2</span>
            <span className="sw-step-label">Zugangsdaten</span>
          </div>
          <div className="sw-step-line" />
          <div className={`sw-step ${step >= 3 ? 'sw-step--active' : ''}`}>
            <span className="sw-step-num">3</span>
            <span className="sw-step-label">Fertig</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="sw-error" role="alert">
          <span>{error}</span>
          <button className="sw-error-dismiss" onClick={() => setError(null)} aria-label="Fehler schliessen">
            x
          </button>
        </div>
      )}

      {/* Step 1: Server Info */}
      {step === 1 && (
        <div className="sw-content">
          <div className="sw-info-card">
            <div className="sw-info-header">
              <div className="sw-info-icon">{serverInfo.displayName.charAt(0)}</div>
              <div>
                <h4>{serverInfo.displayName}</h4>
                <span className="sw-info-category">{serverInfo.category}</span>
              </div>
            </div>
            <p className="sw-info-desc">{serverInfo.description}</p>

            <div className="sw-info-details">
              <div className="sw-detail-row">
                <span className="sw-detail-label">Transport:</span>
                <span className="sw-detail-value">{template.transport}</span>
              </div>
              {template.npmPackage && (
                <div className="sw-detail-row">
                  <span className="sw-detail-label">Paket:</span>
                  <code className="sw-detail-code">{template.npmPackage}</code>
                </div>
              )}
              <div className="sw-detail-row">
                <span className="sw-detail-label">Tools:</span>
                <span className="sw-detail-value">~{serverInfo.estimatedTools} verfuegbar</span>
              </div>
            </div>

            {template.instructions && (
              <div className="sw-instructions">
                <h5>Vorbereitung</h5>
                <p>{template.instructions}</p>
              </div>
            )}

            {serverInfo.repoUrl && (
              <a
                href={serverInfo.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sw-repo-link"
              >
                Repository ansehen
              </a>
            )}
          </div>

          <div className="sw-actions">
            <button className="sw-btn sw-btn--secondary" onClick={onCancel}>
              Abbrechen
            </button>
            <button className="sw-btn sw-btn--primary" onClick={() => setStep(2)}>
              Weiter
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Credentials */}
      {step === 2 && (
        <div className="sw-content">
          {template.requiredCredentials.length === 0 ? (
            <div className="sw-no-creds">
              <p>Dieser Server benoetigt keine Zugangsdaten.</p>
            </div>
          ) : (
            <div className="sw-creds-form">
              <p className="sw-creds-info">
                Gib die benoetigten Zugangsdaten ein. Diese werden sicher als Umgebungsvariablen gespeichert.
              </p>
              {template.requiredCredentials.map(field => (
                <div key={field.key} className="sw-form-group">
                  <label htmlFor={`sw-${field.key}`}>
                    {field.label}
                    {field.required && <span className="sw-required">*</span>}
                  </label>
                  <input
                    id={`sw-${field.key}`}
                    type={field.type === 'password' ? 'password' : 'text'}
                    value={credentials[field.key] || ''}
                    onChange={e => setCredentials(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.description}
                    className="sw-input"
                  />
                  <span className="sw-field-help">{field.description}</span>
                </div>
              ))}
            </div>
          )}

          <div className="sw-actions">
            <button className="sw-btn sw-btn--secondary" onClick={() => setStep(1)}>
              Zurueck
            </button>
            <button
              className="sw-btn sw-btn--primary"
              onClick={handleInstall}
              disabled={installing || !areCredentialsValid()}
            >
              {installing ? 'Installiere...' : 'Installieren'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Complete */}
      {step === 3 && (
        <div className="sw-content">
          <div className="sw-complete">
            <div className="sw-complete-icon">OK</div>
            <h4>{installResult || 'Installation abgeschlossen'}</h4>
            <p>
              {serverInfo.displayName} wurde als MCP Server hinzugefuegt.
              Du kannst ihn jetzt im Tab &quot;Server&quot; verbinden.
            </p>
          </div>

          <div className="sw-actions">
            <button className="sw-btn sw-btn--primary" onClick={onComplete}>
              Fertig
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServerSetupWizard;
