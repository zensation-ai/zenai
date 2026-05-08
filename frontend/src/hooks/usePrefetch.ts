import { useCallback, useRef } from 'react';

type PreloadFn = () => Promise<unknown>;

/**
 * React hook for hover-based route prefetching.
 * Uses a ref-stable Set for deduplication so the same
 * chunk import is never triggered twice.
 */
export function usePrefetch() {
  const loadedRef = useRef<Set<PreloadFn>>(new Set());

  const prefetch = useCallback((preloadFn: PreloadFn | undefined) => {
    if (!preloadFn || loadedRef.current.has(preloadFn)) return;
    loadedRef.current.add(preloadFn);
    preloadFn().catch(() => {
      // Silently ignore — chunk will load on navigation anyway
    });
  }, []);

  return { prefetch };
}
