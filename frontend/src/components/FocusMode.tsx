/**
 * FocusMode Toggle Component (Phase 88)
 *
 * Button to start/stop focus mode with duration selector.
 * Shows remaining time when active.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { AIContext } from './ContextSwitcher';
import './FocusMode.css';

interface FocusSession {
  id: string;
  started_at: string;
  ends_at: string | null;
  duration_minutes: number;
  status: string;
}

interface FocusModeProps {
  context: AIContext;
  onToggle?: (active: boolean) => void;
}

const DURATION_OPTIONS = [
  { label: '25 min', value: 25 },
  { label: '45 min', value: 45 },
  { label: '90 min', value: 90 },
];

export function FocusMode({ context, onToggle }: FocusModeProps) {
  const [active, setActive] = useState(false);
  const [session, setSession] = useState<FocusSession | null>(null);
  const [remainingMinutes, setRemainingMinutes] = useState(0);
  const [showDurations, setShowDurations] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`/api/${context}/focus/status`);
      if (res.data.success && res.data.data) {
        setActive(res.data.data.active);
        setSession(res.data.data.session);
        setRemainingMinutes(res.data.data.remainingMinutes);
      }
    } catch {
      // Silently fail
    }
  }, [context]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Countdown timer
  useEffect(() => {
    if (!active || remainingMinutes <= 0) return;

    const interval = setInterval(() => {
      setRemainingMinutes((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          setActive(false);
          setSession(null);
          onToggle?.(false);
          return 0;
        }
        return next;
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [active, remainingMinutes, onToggle]);

  const handleStart = async (minutes: number) => {
    setLoading(true);
    setShowDurations(false);
    setError(null);
    try {
      const res = await axios.post(`/api/${context}/focus/start`, {
        durationMinutes: minutes,
      });
      if (res.data.success) {
        setActive(true);
        setSession(res.data.data);
        setRemainingMinutes(minutes);
        onToggle?.(true);
      }
    } catch {
      setError('Fokus-Sitzung konnte nicht gestartet werden');
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = async () => {
    setLoading(true);
    setError(null);
    try {
      await axios.post(`/api/${context}/focus/end`);
      setActive(false);
      setSession(null);
      setRemainingMinutes(0);
      onToggle?.(false);
    } catch {
      setError('Fokus-Sitzung konnte nicht beendet werden');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomStart = () => {
    const minutes = parseInt(customMinutes, 10);
    if (minutes > 0 && minutes <= 480) {
      handleStart(minutes);
      setCustomMinutes('');
    }
  };

  if (active && session) {
    return (
      <div className="focus-mode focus-mode--active">
        <div className="focus-mode-status">
          <span className="focus-mode-icon" aria-hidden="true">{'\u{1F3AF}'}</span>
          <span className="focus-mode-timer">
            {remainingMinutes > 0
              ? `${remainingMinutes} min verbleibend`
              : 'Focus Session'}
          </span>
        </div>
        <button
          className="focus-mode-btn focus-mode-btn--stop"
          onClick={handleEnd}
          disabled={loading}
          aria-busy={loading}
        >
          Beenden
        </button>
        {error && <p className="focus-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="focus-mode">
      <button
        className="focus-mode-btn focus-mode-btn--start"
        onClick={() => setShowDurations(!showDurations)}
        disabled={loading}
        aria-busy={loading}
      >
        <span aria-hidden="true">{'\u{1F3AF}'}</span> Focus Mode
      </button>

      {error && <p className="focus-error" role="alert">{error}</p>}

      {showDurations && (
        <div className="focus-mode-durations">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="focus-mode-duration-btn"
              onClick={() => handleStart(opt.value)}
              disabled={loading}
            >
              {opt.label}
            </button>
          ))}
          <div className="focus-mode-custom">
            <input
              type="number"
              min="1"
              max="480"
              placeholder="Min"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              className="focus-mode-custom-input"
              aria-label="Fokus-Dauer in Minuten"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCustomStart(); }}
            />
            <button
              className="focus-mode-duration-btn"
              onClick={handleCustomStart}
              disabled={loading || !customMinutes}
            >
              Start
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
