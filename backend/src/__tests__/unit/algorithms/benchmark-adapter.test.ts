import { createBenchmarkAdapter } from '../../../algorithms/benchmark-adapter';
import { createAblationRegistry } from '../../../algorithms/ablation';

describe('Benchmark Adapter', () => {
  it('should create adapter with ablation registry', () => {
    const registry = createAblationRegistry();
    const adapter = createBenchmarkAdapter(registry);
    expect(adapter).toBeDefined();
    expect(adapter.getActiveFeatures).toBeDefined();
  });

  it('should report which features are active', () => {
    const registry = createAblationRegistry();
    registry.register('feat_a', 'A');
    registry.register('feat_b', 'B');
    registry.disable('feat_b');
    const adapter = createBenchmarkAdapter(registry);
    const active = adapter.getActiveFeatures();
    expect(active).toContain('feat_a');
    expect(active).not.toContain('feat_b');
  });

  it('should record results with metadata', () => {
    const registry = createAblationRegistry();
    const adapter = createBenchmarkAdapter(registry);
    adapter.recordResult({ experimentId: 'exp1', metric: 'recall_at_5', value: 0.85, seed: 42 });
    const results = adapter.getResults();
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0.85);
    expect(results[0].timestamp).toBeDefined();
  });

  it('should export results as JSON', () => {
    const registry = createAblationRegistry();
    const adapter = createBenchmarkAdapter(registry);
    adapter.recordResult({ experimentId: 'exp1', metric: 'f1', value: 0.9, seed: 42 });
    const json = adapter.exportJSON();
    const parsed = JSON.parse(json);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.features).toBeDefined();
  });

  it('should reset results', () => {
    const registry = createAblationRegistry();
    const adapter = createBenchmarkAdapter(registry);
    adapter.recordResult({ experimentId: 'exp1', metric: 'f1', value: 0.9, seed: 42 });
    adapter.reset();
    expect(adapter.getResults()).toHaveLength(0);
  });
});
