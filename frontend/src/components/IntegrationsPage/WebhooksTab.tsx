/**
 * WebhooksTab - Webhook management section
 */

import type { Webhook } from './types';

interface WebhooksTabProps {
  webhooks: Webhook[];
  newWebhookName: string;
  setNewWebhookName: (value: string) => void;
  newWebhookUrl: string;
  setNewWebhookUrl: (value: string) => void;
  newWebhookEvents: string[];
  setNewWebhookEvents: (value: string[]) => void;
  availableEvents: string[];
  createWebhook: () => void;
  deleteWebhook: (id: string) => void;
  testWebhook: (id: string) => void;
}

export function WebhooksTab({
  webhooks,
  newWebhookName,
  setNewWebhookName,
  newWebhookUrl,
  setNewWebhookUrl,
  newWebhookEvents,
  setNewWebhookEvents,
  availableEvents,
  createWebhook,
  deleteWebhook,
  testWebhook,
}: WebhooksTabProps) {
  return (
    <div className="webhooks-section">
      <div className="create-form">
        <h3>Neuen Webhook erstellen</h3>
        <div className="form-row">
          <input
            type="text"
            placeholder="Name (z.B. 'Slack Notification')"
            value={newWebhookName}
            onChange={e => setNewWebhookName(e.target.value)}
          />
          <input
            type="url"
            placeholder="Webhook URL (https://...)"
            value={newWebhookUrl}
            onChange={e => setNewWebhookUrl(e.target.value)}
          />
        </div>
        <div className="events-selector">
          <label>Events:</label>
          <div className="events-grid">
            {availableEvents.map(event => (
              <label key={event}>
                <input
                  type="checkbox"
                  checked={newWebhookEvents.includes(event)}
                  onChange={e => {
                    if (e.target.checked) {
                      setNewWebhookEvents([...newWebhookEvents, event]);
                    } else {
                      setNewWebhookEvents(newWebhookEvents.filter(ev => ev !== event));
                    }
                  }}
                />
                {event}
              </label>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="neuro-button"
          onClick={createWebhook}
          disabled={!newWebhookName.trim() || !newWebhookUrl.trim()}
          aria-label="Neuen Webhook erstellen"
        >
          + Webhook erstellen
        </button>
      </div>

      <div className="webhooks-list">
        <h3>Aktive Webhooks</h3>
        {webhooks.length === 0 ? (
          <div className="neuro-empty-state">
            <span className="neuro-empty-icon">🪝</span>
            <h3 className="neuro-empty-title">Noch keine Webhooks</h3>
            <p className="neuro-empty-description">Konfiguriere Webhooks um externe Dienste zu benachrichtigen.</p>
            <p className="neuro-empty-encouragement">Webhooks verbinden deine Tools nahtlos.</p>
          </div>
        ) : (
          <div className="webhooks-grid neuro-flow-list">
            {webhooks.map(webhook => (
              <div key={webhook.id} className={`webhook-card ${webhook.isActive ? 'active' : 'inactive'}`}>
                <div className="webhook-header">
                  <h4>{webhook.name}</h4>
                  <span className={`status-badge ${webhook.isActive ? 'active' : 'inactive'}`}>
                    {webhook.isActive ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </div>
                <div className="webhook-url">
                  <code>{webhook.url.substring(0, 50)}...</code>
                </div>
                <div className="webhook-events">
                  {webhook.events.map(event => (
                    <span key={event} className="event-tag">{event}</span>
                  ))}
                </div>
                {webhook.lastTriggeredAt && (
                  <div className="webhook-stats">
                    Letzter Aufruf: {new Date(webhook.lastTriggeredAt).toLocaleString('de-DE')}
                    {webhook.failureCount > 0 && (
                      <span className="failure-count">⚠️ {webhook.failureCount} Fehler</span>
                    )}
                  </div>
                )}
                <div className="webhook-actions">
                  <button
                    type="button"
                    className="neuro-hover-lift"
                    onClick={() => testWebhook(webhook.id)}
                    aria-label={`Webhook ${webhook.name} testen`}
                  >
                    🧪 Testen
                  </button>
                  <button
                    type="button"
                    className="delete-button neuro-hover-lift"
                    onClick={() => deleteWebhook(webhook.id)}
                    aria-label={`Webhook ${webhook.name} löschen`}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
