/**
 * useAnnounce - Screen Reader Announcement Hook
 *
 * Provides a way to announce dynamic content changes to screen readers
 * using an ARIA live region. Supports polite and assertive announcements.
 *
 * Usage:
 *   const announce = useAnnounce();
 *   announce('5 neue Ergebnisse geladen'); // polite
 *   announce('Fehler beim Speichern', 'assertive'); // assertive
 *
 * The live region element is created once and shared across all callers.
 */

import { useCallback, useEffect, useRef } from 'react';

let liveRegion: HTMLDivElement | null = null;
let assertiveRegion: HTMLDivElement | null = null;

function getOrCreateRegion(politeness: 'polite' | 'assertive'): HTMLDivElement {
  const isPolite = politeness === 'polite';
  const existing = isPolite ? liveRegion : assertiveRegion;
  if (existing && document.body.contains(existing)) return existing;

  const el = document.createElement('div');
  el.setAttribute('aria-live', politeness);
  el.setAttribute('aria-atomic', 'true');
  el.setAttribute('role', 'status');
  el.className = 'visually-hidden';
  el.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
  document.body.appendChild(el);

  if (isPolite) {
    liveRegion = el;
  } else {
    assertiveRegion = el;
  }
  return el;
}

export function useAnnounce() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const announce = useCallback((message: string, politeness: 'polite' | 'assertive' = 'polite') => {
    const region = getOrCreateRegion(politeness);
    // Clear first, then set after a tick — ensures screen readers re-read
    region.textContent = '';
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      region.textContent = message;
    }, 100);
  }, []);

  return announce;
}
