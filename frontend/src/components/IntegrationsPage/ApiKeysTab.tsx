/**
 * ApiKeysTab - API key management section
 */

import type { ApiKey } from './types';

interface ApiKeysTabProps {
  apiKeys: ApiKey[];
  newKeyName: string;
  setNewKeyName: (value: string) => void;
  newKeyScopes: string[];
  setNewKeyScopes: (value: string[]) => void;
  createApiKey: () => void;
  deleteApiKey: (id: string) => void;
}

export function ApiKeysTab({
  apiKeys,
  newKeyName,
  setNewKeyName,
  newKeyScopes,
  setNewKeyScopes,
  createApiKey,
  deleteApiKey,
}: ApiKeysTabProps) {
  return (
    <div className="apikeys-section">
      <div className="create-form">
        <h3>Neuen API Key erstellen</h3>
        <div className="form-row">
          <input
            type="text"
            placeholder="Name (z.B. 'Zapier Integration')"
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
          />
          <div className="scopes-selector">
            <label>
              <input
                type="checkbox"
                checked={newKeyScopes.includes('read')}
                onChange={e => {
                  if (e.target.checked) {
                    setNewKeyScopes([...newKeyScopes, 'read']);
                  } else {
                    setNewKeyScopes(newKeyScopes.filter(s => s !== 'read'));
                  }
                }}
              /> Read
            </label>
            <label>
              <input
                type="checkbox"
                checked={newKeyScopes.includes('write')}
                onChange={e => {
                  if (e.target.checked) {
                    setNewKeyScopes([...newKeyScopes, 'write']);
                  } else {
                    setNewKeyScopes(newKeyScopes.filter(s => s !== 'write'));
                  }
                }}
              /> Write
            </label>
            <label>
              <input
                type="checkbox"
                checked={newKeyScopes.includes('admin')}
                onChange={e => {
                  if (e.target.checked) {
                    setNewKeyScopes([...newKeyScopes, 'admin']);
                  } else {
                    setNewKeyScopes(newKeyScopes.filter(s => s !== 'admin'));
                  }
                }}
              /> Admin
            </label>
          </div>
          <button
            type="button"
            className="neuro-button"
            onClick={createApiKey}
            disabled={!newKeyName.trim()}
            aria-label="Neuen API Key erstellen"
          >
            + Erstellen
          </button>
        </div>
      </div>

      <div className="apikeys-list">
        <h3>Vorhandene API Keys</h3>
        {apiKeys.length === 0 ? (
          <div className="neuro-empty-state">
            <span className="neuro-empty-icon">🔑</span>
            <h3 className="neuro-empty-title">Noch keine API Keys</h3>
            <p className="neuro-empty-description">Erstelle deinen ersten API Key für externe Integrationen.</p>
            <p className="neuro-empty-encouragement">API Keys ermöglichen automatisierte Workflows.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Scopes</th>
                <th>Letzte Nutzung</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map(key => (
                <tr key={key.id} className={key.isActive ? '' : 'inactive'}>
                  <td>{key.name}</td>
                  <td><code>{key.keyPrefix}...</code></td>
                  <td>{key.scopes.join(', ')}</td>
                  <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString('de-DE') : 'Nie'}</td>
                  <td>
                    <span className={`status-badge ${key.isActive ? 'active' : 'inactive'}`}>
                      {key.isActive ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="delete-button neuro-hover-lift"
                      onClick={() => deleteApiKey(key.id)}
                      aria-label={`API Key ${key.name} löschen`}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
