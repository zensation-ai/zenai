/**
 * Email Search Service - Phase 43
 *
 * Natural language email search with SQL query generation.
 * Enables "Ask My Inbox" — users query their emails via chat.
 *
 * Features:
 * - Natural language → SQL filter translation
 * - Full-text search over subject + body
 * - Filter by sender, date range, category, priority, status
 * - Thread-aware results with AI summaries
 * - Relevance scoring
 */

import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';

/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString). */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ============================================================
// Types
// ============================================================

export interface EmailSearchQuery {
  /** Free-text search term */
  text?: string;
  /** Filter by sender address or name */
  from?: string;
  /** Filter by recipient */
  to?: string;
  /** Filter by date range */
  after?: string;
  before?: string;
  /** Filter by AI category */
  category?: string;
  /** Filter by AI priority */
  priority?: string;
  /** Filter by status */
  status?: string;
  /** Filter by direction */
  direction?: 'inbound' | 'outbound';
  /** Only starred */
  starred?: boolean;
  /** Only with attachments */
  hasAttachments?: boolean;
  /** Only with action items */
  hasActionItems?: boolean;
  /** Max results */
  limit?: number;
}

export interface EmailSearchResult {
  id: string;
  subject: string;
  from_address: string;
  from_name: string | null;
  to_addresses: unknown;
  direction: string;
  status: string;
  received_at: string;
  ai_summary: string | null;
  ai_category: string | null;
  ai_priority: string | null;
  ai_sentiment: string | null;
  ai_action_items: string | null;
  is_starred: boolean;
  has_attachments: boolean;
  thread_id: string | null;
  body_preview: string;
  relevance_score: number;
}

export interface EmailSearchResponse {
  results: EmailSearchResult[];
  total: number;
  query: EmailSearchQuery;
}

export interface InboxSummary {
  total_emails: number;
  unread: number;
  by_category: Record<string, number>;
  by_priority: Record<string, number>;
  by_sender: Array<{ address: string; name: string | null; count: number }>;
  recent_action_items: Array<{ email_id: string; subject: string; items: Array<{ text: string }> }>;
  date_range: { oldest: string | null; newest: string | null };
}

// ============================================================
// Natural Language Query Parser
// ============================================================

/**
 * Parse a natural language query into structured search filters.
 * Handles German and English patterns.
 */
export function parseNaturalLanguageQuery(input: string): EmailSearchQuery {
  const query: EmailSearchQuery = {};
  let remaining = input;

  // Extract "from" patterns (don't match date keywords like "von gestern")
  const dateKeywords = /^(heute|gestern|diese[rmn]?|letzte[rmn]?|nach|vor|seit|this|last)\b/i;
  const fromMatch = remaining.match(/(?:von|from)\s+(\S+(?:\s+(?!heute|gestern|diese|letzte|diesen|letzten|nach|vor|seit)\S+)?)/i);
  if (fromMatch && !dateKeywords.test(fromMatch[1])) {
    query.from = fromMatch[1].replace(/["""]/g, '');
    remaining = remaining.replace(fromMatch[0], '').trim();
  }

  // Extract "to" patterns
  const toMatch = remaining.match(/(?:an|to)\s+(\S+(?:\s+\S+)?)/i);
  if (toMatch) {
    query.to = toMatch[1].replace(/["""]/g, '');
    remaining = remaining.replace(toMatch[0], '').trim();
  }

  // Extract date patterns
  const afterMatch = remaining.match(/(?:nach dem|seit|after|since)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})/i);
  if (afterMatch) {
    query.after = normalizeDate(afterMatch[1]);
    remaining = remaining.replace(afterMatch[0], '').trim();
  }

  const beforeMatch = remaining.match(/(?:vor dem|before|bis)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})/i);
  if (beforeMatch) {
    query.before = normalizeDate(beforeMatch[1]);
    remaining = remaining.replace(beforeMatch[0], '').trim();
  }

  // Relative date patterns
  const todayMatch = remaining.match(/\b(heute|today)\b/i);
  if (todayMatch) {
    query.after = toLocalDateString(new Date());
    remaining = remaining.replace(todayMatch[0], '').trim();
  }

  const yesterdayMatch = remaining.match(/\b(gestern|yesterday)\b/i);
  if (yesterdayMatch) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    query.after = toLocalDateString(d);
    query.before = toLocalDateString(new Date());
    remaining = remaining.replace(yesterdayMatch[0], '').trim();
  }

  const weekMatch = remaining.match(/\b(diese woche|this week|letzte woche|last week)\b/i);
  if (weekMatch) {
    const d = new Date();
    const isLast = /letzte|last/i.test(weekMatch[1]);
    if (isLast) {
      d.setDate(d.getDate() - 7);
      query.before = toLocalDateString(new Date());
    }
    // Start of week (Monday)
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    query.after = toLocalDateString(d);
    remaining = remaining.replace(weekMatch[0], '').trim();
  }

  const monthMatch = remaining.match(/\b(diesen monat|this month|letzten monat|last month)\b/i);
  if (monthMatch) {
    const d = new Date();
    const isLast = /letzten|last/i.test(monthMatch[1]);
    if (isLast) {
      d.setMonth(d.getMonth() - 1);
      query.before = toLocalDateString(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    }
    query.after = toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1));
    remaining = remaining.replace(monthMatch[0], '').trim();
  }

  // Extract category
  const catMatch = remaining.match(/\b(business|personal|newsletter|notification|spam)\b/i);
  if (catMatch) {
    query.category = catMatch[1].toLowerCase();
    remaining = remaining.replace(catMatch[0], '').trim();
  }

  // Extract priority
  const prioMatch = remaining.match(/\b(urgent|dringend\w*|wichtig\w*|high|niedrig\w*|low)\b/i);
  if (prioMatch) {
    const p = prioMatch[1].toLowerCase();
    if (p.startsWith('dringend') || p === 'urgent') query.priority = 'urgent';
    else if (p.startsWith('wichtig') || p === 'high') query.priority = 'high';
    else if (p.startsWith('niedrig') || p === 'low') query.priority = 'low';
    remaining = remaining.replace(prioMatch[0], '').trim();
  }

  // Extract direction
  const dirMatch = remaining.match(/\b(empfangen\w*|eingehend\w*|inbound|gesendet\w*|outbound|ausgehend\w*)\b/i);
  if (dirMatch) {
    const d = dirMatch[1].toLowerCase();
    query.direction = (d.startsWith('gesendet') || d === 'outbound' || d.startsWith('ausgehend')) ? 'outbound' : 'inbound';
    remaining = remaining.replace(dirMatch[0], '').trim();
  }

  // Starred
  if (/\b(markiert\w*|starred|favorit\w*|stern)\b/i.test(remaining)) {
    query.starred = true;
    remaining = remaining.replace(/\b(markiert\w*|starred|favorit\w*|stern)\b/i, '').trim();
  }

  // Attachments
  if (/\b(anhang|anh[aä]nge\w*|attachment\w*)\b/i.test(remaining)) {
    query.hasAttachments = true;
    remaining = remaining.replace(/\b(anhang|anh[aä]nge\w*|attachment\w*)\b/i, '').trim();
  }

  // Action items
  if (/\b(action.?items?|aufgaben?\w*|todo|to-do)\b/i.test(remaining)) {
    query.hasActionItems = true;
    remaining = remaining.replace(/\b(action.?items?|aufgaben?\w*|todos?|to-dos?)\b/i, '').trim();
  }

  // Unread
  if (/\b(ungelesen\w*|unread|neue?\w*)\b/i.test(remaining)) {
    query.status = 'received';
    remaining = remaining.replace(/\b(ungelesen\w*|unread|neue?\w*)\b/i, '').trim();
  }

  // Remaining text becomes the search query (clean up noise words)
  remaining = remaining
    .replace(/\b(e-?mails?|mails?|nachrichten?|inbox|postfach|posteingang)\b/gi, '')
    .replace(/\b(zeig|zeige|finde|suche|such|liste|gib|was|wie|welche|mir|meine|alle|die|der|das|den|dem|in|im|aus|mit|ueber|über)\b/gi, '')
    .replace(/[?!.,;:]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (remaining.length >= 2) {
    query.text = remaining;
  }

  return query;
}

// ============================================================
// Search Execution
// ============================================================

/**
 * Search emails with structured filters.
 */
export async function searchEmails(
  context: AIContext,
  query: EmailSearchQuery
): Promise<EmailSearchResponse> {
  const conditions: string[] = [];
  const params: (string | boolean | number)[] = [];
  let paramIdx = 1;

  // Full-text search on subject + body
  if (query.text) {
    conditions.push(`(
      subject ILIKE $${paramIdx} OR
      body_text ILIKE $${paramIdx} OR
      from_name ILIKE $${paramIdx} OR
      from_address ILIKE $${paramIdx} OR
      ai_summary ILIKE $${paramIdx}
    )`);
    params.push(`%${query.text}%`);
    paramIdx++;
  }

  // From filter
  if (query.from) {
    conditions.push(`(from_address ILIKE $${paramIdx} OR from_name ILIKE $${paramIdx})`);
    params.push(`%${query.from}%`);
    paramIdx++;
  }

  // To filter
  if (query.to) {
    conditions.push(`to_addresses::text ILIKE $${paramIdx}`);
    params.push(`%${query.to}%`);
    paramIdx++;
  }

  // Date range
  if (query.after) {
    conditions.push(`received_at >= $${paramIdx}::timestamptz`);
    params.push(query.after);
    paramIdx++;
  }
  if (query.before) {
    conditions.push(`received_at < ($${paramIdx}::date + interval '1 day')`);
    params.push(query.before);
    paramIdx++;
  }

  // Category, priority, status, direction
  if (query.category) {
    conditions.push(`ai_category = $${paramIdx}`);
    params.push(query.category);
    paramIdx++;
  }
  if (query.priority) {
    conditions.push(`ai_priority = $${paramIdx}`);
    params.push(query.priority);
    paramIdx++;
  }
  if (query.status) {
    conditions.push(`status = $${paramIdx}`);
    params.push(query.status);
    paramIdx++;
  }
  if (query.direction) {
    conditions.push(`direction = $${paramIdx}`);
    params.push(query.direction);
    paramIdx++;
  }

  // Boolean filters
  if (query.starred) {
    conditions.push('is_starred = true');
  }
  if (query.hasAttachments) {
    conditions.push('has_attachments = true');
  }
  if (query.hasActionItems) {
    conditions.push("ai_action_items IS NOT NULL AND ai_action_items != '[]'");
  }

  // Exclude trash
  conditions.push("status != 'trash'");

  const whereClause = conditions.length > 0
    ? 'WHERE ' + conditions.join(' AND ')
    : "WHERE status != 'trash'";

  const limit = Math.min(query.limit || 10, 50);

  // Count total
  const countResult = await queryContext(context, `
    SELECT COUNT(*) as total FROM emails ${whereClause}
  `, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  // Fetch results
  params.push(limit);
  const limitParam = `$${params.length}`;
  const result = await queryContext(context, `
    SELECT
      id, subject, from_address, from_name, to_addresses,
      direction, status, received_at,
      ai_summary, ai_category, ai_priority, ai_sentiment, ai_action_items,
      is_starred, has_attachments, thread_id,
      LEFT(COALESCE(body_text, ''), 200) as body_preview
    FROM emails
    ${whereClause}
    ORDER BY received_at DESC
    LIMIT ${limitParam}
  `, params);

  const results: EmailSearchResult[] = result.rows.map(row => ({
    ...row,
    body_preview: row.body_preview || '',
    relevance_score: calculateRelevance(row, query),
  }));

  // Sort by relevance if text search was used
  if (query.text) {
    results.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  return { results, total, query };
}

/**
 * Get inbox summary statistics.
 */
export async function getInboxSummary(context: AIContext): Promise<InboxSummary> {
  // Parallel queries for efficiency
  const [totalRes, unreadRes, catRes, prioRes, senderRes, actionRes, dateRes] = await Promise.all([
    queryContext(context, `SELECT COUNT(*) as c FROM emails WHERE status != 'trash'`, []),
    queryContext(context, `SELECT COUNT(*) as c FROM emails WHERE status = 'received'`, []),
    queryContext(context, `
      SELECT ai_category, COUNT(*) as c FROM emails
      WHERE status != 'trash' AND ai_category IS NOT NULL
      GROUP BY ai_category ORDER BY c DESC
    `, []),
    queryContext(context, `
      SELECT ai_priority, COUNT(*) as c FROM emails
      WHERE status != 'trash' AND ai_priority IS NOT NULL
      GROUP BY ai_priority ORDER BY c DESC
    `, []),
    queryContext(context, `
      SELECT from_address, from_name, COUNT(*) as c FROM emails
      WHERE status != 'trash'
      GROUP BY from_address, from_name
      ORDER BY c DESC LIMIT 10
    `, []),
    queryContext(context, `
      SELECT id, subject, ai_action_items FROM emails
      WHERE ai_action_items IS NOT NULL AND ai_action_items != '[]'
        AND status NOT IN ('trash', 'archived')
      ORDER BY received_at DESC LIMIT 5
    `, []),
    queryContext(context, `
      SELECT MIN(received_at) as oldest, MAX(received_at) as newest
      FROM emails WHERE status != 'trash'
    `, []),
  ]);

  const byCategory: Record<string, number> = {};
  for (const row of catRes.rows) {
    byCategory[row.ai_category] = parseInt(row.c, 10);
  }

  const byPriority: Record<string, number> = {};
  for (const row of prioRes.rows) {
    byPriority[row.ai_priority] = parseInt(row.c, 10);
  }

  const bySender = senderRes.rows.map(row => ({
    address: row.from_address,
    name: row.from_name,
    count: parseInt(row.c, 10),
  }));

  const recentActionItems = actionRes.rows.map(row => {
    let items: Array<{ text: string }> = [];
    try {
      items = typeof row.ai_action_items === 'string'
        ? JSON.parse(row.ai_action_items)
        : row.ai_action_items || [];
    } catch { /* ignore */ }
    return { email_id: row.id, subject: row.subject, items };
  });

  return {
    total_emails: parseInt(totalRes.rows[0]?.c || '0', 10),
    unread: parseInt(unreadRes.rows[0]?.c || '0', 10),
    by_category: byCategory,
    by_priority: byPriority,
    by_sender: bySender,
    recent_action_items: recentActionItems,
    date_range: {
      oldest: dateRes.rows[0]?.oldest || null,
      newest: dateRes.rows[0]?.newest || null,
    },
  };
}

/**
 * Format search results for chat display.
 */
export function formatSearchResultsForChat(response: EmailSearchResponse): string {
  if (response.results.length === 0) {
    return 'Keine E-Mails gefunden, die deiner Suche entsprechen.';
  }

  const lines: string[] = [];
  lines.push(`**${response.total} E-Mail${response.total !== 1 ? 's' : ''} gefunden:**\n`);

  for (const email of response.results) {
    const date = new Date(email.received_at).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
    const dir = email.direction === 'inbound' ? '📥' : '📤';
    const star = email.is_starred ? '⭐ ' : '';
    const prio = email.ai_priority === 'urgent' ? '🔴 ' :
                 email.ai_priority === 'high' ? '🟠 ' : '';

    lines.push(`${dir} ${star}${prio}**${email.subject || '(Kein Betreff)'}**`);
    lines.push(`   ${date} | ${email.from_name || email.from_address}`);

    if (email.ai_summary) {
      lines.push(`   _${email.ai_summary}_`);
    }

    if (email.ai_action_items) {
      let items: Array<{ text: string }> = [];
      try {
        items = typeof email.ai_action_items === 'string'
          ? JSON.parse(email.ai_action_items)
          : email.ai_action_items || [];
      } catch { /* ignore */ }
      if (items.length > 0) {
        lines.push(`   📋 ${items.length} Aufgabe${items.length > 1 ? 'n' : ''}`);
      }
    }

    lines.push('');
  }

  if (response.total > response.results.length) {
    lines.push(`_...und ${response.total - response.results.length} weitere E-Mails._`);
  }

  return lines.join('\n');
}

/**
 * Format inbox summary for chat display.
 */
export function formatInboxSummaryForChat(summary: InboxSummary): string {
  const lines: string[] = [];

  lines.push(`**Inbox-Überblick:**\n`);
  lines.push(`📬 ${summary.total_emails} E-Mails gesamt | ${summary.unread} ungelesen\n`);

  // Categories
  if (Object.keys(summary.by_category).length > 0) {
    lines.push('**Nach Kategorie:**');
    const catEmojis: Record<string, string> = {
      business: '💼', personal: '👤', newsletter: '📰', notification: '🔔', spam: '🚫',
    };
    for (const [cat, count] of Object.entries(summary.by_category)) {
      lines.push(`  ${catEmojis[cat] || '📧'} ${cat}: ${count}`);
    }
    lines.push('');
  }

  // Priority breakdown
  if (Object.keys(summary.by_priority).length > 0) {
    lines.push('**Nach Priorität:**');
    const prioEmojis: Record<string, string> = {
      urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢',
    };
    for (const [prio, count] of Object.entries(summary.by_priority)) {
      lines.push(`  ${prioEmojis[prio] || '⚪'} ${prio}: ${count}`);
    }
    lines.push('');
  }

  // Top senders
  if (summary.by_sender.length > 0) {
    lines.push('**Häufigste Absender:**');
    for (const sender of summary.by_sender.slice(0, 5)) {
      lines.push(`  👤 ${sender.name || sender.address}: ${sender.count} E-Mails`);
    }
    lines.push('');
  }

  // Action items
  if (summary.recent_action_items.length > 0) {
    lines.push('**Offene Aufgaben aus E-Mails:**');
    for (const email of summary.recent_action_items) {
      for (const item of email.items.slice(0, 2)) {
        lines.push(`  ☐ ${item.text} _(aus: ${email.subject})_`);
      }
    }
  }

  return lines.join('\n');
}

// ============================================================
// Helpers
// ============================================================

function normalizeDate(dateStr: string): string {
  // Handle DD.MM.YYYY format
  const dotMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    return `${dotMatch[3]}-${dotMatch[2].padStart(2, '0')}-${dotMatch[1].padStart(2, '0')}`;
  }
  return dateStr;
}

function calculateRelevance(row: Record<string, unknown>, query: EmailSearchQuery): number {
  let score = 0.5;
  const text = (query.text || '').toLowerCase();

  if (text) {
    const subject = ((row.subject as string) || '').toLowerCase();
    const summary = ((row.ai_summary as string) || '').toLowerCase();
    const fromName = ((row.from_name as string) || '').toLowerCase();

    if (subject.includes(text)) score += 0.3;
    if (summary.includes(text)) score += 0.2;
    if (fromName.includes(text)) score += 0.1;
  }

  // Boost priority emails
  if (row.ai_priority === 'urgent') score += 0.15;
  else if (row.ai_priority === 'high') score += 0.1;

  // Boost starred
  if (row.is_starred) score += 0.05;

  // Boost recent emails
  const age = Date.now() - new Date(row.received_at as string).getTime();
  const dayAge = age / (1000 * 60 * 60 * 24);
  if (dayAge < 1) score += 0.1;
  else if (dayAge < 7) score += 0.05;

  return Math.min(score, 1.0);
}

export { EmailSearchQuery as SearchQuery };

logger.info('Email search service initialized', { operation: 'emailSearch' });
