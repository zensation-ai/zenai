/**
 * ContextNudge Component
 *
 * Shows a toast-like nudge when the AI detects that a newly created idea
 * might belong to a different context than the currently active one.
 * User can accept (move idea) or dismiss.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { Context } from '../types/idea';
import './ContextNudge.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const CONTEXT_LABELS: Record<Context, string> = {
  personal: 'Persönlich',
  work: 'Arbeit',
  learning: 'Lernen',
  creative: 'Kreativ',
};

const CONTEXT_ICONS: Record<Context, string> = {
  personal: '\u{1F3E0}',
  work: '\u{1F4BC}',
  learning: '\u{1F4DA}',
  creative: '\u{1F3A8}',
};

interface ContextNudgeProps {
  ideaId: string;
  ideaTitle: string;
  currentContext: Context;
  suggestedContext: Context;
  onMoved?: (targetContext: Context) => void;
  onDismissed?: () => void;
}

export default function ContextNudge({
  ideaId,
  ideaTitle,
  currentContext,
  suggestedContext,
  onMoved,
  onDismissed,
}: ContextNudgeProps) {
  const [visible, setVisible] = useState(true);
  const [moving, setMoving] = useState(false);
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      onDismissed?.();
    }, 300);
  }, [onDismissed]);

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    const timer = setTimeout(dismiss, 10000);
    return () => clearTimeout(timer);
  }, [dismiss]);

  const handleMove = async () => {
    setMoving(true);
    try {
      await axios.post(
        `${API_URL}/api/${currentContext}/ideas/${ideaId}/move`,
        { targetContext: suggestedContext }
      );
      setExiting(true);
      setTimeout(() => {
        setVisible(false);
        onMoved?.(suggestedContext);
      }, 300);
    } catch {
      setMoving(false);
    }
  };

  if (!visible || currentContext === suggestedContext) return null;

  const icon = CONTEXT_ICONS[suggestedContext];
  const label = CONTEXT_LABELS[suggestedContext];
  const truncatedTitle = ideaTitle.length > 40
    ? ideaTitle.substring(0, 40) + '...'
    : ideaTitle;

  return (
    <div className={`context-nudge ${exiting ? 'context-nudge-exit' : ''}`}>
      <div className="context-nudge-icon">{icon}</div>
      <div className="context-nudge-content">
        <div className="context-nudge-title">
          &laquo;{truncatedTitle}&raquo; klingt nach <strong>{label}</strong>
        </div>
        <div className="context-nudge-subtitle">
          Verschieben?
        </div>
      </div>
      <div className="context-nudge-actions">
        <button
          className="context-nudge-btn context-nudge-btn-move"
          onClick={handleMove}
          disabled={moving}
        >
          {moving ? 'Wird verschoben...' : `Ja, nach ${label}`}
        </button>
        <button
          className="context-nudge-btn context-nudge-btn-dismiss"
          onClick={dismiss}
        >
          Nein
        </button>
      </div>
    </div>
  );
}
