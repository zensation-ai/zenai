/**
 * Canvas Document List
 *
 * Slide-in drawer showing all canvas documents with search, create, and delete.
 *
 * Phase 33 Sprint 4 - Feature 10
 */

import { useState, useMemo } from 'react';
import { useEscapeKey } from '../../hooks/useClickOutside';

interface CanvasDocumentSummary {
  id: string;
  title: string;
  type: 'markdown' | 'code' | 'html';
  language?: string;
  updatedAt: string;
}

interface CanvasDocumentListProps {
  documents: CanvasDocumentSummary[];
  activeDocumentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

export function CanvasDocumentList({
  documents,
  activeDocumentId,
  onSelect,
  onDelete,
  onCreate,
  onClose,
}: CanvasDocumentListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  useEscapeKey(onClose);

  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const query = searchQuery.toLowerCase();
    return documents.filter((doc) => doc.title.toLowerCase().includes(query));
  }, [documents, searchQuery]);

  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'markdown': return '\uD83D\uDCDD';
      case 'code': return '\uD83D\uDCBB';
      case 'html': return '\uD83C\uDF10';
      default: return '\uD83D\uDCC4';
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Gerade eben';
    if (diffMin < 60) return `Vor ${diffMin} Min.`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Vor ${diffHours} Std.`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Vor ${diffDays} Tagen`;
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  return (
    <div className="canvas-doc-list-overlay" onClick={onClose} role="presentation">
      <div className="canvas-doc-list" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Dokumente">
        <div className="canvas-doc-list-header">
          <h3>Dokumente</h3>
          <button className="canvas-doc-list-close" onClick={onClose} aria-label="Schlie\u00dfen">
            {'\u2715'}
          </button>
        </div>

        {/* Search */}
        <div className="canvas-doc-list-search">
          <input
            type="text"
            placeholder="Dokument suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Dokumente durchsuchen"
          />
        </div>

        {/* New Document Button */}
        <button className="canvas-doc-list-new" onClick={onCreate}>
          + Neues Dokument
        </button>

        {/* Document List */}
        <div className="canvas-doc-list-items">
          {filteredDocs.length === 0 ? (
            <div className="canvas-doc-list-empty">
              {searchQuery ? 'Keine Dokumente gefunden' : 'Noch keine Dokumente'}
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className={`canvas-doc-list-item ${doc.id === activeDocumentId ? 'active' : ''}`}
                onClick={() => onSelect(doc.id)}
              >
                <div className="canvas-doc-list-item-info">
                  <span className="canvas-doc-list-item-icon">{getTypeIcon(doc.type)}</span>
                  <div className="canvas-doc-list-item-text">
                    <span className="canvas-doc-list-item-title">{doc.title}</span>
                    <span className="canvas-doc-list-item-meta">
                      {doc.type}{doc.language ? ` (${doc.language})` : ''} &middot; {formatDate(doc.updatedAt)}
                    </span>
                  </div>
                </div>
                <button
                  className="canvas-doc-list-item-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (deleteConfirm === doc.id) {
                      onDelete(doc.id);
                      setDeleteConfirm(null);
                    } else {
                      setDeleteConfirm(doc.id);
                      setTimeout(() => setDeleteConfirm(null), 3000);
                    }
                  }}
                  title={deleteConfirm === doc.id ? 'Nochmal klicken zum L\u00f6schen' : 'L\u00f6schen'}
                  aria-label="Dokument l\u00f6schen"
                >
                  {deleteConfirm === doc.id ? '\u2713?' : '\uD83D\uDDD1\uFE0F'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
