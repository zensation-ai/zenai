/**
 * React Query hooks for Contacts & Organizations
 *
 * @module hooks/queries/useContacts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

// ===========================================
// Query Hooks
// ===========================================

/**
 * Fetch contacts list with optional filters
 */
export function useContactsQuery(context: AIContext, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.contacts.list(context, filters),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/contacts`, { signal, params: filters });
      return response.data?.data ?? response.data?.contacts ?? [];
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch contact statistics
 */
export function useContactStatsQuery(context: AIContext) {
  return useQuery({
    queryKey: queryKeys.contacts.stats(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/contacts/stats`, { signal });
      return response.data?.data ?? response.data;
    },
    staleTime: 60_000,
  });
}

/**
 * Fetch follow-up suggestions
 */
export function useContactFollowUpsQuery(context: AIContext) {
  return useQuery({
    queryKey: queryKeys.contacts.followUps(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/contacts/follow-ups`, { signal });
      return response.data?.data ?? [];
    },
    staleTime: 120_000,
  });
}

/**
 * Fetch a single contact by ID
 */
export function useContactDetailQuery(context: AIContext, id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.contacts.detail(context, id) : ['contacts', 'none'],
    queryFn: async ({ signal }) => {
      if (!id) return null;
      const response = await axios.get(`/api/${context}/contacts/${id}`, { signal });
      return response.data?.data ?? response.data;
    },
    enabled: !!id,
    staleTime: 15_000,
  });
}

/**
 * Fetch organizations list
 */
export function useOrganizationsQuery(context: AIContext, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.organizations.list(context, filters),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/organizations`, { signal, params: filters });
      return response.data?.data ?? response.data?.organizations ?? [];
    },
    staleTime: 30_000,
  });
}

// ===========================================
// Mutation Hooks
// ===========================================

/**
 * Create a new contact
 */
export function useCreateContactMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await axios.post(`/api/${context}/contacts`, data);
      return response.data?.data ?? response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all(context) });
    },
    onError: (error) => {
      logError('useCreateContactMutation', error);
    },
  });
}

/**
 * Update a contact
 */
export function useUpdateContactMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const response = await axios.put(`/api/${context}/contacts/${id}`, data);
      return response.data?.data ?? response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.detail(context, variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.list(context) });
    },
    onError: (error) => {
      logError('useUpdateContactMutation', error);
    },
  });
}

/**
 * Delete a contact (optimistic)
 */
export function useDeleteContactMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/${context}/contacts/${id}`);
      return id;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all(context) });
    },
    onError: (error) => {
      logError('useDeleteContactMutation', error);
    },
  });
}

/**
 * Create a new organization
 */
export function useCreateOrganizationMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await axios.post(`/api/${context}/organizations`, data);
      return response.data?.data ?? response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all(context) });
    },
    onError: (error) => {
      logError('useCreateOrganizationMutation', error);
    },
  });
}

/**
 * Delete an organization
 */
export function useDeleteOrganizationMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/${context}/organizations/${id}`);
      return id;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all(context) });
    },
    onError: (error) => {
      logError('useDeleteOrganizationMutation', error);
    },
  });
}
