/**
 * FilterChipBar - Horizontal scrollable bar of filter chips
 * Groups: folder | status | category, separated by dividers
 */
import React from 'react';
import type { InboxFilterChipDef, InboxFilters, EmailTab, EmailCategory } from './types';
import './FilterChipBar.css';

interface FilterChipBarProps {
  chips: InboxFilterChipDef[];
  filters: InboxFilters;
  onToggle: (chip: InboxFilterChipDef) => void;
  onClear: () => void;
  activeCount: number;
}

function isChipActive(chip: InboxFilterChipDef, filters: InboxFilters): boolean {
  if (chip.group === 'folder') return filters.folders.has(chip.value as EmailTab);
  if (chip.group === 'status') return filters.statuses.has(chip.value as 'unread' | 'starred');
  if (chip.group === 'category') return filters.categories.has(chip.value as EmailCategory);
  return false;
}

export const FilterChipBar: React.FC<FilterChipBarProps> = ({
  chips,
  filters,
  onToggle,
  onClear,
  activeCount,
}) => {
  // Group chips by group for visual separators
  const groups = ['folder', 'status', 'category'] as const;
  const grouped = groups.map(g => chips.filter(c => c.group === g)).filter(g => g.length > 0);

  return (
    <div className="inbox-chip-bar" role="toolbar" aria-label="E-Mail Filter">
      {grouped.map((groupChips, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <span className="inbox-chip-separator" aria-hidden="true" />}
          {groupChips.map(chip => (
            <button
              key={chip.id}
              className={`inbox-chip ${isChipActive(chip, filters) ? 'inbox-chip--active' : ''}`}
              onClick={() => onToggle(chip)}
              aria-pressed={isChipActive(chip, filters)}
              type="button"
            >
              {chip.label}
            </button>
          ))}
        </React.Fragment>
      ))}
      {activeCount > 0 && (
        <button
          className="inbox-chip inbox-chip--clear"
          onClick={onClear}
          type="button"
          aria-label="Alle Filter entfernen"
        >
          ✕ Filter ({activeCount})
        </button>
      )}
    </div>
  );
};
