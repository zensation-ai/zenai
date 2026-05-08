// frontend/src/components/onboarding/GettingStartedChecklist.tsx
import type { CSSProperties } from 'react';
import { CheckCircle, Circle, X, ChevronRight } from 'lucide-react';
import { useGettingStarted } from '../../hooks/useGettingStarted';
import type { Page } from '../../types/idea';

interface Props {
  onNavigate?: (page: Page) => void;
}

export function GettingStartedChecklist({ onNavigate }: Props) {
  const { steps, completedCount, visible, markDone, dismiss } = useGettingStarted();

  if (!visible) return null;

  const pct = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-white/10 bg-[#0d1117]/95 shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div>
          <p className="text-sm font-semibold text-white">Erste Schritte</p>
          <p className="text-xs text-white/50">{completedCount} von {steps.length} erledigt</p>
        </div>
        <button
          onClick={dismiss}
          className="text-white/40 hover:text-white/80 transition-colors"
          aria-label="Schließen"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2">
        <div className="h-1 w-full rounded-full bg-white/10">
          <div
            className="h-1 rounded-full bg-[#00B4D8] transition-all duration-500 w-[var(--bar)]"
            style={{ '--bar': `${pct}%` } as CSSProperties}
          />
        </div>
      </div>

      {/* Steps */}
      <ul className="px-3 pb-3 space-y-1">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              onClick={() => {
                markDone(step.id);
                if (step.page && onNavigate) onNavigate(step.page);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5 transition-colors group"
            >
              {step.done ? (
                <CheckCircle size={18} className="shrink-0 text-[#00B4D8]" />
              ) : (
                <Circle size={18} className="shrink-0 text-white/30 group-hover:text-white/50" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${step.done ? 'text-white/40 line-through' : 'text-white/80'}`}>
                  {step.title}
                </p>
                {!step.done && (
                  <p className="text-xs text-white/70 truncate">{step.description}</p>
                )}
              </div>
              {!step.done && (
                <ChevronRight size={14} className="shrink-0 text-white/20 group-hover:text-white/50" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
