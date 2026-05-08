/**
 * MeetingSearchBar - Search + filter bar for meetings.
 * Debounced text input, status filter, has-audio toggle.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';

interface MeetingSearchFilters {
  status?: string;
  hasAudio?: boolean;
}

interface MeetingSearchBarProps {
  onSearch: (query: string, filters: MeetingSearchFilters) => void;
}

export function MeetingSearchBar({ onSearch }: MeetingSearchBarProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [hasAudio, setHasAudio] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const isInitialMount = useRef(true);

  const triggerSearch = useCallback((q: string, s: string, a: boolean) => {
    onSearchRef.current(q, {
      status: s || undefined,
      hasAudio: a || undefined,
    });
  }, []);

  // Debounce query/filter changes (skip initial mount - parent fetches on mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      triggerSearch(query, status, hasAudio);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, status, hasAudio, triggerSearch]);

  return (
    <div className="flex flex-row gap-3 items-center mb-4 max-[600px]:flex-wrap">
      <Input
        type="text"
        placeholder="Meetings durchsuchen..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="flex-1 max-[600px]:min-w-full"
      />

      <select
        className="px-3 py-2 rounded-md border border-glass-border bg-surface text-text text-[0.85rem] cursor-pointer"
        value={status}
        onChange={e => setStatus(e.target.value)}
      >
        <option value="">Alle</option>
        <option value="scheduled">Geplant</option>
        <option value="in_progress">Laufend</option>
        <option value="completed">Abgeschlossen</option>
      </select>

      <label className="inline-flex items-center gap-1 text-[0.85rem] text-text-secondary cursor-pointer whitespace-nowrap">
        <input
          type="checkbox"
          checked={hasAudio}
          onChange={e => setHasAudio(e.target.checked)}
          className="cursor-pointer"
        />
        Hat Audio
      </label>
    </div>
  );
}
