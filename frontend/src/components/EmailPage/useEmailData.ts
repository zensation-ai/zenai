/**
 * useEmailData - Premium email data hook
 *
 * Features: auto-refresh, optimistic updates, undo support
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import type { Email, EmailStats, EmailAccount, EmailTab, EmailFilters, ReplySuggestion, ImapTestResult, ImapSyncResult, UndoAction } from './types';
import { getErrorMessage } from '../../utils/errors';
import type { AIContext } from '../ContextSwitcher';

const AUTO_REFRESH_MS = 30_000;
const UNDO_TIMEOUT_MS = 5_000;

export function useEmailData(context: AIContext) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [thread, setThread] = useState<Email[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchRef = useRef<{ folder: string; filters?: EmailFilters }>({ folder: 'inbox' });

  // ── Core fetch ────────────────────────────────────────────

  const fetchEmails = useCallback(async (folder: EmailTab | string = 'inbox', filters?: EmailFilters) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastFetchRef.current = { folder, filters };

    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { folder };
      if (filters?.search) params.search = filters.search;
      if (filters?.category) params.category = filters.category;
      if (filters?.priority) params.priority = filters.priority;
      if (filters?.account_id) params.account_id = filters.account_id;
      if (filters?.unread) params.status = 'received';

      const res = await axios.get(`/api/${context}/emails`, {
        params,
        signal: controller.signal,
      });
      setEmails(res.data?.data ?? []);
      setTotal(res.data?.total ?? 0);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(getErrorMessage(err, 'Fehler beim Laden der E-Mails'));
      }
    } finally {
      setLoading(false);
    }
  }, [context]);

  const refetchCurrent = useCallback(() => {
    const { folder, filters } = lastFetchRef.current;
    fetchEmails(folder, filters);
  }, [fetchEmails]);

  const fetchEmail = useCallback(async (id: string): Promise<Email | null> => {
    try {
      const res = await axios.get(`/api/${context}/emails/${id}`);
      const email = res.data?.data ?? null;
      setSelectedEmail(email);
      // Optimistic: mark as read in list
      if (email && email.status === 'received') {
        setEmails(prev => prev.map(e => e.id === id ? { ...e, status: 'read' as const } : e));
      }
      return email;
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Laden der E-Mail'));
      return null;
    }
  }, [context]);

  const fetchThread = useCallback(async (id: string) => {
    try {
      const res = await axios.get(`/api/${context}/emails/${id}/thread`);
      setThread(res.data?.data ?? []);
    } catch {
      setThread([]);
    }
  }, [context]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`/api/${context}/emails/stats`);
      setStats(res.data?.data ?? null);
    } catch {
      // non-critical
    }
  }, [context]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await axios.get(`/api/${context}/emails/accounts`);
      setAccounts(res.data?.data ?? []);
    } catch {
      // non-critical
    }
  }, [context]);

  // ── Send operations ───────────────────────────────────────

  const sendEmail = useCallback(async (data: {
    to_addresses: Array<{ email: string; name?: string }>;
    cc_addresses?: Array<{ email: string; name?: string }>;
    subject?: string;
    body_html?: string;
    body_text?: string;
    account_id?: string;
  }): Promise<Email | null> => {
    try {
      const res = await axios.post(`/api/${context}/emails/send`, data);
      return res.data?.data ?? null;
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Senden'));
      return null;
    }
  }, [context]);

  const replyToEmail = useCallback(async (id: string, body: {
    body_html?: string; body_text?: string; account_id?: string;
  }): Promise<Email | null> => {
    try {
      const res = await axios.post(`/api/${context}/emails/${id}/reply`, body);
      return res.data?.data ?? null;
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Antworten'));
      return null;
    }
  }, [context]);

  const forwardEmail = useCallback(async (id: string, to: Array<{ email: string; name?: string }>, body?: {
    body_html?: string; body_text?: string;
  }): Promise<Email | null> => {
    try {
      const res = await axios.post(`/api/${context}/emails/${id}/forward`, { to_addresses: to, ...body });
      return res.data?.data ?? null;
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Weiterleiten'));
      return null;
    }
  }, [context]);

  // ── Status operations with undo ───────────────────────────

  const pushUndo = useCallback((action: Omit<UndoAction, 'id' | 'timestamp'>) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const undo: UndoAction = {
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setUndoAction(undo);
    undoTimerRef.current = setTimeout(() => setUndoAction(null), UNDO_TIMEOUT_MS);
  }, []);

  const executeUndo = useCallback(async () => {
    if (!undoAction) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    try {
      await axios.patch(`/api/${context}/emails/${undoAction.emailId}/status`, {
        status: undoAction.previousStatus,
      });
      refetchCurrent();
      fetchStats();
    } catch {
      // silent fail
    }
    setUndoAction(null);
  }, [undoAction, context, refetchCurrent, fetchStats]);

  const dismissUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction(null);
  }, []);

  const updateStatus = useCallback(async (id: string, status: string) => {
    try {
      await axios.patch(`/api/${context}/emails/${id}/status`, { status });
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Aktualisieren'));
    }
  }, [context]);

  const archiveEmail = useCallback(async (id: string) => {
    const email = emails.find(e => e.id === id);
    if (!email) return;

    // Optimistic remove from list
    setEmails(prev => prev.filter(e => e.id !== id));
    if (selectedEmail?.id === id) setSelectedEmail(null);

    pushUndo({
      type: 'archive',
      emailId: id,
      previousStatus: email.status,
      label: 'E-Mail archiviert',
    });

    try {
      await axios.patch(`/api/${context}/emails/${id}/status`, { status: 'archived' });
      fetchStats();
    } catch (err) {
      // Rollback
      setEmails(prev => [...prev, email].sort((a, b) =>
        new Date(b.received_at || b.created_at).getTime() - new Date(a.received_at || a.created_at).getTime()
      ));
      setError(getErrorMessage(err, 'Fehler beim Archivieren'));
    }
  }, [context, emails, selectedEmail, pushUndo, fetchStats]);

  const deleteEmail = useCallback(async (id: string) => {
    const email = emails.find(e => e.id === id);
    if (!email) return;

    // Optimistic remove
    setEmails(prev => prev.filter(e => e.id !== id));
    if (selectedEmail?.id === id) setSelectedEmail(null);

    pushUndo({
      type: 'delete',
      emailId: id,
      previousStatus: email.status,
      label: 'E-Mail geloescht',
    });

    try {
      await axios.delete(`/api/${context}/emails/${id}`);
      fetchStats();
    } catch (err) {
      setEmails(prev => [...prev, email].sort((a, b) =>
        new Date(b.received_at || b.created_at).getTime() - new Date(a.received_at || a.created_at).getTime()
      ));
      setError(getErrorMessage(err, 'Fehler beim Loeschen'));
    }
  }, [context, emails, selectedEmail, pushUndo, fetchStats]);

  const toggleStar = useCallback(async (id: string) => {
    // Optimistic update
    setEmails(prev => prev.map(e => e.id === id ? { ...e, is_starred: !e.is_starred } : e));
    if (selectedEmail?.id === id) {
      setSelectedEmail(prev => prev ? { ...prev, is_starred: !prev.is_starred } : null);
    }

    try {
      await axios.patch(`/api/${context}/emails/${id}/star`, {});
    } catch (err) {
      // Rollback
      setEmails(prev => prev.map(e => e.id === id ? { ...e, is_starred: !e.is_starred } : e));
      setError(getErrorMessage(err, 'Fehler beim Markieren'));
    }
  }, [context, selectedEmail?.id]);

  const batchUpdate = useCallback(async (ids: string[], status: string) => {
    // Optimistic remove from list for archive/trash
    if (status === 'archived' || status === 'trash') {
      setEmails(prev => prev.filter(e => !ids.includes(e.id)));
    }

    try {
      await axios.post(`/api/${context}/emails/batch`, { ids, status });
      fetchStats();
      if (status === 'read') {
        setEmails(prev => prev.map(e => ids.includes(e.id) ? { ...e, status: 'read' as const } : e));
      }
    } catch (err) {
      refetchCurrent();
      setError(getErrorMessage(err, 'Fehler bei Massenoperation'));
    }
  }, [context, fetchStats, refetchCurrent]);

  // ── AI operations ─────────────────────────────────────────

  const getReplySuggestions = useCallback(async (id: string): Promise<ReplySuggestion[]> => {
    try {
      const res = await axios.get(`/api/${context}/emails/${id}/ai/reply-suggestions`);
      return res.data?.data ?? [];
    } catch {
      return [];
    }
  }, [context]);

  const triggerAIProcess = useCallback(async (id: string): Promise<Email | null> => {
    try {
      const res = await axios.post(`/api/${context}/emails/${id}/ai/process`, {});
      const updated = res.data?.data ?? null;
      if (updated) {
        setSelectedEmail(updated);
        setEmails(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
      }
      return updated;
    } catch {
      return null;
    }
  }, [context]);

  // ── Load more (pagination) ─────────────────────────────────

  const loadMore = useCallback(async (folder: EmailTab | string = 'inbox', filters?: EmailFilters) => {
    try {
      const params: Record<string, string | number> = { folder, offset: emails.length, limit: 50 };
      if (filters?.search) params.search = filters.search;
      if (filters?.category) params.category = filters.category;
      if (filters?.unread) params.status = 'received';

      const res = await axios.get(`/api/${context}/emails`, { params });
      const moreEmails = res.data?.data ?? [];
      setEmails(prev => [...prev, ...moreEmails]);
      setTotal(res.data?.total ?? total);
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Nachladen'));
    }
  }, [context, emails.length, total]);

  // ── AI Compose & Improve ──────────────────────────────────

  const aiCompose = useCallback(async (data: {
    prompt: string;
    tone?: 'formell' | 'freundlich' | 'kurz' | 'neutral';
    reply_to?: { from: string; subject: string; body: string };
  }): Promise<{ subject: string; body_text: string; body_html: string } | null> => {
    try {
      const res = await axios.post(`/api/${context}/emails/ai/compose`, data);
      return res.data?.data ?? null;
    } catch (err) {
      setError(getErrorMessage(err, 'KI-Entwurf fehlgeschlagen'));
      return null;
    }
  }, [context]);

  const aiImprove = useCallback(async (text: string, instruction: string): Promise<string | null> => {
    try {
      const res = await axios.post(`/api/${context}/emails/ai/improve`, { text, instruction });
      return res.data?.data?.text ?? null;
    } catch {
      return null;
    }
  }, [context]);

  const getThreadSummary = useCallback(async (emailId: string): Promise<string | null> => {
    try {
      const res = await axios.get(`/api/${context}/emails/${emailId}/thread/ai/summary`);
      return res.data?.data?.summary ?? null;
    } catch {
      return null;
    }
  }, [context]);

  // ── IMAP ──────────────────────────────────────────────────

  const testImapConnection = useCallback(async (data: {
    host: string; port: number; user: string; password: string; tls: boolean;
  }): Promise<ImapTestResult> => {
    const res = await axios.post(`/api/${context}/emails/accounts/imap/test`, data);
    return res.data?.data;
  }, [context]);

  const createImapAccount = useCallback(async (data: {
    email_address: string; display_name?: string;
    imap_host: string; imap_port: number; imap_user: string; imap_password: string; imap_tls: boolean;
  }): Promise<void> => {
    await axios.post(`/api/${context}/emails/accounts/imap`, data);
    await fetchAccounts();
  }, [context, fetchAccounts]);

  const triggerImapSync = useCallback(async (accountId: string): Promise<ImapSyncResult> => {
    const res = await axios.post(`/api/${context}/emails/accounts/${accountId}/sync`, {});
    return res.data?.data;
  }, [context]);

  // ── Auto-refresh ──────────────────────────────────────────

  const startAutoRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => {
      fetchStats();
      // Silent refresh - don't show loading state
      const { folder, filters } = lastFetchRef.current;
      const controller = new AbortController();
      axios.get(`/api/${context}/emails`, {
        params: { folder, ...filters },
        signal: controller.signal,
      }).then(res => {
        const newEmails = res.data?.data ?? [];
        const newTotal = res.data?.total ?? 0;
        setEmails(newEmails);
        setTotal(newTotal);
      }).catch(() => { /* silent */ });
    }, AUTO_REFRESH_MS);
  }, [context, fetchStats]);

  const stopAutoRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // ── Cleanup ───────────────────────────────────────────────

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  return {
    // State
    emails, selectedEmail, thread, stats, accounts, loading, error, total, undoAction,
    // Setters
    setSelectedEmail, setError,
    // Fetches
    fetchEmails, fetchEmail, fetchThread, fetchStats, fetchAccounts, refetchCurrent,
    // Send
    sendEmail, replyToEmail, forwardEmail,
    // Status (with undo)
    updateStatus, archiveEmail, deleteEmail, toggleStar, batchUpdate,
    // Undo
    executeUndo, dismissUndo,
    // AI
    getReplySuggestions, triggerAIProcess, aiCompose, aiImprove, getThreadSummary,
    // Pagination
    loadMore,
    // IMAP
    testImapConnection, createImapAccount, triggerImapSync,
    // Auto-refresh
    startAutoRefresh, stopAutoRefresh,
  };
}
