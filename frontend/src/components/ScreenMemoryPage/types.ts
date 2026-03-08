/**
 * Screen Memory Types - Phase 5
 */

export interface ScreenCapture {
  id: string;
  timestamp: string;
  app_name: string | null;
  window_title: string | null;
  url: string | null;
  ocr_text: string | null;
  screenshot_path: string | null;
  duration_seconds: number | null;
  is_sensitive: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ScreenMemoryFilters {
  search?: string;
  app_name?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface ScreenMemoryStats {
  total_captures: number;
  total_apps: number;
  total_duration_hours: number;
  captures_today: number;
  top_apps: Array<{ app_name: string; count: number }>;
}

export interface CaptureSettings {
  isEnabled: boolean;
  intervalSeconds: number;
  retentionDays: number;
  excludedApps: string[];
}
