/**
 * useEmailData - Data hook for email operations
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import type { Email, EmailStats, EmailAccount, EmailTab, EmailFilters, ReplySuggestion } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
  };
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error || err.response?.data?.message || err.message || fallback;
  }
  return (err as Error).message || fallback;
}

export function useEmailData(context: string) {
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

      const res = await axios.get(`${API_URL}/api/${context}/emails`, {
        headers: getHeaders(),
        params,
        signal: controller.signal,
      });
      setEmails(res.data.data || []);
      setTotal(res.data.total || 0);
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
      const res = await axios.get(`${API_URL}/api/${context}/emails/${id}`, { headers: getHeaders() });
      const email = res.data.data;
      setSelectedEmail(email);
      return email;
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Laden der E-Mail'));
      return null;
    }
  }, [context]);

  const fetchThread = useCallback(async (id: string) => {
    try {
      const res = await axios.get(`${API_URL}/api/${context}/emails/${id}/thread`, { headers: getHeaders() });
      setThread(res.data.data || []);
    } catch {
      setThread([]);
    }
  }, [context]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/${context}/emails/stats`, { headers: getHeaders() });
      setStats(res.data.data);
    } catch {
      // Stats are non-critical
    }
  }, [context]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/${context}/emails/accounts`, { headers: getHeaders() });
      setAccounts(res.data.data || []);
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
      const res = await axios.post(`${API_URL}/api/${context}/emails/send`, data, { headers: getHeaders() });
      return res.data.data;
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Senden'));
      return null;
    }
  }, [context]);

  const replyToEmail = useCallback(async (id: string, body: { body_html?: string; body_text?: string; account_id?: string }): Promise<Email | null> => {
    try {
      const res = await axios.post(`${API_URL}/api/${context}/emails/${id}/reply`, body, { headers: getHeaders() });
      return res.data.data;
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Antworten'));
      return null;
    }
  }, [context]);

  const forwardEmail = useCallback(async (id: string, to: Array<{ email: string; name?: string }>, body?: { body_html?: string; body_text?: string }): Promise<Email | null> => {
    try {
      const res = await axios.post(`${API_URL}/api/${context}/emails/${id}/forward`, { to_addresses: to, ...body }, { headers: getHeaders() });
      return res.data.data;
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Weiterleiten'));
      return null;
    }
  }, [context]);

  const updateStatus = useCallback(async (id: string, status: string) => {
    try {
      await axios.patch(`${API_URL}/api/${context}/emails/${id}/status`, { status }, { headers: getHeaders() });
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Aktualisieren'));
    }
  }, [context]);

  const toggleStar = useCallback(async (id: string) => {
    try {
      const res = await axios.patch(`${API_URL}/api/${context}/emails/${id}/star`, {}, { headers: getHeaders() });
      // Update in list
      setEmails(prev => prev.map(e => e.id === id ? { ...e, is_starred: res.data.data.is_starred } : e));
      if (selectedEmail?.id === id) {
        setSelectedEmail(prev => prev ? { ...prev, is_starred: res.data.data.is_starred } : null);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Markieren'));
    }
  }, [context, selectedEmail?.id]);

  const deleteEmail = useCallback(async (id: string) => {
    try {
      await axios.delete(`${API_URL}/api/${context}/emails/${id}`, { headers: getHeaders() });
      setEmails(prev => prev.filter(e => e.id !== id));
      if (selectedEmail?.id === id) setSelectedEmail(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler beim Loeschen'));
    }
  }, [context, selectedEmail?.id]);

  const batchUpdate = useCallback(async (ids: string[], status: string) => {
    try {
      await axios.post(`${API_URL}/api/${context}/emails/batch`, { ids, status }, { headers: getHeaders() });
    } catch (err) {
      setError(getErrorMessage(err, 'Fehler bei Massenoperation'));
    }
  }, [context]);

  const getReplySuggestions = useCallback(async (id: string): Promise<ReplySuggestion[]> => {
    try {
      const res = await axios.get(`${API_URL}/api/${context}/emails/${id}/ai/reply-suggestions`, { headers: getHeaders() });
      return res.data.data || [];
    } catch {
      return [];
    }
  }, [context]);

  const triggerAIProcess = useCallback(async (id: string): Promise<Email | null> => {
    try {
      const res = await axios.post(`${API_URL}/api/${context}/emails/${id}/ai/process`, {}, { headers: getHeaders() });
      return res.data.data;
    } catch {
      return null;
    }
  }, [context]);

  // Cleanup
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
  };
}
