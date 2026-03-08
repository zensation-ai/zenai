/**
 * Calendar Accounts Hook - Phase 40
 *
 * Manages iCloud/CalDAV calendar account connections.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { AIContext } from '../ContextSwitcher';

export interface CalendarAccount {
  id: string;
  provider: string;
  username: string;
  has_password: boolean;
  display_name: string | null;
  caldav_url: string;
  calendars: CalendarAccountCalendar[];
  is_enabled: boolean;
  sync_interval_minutes: number;
  last_sync_at: string | null;
  last_sync_error: string | null;
  context: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarAccountCalendar {
  url: string;
  displayName: string;
  enabled: boolean;
  color?: string;
}

export function useCalendarAccounts(context: AIContext) {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/${context}/calendar/accounts`);
      if (res.data.success) {
        setAccounts(res.data.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Accounts');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const createAccount = useCallback(async (data: {
    provider: string;
    username: string;
    password: string;
    display_name?: string;
    caldav_url?: string;
  }): Promise<CalendarAccount | null> => {
    try {
      const res = await axios.post(`/api/${context}/calendar/accounts`, data);
      if (res.data.success) {
        const newAccount = res.data.data as CalendarAccount;
        setAccounts(prev => [...prev, newAccount]);
        return newAccount;
      }
      return null;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr?.response?.data?.error || 'Verbindung fehlgeschlagen');
      return null;
    }
  }, [context]);

  const deleteAccount = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await axios.delete(`/api/${context}/calendar/accounts/${id}`);
      if (res.data.success) {
        setAccounts(prev => prev.filter(a => a.id !== id));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [context]);

  const syncAccount = useCallback(async (id: string) => {
    try {
      const res = await axios.post(`/api/${context}/calendar/accounts/${id}/sync`);
      if (res.data.success) {
        await fetchAccounts(); // Refresh to get updated sync status
        return res.data.data;
      }
    } catch {
      // fail silently
    }
    return null;
  }, [context, fetchAccounts]);

  const updateAccount = useCallback(async (id: string, updates: Partial<CalendarAccount>) => {
    try {
      const res = await axios.put(`/api/${context}/calendar/accounts/${id}`, updates);
      if (res.data.success) {
        setAccounts(prev => prev.map(a => a.id === id ? res.data.data : a));
        return res.data.data;
      }
    } catch {
      // fail silently
    }
    return null;
  }, [context]);

  return {
    accounts,
    loading,
    error,
    refetch: fetchAccounts,
    createAccount,
    deleteAccount,
    syncAccount,
    updateAccount,
  };
}
