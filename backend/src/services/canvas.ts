/**
 * Canvas Service
 *
 * CRUD operations for canvas documents with version history.
 * Supports persistent side-by-side editing alongside chat.
 *
 * Phase 33 Sprint 4 - Feature 10
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { query } from '../utils/database';
import { SYSTEM_USER_ID } from '../utils/user-context';

// ============================================================
// Types
// ============================================================

export type CanvasDocumentType = 'markdown' | 'code' | 'html';

export interface CanvasDocument {
  id: string;
  context: string;
  title: string;
  content: string;
  type: CanvasDocumentType;
  language?: string;
  chatSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasVersion {
  id: string;
  documentId: string;
  content: string;
  source: 'user' | 'ai';
  createdAt: string;
}

// ============================================================
// Constants
// ============================================================

const MAX_VERSIONS_PER_DOCUMENT = 50;

// ============================================================
// CRUD Operations
// ============================================================

/**
 * Create a new canvas document
 */
export async function createCanvasDocument(
  context: string,
  title: string,
  type: CanvasDocumentType = 'markdown',
  language?: string,
  content: string = '',
  userId?: string
): Promise<CanvasDocument> {
  const id = uuidv4();
  const uid = userId || SYSTEM_USER_ID;

  const result = await query(
    `INSERT INTO canvas_documents (id, context, title, content, type, language, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, context, title, content, type, language, chat_session_id, created_at, updated_at`,
    [id, context, title, content, type, language || null, uid]
  );

  const row = result.rows[0];

  logger.info('Canvas document created', {
    documentId: id,
    docContext: context,
    docType: type,
    operation: 'canvas-create',
  });

  return mapRow(row);
}

/**
 * Get a canvas document by ID
 */
export async function getCanvasDocument(id: string, userId?: string): Promise<CanvasDocument | null> {
  const uid = userId || SYSTEM_USER_ID;
  const result = await query(
    `SELECT id, context, title, content, type, language, chat_session_id, created_at, updated_at
     FROM canvas_documents
     WHERE id = $1 AND user_id = $2`,
    [id, uid]
  );

  if (result.rows.length === 0) {return null;}
  return mapRow(result.rows[0]);
}

/**
 * List canvas documents for a context
 */
export async function listCanvasDocuments(
  context: string,
  limit: number = 50,
  offset: number = 0,
  userId?: string
): Promise<{ documents: CanvasDocument[]; total: number }> {
  const uid = userId || SYSTEM_USER_ID;
  const [docsResult, countResult] = await Promise.all([
    query(
      `SELECT id, context, title, content, type, language, chat_session_id, created_at, updated_at
       FROM canvas_documents
       WHERE context = $1 AND user_id = $4
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [context, limit, offset, uid]
    ),
    query(
      `SELECT COUNT(*)::int as total FROM canvas_documents WHERE context = $1 AND user_id = $2`,
      [context, uid]
    ),
  ]);

  return {
    documents: docsResult.rows.map(mapRow),
    total: countResult.rows[0]?.total || 0,
  };
}

/**
 * Update a canvas document
 */
export async function updateCanvasDocument(
  id: string,
  updates: {
    title?: string;
    content?: string;
    type?: CanvasDocumentType;
    language?: string;
  },
  userId?: string
): Promise<CanvasDocument | null> {
  const uid = userId || SYSTEM_USER_ID;
  // Build dynamic UPDATE query
  const setClauses: string[] = [];
  const values: (string | number | boolean | Date | null | undefined)[] = [];
  let paramIndex = 1;

  if (updates.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    values.push(updates.title);
  }
  if (updates.content !== undefined) {
    setClauses.push(`content = $${paramIndex++}`);
    values.push(updates.content);
  }
  if (updates.type !== undefined) {
    setClauses.push(`type = $${paramIndex++}`);
    values.push(updates.type);
  }
  if (updates.language !== undefined) {
    setClauses.push(`language = $${paramIndex++}`);
    values.push(updates.language);
  }

  if (setClauses.length === 0) {return getCanvasDocument(id, uid);}

  values.push(id);
  paramIndex++;
  values.push(uid);

  const result = await query(
    `UPDATE canvas_documents
     SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex - 1} AND user_id = $${paramIndex}
     RETURNING id, context, title, content, type, language, chat_session_id, created_at, updated_at`,
    values
  );

  if (result.rows.length === 0) {return null;}

  // Auto-save version if content changed
  if (updates.content !== undefined) {
    void saveVersionIfNeeded(id, updates.content, 'user');
  }

  logger.info('Canvas document updated', {
    documentId: id,
    fields: Object.keys(updates),
    operation: 'canvas-update',
  });

  return mapRow(result.rows[0]);
}

/**
 * Delete a canvas document (and cascade versions)
 */
export async function deleteCanvasDocument(id: string, userId?: string): Promise<boolean> {
  const uid = userId || SYSTEM_USER_ID;
  const result = await query(
    `DELETE FROM canvas_documents WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, uid]
  );

  if (result.rows.length > 0) {
    logger.info('Canvas document deleted', {
      documentId: id,
      operation: 'canvas-delete',
    });
    return true;
  }

  return false;
}

/**
 * Link a chat session to a canvas document
 */
export async function linkChatSession(
  documentId: string,
  chatSessionId: string,
  userId?: string
): Promise<boolean> {
  const uid = userId || SYSTEM_USER_ID;
  const result = await query(
    `UPDATE canvas_documents
     SET chat_session_id = $1
     WHERE id = $2 AND user_id = $3
     RETURNING id`,
    [chatSessionId, documentId, uid]
  );
  return result.rows.length > 0;
}

// ============================================================
// Version History
// ============================================================

/**
 * Save a version snapshot (if content actually changed)
 */
async function saveVersionIfNeeded(
  documentId: string,
  content: string,
  source: 'user' | 'ai'
): Promise<void> {
  try {
    // Check if content actually changed from last version
    const lastVersion = await query(
      `SELECT content FROM canvas_versions
       WHERE document_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [documentId]
    );

    if (lastVersion.rows.length > 0 && lastVersion.rows[0].content === content) {
      return; // No change
    }

    // Save new version
    await query(
      `INSERT INTO canvas_versions (document_id, content, source)
       VALUES ($1, $2, $3)`,
      [documentId, content, source]
    );

    // Prune old versions
    await query(
      `DELETE FROM canvas_versions
       WHERE document_id = $1
       AND id NOT IN (
         SELECT id FROM canvas_versions
         WHERE document_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       )`,
      [documentId, MAX_VERSIONS_PER_DOCUMENT]
    );
  } catch (error) {
    logger.warn('Failed to save canvas version (non-critical)', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
      operation: 'canvas-version-save',
    });
  }
}

/**
 * Get version history for a document
 */
export async function getVersionHistory(
  documentId: string,
  limit: number = 20,
  userId?: string
): Promise<CanvasVersion[]> {
  const uid = userId || SYSTEM_USER_ID;
  const result = await query(
    `SELECT cv.id, cv.document_id, cv.content, cv.source, cv.created_at
     FROM canvas_versions cv
     JOIN canvas_documents cd ON cv.document_id = cd.id
     WHERE cv.document_id = $1 AND cd.user_id = $3
     ORDER BY cv.created_at DESC
     LIMIT $2`,
    [documentId, limit, uid]
  );

  return result.rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    source: row.source,
    createdAt: row.created_at,
  }));
}

/**
 * Restore a specific version
 */
export async function restoreVersion(
  documentId: string,
  versionId: string,
  userId?: string
): Promise<CanvasDocument | null> {
  const uid = userId || SYSTEM_USER_ID;
  // Get the version content, verifying ownership via join
  const versionResult = await query(
    `SELECT cv.content FROM canvas_versions cv
     JOIN canvas_documents cd ON cv.document_id = cd.id
     WHERE cv.id = $1 AND cv.document_id = $2 AND cd.user_id = $3`,
    [versionId, documentId, uid]
  );

  if (versionResult.rows.length === 0) {return null;}

  const content = versionResult.rows[0].content;

  // Update the document with the version content
  return updateCanvasDocument(documentId, { content }, uid);
}

// ============================================================
// Helpers
// ============================================================

function mapRow(row: Record<string, unknown>): CanvasDocument {
  return {
    id: row.id as string,
    context: row.context as string,
    title: row.title as string,
    content: row.content as string,
    type: row.type as CanvasDocumentType,
    language: (row.language as string) || undefined,
    chatSessionId: (row.chat_session_id as string) || undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
