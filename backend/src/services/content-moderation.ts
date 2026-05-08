/**
 * Sprint 1.2 — 3-Tier Content-Moderation
 *
 * Tier 1: Regex + LDNOOBW Wordlist (de+en) — schneller Vorfilter, ~1ms, 0 Cost.
 * Tier 2: OpenAI Moderation API — free, ~50ms.
 * Tier 3: Claude Haiku Borderline-Check — nur bei T2-Score 0.4–0.7. ~400ms, ~$0.0003.
 *
 * Eingehängt in:
 *   - POST /api/chat/sessions/* /messages   (vor Persistierung)
 *   - POST /api/social/*                    (vor Veröffentlichung)
 *   - POST /api/email/* /send               (vor Send)
 *
 * Bei Block: 422 mit Appeal-Token. Audit in public.moderation_decisions.
 *
 * Fail-open bei T2/T3-Ausfällen: Verfügbarkeit > Perfektion, und T1 bleibt
 * ohnehin als Sicherheitsnetz aktiv. Fail-closed wäre ein trivialer
 * DoS-Vektor gegen Chat/Email.
 */

import crypto from 'crypto';
import { queryPublic } from '../utils/database-context';
import { logger } from '../utils/logger';
import { checkedFetch } from '../utils/checked-http';
import { matchLDNOOBW } from './moderation/ldnoobw-loader';
// Note: claude/client is loaded lazily inside runTier3() to avoid pulling
// config-constants into modules that are imported at route-registration time
// (some integration tests mock constants before the module graph resolves).

// ===========================================
// Types
// ===========================================

export type ModerationSurface = 'chat' | 'social' | 'email' | 'marketplace';
export type ModerationTier = 'regex' | 'openai' | 'claude';
export type ModerationDecision = 'allow' | 'block';
export type AppealStatus = 'none' | 'pending' | 'upheld' | 'overturned';

export interface ModerationResult {
  decision: ModerationDecision;
  tier: ModerationTier;
  score: number; // 0–1 (0 = clean, 1 = definitely harmful)
  categories: string[]; // e.g. ['hate', 'sexual/minors']
  reason: string; // human-readable
  appealToken: string | null; // only set on block
  decisionId: string; // UUID of moderation_decisions row
}

export interface ModerationInput {
  content: string;
  surface: ModerationSurface;
  userId?: string | null;
  skipPersist?: boolean;
}

// ===========================================
// Tier 1: Regex + LDNOOBW Wordlist
// ===========================================

/**
 * Minimal LDNOOBW-Auszug (de+en). Für Prod-Use sollte dies aus einer
 * generierten Datei geladen werden (externe Source: List of Dirty, Naughty,
 * Obscene and Otherwise Bad Words von Shutterstock).
 *
 * Sprint 1.10: Dict jetzt aus `moderation/ldnoobw-{de,en}.json` geladen
 * (build-script: scripts/moderation/build-ldnoobw.ts). Tier 2/3 unverändert —
 * Tier 1 erwischt mehr, False-Positives bleiben durch strikte word-boundary-
 * Regex niedrig.
 */

/**
 * Regex-Muster für strukturelle Verstöße (Credit-Card, API-Keys, Passwörter im Klartext).
 */
const STRUCTURAL_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'credit_card_like', re: /\b(?:\d[ -]*?){13,16}\b/ },
  // Anthropic Keys sind i.d.R. `sk-ant-…`
  { name: 'leaked_api_key', re: /\bsk-[a-z0-9_-]{20,}/i },
];

interface Tier1Hit {
  matched: boolean;
  categories: string[];
  reason: string;
}

function runTier1(content: string): Tier1Hit {
  const categories: string[] = [];
  const reasons: string[] = [];

  const wordHit = matchLDNOOBW(content);
  if (wordHit && wordHit.severity === 'block') {
    categories.push('ldnoobw');
    const head = wordHit.pattern.split(' ')[0];
    reasons.push(`wordlist(${wordHit.language}): ${head}…`);
  }

  for (const pattern of STRUCTURAL_PATTERNS) {
    if (pattern.re.test(content)) {
      categories.push(pattern.name);
      reasons.push(`pattern: ${pattern.name}`);
    }
  }

  return {
    matched: categories.length > 0,
    categories,
    reason: reasons.join('; ') || 'tier1 pass',
  };
}

// ===========================================
// Tier 2: OpenAI Moderation API
// ===========================================

interface OpenAIModerationResponse {
  results: Array<{
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  }>;
}

interface Tier2Result {
  available: boolean;
  flagged: boolean;
  maxScore: number;
  categories: string[];
  raw?: OpenAIModerationResponse['results'][0];
}

async function runTier2(content: string): Promise<Tier2Result> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { available: false, flagged: false, maxScore: 0, categories: [] };
  }

  try {
    const res = await checkedFetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: content }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`OpenAI moderation returned ${res.status}`);
    }
    const data = (await res.json()) as OpenAIModerationResponse;
    const r = data.results[0];
    if (!r) return { available: true, flagged: false, maxScore: 0, categories: [] };

    const categories = Object.entries(r.categories)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const maxScore = Math.max(...Object.values(r.category_scores), 0);

    return {
      available: true,
      flagged: r.flagged,
      maxScore,
      categories,
      raw: r,
    };
  } catch (err) {
    logger.warn('Tier 2 (OpenAI Moderation) failed, falling through', {
      operation: 'moderation',
      error: err instanceof Error ? err.message : String(err),
    });
    return { available: false, flagged: false, maxScore: 0, categories: [] };
  }
}

// ===========================================
// Tier 3: Claude Haiku Borderline Check
// ===========================================

interface Tier3Result {
  available: boolean;
  decision: ModerationDecision;
  score: number;
  reasoning: string;
}

async function runTier3(content: string, tier2Context: Tier2Result): Promise<Tier3Result> {
  // Lazy-load to keep module-init side-effect-free (see note at top of file).
  const { getClaudeClient, isClaudeAvailable, MODEL_CONFIG } = await import('./claude/client');
  if (!isClaudeAvailable()) {
    return { available: false, decision: 'allow', score: 0.5, reasoning: 'tier3 unavailable' };
  }

  try {
    const client = getClaudeClient();
    const categoriesHint = tier2Context.categories.length > 0
      ? `OpenAI flagged potential issues in: ${tier2Context.categories.join(', ')}`
      : 'No upstream flags, but the score was borderline.';

    const response = await client.messages.create({
      model: MODEL_CONFIG.haiku,
      max_tokens: 256,
      system: `You are a conservative content-safety reviewer. Decide BLOCK or ALLOW for user-generated content.
Respond ONLY as strict JSON: { "decision": "block" | "allow", "score": 0..1, "reasoning": "short" }.
Context: ${categoriesHint}.
Rules:
- BLOCK genuine hate speech, incitement to violence, sexual content involving minors, doxxing, or credible self-harm incitement.
- ALLOW legitimate discussion of these topics (news, research, fiction, therapy).
- ALLOW borderline profanity or strong opinions.
- If unsure between block and allow, prefer allow (false-negative is recoverable via appeal, false-positive damages trust).`,
      messages: [{ role: 'user', content: content.slice(0, 2000) }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { available: true, decision: 'allow', score: 0.5, reasoning: 'tier3 empty response' };
    }

    // Tolerant: akzeptiere auch Haiku-Antworten mit Fluff um das JSON.
    const match = textBlock.text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { available: true, decision: 'allow', score: 0.5, reasoning: 'tier3 no JSON' };
    }

    const parsed = JSON.parse(match[0]) as {
      decision?: string;
      score?: number;
      reasoning?: string;
    };

    const decision: ModerationDecision = parsed.decision === 'block' ? 'block' : 'allow';
    const score = typeof parsed.score === 'number'
      ? Math.min(Math.max(parsed.score, 0), 1)
      : 0.5;
    return {
      available: true,
      decision,
      score,
      reasoning: parsed.reasoning || 'tier3 decision',
    };
  } catch (err) {
    logger.warn('Tier 3 (Claude Haiku) failed, falling through', {
      operation: 'moderation',
      error: err instanceof Error ? err.message : String(err),
    });
    return { available: false, decision: 'allow', score: 0.5, reasoning: 'tier3 error' };
  }
}

// ===========================================
// Persistence
// ===========================================

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

async function persistDecision(params: {
  userId: string | null;
  surface: ModerationSurface;
  content: string;
  tier: ModerationTier;
  decision: ModerationDecision;
  score: number;
  categories: string[];
  metadata: Record<string, unknown>;
}): Promise<{ id: string; appealToken: string | null }> {
  const appealToken = params.decision === 'block'
    ? crypto.randomBytes(24).toString('base64url')
    : null;

  const result = await queryPublic(
    `
    INSERT INTO public.moderation_decisions
      (user_id, surface, content_hash, content_excerpt,
       tier, decision, categories, score, appeal_token, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb)
    RETURNING id
    `,
    [
      params.userId,
      params.surface,
      sha256(params.content),
      params.content.slice(0, 280),
      params.tier,
      params.decision,
      JSON.stringify(params.categories),
      params.score,
      appealToken,
      JSON.stringify(params.metadata),
    ]
  );

  return { id: (result.rows[0] as { id: string }).id, appealToken };
}

// ===========================================
// Main Entry — 3-Tier Cascade
// ===========================================

/**
 * Tier-Thresholds:
 *   - T2 score ≥ 0.7 → sofort Block
 *   - T2 score 0.4–0.7 → zu T3 (Borderline-Arbitration)
 *   - T2 score < 0.4 → Allow
 */
const T2_BLOCK_THRESHOLD = 0.7;
const T2_BORDERLINE_MIN = 0.4;

export async function moderateContent(input: ModerationInput): Promise<ModerationResult> {
  const content = (input.content || '').trim();
  if (!content) {
    return {
      decision: 'allow',
      tier: 'regex',
      score: 0,
      categories: [],
      reason: 'empty content',
      appealToken: null,
      decisionId: '',
    };
  }

  // Tier 1
  const t1 = runTier1(content);
  if (t1.matched) {
    const { id, appealToken } = input.skipPersist
      ? { id: '', appealToken: null }
      : await persistDecision({
          userId: input.userId || null,
          surface: input.surface,
          content,
          tier: 'regex',
          decision: 'block',
          score: 1,
          categories: t1.categories,
          metadata: { reason: t1.reason },
        });

    return {
      decision: 'block',
      tier: 'regex',
      score: 1,
      categories: t1.categories,
      reason: t1.reason,
      appealToken,
      decisionId: id,
    };
  }

  // Tier 2
  const t2 = await runTier2(content);
  if (t2.available) {
    if (t2.maxScore >= T2_BLOCK_THRESHOLD || t2.flagged) {
      const { id, appealToken } = input.skipPersist
        ? { id: '', appealToken: null }
        : await persistDecision({
            userId: input.userId || null,
            surface: input.surface,
            content,
            tier: 'openai',
            decision: 'block',
            score: t2.maxScore,
            categories: t2.categories,
            metadata: { raw: t2.raw || null },
          });
      return {
        decision: 'block',
        tier: 'openai',
        score: t2.maxScore,
        categories: t2.categories,
        reason: `openai flag: ${t2.categories.join(', ')}`,
        appealToken,
        decisionId: id,
      };
    }

    // Tier 3 (borderline)
    if (t2.maxScore >= T2_BORDERLINE_MIN) {
      const t3 = await runTier3(content, t2);
      if (t3.decision === 'block') {
        const { id, appealToken } = input.skipPersist
          ? { id: '', appealToken: null }
          : await persistDecision({
              userId: input.userId || null,
              surface: input.surface,
              content,
              tier: 'claude',
              decision: 'block',
              score: Math.max(t3.score, t2.maxScore),
              categories: t2.categories,
              metadata: { tier3_reasoning: t3.reasoning, tier2_score: t2.maxScore },
            });
        return {
          decision: 'block',
          tier: 'claude',
          score: Math.max(t3.score, t2.maxScore),
          categories: t2.categories,
          reason: t3.reasoning,
          appealToken,
          decisionId: id,
        };
      }
      // T3 allow → allow & persist (niedriges Volumen, für Audit-Trail relevant)
      const { id } = input.skipPersist
        ? { id: '' }
        : await persistDecision({
            userId: input.userId || null,
            surface: input.surface,
            content,
            tier: 'claude',
            decision: 'allow',
            score: t3.score,
            categories: t2.categories,
            metadata: { tier3_reasoning: t3.reasoning, tier2_score: t2.maxScore },
          });
      return {
        decision: 'allow',
        tier: 'claude',
        score: t3.score,
        categories: t2.categories,
        reason: t3.reasoning,
        appealToken: null,
        decisionId: id,
      };
    }
  }

  // Alles klar
  return {
    decision: 'allow',
    tier: t2.available ? 'openai' : 'regex',
    score: t2.maxScore,
    categories: [],
    reason: 'no flags',
    appealToken: null,
    decisionId: '',
  };
}

// ===========================================
// Appeal-Workflow
// ===========================================

export interface SubmitAppealInput {
  appealToken: string;
  userId: string | null;
  reason: string;
}

export interface Appeal {
  id: string;
  decision_id: string;
  user_id: string | null;
  user_reason: string;
  status: 'submitted' | 'reviewing' | 'upheld' | 'overturned';
  reviewer_id: string | null;
  reviewer_notes: string | null;
  sla_deadline: string;
  submitted_at: string;
  resolved_at: string | null;
}

export async function submitAppeal(input: SubmitAppealInput): Promise<Appeal> {
  // Token auflösen
  const decisionRes = await queryPublic(
    `SELECT id, appeal_status FROM public.moderation_decisions WHERE appeal_token = $1`,
    [input.appealToken]
  );
  const row = decisionRes.rows[0] as { id: string; appeal_status: AppealStatus } | undefined;
  if (!row) {
    throw Object.assign(new Error('Appeal-Token nicht gefunden oder ungültig'), { statusCode: 404 });
  }
  if (row.appeal_status !== 'none' && row.appeal_status !== 'pending') {
    throw Object.assign(
      new Error('Dieser Fall wurde bereits entschieden'),
      { statusCode: 409 }
    );
  }

  // Decision auf 'pending' flaggen
  await queryPublic(
    `UPDATE public.moderation_decisions SET appeal_status = 'pending' WHERE id = $1`,
    [row.id]
  );

  const result = await queryPublic(
    `
    INSERT INTO public.moderation_appeals
      (decision_id, user_id, user_reason)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [row.id, input.userId, input.reason.slice(0, 2000)]
  );

  logger.info('Moderation appeal submitted', {
    operation: 'moderation',
    decisionId: row.id,
    userId: input.userId || undefined,
  });

  return result.rows[0] as Appeal;
}

export async function listPendingAppeals(limit = 50): Promise<Appeal[]> {
  const result = await queryPublic(
    `
    SELECT * FROM public.moderation_appeals
    WHERE status IN ('submitted', 'reviewing')
    ORDER BY sla_deadline ASC
    LIMIT $1
    `,
    [limit]
  );
  return result.rows as Appeal[];
}

export async function resolveAppeal(params: {
  appealId: string;
  reviewerId: string;
  decision: 'upheld' | 'overturned';
  notes?: string;
}): Promise<Appeal> {
  const status = params.decision;
  const appealRes = await queryPublic(
    `
    UPDATE public.moderation_appeals
    SET status = $1, reviewer_id = $2, reviewer_notes = $3, resolved_at = NOW()
    WHERE id = $4
    RETURNING *
    `,
    [status, params.reviewerId, params.notes || null, params.appealId]
  );
  const appeal = appealRes.rows[0] as Appeal | undefined;
  if (!appeal) {
    throw Object.assign(new Error('Appeal nicht gefunden'), { statusCode: 404 });
  }

  await queryPublic(
    `UPDATE public.moderation_decisions SET appeal_status = $1 WHERE id = $2`,
    [status, appeal.decision_id]
  );

  return appeal;
}
