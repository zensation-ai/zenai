/**
 * Benchmark Adapter — bridges algorithms with the experiment harness.
 * Records results with ablation config metadata for reproducible experiments.
 *
 * Project-specific experiment infrastructure — will NOT be published in
 * @zensation/algorithms as it is tied to the ZenAI experiment harness.
 */
import { AblationRegistry } from './ablation';

export interface BenchmarkResult {
  experimentId: string;
  metric: string;
  value: number;
  seed: number;
  timestamp?: string;
  ablationConfig?: string;
}

export interface BenchmarkAdapter {
  getActiveFeatures(): string[];
  recordResult(result: Omit<BenchmarkResult, 'timestamp' | 'ablationConfig'>): void;
  getResults(): BenchmarkResult[];
  exportJSON(): string;
  reset(): void;
}

export function createBenchmarkAdapter(registry: AblationRegistry): BenchmarkAdapter {
  const results: BenchmarkResult[] = [];
  return {
    getActiveFeatures() { return registry.listFeatures().filter(f => f.enabled).map(f => f.id); },
    recordResult(result) {
      results.push({ ...result, timestamp: new Date().toISOString(), ablationConfig: registry.toJSON() });
    },
    getResults() { return [...results]; },
    exportJSON() {
      return JSON.stringify({ features: registry.listFeatures(), results, exportedAt: new Date().toISOString() }, null, 2);
    },
    reset() { results.length = 0; },
  };
}
