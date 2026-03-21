/**
 * Memory Recall Tool Handlers
 *
 * Extracted from index.ts (Phase 120) — contains tool handlers for
 * remember, recall, and memory_introspect (HiMeS integration).
 *
 * @module services/tool-handlers/memory-recall-tools
 */

import { logger } from '../../utils/logger';
import { ToolExecutionContext } from '../claude/tool-use';
import { longTermMemory, episodicMemory, workingMemory, crossContextSharing } from '../memory';

// ===========================================
// Helper Functions
// ===========================================

/**
 * Format timestamp as relative time ago
 */
export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `vor ${diffMins} Min.`;
  } else if (diffHours < 24) {
    return `vor ${diffHours} Std.`;
  } else if (diffDays === 1) {
    return 'gestern';
  } else if (diffDays < 7) {
    return `vor ${diffDays} Tagen`;
  } else if (diffDays < 30) {
    return `vor ${Math.floor(diffDays / 7)} Wochen`;
  } else {
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  }
}

/**
 * Get emotional label from valence
 */
export function getEmotionalLabel(valence: number): string {
  if (valence > 0.3) {return 'positive Stimmung';}
  if (valence < -0.3) {return 'angespannt';}
  return 'neutral';
}

// ===========================================
// Remember Handler
// ===========================================

export async function handleRemember(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const content = input.content as string;
  const factType = (input.fact_type as string) || 'knowledge';
  const confidence = (input.confidence as number) || 0.8;
  const context = execContext.aiContext;

  if (!content) {
    return 'Fehler: Kein Inhalt zum Merken angegeben.';
  }

  const validFactTypes = ['preference', 'behavior', 'knowledge', 'goal', 'context'];
  if (!validFactTypes.includes(factType)) {
    return `Fehler: Ungültiger Fakt-Typ. Erlaubt: ${validFactTypes.join(', ')}`;
  }

  logger.debug('Tool: remember', { factType, confidence, context });

  try {
    // Store in long-term memory
    await longTermMemory.addFact(context, {
      factType: factType as 'preference' | 'behavior' | 'knowledge' | 'goal' | 'context',
      content,
      confidence: Math.min(1.0, Math.max(0.0, confidence)),
      source: 'explicit',
    });

    logger.info('Fact stored in long-term memory', {
      factType,
      confidence,
      contentPreview: content.substring(0, 50),
    });

    // Confirm with appropriate response based on fact type
    const confirmationMessages: Record<string, string> = {
      preference: 'Präferenz',
      behavior: 'Verhaltensmuster',
      knowledge: 'Wissen',
      goal: 'Ziel',
      context: 'Kontext-Information',
    };

    return `✅ ${confirmationMessages[factType] || 'Information'} gespeichert: "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}"

Ich werde mich daran erinnern und diese Information in zukünftigen Gesprächen berücksichtigen.`;
  } catch (error) {
    logger.error('Tool remember failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Speichern. Bitte versuche es erneut.';
  }
}

// ===========================================
// Recall Handler
// ===========================================

export async function handleRecall(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const query = input.query as string;
  const memoryType = (input.memory_type as string) || 'all';
  const limit = Math.min((input.limit as number) || 5, 10);
  const context = execContext.aiContext;

  if (!query) {
    return 'Fehler: Keine Suchanfrage angegeben.';
  }

  logger.debug('Tool: recall', { query, memoryType, limit, context });

  try {
    const results: string[] = [];
    let episodeCount = 0;
    let factCount = 0;

    // Retrieve from Episodic Memory (past conversations)
    if (memoryType === 'episodes' || memoryType === 'all') {
      const episodes = await episodicMemory.retrieve(query, context, { limit });

      if (episodes.length > 0) {
        episodeCount = episodes.length;
        results.push('**Erinnerungen an frühere Gespräche:**');

        for (const episode of episodes) {
          const timeAgo = formatTimeAgo(episode.timestamp);
          const emotionalMood = getEmotionalLabel(episode.emotionalValence);

          results.push(
            `• (${timeAgo}, ${emotionalMood}) Du: "${episode.trigger.substring(0, 100)}${episode.trigger.length > 100 ? '...' : ''}"`
          );
        }
      }
    }

    // Retrieve from Long-Term Memory (stored facts)
    if (memoryType === 'facts' || memoryType === 'all') {
      const longTermResults = await longTermMemory.retrieve(context, query);

      if (longTermResults.facts.length > 0) {
        factCount = longTermResults.facts.length;
        results.push('\n**Bekannte Fakten über dich:**');

        for (const fact of longTermResults.facts.slice(0, limit)) {
          const confidenceLabel = fact.confidence >= 0.8 ? '🟢' : fact.confidence >= 0.6 ? '🟡' : '🔴';
          results.push(`${confidenceLabel} ${fact.content} (${fact.factType})`);
        }
      }

      // Include relevant patterns
      if (longTermResults.patterns.length > 0 && results.length < limit * 2) {
        results.push('\n**Erkannte Muster:**');
        for (const pattern of longTermResults.patterns.slice(0, 3)) {
          results.push(`• ${pattern.pattern}`);
        }
      }
    }

    if (results.length === 0) {
      return `Ich habe keine Erinnerungen zu "${query}" gefunden.

Dies kann bedeuten:
• Wir haben dieses Thema noch nicht besprochen
• Die Information wurde noch nicht explizit gespeichert
• Verwende ggf. andere Suchbegriffe`;
    }

    return `Suchergebnisse für "${query}" (${episodeCount} Episoden, ${factCount} Fakten):\n\n${results.join('\n')}`;
  } catch (error) {
    logger.error('Tool recall failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Abrufen der Erinnerungen. Bitte versuche es erneut.';
  }
}

// ===========================================
// Memory Introspect Handler
// ===========================================

export async function handleMemoryIntrospect(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const aspect = (input.aspect as string) || 'overview';
  const topicFilter = input.topic_filter as string | undefined;
  const context = execContext.aiContext;
  const sessionId = execContext.sessionId;

  logger.debug('Tool: memory_introspect', { aspect, topicFilter, context });

  try {
    const sections: string[] = [];

    // Facts
    if (aspect === 'facts' || aspect === 'overview') {
      const facts = await longTermMemory.getFacts(context);
      const filtered = topicFilter
        ? facts.filter(f => f.content.toLowerCase().includes(topicFilter.toLowerCase()))
        : facts;

      if (filtered.length > 0) {
        sections.push(`**Langzeitgedaechtnis (${filtered.length} Fakten):**`);
        const grouped: Record<string, typeof filtered> = {};
        for (const f of filtered.slice(0, 20)) {
          if (!grouped[f.factType]) {grouped[f.factType] = [];}
          grouped[f.factType].push(f);
        }
        for (const [type, typeFacts] of Object.entries(grouped)) {
          sections.push(`  _${type}_:`);
          for (const f of typeFacts) {
            const conf = f.confidence >= 0.8 ? 'hoch' : f.confidence >= 0.5 ? 'mittel' : 'niedrig';
            sections.push(`  - ${f.content} (Konfidenz: ${conf}, ${f.occurrences}x bestaetigt)`);
          }
        }
      } else {
        sections.push('**Langzeitgedaechtnis:** Keine Fakten gespeichert.');
      }
    }

    // Episodes
    if (aspect === 'episodes' || aspect === 'overview') {
      const query = topicFilter || 'recent';
      const episodes = await episodicMemory.retrieve(query, context, { limit: 5, minStrength: 0.1 });

      if (episodes.length > 0) {
        sections.push(`\n**Episodisches Gedaechtnis (${episodes.length} Episoden):**`);
        for (const ep of episodes) {
          const timeAgo = formatTimeAgo(ep.timestamp);
          sections.push(`  - ${timeAgo}: "${ep.trigger.substring(0, 80)}..." (Staerke: ${ep.retrievalStrength.toFixed(2)})`);
        }
      } else {
        sections.push('\n**Episodisches Gedaechtnis:** Keine relevanten Episoden.');
      }
    }

    // Working Memory
    if (aspect === 'working_memory' || aspect === 'overview') {
      const wmState = sessionId ? workingMemory.getState(sessionId) : null;
      if (wmState) {
        sections.push(`\n**Arbeitsgedaechtnis (${wmState.slots.length}/${wmState.capacity} Slots):**`);
        sections.push(`  Aktuelles Ziel: ${wmState.currentGoal}`);
        for (const slot of wmState.slots) {
          sections.push(`  - [${slot.type}] ${slot.content} (Aktivierung: ${slot.activation.toFixed(2)})`);
        }
      } else {
        sections.push('\n**Arbeitsgedaechtnis:** Keine aktive Session.');
      }
    }

    // Cross-Context
    if (aspect === 'cross_context' || aspect === 'overview') {
      const shared = await crossContextSharing.getSharedFacts(context);
      if (shared.length > 0) {
        sections.push(`\n**Kontextuebergreifende Insights (${shared.length}):**`);
        for (const f of shared.slice(0, 10)) {
          sections.push(`  - ${f.content}`);
        }
      } else {
        sections.push('\n**Kontextuebergreifende Insights:** Keine geteilten Fakten.');
      }
    }

    // Stats summary for overview
    if (aspect === 'overview') {
      const wmStats = workingMemory.getStats();
      sections.push(`\n**Zusammenfassung:**`);
      sections.push(`  - Aktive WM-Sessions: ${wmStats.activeSessions}`);
      sections.push(`  - Durchschnittliche Slots/Session: ${wmStats.avgSlotsPerSession}`);
    }

    return sections.join('\n');
  } catch (error) {
    logger.error('Tool memory_introspect failed', error instanceof Error ? error : undefined);
    return 'Fehler beim Inspizieren des Gedaechtniszustands.';
  }
}
