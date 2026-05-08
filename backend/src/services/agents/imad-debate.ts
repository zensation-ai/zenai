/**
 * iMAD — Intelligent Multi-Agent Debate Protocol
 *
 * Based on: "Intelligent Multi-Agent Debate for Efficient and Accurate
 * LLM Inference" (arXiv 2511.11306, Nov 2025)
 *
 * Reduces MAD token costs by ~92% by only triggering debate when
 * self-critique reveals hesitation (uncertain/contradictory reasoning).
 *
 * Pipeline:
 * 1. Single agent generates structured self-critique
 * 2. Hesitation feature extraction (confidence gap, hedging, contradictions)
 * 3. Lightweight classifier decides: debate or accept
 * 4. If debate: multi-agent positions + judge synthesis
 */

export interface SelfCritique {
  initialReasoning: string;
  counterArgument: string;
  initialConfidence: number;
  counterConfidence: number;
}

export interface HesitationFeatures {
  /** Difference between initial and counter confidence */
  confidenceGap: number;
  /** Frequency of hedging words (might, perhaps, possibly, etc.) */
  hedgingScore: number;
  /** Indicators of self-contradiction in the critique */
  contradictionScore: number;
  /** Ratio of counter-argument length to initial reasoning */
  lengthRatio: number;
  /** Count of explicit uncertainty markers */
  uncertaintyMarkers: number;
}

export interface DebateAgent {
  name: string;
  argue: (query: string) => Promise<string>;
}

export interface IMADResult {
  debateTriggered: boolean;
  finalAnswer: string;
  positions: string[];
  tokensSaved: number;
}

export interface IMADConfig {
  /** Threshold for debate trigger (weighted feature score) */
  debateThreshold: number;
  /** Weights for hesitation features in decision */
  weights: {
    confidenceGap: number;
    hedgingScore: number;
    contradictionScore: number;
    lengthRatio: number;
    uncertaintyMarkers: number;
  };
}

export const IMAD_DEFAULTS: IMADConfig = {
  debateThreshold: 0.35,
  weights: {
    confidenceGap: -0.25,  // High gap = confident = no debate (negative weight)
    hedgingScore: 0.3,     // Hedging language strongly indicates need for debate
    contradictionScore: 0.3,// Self-contradiction = debate needed
    lengthRatio: 0.1,
    uncertaintyMarkers: 0.15,
  },
};

const HEDGING_WORDS = [
  'might', 'perhaps', 'possibly', 'maybe', 'could',
  'arguably', 'potentially', 'uncertain', 'unclear',
  'not sure', 'hard to say', 'debatable', 'vielleicht',
  'eventuell', 'moeglicherweise', 'unsicher',
];

const CONTRADICTION_MARKERS = [
  'however', 'but actually', 'contradicts', 'on the other hand',
  'conversely', 'despite', 'although', 'dennoch', 'allerdings',
  'widerspricht', 'andererseits',
];

export function extractHesitationFeatures(critique: SelfCritique): HesitationFeatures {
  const allText = `${critique.initialReasoning} ${critique.counterArgument}`.toLowerCase();
  const words = allText.split(/\s+/);
  const wordCount = words.length || 1;

  const hedgingCount = HEDGING_WORDS.reduce(
    (count, word) => count + (allText.split(word).length - 1), 0,
  );

  const contradictionCount = CONTRADICTION_MARKERS.reduce(
    (count, marker) => count + (allText.split(marker).length - 1), 0,
  );

  return {
    confidenceGap: Math.abs(critique.initialConfidence - critique.counterConfidence),
    hedgingScore: Math.min(1, hedgingCount / (wordCount * 0.1)),
    contradictionScore: Math.min(1, contradictionCount / 3),
    lengthRatio: critique.counterArgument.length / Math.max(1, critique.initialReasoning.length),
    uncertaintyMarkers: hedgingCount + contradictionCount,
  };
}

/**
 * Lightweight classifier: weighted sum of hesitation features.
 * Returns true if combined score exceeds debate threshold.
 */
export function shouldTriggerDebate(
  features: HesitationFeatures,
  config: IMADConfig = IMAD_DEFAULTS,
): boolean {
  const score =
    config.weights.confidenceGap * features.confidenceGap +
    config.weights.hedgingScore * features.hedgingScore +
    config.weights.contradictionScore * features.contradictionScore +
    config.weights.lengthRatio * Math.min(1, features.lengthRatio / 3) +
    config.weights.uncertaintyMarkers * Math.min(1, features.uncertaintyMarkers / 5);

  return score > config.debateThreshold;
}

/**
 * Execute selective debate: skip if not triggered, run full MAD if triggered.
 */
export async function executeSelectiveDebate(
  query: string,
  singleAgentAnswer: string,
  features: HesitationFeatures,
  agents: DebateAgent[],
  config: IMADConfig = IMAD_DEFAULTS,
): Promise<IMADResult> {
  if (!shouldTriggerDebate(features, config) || agents.length === 0) {
    return {
      debateTriggered: false,
      finalAnswer: singleAgentAnswer,
      positions: [],
      tokensSaved: agents.length * 500, // estimated saved tokens
    };
  }

  // Execute debate: each agent argues independently
  const positions = await Promise.all(
    agents.map(agent => agent.argue(query)),
  );

  // Simple synthesis: in production, a judge agent synthesizes
  const finalAnswer = positions.join('\n---\n');

  return {
    debateTriggered: true,
    finalAnswer,
    positions,
    tokensSaved: 0,
  };
}

// =============================================================================
// Phase H7.2 — LoCoMo-spec confidence gate
// =============================================================================
//
// Spec § H7 task 2: "nur wenn model_confidence < 0.65 — dann Multi-Agent-Debate;
// sonst direct answer (saves 92 % token cost per arXiv:2511.11306)".
//
// The existing shouldTriggerDebate() above gates on hesitation features
// extracted from a SelfCritique. The LoCoMo eval surface needs a simpler
// confidence-first gate that doesn't require generating a critique step:
// the model's own emitted confidence (or a calibrated proxy) directly
// gates whether to spend tokens on debate.
//
// This module exposes that gate as a pure function with a structured
// decision object so the LoCoMo eval-harness can A/B it without touching
// the existing iMAD primitives.

/**
 * LoCoMo-spec confidence threshold from Phase H spec § H7 task 2.
 * Below this, debate is triggered; at or above, return direct answer.
 *
 * Exported as a top-level constant for byte-equal eval-harness comparison.
 */
export const LOCOMO_IMAD_CONFIDENCE_THRESHOLD = 0.65;

/**
 * Read the H7_IMAD_CONFIDENCE_GATE env flag once at module load. Default
 * OFF in production until eval validates the token-savings claim. Eval
 * harness flips per-run.
 */
const H7_IMAD_CONFIDENCE_GATE_DEFAULT = (() => {
  const raw = process.env.H7_IMAD_CONFIDENCE_GATE;
  if (typeof raw !== 'string') return false;
  return raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
})();

/** What gate fired the decision — useful for eval-harness telemetry. */
export type IMADGateMode =
  | 'disabled'              // gate not active (default-off)
  | 'high_confidence'       // confidence ≥ threshold → skip debate
  | 'low_confidence'        // confidence < threshold + no critique → trigger
  | 'low_confidence_iMAD'   // confidence < threshold + critique gate fired
  | 'low_confidence_iMAD_suppressed' // confidence < threshold but iMAD said no
  | 'critique_only'         // no confidence supplied → critique gate alone
  | 'critique_suppressed';  // critique-gate said no, no confidence to override

export interface IMADGateOptions {
  /** Per-call override of the env-default. */
  enable?: boolean;
  /** Confidence threshold below which debate is considered. Default
   *  `LOCOMO_IMAD_CONFIDENCE_THRESHOLD` (0.65). */
  threshold?: number;
  /** Optional self-critique. When supplied AND confidence < threshold,
   *  the iMAD hesitation classifier acts as a SECOND gate (suppresses
   *  debate when hesitation is low even if confidence is below threshold).
   *  When confidence >= threshold, the critique is ignored — high
   *  confidence wins regardless. */
  selfCritique?: SelfCritique;
  /** Forwarded to `shouldTriggerDebate` when a critique is supplied. */
  imadConfig?: IMADConfig;
}

export interface IMADGateDecision {
  /** Whether the eval-harness should spend the tokens on debate. */
  shouldDebate: boolean;
  /** What gate fired. */
  gateMode: IMADGateMode;
  /** Threshold actually applied. */
  thresholdUsed: number;
  /** Confidence value seen, or null when none was supplied. */
  confidence: number | null;
  /** Short human-readable reason for the decision (logging / observability). */
  reason: string;
}

/**
 * Evaluate the LoCoMo-spec iMAD confidence gate.
 *
 * Decision matrix:
 *
 *   confidence >= threshold                 → shouldDebate = false (high confidence)
 *   confidence <  threshold, no critique    → shouldDebate = true  (low confidence)
 *   confidence <  threshold, low hesitation → shouldDebate = false (iMAD suppresses)
 *   confidence <  threshold, high hesitation→ shouldDebate = true  (iMAD confirms)
 *   confidence  =  null,    critique only  → use critique-gate alone
 *
 * Pure function — same input, same output, no side effects.
 *
 * Default-off via env. The eval-harness flips with a per-call
 * `enable: true` or by setting `H7_IMAD_CONFIDENCE_GATE=true`.
 * When disabled, ALWAYS returns `shouldDebate: false` with
 * `gateMode: 'disabled'` so the caller can fall back to "direct
 * answer" without conditional logic.
 */
export function evaluateIMADConfidenceGate(
  confidence: number | null,
  options: IMADGateOptions = {},
): IMADGateDecision {
  const enable = options.enable ?? H7_IMAD_CONFIDENCE_GATE_DEFAULT;
  const threshold = options.threshold ?? LOCOMO_IMAD_CONFIDENCE_THRESHOLD;

  if (!enable) {
    return {
      shouldDebate: false,
      gateMode: 'disabled',
      thresholdUsed: threshold,
      confidence,
      reason: 'gate disabled (env H7_IMAD_CONFIDENCE_GATE not set)',
    };
  }

  // Fast path: high confidence wins regardless of any critique signal.
  if (typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= threshold) {
    return {
      shouldDebate: false,
      gateMode: 'high_confidence',
      thresholdUsed: threshold,
      confidence,
      reason: `confidence ${confidence.toFixed(3)} >= threshold ${threshold} (skip debate)`,
    };
  }

  // No confidence supplied — fall back to critique-only gating.
  if (confidence === null || !Number.isFinite(confidence)) {
    if (options.selfCritique) {
      const features = extractHesitationFeatures(options.selfCritique);
      const fired = shouldTriggerDebate(features, options.imadConfig);
      return {
        shouldDebate: fired,
        gateMode: fired ? 'critique_only' : 'critique_suppressed',
        thresholdUsed: threshold,
        confidence: null,
        reason: fired
          ? 'no confidence + iMAD critique-gate fired (debate)'
          : 'no confidence + iMAD critique-gate suppressed (skip)',
      };
    }
    // No confidence + no critique → trigger debate by default; the
    // safe choice when we're flying blind. Eval-harness can override
    // by either supplying a confidence or by leaving the gate disabled.
    return {
      shouldDebate: true,
      gateMode: 'low_confidence',
      thresholdUsed: threshold,
      confidence: null,
      reason: 'no confidence signal + no critique → trigger debate (safe default)',
    };
  }

  // confidence < threshold from here on.
  if (options.selfCritique) {
    const features = extractHesitationFeatures(options.selfCritique);
    const fired = shouldTriggerDebate(features, options.imadConfig);
    if (fired) {
      return {
        shouldDebate: true,
        gateMode: 'low_confidence_iMAD',
        thresholdUsed: threshold,
        confidence,
        reason:
          `confidence ${confidence.toFixed(3)} < ${threshold} + iMAD critique fired (debate)`,
      };
    }
    return {
      shouldDebate: false,
      gateMode: 'low_confidence_iMAD_suppressed',
      thresholdUsed: threshold,
      confidence,
      reason:
        `confidence ${confidence.toFixed(3)} < ${threshold} but iMAD critique suppressed (skip)`,
    };
  }

  return {
    shouldDebate: true,
    gateMode: 'low_confidence',
    thresholdUsed: threshold,
    confidence,
    reason: `confidence ${confidence.toFixed(3)} < ${threshold} + no critique (debate)`,
  };
}
