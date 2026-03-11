/**
 * Phase 50: DateRangePicker Component
 *
 * Compact date range selector with presets and custom range inputs.
 */

import React, { useCallback } from 'react';

export interface DateRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

type PresetKey = '7d' | '30d' | '90d' | 'year';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: '7d', label: '7 Tage' },
  { key: '30d', label: '30 Tage' },
  { key: '90d', label: '90 Tage' },
  { key: 'year', label: 'Dieses Jahr' },
];

function getPresetRange(key: PresetKey): DateRange {
  const now = new Date();
  const to = now.toISOString().split('T')[0];

  switch (key) {
    case '7d': {
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString().split('T')[0], to };
    }
    case '30d': {
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString().split('T')[0], to };
    }
    case '90d': {
      const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString().split('T')[0], to };
    }
    case 'year': {
      const from = `${now.getFullYear()}-01-01`;
      return { from, to };
    }
  }
}

function isActivePreset(value: DateRange, key: PresetKey): boolean {
  const preset = getPresetRange(key);
  return value.from === preset.from && value.to === preset.to;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ value, onChange }) => {
  const handlePreset = useCallback(
    (key: PresetKey) => {
      onChange(getPresetRange(key));
    },
    [onChange]
  );

  const handleFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const from = e.target.value;
      if (from && from <= value.to) {
        onChange({ ...value, from });
      }
    },
    [value, onChange]
  );

  const handleToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const to = e.target.value;
      if (to && to >= value.from) {
        onChange({ ...value, to });
      }
    },
    [value, onChange]
  );

  return (
    <div className="av2-date-range-picker">
      <div className="av2-presets">
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`av2-preset-btn ${isActivePreset(value, key) ? 'active' : ''}`}
            onClick={() => handlePreset(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="av2-custom-range">
        <input
          type="date"
          value={value.from}
          max={value.to}
          onChange={handleFromChange}
          className="av2-date-input"
          aria-label="Von"
        />
        <span className="av2-date-separator">&ndash;</span>
        <input
          type="date"
          value={value.to}
          min={value.from}
          onChange={handleToChange}
          className="av2-date-input"
          aria-label="Bis"
        />
      </div>
    </div>
  );
};
