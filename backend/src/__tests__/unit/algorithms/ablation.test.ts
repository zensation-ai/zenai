import { createAblationRegistry, PMA_FEATURES } from '../../../algorithms/ablation';

describe('Ablation Registry', () => {
  let registry: ReturnType<typeof createAblationRegistry>;
  beforeEach(() => { registry = createAblationRegistry(); });

  it('should register features with default enabled=true', () => {
    registry.register('two_factor_hebbian', 'Two-Factor Synaptic Model');
    expect(registry.isEnabled('two_factor_hebbian')).toBe(true);
  });

  it('should allow disabling features', () => {
    registry.register('two_factor_hebbian', 'Two-Factor');
    registry.disable('two_factor_hebbian');
    expect(registry.isEnabled('two_factor_hebbian')).toBe(false);
  });

  it('should return false for unregistered features', () => {
    expect(registry.isEnabled('nonexistent')).toBe(false);
  });

  it('should list all registered features with status', () => {
    registry.register('feat_a', 'Feature A');
    registry.register('feat_b', 'Feature B');
    registry.disable('feat_b');
    const features = registry.listFeatures();
    expect(features).toHaveLength(2);
    expect(features.find(f => f.id === 'feat_a')?.enabled).toBe(true);
    expect(features.find(f => f.id === 'feat_b')?.enabled).toBe(false);
  });

  it('should generate ablation configs (baseline + one per feature)', () => {
    registry.register('two_factor', 'Two-Factor');
    registry.register('simulation_selection', 'Sim-Sel Sleep');
    registry.register('vmPFC_fsrs', 'vmPFC FSRS');
    const configs = registry.generateAblationConfigs();
    expect(configs).toHaveLength(4);
    expect(configs[0].name).toBe('baseline');
    expect(configs[0].disabled).toHaveLength(0);
  });

  it('should serialize/deserialize for reproducibility', () => {
    registry.register('feat_a', 'Feature A');
    registry.disable('feat_a');
    const json = registry.toJSON();
    const restored = createAblationRegistry(json);
    expect(restored.isEnabled('feat_a')).toBe(false);
  });
});

describe('PMA ablation features', () => {
  it('should register all 8 PMA features', () => {
    const registry = createAblationRegistry();
    for (const id of Object.values(PMA_FEATURES)) {
      registry.register(id, `PMA: ${id}`);
    }
    const features = registry.listFeatures();
    const pmaFeatures = features.filter(f => f.id.startsWith('pma_'));
    expect(pmaFeatures).toHaveLength(8);
  });
});
