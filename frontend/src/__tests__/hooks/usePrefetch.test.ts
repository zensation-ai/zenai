/**
 * Tests for usePrefetch hook
 *
 * Tests the prefetch logic: deduplication via Set, silent error handling,
 * and undefined guard. Mocks React hooks to exercise the hook's logic
 * without a full React rendering context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────
// Mocks — registered before dynamic import
// ─────────────────────────────────────────────

vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useRef: (init: unknown) => ({ current: init }),
}));

// ─────────────────────────────────────────────
// Import under test (after mocks are registered)
// ─────────────────────────────────────────────

const { usePrefetch } = await import('../../hooks/usePrefetch');

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('usePrefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a prefetch handler function', () => {
    const { prefetch } = usePrefetch();
    expect(typeof prefetch).toBe('function');
  });

  it('should call the preload function on trigger', () => {
    const mockPreload = vi.fn(() => Promise.resolve());
    const { prefetch } = usePrefetch();

    prefetch(mockPreload);

    expect(mockPreload).toHaveBeenCalledTimes(1);
  });

  it('should not call the same preload function twice', () => {
    const mockPreload = vi.fn(() => Promise.resolve());
    const { prefetch } = usePrefetch();

    prefetch(mockPreload);
    prefetch(mockPreload);

    expect(mockPreload).toHaveBeenCalledTimes(1);
  });

  it('should allow different preload functions', () => {
    const mockPreload1 = vi.fn(() => Promise.resolve());
    const mockPreload2 = vi.fn(() => Promise.resolve());
    const { prefetch } = usePrefetch();

    prefetch(mockPreload1);
    prefetch(mockPreload2);

    expect(mockPreload1).toHaveBeenCalledTimes(1);
    expect(mockPreload2).toHaveBeenCalledTimes(1);
  });

  it('should handle preload errors silently', () => {
    const mockPreload = vi.fn(() => Promise.reject(new Error('chunk failed')));
    const { prefetch } = usePrefetch();

    expect(() => {
      prefetch(mockPreload);
    }).not.toThrow();

    expect(mockPreload).toHaveBeenCalledTimes(1);
  });

  it('should handle undefined preload function gracefully', () => {
    const { prefetch } = usePrefetch();

    expect(() => {
      prefetch(undefined);
    }).not.toThrow();
  });
});
