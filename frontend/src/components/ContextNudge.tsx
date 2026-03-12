import { useState, useEffect, useRef } from 'react';
import { AIContext } from './ContextSwitcher';
import '../neurodesign.css';

const CONTEXT_CONFIG: Record<AIContext, { icon: string; label: string }> = {
  personal: { icon: '🏠', label: 'Privat' },
  work: { icon: '💼', label: 'Arbeit' },
  learning: { icon: '📚', label: 'Lernen' },
  creative: { icon: '🎨', label: 'Kreativ' },
};

interface ContextNudgeProps {
  currentContext: AIContext;
  suggestedContext: AIContext;
  ideaTitle: string;
  ideaId: string;
  confidence?: number;
  onMove: (ideaId: string, targetContext: AIContext) => void;
  onDismiss: () => void;
}

export function ContextNudge({
  currentContext,
  suggestedContext,
  ideaTitle,
  ideaId,
  confidence = 0.7,
  onMove,
  onDismiss,
}: ContextNudgeProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Animate in
    const timer = setTimeout(() => setVisible(true), 100);
    return () => {
      clearTimeout(timer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Don't show if same context or low confidence
  if (currentContext === suggestedContext || confidence < 0.5) {
    return null;
  }

  const suggested = CONTEXT_CONFIG[suggestedContext];
  const current = CONTEXT_CONFIG[currentContext];

  const handleMove = () => {
    setVisible(false);
    timerRef.current = setTimeout(() => onMove(ideaId, suggestedContext), 200);
  };

  const handleDismiss = () => {
    setVisible(false);
    timerRef.current = setTimeout(onDismiss, 200);
  };

  const truncatedTitle = ideaTitle.length > 40
    ? ideaTitle.substring(0, 37) + '...'
    : ideaTitle;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '80px',
        left: '50%',
        transform: `translateX(-50%) translateY(${visible ? '0' : '20px'})`,
        opacity: visible ? 1 : 0,
        transition: 'all 0.3s ease',
        zIndex: 1000,
        background: 'var(--card-bg, #142a34)',
        border: '1px solid var(--border, #1e3a4a)',
        borderRadius: '12px',
        padding: '12px 16px',
        maxWidth: '400px',
        width: 'calc(100% - 32px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <span style={{ fontSize: '20px' }}>{suggested.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '13px',
            color: 'var(--text-secondary, #8ba4b4)',
            marginBottom: '4px',
          }}>
            KI-Vorschlag
          </div>
          <div style={{
            fontSize: '14px',
            color: 'var(--text-primary, #e0e8ef)',
            lineHeight: '1.4',
          }}>
            &laquo;{truncatedTitle}&raquo; passt besser zu <strong>{suggested.label}</strong> als zu {current.label}.
          </div>
          <div style={{
            display: 'flex',
            gap: '8px',
            marginTop: '10px',
          }}>
            <button
              onClick={handleMove}
              style={{
                background: 'var(--accent, #0ea5e9)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {suggested.icon} Verschieben
            </button>
            <button
              onClick={handleDismiss}
              style={{
                background: 'transparent',
                color: 'var(--text-secondary, #8ba4b4)',
                border: '1px solid var(--border, #1e3a4a)',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Passt schon
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
