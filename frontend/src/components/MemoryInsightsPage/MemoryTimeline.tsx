/**
 * Phase 53: Memory Timeline Component
 *
 * Vertical timeline showing memory creation over time, grouped by layer.
 * Supports day/week/month granularity toggle.
 *
 * Uses global axios instance (with auth interceptor from main.tsx).
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface TimelineEntry {
  date: string;
  layer: 'working' | 'episodic' | 'short_term' | 'long_term';
  count: number;
}

interface MemoryTimelineProps {
  context: string;
}

const LAYER_COLORS: Record<string, string> = {
  working: '#a855f7',
  episodic: '#22c55e',
  short_term: '#3b82f6',
  long_term: '#ff6b35',
};

const LAYER_LABELS: Record<string, string> = {
  working: 'Working',
  episodic: 'Episodic',
  short_term: 'Short-Term',
  long_term: 'Long-Term',
};

type Granularity = 'day' | 'week' | 'month';

/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString). */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function MemoryTimeline({ context }: MemoryTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [granularity, setGranularity] = useState<Granularity>('week');
  const [loading, setLoading] = useState(false);

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const to = toLocalDateString(new Date());
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - (granularity === 'day' ? 30 : granularity === 'week' ? 90 : 365));
      const from = toLocalDateString(fromDate);

      const res = await axios.get(
        `/api/${context}/memory/insights/timeline?from=${from}&to=${to}&granularity=${granularity}`
      );
      if (res.data?.success) setEntries(res.data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [context, granularity]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  // Group entries by date
  const grouped = entries.reduce<Record<string, TimelineEntry[]>>((acc, entry) => {
    const dateKey = entry.date.split('T')[0];
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort().reverse();

  return (
    <div className="memory-timeline">
      <div className="timeline-controls">
        <div className="timeline-granularity">
          {(['day', 'week', 'month'] as Granularity[]).map((g) => (
            <button
              key={g}
              className={`granularity-btn ${granularity === g ? 'active' : ''}`}
              onClick={() => setGranularity(g)}
            >
              {g === 'day' ? 'Tag' : g === 'week' ? 'Woche' : 'Monat'}
            </button>
          ))}
        </div>
        <div className="timeline-legend">
          {Object.entries(LAYER_COLORS).map(([layer, color]) => (
            <span className="legend-item" key={layer}>
              <span className="legend-dot" style={{ backgroundColor: color }} />
              {LAYER_LABELS[layer]}
            </span>
          ))}
        </div>
      </div>

      {loading && <div className="memory-insights-loading">Laden...</div>}

      {!loading && sortedDates.length === 0 && (
        <div className="memory-insights-empty">Keine Timeline-Daten vorhanden.</div>
      )}

      {!loading && sortedDates.length > 0 && (
        <div className="timeline-entries">
          {sortedDates.map((date) => {
            const dateEntries = grouped[date];
            const totalCount = dateEntries.reduce((s, e) => s + e.count, 0);
            return (
              <div className="timeline-date-group" key={date}>
                <div className="timeline-date-header">
                  <span className="timeline-date">{new Date(date).toLocaleDateString('de-DE', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}</span>
                  <span className="timeline-total">{totalCount} Erinnerungen</span>
                </div>
                <div className="timeline-layer-bars">
                  {dateEntries.map((entry) => (
                    <div className="timeline-layer-row" key={`${date}-${entry.layer}`}>
                      <span
                        className="timeline-dot"
                        style={{ backgroundColor: LAYER_COLORS[entry.layer] }}
                      />
                      <span className="timeline-layer-name">{LAYER_LABELS[entry.layer]}</span>
                      <div className="timeline-bar-container">
                        <div
                          className="timeline-bar"
                          style={{
                            width: `${Math.min((entry.count / Math.max(totalCount, 1)) * 100, 100)}%`,
                            backgroundColor: LAYER_COLORS[entry.layer],
                          }}
                        />
                      </div>
                      <span className="timeline-count">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
