/**
 * Workflow Boundary Detector
 *
 * Detects workflow transitions and triggers contextual suggestions.
 * Based on CHI 2025 research: suggestions at workflow boundaries
 * (not mid-task) yield 12-18% better task completion.
 *
 * Triggers:
 * - IDEA_SAVED: After saving an idea → suggest similar ideas
 * - CHAT_SESSION_END: After chat ends → suggest creating an idea
 * - LOGIN_AFTER_ABSENCE: After >4h absence → show summary
 * - DRAFT_COMPLETED: After draft is done → suggest related reviews
 *
 * Format (CHI 2025): Questions, not statements.
 * Frequency: Max 3/hour, max 10/day, respect quiet hours.
 *
 * @module services/workflow-boundary-detector
 */

import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type BoundaryTrigger =
  | 'idea_saved'
  | 'chat_session_end'
  | 'login_after_absence'
  | 'draft_completed';

export interface BoundarySuggestion {
  trigger: BoundaryTrigger;
  message: string;
  /** Related entity IDs (ideas, drafts, etc.) */
  relatedIds: string[];
  /** Suggested action */
  action: BoundaryAction;
  /** Confidence in the suggestion's relevance */
  confidence: number;
}

export interface BoundaryAction {
  type: 'view_idea' | 'create_idea' | 'review_ideas' | 'view_summary';
  label: string;
  params?: Record<string, unknown>;
}

interface FrequencyState {
  hourlyCount: number;
  dailyCount: number;
  lastSuggestionAt: number;
}

// ===========================================
// Configuration
// ===========================================

const LIMITS = {
  MAX_PER_HOUR: 3,
  MAX_PER_DAY: 10,
  MIN_GAP_MS: 60_000, // At least 1 minute between suggestions
  ABSENCE_THRESHOLD_MS: 4 * 60 * 60 * 1000, // 4 hours
  QUIET_HOURS_START: 22, // 10 PM
  QUIET_HOURS_END: 7,    // 7 AM
};

// In-memory frequency tracking (per context)
const frequencyState = new Map<string, FrequencyState>();

// ===========================================
// Frequency Control
// ===========================================

function canSuggest(context: AIContext): boolean {
  const now = Date.now();
  const hour = new Date().getHours();

  // Check quiet hours
  if (hour >= LIMITS.QUIET_HOURS_START || hour < LIMITS.QUIET_HOURS_END) {
    return false;
  }

  const state = frequencyState.get(context) || { hourlyCount: 0, dailyCount: 0, lastSuggestionAt: 0 };

  // Reset counters if needed
  const hourAgo = now - 3600_000;
  const dayAgo = now - 86400_000;

  if (state.lastSuggestionAt < hourAgo) {
    state.hourlyCount = 0;
  }
  if (state.lastSuggestionAt < dayAgo) {
    state.dailyCount = 0;
  }

  if (state.hourlyCount >= LIMITS.MAX_PER_HOUR) return false;
  if (state.dailyCount >= LIMITS.MAX_PER_DAY) return false;
  if (now - state.lastSuggestionAt < LIMITS.MIN_GAP_MS) return false;

  return true;
}

function recordSuggestion(context: AIContext): void {
  const state = frequencyState.get(context) || { hourlyCount: 0, dailyCount: 0, lastSuggestionAt: 0 };
  state.hourlyCount++;
  state.dailyCount++;
  state.lastSuggestionAt = Date.now();
  frequencyState.set(context, state);
}

// ===========================================
// Boundary Handlers
// ===========================================

/**
 * Trigger: After an idea is saved.
 * Suggests similar ideas that might be related.
 */
async function onIdeaSaved(
  ideaId: string,
  ideaTitle: string,
  context: AIContext
): Promise<BoundarySuggestion | null> {
  if (!canSuggest(context)) return null;

  try {
    // Find similar ideas (keyword-based for speed)
    const similar = await queryContext(
      context,
      `SELECT id, title FROM ideas
       WHERE id != $1 AND (title ILIKE $2 OR summary ILIKE $2)
       ORDER BY created_at DESC
       LIMIT 3`,
      [ideaId, `%${ideaTitle.split(' ').slice(0, 3).join('%')}%`]
    );

    if (similar.rows.length === 0) return null;

    const titles = similar.rows.map((r: { title: string }) => r.title).join('", "');
    recordSuggestion(context);

    return {
      trigger: 'idea_saved',
      message: `Könnte "${ideaTitle}" mit "${titles}" zusammenhängen? Schau dir die Verbindungen an.`,
      relatedIds: similar.rows.map((r: { id: string }) => r.id),
      action: {
        type: 'review_ideas',
        label: 'Verbindungen ansehen',
        params: { ideaIds: similar.rows.map((r: { id: string }) => r.id) },
      },
      confidence: 0.7,
    };
  } catch (error) {
    logger.debug('Workflow boundary: idea_saved failed', { error });
    return null;
  }
}

/**
 * Trigger: After a chat session ends (no message for >5 min or explicit end).
 * Suggests creating an idea from the conversation.
 */
async function onChatSessionEnd(
  sessionId: string,
  context: AIContext
): Promise<BoundarySuggestion | null> {
  if (!canSuggest(context)) return null;

  try {
    // Check if the session had substantive messages
    const messages = await queryContext(
      context,
      `SELECT COUNT(*) as count FROM chat_messages
       WHERE session_id = $1 AND role = 'assistant'`,
      [sessionId]
    );

    const messageCount = parseInt(messages.rows[0]?.count ?? '0', 10);
    if (messageCount < 2) return null;

    recordSuggestion(context);

    return {
      trigger: 'chat_session_end',
      message: 'Möchtest du aus diesem Gespräch eine Idee oder Notiz erstellen?',
      relatedIds: [sessionId],
      action: {
        type: 'create_idea',
        label: 'Idee aus Chat erstellen',
        params: { sessionId },
      },
      confidence: 0.6,
    };
  } catch (error) {
    logger.debug('Workflow boundary: chat_session_end failed', { error });
    return null;
  }
}

/**
 * Trigger: User logs in after >4h absence.
 * Shows a summary of what happened since last visit.
 */
async function onLoginAfterAbsence(
  lastActiveAt: Date,
  context: AIContext
): Promise<BoundarySuggestion | null> {
  if (!canSuggest(context)) return null;

  const lastActiveDate = lastActiveAt instanceof Date ? lastActiveAt : new Date(lastActiveAt);
  const absenceMs = Date.now() - lastActiveDate.getTime();
  if (absenceMs < LIMITS.ABSENCE_THRESHOLD_MS) return null;

  try {
    // Count new items since last active
    const newIdeas = await queryContext(
      context,
      `SELECT COUNT(*) as count FROM ideas WHERE created_at > $1`,
      [lastActiveDate.toISOString()]
    );

    const newDrafts = await queryContext(
      context,
      `SELECT COUNT(*) as count FROM drafts WHERE created_at > $1`,
      [lastActiveDate.toISOString()]
    );

    const ideaCount = parseInt(newIdeas.rows[0]?.count ?? '0', 10);
    const draftCount = parseInt(newDrafts.rows[0]?.count ?? '0', 10);

    if (ideaCount === 0 && draftCount === 0) return null;

    const hours = Math.round(absenceMs / 3600_000);
    const parts: string[] = [];
    if (ideaCount > 0) parts.push(`${ideaCount} neue Idee${ideaCount !== 1 ? 'n' : ''}`);
    if (draftCount > 0) parts.push(`${draftCount} neue${draftCount !== 1 ? '' : 'r'} Entwurf${draftCount !== 1 ? 'e' : ''}`);

    recordSuggestion(context);

    return {
      trigger: 'login_after_absence',
      message: `Seit deinem letzten Besuch vor ${hours}h: ${parts.join(' und ')}. Möchtest du einen Überblick?`,
      relatedIds: [],
      action: {
        type: 'view_summary',
        label: 'Überblick anzeigen',
        params: { since: lastActiveAt.toISOString() },
      },
      confidence: 0.8,
    };
  } catch (error) {
    logger.debug('Workflow boundary: login_after_absence failed', { error });
    return null;
  }
}

/**
 * Trigger: After a draft is completed/accepted.
 * Suggests reviewing related ideas.
 */
async function onDraftCompleted(
  draftId: string,
  ideaTitle: string,
  context: AIContext
): Promise<BoundarySuggestion | null> {
  if (!canSuggest(context)) return null;

  try {
    recordSuggestion(context);

    return {
      trigger: 'draft_completed',
      message: `Entwurf für "${ideaTitle}" fertig! Hast du verwandte Ideen, die davon profitieren könnten?`,
      relatedIds: [draftId],
      action: {
        type: 'review_ideas',
        label: 'Verwandte Ideen ansehen',
        params: { searchQuery: ideaTitle },
      },
      confidence: 0.65,
    };
  } catch (error) {
    logger.debug('Workflow boundary: draft_completed failed', { error });
    return null;
  }
}

// ===========================================
// Public API
// ===========================================

/**
 * Process a workflow boundary event and optionally generate a suggestion.
 */
export async function processWorkflowBoundary(
  trigger: BoundaryTrigger,
  context: AIContext,
  params: Record<string, unknown> = {}
): Promise<BoundarySuggestion | null> {
  logger.debug('Processing workflow boundary', { trigger, context });

  switch (trigger) {
    case 'idea_saved':
      return onIdeaSaved(
        params.ideaId as string,
        params.ideaTitle as string,
        context
      );

    case 'chat_session_end':
      return onChatSessionEnd(
        params.sessionId as string,
        context
      );

    case 'login_after_absence':
      return onLoginAfterAbsence(
        params.lastActiveAt as Date,
        context
      );

    case 'draft_completed':
      return onDraftCompleted(
        params.draftId as string,
        params.ideaTitle as string,
        context
      );

    default:
      return null;
  }
}

/**
 * Get current frequency state (for debugging/monitoring).
 */
export function getFrequencyState(context: AIContext): FrequencyState {
  return frequencyState.get(context) || { hourlyCount: 0, dailyCount: 0, lastSuggestionAt: 0 };
}

/**
 * Reset frequency state (for testing).
 */
export function resetFrequencyState(context?: AIContext): void {
  if (context) {
    frequencyState.delete(context);
  } else {
    frequencyState.clear();
  }
}
