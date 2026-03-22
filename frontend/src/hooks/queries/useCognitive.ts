/**
 * React Query hooks for Cognitive Dashboard (Phase 135-136)
 *
 * Provides query hooks for metacognition overview data
 * including calibration, strengths, predictions, and curiosity metrics.
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

export interface CalibrationMetric {
  score: number;
  trend: 'improving' | 'stable' | 'declining';
  sample_size: number;
}

export interface StrengthEntry {
  domain: string;
  confidence: number;
  evidence_count: number;
}

export interface PredictionEntry {
  id: string;
  prediction: string;
  confidence: number;
  status: 'pending' | 'confirmed' | 'refuted';
  created_at: string;
}

export interface CuriosityEntry {
  topic: string;
  interest_score: number;
  last_explored: string | null;
}

export interface KnowledgeGap {
  area: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export interface CognitiveOverview {
  calibration: CalibrationMetric;
  strengths: StrengthEntry[];
  predictions: PredictionEntry[];
  curiosity: CuriosityEntry[];
  knowledge_gaps: KnowledgeGap[];
  confidence_score: number;
  coherence_score: number;
  coverage_score: number;
}

/**
 * Fetch cognitive metacognition overview
 */
export function useCognitiveOverview(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.cognitive.overview(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get<{ success: boolean; data: CognitiveOverview }>(
          `/api/${context}/metacognition/overview`,
          { signal }
        );
        return response.data?.data ?? null;
      } catch (error) {
        logError('useCognitiveOverview', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}
