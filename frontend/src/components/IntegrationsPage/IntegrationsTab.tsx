/**
 * IntegrationsTab - Grid of integration cards
 */

import type { Integration } from './types';

interface IntegrationsTabProps {
  integrations: Integration[];
  connectIntegration: (provider: string) => void;
  disconnectIntegration: (provider: string) => void;
  syncIntegration: (provider: string) => void;
}

export function IntegrationsTab({
  integrations,
  connectIntegration,
  disconnectIntegration,
  syncIntegration,
}: IntegrationsTabProps) {
  return (
    <div className="integrations-grid neuro-flow-list">
      {integrations.map(integration => (
        <div key={integration.id} className={`integration-card ${integration.isConnected ? 'connected' : ''}`}>
          <div className="integration-header">
            <span className="integration-icon">
              {integration.provider === 'microsoft' ? '📧' : integration.provider === 'slack' ? '💬' : '🔗'}
            </span>
            <div className="integration-info">
              <h3>{integration.name}</h3>
              <p>{integration.description || `${integration.provider} Integration`}</p>
            </div>
            <span className={`status-badge ${integration.isConnected ? 'connected' : 'disconnected'}`}>
              {integration.isConnected ? 'Verbunden' : 'Nicht verbunden'}
            </span>
          </div>

          <div className="integration-features">
            {integration.features?.map(feature => (
              <span key={feature} className="feature-tag">{feature}</span>
            ))}
          </div>

          {integration.isConnected && integration.lastSyncAt && (
            <div className="sync-info">
              <span className={`sync-status ${integration.syncStatus}`}>
                {integration.syncStatus === 'syncing' ? '⏳' :
                 integration.syncStatus === 'success' ? '✅' :
                 integration.syncStatus === 'error' ? '❌' : '⏸️'}
              </span>
              <span>Letzter Sync: {new Date(integration.lastSyncAt).toLocaleString('de-DE')}</span>
            </div>
          )}

          {integration.errorMessage && (
            <div className="error-message">{integration.errorMessage}</div>
          )}

          <div className="integration-actions">
            {integration.isConnected ? (
              <>
                <button
                  type="button"
                  className="sync-button neuro-button"
                  onClick={() => syncIntegration(integration.provider)}
                  disabled={integration.syncStatus === 'syncing'}
                  aria-label={`${integration.name} synchronisieren`}
                >
                  {integration.syncStatus === 'syncing' ? 'Sync läuft...' : '🔄 Jetzt synchronisieren'}
                </button>
                <button
                  type="button"
                  className="disconnect-button neuro-hover-lift"
                  onClick={() => disconnectIntegration(integration.provider)}
                  aria-label={`${integration.name} trennen`}
                >
                  Trennen
                </button>
              </>
            ) : (
              <button
                type="button"
                className="connect-button neuro-button"
                onClick={() => connectIntegration(integration.provider)}
                aria-label={`Mit ${integration.name} verbinden`}
              >
                🔗 Verbinden
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
