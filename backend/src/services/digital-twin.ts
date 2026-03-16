/**
 * Phase 92: Digital Twin Profile Service
 *
 * Aggregates AI knowledge about the user into a transparent,
 * editable profile with personality radar, evolution tracking,
 * and user corrections.
 */

import { queryContext, type AIContext } from '../utils/database-context';

// ─── Types ──────────────────────────────────────────────

export type ProfileSection =
  | 'personality'
  | 'expertise'
  | 'work_patterns'
  | 'interests'
  | 'goals'
  | 'preferences';

export type ProfileSource =
  | 'chat_analysis'
  | 'knowledge_graph'
  | 'interaction_data'
  | 'user_correction';

export interface ProfileEntry {
  id: string;
  user_id: string;
  section: ProfileSection;
  data: Record<string, unknown>;
  confidence: number;
  source: ProfileSource | null;
  updated_at: string;
  created_at: string;
}

export interface RadarScores {
  analytical: number;
  creative: number;
  organized: number;
  social: number;
  technical: number;
}

export interface ProfileSnapshot {
  id: string;
  user_id: string;
  snapshot: Record<string, unknown>;
  radar_scores: RadarScores | null;
  created_at: string;
}

export interface ProfileCorrection {
  id: string;
  user_id: string;
  section: ProfileSection;
  original_value: Record<string, unknown> | null;
  corrected_value: Record<string, unknown> | null;
  reason: string | null;
  applied: boolean;
  created_at: string;
}

export interface DigitalTwinProfile {
  sections: ProfileEntry[];
  radar: RadarScores;
  lastUpdated: string | null;
}

// ─── Valid sections ─────────────────────────────────────

const VALID_SECTIONS: ProfileSection[] = [
  'personality',
  'expertise',
  'work_patterns',
  'interests',
  'goals',
  'preferences',
];

export function isValidSection(s: string): s is ProfileSection {
  return VALID_SECTIONS.includes(s as ProfileSection);
}

// ─── Profile CRUD ───────────────────────────────────────

/**
 * Get full digital twin profile for a user.
 */
export async function getProfile(
  context: AIContext,
  userId: string,
): Promise<DigitalTwinProfile> {
  const result = await queryContext(
    context,
    `SELECT * FROM digital_twin_profiles WHERE user_id = $1 ORDER BY section`,
    [userId],
  );

  const sections: ProfileEntry[] = result.rows;
  const radar = computeRadarFromSections(sections);
  const lastUpdated = sections.length > 0
    ? sections.reduce((latest, s) => (s.updated_at > latest ? s.updated_at : latest), sections[0].updated_at)
    : null;

  return { sections, radar, lastUpdated };
}

/**
 * Upsert a profile section.
 */
export async function upsertProfileSection(
  context: AIContext,
  userId: string,
  section: ProfileSection,
  data: Record<string, unknown>,
  source: ProfileSource = 'user_correction',
  confidence?: number,
): Promise<ProfileEntry> {
  const conf = confidence ?? 1.0;

  // Check if section exists
  const existing = await queryContext(
    context,
    `SELECT id FROM digital_twin_profiles WHERE user_id = $1 AND section = $2`,
    [userId, section],
  );

  if (existing.rows.length > 0) {
    const result = await queryContext(
      context,
      `UPDATE digital_twin_profiles
       SET data = $3, source = $4, confidence = $5, updated_at = NOW()
       WHERE user_id = $1 AND section = $2
       RETURNING *`,
      [userId, section, JSON.stringify(data), source, conf],
    );
    return result.rows[0];
  }

  const result = await queryContext(
    context,
    `INSERT INTO digital_twin_profiles (user_id, section, data, source, confidence)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, section, JSON.stringify(data), source, conf],
  );
  return result.rows[0];
}

// ─── Radar Computation ──────────────────────────────────

/**
 * Compute personality radar scores from profile sections.
 * Each axis is scored 0-100.
 */
export function computeRadarFromSections(sections: ProfileEntry[]): RadarScores {
  const scores: RadarScores = {
    analytical: 50,
    creative: 50,
    organized: 50,
    social: 50,
    technical: 50,
  };

  for (const entry of sections) {
    const data = entry.data as Record<string, unknown>;

    switch (entry.section) {
      case 'personality': {
        if (data.radar && typeof data.radar === 'object') {
          const radar = data.radar as Partial<RadarScores>;
          if (typeof radar.analytical === 'number') scores.analytical = clampScore(radar.analytical);
          if (typeof radar.creative === 'number') scores.creative = clampScore(radar.creative);
          if (typeof radar.organized === 'number') scores.organized = clampScore(radar.organized);
          if (typeof radar.social === 'number') scores.social = clampScore(radar.social);
          if (typeof radar.technical === 'number') scores.technical = clampScore(radar.technical);
        }
        break;
      }
      case 'expertise': {
        const areas = Array.isArray(data.areas) ? data.areas : [];
        const techCount = areas.filter((a: unknown) =>
          typeof a === 'string' && /typescript|python|react|code|programming|api|backend|frontend|devops|docker|git/i.test(a),
        ).length;
        if (techCount > 0) scores.technical = clampScore(50 + techCount * 10);
        if (areas.length > 3) scores.analytical = clampScore(scores.analytical + 10);
        break;
      }
      case 'work_patterns': {
        if (data.consistency && typeof data.consistency === 'number') {
          scores.organized = clampScore(scores.organized + (data.consistency as number) * 20);
        }
        break;
      }
      case 'interests': {
        const topics = Array.isArray(data.topics) ? data.topics : [];
        const creativeTopics = topics.filter((t: unknown) =>
          typeof t === 'string' && /design|art|music|writing|creative|photography/i.test(t),
        ).length;
        if (creativeTopics > 0) scores.creative = clampScore(50 + creativeTopics * 15);
        break;
      }
      case 'goals': {
        const goalList = Array.isArray(data.items) ? data.items : [];
        if (goalList.length > 0) scores.organized = clampScore(scores.organized + 10);
        break;
      }
      case 'preferences': {
        if (data.communication_style === 'collaborative') {
          scores.social = clampScore(scores.social + 20);
        }
        break;
      }
    }
  }

  return scores;
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ─── Profile Aggregation ────────────────────────────────

/**
 * Aggregate profile data from various system sources.
 * This queries chat patterns, ideas, tasks, etc. to build a profile.
 */
export async function aggregateProfile(
  context: AIContext,
  userId: string,
): Promise<ProfileEntry[]> {
  const results: ProfileEntry[] = [];

  // 1. Communication style from chat analysis
  const chatStats = await queryContext(
    context,
    `SELECT COUNT(*) as msg_count,
            AVG(LENGTH(content)) as avg_length
     FROM general_chat_messages
     WHERE user_id = $1 AND role = 'user'`,
    [userId],
  ).catch(() => ({ rows: [{ msg_count: 0, avg_length: 0 }] }));

  const msgCount = parseInt(chatStats.rows[0]?.msg_count ?? '0', 10);
  const avgLength = parseFloat(chatStats.rows[0]?.avg_length ?? '0');

  const commStyle: Record<string, unknown> = {
    message_count: msgCount,
    average_length: Math.round(avgLength),
    style: avgLength > 200 ? 'detailed' : avgLength > 80 ? 'moderate' : 'concise',
  };

  results.push(await upsertProfileSection(
    context, userId, 'personality',
    { communication: commStyle, radar: {} },
    'chat_analysis',
    msgCount > 10 ? 0.8 : 0.4,
  ));

  // 2. Expertise areas from ideas and topics
  const topicStats = await queryContext(
    context,
    `SELECT t.name, COUNT(it.idea_id) as idea_count
     FROM topics t
     JOIN idea_topics it ON it.topic_id = t.id
     JOIN ideas i ON i.id = it.idea_id AND i.user_id = $1
     GROUP BY t.name
     ORDER BY idea_count DESC
     LIMIT 15`,
    [userId],
  ).catch(() => ({ rows: [] }));

  const expertiseAreas = topicStats.rows.map((r: { name: string }) => r.name);

  results.push(await upsertProfileSection(
    context, userId, 'expertise',
    { areas: expertiseAreas, source_count: topicStats.rows.length },
    'knowledge_graph',
    expertiseAreas.length > 3 ? 0.7 : 0.4,
  ));

  // 3. Work patterns from interaction timestamps
  const interactionStats = await queryContext(
    context,
    `SELECT EXTRACT(HOUR FROM created_at) as hour,
            COUNT(*) as count
     FROM general_chat_messages
     WHERE user_id = $1 AND role = 'user'
     GROUP BY hour
     ORDER BY count DESC
     LIMIT 5`,
    [userId],
  ).catch(() => ({ rows: [] }));

  const peakHours = interactionStats.rows.map((r: { hour: number; count: string }) => ({
    hour: r.hour,
    count: parseInt(r.count, 10),
  }));

  const totalInteractions = peakHours.reduce((sum, p) => sum + p.count, 0);

  results.push(await upsertProfileSection(
    context, userId, 'work_patterns',
    {
      peak_hours: peakHours,
      total_interactions: totalInteractions,
      consistency: peakHours.length > 0 ? peakHours[0].count / Math.max(totalInteractions, 1) : 0,
    },
    'interaction_data',
    totalInteractions > 20 ? 0.7 : 0.3,
  ));

  // 4. Interests from knowledge graph entities
  const entityStats = await queryContext(
    context,
    `SELECT name, type, mention_count
     FROM knowledge_entities
     WHERE user_id = $1
     ORDER BY mention_count DESC
     LIMIT 20`,
    [userId],
  ).catch(() => ({ rows: [] }));

  const interestTopics = entityStats.rows
    .filter((e: { type: string }) => e.type === 'concept' || e.type === 'technology')
    .map((e: { name: string }) => e.name);

  results.push(await upsertProfileSection(
    context, userId, 'interests',
    { topics: interestTopics, entity_count: entityStats.rows.length },
    'knowledge_graph',
    interestTopics.length > 5 ? 0.7 : 0.4,
  ));

  // 5. Goals from tasks and projects
  const taskStats = await queryContext(
    context,
    `SELECT status, COUNT(*) as count
     FROM tasks
     WHERE user_id = $1
     GROUP BY status`,
    [userId],
  ).catch(() => ({ rows: [] }));

  const projectStats = await queryContext(
    context,
    `SELECT name, status
     FROM projects
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [userId],
  ).catch(() => ({ rows: [] }));

  const taskSummary: Record<string, number> = {};
  for (const row of taskStats.rows) {
    taskSummary[row.status] = parseInt(row.count, 10);
  }

  results.push(await upsertProfileSection(
    context, userId, 'goals',
    {
      items: projectStats.rows.map((p: { name: string; status: string }) => p.name),
      task_summary: taskSummary,
      active_projects: projectStats.rows.filter((p: { status: string }) => p.status === 'active').length,
    },
    'interaction_data',
    projectStats.rows.length > 0 ? 0.6 : 0.3,
  ));

  // 6. Preferences from settings / memory
  const memoryFacts = await queryContext(
    context,
    `SELECT fact, category
     FROM learned_facts
     WHERE user_id = $1 AND category = 'preference'
     ORDER BY access_count DESC
     LIMIT 10`,
    [userId],
  ).catch(() => ({ rows: [] }));

  results.push(await upsertProfileSection(
    context, userId, 'preferences',
    {
      learned_preferences: memoryFacts.rows.map((f: { fact: string }) => f.fact),
      preference_count: memoryFacts.rows.length,
    },
    'chat_analysis',
    memoryFacts.rows.length > 3 ? 0.7 : 0.3,
  ));

  return results;
}

// ─── Radar Data ─────────────────────────────────────────

export async function getRadarScores(
  context: AIContext,
  userId: string,
): Promise<RadarScores> {
  const profile = await getProfile(context, userId);
  return profile.radar;
}

// ─── Evolution (Snapshots) ──────────────────────────────

/**
 * Get profile evolution snapshots over time.
 */
export async function getEvolution(
  context: AIContext,
  userId: string,
  limit = 12,
): Promise<ProfileSnapshot[]> {
  const result = await queryContext(
    context,
    `SELECT * FROM digital_twin_snapshots
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}

/**
 * Create a new weekly snapshot of the current profile.
 */
export async function createSnapshot(
  context: AIContext,
  userId: string,
): Promise<ProfileSnapshot> {
  const profile = await getProfile(context, userId);
  const radar = profile.radar;

  const snapshotData: Record<string, unknown> = {};
  for (const section of profile.sections) {
    snapshotData[section.section] = {
      data: section.data,
      confidence: section.confidence,
    };
  }

  const result = await queryContext(
    context,
    `INSERT INTO digital_twin_snapshots (user_id, snapshot, radar_scores)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, JSON.stringify(snapshotData), JSON.stringify(radar)],
  );
  return result.rows[0];
}

// ─── Corrections ────────────────────────────────────────

/**
 * Submit a correction ("AI is wrong about...").
 */
export async function submitCorrection(
  context: AIContext,
  userId: string,
  section: ProfileSection,
  correctedValue: Record<string, unknown>,
  reason?: string,
): Promise<ProfileCorrection> {
  // Get current value
  const current = await queryContext(
    context,
    `SELECT data FROM digital_twin_profiles WHERE user_id = $1 AND section = $2`,
    [userId, section],
  );

  const originalValue = current.rows[0]?.data ?? null;

  // Insert correction record
  const corrResult = await queryContext(
    context,
    `INSERT INTO digital_twin_corrections (user_id, section, original_value, corrected_value, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      userId,
      section,
      originalValue ? JSON.stringify(originalValue) : null,
      JSON.stringify(correctedValue),
      reason ?? null,
    ],
  );

  // Apply correction immediately
  await upsertProfileSection(context, userId, section, correctedValue, 'user_correction', 1.0);

  // Mark as applied
  await queryContext(
    context,
    `UPDATE digital_twin_corrections SET applied = true WHERE id = $1`,
    [corrResult.rows[0].id],
  );

  return { ...corrResult.rows[0], applied: true };
}

// ─── Export ─────────────────────────────────────────────

/**
 * Export profile as a structured JSON document.
 */
export async function exportProfile(
  context: AIContext,
  userId: string,
): Promise<Record<string, unknown>> {
  const profile = await getProfile(context, userId);
  const evolution = await getEvolution(context, userId, 4);

  const sectionMap: Record<string, unknown> = {};
  for (const entry of profile.sections) {
    sectionMap[entry.section] = {
      data: entry.data,
      confidence: entry.confidence,
      source: entry.source,
      updated_at: entry.updated_at,
    };
  }

  return {
    version: '1.0',
    context,
    exported_at: new Date().toISOString(),
    radar: profile.radar,
    sections: sectionMap,
    evolution_snapshots: evolution.length,
    recent_snapshots: evolution.slice(0, 4).map(s => ({
      created_at: s.created_at,
      radar_scores: s.radar_scores,
    })),
  };
}
