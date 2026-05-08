/**
 * PlatformSettings — Social Media Platform Configuration
 *
 * Allows users to:
 * - Enter Discord webhook URL
 * - Connect Twitter/LinkedIn via OAuth 2.0
 * - Disconnect connected accounts
 * - Enable/disable platforms
 */

import { useState, useEffect, useCallback, memo } from 'react';

interface PlatformConfig {
  platform: string;
  label: string;
  description: string;
  connected: boolean;
  accountName?: string;
  configType: 'webhook' | 'oauth';
}

const API_BASE = '/api/work/social';

export const PlatformSettings = memo(() => {
  const [platforms, setPlatforms] = useState<PlatformConfig[]>([
    {
      platform: 'discord',
      label: 'Discord',
      description: 'Webhook-basierte Integration. Nachrichten werden direkt in euren Channel gepostet.',
      connected: false,
      configType: 'webhook',
    },
    {
      platform: 'twitter',
      label: 'Twitter / X',
      description: 'OAuth 2.0 Verbindung. Erfordert Twitter Developer Account.',
      connected: false,
      configType: 'oauth',
    },
    {
      platform: 'linkedin',
      label: 'LinkedIn',
      description: 'OAuth 2.0 Verbindung. Postet auf eurer Company Page oder persönlichem Profil.',
      connected: false,
      configType: 'oauth',
    },
  ]);

  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Derive context from API_BASE
  const activeContext = API_BASE.split('/')[2] ?? 'finance';

  // Load connected accounts
  const loadAccounts = useCallback(() => {
    fetch(`${API_BASE}/accounts`)
      .then(res => res.ok ? res.json() : { data: [] })
      .then(data => {
        const accounts = data.data || data || [];
        setPlatforms(prev => prev.map(p => {
          const account = accounts.find((a: { platform: string; account_name: string }) => a.platform === p.platform);
          return account
            ? { ...p, connected: true, accountName: account.account_name }
            : p;
        }));
      })
      .catch(() => { /* graceful */ });
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Handle OAuth callback return
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const oauthStatus = searchParams.get('social');
    const oauthPlatform = searchParams.get('platform');
    const oauthReason = searchParams.get('reason');

    if (oauthStatus === 'connected' && oauthPlatform) {
      setMessage({ type: 'success', text: `${oauthPlatform} erfolgreich verbunden!` });
      loadAccounts();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (oauthStatus === 'error') {
      setMessage({ type: 'error', text: `Verbindung fehlgeschlagen: ${oauthReason || 'Unbekannter Fehler'}` });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadAccounts]);

  const handleSaveDiscordWebhook = useCallback(async () => {
    if (!discordWebhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      setMessage({ type: 'error', text: 'Ungültige Discord Webhook URL. Muss mit https://discord.com/api/webhooks/ beginnen.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'discord',
          account_name: 'Discord Webhook',
          webhook_url: discordWebhookUrl,
        }),
      });

      if (res.ok) {
        setPlatforms(prev => prev.map(p =>
          p.platform === 'discord' ? { ...p, connected: true, accountName: 'Discord Webhook' } : p
        ));
        setMessage({ type: 'success', text: 'Discord Webhook gespeichert.' });
        setDiscordWebhookUrl('');
      } else {
        setMessage({ type: 'error', text: 'Fehler beim Speichern. Bitte versuche es erneut.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Netzwerkfehler. Bitte prüfe deine Verbindung.' });
    } finally {
      setSaving(false);
    }
  }, [discordWebhookUrl]);

  const handleOAuthConnect = useCallback((platform: string) => {
    setOauthLoading(platform);
    window.location.href = `/api/social/oauth/${platform}/start?context=${activeContext}`;
  }, [activeContext]);

  const handleOAuthDisconnect = useCallback(async (platform: string) => {
    try {
      const res = await fetch(`${API_BASE}/accounts`);
      const data = await res.json();
      const account = (data.data || []).find((a: { platform: string; id: string }) => a.platform === platform);
      if (account) {
        await fetch(`${API_BASE}/accounts/${account.id}`, { method: 'DELETE' });
      }
      setPlatforms(prev => prev.map(p =>
        p.platform === platform ? { ...p, connected: false, accountName: undefined } : p
      ));
      setMessage({ type: 'success', text: `${platform} getrennt.` });
    } catch {
      setMessage({ type: 'error', text: 'Trennung fehlgeschlagen.' });
    }
  }, []);

  return (
    <div className="platform-settings">
      <div className="settings-section-header">
        <h3>Social Media Plattformen</h3>
        <p className="settings-description">
          Verbinde deine Social-Media-Konten, um Posts direkt aus ZenAI zu veröffentlichen.
        </p>
      </div>

      {message && (
        <div className={`settings-message settings-message--${message.type}`} role="alert">
          {message.text}
        </div>
      )}

      <div className="platform-list">
        {platforms.map(platform => (
          <div key={platform.platform} className="platform-card">
            <div className="platform-card-header">
              <div className="platform-info">
                <span className="platform-icon">
                  {platform.platform === 'discord' && '💬'}
                  {platform.platform === 'twitter' && '🐦'}
                  {platform.platform === 'linkedin' && '💼'}
                </span>
                <div>
                  <h4>{platform.label}</h4>
                  <p className="platform-description">{platform.description}</p>
                </div>
              </div>
              <span className={`platform-status ${platform.connected ? 'connected' : 'disconnected'}`}>
                {platform.connected ? 'Verbunden' : 'Nicht verbunden'}
              </span>
            </div>

            {platform.connected && platform.accountName && (
              <div className="platform-account">
                Konto: <strong>{platform.accountName}</strong>
              </div>
            )}

            {/* Discord: webhook URL input */}
            {platform.platform === 'discord' && !platform.connected && (
              <div className="platform-config">
                <label htmlFor="discord-webhook">Webhook URL</label>
                <div className="platform-config-row">
                  <input
                    id="discord-webhook"
                    type="url"
                    placeholder="https://discord.com/api/webhooks/..."
                    value={discordWebhookUrl}
                    onChange={e => setDiscordWebhookUrl(e.target.value)}
                    className="platform-input"
                  />
                  <button
                    onClick={handleSaveDiscordWebhook}
                    disabled={saving || !discordWebhookUrl}
                    className="btn btn-primary btn-sm"
                  >
                    {saving ? 'Speichern...' : 'Verbinden'}
                  </button>
                </div>
              </div>
            )}

            {/* OAuth platforms: connect / disconnect */}
            {platform.configType === 'oauth' && (
              <div className="platform-config">
                {platform.connected ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleOAuthDisconnect(platform.platform)}
                  >
                    Trennen
                  </button>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleOAuthConnect(platform.platform)}
                    disabled={oauthLoading === platform.platform}
                  >
                    {oauthLoading === platform.platform ? 'Verbinde…' : `${platform.label} verbinden`}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

PlatformSettings.displayName = 'PlatformSettings';
