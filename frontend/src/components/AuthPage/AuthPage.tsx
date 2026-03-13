/**
 * Phase 56: Authentication Page
 * Login / Register UI with email/password and OAuth buttons.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { OAuthButtons } from './OAuthButtons';
import { AI_PERSONALITY, AI_AVATAR } from '../../utils/aiPersonality';

type AuthMode = 'login' | 'register' | 'reset';

const ERROR_TRANSLATIONS: Record<string, string> = {
  'Invalid email or password': 'E-Mail oder Passwort ist falsch.',
  'Email already registered': 'Diese E-Mail ist bereits registriert.',
  'Password must be at least 8 characters': 'Passwort muss mindestens 8 Zeichen lang sein.',
  'Invalid email address': 'Ungueltige E-Mail-Adresse.',
  'Network error. Please check your connection.': 'Verbindungsfehler. Pruefe deine Internetverbindung.',
};

function translateError(message: string): string {
  return ERROR_TRANSLATIONS[message] ?? message;
}

export function AuthPage() {
  const { signIn, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login' || mfaRequired) {
        const result = await signIn(email, password, mfaRequired ? mfaCode : undefined);
        if (result.mfaRequired) {
          setMfaRequired(true);
          return;
        }
        if (result.error) {
          setError(translateError(result.error.message));
        }
      } else if (mode === 'register') {
        const result = await register(email, password, displayName || undefined);
        if (result.error) {
          setError(translateError(result.error.message));
        }
      }
    } catch {
      setError('Ein unerwarteter Fehler ist aufgetreten.');
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, displayName, mfaCode, mfaRequired, signIn, register]);

  const switchMode = useCallback((newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setMfaRequired(false);
    setMfaCode('');
  }, []);

  return (
    <div className="login-overlay">
      <div className="login-container">
        <div className="login-header">
          <div className="login-avatar">
            {AI_AVATAR.emoji}
            <div className="login-avatar-glow" />
          </div>
          <h1 className="login-title">
            {mode === 'login' ? 'Willkommen bei' : mode === 'register' ? 'Registrieren bei' : 'Passwort zuruecksetzen'}
          </h1>
          <p className="login-subtitle">{AI_PERSONALITY.name}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          {mfaRequired ? (
            <div className="login-field">
              <label htmlFor="auth-mfa">2FA Code</label>
              <input
                id="auth-mfa"
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="6-stelliger Code"
                required
                autoFocus
                maxLength={6}
                pattern="[0-9]*"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>
          ) : (
            <>
              {mode === 'register' && (
                <div className="login-field">
                  <label htmlFor="auth-name">Name</label>
                  <input
                    id="auth-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Dein Name"
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="login-field">
                <label htmlFor="auth-email">E-Mail</label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@email.de"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {mode !== 'reset' && (
                <div className="login-field">
                  <label htmlFor="auth-password">Passwort</label>
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Mind. 8 Zeichen' : 'Passwort'}
                    required
                    minLength={mode === 'register' ? 8 : undefined}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  />
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading
              ? 'Laden...'
              : mfaRequired
                ? 'Verifizieren'
                : mode === 'login'
                  ? 'Anmelden'
                  : mode === 'register'
                    ? 'Registrieren'
                    : 'Link senden'}
          </button>
        </form>

        {!mfaRequired && mode !== 'reset' && (
          <>
            <div className="login-divider">
              <span>oder</span>
            </div>
            <OAuthButtons apiUrl={apiUrl} actionLabel={mode === 'login' ? 'Anmelden' : 'Registrieren'} />
          </>
        )}

        <div className="login-links">
          {mode === 'login' && (
            <>
              <button type="button" className="login-link" onClick={() => switchMode('register')}>
                Kein Konto? Registrieren
              </button>
              <button type="button" className="login-link" onClick={() => switchMode('reset')}>
                Passwort vergessen?
              </button>
            </>
          )}
          {mode === 'register' && (
            <button type="button" className="login-link" onClick={() => switchMode('login')}>
              Bereits registriert? Anmelden
            </button>
          )}
          {(mode === 'reset' || mfaRequired) && (
            <button type="button" className="login-link" onClick={() => switchMode('login')}>
              Zurueck zur Anmeldung
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
