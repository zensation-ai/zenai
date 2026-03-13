/**
 * Context Engine Service
 *
 * Replaces static priority weights with rule-based context building.
 * Domain classification → rule matching → data source execution → formatting.
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type ContextDomain = 'finance' | 'email' | 'code' | 'learning' | 'general';

export interface ContextRule {
  id: string;
  context: string;
  name: string;
  description: string | null;
  domain: ContextDomain;
  priority: number;
  conditions: ContextCondition[];
  dataSources: DataSource[];
  contextTemplate: string | null;
  tokenBudget: number;
  isActive: boolean;
  version: number;
}

export interface ContextCondition {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'regex';
  value: string | number;
}

export interface DataSource {
  type: 'db_query' | 'memory_layer' | 'rag' | 'static';
  table?: string;
  query?: string;
  layer?: string;
  strategy?: string;
  content?: string;
  limit?: number;
}

export interface ContextPart {
  source: string;
  content: string;
  tokens: number;
  relevance: number;
}

export interface ContextResult {
  domain: ContextDomain;
  parts: ContextPart[];
  totalTokens: number;
  rulesApplied: string[];
  buildTimeMs: number;
}

// Domain classification patterns
const DOMAIN_PATTERNS: Record<ContextDomain, RegExp[]> = {
  finance: [
    /konto|budget|transaktion|ausgab|einnahm|finan|geld|zahlung|rechnung|bilanz|umsatz|kosten/i,
  ],
  email: [
    /mail|nachricht|antwort|inbox|postfach|schreib.*an|e-?mail|senden|weiterleiten/i,
  ],
  code: [
    /code|funktion|bug|implementier|debug|programmier|api|endpoint|deploy|test/i,
  ],
  learning: [
    /lern|tutorial|versteh|kurs|wissen|erklär|beibringe|übung|quiz|prüfung/i,
  ],
  general: [],  // Fallback
};

// Allowed tables for db_query data sources (whitelist)
const ALLOWED_TABLES = [
  'ideas', 'tasks', 'projects', 'emails', 'contacts', 'transactions',
  'budgets', 'financial_goals', 'financial_accounts', 'calendar_events',
  'learned_facts', 'idea_relations', 'idea_topics', 'documents',
];

// ===========================================
// Domain Classification
// ===========================================

/**
 * Classify the domain of a query based on keyword matching.
 */
export function classifyDomain(query: string): ContextDomain {
  const lowerQuery = query.toLowerCase();

  for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
    if (domain === 'general') continue;
    for (const pattern of patterns) {
      if (pattern.test(lowerQuery)) {
        return domain as ContextDomain;
      }
    }
  }

  return 'general';
}

// ===========================================
// Context Building
// ===========================================

/**
 * Build programmatic context for a query.
 * 1. Classify domain
 * 2. Get active rules sorted by priority
 * 3. Execute data sources
 * 4. Format within token budget
 */
export async function buildContext(
  query: string,
  context: AIContext,
  options?: { maxTokens?: number }
): Promise<ContextResult> {
  const startTime = Date.now();
  const maxTokens = options?.maxTokens || 4000;
  const domain = classifyDomain(query);

  const parts: ContextPart[] = [];
  const rulesApplied: string[] = [];
  let totalTokens = 0;

  try {
    // Load active rules for this domain
    const rules = await getActiveRules(context, domain);

    for (const rule of rules) {
      if (totalTokens >= maxTokens) break;

      // Evaluate conditions
      if (!evaluateConditions(rule.conditions, query)) continue;

      // Execute data sources
      const remainingBudget = Math.min(rule.tokenBudget, maxTokens - totalTokens);

      for (const source of rule.dataSources) {
        if (totalTokens >= maxTokens) break;

        try {
          const part = await executeDataSource(source, query, context, remainingBudget);
          if (part && part.content.trim()) {
            parts.push(part);
            totalTokens += part.tokens;
          }
        } catch (error) {
          logger.debug('Data source execution failed', {
            rule: rule.name,
            source: source.type,
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      }

      rulesApplied.push(rule.name);

      // Record performance
      recordPerformance(context, rule.id, totalTokens, Date.now() - startTime).catch(err => { logger.warn('Failed to record context rule performance', { error: err instanceof Error ? err.message : String(err), ruleId: rule.id }); });
    }
  } catch (error) {
    logger.error('Context building failed', error instanceof Error ? error : undefined);
  }

  return {
    domain,
    parts,
    totalTokens,
    rulesApplied,
    buildTimeMs: Date.now() - startTime,
  };
}

// ===========================================
// Rule Management
// ===========================================

async function getActiveRules(context: AIContext, domain: ContextDomain): Promise<ContextRule[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT id, context, name, description, domain, priority, conditions,
              data_sources, context_template, token_budget, is_active, version
       FROM context_rules
       WHERE context = $1 AND is_active = true
         AND (domain = $2 OR domain = 'general')
       ORDER BY priority DESC`,
      [context, domain]
    );

    return result.rows.map(parseRule);
  } catch {
    return [];
  }
}

function parseRule(r: Record<string, unknown>): ContextRule {
  return {
    id: r.id as string,
    context: r.context as string,
    name: r.name as string,
    description: r.description as string | null,
    domain: r.domain as ContextDomain,
    priority: parseInt(r.priority as string, 10) || 50,
    conditions: parseJSON(r.conditions, []),
    dataSources: parseJSON(r.data_sources, []),
    contextTemplate: r.context_template as string | null,
    tokenBudget: parseInt(r.token_budget as string, 10) || 2000,
    isActive: r.is_active !== false,
    version: parseInt(r.version as string, 10) || 1,
  };
}

// ===========================================
// Condition Evaluation
// ===========================================

function evaluateConditions(conditions: ContextCondition[], query: string): boolean {
  if (!conditions || conditions.length === 0) return true;

  for (const condition of conditions) {
    const fieldValue = condition.field === 'query' ? query : '';
    const condValue = String(condition.value);

    switch (condition.operator) {
      case 'contains':
        if (!fieldValue.toLowerCase().includes(condValue.toLowerCase())) return false;
        break;
      case 'equals':
        if (fieldValue.toLowerCase() !== condValue.toLowerCase()) return false;
        break;
      case 'regex':
        try {
          if (/(\+|\*|\{)\s*(\+|\*|\{)/.test(condValue) || condValue.length > 200) return false;
          if (!new RegExp(condValue, 'i').test(fieldValue)) return false;
        } catch { return false; }
        break;
      case 'gt':
        if (!(parseFloat(fieldValue) > parseFloat(condValue))) return false;
        break;
      case 'lt':
        if (!(parseFloat(fieldValue) < parseFloat(condValue))) return false;
        break;
      default:
        break;
    }
  }

  return true;
}

// ===========================================
// Data Source Execution
// ===========================================

async function executeDataSource(
  source: DataSource,
  query: string,
  context: AIContext,
  tokenBudget: number
): Promise<ContextPart | null> {
  switch (source.type) {
    case 'db_query':
      return executeDBQuery(source, context, tokenBudget);
    case 'memory_layer':
      return executeMemoryLayer(source, context, tokenBudget);
    case 'static':
      return executeStatic(source, tokenBudget);
    case 'rag':
      // RAG data source delegated to enhanced-rag.ts in production
      return null;
    default:
      return null;
  }
}

async function executeDBQuery(
  source: DataSource,
  context: AIContext,
  tokenBudget: number
): Promise<ContextPart | null> {
  const table = source.table;
  if (!table || !ALLOWED_TABLES.includes(table)) return null;

  const limit = Math.min(source.limit || 5, 20);

  try {
    const result = await queryContext(
      context,
      `SELECT * FROM ${table} WHERE context = $1 ORDER BY created_at DESC LIMIT $2`,
      [context, limit]
    );

    if (result.rows.length === 0) return null;

    const content = result.rows
      .map((r: Record<string, unknown>) => {
        const keys = Object.keys(r).filter(k => !['embedding', 'id'].includes(k));
        return keys.map(k => `${k}: ${String(r[k] || '').substring(0, 200)}`).join(', ');
      })
      .join('\n');

    const truncated = content.substring(0, tokenBudget * 4); // ~4 chars per token estimate

    return {
      source: `db:${table}`,
      content: truncated,
      tokens: Math.ceil(truncated.length / 4),
      relevance: 0.7,
    };
  } catch {
    return null;
  }
}

async function executeMemoryLayer(
  source: DataSource,
  context: AIContext,
  tokenBudget: number
): Promise<ContextPart | null> {
  const layer = source.layer || 'long_term';
  const limit = source.limit || 5;

  try {
    let tableName: string;
    switch (layer) {
      case 'long_term': tableName = 'learned_facts'; break;
      case 'episodic': tableName = 'episodic_memories'; break;
      case 'working': tableName = 'working_memory'; break;
      default: return null;
    }

    const result = await queryContext(
      context,
      `SELECT * FROM ${tableName} ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );

    if (result.rows.length === 0) return null;

    const content = result.rows
      .map((r: Record<string, unknown>) => r.content || r.fact_type || r.title || JSON.stringify(r))
      .join('\n');

    const truncated = String(content).substring(0, tokenBudget * 4);

    return {
      source: `memory:${layer}`,
      content: truncated,
      tokens: Math.ceil(truncated.length / 4),
      relevance: 0.8,
    };
  } catch {
    return null;
  }
}

function executeStatic(source: DataSource, tokenBudget: number): ContextPart | null {
  if (!source.content) return null;

  const truncated = source.content.substring(0, tokenBudget * 4);
  return {
    source: 'static',
    content: truncated,
    tokens: Math.ceil(truncated.length / 4),
    relevance: 0.5,
  };
}

// ===========================================
// Performance Tracking
// ===========================================

async function recordPerformance(
  context: AIContext,
  ruleId: string,
  tokensUsed: number,
  retrievalTimeMs: number
): Promise<void> {
  try {
    await queryContext(
      context,
      `INSERT INTO context_rule_performance (rule_id, tokens_used, retrieval_time_ms)
       VALUES ($1, $2, $3)`,
      [ruleId, tokensUsed, retrievalTimeMs]
    );
  } catch {
    // Non-critical, fail silently
  }
}

// ===========================================
// CRUD Operations
// ===========================================

export async function createContextRule(
  context: AIContext,
  rule: Omit<ContextRule, 'id' | 'version'>
): Promise<ContextRule | null> {
  try {
    const result = await queryContext(
      context,
      `INSERT INTO context_rules (context, name, description, domain, priority, conditions, data_sources, context_template, token_budget, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        context, rule.name, rule.description, rule.domain, rule.priority,
        JSON.stringify(rule.conditions), JSON.stringify(rule.dataSources),
        rule.contextTemplate, rule.tokenBudget, rule.isActive,
      ]
    );
    if (result.rows.length === 0) return null;
    return parseRule(result.rows[0]);
  } catch (error) {
    logger.error('Failed to create context rule', error instanceof Error ? error : undefined);
    return null;
  }
}

export async function updateContextRule(
  context: AIContext,
  ruleId: string,
  updates: Partial<ContextRule>
): Promise<ContextRule | null> {
  try {
    const setClauses: string[] = [];
    const params: (string | number | boolean | null)[] = [ruleId, context];
    let paramIndex = 3;

    if (updates.name !== undefined) { setClauses.push(`name = $${paramIndex++}`); params.push(updates.name); }
    if (updates.description !== undefined) { setClauses.push(`description = $${paramIndex++}`); params.push(updates.description); }
    if (updates.domain !== undefined) { setClauses.push(`domain = $${paramIndex++}`); params.push(updates.domain); }
    if (updates.priority !== undefined) { setClauses.push(`priority = $${paramIndex++}`); params.push(updates.priority); }
    if (updates.conditions !== undefined) { setClauses.push(`conditions = $${paramIndex++}`); params.push(JSON.stringify(updates.conditions)); }
    if (updates.dataSources !== undefined) { setClauses.push(`data_sources = $${paramIndex++}`); params.push(JSON.stringify(updates.dataSources)); }
    if (updates.contextTemplate !== undefined) { setClauses.push(`context_template = $${paramIndex++}`); params.push(updates.contextTemplate); }
    if (updates.tokenBudget !== undefined) { setClauses.push(`token_budget = $${paramIndex++}`); params.push(updates.tokenBudget); }
    if (updates.isActive !== undefined) { setClauses.push(`is_active = $${paramIndex++}`); params.push(updates.isActive); }

    if (setClauses.length === 0) return null;

    setClauses.push('updated_at = NOW()', 'version = version + 1');

    const result = await queryContext(
      context,
      `UPDATE context_rules SET ${setClauses.join(', ')} WHERE id = $1 AND context = $2 RETURNING *`,
      params
    );
    if (result.rows.length === 0) return null;
    return parseRule(result.rows[0]);
  } catch (error) {
    logger.error('Failed to update context rule', error instanceof Error ? error : undefined);
    return null;
  }
}

export async function deleteContextRule(context: AIContext, ruleId: string): Promise<boolean> {
  try {
    const result = await queryContext(
      context,
      `DELETE FROM context_rules WHERE id = $1 AND context = $2`,
      [ruleId, context]
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function listContextRules(
  context: AIContext,
  domain?: ContextDomain
): Promise<ContextRule[]> {
  try {
    const sql = domain
      ? `SELECT * FROM context_rules WHERE context = $1 AND domain = $2 ORDER BY priority DESC`
      : `SELECT * FROM context_rules WHERE context = $1 ORDER BY priority DESC`;
    const params = domain ? [context, domain] : [context];

    const result = await queryContext(context, sql, params);
    return result.rows.map(parseRule);
  } catch {
    return [];
  }
}

export async function getRulePerformance(
  context: AIContext,
  ruleId?: string
): Promise<Array<{
  ruleId: string;
  avgTokens: number;
  avgRetrievalTime: number;
  totalExecutions: number;
  avgSatisfaction: number | null;
}>> {
  try {
    const sql = ruleId
      ? `SELECT rule_id, AVG(tokens_used) as avg_tokens, AVG(retrieval_time_ms) as avg_time,
                COUNT(*) as total, AVG(user_satisfaction) as avg_sat
         FROM context_rule_performance WHERE rule_id = $1
         GROUP BY rule_id`
      : `SELECT rule_id, AVG(tokens_used) as avg_tokens, AVG(retrieval_time_ms) as avg_time,
                COUNT(*) as total, AVG(user_satisfaction) as avg_sat
         FROM context_rule_performance
         GROUP BY rule_id
         ORDER BY total DESC`;

    const result = await queryContext(context, sql, ruleId ? [ruleId] : []);

    return result.rows.map((r: Record<string, unknown>) => ({
      ruleId: r.rule_id as string,
      avgTokens: Math.round(parseFloat(r.avg_tokens as string) || 0),
      avgRetrievalTime: Math.round(parseFloat(r.avg_time as string) || 0),
      totalExecutions: parseInt(r.total as string, 10) || 0,
      avgSatisfaction: r.avg_sat ? parseFloat(r.avg_sat as string) : null,
    }));
  } catch {
    return [];
  }
}

// ===========================================
// Helpers
// ===========================================

function parseJSON<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}
