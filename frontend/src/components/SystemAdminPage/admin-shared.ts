/**
 * Shared types, helpers, and styles for SystemAdminPage tabs.
 * Extracted from SystemAdminPage.tsx (Phase 120).
 */

import React from 'react';
import { getApiBaseUrl, getApiFetchHeaders } from '../../utils/apiConfig';

// ==========================================
// Types
// ==========================================

export interface HealthData {
  status: string;
  uptime?: number;
  queues?: Record<string, unknown>;
  tracing?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MetricSnapshot {
  name: string;
  value: number;
  type: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  [key: string]: unknown;
}

export interface AuditLogEntry {
  id: string;
  event_type: string;
  user_id?: string;
  severity?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
  [key: string]: unknown;
}

export interface SecurityAlert {
  id: string;
  event_type: string;
  severity: string;
  description?: string;
  created_at: string;
  [key: string]: unknown;
}

export interface RateLimitStats {
  tier: string;
  hits: number;
  blocked: number;
  [key: string]: unknown;
}

export interface SleepLog {
  id: string;
  stage: string;
  status: string;
  items_processed?: number;
  duration_ms?: number;
  details?: Record<string, unknown>;
  created_at: string;
  [key: string]: unknown;
}

export interface SleepStats {
  total_runs?: number;
  last_run?: string;
  stages?: Record<string, unknown>;
  [key: string]: unknown;
}

// ==========================================
// Helpers
// ==========================================

export async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...getApiFetchHeaders('application/json'),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatUptime(seconds: number | undefined): string {
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export const SEVERITY_COLORS: Record<string, string> = {
  low: '#4ade80',
  medium: '#fbbf24',
  high: '#f97316',
  critical: '#ef4444',
  info: '#60a5fa',
  warning: '#fbbf24',
  error: '#ef4444',
};

export const styles = {
  section: {
    marginBottom: '24px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '12px',
    color: 'var(--text-primary, #e2e8f0)',
  } as React.CSSProperties,
  card: {
    background: 'var(--bg-secondary, rgba(30, 41, 59, 0.8))',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.1))',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  } as React.CSSProperties,
  statCard: {
    background: 'var(--bg-secondary, rgba(30, 41, 59, 0.8))',
    borderRadius: '10px',
    padding: '16px',
    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.1))',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--accent-primary, #818cf8)',
  } as React.CSSProperties,
  statLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary, #94a3b8)',
    marginTop: '4px',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  } as React.CSSProperties,
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
    color: 'var(--text-secondary, #94a3b8)',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-color, rgba(148, 163, 184, 0.05))',
    color: 'var(--text-primary, #e2e8f0)',
  } as React.CSSProperties,
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 600,
    background: `${color}20`,
    color: color,
  } as React.CSSProperties),
  button: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
    background: 'var(--bg-secondary, rgba(30, 41, 59, 0.8))',
    color: 'var(--text-primary, #e2e8f0)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  } as React.CSSProperties,
  buttonPrimary: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--accent-primary, #818cf8)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  } as React.CSSProperties,
  errorBox: {
    padding: '12px 16px',
    borderRadius: '8px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#fca5a5',
    fontSize: '13px',
    marginBottom: '12px',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '32px',
    color: 'var(--text-secondary, #94a3b8)',
    fontSize: '14px',
  } as React.CSSProperties,
  filterBar: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  } as React.CSSProperties,
  input: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
    background: 'var(--bg-primary, rgba(15, 23, 42, 0.8))',
    color: 'var(--text-primary, #e2e8f0)',
    fontSize: '13px',
    minWidth: '140px',
  } as React.CSSProperties,
  select: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
    background: 'var(--bg-primary, rgba(15, 23, 42, 0.8))',
    color: 'var(--text-primary, #e2e8f0)',
    fontSize: '13px',
  } as React.CSSProperties,
};
