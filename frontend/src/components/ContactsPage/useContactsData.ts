/**
 * Contacts Data Hook - Phase 3
 *
 * Uses global axios instance (with auth interceptor from main.tsx).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import type { Contact, Organization, ContactInteraction, ContactStats } from './types';
import { logger } from '../../utils/logger';

// Uses global axios instance configured in main.tsx (baseURL + auth interceptor)

interface UseContactsDataProps {
  context: string;
}

export function useContactsData({ context }: UseContactsDataProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [followUps, setFollowUps] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [interactions, setInteractions] = useState<ContactInteraction[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [totalOrganizations, setTotalOrganizations] = useState(0);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchContacts = useCallback(async (filters?: {
    search?: string;
    relationship_type?: string;
    is_favorite?: boolean;
    organization_id?: string;
  }) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.search) params.set('search', filters.search);
      if (filters?.relationship_type) params.set('relationship_type', filters.relationship_type);
      if (filters?.is_favorite) params.set('is_favorite', 'true');
      if (filters?.organization_id) params.set('organization_id', filters.organization_id);

      const { data } = await axios.get(`/api/${context}/contacts?${params}`, { signal: ctrl.signal });
      if (data.success) {
        setContacts(data.data);
        setTotalContacts(data.total);
      }
    } catch (err) {
      if (!axios.isCancel(err)) logger.error('Failed to fetch contacts', err);
    } finally {
      setLoading(false);
    }
  }, [context]);

  const fetchOrganizations = useCallback(async (search?: string) => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const { data } = await axios.get(`/api/${context}/organizations${params}`);
      if (data.success) {
        setOrganizations(data.data);
        setTotalOrganizations(data.total);
      }
    } catch (err) {
      logger.error('Failed to fetch organizations', err);
    }
  }, [context]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/${context}/contacts/stats`);
      if (data.success) setStats(data.data);
    } catch (err) {
      logger.error('Failed to fetch stats', err);
    }
  }, [context]);

  const fetchFollowUps = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/${context}/contacts/follow-ups`);
      if (data.success) setFollowUps(data.data);
    } catch (err) {
      logger.error('Failed to fetch follow-ups', err);
    }
  }, [context]);

  const fetchInteractions = useCallback(async (contactId: string) => {
    try {
      const { data } = await axios.get(`/api/${context}/contacts/${contactId}/timeline`);
      if (data.success) setInteractions(data.data);
    } catch (err) {
      logger.error('Failed to fetch interactions', err);
    }
  }, [context]);

  const createContact = useCallback(async (input: Partial<Contact>): Promise<Contact | null> => {
    try {
      const { data } = await axios.post(`/api/${context}/contacts`, input);
      if (data.success) {
        await fetchContacts();
        await fetchStats();
        return data.data;
      }
    } catch (err) {
      logger.error('Failed to create contact', err);
    }
    return null;
  }, [context, fetchContacts, fetchStats]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>): Promise<boolean> => {
    try {
      const { data } = await axios.put(`/api/${context}/contacts/${id}`, updates);
      if (data.success) {
        setContacts(prev => prev.map(c => c.id === id ? data.data : c));
        if (selectedContact?.id === id) setSelectedContact(data.data);
        return true;
      }
    } catch (err) {
      logger.error('Failed to update contact', err);
    }
    return false;
  }, [context, selectedContact]);

  const deleteContact = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { data } = await axios.delete(`/api/${context}/contacts/${id}`);
      if (data.success) {
        setContacts(prev => prev.filter(c => c.id !== id));
        if (selectedContact?.id === id) setSelectedContact(null);
        await fetchStats();
        return true;
      }
    } catch (err) {
      logger.error('Failed to delete contact', err);
    }
    return false;
  }, [context, selectedContact, fetchStats]);

  const createOrganization = useCallback(async (input: Partial<Organization>): Promise<Organization | null> => {
    try {
      const { data } = await axios.post(`/api/${context}/organizations`, input);
      if (data.success) {
        await fetchOrganizations();
        return data.data;
      }
    } catch (err) {
      logger.error('Failed to create organization', err);
    }
    return null;
  }, [context, fetchOrganizations]);

  const deleteOrganization = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { data } = await axios.delete(`/api/${context}/organizations/${id}`);
      if (data.success) {
        setOrganizations(prev => prev.filter(o => o.id !== id));
        return true;
      }
    } catch (err) {
      logger.error('Failed to delete organization', err);
    }
    return false;
  }, [context]);

  // Initial load
  useEffect(() => {
    fetchContacts();
    fetchOrganizations();
    fetchStats();
    fetchFollowUps();
    return () => abortRef.current?.abort();
  }, [fetchContacts, fetchOrganizations, fetchStats, fetchFollowUps]);

  return {
    contacts,
    organizations,
    stats,
    followUps,
    selectedContact,
    interactions,
    totalContacts,
    totalOrganizations,
    loading,
    setSelectedContact,
    fetchContacts,
    fetchOrganizations,
    fetchInteractions,
    createContact,
    updateContact,
    deleteContact,
    createOrganization,
    deleteOrganization,
  };
}
