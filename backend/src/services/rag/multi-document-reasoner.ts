/**
 * Multi-Document Reasoning Service
 *
 * Synthesizes information across multiple retrieved documents using Claude.
 * Identifies agreements, contradictions, and produces source-attributed responses.
 *
 * @module services/rag/multi-document-reasoner
 */

import { logger } from '../../utils/logger';
import { AIContext } from '../../utils/database-context';
import { queryClaudeJSON, generateClaudeResponse } from '../claude';
import { EnhancedResult } from '../enhanced-rag';

// ===========================================
// Types & Interfaces
// ===========================================

export interface SourceAttribution {
  id: string;
  title: string;
  type: 'idea' | 'document' | 'chat' | 'web';
  snippet: string;
  relevanceScore: number;
}

export interface MultiDocumentResult {
  /** Synthesized answer with inline source references [1], [2], etc. */
  synthesis: string;
  /** Source attributions in citation order */
  sources: SourceAttribution[];
  /** Points where sources agree */
  agreements: string[];
  /** Points where sources contradict each other */
  contradictions: string[];
  /** Confidence based on source agreement and coverage */
  confidence: number;
}

// ===========================================
// Constants
// ===========================================

const SYNTHESIS_SYSTEM_PROMPT = `You are an expert research synthesizer. Your task is to synthesize information from multiple sources into a coherent, well-structured answer.

RULES:
1. Use inline source references like [1], [2], etc. to attribute claims to their sources.
2. When sources agree on a point, note this strengthens the claim.
3. When sources contradict, present both perspectives with their source numbers.
4. Be factual and precise — do not add information not present in the sources.
5. Structure your response clearly with paragraphs.
6. If sources are insufficient to fully answer the query, state what is missing.`;

const ANALYSIS_SYSTEM_PROMPT = `You are an analytical assistant. Analyze the relationship between multiple sources and return your analysis as JSON.

Return a JSON object with exactly this structure:
{
  "agreements": ["point 1 where sources agree", "point 2..."],
  "contradictions": ["contradiction 1 between sources", "contradiction 2..."],
  "confidence": 0.85
}

Rules for confidence scoring:
- 0.9-1.0: Sources strongly agree, comprehensive coverage
- 0.7-0.89: Sources mostly agree, good coverage
- 0.5-0.69: Mixed agreement, partial coverage
- 0.3-0.49: Sources contradict or minimal coverage
- 0.0-0.29: Sources mostly contradict or very sparse`;

// ===========================================
// Helper Functions
// ===========================================

/**
 * Infer source type from an EnhancedResult.
 * Falls back to 'document' if type cannot be determined.
 */
function inferSourceType(result: EnhancedResult): SourceAttribution['type'] {
  const title = (result.title || '').toLowerCase();
  const summary = (result.summary || '').toLowerCase();

  if (title.includes('chat') || summary.includes('conversation')) return 'chat';
  if (title.includes('http') || summary.includes('url') || summary.includes('website')) return 'web';
  if (result.sources?.includes('agentic')) return 'idea';

  return 'document';
}

/**
 * Build a formatted source block for the Claude prompt.
 */
function formatSourcesForPrompt(documents: EnhancedResult[]): string {
  return documents
    .map((doc, i) => {
      const content = doc.content || doc.summary || '';
      const snippet = content.substring(0, 2000);
      return `[Source ${i + 1}] "${doc.title}"\n${snippet}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Extract a short snippet from document content for attribution.
 */
function extractSnippet(doc: EnhancedResult, maxLength: number = 200): string {
  const text = doc.content || doc.summary || '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).replace(/\s\S*$/, '') + '...';
}

// ===========================================
// Multi-Document Reasoner
// ===========================================

/**
 * Synthesize information across multiple documents to answer a query.
 *
 * Uses Claude to:
 * 1. Generate a synthesis with inline source references
 * 2. Identify agreements and contradictions between sources
 * 3. Calculate confidence based on source agreement
 *
 * @param query - The user's question
 * @param documents - Retrieved documents from RAG pipeline
 * @param _context - The AI context (for future DB-backed caching)
 * @returns Multi-document synthesis result
 */
export async function synthesize(
  query: string,
  documents: EnhancedResult[],
  _context: AIContext
): Promise<MultiDocumentResult> {
  const startTime = Date.now();

  // Edge case: no documents
  if (!documents || documents.length === 0) {
    return {
      synthesis: 'No relevant sources were found to answer this query.',
      sources: [],
      agreements: [],
      contradictions: [],
      confidence: 0,
    };
  }

  logger.info('Multi-document synthesis starting', {
    query: query.substring(0, 50),
    documentCount: documents.length,
  });

  // Edge case: single document — no cross-document analysis needed
  if (documents.length === 1) {
    const doc = documents[0];
    const content = doc.content || doc.summary || '';

    return {
      synthesis: `Based on "${doc.title}" [1]: ${content}`,
      sources: [{
        id: doc.id,
        title: doc.title,
        type: inferSourceType(doc),
        snippet: extractSnippet(doc),
        relevanceScore: doc.score,
      }],
      agreements: [],
      contradictions: [],
      confidence: Math.min(doc.score * 1.1, 1.0),
    };
  }

  // Build source attributions
  const sources: SourceAttribution[] = documents.map(doc => ({
    id: doc.id,
    title: doc.title,
    type: inferSourceType(doc),
    snippet: extractSnippet(doc),
    relevanceScore: doc.score,
  }));

  const formattedSources = formatSourcesForPrompt(documents);

  // Run synthesis and analysis in parallel
  const [synthesis, analysis] = await Promise.all([
    generateSynthesis(query, formattedSources, documents.length),
    analyzeSourceRelationships(query, formattedSources),
  ]);

  const durationMs = Date.now() - startTime;

  logger.info('Multi-document synthesis complete', {
    documentCount: documents.length,
    agreementCount: analysis.agreements.length,
    contradictionCount: analysis.contradictions.length,
    confidence: analysis.confidence,
    durationMs,
  });

  return {
    synthesis,
    sources,
    agreements: analysis.agreements,
    contradictions: analysis.contradictions,
    confidence: analysis.confidence,
  };
}

/**
 * Generate a synthesis of multiple sources using Claude.
 */
async function generateSynthesis(
  query: string,
  formattedSources: string,
  sourceCount: number
): Promise<string> {
  const userPrompt = `Question: ${query}

I have ${sourceCount} sources to synthesize. Please provide a comprehensive answer using inline references [1], [2], etc.

${formattedSources}

Synthesize these sources into a clear, well-structured answer to the question. Use [1], [2], etc. to cite specific sources.`;

  try {
    return await generateClaudeResponse(
      SYNTHESIS_SYSTEM_PROMPT,
      userPrompt,
      { maxTokens: 2000 }
    );
  } catch (error) {
    logger.error('Synthesis generation failed', error instanceof Error ? error : undefined);
    return 'Unable to synthesize sources at this time. Please try again.';
  }
}

/**
 * Analyze relationships between sources (agreements, contradictions).
 */
async function analyzeSourceRelationships(
  query: string,
  formattedSources: string
): Promise<{ agreements: string[]; contradictions: string[]; confidence: number }> {
  const userPrompt = `Query: ${query}

Sources:
${formattedSources}

Analyze the relationships between these sources. Identify:
1. Points where sources agree (shared facts, conclusions, or perspectives)
2. Points where sources contradict each other
3. Overall confidence in the combined answer`;

  try {
    const result = await queryClaudeJSON<{
      agreements: string[];
      contradictions: string[];
      confidence: number;
    }>(ANALYSIS_SYSTEM_PROMPT, userPrompt);

    return {
      agreements: Array.isArray(result.agreements) ? result.agreements : [],
      contradictions: Array.isArray(result.contradictions) ? result.contradictions : [],
      confidence: typeof result.confidence === 'number'
        ? Math.max(0, Math.min(1, result.confidence))
        : calculateFallbackConfidence([]),
    };
  } catch (error) {
    logger.warn('Source relationship analysis failed, using fallback', { error });
    return {
      agreements: [],
      contradictions: [],
      confidence: calculateFallbackConfidence([]),
    };
  }
}

/**
 * Calculate fallback confidence when Claude analysis fails.
 * Uses score distribution of the source documents.
 */
function calculateFallbackConfidence(documents: EnhancedResult[]): number {
  if (!documents || documents.length === 0) return 0;

  const avgScore = documents.reduce((sum, d) => sum + d.score, 0) / documents.length;
  const hasMultipleSources = documents.length >= 2;

  let confidence = avgScore;
  if (hasMultipleSources) confidence *= 1.1;
  if (documents.length < 3) confidence *= 0.9;

  return Math.max(0, Math.min(1, confidence));
}
