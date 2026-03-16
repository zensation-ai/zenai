/**
 * Phase 85: Responsive Breakpoint Hook
 *
 * Uses matchMedia listeners (not resize events) for efficient,
 * GPU-friendly breakpoint detection. Returns the current breakpoint
 * and boolean helpers for responsive layout decisions.
 */

import { useState, useEffect, useMemo } from 'react';

export const BREAKPOINTS = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

export interface UseBreakpointReturn {
  /** Current named breakpoint */
  breakpoint: Breakpoint;
  /** < 768px */
  isMobile: boolean;
  /** 768px - 1023px */
  isTablet: boolean;
  /** >= 1024px */
  isDesktop: boolean;
  /** >= 1280px */
  isWide: boolean;
}

/**
 * Determine the current breakpoint name from window width.
 */
function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  return 'sm';
}

export function useBreakpoint(): UseBreakpointReturn {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 1024;
    return window.innerWidth;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Create media query lists for each breakpoint
    const queries: Array<{ mql: MediaQueryList; handler: (e: MediaQueryListEvent) => void }> = [];

    const breakpointValues = Object.values(BREAKPOINTS);

    for (const bp of breakpointValues) {
      const mql = window.matchMedia(`(min-width: ${bp}px)`);
      const handler = () => {
        // Re-read actual width on any breakpoint change
        setWidth(window.innerWidth);
      };

      mql.addEventListener('change', handler);
      queries.push({ mql, handler });
    }

    // Set initial value
    setWidth(window.innerWidth);

    return () => {
      for (const { mql, handler } of queries) {
        mql.removeEventListener('change', handler);
      }
    };
  }, []);

  return useMemo(() => {
    const breakpoint = getBreakpoint(width);
    return {
      breakpoint,
      isMobile: width < BREAKPOINTS.md,
      isTablet: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
      isDesktop: width >= BREAKPOINTS.lg,
      isWide: width >= BREAKPOINTS.xl,
    };
  }, [width]);
}
