/**
 * Phase 3A: Gmail Connect Button
 * Triggers Google OAuth flow to connect a Gmail account.
 */

import { useState, useEffect } from 'react';
import { getApiBaseUrl, getApiFetchHeaders } from '../../utils/apiConfig';

interface GmailConnectButtonProps {
  context: string;
  onConnected?: (email: string) => void;
}

export function GmailConnectButton({ context, onConnected }: GmailConnectButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailStatus = params.get('gmail');
    const email = params.get('email');

    if (gmailStatus === 'connected' && email) {
      onConnected?.(decodeURIComponent(email));
      const url = new URL(window.location.href);
      url.searchParams.delete('gmail');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url.toString());
    } else if (gmailStatus === 'error') {
      setError(params.get('reason') || 'Connection failed');
      const url = new URL(window.location.href);
      url.searchParams.delete('gmail');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
  }, [onConnected]);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/oauth/google/connect`, {
        method: 'POST',
        headers: { ...getApiFetchHeaders('application/json'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });

      const data = await response.json();

      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setError(data.error || 'Failed to start OAuth flow');
        setLoading(false);
      }
    } catch {
      setError('Network error');
      setLoading(false);
    }
  };

  return (
    <div className="gmail-connect">
      <button
        onClick={handleConnect}
        disabled={loading}
        className="gmail-connect-btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 20px',
          border: '1px solid var(--border-primary, #dadce0)',
          borderRadius: '8px',
          background: 'var(--surface-primary, #fff)',
          color: 'var(--text-primary, #3c4043)',
          fontSize: '14px',
          fontWeight: 500,
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4"/>
          <path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" fill="#34A853"/>
          <path d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z" fill="#FBBC05"/>
          <path d="M8.98 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A8 8 0 0 0 1.83 5.41l2.67 2.07A4.77 4.77 0 0 1 8.98 3.58z" fill="#EA4335"/>
        </svg>
        {loading ? 'Verbinde...' : 'Gmail verbinden'}
      </button>
      {error && (
        <p style={{ color: 'var(--color-error, #d93025)', fontSize: '13px', marginTop: '8px' }}>
          {error}
        </p>
      )}
    </div>
  );
}
