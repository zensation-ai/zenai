/**
 * MeetingSearchBar - Search + filter bar for meetings.
 * Debounced text input, status filter, has-audio toggle.
 */

import { useState, useEffect, useRef } from 'react';
import './MeetingSearchBar.css';

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

  // Debounce query changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(query, {
        status: status || undefined,
        hasAudio: hasAudio || undefined,
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, status, hasAudio, onSearch]);

  return (
    <div className="meeting-search-bar">
      <input
        className="meeting-search-bar__input"
        type="text"
        placeholder="Meetings durchsuchen..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      <select
        className="meeting-search-bar__select"
        value={status}
        onChange={e => setStatus(e.target.value)}
      >
        <option value="">Alle</option>
        <option value="scheduled">Geplant</option>
        <option value="in_progress">Laufend</option>
        <option value="completed">Abgeschlossen</option>
      </select>

      <label className="meeting-search-bar__toggle">
        <input
          type="checkbox"
          checked={hasAudio}
          onChange={e => setHasAudio(e.target.checked)}
        />
        Hat Audio
      </label>
    </div>
  );
}
