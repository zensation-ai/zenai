/**
 * TimeRangeChips - Horizontal filter chips for time range selection
 * 7 Tage | 30 Tage | 90 Tage | 1 Jahr
 */
import React from 'react';
import type { TimeRange } from './types';
import { TIME_RANGES } from './types';
import './TimeRangeChips.css';

interface TimeRangeChipsProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

export const TimeRangeChips: React.FC<TimeRangeChipsProps> = ({ value, onChange }) => (
  <div className="cockpit-time-chips" role="radiogroup" aria-label="Zeitraum wählen">
    {TIME_RANGES.map(range => (
      <button
        key={range.id}
        className={`cockpit-time-chips__chip ${value === range.id ? 'cockpit-time-chips__chip--active' : ''}`}
        onClick={() => onChange(range.id)}
        role="radio"
        aria-checked={value === range.id}
        type="button"
      >
        {range.label}
      </button>
    ))}
  </div>
);
