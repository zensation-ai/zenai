/**
 * AI Activity Event Bus
 *
 * Lightweight pub/sub system so any component can report AI activity
 * without prop-drilling through the component tree.
 *
 * Usage:
 *   // Emit from any component:
 *   emitAIActivity({ source: 'documents', type: 'start', message: 'Dokument wird analysiert...' });
 *
 *   // Listen in App.tsx or layout components:
 *   useAIActivityListener((event) => { ... });
 */

import { useEffect, useRef } from 'react';

export interface AIActivityEvent {
  source: string;
  type: 'start' | 'progress' | 'complete' | 'error';
  message?: string;
  progress?: number; // 0-100
}

type AIActivityListener = (event: AIActivityEvent) => void;

const listeners = new Set<AIActivityListener>();

/**
 * Emit an AI activity event from any component.
 * Does not require React context - can be called from plain functions too.
 */
export function emitAIActivity(event: AIActivityEvent): void {
  listeners.forEach((listener) => listener(event));
}

/**
 * React hook to listen for AI activity events.
 * Automatically cleans up on unmount.
 */
export function useAIActivityListener(callback: AIActivityListener): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler: AIActivityListener = (event) => callbackRef.current(event);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);
}
