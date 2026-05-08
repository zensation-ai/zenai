import {
  ChainOfThought,
  SchemaNode,
  shouldConsolidate,
  extractSchema,
  consolidateBatch,
  DualProcessConfig,
  DUAL_PROCESS_DEFAULTS,
} from '../../../../services/memory/dual-process-consolidation';

describe('Dual-Process CoT Consolidation', () => {
  const successfulCoT: ChainOfThought = {
    id: 'cot-1',
    steps: ['analyze query', 'retrieve context', 'synthesize answer'],
    successRate: 0.85,
    domain: 'finance',
    createdAt: new Date(),
  };

  const failedCoT: ChainOfThought = {
    id: 'cot-2',
    steps: ['analyze query', 'wrong approach'],
    successRate: 0.2,
    domain: 'learning',
    createdAt: new Date(),
  };

  describe('shouldConsolidate', () => {
    it('should consolidate high-success chains', () => {
      expect(shouldConsolidate(successfulCoT)).toBe(true);
    });

    it('should not consolidate failed chains (they stay episodic)', () => {
      expect(shouldConsolidate(failedCoT)).toBe(false);
    });

    it('should require minimum step count', () => {
      const tooShort: ChainOfThought = {
        ...successfulCoT,
        steps: ['one step'],
      };
      expect(shouldConsolidate(tooShort)).toBe(false);
    });
  });

  describe('extractSchema', () => {
    it('should produce a schema node from a successful chain', () => {
      const schema = extractSchema(successfulCoT);
      expect(schema.pattern).toBeTruthy();
      expect(schema.confidence).toBeCloseTo(successfulCoT.successRate);
      expect(schema.sourceChainId).toBe(successfulCoT.id);
    });

    it('should generalize specific steps into abstract patterns', () => {
      const schema = extractSchema(successfulCoT);
      // Schema pattern should be shorter than concatenating all raw steps verbatim
      expect(schema.pattern.length).toBeLessThan(
        successfulCoT.steps.join(' | ').length * 2,
      );
      // Pattern should contain arrow notation for step flow
      expect(schema.pattern).toContain('->');
    });
  });

  describe('consolidateBatch', () => {
    it('should consolidate eligible chains and skip ineligible ones', () => {
      const result = consolidateBatch([successfulCoT, failedCoT]);
      expect(result.schemas).toHaveLength(1);
      expect(result.skipped).toContain('cot-2');
    });
  });
});
