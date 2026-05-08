/**
 * ShortcutTrainingStep - Onboarding Step 6 (Final)
 *
 * Teaches the user 5 essential keyboard shortcuts interactively.
 * Duration: ~60s
 */

import { useState, useEffect, useCallback } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CheckCircle2, Keyboard } from 'lucide-react';

interface ShortcutTrainingStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface Shortcut {
  keys: string[];
  label: string;
  action: string;
  practiceHint?: string;
}

const SHORTCUTS: Shortcut[] = [
  {
    keys: ['⌘', 'K'],
    label: 'Suche',
    action: 'Öffnet die globale Suchpalette',
    practiceHint: 'Cmd+K',
  },
  {
    keys: ['⌘', 'N'],
    label: 'Neue Idee',
    action: 'Legt sofort eine neue Idee an',
    practiceHint: 'Cmd+N',
  },
  {
    keys: ['⌘', '⇧', 'A'],
    label: 'AI Chat',
    action: 'Springt direkt in den Chat-Bereich',
    practiceHint: 'Cmd+Shift+A',
  },
  {
    keys: ['⌘', '⇧', '␣'],
    label: 'Assistent',
    action: 'Öffnet den schnellen Assistenten-Dialog',
    practiceHint: 'Cmd+Shift+Space',
  },
  {
    keys: ['Esc'],
    label: 'Schließen',
    action: 'Schließt das aktuelle Overlay oder Panel',
    practiceHint: 'Escape',
  },
];

export function ShortcutTrainingStep({ onNext: _onNext, onBack: _onBack }: ShortcutTrainingStepProps) {
  const [practiced, setPracticed] = useState<Set<number>>(new Set());

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const meta = isMac ? e.metaKey : e.ctrlKey;

      // Cmd+K
      if (meta && e.key === 'k') {
        e.preventDefault();
        setPracticed((p) => new Set(p).add(0));
      }
      // Cmd+N
      if (meta && e.key === 'n') {
        e.preventDefault();
        setPracticed((p) => new Set(p).add(1));
      }
      // Cmd+Shift+A
      if (meta && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setPracticed((p) => new Set(p).add(2));
      }
      // Cmd+Shift+Space
      if (meta && e.shiftKey && e.key === ' ') {
        e.preventDefault();
        setPracticed((p) => new Set(p).add(3));
      }
      // Escape — mark but don't interfere with wizard navigation
      if (e.key === 'Escape') {
        setPracticed((p) => new Set(p).add(4));
      }
    },
    []
  );

  // Auto-mark all as practiced after 8s so users can still finish
  useEffect(() => {
    const t = setTimeout(() => {
      setPracticed(new Set([0, 1, 2, 3, 4]));
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="onboarding-wizard-step onboarding-wizard-step-shortcuts"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
          style={{ background: 'rgba(20, 74, 86, 0.6)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <Keyboard size={20} className="text-teal-300" />
        </div>
        <div>
          <h2 className="onboarding-wizard-heading" style={{ marginBottom: 0 }}>
            Tastenkürzel trainieren
          </h2>
          <p className="text-xs text-white/50">
            Drücke die Kombination direkt hier — sie werden markiert
          </p>
        </div>
      </div>

      {/* Shortcut list */}
      <div className="flex flex-col gap-2 mt-4">
        {SHORTCUTS.map((shortcut, idx) => {
          const done = practiced.has(idx);
          return (
            <div
              key={shortcut.label}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all duration-300"
              style={{
                background: done ? 'rgba(20, 74, 86, 0.35)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${done ? 'rgba(94, 234, 212, 0.25)' : 'rgba(255,255,255,0.07)'}`,
              }}
            >
              {/* Keys */}
              <div className="flex items-center gap-1 shrink-0">
                {shortcut.keys.map((key, ki) => (
                  <kbd
                    key={ki}
                    className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-mono font-semibold"
                    style={{
                      background: 'rgba(255,255,255,0.10)',
                      border: '1px solid rgba(255,255,255,0.18)',
                      color: done ? 'rgb(94 234 212)' : 'rgba(255,255,255,0.85)',
                      minWidth: '1.5rem',
                    }}
                  >
                    {key}
                  </kbd>
                ))}
              </div>

              {/* Labels */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white leading-tight">{shortcut.label}</p>
                <p className="text-xs text-white/50 leading-tight truncate">{shortcut.action}</p>
              </div>

              {/* Check */}
              <CheckCircle2
                size={16}
                className="shrink-0 transition-all duration-300"
                style={{
                  color: done ? 'rgb(94 234 212)' : 'rgba(255,255,255,0.15)',
                  opacity: done ? 1 : 0.5,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Progress hint */}
      <p className="text-xs text-white/40 text-center mt-3">
        {practiced.size === SHORTCUTS.length
          ? 'Alle Kürzel bekannt! Klick auf "Loslegen" um zu starten.'
          : `${practiced.size} von ${SHORTCUTS.length} geübt`}
      </p>
    </div>
  );
}

export default ShortcutTrainingStep;
