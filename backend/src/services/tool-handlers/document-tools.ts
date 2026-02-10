/**
 * Document Tool Handlers
 *
 * Implements document-related Claude Tool Use handlers:
 * - Document search (Document Vault)
 * - Document analysis
 * - Cross-idea knowledge synthesis
 *
 * @module services/tool-handlers/document-tools
 */

import { logger } from '../../utils/logger';
import { ToolExecutionContext } from '../claude/tool-use';
import { documentAnalysis, type AnalysisTemplate } from '../document-analysis';
import { documentService } from '../document-service';
import { synthesizeKnowledge } from '../synthesis-engine';

/**
 * Search documents handler
 * Phase 32: Document Vault
 */
export async function handleSearchDocuments(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const context = execContext.aiContext;

  try {
    const query = input.query as string;
    const limit = (input.limit as number) || 5;

    if (!query || query.trim().length === 0) {
      return 'Bitte gib eine Suchanfrage an.';
    }

    logger.info('Tool search_documents called', { query, limit, context });

    // Search documents
    const results = await documentService.searchDocuments(query, context, {
      limit,
      includeChunks: true,
    });

    if (results.length === 0) {
      return `Keine Dokumente gefunden für: "${query}"\n\nTipp: Lade Dokumente in den Document Vault hoch, um sie durchsuchbar zu machen.`;
    }

    // Format results
    const parts: string[] = [
      `**${results.length} relevante Dokumente gefunden für "${query}":**\n`,
    ];

    for (const doc of results) {
      const similarity = Math.round(doc.similarity * 100);
      parts.push(`### ${doc.title} (${similarity}% Relevanz)`);

      if (doc.summary) {
        parts.push(doc.summary);
      }

      if (doc.matchedChunk) {
        const pageInfo = doc.pageNumber ? ` (Seite ${doc.pageNumber})` : '';
        parts.push(`\n**Gefundene Textstelle${pageInfo}:**`);
        parts.push(`> ${doc.matchedChunk.substring(0, 500)}${doc.matchedChunk.length > 500 ? '...' : ''}`);
      }

      parts.push(`\n*Dateityp: ${doc.mimeType} | Ordner: ${doc.folderPath}*\n`);
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool search_documents failed', error instanceof Error ? error : undefined);
    return `Fehler bei der Dokumentensuche: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}

/**
 * Analyze document handler - triggers document analysis from chat
 * Note: This tool works with documents that have been uploaded in the current session.
 * The actual document buffer must be available in the execution context.
 */
export async function handleAnalyzeDocument(
  input: Record<string, unknown>,
  _execContext: ToolExecutionContext
): Promise<string> {
  const template = (input.template as string) || 'general';
  const customPrompt = input.custom_prompt as string | undefined;
  const language = (input.language as string) === 'en' ? 'en' : 'de';

  const validTemplates: AnalysisTemplate[] = ['general', 'financial', 'contract', 'data', 'summary'];
  if (!validTemplates.includes(template as AnalysisTemplate)) {
    return `Fehler: Ungültiges Template "${template}". Verfügbar: ${validTemplates.join(', ')}`;
  }

  if (!documentAnalysis.isAvailable()) {
    return 'Dokument-Analyse ist derzeit nicht verfügbar (Claude API nicht konfiguriert).';
  }

  logger.debug('Tool: analyze_document', { template, language, hasCustomPrompt: !!customPrompt });

  // This tool provides guidance since the actual document upload happens via the API
  const parts: string[] = [
    '📄 **Dokument-Analyse bereit**\n',
    `Gewähltes Template: **${template}**`,
    language === 'en' ? 'Sprache: English' : 'Sprache: Deutsch',
  ];

  if (customPrompt) {
    parts.push(`Eigene Anweisung: "${customPrompt.substring(0, 100)}${customPrompt.length > 100 ? '...' : ''}"`);
  }

  parts.push('\nUm ein Dokument zu analysieren, lade es bitte über die Dokument-Analyse Oberfläche hoch.');
  parts.push(`API-Endpoint: POST /api/documents/analyze mit template="${template}"`);

  if (customPrompt) {
    parts.push(`Parameter customPrompt: "${customPrompt}"`);
  }

  return parts.join('\n');
}

/**
 * Synthesize knowledge across ideas
 * Phase 32B: Cross-Idea Synthesis
 */
export async function handleSynthesizeKnowledge(
  input: Record<string, unknown>,
  execContext: ToolExecutionContext
): Promise<string> {
  const context = execContext.aiContext;

  try {
    const query = input.query as string;
    const language = (input.language as 'de' | 'en') || 'de';

    if (!query || query.trim().length === 0) {
      return 'Bitte gib ein Thema für die Synthese an.';
    }

    logger.info('Tool synthesize_knowledge called', { query, language, context });

    const result = await synthesizeKnowledge(query, context, {
      language,
      maxQueryVariants: 4,
      maxTotalIdeas: 25,
      enableGraphExpansion: true,
    });

    const parts: string[] = [];

    // Main synthesis
    parts.push(result.synthesis);

    // Source attribution
    if (result.sources.length > 0) {
      parts.push('\n---');
      parts.push(`*Synthese basiert auf ${result.sources.length} Ideen (${result.queryVariants.length} Suchvarianten, ${Math.round(result.timing.total / 1000)}s)*`);
    }

    return parts.join('\n');
  } catch (error) {
    logger.error('Tool synthesize_knowledge failed', error instanceof Error ? error : undefined);
    return `Fehler bei der Wissenssynthese: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  }
}
