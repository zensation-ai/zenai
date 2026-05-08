/**
 * Ebbinghaus Forgetting Curve
 *
 * DEPRECATED (Phase 125): FSRS is now the primary scheduler.
 * Re-exports from @zensation/algorithms for backward compatibility.
 */

export {
  type RetentionResult,
  type RepetitionCandidate,
  type UserDecayProfile,
  type AccessEvent,
  EBBINGHAUS_CONFIG,
  calculateRetention,
  updateStability,
  getRepetitionCandidates,
  shouldArchive,
  calculateOptimalInterval,
  batchCalculateRetention,
  learnDecayProfile,
  calculatePersonalizedRetention,
} from '@zensation/algorithms';
