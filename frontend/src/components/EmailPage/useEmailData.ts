/**
 * useEmailData - Data hook for email operations
 *
 * Uses the global axios instance (with baseURL and interceptors)
 * consistent with the rest of the application.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import type { Email, EmailStats, EmailAccount, EmailTab, EmailFilters, ReplySuggestion, ImapTestResult, ImapSyncResult } from './types';
import { getErrorMessage } from '../../utils/errors';
import type { AIContext } from '../ContextSwitcher';

export function useEmailData(context: AIContext) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [thread, setThread] = useState<Email[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchEmails = useCallback(async (folder: EmailTab | string = 'inbox', filters?: EmailFilters) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { folder };
      if (filters?.search) params.search = filters.search;
      if (filters?.category) params.category = filters.category;
      if (filters?.account_id) params.account_id = filters.account_id;

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

  const fetchEmail = useCallback(async (id: string): Promise<Email | null> => {
    try {
      const res = await axios.get(`/api/${context}/emails/${id}`);
      const email = res.data?.data ?? null;
      setSelectedEmail(email);
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
      // Stats are non-critical
    }
  }, [context]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await axios.get(`/api/${context}/emails/accounts`);
      setAccounts(res.data?.data ?? []);
    } catch {
      // Accounts fetch failure is non-critical
    }
  }, [context]);

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

  const replyToEmail = useCallback(async (id: string, body: { body_html?: string; body_text?: string; account_id?: string }): Promise<Email | null> => {
    try {
      const res = await axios.post(`/api/${context}/emails/${id}/reply`, body);
      return res.data?.data ?? null;
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Antworten'));
      return null;
    }
  }, [context]);

  const forwardEmail = useCallback(async (id: string, to: Array<{ email: string; name?: string }>, body?: { body_html?: string; body_text?: string }): Promise<Email | null> => {
    try {
      const res = await axios.post(`/api/${context}/emails/${id}/forward`, { to_addresses: to, ...body });
      return res.data?.data ?? null;
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Weiterleiten'));
      return null;
    }
  }, [context]);

  const updateStatus = useCallback(async (id: string, status: string) => {
    try {
      await axios.patch(`/api/${context}/emails/${id}/status`, { status });
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Aktualisieren'));
    }
  }, [context]);

  const toggleStar = useCallback(async (id: string) => {
    try {
      const res = await axios.patch(`/api/${context}/emails/${id}/star`, {});
      const starred = res.data?.data?.is_starred ?? false;
      setEmails(prev => prev.map(e => e.id === id ? { ...e, is_starred: starred } : e));
      if (selectedEmail?.id === id) {
        setSelectedEmail(prev => prev ? { ...prev, is_starred: starred } : null);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Markieren'));
    }
  }, [context, selectedEmail?.id]);

  const deleteEmail = useCallback(async (id: string) => {
    try {
      await axios.delete(`/api/${context}/emails/${id}`);
      setEmails(prev => prev.filter(e => e.id !== id));
      if (selectedEmail?.id === id) setSelectedEmail(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Löschen'));
    }
  }, [context, selectedEmail?.id]);

  const batchUpdate = useCallback(async (ids: string[], status: string) => {
    try {
      await axios.post(`/api/${context}/emails/batch`, { ids, status });
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler bei Massenoperation'));
    }
  }, [context]);

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
      return res.data?.data ?? null;
    } catch {
      return null;
    }
  }, [context]);

  // IMAP functions (Phase 39)
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

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return {
    emails, selectedEmail, thread, stats, accounts, loading, error, total,
    setSelectedEmail,
    fetchEmails, fetchEmail, fetchThread, fetchStats, fetchAccounts,
    sendEmail, replyToEmail, forwardEmail,
    updateStatus, toggleStar, deleteEmail, batchUpdate,
    getReplySuggestions, triggerAIProcess,
    testImapConnection, createImapAccount, triggerImapSync,
  };
}
