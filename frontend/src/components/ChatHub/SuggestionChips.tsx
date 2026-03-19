/**
 * SuggestionChips — Contextual suggestions shown when IntentBar is empty + focused (Phase 104)
 *
 * 3-4 chips, keyboard navigable (ArrowLeft/ArrowRight, Enter to select).
 * Spring entry animation, staggered. Styles in IntentBar.css.
 */

import { useCallback, useRef } from 'react';
import type { SuggestionChip } from './types';

interface SuggestionChipsProps {
  chips: SuggestionChip[];
  visible: boolean;
  onSelect: (prompt: string) => void;
}

export function SuggestionChips({ chips, visible, onSelect }: SuggestionChipsProps) {
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let nextIndex = index;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (index + 1) % chips.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (index - 1 + chips.length) % chips.length;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(chips[index].prompt);
        return;
      } else {
        return;
      }

      chipRefs.current[nextIndex]?.focus();
    },
    [chips, onSelect]
  );

  if (!visible || chips.length === 0) {
    return null;
  }

  return (
    <ul className="suggestion-chips" role="list" aria-label="Vorschlaege">
      {chips.map((chip, i) => (
        <li key={chip.id} className="suggestion-chips__item" role="listitem">
          <button
            ref={(el) => { chipRefs.current[i] = el; }}
            className="suggestion-chips__chip"
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => onSelect(chip.prompt)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            tabIndex={i === 0 ? 0 : -1}
            type="button"
          >
            {chip.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
