import {
  IgnitionConfig,
  IgnitionResult,
  evaluateIgnition,
  evaluateIgnitionWithHysteresis,
  IGNITION_DEFAULTS,
} from '../../../../services/reasoning/gwt-ignition';

describe('GWT Ignition Mechanism', () => {
  describe('evaluateIgnition', () => {
    it('should broadcast modules above threshold', () => {
      const modules = [
        { id: 'mem', activation: 0.9 },
        { id: 'rag', activation: 0.7 },
        { id: 'web', activation: 0.2 },
      ];
      const result = evaluateIgnition(modules);
      expect(result.broadcast).toContain('mem');
      expect(result.broadcast).toContain('rag');
      expect(result.suppressed).toContain('web');
    });

    it('should suppress all modules below threshold', () => {
      const modules = [
        { id: 'a', activation: 0.1 },
        { id: 'b', activation: 0.2 },
      ];
      const result = evaluateIgnition(modules);
      expect(result.broadcast).toHaveLength(0);
      expect(result.suppressed).toHaveLength(2);
    });
  });

  describe('evaluateIgnitionWithHysteresis', () => {
    it('should require higher threshold to activate than to deactivate', () => {
      const modules = [{ id: 'mem', activation: 0.45 }];

      // Not previously active: needs activation threshold (0.5)
      const result1 = evaluateIgnitionWithHysteresis(modules, []);
      expect(result1.broadcast).not.toContain('mem');

      // Previously active: needs only deactivation threshold (0.3)
      const result2 = evaluateIgnitionWithHysteresis(modules, ['mem']);
      expect(result2.broadcast).toContain('mem');
    });
  });
});
