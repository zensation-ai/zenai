import { useMemo } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FilterChipDef, IdeaFilters, IdeaStatus } from './types';

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
    <div className="relative px-4 overflow-hidden after:content-[''] after:absolute after:right-0 after:top-0 after:bottom-0 after:w-10 after:bg-gradient-to-r after:from-transparent after:to-bg after:pointer-events-none after:z-[1]" role="toolbar" aria-label="Chip-Auswahl">
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 pr-8 [-webkit-overflow-scrolling:touch]">
        {grouped.map((g, gi) => (
          <div key={g.group} className="flex items-center gap-1.5 shrink-0">
            {gi > 0 && <div data-testid="filter-separator" className="w-px h-5 bg-glass-border mx-1 shrink-0" role="separator" />}
            {g.chips.map(chip => {
              const active = isChipActive(chip, filters);
              return (
                <button
                  key={chip.id}
                  className={cn(
                    'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-glass-border text-text-secondary text-[13px] cursor-pointer transition-all duration-150 whitespace-nowrap shrink-0',
                    'hover:bg-surface-hover hover:text-text',
                    'focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
                    'touch-coarse:min-h-[44px] touch-coarse:px-3.5 touch-coarse:py-2',
                    active && 'bg-primary/10 text-primary border-primary/20 font-medium hover:bg-primary/15 hover:text-primary'
                  )}
                  aria-pressed={active}
                  onClick={() => onToggle(chip.group, chip.value)}
                >
                  {chip.label}
                  {chip.count != null && <span className="text-[11px] opacity-60">{chip.count}</span>}
                </button>
              );
            })}
          </div>
        ))}
        {activeCount > 0 && (
          <button
            className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-glass-border bg-transparent text-text-secondary cursor-pointer shrink-0 transition-all duration-150 hover:bg-red-500 hover:text-white hover:border-red-500 touch-coarse:min-w-[44px] touch-coarse:min-h-[44px]"
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
