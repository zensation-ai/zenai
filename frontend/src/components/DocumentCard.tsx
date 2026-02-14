/**
 * Document Card Component
 *
 * Displays a single document with preview, metadata, and actions.
 */

import React, { memo, useState } from 'react';
import {
  Document,
  formatFileSize,
  getFileTypeLabel,
  getFileTypeIcon,
  PROCESSING_STATUS_LABELS,
  PROCESSING_STATUS_COLORS,
} from '../types/document';
import './DocumentCard.css';

interface DocumentCardProps {
  document: Document;
  onClick?: () => void;
  onDelete?: () => void;
  onToggleFavorite?: () => void;
  onMove?: () => void;
  viewMode?: 'grid' | 'list';
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
}

// File type emoji icons
const FILE_ICONS: Record<string, string> = {
  'file-text': '📄',
  'table': '📊',
  'presentation': '📽️',
  'file': '📝',
  'file-code': '💻',
  'code': '🔧',
  'image': '🖼️',
  'book': '📚',
};

function DocumentCardComponent({
  document,
  onClick,
  onDelete,
  onToggleFavorite,
  onMove,
  viewMode = 'grid',
  selected = false,
  onSelect,
}: DocumentCardProps) {
  const [isHovering, setIsHovering] = useState(false);

  const iconType = getFileTypeIcon(document.mimeType);
  const icon = FILE_ICONS[iconType] || '📄';
  const fileType = getFileTypeLabel(document.mimeType);
  const fileSize = formatFileSize(document.fileSize);

  const isProcessing = document.processingStatus === 'processing';
  const isPending = document.processingStatus === 'pending';
  const hasFailed = document.processingStatus === 'failed';

  const formattedDate = new Date(document.createdAt).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.card-actions')) {
      return; // Don't trigger onClick if clicking actions
    }
    onClick?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onSelect?.(e.target.checked);
  };

  // Grid view
  if (viewMode === 'grid') {
    return (
      <div
        className={`document-card grid-view neuro-hover-lift ${selected ? 'selected' : ''} ${hasFailed ? 'has-error' : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        role="button"
        tabIndex={0}
        aria-label={`Dokument: ${document.title || document.originalFilename}`}
      >
        {/* Selection Checkbox */}
        {onSelect && (
          <div className="card-select">
            <input
              type="checkbox"
              checked={selected}
              onChange={handleSelect}
              aria-label={`${document.title || document.originalFilename} auswählen`}
            />
          </div>
        )}

        {/* Preview Area */}
        <div className="card-preview">
          {document.mimeType.startsWith('image/') ? (
            <img
              src={`${import.meta.env.VITE_API_URL || ''}/api/documents/preview/${document.id}?t=${document.updatedAt || ''}`}
              alt={document.title || document.originalFilename}
              className="preview-image"
              loading="lazy"
            />
          ) : (
            <div className="preview-icon">{icon}</div>
          )}

          {/* Processing Status Badge */}
          {(isProcessing || isPending) && (
            <div
              className="status-badge"
              style={{ backgroundColor: PROCESSING_STATUS_COLORS[document.processingStatus] }}
            >
              {isProcessing && <span className="spinner-small" />}
              {PROCESSING_STATUS_LABELS[document.processingStatus]}
            </div>
          )}

          {/* Error Badge */}
          {hasFailed && (
            <div className="status-badge error">
              Fehler
            </div>
          )}

          {/* Favorite Badge */}
          {document.isFavorite && (
            <div className="favorite-badge">⭐</div>
          )}
        </div>

        {/* Content */}
        <div className="card-content">
          <h3 className="card-title">
            {document.title || document.originalFilename}
          </h3>

          {document.summary && (
            <p className="card-summary">{document.summary}</p>
          )}

          <div className="card-meta">
            <span className="file-type">{fileType}</span>
            <span className="separator">•</span>
            <span className="file-size">{fileSize}</span>
          </div>

          {document.keywords.length > 0 && (
            <div className="card-keywords">
              {document.keywords.slice(0, 3).map((kw, i) => (
                <span key={i} className="keyword-tag">{kw}</span>
              ))}
              {document.keywords.length > 3 && (
                <span className="keyword-more">+{document.keywords.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* Actions (visible on hover) */}
        {isHovering && (
          <div className="card-actions">
            {onToggleFavorite && (
              <button
                type="button"
                className="action-button"
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                aria-label={document.isFavorite ? 'Von Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              >
                {document.isFavorite ? '⭐' : '☆'}
              </button>
            )}
            {onMove && (
              <button
                type="button"
                className="action-button"
                onClick={(e) => { e.stopPropagation(); onMove(); }}
                aria-label="Verschieben"
              >
                📁
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="action-button delete"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                aria-label="Löschen"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div
      className={`document-card list-view neuro-hover-lift ${selected ? 'selected' : ''} ${hasFailed ? 'has-error' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Dokument: ${document.title || document.originalFilename}`}
    >
      {/* Selection Checkbox */}
      {onSelect && (
        <div className="card-select">
          <input
            type="checkbox"
            checked={selected}
            onChange={handleSelect}
            aria-label={`${document.title || document.originalFilename} auswählen`}
          />
        </div>
      )}

      {/* Icon */}
      <div className="list-icon">{icon}</div>

      {/* Main Content */}
      <div className="list-content">
        <div className="list-title-row">
          <h3 className="card-title">
            {document.title || document.originalFilename}
          </h3>
          {document.isFavorite && <span className="favorite-icon">⭐</span>}
        </div>

        {document.summary && (
          <p className="card-summary">{document.summary}</p>
        )}
      </div>

      {/* Meta */}
      <div className="list-meta">
        <span className="file-type">{fileType}</span>
        <span className="file-size">{fileSize}</span>
        <span className="date">{formattedDate}</span>
      </div>

      {/* Status */}
      {(isProcessing || isPending || hasFailed) && (
        <div
          className="list-status"
          style={{ color: PROCESSING_STATUS_COLORS[document.processingStatus] }}
        >
          {isProcessing && <span className="spinner-small" />}
          {PROCESSING_STATUS_LABELS[document.processingStatus]}
        </div>
      )}

      {/* Actions */}
      <div className="card-actions">
        {onToggleFavorite && (
          <button
            type="button"
            className="action-button"
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            aria-label={document.isFavorite ? 'Von Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
          >
            {document.isFavorite ? '⭐' : '☆'}
          </button>
        )}
        {onMove && (
          <button
            type="button"
            className="action-button"
            onClick={(e) => { e.stopPropagation(); onMove(); }}
            aria-label="Verschieben"
          >
            📁
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="action-button delete"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label="Löschen"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}

export const DocumentCard = memo(DocumentCardComponent);
export default DocumentCard;
