/**
 * Document Detail Modal
 *
 * Full-screen modal showing document details, preview, and actions.
 */

import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import {
  Document,
  formatFileSize,
  getFileTypeLabel,
  PROCESSING_STATUS_LABELS,
  PROCESSING_STATUS_COLORS,
} from '../types/document';
import { getApiBaseUrl } from '../utils/apiConfig';
import { logError } from '../utils/errors';
import './DocumentDetailModal.css';

import type { AIContext } from './ContextSwitcher';

interface DocumentDetailModalProps {
  doc: Document;
  context: AIContext;
  onClose: () => void;
  onUpdate: (doc: Document) => void;
  onDelete: () => void;
}

export function DocumentDetailModal({
  doc,
  context,
  onClose,
  onUpdate,
  onDelete,
}: DocumentDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(doc.title || doc.originalFilename);
  const [editTags, setEditTags] = useState(doc.tags.join(', '));
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'content' | 'keywords'>('details');

  const API_URL = getApiBaseUrl();

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditing) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isEditing]);

  // Save changes
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const response = await axios.put(`/api/${context}/documents/${doc.id}`, {
        title: editTitle,
        tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
      });
      if (response.data.success) {
        onUpdate(response.data.data);
        setIsEditing(false);
      }
    } catch (error) {
      logError('DocumentDetail.save', error);
    } finally {
      setIsSaving(false);
    }
  }, [context, doc.id, editTitle, editTags, onUpdate]);

  // Toggle favorite
  const handleToggleFavorite = useCallback(async () => {
    try {
      const response = await axios.put(`/api/${context}/documents/${doc.id}`, { isFavorite: !doc.isFavorite });
      if (response.data.success) {
        onUpdate(response.data.data);
      }
    } catch (error) {
      logError('DocumentDetail.toggleFavorite', error);
    }
  }, [context, doc, onUpdate]);

  // Download file — axios blob to avoid leaking API key in URL
  const handleDownload = useCallback(async () => {
    try {
      const response = await axios.get(`/api/documents/file/${doc.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.originalFilename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      logError('DocumentDetail.download', error);
    }
  }, [doc.id, doc.originalFilename]);

  // Reprocess document (context-aware, no page reload)
  const handleReprocess = useCallback(async () => {
    try {
      const response = await axios.post(`/api/documents/${doc.id}/reprocess`);
      if (response.data.success && response.data.data) {
        onUpdate({ ...doc, processingStatus: 'processing' });
      }
    } catch (error) {
      logError('DocumentDetail.reprocess', error);
    }
  }, [doc, onUpdate]);

  // Delete document
  const handleDelete = useCallback(async () => {
    if (!confirm('Dokument wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await axios.delete(`/api/${context}/documents/${doc.id}`);
      if (response.data.success) {
        onDelete();
        onClose();
      }
    } catch (error) {
      logError('DocumentDetail.delete', error);
    } finally {
      setIsDeleting(false);
    }
  }, [context, doc.id, onDelete, onClose]);

  const formattedDate = doc.createdAt
    ? new Date(doc.createdAt).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '–';

  const isImage = doc.mimeType.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';
  const isProcessing = doc.processingStatus === 'processing';
  const isPending = doc.processingStatus === 'pending';
  const hasFailed = doc.processingStatus === 'failed';

  return (
    <div className="document-detail-overlay" onClick={onClose}>
      <div className="document-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="detail-header">
          <div className="header-title">
            {isEditing ? (
              <input
                type="text"
                className="title-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                autoFocus
              />
            ) : (
              <h2>{doc.title || doc.originalFilename}</h2>
            )}
            <span className="file-type-badge">{getFileTypeLabel(doc.mimeType)}</span>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className={`action-btn ${doc.isFavorite ? 'active' : ''}`}
              onClick={handleToggleFavorite}
              aria-label={doc.isFavorite ? 'Von Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            >
              {doc.isFavorite ? '⭐' : '☆'}
            </button>

            {isEditing ? (
              <>
                <button
                  type="button"
                  className="action-btn save"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? '...' : '✓'}
                </button>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => setIsEditing(false)}
                >
                  ✕
                </button>
              </>
            ) : (
              <button
                type="button"
                className="action-btn"
                onClick={() => setIsEditing(true)}
                aria-label="Bearbeiten"
              >
                ✏️
              </button>
            )}

            <button
              type="button"
              className="action-btn"
              onClick={handleDownload}
              aria-label="Herunterladen"
            >
              ⬇️
            </button>

            <button
              type="button"
              className="action-btn delete"
              onClick={handleDelete}
              disabled={isDeleting}
              aria-label="Löschen"
            >
              🗑️
            </button>

            <button
              type="button"
              className="close-btn"
              onClick={onClose}
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="detail-content">
          {/* Preview Section */}
          <div className="preview-section">
            {isImage ? (
              <img
                src={`${API_URL}/api/documents/preview/${doc.id}`}
                alt={doc.title || doc.originalFilename}
                className="preview-image"
              />
            ) : isPdf ? (
              <div className="preview-pdf-placeholder">
                <span className="preview-icon">📑</span>
                <p>PDF-Dokument</p>
                <button type="button" className="download-btn" onClick={handleDownload}>
                  PDF herunterladen
                </button>
              </div>
            ) : (
              <div className="preview-placeholder">
                <span className="preview-icon">📄</span>
                <p>Vorschau nicht verfügbar</p>
                <button type="button" className="download-btn" onClick={handleDownload}>
                  Datei herunterladen
                </button>
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="info-section">
            {/* Tabs */}
            <div className="info-tabs">
              <button
                type="button"
                className={activeTab === 'details' ? 'active' : ''}
                onClick={() => setActiveTab('details')}
              >
                Details
              </button>
              <button
                type="button"
                className={activeTab === 'content' ? 'active' : ''}
                onClick={() => setActiveTab('content')}
              >
                Inhalt
              </button>
              <button
                type="button"
                className={activeTab === 'keywords' ? 'active' : ''}
                onClick={() => setActiveTab('keywords')}
              >
                Keywords
              </button>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
              {activeTab === 'details' && (
                <div className="details-tab">
                  {/* Processing Status */}
                  {(isProcessing || isPending || hasFailed) && (
                    <div
                      className="status-banner"
                      style={{ backgroundColor: PROCESSING_STATUS_COLORS[doc.processingStatus] }}
                    >
                      {isProcessing && <span className="spinner-small" />}
                      <span>{PROCESSING_STATUS_LABELS[doc.processingStatus]}</span>
                      {hasFailed && (
                        <button type="button" className="retry-btn" onClick={handleReprocess}>
                          Erneut versuchen
                        </button>
                      )}
                    </div>
                  )}

                  {doc.processingError && (
                    <div className="error-banner">
                      <strong>Fehler:</strong> {doc.processingError}
                    </div>
                  )}

                  {/* Summary */}
                  {doc.summary && (
                    <div className="info-block">
                      <h3>Zusammenfassung</h3>
                      <p>{doc.summary}</p>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="info-block">
                    <h3>Metadaten</h3>
                    <dl className="metadata-list">
                      <dt>Dateiname</dt>
                      <dd>{doc.originalFilename}</dd>

                      <dt>Größe</dt>
                      <dd>{formatFileSize(doc.fileSize)}</dd>

                      <dt>Typ</dt>
                      <dd>{doc.mimeType}</dd>

                      {doc.pageCount && (
                        <>
                          <dt>Seiten</dt>
                          <dd>{doc.pageCount}</dd>
                        </>
                      )}

                      {doc.language && (
                        <>
                          <dt>Sprache</dt>
                          <dd>{doc.language.toUpperCase()}</dd>
                        </>
                      )}

                      <dt>Ordner</dt>
                      <dd>{doc.folderPath}</dd>

                      <dt>Hochgeladen</dt>
                      <dd>{formattedDate}</dd>

                      <dt>Aufrufe</dt>
                      <dd>{doc.viewCount}</dd>
                    </dl>
                  </div>

                  {/* Tags */}
                  <div className="info-block">
                    <h3>Tags</h3>
                    {isEditing ? (
                      <input
                        type="text"
                        className="tags-input"
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        placeholder="Tags (kommagetrennt)"
                      />
                    ) : doc.tags.length > 0 ? (
                      <div className="tags-list">
                        {doc.tags.map((tag, i) => (
                          <span key={i} className="tag">{tag}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-text">Keine Tags</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'content' && (
                <div className="content-tab">
                  {doc.fullText ? (
                    <div className="full-text">
                      <pre>{doc.fullText}</pre>
                    </div>
                  ) : (
                    <p className="empty-text">
                      {isProcessing || isPending
                        ? 'Dokument wird verarbeitet...'
                        : 'Kein extrahierter Text verfügbar'}
                    </p>
                  )}
                </div>
              )}

              {activeTab === 'keywords' && (
                <div className="keywords-tab">
                  {doc.keywords.length > 0 ? (
                    <div className="keywords-cloud">
                      {doc.keywords.map((kw, i) => (
                        <span
                          key={i}
                          className="keyword"
                          style={{ fontSize: `${Math.max(0.8, 1.2 - i * 0.05)}rem` }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-text">Keine Keywords extrahiert</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentDetailModal;
