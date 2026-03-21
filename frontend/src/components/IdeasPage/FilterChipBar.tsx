import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { FilterChipDef, IdeaFilters, IdeaStatus } from './types';
import './FilterChipBar.css';

interface FilterChipBarProps {
  chips: FilterChipDef[];
  filters: IdeaFilters;
  onToggle: (group: string, value: string) => void;
  onClear: () => void;
  activeCount?: number;
}

function isChipActive(chip: FilterChipDef, filters: IdeaFilters): boolean {
  switch (chip.group) {
    case 'status': return filters.status.has(chip.value as IdeaStatus);
    case 'type': return filters.types.has(chip.value);
    case 'category': return filters.categories.has(chip.value);
    case 'priority': return filters.priorities.has(chip.value);
    default: return false;
  }
}

export function FilterChipBar({ chips, filters, onToggle, onClear, activeCount = 0 }: FilterChipBarProps) {
  const grouped = useMemo(() => {
    const groups: { group: string; chips: FilterChipDef[] }[] = [];
    let currentGroup = '';
    for (const chip of chips) {
      if (chip.group !== currentGroup) {
        groups.push({ group: chip.group, chips: [] });
        currentGroup = chip.group;
      }
      groups[groups.length - 1].chips.push(chip);
    }
    return groups;
  }, [chips]);

  return (
    <div className="filter-chip-bar" role="toolbar" aria-label="Chip-Auswahl">
      <div className="filter-chip-bar__scroll">
        {grouped.map((g, gi) => (
          <div key={g.group} className="filter-chip-bar__group">
            {gi > 0 && <div className="filter-chip-bar__separator" />}
            {g.chips.map(chip => {
              const active = isChipActive(chip, filters);
              return (
                <button
                  key={chip.id}
                  className={`filter-chip-bar__chip ${active ? 'filter-chip-bar__chip--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => onToggle(chip.group, chip.value)}
                >
                  {chip.label}
                  {chip.count != null && <span className="filter-chip-bar__count">{chip.count}</span>}
                </button>
              );
            })}
          </div>
        ))}
        {activeCount > 0 && (
          <button
            className="filter-chip-bar__clear"
            onClick={onClear}
            aria-label={`${activeCount} Filter entfernen`}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
