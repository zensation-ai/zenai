/**
 * Document Service
 *
 * CRUD operations and organization for the Document Vault:
 * - Document upload and storage
 * - Semantic and full-text search
 * - Folder and tag management
 * - Topic auto-assignment
 * - Linking to ideas
 *
 * @module services/document-service
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { queryContext, AIContext } from '../utils/database-context';
import { documentProcessingService, ProcessingResult } from './document-processing';
import { generateEmbedding } from './ai';
import { cosineSimilarity as _cosineSimilarity } from '../utils/embedding';

// ===========================================
// Types
// ===========================================

export interface Document {
  id: string;
  filename: string;
  originalFilename: string;
  filePath: string;
  storageProvider: 'local' | 'supabase';
  fileHash: string;
  mimeType: string;
  fileSize: number;
  pageCount?: number;

  title?: string;
  summary?: string;
  fullText?: string;
  keywords: string[];
  language?: string;

  context: AIContext;
  primaryTopicId?: string;
  folderPath: string;
  tags: string[];

  processingStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  processingError?: string;
  ocrConfidence?: number;

  linkedIdeaId?: string;
  sourceUrl?: string;

  viewCount: number;
  lastViewedAt?: Date;
  isFavorite: boolean;
  isArchived: boolean;

  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
}

export interface DocumentFilters {
  search?: string;
  folderPath?: string;
  mimeTypes?: string[];
  tags?: string[];
  topicId?: string;
  processingStatus?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'updated_at' | 'title' | 'file_size';
  sortOrder?: 'asc' | 'desc';
}

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

export interface FolderInfo {
  id: string;
  path: string;
  name: string;
  parentPath?: string;
  color?: string;
  icon?: string;
  documentCount: number;
}

export interface UploadOptions {
  folderPath?: string;
  tags?: string[];
  processImmediately?: boolean;
  sourceUrl?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  uploadDir: path.join(__dirname, '../../uploads/documents'),
  maxFileSize: 100 * 1024 * 1024, // 100 MB
  defaultFolderPath: '/inbox',
  searchResultLimit: 20,
  minSearchSimilarity: 0.3,
} as const;

// ===========================================
// Document Service
// ===========================================

export class DocumentService {
  /**
   * Ensure upload directory exists
   */
  private async ensureUploadDir(): Promise<void> {
    await fs.mkdir(CONFIG.uploadDir, { recursive: true });
  }

  /**
   * Upload and store a new document
   */
  async uploadDocument(
    file: Express.Multer.File,
    context: AIContext,
    options?: UploadOptions
  ): Promise<Document> {
    await this.ensureUploadDir();

    // Generate unique filename
    const uniqueId = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${uniqueId}${ext}`;
    const filePath = path.join(CONFIG.uploadDir, filename);

    // Calculate file hash for deduplication
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Check for duplicate
    const existingDoc = await this.findByHash(fileHash, context);
    if (existingDoc) {
      logger.info('Duplicate document detected', { fileHash, existingId: existingDoc.id });
      return existingDoc;
    }

    // Save file to disk
    await fs.writeFile(filePath, file.buffer);

    // Insert document record
    const result = await queryContext(
      context,
      `INSERT INTO documents (
        filename, original_filename, file_path, storage_provider,
        file_hash, mime_type, file_size, context, folder_path, tags,
        source_url, processing_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
      RETURNING *`,
      [
        filename,
        file.originalname,
        filePath,
        'local',
        fileHash,
        file.mimetype,
        file.size,
        context,
        options?.folderPath || CONFIG.defaultFolderPath,
        options?.tags || [],
        options?.sourceUrl,
      ]
    );

    const document = this.mapRowToDocument(result.rows[0]);

    // Process document asynchronously if requested
    if (options?.processImmediately !== false) {
      this.processDocumentAsync(document.id, filePath, file.mimetype, context);
    }

    logger.info('Document uploaded', { documentId: document.id, filename });
    return document;
  }

  /**
   * Process document asynchronously (don't await)
   */
  private async processDocumentAsync(
    documentId: string,
    filePath: string,
    mimeType: string,
    context: AIContext
  ): Promise<void> {
    // Update status to processing
    await queryContext(
      context,
      `UPDATE documents SET processing_status = 'processing', updated_at = NOW() WHERE id = $1`,
      [documentId]
    );

    // Process in background
    documentProcessingService.processDocument(documentId, filePath, mimeType, context)
      .then(async (result) => {
        if (result.success) {
          // Auto-assign topic
          await this.autoAssignTopic(documentId, context);
        }
      })
      .catch(error => {
        logger.error('Background document processing failed', error instanceof Error ? error : undefined, { documentId });
      });
  }

  /**
   * Get a single document by ID
   */
  async getDocument(id: string, context: AIContext): Promise<Document | null> {
    const result = await queryContext(
      context,
      `SELECT * FROM documents WHERE id = $1 AND context = $2`,
      [id, context]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Update view count
    await queryContext(
      context,
      `UPDATE documents SET view_count = view_count + 1, last_viewed_at = NOW() WHERE id = $1`,
      [id]
    );

    // Log access
    await this.logAccess(id, 'view', context);

    return this.mapRowToDocument(result.rows[0]);
  }

  /**
   * List documents with filters and pagination
   */
  async listDocuments(
    context: AIContext,
    filters?: DocumentFilters
  ): Promise<PaginatedResult<Document>> {
    const limit = Math.min(filters?.limit || 50, 100);
    const offset = filters?.offset || 0;

    let whereClause = `WHERE context = $1 AND is_archived = $2`;
    const params: (string | number | boolean | Date | null | undefined | Buffer | object)[] = [context, filters?.isArchived || false];
    let paramIndex = 3;

    if (filters?.folderPath) {
      whereClause += ` AND folder_path = $${paramIndex}`;
      params.push(filters.folderPath);
      paramIndex++;
    }

    if (filters?.mimeTypes && filters.mimeTypes.length > 0) {
      whereClause += ` AND mime_type = ANY($${paramIndex})`;
      params.push(filters.mimeTypes);
      paramIndex++;
    }

    if (filters?.tags && filters.tags.length > 0) {
      whereClause += ` AND tags && $${paramIndex}`;
      params.push(filters.tags);
      paramIndex++;
    }

    if (filters?.topicId) {
      whereClause += ` AND primary_topic_id = $${paramIndex}`;
      params.push(filters.topicId);
      paramIndex++;
    }

    if (filters?.processingStatus) {
      whereClause += ` AND processing_status = $${paramIndex}`;
      params.push(filters.processingStatus);
      paramIndex++;
    }

    if (filters?.isFavorite !== undefined) {
      whereClause += ` AND is_favorite = $${paramIndex}`;
      params.push(filters.isFavorite);
      paramIndex++;
    }

    if (filters?.search) {
      whereClause += ` AND (
        title ILIKE $${paramIndex}
        OR original_filename ILIKE $${paramIndex}
        OR summary ILIKE $${paramIndex}
      )`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const VALID_SORT_FIELDS = ['created_at', 'updated_at', 'title', 'file_size'] as const;
    const VALID_SORT_ORDERS = ['asc', 'desc'] as const;
    const sortBy = VALID_SORT_FIELDS.includes(filters?.sortBy as typeof VALID_SORT_FIELDS[number])
      ? filters!.sortBy!
      : 'created_at';
    const sortOrder = VALID_SORT_ORDERS.includes(filters?.sortOrder as typeof VALID_SORT_ORDERS[number])
      ? filters!.sortOrder!
      : 'desc';
    const orderClause = `ORDER BY ${sortBy} ${sortOrder}`;

    // Get total count
    const countResult = await queryContext(
      context,
      `SELECT COUNT(*) as total FROM documents ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    // Get paginated results
    const result = await queryContext(
      context,
      `SELECT * FROM documents ${whereClause} ${orderClause} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      data: result.rows.map(row => this.mapRowToDocument(row)),
      total,
      limit,
      offset,
      hasMore: offset + result.rows.length < total,
    };
  }

  /**
   * Semantic search for documents
   */
  async searchDocuments(
    query: string,
    context: AIContext,
    options?: { limit?: number; includeChunks?: boolean }
  ): Promise<DocumentSearchResult[]> {
    const limit = options?.limit || CONFIG.searchResultLimit;

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding || queryEmbedding.length === 0) {
      // Fallback to text search
      return this.textSearchDocuments(query, context, limit);
    }

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Search documents by embedding similarity
    const docResults = await queryContext(
      context,
      `SELECT
        id, title, summary, mime_type, folder_path,
        1 - (embedding <=> $1::vector) as similarity
      FROM documents
      WHERE context = $2
        AND embedding IS NOT NULL
        AND is_archived = FALSE
        AND 1 - (embedding <=> $1::vector) >= $3
      ORDER BY embedding <=> $1::vector
      LIMIT $4`,
      [embeddingStr, context, CONFIG.minSearchSimilarity, limit]
    );

    const results: DocumentSearchResult[] = docResults.rows.map(row => ({
      id: row.id,
      title: row.title || 'Untitled',
      summary: row.summary || '',
      mimeType: row.mime_type,
      folderPath: row.folder_path,
      similarity: parseFloat(row.similarity),
    }));

    // Optionally search chunks for more precise matches
    if (options?.includeChunks) {
      const chunkResults = await queryContext(
        context,
        `SELECT
          c.document_id, c.content, c.page_number,
          d.title, d.mime_type, d.folder_path,
          1 - (c.embedding <=> $1::vector) as similarity
        FROM document_chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE d.context = $2
          AND c.embedding IS NOT NULL
          AND d.is_archived = FALSE
          AND 1 - (c.embedding <=> $1::vector) >= $3
        ORDER BY c.embedding <=> $1::vector
        LIMIT $4`,
        [embeddingStr, context, CONFIG.minSearchSimilarity + 0.1, limit]
      );

      // Merge chunk results with document results
      for (const row of chunkResults.rows) {
        const existingIndex = results.findIndex(r => r.id === row.document_id);
        if (existingIndex === -1) {
          results.push({
            id: row.document_id,
            title: row.title || 'Untitled',
            summary: row.content.substring(0, 200),
            mimeType: row.mime_type,
            folderPath: row.folder_path,
            similarity: parseFloat(row.similarity),
            matchedChunk: row.content,
            pageNumber: row.page_number,
          });
        } else if (parseFloat(row.similarity) > results[existingIndex].similarity) {
          results[existingIndex].matchedChunk = row.content;
          results[existingIndex].pageNumber = row.page_number;
        }
      }
    }

    // Log search access
    for (const result of results.slice(0, 5)) {
      await this.logAccess(result.id, 'search_result', context, query, result.similarity);
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  /**
   * Fallback text search when embeddings not available
   */
  private async textSearchDocuments(
    query: string,
    context: AIContext,
    limit: number
  ): Promise<DocumentSearchResult[]> {
    const result = await queryContext(
      context,
      `SELECT
        id, title, summary, mime_type, folder_path,
        ts_rank(to_tsvector('german', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(full_text, '')),
                plainto_tsquery('german', $1)) as rank
      FROM documents
      WHERE context = $2
        AND is_archived = FALSE
        AND to_tsvector('german', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(full_text, ''))
            @@ plainto_tsquery('german', $1)
      ORDER BY rank DESC
      LIMIT $3`,
      [query, context, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      title: row.title || 'Untitled',
      summary: row.summary || '',
      mimeType: row.mime_type,
      folderPath: row.folder_path,
      similarity: Math.min(parseFloat(row.rank) / 10, 1),
    }));
  }

  /**
   * Update document metadata
   */
  async updateDocument(
    id: string,
    context: AIContext,
    updates: Partial<Pick<Document, 'title' | 'tags' | 'folderPath' | 'isFavorite' | 'isArchived'>>
  ): Promise<Document | null> {
    const setClauses: string[] = [];
    const params: (string | number | boolean | Date | null | undefined | Buffer | object)[] = [id, context];
    let paramIndex = 3;

    if (updates.title !== undefined) {
      setClauses.push(`title = $${paramIndex}`);
      params.push(updates.title);
      paramIndex++;
    }

    if (updates.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex}`);
      params.push(updates.tags);
      paramIndex++;
    }

    if (updates.folderPath !== undefined) {
      setClauses.push(`folder_path = $${paramIndex}`);
      params.push(updates.folderPath);
      paramIndex++;
    }

    if (updates.isFavorite !== undefined) {
      setClauses.push(`is_favorite = $${paramIndex}`);
      params.push(updates.isFavorite);
      paramIndex++;
    }

    if (updates.isArchived !== undefined) {
      setClauses.push(`is_archived = $${paramIndex}`);
      params.push(updates.isArchived);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return this.getDocument(id, context);
    }

    setClauses.push('updated_at = NOW()');

    const result = await queryContext(
      context,
      `UPDATE documents SET ${setClauses.join(', ')} WHERE id = $1 AND context = $2 RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToDocument(result.rows[0]);
  }

  /**
   * Delete a document
   */
  async deleteDocument(id: string, context: AIContext): Promise<boolean> {
    const doc = await this.getDocument(id, context);
    if (!doc) {
      return false;
    }

    // Delete file from storage
    try {
      await fs.unlink(doc.filePath);
    } catch (error) {
      logger.warn('Failed to delete document file', { id, filePath: doc.filePath, error });
    }

    // Delete database record (cascades to chunks and memberships)
    await queryContext(
      context,
      `DELETE FROM documents WHERE id = $1 AND context = $2`,
      [id, context]
    );

    logger.info('Document deleted', { id });
    return true;
  }

  /**
   * Move document to folder
   */
  async moveToFolder(id: string, folderPath: string, context: AIContext): Promise<boolean> {
    const result = await queryContext(
      context,
      `UPDATE documents SET folder_path = $2, updated_at = NOW() WHERE id = $1 AND context = $3`,
      [id, folderPath, context]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Add tags to document
   */
  async addTags(id: string, tags: string[], context: AIContext): Promise<boolean> {
    const result = await queryContext(
      context,
      `UPDATE documents SET tags = array_cat(tags, $2), updated_at = NOW() WHERE id = $1 AND context = $3`,
      [id, tags, context]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Remove tags from document
   */
  async removeTags(id: string, tags: string[], context: AIContext): Promise<boolean> {
    const result = await queryContext(
      context,
      `UPDATE documents SET tags = array_remove_all(tags, $2), updated_at = NOW() WHERE id = $1 AND context = $3`,
      [id, tags, context]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Link document to an idea
   */
  async linkToIdea(documentId: string, ideaId: string, context: AIContext): Promise<boolean> {
    const result = await queryContext(
      context,
      `UPDATE documents SET linked_idea_id = $2, updated_at = NOW() WHERE id = $1 AND context = $3`,
      [documentId, ideaId, context]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Auto-assign topic based on content similarity
   */
  async autoAssignTopic(documentId: string, context: AIContext): Promise<string | null> {
    // Get document embedding
    const docResult = await queryContext(
      context,
      `SELECT embedding FROM documents WHERE id = $1`,
      [documentId]
    );

    if (!docResult.rows[0]?.embedding) {
      return null;
    }

    // Find best matching topic
    const topicResult = await queryContext(
      context,
      `SELECT id, name,
        1 - (centroid_embedding <=> $1::vector) as similarity
      FROM idea_topics
      WHERE context = $2
        AND centroid_embedding IS NOT NULL
      ORDER BY centroid_embedding <=> $1::vector
      LIMIT 1`,
      [docResult.rows[0].embedding, context]
    );

    if (topicResult.rows.length === 0 || parseFloat(topicResult.rows[0].similarity) < 0.5) {
      return null;
    }

    const topicId = topicResult.rows[0].id;

    // Update document
    await queryContext(
      context,
      `UPDATE documents SET primary_topic_id = $2, updated_at = NOW() WHERE id = $1`,
      [documentId, topicId]
    );

    // Create membership
    await queryContext(
      context,
      `INSERT INTO document_topic_memberships (document_id, topic_id, membership_score, is_primary, assigned_by)
       VALUES ($1, $2, $3, true, 'auto')
       ON CONFLICT (document_id, topic_id) DO UPDATE SET
         membership_score = $3, is_primary = true, assigned_by = 'auto'`,
      [documentId, topicId, parseFloat(topicResult.rows[0].similarity)]
    );

    logger.info('Auto-assigned topic to document', {
      documentId,
      topicId,
      similarity: topicResult.rows[0].similarity,
    });

    return topicId;
  }

  /**
   * Get folder structure
   */
  async getFolders(context: AIContext): Promise<FolderInfo[]> {
    const result = await queryContext(
      context,
      `SELECT * FROM document_folders WHERE context = $1 ORDER BY path`,
      [context]
    );

    return result.rows.map(row => ({
      id: row.id,
      path: row.path,
      name: row.name,
      parentPath: row.parent_path,
      color: row.color,
      icon: row.icon,
      documentCount: row.document_count,
    }));
  }

  /**
   * Create a new folder
   */
  async createFolder(
    context: AIContext,
    name: string,
    parentPath: string = '/',
    options?: { color?: string; icon?: string }
  ): Promise<FolderInfo> {
    const folderPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;

    const result = await queryContext(
      context,
      `INSERT INTO document_folders (context, path, name, parent_path, color, icon)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [context, folderPath, name, parentPath, options?.color, options?.icon]
    );

    return {
      id: result.rows[0].id,
      path: result.rows[0].path,
      name: result.rows[0].name,
      parentPath: result.rows[0].parent_path,
      color: result.rows[0].color,
      icon: result.rows[0].icon,
      documentCount: 0,
    };
  }

  /**
   * Delete a folder (moves documents to parent)
   */
  async deleteFolder(path: string, context: AIContext): Promise<boolean> {
    // Get folder info
    const folderResult = await queryContext(
      context,
      `SELECT parent_path FROM document_folders WHERE path = $1 AND context = $2`,
      [path, context]
    );

    if (folderResult.rows.length === 0) {
      return false;
    }

    const parentPath = folderResult.rows[0].parent_path || '/';

    // Move documents to parent folder
    await queryContext(
      context,
      `UPDATE documents SET folder_path = $1, updated_at = NOW()
       WHERE folder_path = $2 AND context = $3`,
      [parentPath, path, context]
    );

    // Delete folder
    await queryContext(
      context,
      `DELETE FROM document_folders WHERE path = $1 AND context = $2`,
      [path, context]
    );

    return true;
  }

  /**
   * Find document by file hash
   */
  private async findByHash(hash: string, context: AIContext): Promise<Document | null> {
    const result = await queryContext(
      context,
      `SELECT * FROM documents WHERE file_hash = $1 AND context = $2`,
      [hash, context]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToDocument(result.rows[0]);
  }

  /**
   * Log document access for analytics
   */
  private async logAccess(
    documentId: string,
    accessType: 'view' | 'download' | 'search_result' | 'chat_reference',
    context: AIContext,
    searchQuery?: string,
    relevanceScore?: number
  ): Promise<void> {
    try {
      await queryContext(
        context,
        `INSERT INTO document_access_log (document_id, access_type, search_query, relevance_score)
         VALUES ($1, $2, $3, $4)`,
        [documentId, accessType, searchQuery, relevanceScore]
      );
    } catch (error) {
      // Non-critical, just log
      logger.debug('Failed to log document access', { documentId, error });
    }
  }

  /**
   * Map database row to Document type
   */
  private mapRowToDocument(row: Record<string, unknown>): Document {
    return {
      id: row.id as string,
      filename: row.filename as string,
      originalFilename: row.original_filename as string,
      filePath: row.file_path as string,
      storageProvider: row.storage_provider as 'local' | 'supabase',
      fileHash: row.file_hash as string,
      mimeType: row.mime_type as string,
      fileSize: row.file_size as number,
      pageCount: row.page_count as number | undefined,

      title: row.title as string | undefined,
      summary: row.summary as string | undefined,
      fullText: row.full_text as string | undefined,
      keywords: (row.keywords as string[]) || [],
      language: row.language as string | undefined,

      context: row.context as AIContext,
      primaryTopicId: row.primary_topic_id as string | undefined,
      folderPath: row.folder_path as string,
      tags: (row.tags as string[]) || [],

      processingStatus: row.processing_status as Document['processingStatus'],
      processingError: row.processing_error as string | undefined,
      ocrConfidence: row.ocr_confidence as number | undefined,

      linkedIdeaId: row.linked_idea_id as string | undefined,
      sourceUrl: row.source_url as string | undefined,

      viewCount: row.view_count as number,
      lastViewedAt: row.last_viewed_at ? new Date(row.last_viewed_at as string) : undefined,
      isFavorite: row.is_favorite as boolean,
      isArchived: row.is_archived as boolean,

      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      processedAt: row.processed_at ? new Date(row.processed_at as string) : undefined,
    };
  }

  /**
   * Trigger reprocessing of a document
   */
  async reprocessDocument(id: string, context: AIContext): Promise<ProcessingResult | null> {
    const doc = await this.getDocument(id, context);
    if (!doc) {
      return null;
    }

    return documentProcessingService.processDocument(id, doc.filePath, doc.mimeType, context);
  }

  /**
   * Get document processing statistics
   */
  async getStats(context: AIContext): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    totalSize: number;
    byMimeType: Record<string, number>;
  }> {
    const result = await queryContext(
      context,
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE processing_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE processing_status = 'processing') as processing,
        COUNT(*) FILTER (WHERE processing_status = 'completed') as completed,
        COUNT(*) FILTER (WHERE processing_status = 'failed') as failed,
        COALESCE(SUM(file_size), 0) as total_size
      FROM documents
      WHERE context = $1`,
      [context]
    );

    const mimeResult = await queryContext(
      context,
      `SELECT mime_type, COUNT(*) as count
       FROM documents
       WHERE context = $1
       GROUP BY mime_type`,
      [context]
    );

    const byMimeType: Record<string, number> = {};
    for (const row of mimeResult.rows) {
      byMimeType[row.mime_type] = parseInt(row.count, 10);
    }

    return {
      total: parseInt(result.rows[0].total, 10),
      pending: parseInt(result.rows[0].pending, 10),
      processing: parseInt(result.rows[0].processing, 10),
      completed: parseInt(result.rows[0].completed, 10),
      failed: parseInt(result.rows[0].failed, 10),
      totalSize: parseInt(result.rows[0].total_size, 10),
      byMimeType,
    };
  }
}

// Export singleton instance
export const documentService = new DocumentService();
