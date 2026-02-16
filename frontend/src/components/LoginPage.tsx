import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AI_PERSONALITY, AI_AVATAR } from '../utils/aiPersonality';
import './LoginPage.css';

type Mode = 'login' | 'reset';

const ERROR_TRANSLATIONS: Record<string, string> = {
  'Invalid login credentials': 'E-Mail oder Passwort ist falsch.',
  'Email not confirmed': 'E-Mail-Adresse wurde noch nicht bestätigt.',
  'User not found': 'Kein Konto mit dieser E-Mail gefunden.',
  'Too many requests': 'Zu viele Versuche. Bitte warte kurz.',
  'Network request failed': 'Verbindungsfehler. Prüfe deine Internetverbindung.',
};

function translateError(message: string): string {
  return ERROR_TRANSLATIONS[message] ?? message;
}

export function LoginPage() {
  const { signIn, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error: err } = await signIn(email, password);
        if (err) setError(translateError(err.message));
      } else {
        const { error: err } = await resetPassword(email);
        if (err) {
          setError(translateError(err.message));
        } else {
          setResetSent(true);
        }
      }
    } catch {
      setError('Ein unerwarteter Fehler ist aufgetreten.');
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, signIn, resetPassword]);

  const switchMode = useCallback((newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setResetSent(false);
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
            {mode === 'login' ? 'Willkommen bei' : 'Passwort zurücksetzen'}
          </h1>
          <p className="login-subtitle">{AI_PERSONALITY.name}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          {resetSent && (
            <div className="login-success" role="status">
              Link zum Zurücksetzen wurde gesendet. Prüfe dein Postfach.
            </div>
          )}

          <div className="login-field">
            <label htmlFor="login-email">E-Mail</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="deine@email.de"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          {mode === 'login' && (
            <div className="login-field">
              <label htmlFor="login-password">Passwort</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort"
                required
                minLength={6}
                autoComplete="current-password"
              />
            </div>
          )}

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading
              ? 'Laden...'
              : mode === 'login'
                ? 'Anmelden'
                : 'Link senden'}
          </button>
        </form>

        <div className="login-links">
          {mode === 'login' && (
            <button type="button" className="login-link" onClick={() => switchMode('reset')}>
              Passwort vergessen?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="login-link" onClick={() => switchMode('login')}>
              Zurück zur Anmeldung
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
