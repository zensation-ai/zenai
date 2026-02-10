/**
 * Type definitions for DocumentAnalysis components.
 *
 * @module components/DocumentAnalysis/types
 */

export interface DocumentAnalysisProps {
  context: string;
  onBack: () => void;
}

export interface AnalysisTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface AnalysisResult {
  id?: string;
  cacheKey?: string;
  filename: string;
  documentType: string;
  analysis: string;
  sections: Array<{
    title: string;
    content: string;
    type: 'text' | 'table' | 'list' | 'kpi';
  }>;
  keyFindings: string[];
  metadata: {
    fileSize: number;
    mimeType: string;
    processingTimeMs: number;
    tokenUsage?: { input: number; output: number };
    sheetInfo?: Array<{ name: string; rows: number; columns: number }>;
  };
}

export interface HistoryEntry {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  analysisType: string;
  tokenUsage: { input: number; output: number } | null;
  createdAt: string;
}

export interface FollowUpMessage {
  role: 'user' | 'assistant';
  content: string;
  tokenUsage?: { input: number; output: number };
}

export interface CustomTemplate {
  id: string;
  name: string;
  system_prompt: string;
  instruction: string;
  icon: string;
  context: string;
}

export interface MermaidDiagram {
  title: string;
  content: string;
}

export type ViewMode = 'upload' | 'compare' | 'history' | 'templates';

export const TEMPLATE_ICONS: Record<string, string> = {
  'search': '\uD83D\uDD0D',
  'trending-up': '\uD83D\uDCC8',
  'file-text': '\uD83D\uDCC4',
  'bar-chart': '\uD83D\uDCCA',
  'zap': '\u26A1',
  'star': '\u2B50',
  'settings': '\u2699\uFE0F',
  'brain': '\uD83E\uDDE0',
  'target': '\uD83C\uDFAF',
  'clipboard': '\uD83D\uDCCB',
};

export interface SimpleFileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}
