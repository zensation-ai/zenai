/**
 * React Query hooks for Cognitive Architecture Data (Phase 141)
 *
 * Provides query and mutation hooks for curiosity, predictions,
 * FSRS review, feedback, adaptive preferences, and self-improvement.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

// ── Types ──────────────────────────────────────────────────────────────

export interface KnowledgeGapDetail {
  topic: string;
  domain: string;
  queryCount: number;
  factCount: number;
  avgConfidence: number;
  gapScore: number;
  suggestedAction: string;
}

export interface HypothesisEntry {
  id: string;
  hypothesis: string;
  sourceType: string;
  confidence: number;
  status: 'pending' | 'confirmed' | 'refuted';
  created_at: string;
}

export interface InformationGainEntry {
  queryText: string;
  surprise: number;
  novelty: number;
  informationGain: number;
  created_at: string;
}

export interface PredictionHistoryEntry {
  id: string;
  predicted_intent: string;
  predicted_domain: string;
  actual_intent: string;
  actual_domain: string;
  was_correct: boolean;
  error_magnitude: number;
  created_at: string;
}

export interface PredictionAccuracy {
  accuracy7d: number;
  accuracy30d: number;
  total7d: number;
  total30d: number;
}

export interface ReviewFact {
  id: string;
  content: string;
  domain: string;
  confidence: number;
  fsrs_difficulty: number;
  fsrs_stability: number;
  fsrs_next_review: string;
}

export interface FSRSStats {
  totalWithFSRS: number;
  dueToday: number;
  avgDifficulty: number;
  avgStability: number;
}

export interface FeedbackSummaryEntry {
  type: string;
  totalCount: number;
  avgValue: number;
  positiveRate: number;
  recentTrend: number;
}

export interface AdaptivePreferences {
  responseLength: 'brief' | 'moderate' | 'detailed';
  detailLevel: 'beginner' | 'intermediate' | 'expert';
  proactivityLevel: 'low' | 'medium' | 'high';
  preferredTools: string[];
  languageStyle: 'formal' | 'casual';
}

export interface ImprovementOpportunity {
  id: string;
  type: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  estimatedImpact: number;
}

export interface ImprovementBudget {
  maxActionsPerDay: number;
  usedToday: number;
  remainingToday: number;
}

// ── Curiosity Hooks ────────────────────────────────────────────────────

export function useCuriosityGaps(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.gaps(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: KnowledgeGapDetail[] }>(
          `/api/${context}/curiosity/gaps`,
          { signal }
        );
        return response.data?.data ?? [];
      } catch (error) {
        logError('useCuriosityGaps', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useCuriosityHypotheses(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.hypotheses(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: HypothesisEntry[] }>(
          `/api/${context}/curiosity/hypotheses`,
          { signal }
        );
        return response.data?.data ?? [];
      } catch (error) {
        logError('useCuriosityHypotheses', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useInformationGain(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.infoGain(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: InformationGainEntry[] }>(
          `/api/${context}/curiosity/information-gain`,
          { signal }
        );
        return response.data?.data ?? [];
      } catch (error) {
        logError('useInformationGain', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

// ── Prediction Hooks ───────────────────────────────────────────────────

export function usePredictionHistory(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.predictions(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: PredictionHistoryEntry[] }>(
          `/api/${context}/predictions/history`,
          { signal }
        );
        return response.data?.data ?? [];
      } catch (error) {
        logError('usePredictionHistory', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

export function usePredictionAccuracy(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.predictionAccuracy(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: PredictionAccuracy }>(
          `/api/${context}/predictions/accuracy`,
          { signal }
        );
        return response.data?.data ?? null;
      } catch (error) {
        logError('usePredictionAccuracy', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

// ── Memory / FSRS Hooks ────────────────────────────────────────────────

export function useReviewQueue(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.reviewQueue(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: ReviewFact[] }>(
          `/api/${context}/memory/review-queue`,
          { signal }
        );
        return response.data?.data ?? [];
      } catch (error) {
        logError('useReviewQueue', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useFSRSStats(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.fsrsStats(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: FSRSStats }>(
          `/api/${context}/memory/fsrs/stats`,
          { signal }
        );
        return response.data?.data ?? null;
      } catch (error) {
        logError('useFSRSStats', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

// ── Feedback & Adaptive Hooks ──────────────────────────────────────────

export function useFeedbackSummary(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.feedback(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: FeedbackSummaryEntry[] }>(
          `/api/${context}/feedback/summary`,
          { signal }
        );
        return response.data?.data ?? [];
      } catch (error) {
        logError('useFeedbackSummary', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useAdaptivePreferences(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.preferences(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: AdaptivePreferences }>(
          `/api/${context}/adaptive/preferences`,
          { signal }
        );
        return response.data?.data ?? null;
      } catch (error) {
        logError('useAdaptivePreferences', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

// ── Self-Improvement Hooks ─────────────────────────────────────────────

export function useSelfImprovementOpportunities(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.improvements(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: ImprovementOpportunity[] }>(
          `/api/${context}/self-improvement/opportunities`,
          { signal }
        );
        return response.data?.data ?? [];
      } catch (error) {
        logError('useSelfImprovementOpportunities', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useSelfImprovementBudget(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.budget(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: ImprovementBudget }>(
          `/api/${context}/self-improvement/budget`,
          { signal }
        );
        return response.data?.data ?? null;
      } catch (error) {
        logError('useSelfImprovementBudget', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────

export function useSubmitReview(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ factId, grade }: { factId: string; grade: number }) => {
      const response = await axios.post(`/api/${context}/memory/review/${factId}`, { grade });
      return response.data?.data ?? response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cognitive.reviewQueue(context) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cognitive.fsrsStats(context) });
    },
    onError: (error) => {
      logError('useSubmitReview', error);
    },
  });
}

export function useUpdateHypothesisStatus(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await axios.post(`/api/${context}/curiosity/hypotheses/${id}/status`, { status });
      return response.data?.data ?? response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cognitive.hypotheses(context) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cognitive.overview(context) });
    },
    onError: (error) => {
      logError('useUpdateHypothesisStatus', error);
    },
  });
}

export function useEmitFeedback(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { type: string; value: number; metadata?: Record<string, unknown> }) => {
      const response = await axios.post(`/api/${context}/feedback/emit`, data);
      return response.data?.data ?? response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cognitive.feedback(context) });
    },
    onError: (error) => {
      logError('useEmitFeedback', error);
    },
  });
}
