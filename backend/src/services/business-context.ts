/**
 * Business Context Service - Unified context for personalized AI responses
 *
 * Combines data from:
 * - Business Profile (company, industry, role, tech stack)
 * - Learning Engine (preferences, patterns)
 * - Recent Activity (topics, interactions)
 *
 * Used to generate personalized system prompts for LLM calls.
 */

import { logger } from '../utils/logger';
import { AIContext, queryContext } from '../utils/database-context';
import { getOrCreateProfile, BusinessProfile } from './business-profile-learning';

// ===========================================
// Types
// ===========================================

export interface UnifiedBusinessContext {
  profile: BusinessProfile | null;
  learningInsights: LearningInsights;
  recentTopics: string[];
  contextDepthScore: number; // 0-100, how much the system knows
}

export interface LearningInsights {
  preferredCategories: string[];
  preferredTypes: string[];
  communicationStyle: string | null;
  peakProductiveHours: number[];
  topKeywords: string[];
}

export interface ContextSignal {
  id: string;
  context: AIContext;
  signal_type: 'idea' | 'meeting' | 'slack' | 'calendar' | 'feedback' | 'correction';
  signal_data: Record<string, unknown>;
  extracted_insights: Record<string, unknown> | null;
  applied_to_profile: boolean;
  created_at: string;
}

// ===========================================
// Main Functions
// ===========================================

/**
 * Get unified context combining all sources
 */
export async function getUnifiedContext(context: AIContext): Promise<UnifiedBusinessContext> {
  try {
    // Load data in parallel
    const [profile, learningInsights, recentTopics] = await Promise.all([
      getOrCreateProfile(context).catch(() => null),
      getLearningInsights(context),
      getRecentTopics(context),
    ]);

    // Calculate context depth score
    const contextDepthScore = calculateContextDepth(profile, learningInsights, recentTopics);

    return {
      profile,
      learningInsights,
      recentTopics,
      contextDepthScore,
    };
  } catch {
    logger.warn('Failed to get unified context, returning empty', { context });
    return {
      profile: null,
      learningInsights: {
        preferredCategories: [],
        preferredTypes: [],
        communicationStyle: null,
        peakProductiveHours: [],
        topKeywords: [],
      },
      recentTopics: [],
      contextDepthScore: 0,
    };
  }
}

/**
 * Build a personalized system prompt for LLM calls
 */
export async function buildSystemPrompt(
  context: AIContext,
  taskType: 'structuring' | 'summary' | 'research' | 'chat'
): Promise<string> {
  const unified = await getUnifiedContext(context);

  const parts: string[] = [];

  // Base instruction based on task type
  const baseInstructions: Record<string, string> = {
    structuring: 'Du bist ein Gedankenstrukturierer für intelligente Menschen.',
    summary: 'Du bist ein Zusammenfassungs-Assistent.',
    research: 'Du bist ein Recherche-Assistent.',
    chat: 'Du bist ein hilfreicher KI-Assistent.',
  };

  parts.push(baseInstructions[taskType] || baseInstructions.chat);

  // Add user context if available
  if (unified.profile) {
    const contextParts: string[] = [];

    if (unified.profile.role) {
      contextParts.push(`Der Nutzer arbeitet als ${unified.profile.role}.`);
    }

    if (unified.profile.industry) {
      contextParts.push(`Branche: ${unified.profile.industry}.`);
    }

    if (unified.profile.company_name) {
      contextParts.push(`Unternehmen: ${unified.profile.company_name}.`);
    }

    if (unified.profile.tech_stack && unified.profile.tech_stack.length > 0) {
      contextParts.push(`Tech-Stack: ${unified.profile.tech_stack.slice(0, 8).join(', ')}.`);
    }

    if (unified.profile.goals && unified.profile.goals.length > 0) {
      contextParts.push(`Aktuelle Ziele: ${unified.profile.goals.slice(0, 3).join('; ')}.`);
    }

    if (contextParts.length > 0) {
      parts.push('\n[Nutzer-Kontext]');
      parts.push(contextParts.join('\n'));
    }
  }

  // Add learning insights
  if (unified.learningInsights.topKeywords.length > 0) {
    parts.push(`\nHäufige Themen: ${unified.learningInsights.topKeywords.slice(0, 5).join(', ')}.`);
  }

  if (unified.learningInsights.communicationStyle) {
    parts.push(`Bevorzugter Stil: ${unified.learningInsights.communicationStyle}.`);
  }

  // Add recent context
  if (unified.recentTopics.length > 0) {
    parts.push(`\nAktuelle Themen: ${unified.recentTopics.slice(0, 5).join(', ')}.`);
  }

  return parts.join('\n');
}

/**
 * Track when context is used for an idea
 */
export async function trackContextUsage(
  context: AIContext,
  ideaId: string,
  contextUsed: Partial<UnifiedBusinessContext>
): Promise<void> {
  try {
    await recordContextSignal(context, 'idea', {
      idea_id: ideaId,
      context_depth: contextUsed.contextDepthScore,
      profile_used: !!contextUsed.profile,
      topics_used: contextUsed.recentTopics?.length || 0,
    });
  } catch {
    logger.warn('Failed to track context usage', { ideaId });
  }
}

/**
 * Record a context signal for learning
 */
export async function recordContextSignal(
  context: AIContext,
  signalType: ContextSignal['signal_type'],
  signalData: Record<string, unknown>
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO context_signals (context, signal_type, signal_data)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [context, signalType, JSON.stringify(signalData)]
    );
  } catch {
    // Table might not exist yet, ignore
    logger.debug('Could not record context signal (table may not exist)');
  }
}

/**
 * Get unprocessed context signals for analysis
 */
export async function getUnprocessedSignals(
  context: AIContext,
  limit: number = 100
): Promise<ContextSignal[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM context_signals
       WHERE context = $1 AND applied_to_profile = false
       ORDER BY created_at DESC
       LIMIT $2`,
      [context, limit]
    );
    return result.rows as ContextSignal[];
  } catch {
    return [];
  }
}

// ===========================================
// Helper Functions
// ===========================================

async function getLearningInsights(context: AIContext): Promise<LearningInsights> {
  try {
    // Get user profile with learned preferences
    const result = await queryContext(
      context,
      `SELECT preferred_categories, preferred_types, active_hours, topic_interests
       FROM user_profile
       WHERE id = $1`,
      [`${context}_default`]
    );

    if (result.rows.length === 0) {
      return {
        preferredCategories: [],
        preferredTypes: [],
        communicationStyle: null,
        peakProductiveHours: [],
        topKeywords: [],
      };
    }

    const profile = result.rows[0];

    // Extract top preferences
    const preferredCategories = Object.entries(profile.preferred_categories || {})
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3)
      .map(([cat]) => cat);

    const preferredTypes = Object.entries(profile.preferred_types || {})
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3)
      .map(([type]) => type);

    const topKeywords = Object.entries(profile.topic_interests || {})
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 10)
      .map(([kw]) => kw);

    // Find peak hours (hours with > 2 entries)
    const activeHours = profile.active_hours || {};
    const peakProductiveHours = Object.entries(activeHours)
      .filter(([_, count]) => (count as number) > 2)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    return {
      preferredCategories,
      preferredTypes,
      communicationStyle: null, // Will be derived from business_profile
      peakProductiveHours,
      topKeywords,
    };
  } catch {
    return {
      preferredCategories: [],
      preferredTypes: [],
      communicationStyle: null,
      peakProductiveHours: [],
      topKeywords: [],
    };
  }
}

async function getRecentTopics(context: AIContext, days: number = 7): Promise<string[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT keywords FROM ideas
       WHERE created_at >= NOW() - make_interval(days => $1)
       ORDER BY created_at DESC
       LIMIT 50`,
      [days]
    );

    // Flatten and count keywords
    const keywordCounts: Record<string, number> = {};
    for (const row of result.rows) {
      const keywords = Array.isArray(row.keywords)
        ? row.keywords
        : JSON.parse(row.keywords || '[]');

      for (const kw of keywords) {
        const normalized = kw.toLowerCase().trim();
        if (normalized.length > 2) {
          keywordCounts[normalized] = (keywordCounts[normalized] || 0) + 1;
        }
      }
    }

    // Return top keywords
    return Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([kw]) => kw);
  } catch {
    return [];
  }
}

function calculateContextDepth(
  profile: BusinessProfile | null,
  insights: LearningInsights,
  recentTopics: string[]
): number {
  let score = 0;

  // Profile completeness (max 50 points)
  if (profile) {
    if (profile.company_name) {score += 10;}
    if (profile.industry) {score += 10;}
    if (profile.role) {score += 10;}
    if (profile.tech_stack && profile.tech_stack.length > 0) {score += 10;}
    if (profile.goals && profile.goals.length > 0) {score += 10;}
  }

  // Learning insights (max 30 points)
  if (insights.preferredCategories.length > 0) {score += 10;}
  if (insights.topKeywords.length >= 5) {score += 10;}
  if (insights.peakProductiveHours.length > 0) {score += 10;}

  // Activity (max 20 points)
  if (recentTopics.length >= 3) {score += 10;}
  if (recentTopics.length >= 7) {score += 10;}

  return Math.min(100, score);
}
