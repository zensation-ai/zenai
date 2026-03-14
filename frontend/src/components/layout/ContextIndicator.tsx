/**
 * ContextIndicator - Ambient Context Widget
 *
 * Phase 69.3: Shows active context summary in the TopBar area.
 * Click opens a glassmorphism popover with details about
 * working memory, facts, procedures, and upcoming events.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import type { AIContext } from '../ContextSwitcher';
import './ContextIndicator.css';

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

interface ContextIndicatorProps {
  context: AIContext;
}

const CONTEXT_LABELS: Record<AIContext, string> = {
  personal: 'Persoenlich',
  work: 'Arbeit',
  learning: 'Lernen',
  creative: 'Kreativ',
};

export function ContextIndicator({ context }: ContextIndicatorProps) {
  const [data, setData] = useState<ActiveContextData | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const fetchContext = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/${context}/context-v2/active`);
      if (res.data.success) {
        setData(res.data.data);
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
    <div className="ctx-indicator-wrapper">
      <button
        ref={triggerRef}
        type="button"
        className={`ctx-indicator-trigger ${open ? 'active' : ''}`}
        onClick={() => {
          setOpen(prev => !prev);
          if (!open) fetchContext();
        }}
        aria-label="Kontext-Details anzeigen"
        aria-expanded={open}
        title="Aktiver Kontext"
      >
        <span className="ctx-indicator-dot" />
        <span className="ctx-indicator-label">
          {loading ? '...' : totalItems}
        </span>
      </button>

      {open && (
        <div className="ctx-indicator-popover" ref={popoverRef} role="dialog" aria-label="Kontext-Details">
          <div className="ctx-indicator-popover-header">
            <span className="ctx-indicator-popover-title">
              Aktiver Kontext: {CONTEXT_LABELS[context]}
            </span>
          </div>

          <div className="ctx-indicator-popover-grid">
            <div className="ctx-indicator-popover-stat">
              <span className="ctx-indicator-popover-stat-value">
                {data?.workingMemoryCount ?? 0}
              </span>
              <span className="ctx-indicator-popover-stat-label">Working Memory</span>
            </div>
            <div className="ctx-indicator-popover-stat">
              <span className="ctx-indicator-popover-stat-value">
                {data?.factsCount ?? 0}
              </span>
              <span className="ctx-indicator-popover-stat-label">Langzeit-Fakten</span>
            </div>
            <div className="ctx-indicator-popover-stat">
              <span className="ctx-indicator-popover-stat-value">
                {data?.proceduresCount ?? 0}
              </span>
              <span className="ctx-indicator-popover-stat-label">Prozeduren</span>
            </div>
            <div className="ctx-indicator-popover-stat">
              <span className="ctx-indicator-popover-stat-value">
                {data?.upcomingEventsCount ?? 0}
              </span>
              <span className="ctx-indicator-popover-stat-label">Termine (2h)</span>
            </div>
          </div>

          {data?.upcomingEvents && data.upcomingEvents.length > 0 && (
            <div className="ctx-indicator-popover-events">
              <span className="ctx-indicator-popover-section-title">Anstehende Termine</span>
              {data.upcomingEvents.map(event => (
                <div key={event.id} className="ctx-indicator-popover-event">
                  <span className="ctx-indicator-popover-event-time">
                    {formatEventTime(event.start_time)}
                  </span>
                  <span className="ctx-indicator-popover-event-title">{event.title}</span>
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
