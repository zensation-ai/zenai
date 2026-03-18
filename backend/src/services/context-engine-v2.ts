/**
 * Phase 63: Advanced Context Engine V2
 *
 * Improvements over V1:
 * - Keyword-scored domain classification (with confidence)
 * - Multi-model routing based on complexity
 * - Minimum Viable Context (MVC) assembly
 * - Context caching with TTL
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { ContextDomain } from './context-engine';

export interface ModelConfig {
  model: string;
  maxTokens: number;
  tier: 'fast' | 'balanced' | 'premium';
}

export interface AssembledContext {
  domain: ContextDomain;
  domainConfidence: number;
  model: ModelConfig;
  parts: ContextPartV2[];
  totalTokens: number;
  fromCache: boolean;
  buildTimeMs: number;
}

export interface ContextPartV2 {
  source: string;
  content: string;
  tokens: number;
  priority: number;
}

export interface ComplexityEstimate {
  score: number; // 0-1
  factors: string[];
}

// Domain keyword weights for classification
const DOMAIN_KEYWORDS: Record<ContextDomain, string[]> = {
  finance: ['konto', 'budget', 'transaktion', 'ausgabe', 'einnahme', 'finanz', 'geld', 'zahlung', 'rechnung', 'bilanz', 'umsatz', 'kosten', 'gewinn', 'verlust', 'steuer'],
  email: ['mail', 'nachricht', 'antwort', 'inbox', 'postfach', 'senden', 'weiterleiten', 'betreff', 'empfänger', 'absender'],
  code: ['code', 'funktion', 'bug', 'implementier', 'debug', 'programmier', 'api', 'endpoint', 'deploy', 'test', 'error', 'refactor'],
  learning: ['lern', 'tutorial', 'versteh', 'kurs', 'wissen', 'erklär', 'übung', 'quiz', 'prüfung', 'studier'],
  general: [],
};

// Complexity indicators
const COMPLEXITY_INDICATORS = {
  high: ['vergleich', 'analysier', 'warum', 'erkläre ausführlich', 'unterschied zwischen', 'zusammenhang', 'strategie', 'architektur'],
  medium: ['wie', 'erstelle', 'implementiere', 'finde', 'zeige mir', 'hilf mir'],
  low: ['was ist', 'definiere', 'liste', 'zeig', 'öffne', 'status'],
};

class ContextEngineV2 {
  /**
   * Classify the domain of a query using keyword scoring
   */
  classifyDomain(query: string): { domain: ContextDomain; confidence: number } {
    const lowerQuery = query.toLowerCase();
    const scores: Record<string, number> = {};

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      if (domain === 'general') continue;
      let score = 0;
      for (const keyword of keywords) {
        if (lowerQuery.includes(keyword)) {
          score += 1;
        }
      }
      scores[domain] = score;
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const maxDomain = sorted[0];

    if (!maxDomain || maxDomain[1] === 0) {
      return { domain: 'general', confidence: 0.5 };
    }

    const totalKeywords = DOMAIN_KEYWORDS[maxDomain[0] as ContextDomain].length;
    const confidence = Math.min(maxDomain[1] / Math.max(totalKeywords * 0.3, 1), 1.0);

    return {
      domain: maxDomain[0] as ContextDomain,
      confidence: Math.max(confidence, 0.4),
    };
  }

  /**
   * Estimate query complexity (0-1)
   */
  estimateComplexity(query: string): ComplexityEstimate {
    const lowerQuery = query.toLowerCase();
    const factors: string[] = [];
    let score = 0.5; // Default medium

    // Check high complexity indicators
    for (const indicator of COMPLEXITY_INDICATORS.high) {
      if (lowerQuery.includes(indicator)) {
        score = Math.min(score + 0.15, 1.0);
        factors.push(`high:${indicator}`);
      }
    }

    // Check low complexity indicators
    for (const indicator of COMPLEXITY_INDICATORS.low) {
      if (lowerQuery.includes(indicator)) {
        score = Math.max(score - 0.15, 0.0);
        factors.push(`low:${indicator}`);
      }
    }

    // Length factor: longer queries tend to be more complex
    if (query.length > 200) {
      score = Math.min(score + 0.1, 1.0);
      factors.push('long_query');
    } else if (query.length < 30) {
      score = Math.max(score - 0.1, 0.0);
      factors.push('short_query');
    }

    // Multiple questions
    const questionMarks = (query.match(/\?/g) || []).length;
    if (questionMarks > 1) {
      score = Math.min(score + 0.1 * (questionMarks - 1), 1.0);
      factors.push(`multi_question:${questionMarks}`);
    }

    return { score, factors };
  }

  /**
   * Select appropriate model based on domain and complexity
   */
  selectModel(_domain: ContextDomain, complexity: number): ModelConfig {
    // Simple queries -> fast model
    if (complexity < 0.3) {
      return { model: 'claude-haiku-4-5-20251001', maxTokens: 2048, tier: 'fast' };
    }
    // Complex reasoning -> premium model
    if (complexity > 0.7) {
      return { model: 'claude-sonnet-4-20250514', maxTokens: 8192, tier: 'premium' };
    }
    // Default balanced
    return { model: 'claude-sonnet-4-20250514', maxTokens: 4096, tier: 'balanced' };
  }

  /**
   * Assemble minimum viable context for a query
   */
  async assembleContext(
    query: string,
    context: AIContext,
  ): Promise<AssembledContext> {
    const startTime = Date.now();
    const domain = this.classifyDomain(query);
    const complexity = this.estimateComplexity(query);
    const model = this.selectModel(domain.domain, complexity.score);

    // Check cache first
    const cacheKey = `ctx:${context}:${domain.domain}:${query.substring(0, 50)}`;
    const cached = await this.getFromCache(context, cacheKey);
    if (cached) {
      return {
        domain: domain.domain,
        domainConfidence: domain.confidence,
        model,
        parts: cached.parts,
        totalTokens: cached.totalTokens,
        fromCache: true,
        buildTimeMs: Date.now() - startTime,
      };
    }

    // Token budget: 60% of model max for context
    const totalBudget = Math.floor(model.maxTokens * 0.6);
    let usedTokens = 0;
    const parts: ContextPartV2[] = [];

    // Load context rules sorted by priority
    try {
      const rules = await queryContext(context, `
        SELECT name, data_sources, token_budget, priority
        FROM context_rules
        WHERE domain = $1 AND is_active = true
        ORDER BY priority DESC
      `, [domain.domain]);

      for (const rule of rules.rows) {
        if (usedTokens >= totalBudget) break;

        const ruleBudget = Math.min(rule.token_budget || 500, totalBudget - usedTokens);
        const dataSources = typeof rule.data_sources === 'string'
          ? JSON.parse(rule.data_sources)
          : rule.data_sources;

        for (const source of (dataSources || [])) {
          if (usedTokens >= totalBudget) break;

          const content = await this.executeSource(source, context, ruleBudget);
          if (content) {
            const tokens = Math.ceil(content.length / 4);
            if (usedTokens + tokens <= totalBudget) {
              parts.push({
                source: rule.name,
                content,
                tokens,
                priority: rule.priority,
              });
              usedTokens += tokens;
            }
          }
        }
      }
    } catch (e) {
      logger.debug('assembleContext: context_rules query failed (table may not exist)', { error: e instanceof Error ? e.message : String(e) });
    }

    // Fallback: if no rules matched, add basic context
    if (parts.length === 0) {
      const basicContext = await this.getBasicContext(context, totalBudget);
      parts.push(...basicContext);
      usedTokens = basicContext.reduce((sum, p) => sum + p.tokens, 0);
    }

    const assembled: AssembledContext = {
      domain: domain.domain,
      domainConfidence: domain.confidence,
      model,
      parts,
      totalTokens: usedTokens,
      fromCache: false,
      buildTimeMs: Date.now() - startTime,
    };

    // Cache the result
    await this.saveToCache(context, cacheKey, domain.domain, parts, usedTokens);

    return assembled;
  }

  /**
   * Execute a data source
   */
  private async executeSource(
    source: { type: string; query?: string; content?: string; limit?: number },
    context: AIContext,
    _budget: number,
  ): Promise<string | null> {
    try {
      switch (source.type) {
        case 'static':
          return source.content || null;
        case 'db_query': {
          if (!source.query) return null;
          const result = await queryContext(context, source.query, []);
          return result.rows.length > 0 ? JSON.stringify(result.rows.slice(0, source.limit || 5)) : null;
        }
        default:
          return null;
      }
    } catch (e) {
      logger.debug('executeDataSource failed', { error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }

  /**
   * Get basic context as fallback
   */
  private async getBasicContext(context: AIContext, budget: number): Promise<ContextPartV2[]> {
    const parts: ContextPartV2[] = [];
    let usedTokens = 0;

    // Recent facts
    try {
      const facts = await queryContext(context, `
        SELECT content, confidence FROM learned_facts
        WHERE confidence > 0.5
        ORDER BY last_confirmed DESC NULLS LAST
        LIMIT 5
      `, []);

      if (facts.rows.length > 0) {
        const content = facts.rows.map((r: Record<string, unknown>) => r.content).join('\n');
        const tokens = Math.ceil(content.length / 4);
        if (usedTokens + tokens <= budget) {
          parts.push({ source: 'learned_facts', content, tokens, priority: 5 });
          usedTokens += tokens;
        }
      }
    } catch (e) {
      logger.debug('fallbackContext: query failed (table may not exist)', { error: e instanceof Error ? e.message : String(e) });
    }

    return parts;
  }

  /**
   * Get cached context
   */
  private async getFromCache(context: AIContext, cacheKey: string): Promise<{ parts: ContextPartV2[]; totalTokens: number } | null> {
    try {
      const result = await queryContext(context, `
        UPDATE context_cache SET hit_count = hit_count + 1, updated_at = NOW()
        WHERE cache_key = $1 AND expires_at > NOW()
        RETURNING content, token_count
      `, [cacheKey]);

      if (result.rows.length > 0) {
        const data = typeof result.rows[0].content === 'string'
          ? JSON.parse(result.rows[0].content)
          : result.rows[0].content;
        return { parts: data.parts || [], totalTokens: result.rows[0].token_count || 0 };
      }
    } catch (e) {
      logger.debug('getCachedContext: cache miss or read error', { error: e instanceof Error ? e.message : String(e) });
    }
    return null;
  }

  /**
   * Save context to cache
   */
  private async saveToCache(context: AIContext, cacheKey: string, domain: string, parts: ContextPartV2[], totalTokens: number): Promise<void> {
    try {
      await queryContext(context, `
        INSERT INTO context_cache (id, cache_key, domain, content, token_count, expires_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW() + INTERVAL '1 hour')
        ON CONFLICT (cache_key) DO UPDATE SET
          content = EXCLUDED.content,
          token_count = EXCLUDED.token_count,
          expires_at = NOW() + INTERVAL '1 hour',
          updated_at = NOW()
      `, [cacheKey, domain, JSON.stringify({ parts }), totalTokens]);
    } catch (e) {
      logger.debug('cacheContext: cache write failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  /**
   * Clean expired cache entries
   */
  async cleanExpiredCache(context: AIContext): Promise<number> {
    try {
      const result = await queryContext(context, `
        DELETE FROM context_cache WHERE expires_at < NOW()
      `, []);
      return result.rowCount || 0;
    } catch (e) {
      logger.debug('cleanExpiredCache failed', { error: e instanceof Error ? e.message : String(e) });
      return 0;
    }
  }
}

// Singleton
let instance: ContextEngineV2 | null = null;

export function getContextEngineV2(): ContextEngineV2 {
  if (!instance) {
    instance = new ContextEngineV2();
  }
  return instance;
}

export function resetContextEngineV2(): void {
  instance = null;
}
