import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to track if a component is currently mounted
 * Useful for preventing state updates after unmount in async operations
 *
 * @returns Ref object with current mount state
 *
 * @example
 * const isMounted = useIsMounted();
 *
 * useEffect(() => {
 *   fetchData().then(data => {
 *     if (isMounted.current) {
 *       setData(data);
 *     }
 *   });
 * }, []);
 */
export function useIsMounted(): React.MutableRefObject<boolean> {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return isMountedRef;
}

/**
 * Hook that returns a safe setState wrapper
 * Only calls setState if component is still mounted
 *
 * @param setState - The setState function to wrap
 * @returns Safe version of setState that checks mount status
 *
 * @example
 * const [data, setData] = useState(null);
 * const safeSetData = useSafeState(setData);
 *
 * useEffect(() => {
 *   fetchData().then(safeSetData);
 * }, []);
 */
export function useSafeState<T>(
  setState: React.Dispatch<React.SetStateAction<T>>
): (value: React.SetStateAction<T>) => void {
  const isMounted = useIsMounted();

  return useCallback(
    (value: React.SetStateAction<T>) => {
      if (isMounted.current) {
        setState(value);
      }
    },
    [isMounted, setState]
  );
}

/**
 * Hook for safe async callback execution
 * Wraps an async function to check mount status before state updates
 *
 * @param callback - Async function to make safe
 * @returns Safe version of the async function
 *
 * @example
 * const loadData = useSafeAsync(async () => {
 *   const data = await fetchData();
 *   setData(data); // Only runs if still mounted
 * });
 */
export function useSafeAsync<T extends (...args: unknown[]) => Promise<void>>(
  callback: T
): T {
  const isMounted = useIsMounted();

  return useCallback(
    (async (...args: Parameters<T>) => {
      const result = await callback(...args);
      if (!isMounted.current) {
        return; // Component unmounted, don't continue
      }
      return result;
    }) as T,
    [callback, isMounted]
  );
}
