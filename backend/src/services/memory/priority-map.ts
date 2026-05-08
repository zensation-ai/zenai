/**
 * PriorityMap — 4-dimensional priority scoring with amygdala fast-path
 *
 * Based on Chelazzi et al. (2014): "Rewards teach visual selective attention."
 * Unified priority signal for GWT module selection, RAG ranking, sleep
 * consolidation, SmartSurface suggestions, and context window inclusion.
 *
 * Dimensions:
 *   - Saliency:        bottom-up attention (unexpected, novel)
 *   - Emotion:         absolute emotional valence (amygdala-driven)
 *   - Reward:          task/goal reward relevance
 *   - Goal Alignment:  top-down alignment with user's current goals
 *
 * Neuromodulators shift dimension weights:
 *   DA  → saliency boost (novelty/reward seeking)
 *   NE  → emotion boost (arousal/threat detection)
 *   5HT → goal boost (long-term planning)
 *   ACh → saliency + reward boost (attentional gating)
 *
 * Amygdala fast-path: emotional intensity > 0.6 guarantees composite ≥ 0.5.
 *
 * Part of the Predictive Memory Architecture (PMA).
 */

export interface PriorityInput {
  saliency: number;          // [0, 1] — how attention-grabbing / novel
  emotionalValence: number;  // [-1, 1] — positive/negative emotion (absolute value used)
  rewardRelevance: number;   // [0, 1] — task/reward relevance
  goalAlignment: number;     // [0, 1] — alignment with user's current goals
}

export interface PriorityScore {
  composite: number;         // [0, 1] — weighted sum (may be floored by amygdala)
  saliency: number;          // clamped input [0, 1]
  emotion: number;           // clamped abs(emotionalValence) [0, 1]
  reward: number;            // clamped input [0, 1]
  goal: number;              // clamped input [0, 1]
  amygdalaFlagged: boolean;  // true when emotion > AMYGDALA_THRESHOLD
}

export interface Weights {
  saliency: number;
  emotion: number;
  reward: number;
  goal: number;
}

export interface NeuroState {
  dopamine: number;        // [0, 1] — novelty/reward signal
  norepinephrine: number;  // [0, 1] — arousal/stress signal
  serotonin: number;       // [0, 1] — planning/mood signal
  acetylcholine: number;   // [0, 1] — attentional gating signal
}

// ---------------------------------------------------------------
// Constants
// ---------------------------------------------------------------

const DEFAULT_WEIGHTS: Weights = {
  saliency: 0.2,
  emotion: 0.25,
  reward: 0.25,
  goal: 0.3,
};

/** Threshold above which emotional intensity triggers amygdala fast-path */
const AMYGDALA_THRESHOLD = 0.6;

/** Minimum composite priority guaranteed for amygdala-flagged items */
const AMYGDALA_FLOOR = 0.5;

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Clamp value to [min, max] */
function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

// ---------------------------------------------------------------
// PriorityMap
// ---------------------------------------------------------------

export class PriorityMap {
  private enabled = true;

  /** Toggle the entire priority system (ablation support) */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Compute priority score for a candidate item.
   *
   * @param input      Four-dimensional priority signal
   * @param neuroState Optional neuromodulator levels that shift weights
   * @returns          Full priority breakdown including composite
   */
  score(input: PriorityInput, neuroState?: NeuroState): PriorityScore {
    // Ablation fast-path: return neutral 0.5 for everything
    if (!this.enabled) {
      return {
        composite: 0.5,
        saliency: 0.5,
        emotion: 0.5,
        reward: 0.5,
        goal: 0.5,
        amygdalaFlagged: false,
      };
    }

    // Clamp all inputs to [0, 1]. Emotional valence uses absolute value.
    const s = clamp(input.saliency);
    const e = clamp(Math.abs(input.emotionalValence));
    const r = clamp(input.rewardRelevance);
    const g = clamp(input.goalAlignment);

    // Resolve weights — modulate if neuroState provided
    const weights = neuroState
      ? this.adjustWeights(DEFAULT_WEIGHTS, neuroState)
      : DEFAULT_WEIGHTS;

    // Weighted composite
    let composite = weights.saliency * s + weights.emotion * e + weights.reward * r + weights.goal * g;

    // Amygdala fast-path: apply floor for emotionally intense items
    const preScreen = this.amygdalaPreScreen(e);
    if (preScreen.flagged) {
      composite = Math.max(composite, preScreen.floor);
    }

    return {
      composite,
      saliency: s,
      emotion: e,
      reward: r,
      goal: g,
      amygdalaFlagged: preScreen.flagged,
    };
  }

  /**
   * Amygdala pre-screen: fast emotional relevance check.
   * Items with high emotional intensity bypass normal priority gating.
   *
   * @param emotionalIntensity  Absolute emotional signal in [0, 1]
   * @returns                   { flagged, floor }
   */
  amygdalaPreScreen(emotionalIntensity: number): { flagged: boolean; floor: number } {
    const flagged = emotionalIntensity > AMYGDALA_THRESHOLD;
    return { flagged, floor: flagged ? AMYGDALA_FLOOR : 0 };
  }

  /**
   * Adjust dimension weights based on current neuromodulator levels.
   * Each neurotransmitter biases specific dimensions via a linear gain term.
   * Weights are re-normalized after adjustment so they always sum to 1.
   *
   * Gain model (delta from 0.5 baseline, scaled by α):
   *   DA  +0.3 → saliency
   *   NE  +0.3 → emotion
   *   5HT +0.3 → goal
   *   ACh +0.2 → saliency, +0.2 → reward
   *
   * @param baseWeights  Starting weights (usually DEFAULT_WEIGHTS)
   * @param neuroState   Current neuromodulator levels [0, 1]
   * @returns            Normalized weights summing to 1.0
   */
  adjustWeights(baseWeights: Weights, neuroState: NeuroState): Weights {
    const da  = clamp(neuroState.dopamine);
    const ne  = clamp(neuroState.norepinephrine);
    const ser = clamp(neuroState.serotonin);
    const ach = clamp(neuroState.acetylcholine);

    // Additive gain relative to 0.5 baseline for each neuromodulator
    const raw: Weights = {
      saliency: baseWeights.saliency * (1 + 0.3 * (da - 0.5) + 0.2 * (ach - 0.5)),
      emotion:  baseWeights.emotion  * (1 + 0.3 * (ne - 0.5)),
      reward:   baseWeights.reward   * (1 + 0.2 * (ach - 0.5)),
      goal:     baseWeights.goal     * (1 + 0.3 * (ser - 0.5)),
    };

    // Clamp each raw weight to a small positive minimum to avoid zero/negative
    raw.saliency = Math.max(raw.saliency, 1e-6);
    raw.emotion  = Math.max(raw.emotion,  1e-6);
    raw.reward   = Math.max(raw.reward,   1e-6);
    raw.goal     = Math.max(raw.goal,     1e-6);

    // Normalize so all weights sum to exactly 1.0
    const total = raw.saliency + raw.emotion + raw.reward + raw.goal;
    return {
      saliency: raw.saliency / total,
      emotion:  raw.emotion  / total,
      reward:   raw.reward   / total,
      goal:     raw.goal     / total,
    };
  }
}

// ---------------------------------------------------------------
// Bridge: emotional-tagger → PriorityMap (PMA Task 17i)
// ---------------------------------------------------------------

/** Default singleton for convenience import */
export const priorityMap = new PriorityMap();

/**
 * Bridge emotional-tagger output into the PriorityMap emotion channel.
 *
 * PMA Spec §3.1: The emotional-tagger fast-path converts valence + arousal
 * into an intensity signal fed to PriorityMap.amygdalaPreScreen(). Items
 * with high emotional intensity receive a guaranteed priority floor,
 * preventing them from being filtered out by low salience alone.
 *
 * Maps from emotional-tagger coordinates:
 *   - valence (0–1, pleasantness) → re-centered to [-1, +1] for magnitude
 *   - arousal (0–1, activation)
 *   - intensity = |centeredValence| × arousal
 *
 * @param valence  Emotional pleasantness from tagger (0 to 1)
 * @param arousal  Physiological activation from tagger (0 to 1)
 * @param map      PriorityMap instance (defaults to module singleton)
 * @returns        Pre-screen result: flagged status and priority floor
 */
export function bridgeEmotionalTagger(
  valence: number,
  arousal: number,
  map: PriorityMap = priorityMap,
): { flagged: boolean; floor: number } {
  // Re-center valence from [0,1] → [-1,+1] to get signed magnitude
  const centeredValence = (valence - 0.5) * 2;
  const intensity = Math.abs(centeredValence) * clamp(arousal);
  return map.amygdalaPreScreen(intensity);
}
