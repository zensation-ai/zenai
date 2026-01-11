import { useCallback, useRef, useEffect } from 'react';

interface UseKeyboardNavigationOptions {
  itemCount: number;
  onSelect: (index: number) => void;
  enabled?: boolean;
  loop?: boolean;
}

/**
 * Hook for keyboard navigation in menus and lists
 * Handles arrow keys, Home, End, and Enter
 *
 * @param options Configuration options
 * @returns Object with focusedIndex, handlers, and ref setters
 *
 * @example
 * const { focusedIndex, getItemProps, containerProps } = useKeyboardNavigation({
 *   itemCount: items.length,
 *   onSelect: (index) => handleSelect(items[index]),
 *   enabled: isOpen,
 * });
 */
export function useKeyboardNavigation({
  itemCount,
  onSelect,
  enabled = true,
  loop = true,
}: UseKeyboardNavigationOptions) {
  const focusedIndexRef = useRef(-1);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  // Reset focused index when disabled
  useEffect(() => {
    if (!enabled) {
      focusedIndexRef.current = -1;
    }
  }, [enabled]);

  const setFocusedIndex = useCallback((index: number) => {
    focusedIndexRef.current = index;
    if (index >= 0 && index < itemCount && itemRefs.current[index]) {
      itemRefs.current[index]?.focus();
    }
  }, [itemCount]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!enabled || itemCount === 0) return;

    const currentIndex = focusedIndexRef.current;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (currentIndex < 0) {
          setFocusedIndex(0);
        } else if (currentIndex < itemCount - 1) {
          setFocusedIndex(currentIndex + 1);
        } else if (loop) {
          setFocusedIndex(0);
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (currentIndex < 0) {
          setFocusedIndex(itemCount - 1);
        } else if (currentIndex > 0) {
          setFocusedIndex(currentIndex - 1);
        } else if (loop) {
          setFocusedIndex(itemCount - 1);
        }
        break;

      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;

      case 'End':
        e.preventDefault();
        setFocusedIndex(itemCount - 1);
        break;

      case 'Enter':
      case ' ':
        if (currentIndex >= 0) {
          e.preventDefault();
          onSelect(currentIndex);
        }
        break;
    }
  }, [enabled, itemCount, loop, onSelect, setFocusedIndex]);

  const getItemProps = useCallback((index: number) => ({
    ref: (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    },
    tabIndex: focusedIndexRef.current === index ? 0 : -1,
    onFocus: () => {
      focusedIndexRef.current = index;
    },
  }), []);

  const containerProps = {
    onKeyDown: handleKeyDown,
    role: 'listbox' as const,
  };

  return {
    focusedIndex: focusedIndexRef.current,
    getItemProps,
    containerProps,
    setFocusedIndex,
  };
}

/**
 * Simpler hook for roving tabindex in a group of buttons
 * Used for toggle button groups like FilterBar pills
 */
export function useRovingTabIndex(itemCount: number, enabled: boolean = true) {
  const focusedIndexRef = useRef(0);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, currentIndex: number) => {
    if (!enabled) return;

    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIndex = currentIndex < itemCount - 1 ? currentIndex + 1 : 0;
        break;

      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : itemCount - 1;
        break;

      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;

      case 'End':
        e.preventDefault();
        newIndex = itemCount - 1;
        break;

      default:
        return;
    }

    focusedIndexRef.current = newIndex;
    itemRefs.current[newIndex]?.focus();
  }, [enabled, itemCount]);

  const getItemProps = useCallback((index: number) => ({
    ref: (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    },
    tabIndex: index === focusedIndexRef.current ? 0 : -1,
    onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, index),
    onFocus: () => {
      focusedIndexRef.current = index;
    },
  }), [handleKeyDown]);

  return { getItemProps };
}
