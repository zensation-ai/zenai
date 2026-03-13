/**
 * Phase 56: OAuth SSO Buttons Component
 * Renders sign-in buttons for configured OAuth providers (Google, Microsoft, GitHub).
 */

import { useState, useCallback } from 'react';

interface OAuthButtonsProps {
  /** API URL base */
  apiUrl: string;
  /** Label prefix, e.g. "Anmelden" or "Registrieren" */
  actionLabel: string;
}

const PROVIDER_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  google: {
    label: 'Google',
    icon: '\uD83C\uDF10',
    color: '#4285F4',
  },
  microsoft: {
    label: 'Microsoft',
    icon: '\u2B1C',
    color: '#00A4EF',
  },
  github: {
    label: 'GitHub',
    icon: '\uD83D\uDC19',
    color: '#24292E',
  },
};

export function OAuthButtons({ apiUrl, actionLabel }: OAuthButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOAuthClick = useCallback(async (provider: string) => {
    setLoading(provider);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/auth/providers/${provider}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || `${provider} login not available`);
        return;
      }

      // Redirect to OAuth provider
      window.location.href = data.data.url;
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(null);
    }
  }, [apiUrl]);

  return (
    <div className="oauth-buttons">
      {error && (
        <div className="oauth-error" role="alert">
          {error}
        </div>
      )}
      {Object.entries(PROVIDER_CONFIG).map(([provider, config]) => (
        <button
          key={provider}
          type="button"
          className="oauth-button"
          onClick={() => handleOAuthClick(provider)}
          disabled={loading !== null}
          style={{ '--provider-color': config.color } as React.CSSProperties}
        >
          <span className="oauth-icon">{config.icon}</span>
          <span className="oauth-label">
            {loading === provider
              ? 'Laden...'
              : `${actionLabel} mit ${config.label}`}
          </span>
        </button>
      ))}
    </div>
  );
}
