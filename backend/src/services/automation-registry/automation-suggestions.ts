/**
 * Automation Suggestions - Pattern-based automation suggestions
 *
 * Analyzes patterns in user data and generates automation suggestions.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import {
  AutomationSuggestion,
  AutomationDefinition,
  registerAutomation,
} from './automation-core';

// ===========================================
// Automation Suggestions (Pattern-Based)
// ===========================================

/**
 * Analysiert Muster und generiert Automation-Vorschläge
 */
export async function generateAutomationSuggestions(
  context: AIContext
): Promise<AutomationSuggestion[]> {
  const suggestions: AutomationSuggestion[] = [];

  try {
    // 1. Muster: Häufige Keywords → Automatische Tags
    const keywordPatterns = await findKeywordPatterns(context);
    for (const pattern of keywordPatterns) {
      suggestions.push({
        id: uuidv4(),
        context,
        name: `Auto-Tag: ${pattern.keyword}`,
        description: `Ideen mit "${pattern.keyword}" automatisch taggen`,
        trigger: {
          type: 'pattern',
          config: { pattern: pattern.keyword },
        },
        actions: [{
          type: 'tag_idea',
          config: { tags: [pattern.keyword] },
          order: 1,
        }],
        reasoning: `Das Keyword "${pattern.keyword}" erscheint in ${pattern.count} Ideen.`,
        confidence: Math.min(0.9, pattern.count / 20),
        based_on_pattern: 'keyword_frequency',
        sample_matches: pattern.count,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    }

    // 2. Muster: Bestimmte Kategorien oft mit hoher Priorität → Auto-Priorität
    const priorityPatterns = await findPriorityPatterns(context);
    for (const pattern of priorityPatterns) {
      if (pattern.high_priority_ratio > 0.6) {
        suggestions.push({
          id: uuidv4(),
          context,
          name: `Auto-Priorität: ${pattern.category}`,
          description: `${pattern.category}-Ideen automatisch als "high" priorisieren`,
          trigger: {
            type: 'event',
            config: { eventName: 'idea.created' },
          },
          actions: [{
            type: 'set_priority',
            config: { priority: 'high' },
            order: 1,
          }],
          reasoning: `${Math.round(pattern.high_priority_ratio * 100)}% der ${pattern.category}-Ideen haben hohe Priorität.`,
          confidence: pattern.high_priority_ratio,
          based_on_pattern: 'category_priority',
          sample_matches: pattern.total,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
      }
    }

    // 3. Muster: Wiederkehrende Aufgaben → Reminder
    const recurringPatterns = await findRecurringPatterns(context);
    for (const pattern of recurringPatterns) {
      suggestions.push({
        id: uuidv4(),
        context,
        name: `Reminder: ${pattern.title_pattern}`,
        description: `Wöchentlicher Reminder für "${pattern.title_pattern}"`,
        trigger: {
          type: 'schedule',
          config: { cron: '0 9 * * 1' }, // Montag 9:00
        },
        actions: [{
          type: 'notification',
          config: {
            title: 'Wöchentlicher Reminder',
            message: `Zeit für: ${pattern.title_pattern}`,
          },
          order: 1,
        }],
        reasoning: `Diese Aufgabe erscheint ${pattern.occurrence_count}x in den letzten 30 Tagen.`,
        confidence: Math.min(0.8, pattern.occurrence_count / 5),
        based_on_pattern: 'recurring_task',
        sample_matches: pattern.occurrence_count,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    }

    // Speichere Vorschläge
    for (const suggestion of suggestions) {
      await saveAutomationSuggestion(context, suggestion);
    }

    logger.info('Automation suggestions generated', {
      context,
      count: suggestions.length,
    });

  } catch (error) {
    logger.error('Failed to generate automation suggestions', error instanceof Error ? error : undefined);
  }

  return suggestions;
}

/**
 * Findet häufige Keywords
 */
async function findKeywordPatterns(
  context: AIContext
): Promise<Array<{ keyword: string; count: number }>> {
  try {
    const result = await queryContext(
      context,
      `WITH keyword_counts AS (
         SELECT jsonb_array_elements_text(keywords::jsonb) as keyword
         FROM ideas
         WHERE created_at > NOW() - INTERVAL '30 days'
       )
       SELECT keyword, COUNT(*) as count
       FROM keyword_counts
       WHERE LENGTH(keyword) > 3
       GROUP BY keyword
       HAVING COUNT(*) >= 3
       ORDER BY count DESC
       LIMIT 5`,
      []
    );
    return result.rows;
  } catch {
    return [];
  }
}

/**
 * Findet Prioritäts-Muster nach Kategorie
 */
async function findPriorityPatterns(
  context: AIContext
): Promise<Array<{ category: string; high_priority_ratio: number; total: number }>> {
  try {
    const result = await queryContext(
      context,
      `SELECT
         category,
         COUNT(*) FILTER (WHERE priority = 'high')::float / COUNT(*) as high_priority_ratio,
         COUNT(*) as total
       FROM ideas
       WHERE created_at > NOW() - INTERVAL '30 days'
       GROUP BY category
       HAVING COUNT(*) >= 5
       ORDER BY high_priority_ratio DESC`,
      []
    );
    return result.rows;
  } catch {
    return [];
  }
}

/**
 * Findet wiederkehrende Aufgaben
 */
async function findRecurringPatterns(
  context: AIContext
): Promise<Array<{ title_pattern: string; occurrence_count: number }>> {
  try {
    // Finde ähnliche Titel (erste 20 Zeichen)
    const result = await queryContext(
      context,
      `SELECT
         LEFT(title, 20) as title_pattern,
         COUNT(*) as occurrence_count
       FROM ideas
       WHERE type = 'task'
         AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY LEFT(title, 20)
       HAVING COUNT(*) >= 3
       ORDER BY occurrence_count DESC
       LIMIT 3`,
      []
    );
    return result.rows;
  } catch {
    return [];
  }
}

/**
 * Speichert einen Automation-Vorschlag
 */
async function saveAutomationSuggestion(
  context: AIContext,
  suggestion: AutomationSuggestion
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO automation_suggestions
        (id, context, name, description, trigger_type, trigger_config, actions,
         reasoning, confidence, based_on_pattern, sample_matches, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (context, name) DO UPDATE SET
         reasoning = EXCLUDED.reasoning,
         confidence = EXCLUDED.confidence,
         sample_matches = EXCLUDED.sample_matches`,
      [
        suggestion.id,
        context,
        suggestion.name,
        suggestion.description,
        suggestion.trigger.type,
        JSON.stringify(suggestion.trigger.config),
        JSON.stringify(suggestion.actions),
        suggestion.reasoning,
        suggestion.confidence,
        suggestion.based_on_pattern,
        suggestion.sample_matches,
        suggestion.status,
        suggestion.created_at,
      ]
    );
  } catch {
    // Table might not exist
    logger.debug('Could not save automation suggestion');
  }
}

/**
 * Akzeptiert einen Vorschlag und erstellt die Automation
 */
export async function acceptSuggestion(
  context: AIContext,
  suggestionId: string
): Promise<AutomationDefinition | null> {
  try {
    // Hole Vorschlag
    const result = await queryContext(
      context,
      `SELECT * FROM automation_suggestions
       WHERE id = $1 AND context = $2 AND status = 'pending'`,
      [suggestionId, context]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const suggestion = result.rows[0];

    // Erstelle Automation
    const automation = await registerAutomation(context, {
      name: suggestion.name,
      description: suggestion.description,
      trigger: {
        type: suggestion.trigger_type,
        config: suggestion.trigger_config,
      },
      conditions: [],
      actions: suggestion.actions,
      is_active: true,
      is_system: false,
    });

    // Markiere als akzeptiert
    await queryContext(
      context,
      `UPDATE automation_suggestions
       SET status = 'accepted', accepted_at = NOW()
       WHERE id = $1`,
      [suggestionId]
    );

    logger.info('Automation suggestion accepted', { suggestionId, automationId: automation.id });

    return automation;
  } catch (error) {
    logger.error('Failed to accept suggestion', error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Lehnt einen Vorschlag ab
 */
export async function dismissSuggestion(
  context: AIContext,
  suggestionId: string
): Promise<void> {
  await queryContext(
    context,
    `UPDATE automation_suggestions
     SET status = 'dismissed'
     WHERE id = $1 AND context = $2`,
    [suggestionId, context]
  );
}

/**
 * Holt ausstehende Vorschläge
 */
export async function getPendingSuggestions(
  context: AIContext,
  limit: number = 10
): Promise<AutomationSuggestion[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT * FROM automation_suggestions
       WHERE context = $1 AND status = 'pending'
       ORDER BY confidence DESC, created_at DESC
       LIMIT $2`,
      [context, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      context: row.context,
      name: row.name,
      description: row.description,
      trigger: {
        type: row.trigger_type,
        config: row.trigger_config,
      },
      actions: row.actions,
      reasoning: row.reasoning,
      confidence: row.confidence,
      based_on_pattern: row.based_on_pattern,
      sample_matches: row.sample_matches,
      status: row.status,
      created_at: row.created_at,
    }));
  } catch {
    return [];
  }
}
