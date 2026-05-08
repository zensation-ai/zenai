/**
 * Dual-Process CoT Consolidation
 *
 * Based on: "A Neuroscience-Inspired Dual-Process Model of Compositional
 * Learning" (arXiv Jul 2025)
 *
 * Phase 1 (Hippocampal): Store reasoning chains in episodic memory with
 *   high fidelity. All chains go here immediately.
 * Phase 2 (Cortical): During sleep, successful chains get abstracted into
 *   schema nodes in the KG. Failed chains stay episodic (may be replayed
 *   during sleep for learning).
 *
 * This formalizes the path: CoT -> Episodic Memory -> Schema KG Node
 */

export interface ChainOfThought {
  id: string;
  steps: string[];
  successRate: number;
  domain: string;
  createdAt: Date;
}

export interface SchemaNode {
  pattern: string;
  confidence: number;
  sourceChainId: string;
  domain: string;
  abstractionLevel: 'concrete' | 'intermediate' | 'abstract';
}

export interface DualProcessConfig {
  /** Minimum success rate for cortical consolidation */
  minSuccessRate: number;
  /** Minimum steps for a chain to be worth consolidating */
  minSteps: number;
  /** TTL for episodic storage (days) before consolidation check */
  episodicTTLDays: number;
}

export const DUAL_PROCESS_DEFAULTS: DualProcessConfig = {
  minSuccessRate: 0.6,
  minSteps: 2,
  episodicTTLDays: 7,
};

/**
 * Phase 2 gate: should this chain be consolidated to schema?
 * Only high-success, substantive chains get promoted.
 */
export function shouldConsolidate(
  cot: ChainOfThought,
  config: DualProcessConfig = DUAL_PROCESS_DEFAULTS,
): boolean {
  return cot.successRate >= config.minSuccessRate && cot.steps.length >= config.minSteps;
}

/**
 * Extract abstract reasoning pattern from chain.
 * In production, this would use LLM extraction. Here we provide the
 * algorithmic skeleton that the LLM call wraps around.
 */
export function extractSchema(cot: ChainOfThought): SchemaNode {
  // Abstract pattern: join steps with arrow notation
  const pattern = cot.steps.map(s => s.trim()).join(' -> ');

  const abstractionLevel: SchemaNode['abstractionLevel'] =
    cot.steps.length > 5 ? 'abstract' :
    cot.steps.length > 3 ? 'intermediate' : 'concrete';

  return {
    pattern,
    confidence: cot.successRate,
    sourceChainId: cot.id,
    domain: cot.domain,
    abstractionLevel,
  };
}

/**
 * Batch consolidation: process all eligible chains during sleep.
 * Returns schemas to be upserted into the KG.
 */
export function consolidateBatch(
  chains: ChainOfThought[],
  config: DualProcessConfig = DUAL_PROCESS_DEFAULTS,
): { schemas: SchemaNode[]; skipped: string[] } {
  const schemas: SchemaNode[] = [];
  const skipped: string[] = [];

  for (const chain of chains) {
    if (shouldConsolidate(chain, config)) {
      schemas.push(extractSchema(chain));
    } else {
      skipped.push(chain.id);
    }
  }

  return { schemas, skipped };
}
