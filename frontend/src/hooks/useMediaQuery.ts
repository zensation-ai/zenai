import { useState, useEffect } from 'react';

export function useMediaQuery(maxWidth: number): boolean {
  const [matches, setMatches] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= maxWidth : false
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${maxWidth}px)`);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [maxWidth]);

  return matches;
}
