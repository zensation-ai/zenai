/**
 * Phase 53 → V1.0 Polish: Memory Timeline Component
 *
 * Interactive vertical timeline showing memory creation over time, grouped by layer.
 * Features: entry animations (useInView), click-to-expand detail, layer filter toggles,
 * hover preview tooltip. Supports day/week/month granularity.
 *
 * Uses global axios instance (with auth interceptor from main.tsx).
 */

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import axios from 'axios';
import { usePrefersReducedMotion, springs } from '../../utils/animations';
import { MEMORY_LAYER_COLORS } from '../../constants/chart-colors';

// ============================================
// Types
// ============================================

interface TimelineEntry {
  date: string;
  layer: MemoryLayer;
  count: number;
}

type MemoryLayer = 'working' | 'episodic' | 'short_term' | 'long_term';

interface MemoryTimelineProps {
  context: string;
}

// ============================================
// Constants
// ============================================


const LAYER_LABELS: Record<MemoryLayer, string> = {
  working: 'Working',
  episodic: 'Episodic',
  short_term: 'Short-Term',
  long_term: 'Long-Term',
};

const ALL_LAYERS: MemoryLayer[] = ['working', 'episodic', 'short_term', 'long_term'];

type Granularity = 'day' | 'week' | 'month';

// ============================================
// Helpers
// ============================================

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Heute';
  if (days === 1) return 'Gestern';
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Wochen`;
  return `vor ${Math.floor(days / 30)} Monaten`;
}

function strengthDots(count: number, maxCount: number): string {
  const ratio = maxCount > 0 ? count / maxCount : 0;
  const filled = Math.max(1, Math.round(ratio * 5));
  return '\u25CF'.repeat(filled) + '\u25CB'.repeat(5 - filled);
}

// ============================================
// Sub-Components
// ============================================

/** Mini SVG sparkline showing relative layer distribution for a date group */
function DecaySparkline({ entries, maxCount }: { entries: TimelineEntry[]; maxCount: number }) {
  const W = 120;
  const H = 24;
  const PAD = 2;
  if (entries.length === 0 || maxCount === 0) return null;

  // Sort by layer order for consistent display
  const ordered = ALL_LAYERS
    .filter((l) => entries.some((e) => e.layer === l))
    .map((l) => entries.find((e) => e.layer === l)!);

  const barW = Math.min(
    (W - PAD * 2) / Math.max(ordered.length, 1) - 2,
    24
  );
  const startX = PAD + ((W - PAD * 2) - ordered.length * (barW + 2)) / 2;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-hidden>
      {ordered.map((entry, i) => {
        const ratio = entry.count / maxCount;
        const barH = Math.max(2, ratio * (H - PAD * 2));
        const x = startX + i * (barW + 2);
        const y = H - PAD - barH;
        return (
          <rect
            key={entry.layer}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={2}
            fill={MEMORY_LAYER_COLORS[entry.layer]}
            opacity={0.8}
          />
        );
      })}
    </svg>
  );
}

/** Animated progress bar for confidence/strength visualization */
function ConfidenceBar({ ratio, inView }: { ratio: number; inView: boolean }) {
  const pct = Math.round(ratio * 100);
  const hue = ratio * 120; // 0=red, 60=yellow, 120=green
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-[var(--bar-hsl)]"
          style={{ '--bar-hsl': `hsl(${hue}, 70%, 55%)` } as CSSProperties}
          initial={{ width: 0 }}
          animate={inView ? { width: `${Math.max(pct, 2)}%` } : { width: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        />
      </div>
      <span className="text-[10px] text-white/50 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

function TimelineDateGroup({
  date,
  dateEntries,
  totalCount,
  maxCount,
  index,
  expandedDate,
  onToggleExpand,
  reducedMotion,
}: {
  date: string;
  dateEntries: TimelineEntry[];
  totalCount: number;
  maxCount: number;
  index: number;
  expandedDate: string | null;
  onToggleExpand: (date: string) => void;
  reducedMotion: boolean;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
  const isExpanded = expandedDate === date;

  return (
    <motion.div
      ref={ref}
      className="rounded-lg border border-white/10 bg-white/5 p-3 mb-2"
      layoutId={`timeline-${date}`}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
      transition={reducedMotion ? { duration: 0.01 } : { delay: index * 0.05, ...springs.gentle }}
      layout
    >
      {/* Clickable header */}
      <button
        className="flex items-center justify-between w-full text-left gap-2 group"
        onClick={() => onToggleExpand(date)}
        aria-expanded={isExpanded}
      >
        <span className="text-sm font-medium text-white/90">
          {new Date(date).toLocaleDateString('de-DE', {
            year: 'numeric', month: 'short', day: 'numeric',
          })}
        </span>
        <span className="text-xs text-white/50">{totalCount} Erinnerungen</span>
        <span
          className={`text-[10px] text-white/40 transition-transform duration-200 ${isExpanded ? 'rotate-90' : 'rotate-0'}`}
        >
          {'\u25B6'}
        </span>
      </button>

      {/* Layer bars */}
      <div className="mt-2 space-y-1">
        {dateEntries.map((entry) => (
          <div className="flex items-center gap-2 text-xs" key={`${date}-${entry.layer}`}>
            <span
              className="w-2 h-2 rounded-full shrink-0 bg-[var(--lc)]"
              style={{ '--lc': MEMORY_LAYER_COLORS[entry.layer] } as CSSProperties}
            />
            <span className="w-20 text-white/60 truncate">{LAYER_LABELS[entry.layer]}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-[var(--lc)]"
                style={{ '--lc': MEMORY_LAYER_COLORS[entry.layer] } as CSSProperties}
                initial={{ width: 0 }}
                animate={inView ? {
                  width: `${Math.min((entry.count / Math.max(totalCount, 1)) * 100, 100)}%`,
                } : { width: 0 }}
                transition={{ delay: index * 0.05 + 0.1, duration: 0.4 }}
              />
            </div>
            <span className="w-6 text-right text-white/50 tabular-nums">{entry.count}</span>
          </div>
        ))}
      </div>

      {/* Expanded detail panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mt-3 pt-3 border-t border-white/10 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-white/50">Datum</span>
                <span className="text-white/80">{new Date(date).toLocaleDateString('de-DE', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Alter</span>
                <span className="text-white/80">{formatAge(date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Gesamt</span>
                <span className="text-white/80">{totalCount} Erinnerungen</span>
              </div>

              {/* Confidence progress bar */}
              <div>
                <span className="text-white/50 block mb-1">Konfidenz</span>
                <ConfidenceBar ratio={maxCount > 0 ? totalCount / maxCount : 0} inView={inView} />
              </div>

              {/* Decay sparkline */}
              <div className="flex items-center justify-between">
                <span className="text-white/50">Verteilung</span>
                <DecaySparkline entries={dateEntries} maxCount={maxCount} />
              </div>

              <div className="flex justify-between">
                <span className="text-white/50">Stärke</span>
                <span className="text-amber-400 tracking-wider">{strengthDots(totalCount, maxCount)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {dateEntries.map((entry) => (
                  <span
                    key={entry.layer}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-[var(--lc-bg)] text-[var(--lc)] border-[var(--lc-border)]"
                    style={{
                      '--lc': MEMORY_LAYER_COLORS[entry.layer],
                      '--lc-bg': MEMORY_LAYER_COLORS[entry.layer] + '18',
                      '--lc-border': MEMORY_LAYER_COLORS[entry.layer] + '40',
                    } as CSSProperties}
                  >
                    {LAYER_LABELS[entry.layer]}: {entry.count}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================
// Main Component
// ============================================

export function MemoryTimeline({ context }: MemoryTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [granularity, setGranularity] = useState<Granularity>('week');
  const [loading, setLoading] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Set<MemoryLayer>>(new Set(ALL_LAYERS));
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();

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

  // Filter entries by active layers
  const filteredEntries = entries.filter((e) => activeLayers.has(e.layer));

  // Group by date
  const grouped = filteredEntries.reduce<Record<string, TimelineEntry[]>>((acc, entry) => {
    const dateKey = entry.date.split('T')[0];
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort().reverse();
  const maxCount = sortedDates.reduce((max, date) => {
    const total = grouped[date].reduce((s, e) => s + e.count, 0);
    return Math.max(max, total);
  }, 0);

  const toggleLayer = (layer: MemoryLayer) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) {
        if (next.size > 1) next.delete(layer);
      } else {
        next.add(layer);
      }
      return next;
    });
  };

  const toggleExpand = (date: string) => {
    setExpandedDate((prev) => (prev === date ? null : date));
  };

  // Hover data
  const hoveredGroup = hoveredDate && grouped[hoveredDate] ? grouped[hoveredDate] : null;
  const hoveredTotal = hoveredGroup ? hoveredGroup.reduce((s, e) => s + e.count, 0) : 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Granularity toggles */}
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {(['day', 'week', 'month'] as Granularity[]).map((g) => (
            <button
              key={g}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                granularity === g
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-white/50 hover:text-white/70'
              }`}
              onClick={() => setGranularity(g)}
            >
              {g === 'day' ? 'Tag' : g === 'week' ? 'Woche' : 'Monat'}
            </button>
          ))}
        </div>

        {/* Layer filter toggles */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Memory-Layer-Filter">
          {ALL_LAYERS.map((layer) => {
            const active = activeLayers.has(layer);
            return (
              <button
                key={layer}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-all bg-[var(--lc-bg)] text-[var(--lc-text)] border-[var(--lc-border)] ${
                  active ? 'font-medium' : 'opacity-40 hover:opacity-70'
                }`}
                onClick={() => toggleLayer(layer)}
                aria-pressed={active}
                style={{
                  '--lc-border': MEMORY_LAYER_COLORS[layer] + (active ? '80' : '30'),
                  '--lc-bg': active ? MEMORY_LAYER_COLORS[layer] + '18' : 'transparent',
                  '--lc-text': active ? MEMORY_LAYER_COLORS[layer] : 'var(--color-text-muted)',
                } as CSSProperties}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[var(--lc-dot)]"
                  style={{ '--lc-dot': MEMORY_LAYER_COLORS[layer] } as CSSProperties}
                />
                {LAYER_LABELS[layer]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-white/50 text-sm">
          Laden...
        </div>
      )}

      {/* Empty */}
      {!loading && sortedDates.length === 0 && (
        <div className="flex items-center justify-center py-12 text-white/40 text-sm">
          Keine Timeline-Daten vorhanden.
        </div>
      )}

      {/* Timeline entries */}
      {!loading && sortedDates.length > 0 && (
        <div className="space-y-0">
          <AnimatePresence mode="popLayout">
            {sortedDates.map((date, index) => {
              const dateEntries = grouped[date];
              const totalCount = dateEntries.reduce((s, e) => s + e.count, 0);
              return (
                <div
                  key={date}
                  className="relative"
                  onMouseEnter={() => setHoveredDate(date)}
                  onMouseLeave={() => setHoveredDate(null)}
                >
                  <TimelineDateGroup
                    date={date}
                    dateEntries={dateEntries}
                    totalCount={totalCount}
                    maxCount={maxCount}
                    index={index}
                    expandedDate={expandedDate}
                    onToggleExpand={toggleExpand}
                    reducedMotion={reducedMotion}
                  />

                  {/* Hover tooltip (only when not expanded) */}
                  {hoveredDate === date && expandedDate !== date && (
                    <div
                      className="absolute right-0 top-0 z-10 pointer-events-none bg-black/90 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-xs shadow-lg -translate-y-full -mt-1"
                      role="tooltip"
                    >
                      <div className="font-medium text-white/90">
                        {new Date(date).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-white/50">{formatAge(date)}</div>
                      <div className="text-amber-400 tracking-wider mt-0.5">
                        {strengthDots(hoveredTotal, maxCount)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
