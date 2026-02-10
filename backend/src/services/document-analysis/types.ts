/**
 * Document Analysis Types & Interfaces
 */

import Anthropic from '@anthropic-ai/sdk';

/** Supported document MIME types */
export type DocumentMediaType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.ms-excel'
  | 'text/csv';

/** Analysis template types */
export type AnalysisTemplate =
  | 'general'
  | 'financial'
  | 'contract'
  | 'data'
  | 'summary';

/** Custom analysis template stored in database */
export interface CustomAnalysisTemplate {
  id: string;
  name: string;
  system_prompt: string;
  instruction: string;
  icon: string;
  context: string;
  created_at: string;
  updated_at: string;
}

/** Document analysis request options */
export interface DocumentAnalysisOptions {
  /** Analysis template to use */
  template?: AnalysisTemplate;
  /** Custom analysis prompt (overrides template) */
  customPrompt?: string;
  /** Language for response */
  language?: 'de' | 'en';
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Additional context about the document */
  context?: string;
}

/** Structured section in analysis result */
export interface AnalysisSection {
  title: string;
  content: string;
  type: 'text' | 'table' | 'list' | 'kpi';
}

/** Document analysis result */
export interface DocumentAnalysisResult {
  success: boolean;
  /** Analysis ID (when saved to DB) */
  id?: string;
  /** Document filename */
  filename: string;
  /** Document type */
  documentType: string;
  /** Main analysis text (Markdown formatted) */
  analysis: string;
  /** Structured sections for Artifact output */
  sections: AnalysisSection[];
  /** Extracted key data points */
  keyFindings: string[];
  /** Processing metadata */
  metadata: {
    fileSize: number;
    mimeType: string;
    processingTimeMs: number;
    tokenUsage?: {
      input: number;
      output: number;
    };
    /** For Excel: sheet names and row counts */
    sheetInfo?: Array<{
      name: string;
      rows: number;
      columns: number;
    }>;
  };
}

/** History entry from database */
export interface AnalysisHistoryEntry {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  analysis_type: string;
  analysis_result: DocumentAnalysisResult;
  token_usage: { input: number; output: number } | null;
  context: string;
  created_at: string;
}

/** Cached document content for follow-up questions */
export interface CachedDocument {
  content: Anthropic.MessageCreateParams['messages'][0]['content'];
  filename: string;
  mimeType: DocumentMediaType;
  systemPrompt: string;
  previousMessages: Anthropic.MessageParam[];
  createdAt: number;
}

/** SSE event for streaming document analysis */
export interface DocumentStreamEvent {
  type: 'progress' | 'content_delta' | 'section' | 'done' | 'error';
  data: {
    stage?: string;
    progress?: number;
    content?: string;
    section?: AnalysisSection;
    result?: DocumentAnalysisResult;
    error?: string;
    metadata?: Record<string, unknown>;
  };
}
