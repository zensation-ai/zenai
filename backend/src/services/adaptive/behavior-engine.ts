/**
 * Phase 138: Adaptive Behavior Engine
 *
 * Learns user preferences from behavioral signals and adapts AI responses
 * accordingly. Tracks response length, detail level, proactivity, tool
 * preferences, and language style.
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BehaviorPreferences {
  responseLength: 'brief' | 'moderate' | 'detailed';
  detailLevel: 'beginner' | 'intermediate' | 'expert';
  proactivityLevel: 'low' | 'medium' | 'high';
  preferredTools: string[];
  languageStyle: 'formal' | 'casual';
}

export interface BehaviorSignal {
  type:
    | 'length_feedback'
    | 'detail_feedback'
    | 'suggestion_action'
    | 'tool_preference'
    | 'style_feedback';
  value: number; // -1 to +1
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PREFERENCES: BehaviorPreferences = {
  responseLength: 'moderate',
  detailLevel: 'intermediate',
  proactivityLevel: 'medium',
  preferredTools: [],
  languageStyle: 'formal',
};

// ---------------------------------------------------------------------------
// Inference helpers
// ---------------------------------------------------------------------------

function avgValue(signals: BehaviorSignal[], type: BehaviorSignal['type']): number | null {
  const filtered = signals.filter((s) => s.type === type);
  if (filtered.length === 0) return null;
  const sum = filtered.reduce((acc, s) => acc + s.value, 0);
  return sum / filtered.length;
}

/**
 * Infer preferred response length from length_feedback signals.
 * avg < -0.3 → brief, avg > 0.3 → detailed, else moderate
 */
export function inferResponseLength(signals: BehaviorSignal[]): 'brief' | 'moderate' | 'detailed' {
  const avg = avgValue(signals, 'length_feedback');
  if (avg === null) return 'moderate';
  if (avg < -0.3) return 'brief';
  if (avg > 0.3) return 'detailed';
  return 'moderate';
}

/**
 * Infer detail level from detail_feedback signals.
 * avg < -0.3 → beginner, avg > 0.3 → expert, else intermediate
 */
export function inferDetailLevel(
  signals: BehaviorSignal[],
): 'beginner' | 'intermediate' | 'expert' {
  const avg = avgValue(signals, 'detail_feedback');
  if (avg === null) return 'intermediate';
  if (avg < -0.3) return 'beginner';
  if (avg > 0.3) return 'expert';
  return 'intermediate';
}

/**
 * Infer proactivity level from suggestion_action signals.
 * Acceptance rate (value > 0) determines the level.
 * < 30% → low, > 60% → high, else medium
 */
export function inferProactivityLevel(signals: BehaviorSignal[]): 'low' | 'medium' | 'high' {
  const actions = signals.filter((s) => s.type === 'suggestion_action');
  if (actions.length === 0) return 'medium';
  const accepted = actions.filter((s) => s.value > 0).length;
  const rate = accepted / actions.length;
  if (rate < 0.3) return 'low';
  if (rate > 0.6) return 'high';
  return 'medium';
}

/**
 * Infer preferred tools from tool_preference signals.
 * Returns tools with net-positive preference, sorted by aggregate value desc.
 */
export function inferPreferredTools(signals: BehaviorSignal[]): string[] {
  const toolSignals = signals.filter(
    (s) => s.type === 'tool_preference' && s.details?.toolName,
  );
  if (toolSignals.length === 0) return [];

  const toolScores = new Map<string, number>();
  for (const s of toolSignals) {
    const name = s.details!.toolName as string;
    toolScores.set(name, (toolScores.get(name) ?? 0) + s.value);
  }

  return [...toolScores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

/**
 * Build a complete BehaviorPreferences object from a collection of signals.
 */
export function buildBehaviorPreferences(signals: BehaviorSignal[]): BehaviorPreferences {
  const styleAvg = avgValue(signals, 'style_feedback');
  const languageStyle: 'formal' | 'casual' =
    styleAvg !== null && styleAvg < 0 ? 'casual' : 'formal';

  return {
    responseLength: inferResponseLength(signals),
    detailLevel: inferDetailLevel(signals),
    proactivityLevel: inferProactivityLevel(signals),
    preferredTools: inferPreferredTools(signals),
    languageStyle,
  };
}

/**
 * Map BehaviorPreferences to concrete config adjustments for the AI system.
 */
export function applyPreferences(prefs: BehaviorPreferences): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  // Response length → max tokens
  switch (prefs.responseLength) {
    case 'brief':
      config.maxTokens = 512;
      break;
    case 'detailed':
      config.maxTokens = 4096;
      break;
    default:
      config.maxTokens = 2048;
  }

  // Detail level → temperature + system prompt hint
  switch (prefs.detailLevel) {
    case 'beginner':
      config.temperature = 0.7;
      config.systemHint = 'Explain concepts simply. Avoid jargon.';
      break;
    case 'expert':
      config.temperature = 0.5;
      config.systemHint = 'Use precise technical language. Be concise.';
      break;
    default:
      config.temperature = 0.6;
      config.systemHint = 'Balance clarity with depth.';
  }

  // Proactivity
  config.proactiveEnabled = prefs.proactivityLevel !== 'low';
  config.proactiveThreshold = prefs.proactivityLevel === 'high' ? 0.3 : 0.6;

  // Preferred tools
  if (prefs.preferredTools.length > 0) {
    config.preferredTools = prefs.preferredTools;
  }

  // Language style
  config.formalStyle = prefs.languageStyle === 'formal';

  return config;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Record a single behavior signal to the database (fire-and-forget).
 */
export async function recordBehaviorSignal(
  context: string,
  signal: BehaviorSignal,
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO behavior_signals (type, value, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [signal.type, signal.value, JSON.stringify(signal.details ?? {})],
    );
    logger.debug('Behavior signal recorded', { context, type: signal.type });
  } catch (err) {
    logger.warn('Failed to record behavior signal', { error: err });
  }
}

/**
 * Load behavior preferences for a context (optionally filtered by userId).
 * Fetches the last 200 signals and builds preferences from them.
 */
export async function loadBehaviorPreferences(
  context: string,
  userId?: string,
): Promise<BehaviorPreferences> {
  try {
    const userClause = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];
    const result = await queryContext(
      context,
      `SELECT type, value, details FROM behavior_signals
       WHERE 1=1 ${userClause}
       ORDER BY created_at DESC LIMIT 200`,
      params,
    );

    if (!result?.rows?.length) {
      return { ...DEFAULT_PREFERENCES };
    }

    const signals: BehaviorSignal[] = result.rows.map((r: Record<string, unknown>) => ({
      type: r.type as BehaviorSignal['type'],
      value: Number(r.value),
      details: typeof r.details === 'string' ? JSON.parse(r.details as string) : (r.details as Record<string, unknown> | undefined),
    }));

    return buildBehaviorPreferences(signals);
  } catch (err) {
    logger.warn('Failed to load behavior preferences, using defaults', { error: err });
    return { ...DEFAULT_PREFERENCES };
  }
}
