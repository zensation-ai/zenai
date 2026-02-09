/**
 * Document Vault Page
 *
 * Unified content management page with 3 tabs:
 * - Dokumente: File upload, search, filter, folders
 * - Editor: Canvas (markdown/code editor with AI chat)
 * - Medien: Image/video gallery
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentUpload } from './DocumentUpload';
import { DocumentCard } from './DocumentCard';
import { DocumentDetailModal } from './DocumentDetailModal';
import {
  Document,
  DocumentFilters,
  Folder,
  DocumentStats,
  DocumentUploadResult,
} from '../types/document';
import { SkeletonLoader } from './SkeletonLoader';
import './DocumentVaultPage.css';

const CanvasPage = lazy(() => import('./CanvasPage').then(m => ({ default: m.CanvasPage })));
const MediaGallery = lazy(() => import('./MediaGallery').then(m => ({ default: m.MediaGallery })));

type DocumentsTab = 'documents' | 'editor' | 'media';

interface DocumentVaultPageProps {
  onBack: () => void;
  context: 'personal' | 'work';
  initialTab?: DocumentsTab;
  onNavigate?: (page: string) => void;
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

const DOC_TABS: { id: DocumentsTab; label: string; icon: string }[] = [
  { id: 'documents', label: 'Wissen', icon: '📚' },
  { id: 'editor', label: 'Editor', icon: '✏️' },
  { id: 'media', label: 'Medien', icon: '🖼️' },
];

export function DocumentVaultPage({ onBack, context, initialTab = 'documents' }: DocumentVaultPageProps) {
  const navigate = useNavigate();
  const [activeDocTab, setActiveDocTab] = useState<DocumentsTab>(initialTab);

  useEffect(() => {
    setActiveDocTab(initialTab || 'documents');
  }, [initialTab]);

  const handleDocTabChange = (tab: DocumentsTab) => {
    setActiveDocTab(tab);
    if (tab === 'documents') {
      navigate('/documents', { replace: true });
    } else {
      navigate(`/documents/${tab}`, { replace: true });
    }
  };

  const renderDocTabs = () => (
    <div className="vault-doc-tabs" role="tablist">
      {DOC_TABS.map((tab) => (
        <button
          type="button"
          key={tab.id}
          role="tab"
          aria-selected={activeDocTab === tab.id}
          className={`vault-doc-tab ${activeDocTab === tab.id ? 'active' : ''}`}
          onClick={() => handleDocTabChange(tab.id)}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );

  if (activeDocTab === 'editor') {
    return (
      <div className="document-vault-page">
        {renderDocTabs()}
        <Suspense fallback={<SkeletonLoader type="card" count={2} />}>
          <CanvasPage context={context} onNavigate={() => {}} />
        </Suspense>
      </div>
    );
  }

  if (activeDocTab === 'media') {
    return (
      <div className="document-vault-page">
        {renderDocTabs()}
        <Suspense fallback={<SkeletonLoader type="card" count={2} />}>
          <MediaGallery context={context} onBack={() => handleDocTabChange('documents')} />
        </Suspense>
      </div>
    );
  }

  // Documents tab - original DocumentVault content follows
  return <DocumentVaultContent onBack={onBack} context={context} activeDocTab={activeDocTab} onDocTabChange={handleDocTabChange} />;
}

function DocumentVaultContent({ onBack, context, activeDocTab, onDocTabChange }: DocumentVaultPageProps & { activeDocTab: DocumentsTab; onDocTabChange: (tab: DocumentsTab) => void }) {
  const navigate = useNavigate();
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
    if (!newFolderName.trim()) return;

    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/folders`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
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
  }, [API_URL, API_KEY, context, newFolderName, selectedFolder, fetchFolders]);

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
    if (selectedDocuments.size === 0) return;
    if (!confirm(`${selectedDocuments.size} Dokument(e) wirklich löschen?`)) return;

    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/batch`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
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
  }, [API_URL, API_KEY, context, selectedDocuments, fetchStats]);

  // Batch move
  const handleBatchMove = useCallback(async (targetFolder: string) => {
    if (selectedDocuments.size === 0) return;

    try {
      const response = await fetch(
        `${API_URL}/api/${context}/documents/batch/move`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
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
  }, [API_URL, API_KEY, context, selectedDocuments, fetchDocuments, filters, fetchFolders]);

  // Load more
  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
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
          <button type="button" className="back-button" onClick={onBack} aria-label="Zurück">
            ←
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
              placeholder="Wissen durchsuchen..."
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
            className="ask-knowledge-btn neuro-hover-lift"
            onClick={() => navigate('/ai-workshop?mode=knowledge')}
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
      {selectedDocuments.size > 0 && (
        <div className="batch-action-bar">
          <div className="batch-info">
            <span className="batch-count">{selectedDocuments.size} ausgewählt</span>
            <button type="button" className="batch-select-all" onClick={selectAll}>
              Alle auswählen
            </button>
            <button type="button" className="batch-clear" onClick={clearSelection}>
              Auswahl aufheben
            </button>
          </div>
          <div className="batch-actions">
            <div className="batch-move-dropdown">
              <select
                aria-label="Dokumente verschieben"
                onChange={(e) => {
                  if (e.target.value) {
                    handleBatchMove(e.target.value);
                    e.target.value = '';
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>Verschieben nach...</option>
                {folders.map(folder => (
                  <option key={folder.id} value={folder.path}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="batch-delete-btn"
              onClick={handleBatchDelete}
            >
              🗑️ Löschen
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="vault-content">
        {/* Folder Sidebar */}
        <aside className="folder-sidebar">
          <div className="folder-header">
            <h2>Ordner</h2>
            <button
              type="button"
              className="create-folder-btn"
              onClick={() => setShowCreateFolder(true)}
              aria-label="Neuer Ordner"
            >
              +
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
              <h2>Wissen hochladen</h2>
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

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="create-folder-overlay" onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }}>
          <div className="create-folder-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Neuer Ordner</h3>
            <input
              type="text"
              className="folder-name-input"
              placeholder="Ordnername"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
              }}
              autoFocus
            />
            <p className="folder-location">Wird erstellt in: {selectedFolder}</p>
            <div className="create-folder-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="create-btn"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentVaultPage;
