import { useEffect, RefObject } from 'react';

/**
 * Hook to detect clicks outside of a referenced element
 * Useful for closing dropdowns, modals, etc.
 *
 * @param ref - Reference to the element to monitor
 * @param callback - Function to call when click outside is detected
 * @param enabled - Whether the listener is active (default: true)
 *
 * @example
 * const dropdownRef = useRef<HTMLDivElement>(null);
 * useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);
 */
export function useClickOutside(
  ref: RefObject<HTMLElement>,
  callback: () => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) return;

    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    }

    // Use mousedown for better UX (triggers before click completes)
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref, callback, enabled]);
}

/**
 * Hook to detect Escape key press
 * Often used together with useClickOutside for dropdowns/modals
 *
 * @param callback - Function to call when Escape is pressed
 * @param enabled - Whether the listener is active (default: true)
 *
 * @example
 * useEscapeKey(() => setIsOpen(false), isOpen);
 */
export function useEscapeKey(callback: () => void, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        callback();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [callback, enabled]);
}

/**
 * Combined hook for dropdown/modal behavior
 * Handles both click outside and Escape key
 *
 * @example
 * const dropdownRef = useRef<HTMLDivElement>(null);
 * useDropdownClose(dropdownRef, () => setIsOpen(false), isOpen);
 */
export function useDropdownClose(
  ref: RefObject<HTMLElement>,
  callback: () => void,
  enabled: boolean = true
): void {
  useClickOutside(ref, callback, enabled);
  useEscapeKey(callback, enabled);
}
