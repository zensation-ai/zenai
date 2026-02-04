/**
 * useFocusTrap - A custom hook for trapping focus within a container
 *
 * Implements accessible focus management for modals, dialogs, and panels.
 * - Traps Tab and Shift+Tab within the container
 * - Focuses the first focusable element on mount
 * - Restores focus to the previously focused element on unmount
 *
 * @module hooks/useFocusTrap
 */

import { useEffect, useRef, useCallback } from 'react';

interface UseFocusTrapOptions {
  /** Whether the trap is currently active */
  isActive: boolean;
  /** Called when Escape is pressed (optional - container should handle ESC separately) */
  onEscape?: () => void;
  /** Selector for initial focus element (defaults to first focusable) */
  initialFocusSelector?: string;
  /** Whether to restore focus on deactivation */
  restoreFocus?: boolean;
}

// Focusable elements selector
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

/**
 * Hook to trap focus within a container element
 *
 * @example
 * ```tsx
 * function Modal({ isOpen, onClose }) {
 *   const containerRef = useFocusTrap({ isActive: isOpen });
 *   return isOpen ? (
 *     <div ref={containerRef} role="dialog" aria-modal="true">
 *       <button onClick={onClose}>Close</button>
 *       <input placeholder="Name" />
 *     </div>
 *   ) : null;
 * }
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  options: UseFocusTrapOptions
) {
  const { isActive, initialFocusSelector, restoreFocus = true } = options;
  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Get focusable elements within the container
  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter(
      (el) =>
        !el.hasAttribute('disabled') &&
        el.getAttribute('tabindex') !== '-1' &&
        el.offsetParent !== null // Element is visible
    );
  }, []);

  // Handle Tab key press
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isActive || !containerRef.current) return;

      if (event.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        // Shift+Tab from first element -> go to last
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
        // Tab from last element -> go to first
        else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
        // If focus is outside container (shouldn't happen), trap it back
        else if (
          !containerRef.current.contains(document.activeElement)
        ) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    },
    [isActive, getFocusableElements]
  );

  // Setup and cleanup
  useEffect(() => {
    if (!isActive) return;

    // Store previously focused element
    previousFocusRef.current = document.activeElement;

    // Focus initial element
    const container = containerRef.current;
    if (container) {
      // Try initial focus selector first
      if (initialFocusSelector) {
        const initialElement = container.querySelector<HTMLElement>(
          initialFocusSelector
        );
        if (initialElement) {
          initialElement.focus();
        }
      }

      // Otherwise focus first focusable element
      if (
        !initialFocusSelector ||
        !container.contains(document.activeElement) ||
        document.activeElement === document.body
      ) {
        const focusable = getFocusableElements();
        if (focusable.length > 0) {
          // Small delay to ensure element is mounted and visible
          requestAnimationFrame(() => {
            focusable[0].focus();
          });
        }
      }
    }

    // Add keydown listener
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      // Restore focus
      if (restoreFocus && previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive, initialFocusSelector, restoreFocus, getFocusableElements, handleKeyDown]);

  return containerRef;
}

export default useFocusTrap;
