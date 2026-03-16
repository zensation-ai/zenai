/**
 * useUnifiedAssistant Hook (Phase 91)
 *
 * Manages the unified assistant overlay state, keyboard shortcuts,
 * query processing, and interaction history.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

// ===========================================
// Types
// ===========================================

export type IntentType = 'navigate' | 'create' | 'search' | 'action' | 'question';

export interface AssistantAction {
  type: IntentType;
  target?: string;
  params?: Record<string, unknown>;
  label: string;
  description?: string;
  page?: string;
  icon?: string;
}

export interface AssistantResult {
  intent: IntentType;
  confidence: number;
  actions: AssistantAction[];
  responseTimeMs?: number;
}

export interface ContextSuggestion {
  label: string;
  query: string;
  icon: string;
  category: string;
}

export interface UseUnifiedAssistantOptions {
  context: string;
  currentPage: string;
}

export interface UseUnifiedAssistantReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  query: string;
  setQuery: (q: string) => void;
  results: AssistantResult | null;
  suggestions: ContextSuggestion[];
  isLoading: boolean;
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  executeAction: (action: AssistantAction) => void;
  submitQuery: () => void;
}

// ===========================================
// API Helpers
// ===========================================

async function fetchAssistantQuery(
  context: string,
  query: string,
  pageContext: string
): Promise<AssistantResult | null> {
  try {
    const res = await fetch(`${API_URL}/api/${context}/assistant/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({ query, pageContext }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data ?? null;
  } catch {
    return null;
  }
}

async function fetchSuggestions(
  context: string,
  page: string
): Promise<ContextSuggestion[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/${context}/assistant/suggestions?page=${encodeURIComponent(page)}`,
      {
        headers: { 'X-API-Key': API_KEY },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ===========================================
// Hook
// ===========================================

export function useUnifiedAssistant({
  context,
  currentPage,
}: UseUnifiedAssistantOptions): UseUnifiedAssistantReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssistantResult | null>(null);
  const [suggestions, setSuggestions] = useState<ContextSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPageRef = useRef(currentPage);

  // Keyboard shortcut: Cmd+Shift+Space
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if inside input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow only if Cmd+Shift+Space
        if (!(e.metaKey && e.shiftKey && e.code === 'Space')) {
          return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load suggestions when page changes
  useEffect(() => {
    if (lastPageRef.current !== currentPage) {
      lastPageRef.current = currentPage;
      fetchSuggestions(context, currentPage).then(setSuggestions);
    }
  }, [context, currentPage]);

  // Load suggestions on first open
  useEffect(() => {
    if (isOpen && suggestions.length === 0) {
      fetchSuggestions(context, currentPage).then(setSuggestions);
    }
  }, [isOpen, context, currentPage, suggestions.length]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults(null);
      setSelectedIndex(0);
      setIsLoading(false);
    }
  }, [isOpen]);

  // Debounced query processing
  useEffect(() => {
    if (!isOpen || !query.trim() || query.trim().length < 2) {
      setResults(null);
      setSelectedIndex(0);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      const result = await fetchAssistantQuery(context, query.trim(), currentPage);
      setResults(result);
      setSelectedIndex(0);
      setIsLoading(false);
    }, 200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, isOpen, context, currentPage]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  const submitQuery = useCallback(async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    const result = await fetchAssistantQuery(context, query.trim(), currentPage);
    setResults(result);
    setSelectedIndex(0);
    setIsLoading(false);
  }, [query, context, currentPage]);

  const executeAction = useCallback((_action: AssistantAction) => {
    // The component handles the actual navigation/action execution
    // This is primarily for tracking
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    query,
    setQuery,
    results,
    suggestions,
    isLoading,
    selectedIndex,
    setSelectedIndex,
    executeAction,
    submitQuery,
  };
}
