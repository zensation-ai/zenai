/**
 * useLocalInference Hook - Phase 74
 *
 * React hook for local in-browser inference.
 * Auto-initialises on mount, provides graceful degradation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { localInference, isWebGPUAvailable } from '../services/local-inference';
import type { InferenceStatus } from '../services/local-inference';

export interface UseLocalInferenceResult {
  /** Whether the provider is initialised and ready */
  isAvailable: boolean;
  /** Whether the provider is currently loading */
  isLoading: boolean;
  /** Current status */
  status: InferenceStatus;
  /** Whether the browser supports WebGPU (for future ML providers) */
  webGPUAvailable: boolean;
  /** Active provider name */
  providerName: string;
  /** Classify user intent locally */
  classifyIntent: (query: string) => Promise<'chat' | 'search' | 'action' | 'code'>;
  /** Analyse sentiment locally */
  analyzeSentiment: (text: string) => Promise<{ score: number; label: string }>;
  /** Summarise text locally */
  summarize: (text: string, maxLength?: number) => Promise<string>;
  /** Generate a local embedding */
  generateEmbedding: (text: string) => Promise<number[]>;
}

/**
 * Hook that auto-initialises the local inference provider.
 * Falls back gracefully: if init fails, classification returns 'chat',
 * sentiment returns neutral, and summarise returns truncated text.
 */
export function useLocalInference(): UseLocalInferenceResult {
  const [status, setStatus] = useState<InferenceStatus>(localInference.status);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (localInference.status !== 'ready') {
      setStatus('loading');
      localInference.init().then(() => {
        if (mountedRef.current) setStatus(localInference.status);
      });
    }

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const classifyIntent = useCallback(async (query: string) => {
    try {
      return await localInference.classifyIntent(query);
    } catch {
      return 'chat' as const;
    }
  }, []);

  const analyzeSentiment = useCallback(async (text: string) => {
    try {
      return await localInference.analyzeSentiment(text);
    } catch {
      return { score: 0, label: 'neutral' };
    }
  }, []);

  const summarize = useCallback(async (text: string, maxLength?: number) => {
    try {
      return await localInference.summarize(text, maxLength);
    } catch {
      return text.slice(0, maxLength ?? 200);
    }
  }, []);

  const generateEmbedding = useCallback(async (text: string) => {
    try {
      return await localInference.generateEmbedding(text);
    } catch {
      return new Array<number>(64).fill(0);
    }
  }, []);

  return {
    isAvailable: status === 'ready',
    isLoading: status === 'loading',
    status,
    webGPUAvailable: isWebGPUAvailable(),
    providerName: localInference.providerName,
    classifyIntent,
    analyzeSentiment,
    summarize,
    generateEmbedding,
  };
}
