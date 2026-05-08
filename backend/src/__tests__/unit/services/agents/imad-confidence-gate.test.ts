/**
 * iMAD confidence-gate (Phase H7.2) — pure-algo tests.
 *
 * Covers the LoCoMo-spec confidence-gating decision matrix:
 *   confidence >= threshold                 → high_confidence
 *   confidence <  threshold, no critique    → low_confidence
 *   confidence <  threshold, low hesitation → low_confidence_iMAD_suppressed
 *   confidence <  threshold, high hesitation→ low_confidence_iMAD
 *   confidence  =  null,    critique only  → critique_only / critique_suppressed
 *   gate disabled → 'disabled' (always shouldDebate=false)
 */

import {
  evaluateIMADConfidenceGate,
  LOCOMO_IMAD_CONFIDENCE_THRESHOLD,
  type SelfCritique,
} from '../../../../services/agents/imad-debate';

const CRITIQUE_HIGH_HESITATION: SelfCritique = {
  initialReasoning: 'I think might be Alice but maybe Bob, possibly Caroline.',
  counterArgument: 'However, on the other hand, this contradicts the earlier claim. Although uncertain, perhaps the answer is different.',
  initialConfidence: 0.4,
  counterConfidence: 0.6,
};

const CRITIQUE_LOW_HESITATION: SelfCritique = {
  initialReasoning: 'The answer is Alice based on the conversation in May 2024.',
  counterArgument: 'No counter-argument applies; the evidence is clear.',
  initialConfidence: 0.9,
  counterConfidence: 0.95,
};

describe('LOCOMO_IMAD_CONFIDENCE_THRESHOLD — spec mandate', () => {
  it('matches Phase H spec § H7 task 2 value (0.65)', () => {
    expect(LOCOMO_IMAD_CONFIDENCE_THRESHOLD).toBe(0.65);
  });
});

describe('evaluateIMADConfidenceGate — gate disabled (default off)', () => {
  beforeEach(() => {
    delete process.env.H7_IMAD_CONFIDENCE_GATE;
  });

  it('disabled → shouldDebate=false, gateMode=disabled, regardless of confidence', () => {
    const r1 = evaluateIMADConfidenceGate(0.1);
    const r2 = evaluateIMADConfidenceGate(0.9);
    const r3 = evaluateIMADConfidenceGate(null);
    expect(r1.shouldDebate).toBe(false);
    expect(r1.gateMode).toBe('disabled');
    expect(r2.shouldDebate).toBe(false);
    expect(r2.gateMode).toBe('disabled');
    expect(r3.shouldDebate).toBe(false);
    expect(r3.gateMode).toBe('disabled');
  });

  it('disabled + critique supplied → still disabled (no critique-only fallback)', () => {
    const r = evaluateIMADConfidenceGate(null, {
      selfCritique: CRITIQUE_HIGH_HESITATION,
    });
    expect(r.shouldDebate).toBe(false);
    expect(r.gateMode).toBe('disabled');
  });

  it('decision object includes confidence + thresholdUsed for telemetry', () => {
    const r = evaluateIMADConfidenceGate(0.42);
    expect(r.confidence).toBe(0.42);
    expect(r.thresholdUsed).toBe(LOCOMO_IMAD_CONFIDENCE_THRESHOLD);
    expect(typeof r.reason).toBe('string');
  });
});

describe('evaluateIMADConfidenceGate — gate enabled (per-call)', () => {
  it('confidence >= threshold → skip debate (high_confidence)', () => {
    const r = evaluateIMADConfidenceGate(0.7, { enable: true });
    expect(r.shouldDebate).toBe(false);
    expect(r.gateMode).toBe('high_confidence');
    expect(r.confidence).toBe(0.7);
  });

  it('confidence at threshold (0.65) → high_confidence (≥ comparison)', () => {
    const r = evaluateIMADConfidenceGate(0.65, { enable: true });
    expect(r.shouldDebate).toBe(false);
    expect(r.gateMode).toBe('high_confidence');
  });

  it('confidence below threshold + no critique → trigger debate', () => {
    const r = evaluateIMADConfidenceGate(0.5, { enable: true });
    expect(r.shouldDebate).toBe(true);
    expect(r.gateMode).toBe('low_confidence');
  });

  it('confidence below + low-hesitation critique → iMAD suppresses debate', () => {
    const r = evaluateIMADConfidenceGate(0.5, {
      enable: true,
      selfCritique: CRITIQUE_LOW_HESITATION,
    });
    expect(r.shouldDebate).toBe(false);
    expect(r.gateMode).toBe('low_confidence_iMAD_suppressed');
  });

  it('confidence below + high-hesitation critique → iMAD confirms debate', () => {
    const r = evaluateIMADConfidenceGate(0.5, {
      enable: true,
      selfCritique: CRITIQUE_HIGH_HESITATION,
    });
    expect(r.shouldDebate).toBe(true);
    expect(r.gateMode).toBe('low_confidence_iMAD');
  });

  it('confidence ABOVE threshold + critique supplied → critique IGNORED, high_confidence wins', () => {
    const r = evaluateIMADConfidenceGate(0.85, {
      enable: true,
      selfCritique: CRITIQUE_HIGH_HESITATION, // would normally trigger
    });
    expect(r.shouldDebate).toBe(false);
    expect(r.gateMode).toBe('high_confidence');
  });

  it('null confidence + no critique → safe default (debate)', () => {
    const r = evaluateIMADConfidenceGate(null, { enable: true });
    expect(r.shouldDebate).toBe(true);
    expect(r.gateMode).toBe('low_confidence');
  });

  it('null confidence + low-hesitation critique → critique_suppressed', () => {
    const r = evaluateIMADConfidenceGate(null, {
      enable: true,
      selfCritique: CRITIQUE_LOW_HESITATION,
    });
    expect(r.shouldDebate).toBe(false);
    expect(r.gateMode).toBe('critique_suppressed');
  });

  it('null confidence + high-hesitation critique → critique_only fires', () => {
    const r = evaluateIMADConfidenceGate(null, {
      enable: true,
      selfCritique: CRITIQUE_HIGH_HESITATION,
    });
    expect(r.shouldDebate).toBe(true);
    expect(r.gateMode).toBe('critique_only');
  });

  it('NaN confidence treated as null', () => {
    const r1 = evaluateIMADConfidenceGate(NaN, { enable: true });
    expect(r1.gateMode).toBe('low_confidence');

    const r2 = evaluateIMADConfidenceGate(NaN, {
      enable: true,
      selfCritique: CRITIQUE_LOW_HESITATION,
    });
    expect(r2.gateMode).toBe('critique_suppressed');
  });

  it('Infinity confidence treated as null', () => {
    const r = evaluateIMADConfidenceGate(Infinity, { enable: true });
    expect(r.gateMode).toBe('low_confidence');
  });
});

describe('evaluateIMADConfidenceGate — custom threshold + imadConfig', () => {
  it('custom threshold flips a borderline decision', () => {
    // confidence=0.7, default threshold=0.65 → high_confidence
    const def = evaluateIMADConfidenceGate(0.7, { enable: true });
    expect(def.gateMode).toBe('high_confidence');
    // Same confidence, threshold=0.8 → low_confidence
    const tight = evaluateIMADConfidenceGate(0.7, { enable: true, threshold: 0.8 });
    expect(tight.gateMode).toBe('low_confidence');
    expect(tight.thresholdUsed).toBe(0.8);
  });

  it('custom imadConfig is forwarded to shouldTriggerDebate', () => {
    // With aggressive iMAD config (very high debateThreshold), even
    // high-hesitation critique fails to trigger.
    const r = evaluateIMADConfidenceGate(0.5, {
      enable: true,
      selfCritique: CRITIQUE_HIGH_HESITATION,
      imadConfig: {
        debateThreshold: 100, // unreachable
        weights: {
          confidenceGap: 0,
          hedgingScore: 0,
          contradictionScore: 0,
          lengthRatio: 0,
          uncertaintyMarkers: 0,
        },
      },
    });
    expect(r.shouldDebate).toBe(false);
    expect(r.gateMode).toBe('low_confidence_iMAD_suppressed');
  });
});

describe('evaluateIMADConfidenceGate — env-flag default', () => {
  it('H7_IMAD_CONFIDENCE_GATE=true at module load enables without per-call', async () => {
    const prev = process.env.H7_IMAD_CONFIDENCE_GATE;
    process.env.H7_IMAD_CONFIDENCE_GATE = 'true';
    jest.resetModules();
    const mod = await import('../../../../services/agents/imad-debate');
    const r = mod.evaluateIMADConfidenceGate(0.5);
    expect(r.shouldDebate).toBe(true);
    expect(r.gateMode).toBe('low_confidence');

    if (prev === undefined) delete process.env.H7_IMAD_CONFIDENCE_GATE;
    else process.env.H7_IMAD_CONFIDENCE_GATE = prev;
    jest.resetModules();
  });

  it('per-call enable=false beats env=true', async () => {
    const prev = process.env.H7_IMAD_CONFIDENCE_GATE;
    process.env.H7_IMAD_CONFIDENCE_GATE = 'true';
    jest.resetModules();
    const mod = await import('../../../../services/agents/imad-debate');
    const r = mod.evaluateIMADConfidenceGate(0.5, { enable: false });
    expect(r.gateMode).toBe('disabled');

    if (prev === undefined) delete process.env.H7_IMAD_CONFIDENCE_GATE;
    else process.env.H7_IMAD_CONFIDENCE_GATE = prev;
    jest.resetModules();
  });

  it('env truthy variants exact-match contract: "true"/"1"/"yes"', () => {
    const parse = (raw: string) =>
      raw === 'true' || raw === '1' || raw.toLowerCase() === 'yes';
    expect(parse('true')).toBe(true);
    expect(parse('1')).toBe(true);
    expect(parse('yes')).toBe(true);
    expect(parse('YES')).toBe(true);
    expect(parse('TRUE')).toBe(false); // exact match required for "true"
    expect(parse('false')).toBe(false);
    expect(parse('0')).toBe(false);
    expect(parse('')).toBe(false);
  });
});
