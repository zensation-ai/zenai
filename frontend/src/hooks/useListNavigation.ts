/**
 * useListNavigation - J/K List Navigation Hook
 *
 * Provides Vim-style J/K navigation for any list:
 *   J = Move down
 *   K = Move up
 *   Enter = Open/Select
 *   E = Archive (optional)
 *   X = Toggle select (optional)
 *
 * Phase 82: Keyboard-First & Command System
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================
// Types
// ============================================

interface UseListNavigationOptions<T> {
  /** The list of items to navigate */
  items: T[];
  /** Callback when Enter is pressed on the selected item */
  onSelect?: (item: T, index: number) => void;
  /** Callback when E is pressed on the selected item (archive/action) */
  onAction?: (item: T, index: number) => void;
  /** Whether the navigation is active */
  enabled?: boolean;
  /** Container ref for scrolling selected item into view */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** CSS selector for items within the container */
  itemSelector?: string;
}

interface UseListNavigationReturn {
  /** Currently selected index (-1 = none selected) */
  selectedIndex: number;
  /** Set the selected index programmatically */
  setSelectedIndex: (index: number) => void;
  /** Props to spread on each list item for highlighting */
  getItemProps: (index: number) => {
    'data-list-selected': boolean;
    'data-list-index': number;
  };
  /** Whether list navigation is actively capturing keys */
  isActive: boolean;
}

// ============================================
// Hook
// ============================================

export function useListNavigation<T>({
  items,
  onSelect,
  onAction,
  enabled = true,
  containerRef,
  itemSelector = '[data-list-index]',
}: UseListNavigationOptions<T>): UseListNavigationReturn {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isActive, setIsActive] = useState(false);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  // Reset selection when items change
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (!containerRef?.current || selectedIndex < 0) return;
    const container = containerRef.current;
    const selectedEl = container.querySelector(`${itemSelector}[data-list-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex, containerRef, itemSelector]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || items.length === 0) return;

      // Skip when typing in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Skip if modifier keys are pressed
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'j': {
          e.preventDefault();
          setIsActive(true);
          setSelectedIndex(prev => {
            const next = Math.min(prev + 1, items.length - 1);
            return prev === -1 ? 0 : next;
          });
          break;
        }
        case 'k': {
          e.preventDefault();
          setIsActive(true);
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        }
        case 'enter': {
          if (selectedIndexRef.current >= 0 && isActive) {
            e.preventDefault();
            const item = items[selectedIndexRef.current];
            if (item) onSelect?.(item, selectedIndexRef.current);
          }
          break;
        }
        case 'e': {
          if (selectedIndexRef.current >= 0 && isActive && onAction) {
            e.preventDefault();
            const item = items[selectedIndexRef.current];
            if (item) onAction(item, selectedIndexRef.current);
          }
          break;
        }
        case 'escape': {
          if (isActive) {
            e.preventDefault();
            setIsActive(false);
            setSelectedIndex(-1);
          }
          break;
        }
      }
    },
    [enabled, items, onSelect, onAction, isActive]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const getItemProps = useCallback(
    (index: number) => ({
      'data-list-selected': isActive && index === selectedIndex,
      'data-list-index': index,
    }),
    [isActive, selectedIndex]
  );

  return {
    selectedIndex: isActive ? selectedIndex : -1,
    setSelectedIndex,
    getItemProps,
    isActive,
  };
}
