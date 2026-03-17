/**
 * Proactive Digest Generator
 *
 * Auto-generates daily and weekly digests of user activity, insights,
 * and AI-discovered patterns. Transforms raw data into actionable summaries.
 *
 * Perplexity Recommendation: "Proactive Intelligence Engine should generate
 * useful actions like reminders, summaries, and suggestions BEFORE the user asks."
 *
 * Digest types:
 * - daily: Activity summary, new ideas, suggestions acted on
 * - weekly: Trend analysis, learning progress, goal tracking
 *
 * Delivery: Stored in DB, surfaced via workflow boundary on login_after_absence
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

export type DigestType = 'daily' | 'weekly';

export interface DigestSection {
  title: string;
  content: string;
  /** 0-1: how interesting this section is (for ordering) */
  relevance: number;
}

export interface Digest {
  id: string;
  context: AIContext;
  type: DigestType;
  title: string;
  sections: DigestSection[];
  /** Period covered */
  periodStart: Date;
  periodEnd: Date;
  /** Was this viewed by the user? */
  viewed: boolean;
  createdAt: Date;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Minimum ideas to include a section about them */
  MIN_IDEAS_FOR_SECTION: 1,
  /** Minimum activity entries for time pattern section */
  MIN_ACTIVITY_FOR_PATTERNS: 3,
  /** Max sections per digest */
  MAX_SECTIONS: 6,
  /** Max digests to keep per context */
  MAX_DIGESTS_PER_CONTEXT: 30,
};

// ===========================================
// Digest Generator Service
// ===========================================

class ProactiveDigestService {
  /**
   * Generate a daily digest for a context.
   * Called from memory scheduler at consolidation time.
   */
  async generateDailyDigest(context: AIContext): Promise<Digest | null> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
      // Check if we already generated a daily digest today
      const existing = await queryContext(
        context,
        `SELECT id FROM proactive_digests
         WHERE context = $1 AND type = 'daily'
           AND created_at >= CURRENT_DATE
         LIMIT 1`,
        [context]
      );

      if (existing.rows.length > 0) {
        return null; // Already generated today
      }

      const sections: DigestSection[] = [];

      // 1. Ideas created yesterday
      const ideasSection = await this.buildIdeasSection(context, yesterday, now);
      if (ideasSection) {sections.push(ideasSection);}

      // 2. Chat activity summary
      const chatSection = await this.buildChatSection(context, yesterday, now);
      if (chatSection) {sections.push(chatSection);}

      // 3. Suggestions status
      const suggestionsSection = await this.buildSuggestionsSection(context, yesterday, now);
      if (suggestionsSection) {sections.push(suggestionsSection);}

      // 4. Memory insights
      const memorySection = await this.buildMemorySection(context, yesterday, now);
      if (memorySection) {sections.push(memorySection);}

      if (sections.length === 0) {
        return null; // Nothing to report
      }

      // Sort by relevance and limit
      sections.sort((a, b) => b.relevance - a.relevance);
      const topSections = sections.slice(0, CONFIG.MAX_SECTIONS);

      const digest: Digest = {
        id: uuidv4(),
        context,
        type: 'daily',
        title: `Tagesrueckblick ${now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}`,
        sections: topSections,
        periodStart: yesterday,
        periodEnd: now,
        viewed: false,
        createdAt: now,
      };

      await this.persist(context, digest);

      logger.info('Daily digest generated', {
        context,
        sections: topSections.length,
        digestId: digest.id,
      });

      return digest;
    } catch (error) {
      logger.debug('Failed to generate daily digest', {
        context,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  /**
   * Generate a weekly digest for a context.
   * Called from memory scheduler on Sundays.
   */
  async generateWeeklyDigest(context: AIContext): Promise<Digest | null> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    try {
      // Check if we already generated a weekly digest this week
      const existing = await queryContext(
        context,
        `SELECT id FROM proactive_digests
         WHERE context = $1 AND type = 'weekly'
           AND created_at >= NOW() - INTERVAL '6 days'
         LIMIT 1`,
        [context]
      );

      if (existing.rows.length > 0) {
        return null;
      }

      const sections: DigestSection[] = [];

      // 1. Weekly idea count and top topics
      const weeklyIdeasSection = await this.buildWeeklyIdeasSection(context, weekAgo, now);
      if (weeklyIdeasSection) {sections.push(weeklyIdeasSection);}

      // 2. Learning progress
      const learningSection = await this.buildLearningSection(context, weekAgo, now);
      if (learningSection) {sections.push(learningSection);}

      // 3. Memory growth
      const memoryGrowthSection = await this.buildMemoryGrowthSection(context, weekAgo, now);
      if (memoryGrowthSection) {sections.push(memoryGrowthSection);}

      // 4. Activity patterns
      const patternSection = await this.buildActivityPatternSection(context, weekAgo, now);
      if (patternSection) {sections.push(patternSection);}

      if (sections.length === 0) {
        return null;
      }

      sections.sort((a, b) => b.relevance - a.relevance);
      const topSections = sections.slice(0, CONFIG.MAX_SECTIONS);

      const digest: Digest = {
        id: uuidv4(),
        context,
        type: 'weekly',
        title: `Wochenrueckblick KW${this.getWeekNumber(now)}`,
        sections: topSections,
        periodStart: weekAgo,
        periodEnd: now,
        viewed: false,
        createdAt: now,
      };

      await this.persist(context, digest);

      logger.info('Weekly digest generated', {
        context,
        sections: topSections.length,
        digestId: digest.id,
      });

      return digest;
    } catch (error) {
      logger.debug('Failed to generate weekly digest', {
        context,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  /**
   * Get latest unviewed digest for a context
   */
  async getLatestUnviewed(context: AIContext): Promise<Digest | null> {
    try {
      const result = await queryContext(
        context,
        `SELECT * FROM proactive_digests
         WHERE context = $1 AND viewed = false
         ORDER BY created_at DESC
         LIMIT 1`,
        [context]
      );

      if (result.rows.length === 0) {return null;}
      return this.rowToDigest(result.rows[0]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {return null;}
      logger.debug('Failed to get latest digest', { error });
      return null;
    }
  }

  /**
   * Get recent digests
   */
  async getRecent(context: AIContext, limit: number = 7): Promise<Digest[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT * FROM proactive_digests
         WHERE context = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [context, limit]
      );

      return result.rows.map(row => this.rowToDigest(row));
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {return [];}
      logger.debug('Failed to get recent digests', { error });
      return [];
    }
  }

  /**
   * Mark a digest as viewed
   */
  async markViewed(context: AIContext, digestId: string): Promise<void> {
    try {
      await queryContext(
        context,
        `UPDATE proactive_digests SET viewed = true WHERE id = $1`,
        [digestId]
      );
    } catch (error) {
      logger.debug('Failed to mark digest as viewed', { digestId, error });
    }
  }

  // ===========================================
  // Section Builders (Daily)
  // ===========================================

  private async buildIdeasSection(
    context: AIContext, from: Date, to: Date
  ): Promise<DigestSection | null> {
    try {
      const result = await queryContext(
        context,
        `SELECT COUNT(*) as count,
                COUNT(CASE WHEN type = 'task' THEN 1 END) as tasks,
                COUNT(CASE WHEN type = 'note' THEN 1 END) as notes,
                COUNT(CASE WHEN type = 'idea' THEN 1 END) as ideas
         FROM ideas
         WHERE context = $1 AND created_at BETWEEN $2 AND $3`,
        [context, from, to]
      );

      const count = Number(result.rows[0]?.count || 0);
      if (count < CONFIG.MIN_IDEAS_FOR_SECTION) {return null;}

      const tasks = Number(result.rows[0]?.tasks || 0);
      const notes = Number(result.rows[0]?.notes || 0);
      const ideas = Number(result.rows[0]?.ideas || 0);

      const parts: string[] = [];
      if (ideas > 0) {parts.push(`${ideas} Idee${ideas > 1 ? 'n' : ''}`);}
      if (tasks > 0) {parts.push(`${tasks} Aufgabe${tasks > 1 ? 'n' : ''}`);}
      if (notes > 0) {parts.push(`${notes} Notiz${notes > 1 ? 'en' : ''}`);}

      return {
        title: 'Neue Gedanken',
        content: `${count} neue Eintraege: ${parts.join(', ')}.`,
        relevance: Math.min(count / 5, 1),
      };
    } catch {
      return null;
    }
  }

  private async buildChatSection(
    context: AIContext, from: Date, to: Date
  ): Promise<DigestSection | null> {
    try {
      const result = await queryContext(
        context,
        `SELECT COUNT(DISTINCT session_id) as sessions,
                COUNT(*) as messages
         FROM general_chat_messages
         WHERE context = $1 AND created_at BETWEEN $2 AND $3`,
        [context, from, to]
      );

      const sessions = Number(result.rows[0]?.sessions || 0);
      const messages = Number(result.rows[0]?.messages || 0);

      if (sessions === 0) {return null;}

      return {
        title: 'Chat-Aktivitaet',
        content: `${sessions} Gespraech${sessions > 1 ? 'e' : ''} mit ${messages} Nachrichten.`,
        relevance: Math.min(sessions / 3, 0.7),
      };
    } catch {
      return null;
    }
  }

  private async buildSuggestionsSection(
    context: AIContext, from: Date, to: Date
  ): Promise<DigestSection | null> {
    try {
      const result = await queryContext(
        context,
        `SELECT
           COUNT(*) as total,
           COUNT(CASE WHEN was_accepted THEN 1 END) as accepted
         FROM proactive_suggestion_feedback
         WHERE context = $1 AND created_at BETWEEN $2 AND $3`,
        [context, from, to]
      );

      const total = Number(result.rows[0]?.total || 0);
      const accepted = Number(result.rows[0]?.accepted || 0);

      if (total === 0) {return null;}

      const rate = Math.round((accepted / total) * 100);

      return {
        title: 'KI-Vorschlaege',
        content: `${accepted} von ${total} Vorschlaegen angenommen (${rate}%).`,
        relevance: 0.5,
      };
    } catch {
      return null;
    }
  }

  private async buildMemorySection(
    context: AIContext, from: Date, to: Date
  ): Promise<DigestSection | null> {
    try {
      const result = await queryContext(
        context,
        `SELECT COUNT(*) as new_facts
         FROM learned_facts
         WHERE context = $1 AND created_at BETWEEN $2 AND $3`,
        [context, from, to]
      );

      const newFacts = Number(result.rows[0]?.new_facts || 0);
      if (newFacts === 0) {return null;}

      return {
        title: 'KI-Gedaechtnis',
        content: `${newFacts} neue${newFacts > 1 ? '' : 's'} Fakt${newFacts > 1 ? 'en' : ''} gelernt.`,
        relevance: 0.4,
      };
    } catch {
      return null;
    }
  }

  // ===========================================
  // Section Builders (Weekly)
  // ===========================================

  private async buildWeeklyIdeasSection(
    context: AIContext, from: Date, to: Date
  ): Promise<DigestSection | null> {
    try {
      const result = await queryContext(
        context,
        `SELECT
           COUNT(*) as total,
           COUNT(CASE WHEN type = 'task' AND is_archived THEN 1 END) as completed_tasks
         FROM ideas
         WHERE context = $1 AND created_at BETWEEN $2 AND $3`,
        [context, from, to]
      );

      const total = Number(result.rows[0]?.total || 0);
      const completed = Number(result.rows[0]?.completed_tasks || 0);

      if (total === 0) {return null;}

      let content = `${total} neue Eintraege diese Woche.`;
      if (completed > 0) {
        content += ` ${completed} Aufgabe${completed > 1 ? 'n' : ''} abgeschlossen.`;
      }

      // Get top topic
      const topicResult = await queryContext(
        context,
        `SELECT t.name, COUNT(*) as cnt
         FROM ideas i
         JOIN idea_topics t ON i.primary_topic_id = t.id
         WHERE i.context = $1 AND i.created_at BETWEEN $2 AND $3
         GROUP BY t.name
         ORDER BY cnt DESC
         LIMIT 1`,
        [context, from, to]
      );

      if (topicResult.rows.length > 0) {
        content += ` Top-Thema: "${topicResult.rows[0].name}".`;
      }

      return {
        title: 'Wochenueberblick',
        content,
        relevance: Math.min(total / 10, 1),
      };
    } catch {
      return null;
    }
  }

  private async buildLearningSection(
    context: AIContext, from: Date, to: Date
  ): Promise<DigestSection | null> {
    try {
      const result = await queryContext(
        context,
        `SELECT COUNT(*) as completed
         FROM learning_tasks
         WHERE context = $1 AND status = 'completed'
           AND updated_at BETWEEN $2 AND $3`,
        [context, from, to]
      );

      const completed = Number(result.rows[0]?.completed || 0);
      if (completed === 0) {return null;}

      return {
        title: 'Lernfortschritt',
        content: `${completed} Lernaufgabe${completed > 1 ? 'n' : ''} abgeschlossen.`,
        relevance: 0.7,
      };
    } catch {
      return null;
    }
  }

  private async buildMemoryGrowthSection(
    context: AIContext, from: Date, to: Date
  ): Promise<DigestSection | null> {
    try {
      const [factsResult, episodesResult] = await Promise.all([
        queryContext(
          context,
          `SELECT COUNT(*) as cnt FROM learned_facts
           WHERE context = $1 AND created_at BETWEEN $2 AND $3`,
          [context, from, to]
        ),
        queryContext(
          context,
          `SELECT COUNT(*) as cnt FROM episodic_memories
           WHERE context = $1 AND created_at BETWEEN $2 AND $3`,
          [context, from, to]
        ),
      ]);

      const facts = Number(factsResult.rows[0]?.cnt || 0);
      const episodes = Number(episodesResult.rows[0]?.cnt || 0);

      if (facts + episodes === 0) {return null;}

      const parts: string[] = [];
      if (facts > 0) {parts.push(`${facts} Fakten`);}
      if (episodes > 0) {parts.push(`${episodes} Episoden`);}

      return {
        title: 'Gedaechtnis-Wachstum',
        content: `Diese Woche gelernt: ${parts.join(' und ')}.`,
        relevance: 0.5,
      };
    } catch {
      return null;
    }
  }

  private async buildActivityPatternSection(
    context: AIContext, from: Date, to: Date
  ): Promise<DigestSection | null> {
    try {
      const result = await queryContext(
        context,
        `SELECT EXTRACT(DOW FROM created_at) as dow, COUNT(*) as cnt
         FROM ai_activity_log
         WHERE created_at BETWEEN $1 AND $2
         GROUP BY EXTRACT(DOW FROM created_at)
         ORDER BY cnt DESC
         LIMIT 1`,
        [from, to]
      );

      if (result.rows.length === 0) {return null;}

      const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
      const peakDay = dayNames[Number(result.rows[0].dow)] || 'Unbekannt';
      const count = Number(result.rows[0].cnt);

      if (count < CONFIG.MIN_ACTIVITY_FOR_PATTERNS) {return null;}

      return {
        title: 'Aktivitaets-Muster',
        content: `Aktivster Tag: ${peakDay} (${count} Aktionen).`,
        relevance: 0.3,
      };
    } catch {
      return null;
    }
  }

  // ===========================================
  // Persistence
  // ===========================================

  private async persist(context: AIContext, digest: Digest): Promise<void> {
    await queryContext(
      context,
      `INSERT INTO proactive_digests
       (id, context, type, title, sections, period_start, period_end, viewed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        digest.id, context, digest.type, digest.title,
        JSON.stringify(digest.sections), digest.periodStart,
        digest.periodEnd, digest.viewed, digest.createdAt,
      ]
    );

    // Prune old digests
    await queryContext(
      context,
      `DELETE FROM proactive_digests
       WHERE id IN (
         SELECT id FROM proactive_digests
         WHERE context = $1
         ORDER BY created_at DESC
         OFFSET $2
       )`,
      [context, CONFIG.MAX_DIGESTS_PER_CONTEXT]
    );
  }

  private rowToDigest(row: Record<string, unknown>): Digest {
    let sections: DigestSection[] = [];
    try {
      const data = typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections;
      if (Array.isArray(data)) {sections = data as DigestSection[];}
    } catch {
      sections = [];
    }

    return {
      id: row.id as string,
      context: row.context as AIContext,
      type: row.type as DigestType,
      title: row.title as string,
      sections,
      periodStart: new Date(row.period_start as string),
      periodEnd: new Date(row.period_end as string),
      viewed: (row.viewed as boolean) || false,
      createdAt: new Date(row.created_at as string),
    };
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const proactiveDigest = new ProactiveDigestService();
