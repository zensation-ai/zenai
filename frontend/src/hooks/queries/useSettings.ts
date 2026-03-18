/**
 * React Query hooks for Settings
 *
 * Provides query/mutation hooks for user profile and preferences.
 * Does NOT cover extensions (those are handled by the ExtensionMarketplace).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

export interface UserProfile {
  id?: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  business_name?: string;
  business_type?: string;
  industry?: string;
}

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  startPage?: string;
  aiModel?: string;
  aiTemperature?: number;
  aiMaxTokens?: number;
  privacyMode?: boolean;
}

/**
 * Fetch user profile (auth/profile endpoint)
 */
export function useUserProfileQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.settings.profile(),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get('/api/auth/profile', { signal });
        return (response.data?.data ?? response.data?.profile ?? response.data ?? null) as UserProfile | null;
      } catch (error) {
        logError('useUserProfileQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 120_000,
  });
}

/**
 * Update user profile
 */
export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<UserProfile>) => {
      const response = await axios.put('/api/auth/profile', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.profile() });
    },
    onError: (error) => {
      logError('useUpdateProfileMutation', error);
    },
  });
}

/**
 * Fetch user preferences
 */
export function usePreferencesQuery(context: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.settings.preferences(),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/preferences`, { signal });
        return (response.data?.data ?? response.data?.preferences ?? response.data ?? null) as UserPreferences | null;
      } catch (error) {
        logError('usePreferencesQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 120_000,
  });
}

/**
 * Update user preferences
 */
export function useUpdatePreferencesMutation(context: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<UserPreferences>) => {
      const response = await axios.put(`/api/${context}/preferences`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.preferences() });
    },
    onError: (error) => {
      logError('useUpdatePreferencesMutation', error);
    },
  });
}
