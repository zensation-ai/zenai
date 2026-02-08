/**
 * usePageHistory - Manages recently visited and favorited pages
 *
 * Persists to localStorage for cross-session state.
 * Uses same 'zenai-recent-pages' key as CommandPalette for compatibility.
 */

import { useState, useCallback } from 'react';
import type { Page } from '../types';
import { safeLocalStorage } from '../utils/storage';

const RECENT_PAGES_KEY = 'zenai-recent-pages';
const FAVORITE_PAGES_KEY = 'zenai-favorite-pages';
const MAX_RECENT = 5;

export interface UsePageHistoryReturn {
  recentPages: Page[];
  favoritePages: Page[];
  addRecentPage: (page: Page) => void;
  toggleFavorite: (page: Page) => void;
  isFavorited: (page: Page) => boolean;
}

function loadPages(key: string): Page[] {
  try {
    const stored = safeLocalStorage('get', key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function savePages(key: string, pages: Page[]): void {
  safeLocalStorage('set', key, JSON.stringify(pages));
}

export function usePageHistory(): UsePageHistoryReturn {
  const [recentPages, setRecentPages] = useState<Page[]>(() => loadPages(RECENT_PAGES_KEY));
  const [favoritePages, setFavoritePages] = useState<Page[]>(() => loadPages(FAVORITE_PAGES_KEY));

  const addRecentPage = useCallback((page: Page) => {
    if (page === 'home') return;
    setRecentPages(prev => {
      const filtered = prev.filter(p => p !== page);
      const updated = [page, ...filtered].slice(0, MAX_RECENT);
      savePages(RECENT_PAGES_KEY, updated);
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback((page: Page) => {
    setFavoritePages(prev => {
      const exists = prev.includes(page);
      const updated = exists ? prev.filter(p => p !== page) : [...prev, page];
      savePages(FAVORITE_PAGES_KEY, updated);
      return updated;
    });
  }, []);

  const isFavorited = useCallback((page: Page) => {
    return favoritePages.includes(page);
  }, [favoritePages]);

  return { recentPages, favoritePages, addRecentPage, toggleFavorite, isFavorited };
}
