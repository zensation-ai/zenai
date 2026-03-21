/**
 * useAsyncData Hook
 *
 * A reusable hook for handling async data fetching with:
 * - AbortController for memory leak prevention
 * - Loading and error states
 * - Automatic cleanup on unmount
 * - Manual refresh capability
 *
 * @example
 * const { data, loading, error, refresh } = useAsyncData(
 *   () => axios.get('/api/data'),
 *   [dependency]
 * );
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

export interface AsyncDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export interface UseAsyncDataOptions {
  /** Skip initial fetch (default: false) */
  skip?: boolean;
  /** Initial data value */
  initialData?: unknown;
  /** Error message prefix */
  errorPrefix?: string;
}

/**
 * Extract error message from various error types
 */
function getErrorMessage(error: unknown, prefix = 'Error'): string {
  if (axios.isAxiosError(error)) {
    const responseError = error.response?.data as { error?: string } | undefined;
    return responseError?.error || error.message || `${prefix}: Request failed`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return `${prefix}: Unknown error`;
}

/**
 * Hook for fetching async data with automatic cleanup
 *
 * @param fetchFn - Function that returns a Promise with the data
 * @param deps - Dependencies array (like useEffect)
 * @param options - Optional configuration
 * @returns Object with data, loading, error, and refresh function
 */
export function useAsyncData<T>(
  fetchFn: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList = [],
  options: UseAsyncDataOptions = {}
): AsyncDataState<T> {
  const { skip = false, initialData = null, errorPrefix = 'Error' } = options;

  const [data, setData] = useState<T | null>(initialData as T | null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async (signal: AbortSignal) => {
    if (skip) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchFn(signal);
      if (!signal.aborted && mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (!axios.isCancel(err) && !signal.aborted && mountedRef.current) {
        setError(getErrorMessage(err, errorPrefix));
      }
    } finally {
      if (!signal.aborted && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchFn, skip, errorPrefix]);

  useEffect(() => {
    mountedRef.current = true;

    // Create new AbortController
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    fetchData(signal);

    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
    // Deps provided by caller — this is a generic hook pattern where deps are passed in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(() => {
    // Abort previous request if any
    abortControllerRef.current?.abort();

    // Create new AbortController for refresh
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    fetchData(signal);
  }, [fetchData]);

  return { data, loading, error, refresh };
}

/**
 * Hook for fetching data from an API endpoint
 * Convenience wrapper around useAsyncData for simple GET requests
 *
 * @param url - API endpoint URL
 * @param deps - Dependencies array
 * @param options - Optional configuration
 */
export function useApiData<T>(
  url: string,
  deps: React.DependencyList = [],
  options: UseAsyncDataOptions = {}
): AsyncDataState<T> {
  return useAsyncData<T>(
    async (signal) => {
      const response = await axios.get<T>(url, { signal });
      return response.data;
    },
    [url, ...deps],
    options
  );
}

/**
 * Hook for multiple parallel API calls
 *
 * @param fetchFns - Array of fetch functions
 * @param deps - Dependencies array
 */
export function useParallelAsyncData<T extends unknown[]>(
  fetchFns: { [K in keyof T]: (signal: AbortSignal) => Promise<T[K]> },
  deps: React.DependencyList = []
): {
  data: { [K in keyof T]: T[K] | null };
  loading: boolean;
  errors: (string | null)[];
  refresh: () => void;
} {
  const [data, setData] = useState<{ [K in keyof T]: T[K] | null }>(
    fetchFns.map(() => null) as { [K in keyof T]: T[K] | null }
  );
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<(string | null)[]>(fetchFns.map(() => null));
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAllData = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setErrors(fetchFns.map(() => null));

    const results = await Promise.allSettled(
      fetchFns.map((fn) => fn(signal))
    );

    if (!signal.aborted) {
      const newData = results.map((result) =>
        result.status === 'fulfilled' ? result.value : null
      ) as { [K in keyof T]: T[K] | null };

      const newErrors = results.map((result) =>
        result.status === 'rejected' ? getErrorMessage(result.reason) : null
      );

      setData(newData);
      setErrors(newErrors);
      setLoading(false);
    }
  }, [fetchFns]);

  useEffect(() => {
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    fetchAllData(signal);

    return () => {
      abortControllerRef.current?.abort();
    };
    // Deps provided by caller — this is a generic hook pattern where deps are passed in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    fetchAllData(abortControllerRef.current.signal);
  }, [fetchAllData]);

  return { data, loading, errors, refresh };
}

export default useAsyncData;
