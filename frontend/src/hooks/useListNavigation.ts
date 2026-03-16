/**
 * useListNavigation - J/K list navigation (Vim-style)
 *
 * Enables J/K keys for navigating through lists (ideas, emails, tasks, etc.).
 * Enter selects, Escape deselects.
 *
 * Automatically disabled when focus is in input/textarea/contenteditable.
 */

import { useState, useEffect, useCallback } from 'react';

interface UseListNavigationOptions<T> {
  /** The list items to navigate through */
  items: T[];
  /** Called when user presses Enter on selected item */
  onSelect?: (item: T, index: number) => void;
  /** Whether the hook is active */
  enabled?: boolean;
  /** CSS selector for list item containers (used for scroll-into-view) */
  containerSelector?: string;
}

interface UseListNavigationReturn {
  /** Currently selected index (-1 = none) */
  selectedIndex: number;
  /** Set selected index programmatically */
  setSelectedIndex: (index: number) => void;
  /** Props to spread on each list item for highlighting */
  getItemProps: (index: number) => {
    'data-list-index': number;
    'data-list-selected': boolean;
  };
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.closest('[role="dialog"]')) return true;
  return false;
}

export function useListNavigation<T>({
  items,
  onSelect,
  enabled = true,
  containerSelector,
}: UseListNavigationOptions<T>): UseListNavigationReturn {
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [items.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex < 0 || !containerSelector) return;
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const selected = container.querySelector(`[data-list-index="${selectedIndex}"]`);
    selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex, containerSelector]);

  useEffect(() => {
    if (!enabled || items.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          if (!e.shiftKey || e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => {
              const next = prev < items.length - 1 ? prev + 1 : prev;
              return next;
            });
          }
          break;

        case 'k':
        case 'ArrowUp':
          if (!e.shiftKey || e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => {
              const next = prev > 0 ? prev - 1 : 0;
              return next;
            });
          }
          break;

        case 'Enter':
          if (selectedIndex >= 0 && selectedIndex < items.length && onSelect) {
            e.preventDefault();
            onSelect(items[selectedIndex], selectedIndex);
          }
          break;

        case 'Escape':
          if (selectedIndex >= 0) {
            e.preventDefault();
            setSelectedIndex(-1);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, items, selectedIndex, onSelect]);

  const getItemProps = useCallback((index: number) => ({
    'data-list-index': index,
    'data-list-selected': index === selectedIndex,
  }), [selectedIndex]);

  return {
    selectedIndex,
    setSelectedIndex,
    getItemProps,
  };
}
