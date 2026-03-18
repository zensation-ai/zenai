/**
 * React Query hooks for Business Dashboard
 *
 * Provides query hooks for business metrics endpoints.
 * Child components (BusinessOverview, RevenueDashboard etc.)
 * can use these hooks instead of direct axios calls.
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

/**
 * Fetch business overview metrics
 */
export function useBusinessOverviewQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.business.overview(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/business/overview`, { signal });
        return response.data?.data ?? response.data ?? null;
      } catch (error) {
        logError('useBusinessOverviewQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Fetch revenue metrics
 */
export function useRevenueQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.business.revenue(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/business/revenue`, { signal });
        return response.data?.data ?? response.data ?? null;
      } catch (error) {
        logError('useRevenueQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 120_000,
  });
}

/**
 * Fetch traffic analytics
 */
export function useTrafficQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.business.traffic(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/business/traffic`, { signal });
        return response.data?.data ?? response.data ?? null;
      } catch (error) {
        logError('useTrafficQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 120_000,
  });
}

/**
 * Fetch SEO performance
 */
export function useSeoQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.business.seo(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/business/seo`, { signal });
        return response.data?.data ?? response.data ?? null;
      } catch (error) {
        logError('useSeoQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 300_000,
  });
}

/**
 * Fetch system health status
 */
export function useBusinessHealthQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.business.health(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/business/health`, { signal });
        return response.data?.data ?? response.data ?? null;
      } catch (error) {
        logError('useBusinessHealthQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
