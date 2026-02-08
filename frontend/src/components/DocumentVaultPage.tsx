/**
 * Document Vault Page
 *
 * Main page component for document management.
 * Features: Upload, Search, Filter, Grid/List view, Folders
 */

import { useState, useEffect, useCallback } from 'react';
import { DocumentUpload } from './DocumentUpload';
import { DocumentCard } from './DocumentCard';
import {
  Document,
  DocumentFilters,
  Folder,
  DocumentStats,
  DocumentUploadResult,
} from '../types/document';
import './DocumentVaultPage.css';

interface DocumentVaultPageProps {
  onBack: () => void;
  context: 'personal' | 'work';
}

type ViewMode = 'grid' | 'list';

// Folder icon mapping
const FOLDER_ICONS: Record<string, string> = {
  'folder': '📁',
  'inbox': '📥',
  'archive': '📦',
  'briefcase': '💼',
  'file-text': '📝',
  'receipt': '🧾',
};

function getFolderIcon(icon?: string): string {
  return icon ? (FOLDER_ICONS[icon] || '📁') : '📁';
}

export function DocumentVaultPage({ onBack, context }: DocumentVaultPageProps) {
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
  const [selectedFolder, setSelectedFolder] = useState<string>('/');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());

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

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const API_KEY = import.meta.env.VITE_API_KEY || '';

  // Fetch documents
  const fetchDocuments = useCallback(async (currentFilters: DocumentFilters) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (currentFilters.folderPath) params.set('folderPath', currentFilters.folderPath);
      if (currentFilters.search) params.set('search', currentFilters.search);
      if (currentFilters.limit) params.set('limit', currentFilters.limit.toString());
      if (currentFilters.offset) params.set('offset', currentFilters.offset.toString());
      if (currentFilters.sortBy) params.set('sortBy', currentFilters.sortBy);
      if (currentFilters.sortOrder) params.set('sortOrder', currentFilters.sortOrder);
      if (currentFilters.favorites) params.set('favorites', 'true');
      if (currentFilters.archived) params.set('archived', 'true');

      const response = await fetch(
        `${API_URL}/api/${context}/documents?${params.toString()}`,
        {
          headers: { 'X-API-Key': API_KEY },
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
  }, [API_URL, API_KEY, context]);

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/folders`,
        {
          headers: { 'X-API-Key': API_KEY },
        }
      );

      const result = await response.json();
      if (result.success) {
        setFolders(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    }
  }, [API_URL, API_KEY, context]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/stats`,
        {
          headers: { 'X-API-Key': API_KEY },
        }
      );

      const result = await response.json();
      if (result.success) {
        setStats(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, [API_URL, API_KEY, context]);

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
        if (showUpload) {
          setShowUpload(false);
        } else if (showMobileFolders) {
          setShowMobileFolders(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showUpload, showMobileFolders]);

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
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
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
  }, [API_URL, API_KEY, context, filters, fetchDocuments]);

  // Handle upload complete
  const handleUploadComplete = useCallback((_result: DocumentUploadResult) => {
    setShowUpload(false);
    fetchDocuments(filters);
    fetchStats();
  }, [fetchDocuments, fetchStats, filters]);

  // Handle document delete
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Dokument wirklich löschen?')) return;

    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/${id}`,
        {
          method: 'DELETE',
          headers: { 'X-API-Key': API_KEY },
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
  }, [API_URL, API_KEY, context, fetchStats]);

  // Handle toggle favorite
  const handleToggleFavorite = useCallback(async (doc: Document) => {
    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/${doc.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
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
  }, [API_URL, API_KEY, context]);

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

  // Load more
  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    setFilters(prev => ({ ...prev, offset: (prev.offset || 0) + (prev.limit || 50) }));
  }, [hasMore, loading]);

  return (
    <div className="document-vault-page">
      {/* Header */}
      <header className="vault-header">
        <div className="header-left">
          <button type="button" className="back-button" onClick={onBack} aria-label="Zurück">
            ←
          </button>
          <h1>Document Vault</h1>
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
                aria-label="Suche löschen"
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
              ⊞
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
              aria-label="Listen-Ansicht"
            >
              ☰
            </button>
          </div>

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

      {/* Main Content */}
      <div className="vault-content">
        {/* Folder Sidebar */}
        <aside className="folder-sidebar">
          <h2>Ordner</h2>
          <nav className="folder-list">
            {folders.map(folder => (
              <button
                key={folder.id}
                type="button"
                className={`folder-item ${selectedFolder === folder.path ? 'active' : ''}`}
                onClick={() => handleFolderChange(folder.path)}
              >
                <span className="folder-icon">{getFolderIcon(folder.icon)}</span>
                <span className="folder-name">{folder.name}</span>
                <span className="folder-count">{folder.documentCount}</span>
              </button>
            ))}
          </nav>
        </aside>

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
                    onClick={() => {
                      // Open document detail modal (TODO)
                      console.log('Open document:', doc.id);
                    }}
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
                    {loading ? 'Lädt...' : 'Mehr laden'}
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Folder Drawer */}
      <div
        className={`folder-drawer-overlay ${showMobileFolders ? 'open' : ''}`}
        onClick={() => setShowMobileFolders(false)}
      >
        <div
          className={`folder-drawer ${showMobileFolders ? 'open' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="folder-drawer-header">
            <h2>Ordner</h2>
            <button
              type="button"
              className="folder-drawer-close"
              onClick={() => setShowMobileFolders(false)}
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
          <nav className="folder-list">
            {folders.map(folder => (
              <button
                key={folder.id}
                type="button"
                className={`folder-item ${selectedFolder === folder.path ? 'active' : ''}`}
                onClick={() => handleFolderChange(folder.path)}
              >
                <span className="folder-icon">{getFolderIcon(folder.icon)}</span>
                <span className="folder-name">{folder.name}</span>
                <span className="folder-count">{folder.documentCount}</span>
              </button>
            ))}
          </nav>
        </div>
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
                aria-label="Schließen"
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
    </div>
  );
}

export default DocumentVaultPage;
