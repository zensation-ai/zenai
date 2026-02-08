/**
 * Compliance & Governance Logger
 *
 * Provides AI decision audit trail, data lineage tracking,
 * and compliance report generation for regulatory requirements.
 *
 * EU AI Act (Aug 2026), Colorado AI Act (Feb 2026):
 * - Transparency documentation required
 * - Decision audit trails
 * - Data lineage tracking
 *
 * @module services/compliance-logger
 */

import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type SourceType = 'memory' | 'rag' | 'web_search' | 'ai_knowledge' | 'user_input' | 'knowledge_graph';

export interface AIDecisionLog {
  id: string;
  timestamp: number;
  /** The user's input/query */
  input: string;
  /** The AI's response (truncated) */
  output: string;
  /** Model used for this decision */
  modelId: string;
  /** Confidence in the response */
  confidence: number;
  /** Data sources that informed the decision */
  sources: DataSource[];
  /** Context (personal/work) */
  context: string;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Tools used during processing */
  toolsUsed: string[];
  /** Whether RAG was used */
  ragUsed: boolean;
  /** Whether web search was used */
  webSearchUsed: boolean;
}

export interface DataSource {
  type: SourceType;
  /** Human-readable description of the source */
  description: string;
  /** IDs of specific items used (idea IDs, doc IDs) */
  itemIds?: string[];
  /** Confidence/relevance of this source */
  relevance?: number;
}

export interface ComplianceReport {
  /** Report generation timestamp */
  generatedAt: number;
  /** Period covered */
  period: { start: number; end: number };
  /** Summary statistics */
  summary: ComplianceSummary;
  /** Detailed decision logs */
  decisions: AIDecisionLog[];
  /** Source attribution breakdown */
  sourceBreakdown: Record<SourceType, number>;
  /** Model usage breakdown */
  modelBreakdown: Record<string, { count: number; avgConfidence: number }>;
}

export interface ComplianceSummary {
  totalDecisions: number;
  averageConfidence: number;
  ragUsageRate: number;
  webSearchUsageRate: number;
  uniqueModelsUsed: number;
  uniqueSourceTypes: number;
  averageProcessingTimeMs: number;
}

// ===========================================
// In-Memory Storage (with size limits)
// ===========================================

const MAX_LOGS = 10000;
const decisionLogs: AIDecisionLog[] = [];
let logIdCounter = 0;

// ===========================================
// Core Logging
// ===========================================

/**
 * Log an AI decision for compliance tracking.
 */
export function logAIDecision(
  params: Omit<AIDecisionLog, 'id' | 'timestamp'>
): string {
  const id = `dec_${Date.now()}_${++logIdCounter}`;
  const log: AIDecisionLog = {
    ...params,
    id,
    timestamp: Date.now(),
    // Truncate output for storage efficiency
    output: params.output.substring(0, 2000),
    input: params.input.substring(0, 1000),
  };

  decisionLogs.push(log);

  // Enforce size limit (FIFO)
  while (decisionLogs.length > MAX_LOGS) {
    decisionLogs.shift();
  }

  logger.debug('AI decision logged', {
    id,
    modelId: params.modelId,
    sources: params.sources.length,
    confidence: params.confidence,
  });

  return id;
}

// ===========================================
// Query & Retrieval
// ===========================================

/**
 * Get decision logs with optional filters.
 */
export function getDecisionLogs(
  options: {
    limit?: number;
    offset?: number;
    startDate?: number;
    endDate?: number;
    context?: string;
    modelId?: string;
    minConfidence?: number;
  } = {}
): { logs: AIDecisionLog[]; total: number } {
  const {
    limit = 50,
    offset = 0,
    startDate,
    endDate,
    context,
    modelId,
    minConfidence,
  } = options;

  let filtered = [...decisionLogs];

  if (startDate) filtered = filtered.filter(l => l.timestamp >= startDate);
  if (endDate) filtered = filtered.filter(l => l.timestamp <= endDate);
  if (context) filtered = filtered.filter(l => l.context === context);
  if (modelId) filtered = filtered.filter(l => l.modelId === modelId);
  if (minConfidence !== undefined) filtered = filtered.filter(l => l.confidence >= minConfidence);

  // Sort by timestamp descending (most recent first)
  filtered.sort((a, b) => b.timestamp - a.timestamp);

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return { logs: paginated, total };
}

/**
 * Get a single decision log by ID.
 */
export function getDecisionById(id: string): AIDecisionLog | undefined {
  return decisionLogs.find(l => l.id === id);
}

// ===========================================
// Compliance Reports
// ===========================================

/**
 * Generate a compliance report for a time period.
 */
export function generateComplianceReport(
  periodDays: number = 30,
  context?: string
): ComplianceReport {
  const endDate = Date.now();
  const startDate = endDate - periodDays * 24 * 60 * 60 * 1000;

  let relevant = decisionLogs.filter(l => l.timestamp >= startDate && l.timestamp <= endDate);
  if (context) {
    relevant = relevant.filter(l => l.context === context);
  }

  // Source breakdown
  const sourceBreakdown: Record<string, number> = {};
  for (const log of relevant) {
    for (const source of log.sources) {
      sourceBreakdown[source.type] = (sourceBreakdown[source.type] || 0) + 1;
    }
  }

  // Model breakdown
  const modelBreakdown: Record<string, { count: number; totalConfidence: number }> = {};
  for (const log of relevant) {
    if (!modelBreakdown[log.modelId]) {
      modelBreakdown[log.modelId] = { count: 0, totalConfidence: 0 };
    }
    modelBreakdown[log.modelId].count++;
    modelBreakdown[log.modelId].totalConfidence += log.confidence;
  }

  const modelBreakdownFormatted: Record<string, { count: number; avgConfidence: number }> = {};
  for (const [modelId, data] of Object.entries(modelBreakdown)) {
    modelBreakdownFormatted[modelId] = {
      count: data.count,
      avgConfidence: data.count > 0 ? data.totalConfidence / data.count : 0,
    };
  }

  // Summary
  const totalDecisions = relevant.length;
  const avgConfidence = totalDecisions > 0
    ? relevant.reduce((sum, l) => sum + l.confidence, 0) / totalDecisions
    : 0;
  const ragCount = relevant.filter(l => l.ragUsed).length;
  const webSearchCount = relevant.filter(l => l.webSearchUsed).length;
  const avgProcessingTime = totalDecisions > 0
    ? relevant.reduce((sum, l) => sum + l.processingTimeMs, 0) / totalDecisions
    : 0;

  const summary: ComplianceSummary = {
    totalDecisions,
    averageConfidence: Math.round(avgConfidence * 100) / 100,
    ragUsageRate: totalDecisions > 0 ? Math.round((ragCount / totalDecisions) * 100) / 100 : 0,
    webSearchUsageRate: totalDecisions > 0 ? Math.round((webSearchCount / totalDecisions) * 100) / 100 : 0,
    uniqueModelsUsed: Object.keys(modelBreakdown).length,
    uniqueSourceTypes: Object.keys(sourceBreakdown).length,
    averageProcessingTimeMs: Math.round(avgProcessingTime),
  };

  const logContext = context === 'personal' || context === 'work' ? context : undefined;
  logger.info('Compliance report generated', {
    periodDays,
    context: logContext,
    totalDecisions,
    avgConfidence: summary.averageConfidence,
  });

  return {
    generatedAt: Date.now(),
    period: { start: startDate, end: endDate },
    summary,
    decisions: relevant.sort((a, b) => b.timestamp - a.timestamp),
    sourceBreakdown: sourceBreakdown as Record<SourceType, number>,
    modelBreakdown: modelBreakdownFormatted,
  };
}

// ===========================================
// Data Lineage
// ===========================================

/**
 * Get data lineage for a specific decision - which data influenced it.
 */
export function getDataLineage(decisionId: string): {
  decision: AIDecisionLog | undefined;
  sources: DataSource[];
  sourceTypes: SourceType[];
} {
  const decision = getDecisionById(decisionId);
  if (!decision) {
    return { decision: undefined, sources: [], sourceTypes: [] };
  }

  const sourceTypes = [...new Set(decision.sources.map(s => s.type))];

  return {
    decision,
    sources: decision.sources,
    sourceTypes,
  };
}

// ===========================================
// Export
// ===========================================

/**
 * Export decision logs as CSV-ready data.
 */
export function exportDecisionLogs(
  periodDays: number = 30,
  context?: string
): string {
  const report = generateComplianceReport(periodDays, context);
  const header = 'ID,Timestamp,Input,Output,Model,Confidence,Sources,RAG,WebSearch,ProcessingMs,Context';

  const rows = report.decisions.map(d => {
    const sources = d.sources.map(s => s.type).join(';');
    const input = d.input.replace(/"/g, '""').substring(0, 200);
    const output = d.output.replace(/"/g, '""').substring(0, 200);
    return `"${d.id}","${new Date(d.timestamp).toISOString()}","${input}","${output}","${d.modelId}",${d.confidence},"${sources}",${d.ragUsed},${d.webSearchUsed},${d.processingTimeMs},"${d.context}"`;
  });

  return [header, ...rows].join('\n');
}

/**
 * Reset all logs (for testing).
 */
export function resetComplianceLogs(): void {
  decisionLogs.length = 0;
  logIdCounter = 0;
}
