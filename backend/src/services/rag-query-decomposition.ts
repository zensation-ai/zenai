/**
 * Phase 47: RAG Query Decomposition
 *
 * Decomposes complex queries into sub-queries for multi-hop reasoning.
 * Handles comparison queries, multi-part questions, and reference resolution.
 */

import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface DecomposedQuery {
  original: string;
  subQueries: SubQuery[];
  isComplex: boolean;
  decompositionType: 'comparison' | 'multi_part' | 'causal' | 'temporal' | 'simple';
}

export interface SubQuery {
  query: string;
  purpose: string;
  priority: number; // 1 = highest
  dependsOn?: number; // index of prerequisite subquery
}

// ===========================================
// Query Decomposition
// ===========================================

/**
 * Decompose a complex query into sub-queries for multi-hop retrieval
 */
export function decomposeQuery(query: string): DecomposedQuery {
  const queryLower = query.toLowerCase();

  // Check for comparison queries
  if (isComparisonQuery(queryLower)) {
    return decomposeComparison(query);
  }

  // Check for multi-part questions
  if (isMultiPartQuery(queryLower)) {
    return decomposeMultiPart(query);
  }

  // Check for causal queries
  if (isCausalQuery(queryLower)) {
    return decomposeCausal(query);
  }

  // Check for temporal queries
  if (isTemporalQuery(queryLower)) {
    return decomposeTemporal(query);
  }

  // Simple query - no decomposition needed
  return {
    original: query,
    subQueries: [{ query, purpose: 'direct_search', priority: 1 }],
    isComplex: false,
    decompositionType: 'simple',
  };
}

// ===========================================
// Detection Functions
// ===========================================

function isComparisonQuery(query: string): boolean {
  const patterns = [
    /vergleich|unterschied|anders|ähnlich|gleich/,
    /vs\.?|versus|gegenüber/,
    /besser|schlechter|mehr|weniger.*als/,
    /compare|differ|similar|between.*and/,
    /vor.*nachteil|pro.*contra/,
  ];
  return patterns.some(p => p.test(query));
}

function isMultiPartQuery(query: string): boolean {
  const patterns = [
    /\bund\b.*\?/,
    /erstens.*zweitens|zum einen.*zum anderen/,
    /außerdem|darüber hinaus|zusätzlich/,
    /\d+\.\s.*\d+\./,
    /was.*wie.*warum/,
  ];
  return patterns.some(p => p.test(query));
}

function isCausalQuery(query: string): boolean {
  const patterns = [
    /warum|weshalb|wieso|woher kommt/,
    /ursache|grund|auslöser/,
    /weil|deshalb|daher|folglich/,
    /führt.*zu|verursacht|bewirkt/,
    /why|because|cause|result in/,
  ];
  return patterns.some(p => p.test(query));
}

function isTemporalQuery(query: string): boolean {
  const patterns = [
    /wie hat sich.*entwickelt|entwicklung von/,
    /vorher.*nachher|früher.*jetzt/,
    /seit wann|bis wann|zeitverlauf/,
    /history|evolution|over time|timeline/,
    /trend|veränderung|wandel/,
  ];
  return patterns.some(p => p.test(query));
}

// ===========================================
// Decomposition Functions
// ===========================================

function decomposeComparison(query: string): DecomposedQuery {
  // Extract subjects being compared
  const subQueries: SubQuery[] = [];

  // Try to extract "A vs B" pattern
  const vsMatch = query.match(/(.+?)(?:\s+(?:vs\.?|versus|oder|gegenüber|compared?\s+(?:to|with))\s+)(.+?)(?:\?|$)/i);
  if (vsMatch) {
    subQueries.push(
      { query: vsMatch[1].trim(), purpose: 'retrieve_subject_a', priority: 1 },
      { query: vsMatch[2].trim(), purpose: 'retrieve_subject_b', priority: 1 },
      { query, purpose: 'synthesize_comparison', priority: 2, dependsOn: 1 },
    );
  } else {
    // Generic comparison - search for both aspects
    subQueries.push(
      { query, purpose: 'find_comparable_items', priority: 1 },
      { query: `Unterschiede ${query}`, purpose: 'find_differences', priority: 2 },
    );
  }

  logger.debug('Query decomposed as comparison', { subQueryCount: subQueries.length });

  return {
    original: query,
    subQueries,
    isComplex: true,
    decompositionType: 'comparison',
  };
}

function decomposeMultiPart(query: string): DecomposedQuery {
  const subQueries: SubQuery[] = [];

  // Split on common conjunctions
  const parts = query.split(/\bund\b|\baußerdem\b|\bzusätzlich\b|\bsowie\b/i)
    .map(p => p.trim())
    .filter(p => p.length > 10);

  if (parts.length > 1) {
    parts.forEach((part, i) => {
      subQueries.push({
        query: part.replace(/^\s*,\s*/, '').replace(/\?\s*$/, ''),
        purpose: `part_${i + 1}`,
        priority: i + 1,
      });
    });
  } else {
    // Could not split - try as-is
    subQueries.push({ query, purpose: 'direct_search', priority: 1 });
  }

  return {
    original: query,
    subQueries,
    isComplex: subQueries.length > 1,
    decompositionType: 'multi_part',
  };
}

function decomposeCausal(query: string): DecomposedQuery {
  return {
    original: query,
    subQueries: [
      { query, purpose: 'find_effect_or_phenomenon', priority: 1 },
      { query: query.replace(/warum|weshalb|wieso/i, '').trim(), purpose: 'find_cause', priority: 1 },
      { query: `Zusammenhang ${query}`, purpose: 'find_causal_chain', priority: 2, dependsOn: 0 },
    ],
    isComplex: true,
    decompositionType: 'causal',
  };
}

function decomposeTemporal(query: string): DecomposedQuery {
  return {
    original: query,
    subQueries: [
      { query, purpose: 'find_current_state', priority: 1 },
      { query: `Anfang Beginn ${query}`, purpose: 'find_origin', priority: 2 },
      { query: `Entwicklung Verlauf ${query}`, purpose: 'find_evolution', priority: 2 },
    ],
    isComplex: true,
    decompositionType: 'temporal',
  };
}
