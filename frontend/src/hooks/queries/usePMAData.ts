/**
 * React Query hooks for PMA (Predictive Memory Architecture) data
 *
 * Spec 8.1: Uses short polling (10s refetch) for neuromodulator gauges.
 * Neuromodulator tonic levels change slowly (5% per event), so SSE is overkill.
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { logError } from '../../utils/errors';

// --- Interfaces ---

export interface NeuromodulatorState {
  dopamine: number;        // [0, 1]
  norepinephrine: number;  // [0, 1]
  serotonin: number;       // [0, 1]
  acetylcholine: number;   // [0, 1]
}

export interface NeuroHistory {
  timestamps: string[];
  dopamine: number[];
  norepinephrine: number[];
  serotonin: number[];
  acetylcholine: number[];
}

export interface BiasReport {
  positiveAcceptanceRate: number;
  negativeAcceptanceRate: number;
  asymmetryScore: number;
  confirmationBiasScore: number;
  recencyBias: number;
}

export interface EfficiencyEntry {
  date: string;
  avgTokensUsed: number;
  retrievalPrecision: number;
  qualityScore: number;
}

export interface MemoryHealthEntry {
  id: string;
  content: string;
  fastStrength: number;     // [0, 1]
  mediumStrength: number;   // [0, 1]
  deepStrength: number;     // [0, 1]
  lastRescue?: string;      // ISO date if STC-rescued
}

// --- Query key factory (inline, not added to query-keys.ts) ---

const pmaKeys = {
  all: (ctx: string) => ['pma', ctx] as const,
  neuromodulators: (ctx: string) => ['pma', ctx, 'neuromodulators'] as const,
  neuroHistory: (ctx: string) => ['pma', ctx, 'neuromodulators', 'history'] as const,
  biasReport: (ctx: string) => ['pma', ctx, 'bias-report'] as const,
  efficiency: (ctx: string) => ['pma', ctx, 'efficiency'] as const,
  memoryHealth: (ctx: string) => ['pma', ctx, 'memory-health'] as const,
};

// --- Hooks ---

/**
 * Current neuromodulator tonic levels.
 * Polls every 10s (levels change slowly at ~5% per event).
 */
export function useNeuromodulatorState(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: pmaKeys.neuromodulators(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: NeuromodulatorState }>(
          `/api/${context}/memory/neuromodulators`,
          { signal }
        );
        return response.data?.data ?? null;
      } catch (error) {
        logError('useNeuromodulatorState', error);
        throw error;
      }
    },
    enabled,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

/**
 * Historical neuromodulator levels (sparkline data).
 */
export function useNeuromodulatorHistory(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: pmaKeys.neuroHistory(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: NeuroHistory }>(
          `/api/${context}/memory/neuromodulators/history`,
          { signal }
        );
        return response.data?.data ?? null;
      } catch (error) {
        logError('useNeuromodulatorHistory', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Cognitive bias detection report.
 */
export function useBiasReport(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: pmaKeys.biasReport(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: BiasReport }>(
          `/api/${context}/metacognition/bias-report`,
          { signal }
        );
        return response.data?.data ?? null;
      } catch (error) {
        logError('useBiasReport', error);
        throw error;
      }
    },
    enabled,
    staleTime: 300_000,
  });
}

/**
 * Memory efficiency trend over time.
 */
export function useEfficiencyTrend(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: pmaKeys.efficiency(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: EfficiencyEntry[] }>(
          `/api/${context}/metacognition/efficiency`,
          { signal }
        );
        return response.data?.data ?? [];
      } catch (error) {
        logError('useEfficiencyTrend', error);
        throw error;
      }
    },
    enabled,
    staleTime: 300_000,
  });
}

/**
 * PMA memory health — triple-copy strengths for recent memories.
 */
export function useMemoryHealth(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: pmaKeys.memoryHealth(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: MemoryHealthEntry[] }>(
          `/api/${context}/memory/pma-health`,
          { signal }
        );
        return response.data?.data ?? [];
      } catch (error) {
        logError('useMemoryHealth', error);
        throw error;
      }
    },
    enabled,
    staleTime: 30_000,
  });
}
