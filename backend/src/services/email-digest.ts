/**
 * Email Digest Service - Phase 43
 *
 * Generates daily and weekly email digests with AI summaries.
 * Can be triggered manually or via the autonomous agent scheduler.
 *
 * Features:
 * - Daily digest: unread emails, action items, priority highlights
 * - Weekly digest: email volume trends, top senders, unresolved items
 * - AI-powered narrative summary
 */

import { getClaudeClient, executeWithProtection, CLAUDE_MODEL } from './claude/client';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export interface DigestConfig {
  context: AIContext;
  period: 'daily' | 'weekly';
  /** Override: look back this many hours instead of default */
  lookbackHours?: number;
}

export interface EmailDigest {
  period: 'daily' | 'weekly';
  context: AIContext;
  generated_at: string;
  stats: {
    total_received: number;
    total_sent: number;
    unread: number;
    by_category: Record<string, number>;
    by_priority: Record<string, number>;
  };
  highlights: Array<{
    email_id: string;
    subject: string;
    from: string;
    priority: string;
    summary: string;
  }>;
  action_items: Array<{
    email_id: string;
    subject: string;
    items: Array<{ text: string }>;
  }>;
  ai_narrative: string;
}

// ============================================================
// Digest Generation
// ============================================================

/**
 * Generate an email digest for the given period.
 */
export async function generateEmailDigest(config: DigestConfig): Promise<EmailDigest> {
  const { context, period } = config;
  const lookbackHours = config.lookbackHours || (period === 'daily' ? 24 : 168);
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  logger.info('Generating email digest', { context, period, since, operation: 'generateEmailDigest' });

  // Fetch stats
  const [receivedRes, sentRes, unreadRes, catRes, prioRes] = await Promise.all([
    queryContext(context, `
      SELECT COUNT(*) as c FROM emails
      WHERE direction = 'inbound' AND received_at >= $1 AND status != 'trash'
    `, [since]),
    queryContext(context, `
      SELECT COUNT(*) as c FROM emails
      WHERE direction = 'outbound' AND created_at >= $1 AND status != 'trash'
    `, [since]),
    queryContext(context, `
      SELECT COUNT(*) as c FROM emails WHERE status = 'received'
    `, []),
    queryContext(context, `
      SELECT ai_category, COUNT(*) as c FROM emails
      WHERE received_at >= $1 AND status != 'trash' AND ai_category IS NOT NULL
      GROUP BY ai_category
    `, [since]),
    queryContext(context, `
      SELECT ai_priority, COUNT(*) as c FROM emails
      WHERE received_at >= $1 AND status != 'trash' AND ai_priority IS NOT NULL
      GROUP BY ai_priority
    `, [since]),
  ]);

  const byCategory: Record<string, number> = {};
  for (const row of catRes.rows) {byCategory[row.ai_category] = parseInt(row.c, 10);}

  const byPriority: Record<string, number> = {};
  for (const row of prioRes.rows) {byPriority[row.ai_priority] = parseInt(row.c, 10);}

  const stats = {
    total_received: parseInt(receivedRes.rows[0]?.c || '0', 10),
    total_sent: parseInt(sentRes.rows[0]?.c || '0', 10),
    unread: parseInt(unreadRes.rows[0]?.c || '0', 10),
    by_category: byCategory,
    by_priority: byPriority,
  };

  // Fetch highlights (urgent/high priority emails)
  const highlightsRes = await queryContext(context, `
    SELECT id, subject, from_address, from_name, ai_priority, ai_summary
    FROM emails
    WHERE received_at >= $1 AND status != 'trash'
      AND ai_priority IN ('urgent', 'high')
    ORDER BY
      CASE ai_priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
      received_at DESC
    LIMIT 10
  `, [since]);

  const highlights = highlightsRes.rows.map(row => ({
    email_id: row.id,
    subject: row.subject || '(Kein Betreff)',
    from: row.from_name || row.from_address,
    priority: row.ai_priority,
    summary: row.ai_summary || '',
  }));

  // Fetch action items
  const actionRes = await queryContext(context, `
    SELECT id, subject, ai_action_items FROM emails
    WHERE received_at >= $1 AND status NOT IN ('trash', 'archived')
      AND ai_action_items IS NOT NULL AND ai_action_items != '[]'
    ORDER BY received_at DESC
    LIMIT 10
  `, [since]);

  const actionItems = actionRes.rows.map(row => {
    let items: Array<{ text: string }> = [];
    try {
      items = typeof row.ai_action_items === 'string'
        ? JSON.parse(row.ai_action_items)
        : row.ai_action_items || [];
    } catch { /* ignore parse errors */ }
    return { email_id: row.id, subject: row.subject, items };
  }).filter(e => e.items.length > 0);

  // Generate AI narrative summary
  const aiNarrative = await generateDigestNarrative(period, stats, highlights, actionItems);

  return {
    period,
    context,
    generated_at: new Date().toISOString(),
    stats,
    highlights,
    action_items: actionItems,
    ai_narrative: aiNarrative,
  };
}

/**
 * Generate a human-readable narrative summary of the digest.
 */
async function generateDigestNarrative(
  period: 'daily' | 'weekly',
  stats: EmailDigest['stats'],
  highlights: EmailDigest['highlights'],
  actionItems: EmailDigest['action_items']
): Promise<string> {
  const periodLabel = period === 'daily' ? 'heute' : 'diese Woche';

  // Build data context for Claude
  const dataContext = [
    `Zeitraum: ${periodLabel}`,
    `Empfangen: ${stats.total_received}, Gesendet: ${stats.total_sent}, Ungelesen: ${stats.unread}`,
  ];

  if (Object.keys(stats.by_category).length > 0) {
    dataContext.push(`Kategorien: ${Object.entries(stats.by_category).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  }
  if (Object.keys(stats.by_priority).length > 0) {
    dataContext.push(`Prioritäten: ${Object.entries(stats.by_priority).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  }
  if (highlights.length > 0) {
    dataContext.push(`Wichtige E-Mails: ${highlights.map(h => `"${h.subject}" von ${h.from} (${h.priority})`).join('; ')}`);
  }

  const totalActions = actionItems.reduce((sum, e) => sum + e.items.length, 0);
  if (totalActions > 0) {
    dataContext.push(`Offene Aufgaben: ${totalActions} aus ${actionItems.length} E-Mails`);
  }

  try {
    const client = getClaudeClient();

    const response = await executeWithProtection(() =>
      client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 512,
        system: `Du bist ein persoenlicher E-Mail-Assistent. Erstelle eine kurze, freundliche Zusammenfassung des E-Mail-${period === 'daily' ? 'Tages' : 'Woche'}. Maximal 4-5 Saetze auf Deutsch. Nenne wichtige E-Mails beim Namen und weise auf offene Aufgaben hin. Sei praegnant und hilfreich.`,
        messages: [{
          role: 'user',
          content: dataContext.join('\n'),
        }],
      })
    );

    const textBlock = response.content.find(b => b.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      return textBlock.text.trim();
    }
  } catch (err) {
    logger.warn('Failed to generate digest narrative', {
      error: (err as Error).message,
      operation: 'generateDigestNarrative',
    });
  }

  // Fallback: generate simple text
  const parts = [`${periodLabel === 'heute' ? 'Heute' : 'Diese Woche'}: ${stats.total_received} E-Mails empfangen, ${stats.total_sent} gesendet.`];
  if (stats.unread > 0) {parts.push(`${stats.unread} ungelesen.`);}
  if (highlights.length > 0) {parts.push(`${highlights.length} wichtige E-Mail${highlights.length > 1 ? 's' : ''}.`);}
  const totalActs = actionItems.reduce((s, e) => s + e.items.length, 0);
  if (totalActs > 0) {parts.push(`${totalActs} offene Aufgabe${totalActs > 1 ? 'n' : ''}.`);}
  return parts.join(' ');
}

/**
 * Format digest for chat display.
 */
export function formatDigestForChat(digest: EmailDigest): string {
  const lines: string[] = [];
  const periodLabel = digest.period === 'daily' ? 'Tages' : 'Wochen';

  lines.push(`**📬 E-Mail-${periodLabel}zusammenfassung**\n`);
  lines.push(digest.ai_narrative);
  lines.push('');

  // Stats
  lines.push(`**Zahlen:** ${digest.stats.total_received} empfangen | ${digest.stats.total_sent} gesendet | ${digest.stats.unread} ungelesen`);
  lines.push('');

  // Highlights
  if (digest.highlights.length > 0) {
    lines.push('**Wichtige E-Mails:**');
    for (const h of digest.highlights) {
      const emoji = h.priority === 'urgent' ? '🔴' : '🟠';
      lines.push(`  ${emoji} **${h.subject}** — ${h.from}`);
      if (h.summary) {lines.push(`    _${h.summary}_`);}
    }
    lines.push('');
  }

  // Action items
  if (digest.action_items.length > 0) {
    lines.push('**Offene Aufgaben:**');
    for (const email of digest.action_items) {
      for (const item of email.items) {
        lines.push(`  ☐ ${item.text} _(${email.subject})_`);
      }
    }
  }

  return lines.join('\n');
}
