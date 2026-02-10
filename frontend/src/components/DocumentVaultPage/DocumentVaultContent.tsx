/**
 * Document Vault Content
 *
 * The inner "documents" tab content: state management, API calls,
 * folder sidebar, document grid/list, upload modal, detail modal.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentUpload } from '../DocumentUpload';
import { DocumentCard } from '../DocumentCard';
import { DocumentDetailModal } from '../DocumentDetailModal';
import {
  Document,
  DocumentFilters,
  DocumentStats,
  DocumentUploadResult,
} from '../../types/document';
import { DocumentsTab, DocumentVaultPageProps, DOC_TABS } from './types';
import { FolderSidebar } from './FolderSidebar';
import { BatchActionBar } from './BatchActionBar';
import { getApiBaseUrl, getApiFetchHeaders } from '../../utils/apiConfig';
import '../DocumentVaultPage.css';
import type { Folder } from '../../types/document';
import type { ViewMode } from './types';

interface DocumentVaultContentProps extends DocumentVaultPageProps {
  activeDocTab: DocumentsTab;
  onDocTabChange: (tab: DocumentsTab) => void;
}

export function DocumentVaultContent({ onBack, context, activeDocTab, onDocTabChange }: DocumentVaultContentProps) {
  const contentNavigate = useNavigate();
  // State
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showUpload, setShowUpload] = useState(false);
  const [showMobileFolders, setShowMobileFolders] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('/');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [detailDocument, setDetailDocument] = useState<Document | null>(null);

  // Filters
  const [filters, setFilters] = useState<DocumentFilters>({
    folderPath: '/',
    limit: 50,
    offset: 0,
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  // Pagination
  const [hasMore, setHasMore] = useState(false);
  const [, setTotal] = useState(0);

  const API_URL = getApiBaseUrl();

  // Fetch documents
  const fetchDocuments = useCallback(async (currentFilters: DocumentFilters) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (currentFilters.folderPath) { params.set('folderPath', currentFilters.folderPath); }
      if (currentFilters.search) { params.set('search', currentFilters.search); }
      if (currentFilters.limit) { params.set('limit', currentFilters.limit.toString()); }
      if (currentFilters.offset) { params.set('offset', currentFilters.offset.toString()); }
      if (currentFilters.sortBy) { params.set('sortBy', currentFilters.sortBy); }
      if (currentFilters.sortOrder) { params.set('sortOrder', currentFilters.sortOrder); }
      if (currentFilters.favorites) { params.set('favorites', 'true'); }
      if (currentFilters.archived) { params.set('archived', 'true'); }

      const response = await fetch(
        `${API_URL}/api/${context}/documents?${params.toString()}`,
        {
          headers: getApiFetchHeaders(),
        }
      );

      const result = await response.json();

      if (result.success) {
        setDocuments(result.data);
        setHasMore(result.pagination.hasMore);
        setTotal(result.pagination.total);
      } else {
        throw new Error(result.error?.message || 'Fehler beim Laden');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, [API_URL,context]);

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/folders`,
        {
          headers: getApiFetchHeaders(),
        }
      );

      const result = await response.json();
      if (result.success) {
        setFolders(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    }
  }, [API_URL,context]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/stats`,
        {
          headers: getApiFetchHeaders(),
        }
      );

      const result = await response.json();
      if (result.success) {
        setStats(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, [API_URL,context]);

  // Initial load
  useEffect(() => {
    fetchDocuments(filters);
    fetchFolders();
    fetchStats();
  }, [fetchDocuments, fetchFolders, fetchStats, filters]);

  // Keyboard event handler for closing modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (detailDocument) {
          setDetailDocument(null);
        } else if (showUpload) {
          setShowUpload(false);
        } else if (showCreateFolder) {
          setShowCreateFolder(false);
          setNewFolderName('');
        } else if (showMobileFolders) {
          setShowMobileFolders(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showUpload, showMobileFolders, showCreateFolder, detailDocument]);

  // Create new folder
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) { return; }

    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/folders`,
        {
          method: 'POST',
          headers: {
            ...getApiFetchHeaders('application/json'),
          },
          body: JSON.stringify({
            name: newFolderName.trim(),
            parentPath: selectedFolder === '/' ? '/' : selectedFolder,
          }),
        }
      );

      const result = await response.json();
      if (result.success) {
        fetchFolders();
        setShowCreateFolder(false);
        setNewFolderName('');
      }
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }, [API_URL,context, newFolderName, selectedFolder, fetchFolders]);

  // Handle document update from detail modal
  const handleDocumentUpdate = useCallback((updatedDoc: Document) => {
    setDocuments(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d));
    setDetailDocument(updatedDoc);
  }, []);

  // Handle document deletion from detail modal
  const handleDocumentDeleted = useCallback(() => {
    if (detailDocument) {
      setDocuments(prev => prev.filter(d => d.id !== detailDocument.id));
      setDetailDocument(null);
      fetchStats();
    }
  }, [detailDocument, fetchStats]);

  // Handle folder change
  const handleFolderChange = useCallback((path: string) => {
    setSelectedFolder(path);
    setFilters(prev => ({ ...prev, folderPath: path, offset: 0 }));
    setShowMobileFolders(false); // Close mobile drawer on selection
  }, []);

  // Handle search
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);

    if (query.trim()) {
      // Use semantic search endpoint
      fetch(`${API_URL}/api/${context}/documents/search`, {
        method: 'POST',
        headers: {
          ...getApiFetchHeaders('application/json'),
        },
        body: JSON.stringify({ query, limit: 50 }),
      })
        .then(res => res.json())
        .then(result => {
          if (result.success) {
            // Convert search results to document format
            setDocuments(result.data.map((r: { id: string; title: string; summary: string; mimeType: string; folderPath: string; similarity: number }) => ({
              ...r,
              // Search results have less data, fill with defaults
              originalFilename: r.title,
              keywords: [],
              tags: [],
              processingStatus: 'completed',
              viewCount: 0,
              isFavorite: false,
              isArchived: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })));
            setTotal(result.data.length);
            setHasMore(false);
          }
        })
        .catch(console.error);
    } else {
      // Clear search, reload normal list
      fetchDocuments(filters);
    }
  }, [API_URL,context, filters, fetchDocuments]);

  // Handle upload complete
  const handleUploadComplete = useCallback((_result: DocumentUploadResult) => {
    setShowUpload(false);
    fetchDocuments(filters);
    fetchStats();
  }, [fetchDocuments, fetchStats, filters]);

  // Handle document delete
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Dokument wirklich l\u00f6schen?')) { return; }

    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/${id}`,
        {
          method: 'DELETE',
          headers: getApiFetchHeaders(),
        }
      );

      const result = await response.json();
      if (result.success) {
        setDocuments(prev => prev.filter(d => d.id !== id));
        setTotal(prev => prev - 1);
        fetchStats();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [API_URL,context, fetchStats]);

  // Handle toggle favorite
  const handleToggleFavorite = useCallback(async (doc: Document) => {
    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/${doc.id}`,
        {
          method: 'PUT',
          headers: {
            ...getApiFetchHeaders('application/json'),
          },
          body: JSON.stringify({ isFavorite: !doc.isFavorite }),
        }
      );

      const result = await response.json();
      if (result.success) {
        setDocuments(prev =>
          prev.map(d => d.id === doc.id ? { ...d, isFavorite: !d.isFavorite } : d)
        );
      }
    } catch (err) {
      console.error('Toggle favorite failed:', err);
    }
  }, [API_URL,context]);

  // Handle document selection
  const toggleSelection = useCallback((id: string, selected: boolean) => {
    setSelectedDocuments(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  // Select all visible documents
  const selectAll = useCallback(() => {
    setSelectedDocuments(new Set(documents.map(d => d.id)));
  }, [documents]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedDocuments(new Set());
  }, []);

  // Batch delete
  const handleBatchDelete = useCallback(async () => {
    if (selectedDocuments.size === 0) { return; }
    if (!confirm(`${selectedDocuments.size} Dokument(e) wirklich l\u00f6schen?`)) { return; }

    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/batch`,
        {
          method: 'DELETE',
          headers: {
            ...getApiFetchHeaders('application/json'),
          },
          body: JSON.stringify({ ids: Array.from(selectedDocuments) }),
        }
      );

      const result = await response.json();
      if (result.success) {
        setDocuments(prev => prev.filter(d => !selectedDocuments.has(d.id)));
        setSelectedDocuments(new Set());
        fetchStats();
      }
    } catch (err) {
      console.error('Batch delete failed:', err);
    }
  }, [API_URL,context, selectedDocuments, fetchStats]);

  // Batch move
  const handleBatchMove = useCallback(async (targetFolder: string) => {
    if (selectedDocuments.size === 0) { return; }

    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/batch/move`,
        {
          method: 'POST',
          headers: {
            ...getApiFetchHeaders('application/json'),
          },
          body: JSON.stringify({
            ids: Array.from(selectedDocuments),
            folderPath: targetFolder,
          }),
        }
      );

      const result = await response.json();
      if (result.success) {
        // Refresh documents
        fetchDocuments(filters);
        setSelectedDocuments(new Set());
        fetchFolders();
      }
    } catch (err) {
      console.error('Batch move failed:', err);
    }
  }, [API_URL,context, selectedDocuments, fetchDocuments, filters, fetchFolders]);

  // Load more
  const loadMore = useCallback(() => {
    if (!hasMore || loading) { return; }
    setFilters(prev => ({ ...prev, offset: (prev.offset || 0) + (prev.limit || 50) }));
  }, [hasMore, loading]);

  return (
    <div className="document-vault-page">
      {/* Document Tabs */}
      <div className="vault-doc-tabs" role="tablist">
        {DOC_TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            role="tab"
            aria-selected={activeDocTab === tab.id}
            className={`vault-doc-tab ${activeDocTab === tab.id ? 'active' : ''}`}
            onClick={() => onDocTabChange(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Header */}
      <header className="vault-header">
        <div className="header-left">
          <button type="button" className="back-button" onClick={onBack} aria-label="Zur\u00fcck">
            \u2190
          </button>
          <h1>Wissensbasis</h1>
          <span className="context-badge">{context}</span>
          <button
            type="button"
            className="mobile-folder-toggle"
            onClick={() => setShowMobileFolders(true)}
            aria-label="Ordner anzeigen"
          >
            📁
          </button>
        </div>

        <div className="header-actions">
          <div className="search-box">
            <input
              type="text"
              placeholder="Dokumente durchsuchen..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear"
                onClick={() => handleSearch('')}
                aria-label="Suche l\u00f6schen"
              >
                ✕
              </button>
            )}
          </div>

          <div className="view-toggle">
            <button
              type="button"
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
              aria-label="Grid-Ansicht"
            >
              \u229e
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
              aria-label="Listen-Ansicht"
            >
              \u2630
            </button>
          </div>

          <button
            type="button"
            className="upload-trigger neuro-hover-lift"
            onClick={() => contentNavigate('/ai-workshop/voice-chat')}
            style={{
              background: 'linear-gradient(135deg, var(--accent, #0ea5e9), var(--info, #06b6d4))',
              color: '#fff',
            }}
          >
            Frag dein Wissen
          </button>

          <button
            type="button"
            className="upload-trigger neuro-hover-lift"
            onClick={() => setShowUpload(true)}
          >
            + Hochladen
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      {stats && (
        <div className="stats-bar">
          <div className="stat">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Dokumente</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.completed}</span>
            <span className="stat-label">Verarbeitet</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.pending + stats.processing}</span>
            <span className="stat-label">Wartend</span>
          </div>
          {stats.failed > 0 && (
            <div className="stat error">
              <span className="stat-value">{stats.failed}</span>
              <span className="stat-label">Fehler</span>
            </div>
          )}
        </div>
      )}

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedDocuments.size}
        onSelectAll={selectAll}
        onClear={clearSelection}
        onBatchDelete={handleBatchDelete}
        onBatchMove={handleBatchMove}
        folders={folders}
      />

      {/* Main Content */}
      <div className="vault-content">
        {/* Folder Sidebar + Mobile Drawer + Create Folder Modal */}
        <FolderSidebar
          folders={folders}
          selectedFolder={selectedFolder}
          onFolderChange={handleFolderChange}
          showCreateFolder={showCreateFolder}
          setShowCreateFolder={setShowCreateFolder}
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
          onCreateFolder={handleCreateFolder}
          showMobileFolders={showMobileFolders}
          setShowMobileFolders={setShowMobileFolders}
        />

        {/* Document Grid/List */}
        <main className="document-area">
          {loading && documents.length === 0 ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Dokumente werden geladen...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <p>❌ {error}</p>
              <button type="button" onClick={() => fetchDocuments(filters)}>
                Erneut versuchen
              </button>
            </div>
          ) : documents.length === 0 ? (
            <div className="empty-state neuro-empty-state">
              <div className="empty-icon">📭</div>
              <h3>Keine Dokumente</h3>
              <p>
                {searchQuery
                  ? 'Keine Dokumente gefunden. Versuche eine andere Suche.'
                  : 'Lade dein erstes Dokument hoch!'}
              </p>
              {!searchQuery && (
                <button
                  type="button"
                  className="empty-action neuro-hover-lift"
                  onClick={() => setShowUpload(true)}
                >
                  Dokument hochladen
                </button>
              )}
            </div>
          ) : (
            <>
              <div className={`document-${viewMode}`}>
                {documents.map(doc => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    viewMode={viewMode}
                    selected={selectedDocuments.has(doc.id)}
                    onSelect={(selected) => toggleSelection(doc.id, selected)}
                    onClick={() => setDetailDocument(doc)}
                    onDelete={() => handleDelete(doc.id)}
                    onToggleFavorite={() => handleToggleFavorite(doc)}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="load-more">
                  <button
                    type="button"
                    className="load-more-button"
                    onClick={loadMore}
                    disabled={loading}
                  >
                    {loading ? 'L\u00e4dt...' : 'Mehr laden'}
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="upload-modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Dokumente hochladen</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowUpload(false)}
                aria-label="Schlie\u00dfen"
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              <DocumentUpload
                context={context}
                folderPath={selectedFolder}
                onUploadComplete={handleUploadComplete}
              />
            </div>
          </div>
        </div>
      )}

      {/* Document Detail Modal */}
      {detailDocument && (
        <DocumentDetailModal
          doc={detailDocument}
          context={context}
          onClose={() => setDetailDocument(null)}
          onUpdate={handleDocumentUpdate}
          onDelete={handleDocumentDeleted}
        />
      )}
    </div>
  );
}
