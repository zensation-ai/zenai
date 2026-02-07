/**
 * Document Vault Types
 *
 * TypeScript types for the Document Vault feature.
 */

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
export type StorageProvider = 'local' | 'supabase';
export type Context = 'personal' | 'work';

/**
 * Document entity
 */
export interface Document {
  id: string;
  filename: string;
  originalFilename: string;
  filePath: string;
  storageProvider: StorageProvider;
  fileHash: string;
  mimeType: string;
  fileSize: number;
  pageCount?: number;

  // AI-generated content
  title?: string;
  summary?: string;
  fullText?: string;
  keywords: string[];
  language?: string;

  // Organization
  context: Context;
  primaryTopicId?: string;
  folderPath: string;
  tags: string[];

  // Processing status
  processingStatus: ProcessingStatus;
  processingError?: string;
  ocrConfidence?: number;

  // Linking
  linkedIdeaId?: string;
  sourceUrl?: string;

  // User interaction
  viewCount: number;
  lastViewedAt?: string;
  isFavorite: boolean;
  isArchived: boolean;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
}

/**
 * Document search result
 */
export interface DocumentSearchResult {
  id: string;
  title: string;
  summary: string;
  mimeType: string;
  folderPath: string;
  similarity: number;
  matchedChunk?: string;
  pageNumber?: number;
}

/**
 * Folder structure
 */
export interface Folder {
  id: string;
  path: string;
  name: string;
  parentPath?: string;
  color?: string;
  icon?: string;
  documentCount: number;
}

/**
 * Document filters for list/search
 */
export interface DocumentFilters {
  search?: string;
  folderPath?: string;
  mimeTypes?: string[];
  tags?: string[];
  topicId?: string;
  status?: ProcessingStatus;
  favorites?: boolean;
  archived?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'updated_at' | 'title' | 'file_size';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Upload options
 */
export interface DocumentUploadOptions {
  folderPath?: string;
  tags?: string[];
  processImmediately?: boolean;
}

/**
 * Upload result
 */
export interface DocumentUploadResult {
  uploaded: Document[];
  failed: Array<{ filename: string; error: string }>;
  totalUploaded: number;
  totalFailed: number;
}

/**
 * Document statistics
 */
export interface DocumentStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalSize: number;
  byMimeType: Record<string, number>;
}

/**
 * Pagination info
 */
export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Paginated document response
 */
export interface PaginatedDocuments {
  data: Document[];
  pagination: Pagination;
}

/**
 * File type icons mapping
 */
export const FILE_TYPE_ICONS: Record<string, string> = {
  'application/pdf': 'file-text',
  'application/msword': 'file-text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file-text',
  'application/vnd.ms-excel': 'table',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'table',
  'text/csv': 'table',
  'application/vnd.ms-powerpoint': 'presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'text/plain': 'file',
  'text/markdown': 'file-code',
  'text/html': 'code',
  'application/json': 'code',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'application/epub+zip': 'book',
};

/**
 * Get icon for file type
 */
export function getFileTypeIcon(mimeType: string): string {
  return FILE_TYPE_ICONS[mimeType] || 'file';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get human-readable file type
 */
export function getFileTypeLabel(mimeType: string): string {
  const labels: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/msword': 'Word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/vnd.ms-excel': 'Excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'text/csv': 'CSV',
    'text/plain': 'Text',
    'text/markdown': 'Markdown',
    'text/html': 'HTML',
    'application/json': 'JSON',
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'application/epub+zip': 'ePub',
  };

  return labels[mimeType] || mimeType.split('/')[1]?.toUpperCase() || 'Datei';
}

/**
 * Processing status labels
 */
export const PROCESSING_STATUS_LABELS: Record<ProcessingStatus, string> = {
  pending: 'Wartend',
  processing: 'Verarbeitung',
  completed: 'Fertig',
  failed: 'Fehler',
  skipped: 'Übersprungen',
};

/**
 * Processing status colors
 */
export const PROCESSING_STATUS_COLORS: Record<ProcessingStatus, string> = {
  pending: '#f59e0b',
  processing: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
  skipped: '#6b7280',
};
