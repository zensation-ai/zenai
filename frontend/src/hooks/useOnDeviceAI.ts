/**
 * useOnDeviceAI Hook - Phase 94
 *
 * React hook for on-device AI inference.
 * Initializes the service, tracks capabilities, and provides
 * inference methods with automatic cloud fallback.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  onDeviceAI,
  isWebGPUAvailable,
  type IntentCategory,
  type SentimentResult,
  type OnDeviceCapabilities,
  type OnDeviceAIConfig,
  type RoutingDecision,
} from '../services/on-device-ai';
import { getStats, clearAllStorage, clearCache, type OnDeviceStats } from '../services/on-device-storage';

export interface UseOnDeviceAIResult {
  /** Whether the service is initialized and ready */
  isReady: boolean;
  /** Whether initialization is in progress */
  isLoading: boolean;
  /** Whether WebGPU is available in this browser */
  webGPUAvailable: boolean;
  /** Whether privacy mode is enabled */
  privacyMode: boolean;
  /** Full capabilities */
  capabilities: OnDeviceCapabilities;
  /** Inference statistics */
  stats: OnDeviceStats;
  /** Current configuration */
  config: OnDeviceAIConfig;

  // Inference methods
  classifyIntent: (query: string) => Promise<IntentCategory>;
  analyzeSentiment: (text: string) => Promise<SentimentResult>;
  summarize: (text: string, maxSentences?: number) => Promise<string>;
  complete: (prefix: string, maxWords?: number) => Promise<string>;
  generateEmbedding: (text: string) => Promise<number[]>;

  // Routing
  routeQuery: (query: string) => RoutingDecision;

  // Management
  setPrivacyMode: (enabled: boolean) => void;
  updateConfig: (config: Partial<OnDeviceAIConfig>) => void;
  addUserText: (text: string, source?: 'chat' | 'idea' | 'note') => Promise<void>;
  rebuildModels: () => Promise<void>;
  clearStorage: () => Promise<void>;
  clearInferenceCache: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

export function useOnDeviceAI(): UseOnDeviceAIResult {
  const [isReady, setIsReady] = useState(onDeviceAI.isInitialized);
  const [isLoading, setIsLoading] = useState(false);
  const [capabilities, setCapabilities] = useState<OnDeviceCapabilities>({
    webgpuAvailable: false,
    indexedDBAvailable: false,
    serviceWorkerAvailable: false,
    modelsReady: [],
    privacyMode: false,
  });
  const [stats, setStats] = useState<OnDeviceStats>({
    corpusSize: 0,
    cacheSize: 0,
    vocabSize: 0,
    totalStorageBytes: 0,
    queriesOnDevice: 0,
    queriesCloud: 0,
  });
  const [config, setConfig] = useState<OnDeviceAIConfig>(onDeviceAI.config);
  const mountedRef = useRef(true);

  // Initialize on mount
  useEffect(() => {
    mountedRef.current = true;

    if (!onDeviceAI.isInitialized) {
      setIsLoading(true);
      onDeviceAI.init().then(() => {
        if (mountedRef.current) {
          setIsReady(true);
          setIsLoading(false);
          setCapabilities(onDeviceAI.getCapabilities());
          setConfig(onDeviceAI.config);
        }
      }).catch(() => {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      });
    } else {
      setCapabilities(onDeviceAI.getCapabilities());
      setConfig(onDeviceAI.config);
    }

    // Load stats
    getStats().then(s => {
      if (mountedRef.current) setStats(s);
    });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Inference methods with fallback
  const classifyIntent = useCallback(async (query: string): Promise<IntentCategory> => {
    try {
      return await onDeviceAI.classifyIntent(query);
    } catch {
      return 'chat';
    }
  }, []);

  const analyzeSentiment = useCallback(async (text: string): Promise<SentimentResult> => {
    try {
      return await onDeviceAI.analyzeSentiment(text);
    } catch {
      return { score: 0, label: 'neutral', confidence: 0 };
    }
  }, []);

  const summarize = useCallback(async (text: string, maxSentences?: number): Promise<string> => {
    try {
      return await onDeviceAI.summarize(text, maxSentences);
    } catch {
      return text.slice(0, 200);
    }
  }, []);

  const complete = useCallback(async (prefix: string, maxWords?: number): Promise<string> => {
    try {
      return await onDeviceAI.complete(prefix, maxWords);
    } catch {
      return '';
    }
  }, []);

  const generateEmbedding = useCallback(async (text: string): Promise<number[]> => {
    try {
      return await onDeviceAI.generateEmbedding(text);
    } catch {
      return new Array<number>(64).fill(0);
    }
  }, []);

  const routeQuery = useCallback((query: string): RoutingDecision => {
    return onDeviceAI.routeQuery(query);
  }, []);

  // Management methods
  const setPrivacyMode = useCallback((enabled: boolean) => {
    onDeviceAI.saveConfig({ privacyMode: enabled });
    setConfig(onDeviceAI.config);
    setCapabilities(onDeviceAI.getCapabilities());
  }, []);

  const updateConfig = useCallback((newConfig: Partial<OnDeviceAIConfig>) => {
    onDeviceAI.saveConfig(newConfig);
    setConfig(onDeviceAI.config);
  }, []);

  const addUserText = useCallback(async (text: string, source: 'chat' | 'idea' | 'note' = 'chat') => {
    await onDeviceAI.addUserText(text, source);
  }, []);

  const rebuildModels = useCallback(async () => {
    await onDeviceAI.rebuildModels();
    setCapabilities(onDeviceAI.getCapabilities());
  }, []);

  const clearStorage = useCallback(async () => {
    await clearAllStorage();
    setStats(await getStats());
  }, []);

  const clearInferenceCache = useCallback(async () => {
    await clearCache();
    setStats(await getStats());
  }, []);

  const refreshStats = useCallback(async () => {
    const s = await getStats();
    if (mountedRef.current) setStats(s);
  }, []);

  return {
    isReady,
    isLoading,
    webGPUAvailable: isWebGPUAvailable(),
    privacyMode: config.privacyMode,
    capabilities,
    stats,
    config,
    classifyIntent,
    analyzeSentiment,
    summarize,
    complete,
    generateEmbedding,
    routeQuery,
    setPrivacyMode,
    updateConfig,
    addUserText,
    rebuildModels,
    clearStorage,
    clearInferenceCache,
    refreshStats,
  };
}
