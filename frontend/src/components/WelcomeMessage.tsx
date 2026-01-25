/**
 * WelcomeMessage - Prominente Begrüßung mit sanftem Ein-/Ausblenden
 *
 * Neuro-UX Prinzipien:
 * - Emotionale Verbindung durch personalisierte Begrüßung
 * - Dopamin-Aktivierung durch positive Nachrichten
 * - Sanfte Übergänge für Flow-State
 */

import { useState, useEffect, useCallback } from 'react';
import { AI_PERSONALITY } from '../utils/aiPersonality';
import '../neurodesign.css';
import './WelcomeMessage.css';

interface WelcomeMessageProps {
  greeting: string;
  emoji: string;
  subtext?: string;
  suggestedAction?: string;
  ideasCount: number;
  isCompact?: boolean;
  /** Dauer der Anzeige in ms (default: 6000) */
  displayDuration?: number;
  /** Callback wenn die Nachricht ausgeblendet wird */
  onDismiss?: () => void;
}

export function WelcomeMessage({
  greeting,
  emoji,
  subtext,
  suggestedAction,
  ideasCount,
  isCompact = false,
  displayDuration = 6000,
  onDismiss,
}: WelcomeMessageProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsFadingOut(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, 400); // Match CSS animation duration
  }, [onDismiss]);

  // Auto-dismiss nach displayDuration (nur wenn nicht compact)
  useEffect(() => {
    if (isCompact || displayDuration <= 0) return;

    // Zeige die Willkommensnachricht länger beim ersten Besuch
    const timer = setTimeout(() => {
      handleDismiss();
    }, displayDuration);

    return () => clearTimeout(timer);
  }, [displayDuration, isCompact, handleDismiss]);

  if (!isVisible) return null;

  // Compact-Modus: Einfache Inline-Anzeige
  if (isCompact) {
    return (
      <div className="welcome-message welcome-message-compact">
        <span className="welcome-emoji">{emoji}</span>
        <span className="welcome-greeting-compact">{greeting}</span>
      </div>
    );
  }

  return (
    <div
      className={`welcome-message welcome-message-full ${isFadingOut ? 'fading-out' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="welcome-content">
        <span className="welcome-emoji welcome-emoji-large" aria-hidden="true">
          {emoji}
        </span>
        <h2 className="welcome-greeting">{greeting}</h2>
        {subtext && (
          <p className="welcome-subtext">
            {subtext}
          </p>
        )}
        {suggestedAction && ideasCount === 0 && (
          <p className="welcome-suggestion">
            <span className="suggestion-icon" aria-hidden="true">💡</span>
            {suggestedAction}
          </p>
        )}
        {ideasCount > 0 && (
          <p className="welcome-status">
            <span className="status-count">{ideasCount}</span> Gedanken warten auf dich
          </p>
        )}
      </div>

      {/* Dismiss-Button */}
      <button
        type="button"
        className="welcome-dismiss neuro-press-effect"
        onClick={handleDismiss}
        aria-label="Begrüßung schließen"
      >
        <span aria-hidden="true">×</span>
      </button>

      {/* Progress-Indikator */}
      {displayDuration > 0 && (
        <div
          className="welcome-progress"
          style={{ animationDuration: `${displayDuration}ms` }}
          aria-hidden="true"
        />
      )}

      {/* AI-Identität */}
      <div className="welcome-ai-badge">
        <span className="ai-badge-emoji">🧠</span>
        <span className="ai-badge-name">{AI_PERSONALITY.name}</span>
      </div>
    </div>
  );
}
