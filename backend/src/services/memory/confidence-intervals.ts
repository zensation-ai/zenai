/**
 * Confidence Intervals for Probabilistic Memory Outputs
 *
 * Re-exports from @zensation/algorithms (intervals module).
 * Provides uncertainty bounds for FSRS retrievability and Bayesian propagation.
 */

export {
  getRetrievabilityWithCI,
  propagateWithCI,
} from '@zensation/algorithms';

export type { ConfidenceInterval } from '@zensation/algorithms';
