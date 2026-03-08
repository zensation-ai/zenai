/**
 * Browser Page Types - Phase 2
 */

export type BrowserTab = 'browse' | 'history' | 'bookmarks';

export interface BrowsingHistoryEntry {
  id: string;
  url: string;
  title: string | null;
  domain: string;
  visit_time: string;
  duration_seconds: number | null;
  content_summary: string | null;
  keywords: string[];
  category: string | null;
  is_bookmarked: boolean;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  folder: string;
  tags: string[];
  ai_summary: string | null;
  favicon_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookmarkFolder {
  folder: string;
  count: number;
}

export interface DomainStats {
  domain: string;
  visit_count: number;
  total_duration: number;
  last_visit: string;
}

export interface PageAnalysis {
  summary: string;
  keywords: string[];
  category: string;
  language: string;
  key_points: string[];
}

export interface BrowserTabState {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  favicon?: string;
}
