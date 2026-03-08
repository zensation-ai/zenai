/**
 * useBrowserData - Data hook for Browser page
 *
 * Manages browsing history, bookmarks, and domain stats.
 */

import { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import type { AIContext } from '../ContextSwitcher';
import type { BrowsingHistoryEntry, Bookmark, BookmarkFolder, DomainStats } from './types';

export function useBrowserData(context: AIContext) {
  const [history, setHistory] = useState<BrowsingHistoryEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksTotal, setBookmarksTotal] = useState(0);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [domainStats, setDomainStats] = useState<DomainStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchHistory = useCallback(async (filters?: {
    search?: string;
    domain?: string;
    category?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
    offset?: number;
  }) => {
    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters?.search) params.set('search', filters.search);
      if (filters?.domain) params.set('domain', filters.domain);
      if (filters?.category) params.set('category', filters.category);
      if (filters?.from_date) params.set('from_date', filters.from_date);
      if (filters?.to_date) params.set('to_date', filters.to_date);
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.offset) params.set('offset', String(filters.offset));

      const res = await axios.get(`/api/${context}/browser/history?${params}`, {
        signal: abortRef.current.signal,
      });

      if (res.data.success) {
        setHistory(res.data.data);
        setHistoryTotal(res.data.total);
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      setError('Verlauf konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [context]);

  const fetchBookmarks = useCallback(async (filters?: {
    folder?: string;
    tag?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters?.folder) params.set('folder', filters.folder);
      if (filters?.tag) params.set('tag', filters.tag);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.offset) params.set('offset', String(filters.offset));

      const res = await axios.get(`/api/${context}/browser/bookmarks?${params}`);

      if (res.data.success) {
        setBookmarks(res.data.data);
        setBookmarksTotal(res.data.total);
      }
    } catch {
      setError('Lesezeichen konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [context]);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await axios.get(`/api/${context}/browser/bookmarks/folders`);
      if (res.data.success) {
        setFolders(res.data.data);
      }
    } catch {
      // silent
    }
  }, [context]);

  const fetchDomainStats = useCallback(async () => {
    try {
      const res = await axios.get(`/api/${context}/browser/history/domains`);
      if (res.data.success) {
        setDomainStats(res.data.data);
      }
    } catch {
      // silent
    }
  }, [context]);

  const addBookmark = useCallback(async (data: {
    url: string;
    title?: string;
    description?: string;
    folder?: string;
    tags?: string[];
  }): Promise<Bookmark | null> => {
    try {
      const res = await axios.post(`/api/${context}/browser/bookmarks`, data);
      if (res.data.success) {
        setBookmarks(prev => [res.data.data, ...prev]);
        setBookmarksTotal(prev => prev + 1);
        return res.data.data;
      }
      return null;
    } catch {
      setError('Lesezeichen konnte nicht erstellt werden');
      return null;
    }
  }, [context]);

  const removeBookmark = useCallback(async (id: string) => {
    try {
      const res = await axios.delete(`/api/${context}/browser/bookmarks/${id}`);
      if (res.data.success) {
        setBookmarks(prev => prev.filter(b => b.id !== id));
        setBookmarksTotal(prev => prev - 1);
      }
    } catch {
      setError('Lesezeichen konnte nicht geloescht werden');
    }
  }, [context]);

  const deleteHistoryEntry = useCallback(async (id: string) => {
    try {
      const res = await axios.delete(`/api/${context}/browser/history/${id}`);
      if (res.data.success) {
        setHistory(prev => prev.filter(h => h.id !== id));
        setHistoryTotal(prev => prev - 1);
      }
    } catch {
      setError('Verlaufseintrag konnte nicht geloescht werden');
    }
  }, [context]);

  const clearAllHistory = useCallback(async () => {
    try {
      await axios.delete(`/api/${context}/browser/history`);
      setHistory([]);
      setHistoryTotal(0);
    } catch {
      setError('Verlauf konnte nicht geloescht werden');
    }
  }, [context]);

  return {
    history, historyTotal,
    bookmarks, bookmarksTotal,
    folders, domainStats,
    loading, error,
    fetchHistory, fetchBookmarks, fetchFolders, fetchDomainStats,
    addBookmark, removeBookmark, deleteHistoryEntry, clearAllHistory,
  };
}
