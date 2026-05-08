/**
 * ReviewCalendar - 4-week heatmap showing upcoming FSRS reviews
 *
 * Color intensity based on number of facts due per day.
 * Today is highlighted with an accent ring.
 */

import type { ReviewFact } from '../../hooks/queries/useCognitiveData';

interface ReviewCalendarProps {
  reviewQueue: ReviewFact[];
}

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function getHeatClass(count: number): string {
  if (count === 0) return 'heat-0';
  if (count <= 3) return 'heat-1';
  if (count <= 7) return 'heat-2';
  return 'heat-3';
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function ReviewCalendar({ reviewQueue }: ReviewCalendarProps) {
  const today = new Date();

  // Build map: dateString -> count of facts due
  const dueCounts = new Map<string, number>();
  for (const fact of reviewQueue) {
    if (!fact.fsrs_next_review) continue;
    const d = new Date(fact.fsrs_next_review);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    dueCounts.set(key, (dueCounts.get(key) ?? 0) + 1);
  }

  // Generate 28 days starting from the Monday of the current week
  const startOfWeek = new Date(today);
  const dayOfWeek = startOfWeek.getDay(); // 0=Sun, 1=Mon
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(startOfWeek.getDate() + mondayOffset);
  startOfWeek.setHours(0, 0, 0, 0);

  const cells: Array<{ date: Date; count: number; isToday: boolean }> = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    cells.push({
      date: d,
      count: dueCounts.get(key) ?? 0,
      isToday: isSameDay(d, today),
    });
  }

  return (
    <div className="review-calendar" role="region" aria-label="Wiederholungskalender">
      <div className="cognitive-section-title">Wiederholungskalender</div>
      <div className="review-calendar-grid" data-testid="review-calendar-grid">
        {/* Header row */}
        {DAY_LABELS.map(label => (
          <div key={label} className="review-calendar-header">
            {label}
          </div>
        ))}
        {/* Day cells */}
        {cells.map((cell, i) => (
          <div
            key={i}
            className={`review-calendar-cell ${getHeatClass(cell.count)}${cell.isToday ? ' today' : ''}`}
            title={`${cell.date.toLocaleDateString('de-DE')}: ${cell.count} Fakt${cell.count !== 1 ? 'en' : ''} fällig`}
          >
            {cell.date.getDate()}
          </div>
        ))}
      </div>
    </div>
  );
}
