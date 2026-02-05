/**
 * Export Helpers
 *
 * Shared utilities for PDF and Markdown export functionality.
 * Reduces code duplication across export routes.
 */

import PDFDocument from 'pdfkit';

// ===========================================
// Types
// ===========================================

export interface IdeaRow {
  id: string;
  title: string;
  type: string;
  category: string;
  priority: string;
  summary?: string;
  next_steps?: unknown;
  context_needed?: unknown;
  keywords?: unknown;
  raw_transcript?: string;
  created_at: Date | string;
  updated_at?: Date | string;
}

export interface ExportFilters {
  type?: string;
  category?: string;
  priority?: string;
  includeArchived?: boolean;
}

// Valid filter values (allowlist)
export const VALID_TYPES = ['idea', 'task', 'insight', 'problem', 'question'];
export const VALID_CATEGORIES = ['business', 'technical', 'personal', 'learning'];
export const VALID_PRIORITIES = ['low', 'medium', 'high'];

// Priority colors for PDF
export const PRIORITY_COLORS: Record<string, string> = {
  high: '#e74c3c',
  medium: '#f39c12',
  low: '#27ae60',
};

// Priority emojis for Markdown
export const PRIORITY_EMOJIS: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

// ===========================================
// Formatting Utilities
// ===========================================

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
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
export function escapeCSV(field: unknown): string {
  if (field === null || field === undefined) {
    return '';
  }
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Parse JSON fields safely - returns string array for export formatting
 */
export function parseJSON(field: unknown): string[] {
  if (!field) {
    return [];
  }
  if (Array.isArray(field)) {
    return field.map(item => String(item));
  }
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

/**
 * Capitalize first letter of string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ===========================================
// Filter Building
// ===========================================

export interface FilterResult {
  whereClause: string;
  params: unknown[];
}

/**
 * Build WHERE clause from filter parameters
 */
export function buildFilterClause(filters: ExportFilters, startParamIndex = 1): FilterResult {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = startParamIndex;

  if (!filters.includeArchived) {
    conditions.push('is_archived = false');
  }

  if (filters.type && VALID_TYPES.includes(filters.type)) {
    conditions.push(`type = $${paramIndex++}`);
    params.push(filters.type);
  }

  if (filters.category && VALID_CATEGORIES.includes(filters.category)) {
    conditions.push(`category = $${paramIndex++}`);
    params.push(filters.category);
  }

  if (filters.priority && VALID_PRIORITIES.includes(filters.priority)) {
    conditions.push(`priority = $${paramIndex++}`);
    params.push(filters.priority);
  }

  return {
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

// ===========================================
// PDF Helpers
// ===========================================

/**
 * Create PDF document with standard settings
 */
export function createPDFDocument(): typeof PDFDocument.prototype {
  return new PDFDocument({ margin: 50 });
}

/**
 * Add standard PDF header
 */
export function addPDFHeader(
  doc: typeof PDFDocument.prototype,
  title: string,
  subtitle: string
): void {
  doc.fontSize(24).fillColor('#1a1a2e').text('Personal AI Brain', { align: 'center' });
  doc.fontSize(14).fillColor('#666').text(title, { align: 'center' });
  doc.fontSize(10).text(subtitle, { align: 'center' });
  doc.moveDown(2);
}

/**
 * Add standard PDF footer
 */
export function addPDFFooter(doc: typeof PDFDocument.prototype, text?: string): void {
  doc.fontSize(8).fillColor('#aaa');
  doc.text(text || 'Exported from Personal AI Brain System', 50, doc.page.height - 50, { align: 'center' });
}

/**
 * Render single idea to PDF
 */
export function renderIdeaToPDF(doc: typeof PDFDocument.prototype, idea: IdeaRow): void {
  // Title with priority indicator
  doc.fontSize(11).fillColor(PRIORITY_COLORS[idea.priority] || '#333');
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
    nextSteps.forEach((step, i) => {
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

// ===========================================
// Markdown Helpers
// ===========================================

/**
 * Render single idea to Markdown
 */
export function renderIdeaToMarkdown(idea: IdeaRow, includeTranscript = false): string {
  let md = `### ${idea.title}\n\n`;
  md += `| Property | Value |\n`;
  md += `|----------|-------|\n`;
  md += `| Type | ${idea.type} |\n`;
  md += `| Category | ${idea.category} |\n`;
  md += `| Priority | ${capitalize(idea.priority)} |\n`;
  md += `| Created | ${formatDate(idea.created_at)} |\n`;

  if (idea.updated_at) {
    md += `| Updated | ${formatDate(idea.updated_at)} |\n`;
  }
  md += `\n`;

  if (idea.summary) {
    md += `**Summary:**\n${idea.summary}\n\n`;
  }

  const nextSteps = parseJSON(idea.next_steps);
  if (nextSteps.length > 0) {
    md += `**Next Steps:**\n`;
    nextSteps.forEach((step, i) => {
      md += `${i + 1}. ${step}\n`;
    });
    md += `\n`;
  }

  const contextNeeded = parseJSON(idea.context_needed);
  if (contextNeeded.length > 0) {
    md += `**Context Needed:**\n`;
    contextNeeded.forEach((ctx) => {
      md += `- ${ctx}\n`;
    });
    md += `\n`;
  }

  const keywords = parseJSON(idea.keywords);
  if (keywords.length > 0) {
    md += `**Tags:** ${keywords.map(k => `\`${k}\``).join(' ')}\n\n`;
  }

  if (includeTranscript && idea.raw_transcript) {
    md += `**Original Transcript:**\n\`\`\`\n${idea.raw_transcript}\n\`\`\`\n\n`;
  }

  return md;
}

/**
 * Generate Markdown header for export
 */
export function generateMarkdownHeader(context: string, count: number): string {
  let md = `# Personal AI Brain - Ideas Export\n\n`;
  md += `**Context:** ${capitalize(context)}\n`;
  md += `**Exported:** ${formatDate(new Date())}\n`;
  md += `**Total Ideas:** ${count}\n\n`;
  md += `---\n\n`;
  return md;
}

/**
 * Calculate priority statistics
 */
export function calculatePriorityStats(ideas: IdeaRow[]): Record<string, number> {
  return {
    total: ideas.length,
    high: ideas.filter(r => r.priority === 'high').length,
    medium: ideas.filter(r => r.priority === 'medium').length,
    low: ideas.filter(r => r.priority === 'low').length,
  };
}
