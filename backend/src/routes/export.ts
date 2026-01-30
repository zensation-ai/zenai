import { Router, Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { queryContext, query, AIContext, isValidContext, isValidUUID } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
// Phase Security Sprint 3: Audit Logging
import { auditLogger } from '../services/audit-logger';

export const exportRouter = Router();

/**
 * Get context from request
 */
function getContext(req: Request): AIContext {
  const context = (req.headers['x-ai-context'] as string) || (req.query.context as string) || 'personal';
  return isValidContext(context) ? context : 'personal';
}

/**
 * Format date for display
 */
function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCSV(field: unknown): string {
  if (field === null || field === undefined) {return '';}
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Parse JSON fields safely - returns string array for export formatting
 */
function parseJSON(field: unknown): string[] {
  if (!field) {return [];}
  if (Array.isArray(field)) {return field.map(item => String(item));}
  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field);
      return Array.isArray(parsed) ? parsed.map(item => String(item)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ============================================
// PDF Export
// ============================================

/**
 * GET /api/export/ideas/pdf
 * Export all ideas as PDF report
 * PROTECTED: Requires authentication and read scope
 */
// Valid values for filtering (allowlist)
const VALID_TYPES = ['idea', 'task', 'insight', 'problem', 'question'];
const VALID_CATEGORIES = ['business', 'technical', 'personal', 'learning'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

/**
 * Validate filter parameter against allowlist
 * SECURITY FIX: Don't expose allowlist values in error messages
 */
function validateFilterParam(value: string | undefined, allowlist: string[], paramName: string): string | undefined {
  if (!value) {return undefined;}
  if (!allowlist.includes(value)) {
    // Generic error message to prevent information disclosure
    throw new ValidationError(`Invalid ${paramName} parameter.`);
  }
  return value;
}

exportRouter.get('/ideas/pdf', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);
  const includeArchived = req.query.includeArchived === 'true';

  // Validate filter parameters against allowlist
  const type = validateFilterParam(req.query.type as string, VALID_TYPES, 'type');
  const category = validateFilterParam(req.query.category as string, VALID_CATEGORIES, 'category');
  const priority = validateFilterParam(req.query.priority as string, VALID_PRIORITIES, 'priority');

  // Build query
  let whereClause = includeArchived ? '' : 'WHERE is_archived = false';
  const params: any[] = [];
  let paramIndex = 1;

  if (type) {
    whereClause += whereClause ? ' AND' : ' WHERE';
    whereClause += ` type = $${paramIndex++}`;
    params.push(type);
  }
  if (category) {
    whereClause += whereClause ? ' AND' : ' WHERE';
    whereClause += ` category = $${paramIndex++}`;
    params.push(category);
  }
  if (priority) {
    whereClause += whereClause ? ' AND' : ' WHERE';
    whereClause += ` priority = $${paramIndex++}`;
    params.push(priority);
  }

  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary, next_steps, context_needed, keywords, created_at
     FROM ideas ${whereClause}
     ORDER BY priority DESC, created_at DESC`,
    params
  );

  // Create PDF
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => {
    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ideas-export-${ctx}-${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  });

  // Header
  doc.fontSize(24).fillColor('#1a1a2e').text('Personal AI Brain', { align: 'center' });
  doc.fontSize(14).fillColor('#666').text(`Ideas Export - ${ctx.charAt(0).toUpperCase() + ctx.slice(1)} Context`, { align: 'center' });
  doc.fontSize(10).text(`Generated: ${formatDate(new Date())}`, { align: 'center' });
  doc.moveDown(2);

  // Stats
  const stats = {
    total: result.rows.length,
    high: result.rows.filter((r) => r.priority === 'high').length,
    medium: result.rows.filter((r) => r.priority === 'medium').length,
    low: result.rows.filter((r) => r.priority === 'low').length,
  };

  doc.fontSize(12).fillColor('#333').text('Summary', { underline: true });
  doc.fontSize(10).fillColor('#666');
  doc.text(`Total Ideas: ${stats.total}`);
  doc.text(`High Priority: ${stats.high} | Medium: ${stats.medium} | Low: ${stats.low}`);
  doc.moveDown(2);

  // Ideas
  doc.fontSize(12).fillColor('#333').text('Ideas', { underline: true });
  doc.moveDown();

  for (const idea of result.rows) {
    // Priority badge color
    const priorityColors: Record<string, string> = {
      high: '#e74c3c',
      medium: '#f39c12',
      low: '#27ae60',
    };

    // Title with priority indicator
    doc.fontSize(11).fillColor(priorityColors[idea.priority] || '#333');
    doc.text(`[${idea.priority?.toUpperCase()}] ${idea.title}`, { continued: false });

    // Metadata
    doc.fontSize(9).fillColor('#888');
    doc.text(`Type: ${idea.type} | Category: ${idea.category} | Created: ${formatDate(idea.created_at)}`);

    // Summary
    if (idea.summary) {
      doc.fontSize(10).fillColor('#444');
      doc.text(idea.summary);
    }

    // Next Steps
    const nextSteps = parseJSON(idea.next_steps);
    if (nextSteps.length > 0) {
      doc.fontSize(9).fillColor('#555');
      doc.text('Next Steps:', { continued: false });
      nextSteps.forEach((step: string, i: number) => {
        doc.text(`  ${i + 1}. ${step}`);
      });
    }

    // Keywords
    const keywords = parseJSON(idea.keywords);
    if (keywords.length > 0) {
      doc.fontSize(8).fillColor('#999');
      doc.text(`Tags: ${keywords.join(', ')}`);
    }

    doc.moveDown(1.5);

    // Page break if near bottom
    if (doc.y > 700) {
      doc.addPage();
    }
  }

  // Footer
  doc.fontSize(8).fillColor('#aaa');
  doc.text('Exported from Personal AI Brain System', 50, doc.page.height - 50, { align: 'center' });

  doc.end();
}));

/**
 * GET /api/export/ideas/:id/pdf
 * Export single idea as PDF
 */
exportRouter.get('/ideas/:id/pdf', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid ID format');
  }

  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary, next_steps, context_needed, keywords, raw_transcript, created_at, updated_at
     FROM ideas WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const idea = result.rows[0];

  // Create PDF
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => {
    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="idea-${id}.pdf"`);
    res.send(pdfBuffer);
  });

  // Title
  const priorityColors: Record<string, string> = {
    high: '#e74c3c',
    medium: '#f39c12',
    low: '#27ae60',
  };

  doc.fontSize(20).fillColor('#1a1a2e').text(idea.title, { align: 'center' });
  doc.moveDown(0.5);

  // Priority Badge
  doc.fontSize(12).fillColor(priorityColors[idea.priority] || '#333');
  doc.text(`Priority: ${idea.priority?.toUpperCase()}`, { align: 'center' });
  doc.moveDown();

  // Metadata
  doc.fontSize(10).fillColor('#666');
  doc.text(`Type: ${idea.type} | Category: ${idea.category}`);
  doc.text(`Created: ${formatDate(idea.created_at)} | Updated: ${formatDate(idea.updated_at)}`);
  doc.moveDown(1.5);

  // Summary
  if (idea.summary) {
    doc.fontSize(12).fillColor('#333').text('Summary', { underline: true });
    doc.fontSize(11).fillColor('#444').text(idea.summary);
    doc.moveDown();
  }

  // Next Steps
  const nextSteps = parseJSON(idea.next_steps);
  if (nextSteps.length > 0) {
    doc.fontSize(12).fillColor('#333').text('Next Steps', { underline: true });
    doc.fontSize(10).fillColor('#444');
    nextSteps.forEach((step: string, i: number) => {
      doc.text(`${i + 1}. ${step}`);
    });
    doc.moveDown();
  }

  // Context Needed
  const contextNeeded = parseJSON(idea.context_needed);
  if (contextNeeded.length > 0) {
    doc.fontSize(12).fillColor('#333').text('Context Needed', { underline: true });
    doc.fontSize(10).fillColor('#444');
    contextNeeded.forEach((ctx: string) => {
      doc.text(`- ${ctx}`);
    });
    doc.moveDown();
  }

  // Keywords
  const keywords = parseJSON(idea.keywords);
  if (keywords.length > 0) {
    doc.fontSize(12).fillColor('#333').text('Keywords', { underline: true });
    doc.fontSize(10).fillColor('#444').text(keywords.join(', '));
    doc.moveDown();
  }

  // Raw Transcript
  if (idea.raw_transcript) {
    doc.fontSize(12).fillColor('#333').text('Original Transcript', { underline: true });
    doc.fontSize(9).fillColor('#666').text(idea.raw_transcript);
  }

  // Footer
  doc.fontSize(8).fillColor('#aaa');
  doc.text(`ID: ${idea.id}`, 50, doc.page.height - 50);

  doc.end();
}));

// ============================================
// Markdown Export
// ============================================

/**
 * GET /api/export/ideas/markdown
 * Export all ideas as Markdown
 */
exportRouter.get('/ideas/markdown', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);
  const includeArchived = req.query.includeArchived === 'true';

  const whereClause = includeArchived ? '' : 'WHERE is_archived = false';

  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary, next_steps, context_needed, keywords, raw_transcript, created_at
     FROM ideas ${whereClause}
     ORDER BY priority DESC, created_at DESC`
  );

  let markdown = `# Personal AI Brain - Ideas Export\n\n`;
  markdown += `**Context:** ${ctx.charAt(0).toUpperCase() + ctx.slice(1)}\n`;
  markdown += `**Exported:** ${formatDate(new Date())}\n`;
  markdown += `**Total Ideas:** ${result.rows.length}\n\n`;
  markdown += `---\n\n`;

  // Group by priority
  const priorities = ['high', 'medium', 'low'];

  for (const prio of priorities) {
    const ideas = result.rows.filter((r) => r.priority === prio);
    if (ideas.length === 0) {continue;}

    const emoji = prio === 'high' ? '🔴' : prio === 'medium' ? '🟡' : '🟢';
    markdown += `## ${emoji} ${prio.charAt(0).toUpperCase() + prio.slice(1)} Priority (${ideas.length})\n\n`;

    for (const idea of ideas) {
      markdown += `### ${idea.title}\n\n`;
      markdown += `| Property | Value |\n`;
      markdown += `|----------|-------|\n`;
      markdown += `| Type | ${idea.type} |\n`;
      markdown += `| Category | ${idea.category} |\n`;
      markdown += `| Created | ${formatDate(idea.created_at)} |\n\n`;

      if (idea.summary) {
        markdown += `**Summary:**\n${idea.summary}\n\n`;
      }

      const nextSteps = parseJSON(idea.next_steps);
      if (nextSteps.length > 0) {
        markdown += `**Next Steps:**\n`;
        nextSteps.forEach((step: string, i: number) => {
          markdown += `${i + 1}. ${step}\n`;
        });
        markdown += `\n`;
      }

      const contextNeeded = parseJSON(idea.context_needed);
      if (contextNeeded.length > 0) {
        markdown += `**Context Needed:**\n`;
        contextNeeded.forEach((ctx: string) => {
          markdown += `- ${ctx}\n`;
        });
        markdown += `\n`;
      }

      const keywords = parseJSON(idea.keywords);
      if (keywords.length > 0) {
        markdown += `**Tags:** ${keywords.map((k: string) => `\`${k}\``).join(' ')}\n\n`;
      }

      markdown += `---\n\n`;
    }
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ideas-export-${ctx}-${Date.now()}.md"`);
  res.send(markdown);
}));

/**
 * GET /api/export/ideas/:id/markdown
 * Export single idea as Markdown
 */
exportRouter.get('/ideas/:id/markdown', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid ID format');
  }

  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary, next_steps, context_needed, keywords, raw_transcript, created_at, updated_at
     FROM ideas WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Idea');
  }

  const idea = result.rows[0];
  const emoji = idea.priority === 'high' ? '🔴' : idea.priority === 'medium' ? '🟡' : '🟢';

  let markdown = `# ${idea.title}\n\n`;
  markdown += `${emoji} **Priority:** ${idea.priority}\n\n`;
  markdown += `| Property | Value |\n`;
  markdown += `|----------|-------|\n`;
  markdown += `| Type | ${idea.type} |\n`;
  markdown += `| Category | ${idea.category} |\n`;
  markdown += `| Created | ${formatDate(idea.created_at)} |\n`;
  markdown += `| Updated | ${formatDate(idea.updated_at)} |\n`;
  markdown += `| ID | \`${idea.id}\` |\n\n`;

  if (idea.summary) {
    markdown += `## Summary\n\n${idea.summary}\n\n`;
  }

  const nextSteps = parseJSON(idea.next_steps);
  if (nextSteps.length > 0) {
    markdown += `## Next Steps\n\n`;
    nextSteps.forEach((step: string, _i: number) => {
      markdown += `- [ ] ${step}\n`;
    });
    markdown += `\n`;
  }

  const contextNeeded = parseJSON(idea.context_needed);
  if (contextNeeded.length > 0) {
    markdown += `## Context Needed\n\n`;
    contextNeeded.forEach((ctx: string) => {
      markdown += `- ${ctx}\n`;
    });
    markdown += `\n`;
  }

  const keywords = parseJSON(idea.keywords);
  if (keywords.length > 0) {
    markdown += `## Tags\n\n${keywords.map((k: string) => `\`${k}\``).join(' ')}\n\n`;
  }

  if (idea.raw_transcript) {
    markdown += `## Original Transcript\n\n> ${idea.raw_transcript.replace(/\n/g, '\n> ')}\n`;
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="idea-${id}.md"`);
  res.send(markdown);
}));

// ============================================
// CSV Export
// ============================================

/**
 * GET /api/export/ideas/csv
 * Export all ideas as CSV
 */
exportRouter.get('/ideas/csv', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);
  const includeArchived = req.query.includeArchived === 'true';

  const whereClause = includeArchived ? '' : 'WHERE is_archived = false';

  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary, next_steps, context_needed, keywords, raw_transcript, created_at, updated_at, is_archived
     FROM ideas ${whereClause}
     ORDER BY created_at DESC`
  );

  // CSV Header
  const headers = ['ID', 'Title', 'Type', 'Category', 'Priority', 'Summary', 'Next Steps', 'Context Needed', 'Keywords', 'Raw Transcript', 'Created', 'Updated', 'Archived'];

  let csv = headers.join(',') + '\n';

  for (const idea of result.rows) {
    const nextSteps = parseJSON(idea.next_steps).join('; ');
    const contextNeeded = parseJSON(idea.context_needed).join('; ');
    const keywords = parseJSON(idea.keywords).join('; ');

    const row = [
      escapeCSV(idea.id),
      escapeCSV(idea.title),
      escapeCSV(idea.type),
      escapeCSV(idea.category),
      escapeCSV(idea.priority),
      escapeCSV(idea.summary),
      escapeCSV(nextSteps),
      escapeCSV(contextNeeded),
      escapeCSV(keywords),
      escapeCSV(idea.raw_transcript),
      escapeCSV(formatDate(idea.created_at)),
      escapeCSV(formatDate(idea.updated_at)),
      escapeCSV(idea.is_archived ? 'Yes' : 'No'),
    ];

    csv += row.join(',') + '\n';
  }

  // BOM for Excel UTF-8 compatibility
  const bom = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ideas-export-${ctx}-${Date.now()}.csv"`);
  res.send(bom + csv);
}));

// ============================================
// JSON Export (Backup)
// ============================================

/**
 * GET /api/export/ideas/json
 * Export all ideas as JSON (backup format)
 */
exportRouter.get('/ideas/json', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);
  const includeArchived = req.query.includeArchived === 'true';

  const whereClause = includeArchived ? '' : 'WHERE is_archived = false';

  const result = await queryContext(
    ctx,
    `SELECT id, title, type, category, priority, summary, next_steps, context_needed, keywords, raw_transcript, created_at, updated_at, is_archived
     FROM ideas ${whereClause}
     ORDER BY created_at DESC`
  );

  const exportData = {
    exportedAt: new Date().toISOString(),
    context: ctx,
    version: '1.0',
    totalIdeas: result.rows.length,
    ideas: result.rows.map((row) => ({
      ...row,
      next_steps: parseJSON(row.next_steps),
      context_needed: parseJSON(row.context_needed),
      keywords: parseJSON(row.keywords),
    })),
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ideas-backup-${ctx}-${Date.now()}.json"`);
  res.json(exportData);
}));

// ============================================
// Incubator Export
// ============================================

/**
 * GET /api/export/incubator/markdown
 * Export thought clusters as Markdown
 */
exportRouter.get('/incubator/markdown', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);

  // Get clusters with their thoughts
  const clustersResult = await queryContext(
    ctx,
    `SELECT tc.id, tc.suggested_title, tc.suggested_type, tc.suggested_category,
            tc.suggested_priority, tc.summary, tc.confidence, tc.maturity_score,
            tc.status, tc.created_at,
            array_agg(lt.content ORDER BY lt.created_at) as thoughts
     FROM thought_clusters tc
     LEFT JOIN loose_thoughts lt ON lt.cluster_id = tc.id
     WHERE tc.status != 'dismissed'
     GROUP BY tc.id
     ORDER BY tc.maturity_score DESC`
  );

  let markdown = `# Thought Incubator Export\n\n`;
  markdown += `**Context:** ${ctx.charAt(0).toUpperCase() + ctx.slice(1)}\n`;
  markdown += `**Exported:** ${formatDate(new Date())}\n`;
  markdown += `**Total Clusters:** ${clustersResult.rows.length}\n\n`;
  markdown += `---\n\n`;

  for (const cluster of clustersResult.rows) {
    const statusEmoji = cluster.status === 'ready' ? '✅' : cluster.status === 'growing' ? '🌱' : '📦';
    const maturityBar = '█'.repeat(Math.round(cluster.maturity_score * 10)) + '░'.repeat(10 - Math.round(cluster.maturity_score * 10));

    markdown += `## ${statusEmoji} ${cluster.suggested_title || 'Untitled Cluster'}\n\n`;
    markdown += `**Maturity:** ${maturityBar} ${Math.round(cluster.maturity_score * 100)}%\n`;
    markdown += `**Confidence:** ${Math.round(cluster.confidence * 100)}%\n`;
    markdown += `**Status:** ${cluster.status}\n`;
    markdown += `**Type:** ${cluster.suggested_type} | **Category:** ${cluster.suggested_category} | **Priority:** ${cluster.suggested_priority}\n\n`;

    if (cluster.summary) {
      markdown += `**Summary:**\n${cluster.summary}\n\n`;
    }

    if (cluster.thoughts && cluster.thoughts[0]) {
      markdown += `**Thoughts:**\n`;
      cluster.thoughts.forEach((thought: string, i: number) => {
        if (thought) {
          markdown += `${i + 1}. ${thought}\n`;
        }
      });
      markdown += `\n`;
    }

    markdown += `---\n\n`;
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="incubator-export-${ctx}-${Date.now()}.md"`);
  res.send(markdown);
}));

// ============================================
// Meetings Export
// ============================================

/**
 * GET /api/export/meetings/pdf
 * Export all meetings as PDF
 */
exportRouter.get('/meetings/pdf', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);

  const result = await queryContext(
    ctx,
    `SELECT id, title, meeting_date, participants, location, meeting_type, notes, action_items, created_at
     FROM meetings
     ORDER BY meeting_date DESC`
  );

  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => {
    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="meetings-export-${ctx}-${Date.now()}.pdf"`);
    res.send(pdfBuffer);
  });

  // Header
  doc.fontSize(24).fillColor('#1a1a2e').text('Meeting Notes Export', { align: 'center' });
  doc.fontSize(14).fillColor('#666').text(`${ctx.charAt(0).toUpperCase() + ctx.slice(1)} Context`, { align: 'center' });
  doc.fontSize(10).text(`Generated: ${formatDate(new Date())}`, { align: 'center' });
  doc.moveDown(2);

  for (const meeting of result.rows) {
    doc.fontSize(14).fillColor('#1a1a2e').text(meeting.title);
    doc.fontSize(10).fillColor('#666');
    doc.text(`Date: ${formatDate(meeting.meeting_date)} | Type: ${meeting.meeting_type || 'General'}`);

    if (meeting.location) {
      doc.text(`Location: ${meeting.location}`);
    }

    const participants = parseJSON(meeting.participants);
    if (participants.length > 0) {
      doc.text(`Participants: ${participants.join(', ')}`);
    }

    doc.moveDown(0.5);

    if (meeting.notes) {
      doc.fontSize(10).fillColor('#333').text('Notes:', { underline: true });
      doc.fontSize(9).fillColor('#444').text(meeting.notes);
    }

    const actionItems = parseJSON(meeting.action_items);
    if (actionItems.length > 0) {
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#333').text('Action Items:', { underline: true });
      doc.fontSize(9).fillColor('#444');
      actionItems.forEach((item: any, i: number) => {
        const text = typeof item === 'string' ? item : item.task || item.description || JSON.stringify(item);
        doc.text(`${i + 1}. ${text}`);
      });
    }

    doc.moveDown(1.5);

    if (doc.y > 700) {
      doc.addPage();
    }
  }

  doc.end();
}));

/**
 * GET /api/export/meetings/csv
 * Export all meetings as CSV
 */
exportRouter.get('/meetings/csv', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);

  const result = await queryContext(
    ctx,
    `SELECT id, title, meeting_date, participants, location, meeting_type, notes, action_items, created_at
     FROM meetings
     ORDER BY meeting_date DESC`
  );

  const headers = ['ID', 'Title', 'Date', 'Type', 'Location', 'Participants', 'Notes', 'Action Items', 'Created'];
  let csv = headers.join(',') + '\n';

  for (const meeting of result.rows) {
    const participants = parseJSON(meeting.participants).join('; ');
    const actionItems = parseJSON(meeting.action_items)
      .map((item: any) => (typeof item === 'string' ? item : item.task || ''))
      .join('; ');

    const row = [
      escapeCSV(meeting.id),
      escapeCSV(meeting.title),
      escapeCSV(formatDate(meeting.meeting_date)),
      escapeCSV(meeting.meeting_type),
      escapeCSV(meeting.location),
      escapeCSV(participants),
      escapeCSV(meeting.notes),
      escapeCSV(actionItems),
      escapeCSV(formatDate(meeting.created_at)),
    ];

    csv += row.join(',') + '\n';
  }

  const bom = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="meetings-export-${ctx}-${Date.now()}.csv"`);
  res.send(bom + csv);
}));

// ============================================
// Full Backup
// ============================================

/**
 * GET /api/export/backup
 * Export complete backup (all data)
 * SECURITY: Filters by context, includes all columns for complete backup
 */
exportRouter.get('/backup', apiKeyAuth, requireScope('admin'), asyncHandler(async (req: Request, res: Response) => {
  const ctx = getContext(req);

  // Safety limit to prevent memory exhaustion (adjust as needed)
  const MAX_BACKUP_ROWS = 10000;

  // SECURITY FIX: Explicitly select columns and exclude sensitive data like embeddings
  // Embeddings are large binary data that don't belong in JSON exports
  const [ideasResult, meetingsResult, clustersResult, thoughtsResult] = await Promise.all([
    queryContext(ctx, `
      SELECT id, title, type, category, priority, summary, next_steps, context_needed,
             keywords, raw_transcript, context, created_at, updated_at, is_archived,
             viewed_count, company_id, primary_topic_id
      FROM ideas
      WHERE context = $1
      ORDER BY created_at DESC
      LIMIT ${MAX_BACKUP_ROWS}`, [ctx]),
    queryContext(ctx, `
      SELECT id, company_id, title, date, duration_minutes, participants, location,
             meeting_type, status, context, created_at, updated_at
      FROM meetings
      WHERE context = $1
      ORDER BY date DESC
      LIMIT ${MAX_BACKUP_ROWS}`, [ctx]),
    queryContext(ctx, `
      SELECT id, user_id, title, summary, suggested_type, suggested_category,
             thought_count, confidence_score, maturity_score, status,
             consolidated_idea_id, context, created_at, updated_at
      FROM thought_clusters
      WHERE context = $1
      ORDER BY created_at DESC
      LIMIT ${MAX_BACKUP_ROWS}`, [ctx]),
    queryContext(ctx, `
      SELECT id, user_id, raw_input, source, user_tags, cluster_id,
             similarity_to_cluster, is_processed, context, created_at, updated_at
      FROM loose_thoughts
      WHERE context = $1
      ORDER BY created_at DESC
      LIMIT ${MAX_BACKUP_ROWS}`, [ctx]),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    context: ctx,
    version: '1.0',
    data: {
      ideas: {
        count: ideasResult.rows.length,
        items: ideasResult.rows.map((row) => ({
          ...row,
          next_steps: parseJSON(row.next_steps),
          context_needed: parseJSON(row.context_needed),
          keywords: parseJSON(row.keywords),
        })),
      },
      meetings: {
        count: meetingsResult.rows.length,
        items: meetingsResult.rows.map((row) => ({
          ...row,
          participants: parseJSON(row.participants),
          action_items: parseJSON(row.action_items),
        })),
      },
      thoughtClusters: {
        count: clustersResult.rows.length,
        items: clustersResult.rows,
      },
      looseThoughts: {
        count: thoughtsResult.rows.length,
        items: thoughtsResult.rows,
      },
    },
  };

  // Phase Security Sprint 3: Audit log full backup export
  await auditLogger.logExport({
    exportType: 'backup',
    req,
    resourceType: 'full_backup',
    resourceCount: ideasResult.rows.length + meetingsResult.rows.length + clustersResult.rows.length + thoughtsResult.rows.length,
    outcome: 'success',
    details: {
      context: ctx,
      ideasCount: ideasResult.rows.length,
      meetingsCount: meetingsResult.rows.length,
      clustersCount: clustersResult.rows.length,
      thoughtsCount: thoughtsResult.rows.length,
    },
  });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="full-backup-${ctx}-${Date.now()}.json"`);
  res.json(backup);
}));

// ============================================
// Export History
// ============================================

/**
 * GET /api/export/history
 * Get export history (recent exports)
 */
exportRouter.get('/history', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const result = await query(
    `SELECT id, export_type, filename, file_size, ideas_count, filters, created_at
     FROM export_history
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM export_history`
  );

  res.json({
    history: result.rows,
    pagination: {
      total: parseInt(countResult.rows[0]?.total || '0'),
      limit,
      offset,
    },
  });
}));

/**
 * POST /api/export/history
 * Record an export in history
 */
exportRouter.post('/history', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { export_type, filename, file_size, ideas_count, filters } = req.body;

  // Validate export_type
  const validTypes = ['pdf', 'markdown', 'csv', 'json', 'backup'];
  if (!export_type || !validTypes.includes(export_type)) {
    throw new ValidationError(`Invalid export_type. Allowed values: ${validTypes.join(', ')}`);
  }

  const result = await query(
    `INSERT INTO export_history (export_type, filename, file_size, ideas_count, filters)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, export_type, filename, file_size, ideas_count, filters, created_at`,
    [
      export_type,
      filename || null,
      file_size || null,
      ideas_count || 0,
      JSON.stringify(filters || {}),
    ]
  );

  res.status(201).json(result.rows[0]);
}));
