/**
 * ContextIndicator - Ambient Context Widget
 *
 * Phase 69.3: Shows active context summary in the TopBar area.
 * Click opens a glassmorphism popover with details about
 * working memory, facts, procedures, and upcoming events.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { cn } from '@/lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import type { AIContext } from '../ContextSwitcher';

interface ActiveContextData {
  context: string;
  workingMemoryCount: number;
  factsCount: number;
  proceduresCount: number;
  upcomingEventsCount: number;
  upcomingEvents: Array<{
    id: string;
    title: string;
    start_time: string;
    end_time: string;
  }>;
}

interface CognitiveMetrics {
  calibration: { ece: number; isWellCalibrated: boolean };
  curiosity: { activeGaps: number; pendingHypotheses: number };
  predictions: { accuracy: number; totalPredictions: number };
}

interface ContextIndicatorProps {
  context: AIContext;
}

const DEFAULT_CONTEXT_LABELS: Record<AIContext, string> = {
  operations: 'Operativ',
  finance: 'Finanzen',
  people: 'Team',
  strategy: 'Strategie',
};

export function ContextIndicator({ context }: ContextIndicatorProps) {
  const { workspaceContexts } = useAuth();

  // Build context label map: prefer workspace custom names, fall back to defaults
  const contextLabels = useMemo(() => {
    if (workspaceContexts.length === 0) return DEFAULT_CONTEXT_LABELS;
    const labels = { ...DEFAULT_CONTEXT_LABELS };
    for (const wc of workspaceContexts) {
      const base = wc.base_schema as AIContext;
      if (base in labels) {
        labels[base] = wc.name;
      }
    }
    return labels;
  }, [workspaceContexts]);
  const [data, setData] = useState<ActiveContextData | null>(null);
  const [cognitive, setCognitive] = useState<CognitiveMetrics | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    try {
      const [ctxRes, cogRes] = await Promise.allSettled([
        axios.get(`/api/${context}/context-v2/active`),
        axios.get(`/api/${context}/metacognition/overview`),
      ]);
      if (ctxRes.status === 'fulfilled' && ctxRes.value.data.success) {
        setData(ctxRes.value.data.data);
      }
      if (cogRes.status === 'fulfilled' && cogRes.value.data.success) {
        setCognitive(cogRes.value.data.data);
      }
    } catch {
      // Silently fail - indicator just won't show data
    } finally {
      setLoading(false);
    }
  }, [context]);

  // Fetch on mount and context change
  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const formatEventTime = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  const totalItems = data
    ? data.workingMemoryCount + data.factsCount + data.proceduresCount
    : 0;

  return (
    <div className="relative flex items-center max-md:hidden">
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'flex items-center gap-[5px] px-2.5 py-1 h-7 bg-[var(--border)] border border-white/8 rounded-sm text-text-secondary text-xs font-medium cursor-pointer transition-all duration-150',
          'hover:bg-surface-hover hover:border-surface-hover hover:text-text-secondary',
          open && 'bg-[rgba(139,92,246,0.15)] border-[rgba(139,92,246,0.3)] text-[rgba(139,92,246,0.9)]',
        )}
        onClick={() => {
          setOpen(prev => !prev);
          if (!open) fetchContext();
        }}
        aria-label="Kontext-Details anzeigen"
        aria-expanded={open}
        title="Aktiver Kontext"
      >
        <span className="size-1.5 rounded-full bg-[rgba(139,92,246,0.7)] shadow-[0_0_6px_rgba(139,92,246,0.3)] shrink-0 animate-ctx-dot-pulse" />
        <span className="leading-none">
          {loading ? '...' : totalItems}
        </span>
      </button>

      {open && (
        <div
          className="absolute top-[calc(100%+8px)] right-0 w-70 bg-[rgba(16,32,42,0.92)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-border rounded-md shadow-[0_8px_32px_rgba(0,0,0,0.3),0_2px_8px_rgba(0,0,0,0.15)] z-dropdown overflow-hidden animate-ctx-popover-in"
          ref={popoverRef}
          role="dialog"
          aria-label="Kontext-Details"
        >
          <div className="px-4 py-3 border-b border-border">
            <span className="text-[0.8rem] font-semibold text-text">
              Aktiver Kontext: {contextLabels[context]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-px bg-white/4">
            <div className="flex flex-col items-center py-2.5 px-2 bg-[rgba(16,32,42,0.6)]">
              <span className="text-[1.1rem] font-bold text-text leading-tight">
                {data?.workingMemoryCount ?? 0}
              </span>
              <span className="text-[0.65rem] text-text-secondary mt-0.5 text-center">Working Memory</span>
            </div>
            <div className="flex flex-col items-center py-2.5 px-2 bg-[rgba(16,32,42,0.6)]">
              <span className="text-[1.1rem] font-bold text-text leading-tight">
                {data?.factsCount ?? 0}
              </span>
              <span className="text-[0.65rem] text-text-secondary mt-0.5 text-center">Langzeit-Fakten</span>
            </div>
            <div className="flex flex-col items-center py-2.5 px-2 bg-[rgba(16,32,42,0.6)]">
              <span className="text-[1.1rem] font-bold text-text leading-tight">
                {data?.proceduresCount ?? 0}
              </span>
              <span className="text-[0.65rem] text-text-secondary mt-0.5 text-center">Prozeduren</span>
            </div>
            <div className="flex flex-col items-center py-2.5 px-2 bg-[rgba(16,32,42,0.6)]">
              <span className="text-[1.1rem] font-bold text-text leading-tight">
                {data?.upcomingEventsCount ?? 0}
              </span>
              <span className="text-[0.65rem] text-text-secondary mt-0.5 text-center">Termine (2h)</span>
            </div>
          </div>

          {cognitive && (
            <div className="grid grid-cols-2 gap-px bg-white/4 mt-2">
              <div className="flex flex-col items-center py-2.5 px-2 bg-[rgba(16,32,42,0.6)]">
                <span className={cn('text-[1.1rem] font-bold leading-tight', cognitive.calibration.isWellCalibrated ? 'text-green-500' : 'text-amber-500')}>
                  {cognitive.calibration.isWellCalibrated ? 'Gut' : Math.round(cognitive.calibration.ece * 100) + '%'}
                </span>
                <span className="text-[0.65rem] text-text-secondary mt-0.5 text-center">Kalibrierung</span>
              </div>
              <div className="flex flex-col items-center py-2.5 px-2 bg-[rgba(16,32,42,0.6)]">
                <span className="text-[1.1rem] font-bold text-text leading-tight">
                  {cognitive.predictions.totalPredictions > 0 ? Math.round(cognitive.predictions.accuracy * 100) + '%' : '–'}
                </span>
                <span className="text-[0.65rem] text-text-secondary mt-0.5 text-center">Vorhersage</span>
              </div>
              <div className="flex flex-col items-center py-2.5 px-2 bg-[rgba(16,32,42,0.6)]">
                <span className="text-[1.1rem] font-bold text-text leading-tight">
                  {cognitive.curiosity.activeGaps}
                </span>
                <span className="text-[0.65rem] text-text-secondary mt-0.5 text-center">Wissenslücken</span>
              </div>
              <div className="flex flex-col items-center py-2.5 px-2 bg-[rgba(16,32,42,0.6)]">
                <span className="text-[1.1rem] font-bold text-text leading-tight">
                  {cognitive.curiosity.pendingHypotheses}
                </span>
                <span className="text-[0.65rem] text-text-secondary mt-0.5 text-center">Hypothesen</span>
              </div>
            </div>
          )}

          {data?.upcomingEvents && data.upcomingEvents.length > 0 && (
            <div className="px-3 pt-2 pb-3 border-t border-border">
              <span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-text-muted mb-1.5">
                Anstehende Termine
              </span>
              {data.upcomingEvents.map(event => (
                <div key={event.id} className="flex items-center gap-2 py-1">
                  <span className="text-xs font-medium text-[rgba(139,92,246,0.8)] shrink-0 min-w-10">
                    {formatEventTime(event.start_time)}
                  </span>
                  <span className="text-[0.8rem] text-text overflow-hidden text-ellipsis whitespace-nowrap">
                    {event.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ContextIndicator;
