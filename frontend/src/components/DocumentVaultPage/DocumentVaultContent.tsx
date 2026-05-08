/**
 * Document Vault Content
 *
 * The inner "documents" tab content: state management, API calls,
 * folder sidebar, document grid/list, upload modal, detail modal.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText } from 'lucide-react';
import axios from 'axios';
import { logError } from '../../utils/errors';
import { showToast } from '../Toast';
import { useEscapeKey } from '../../hooks/useClickOutside';
import { useNavigate } from 'react-router-dom';
import { DocumentUpload } from '../DocumentUpload';
import { DocumentCard } from '../DocumentCard';
import { DocumentDetailModal } from '../DocumentDetailModal';
import { SmartPageSkeleton } from '../skeletons/PageSkeletons';
import { QueryErrorState } from '../QueryErrorState';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Document,
  DocumentFilters,
  DocumentStats,
  DocumentUploadResult,
} from '../../types/document';
import { FolderSidebar } from './FolderSidebar';
import { BatchActionBar } from './BatchActionBar';
import type { Folder } from '../../types/document';
import type { ViewMode } from './types';
import type { AIContext } from '../ContextSwitcher';
import { useConfirm } from '../ConfirmDialog';

interface DocumentVaultContentProps {
  context: AIContext;
}

export function DocumentVaultContent({ context }: DocumentVaultContentProps) {
  const contentNavigate = useNavigate();
  const confirmDialog = useConfirm();
  // State
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showUpload, setShowUpload] = useState(false);
  useEscapeKey(() => setShowUpload(false), showUpload);
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

  // Debounce timer for search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Fetch documents (append=true for load-more pagination)
  const fetchDocuments = useCallback(async (currentFilters: DocumentFilters, append = false) => {
    setLoading(true);
    if (!append) setError(null);

    try {
      const params: Record<string, string> = {};
      if (currentFilters.folderPath) { params.folderPath = currentFilters.folderPath; }
      if (currentFilters.search) { params.search = currentFilters.search; }
      if (currentFilters.limit) { params.limit = currentFilters.limit.toString(); }
      if (currentFilters.offset) { params.offset = currentFilters.offset.toString(); }
      if (currentFilters.sortBy) { params.sortBy = currentFilters.sortBy; }
      if (currentFilters.sortOrder) { params.sortOrder = currentFilters.sortOrder; }
      if (currentFilters.favorites) { params.favorites = 'true'; }
      if (currentFilters.archived) { params.archived = 'true'; }

      const response = await axios.get(`/api/${context}/documents`, { params });
      const result = response.data;

      if (result.success) {
        setDocuments(prev => append ? [...prev, ...result.data] : result.data);
        setHasMore(result.pagination.hasMore);
      } else {
        throw new Error(result.error?.message || 'Fehler beim Laden');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, [context]);

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    try {
      const response = await axios.get(`/api/${context}/documents/folders`);
      if (response.data.success) {
        setFolders(response.data.data);
      }
    } catch (err) {
      logError('DocumentVault.fetchFolders', err);
    }
  }, [context]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get(`/api/${context}/documents/stats`);
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (err) {
      logError('DocumentVault.fetchStats', err);
    }
  }, [context]);

  // Initial load + reload on folder/sort changes (but NOT offset changes from loadMore)
  const prevFolderRef = useRef(filters.folderPath);
  const prevSortRef = useRef(filters.sortBy);
  useEffect(() => {
    // Skip if only offset changed (loadMore handles that with append)
    if (prevFolderRef.current === filters.folderPath && prevSortRef.current === filters.sortBy && (filters.offset || 0) > 0) {
      return;
    }
    prevFolderRef.current = filters.folderPath;
    prevSortRef.current = filters.sortBy;
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
      const response = await axios.post(`/api/${context}/documents/folders`, {
        name: newFolderName.trim(),
        parentPath: selectedFolder === '/' ? '/' : selectedFolder,
      });

      if (response.data.success) {
        fetchFolders();
        setShowCreateFolder(false);
        setNewFolderName('');
      }
    } catch (err) {
      logError('DocumentVault.createFolder', err);
    }
  }, [context, newFolderName, selectedFolder, fetchFolders]);

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

  // Handle search with debounce (300ms)
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);

    // Clear previous debounce timer
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (!query.trim()) {
      // Clear search immediately, reload normal list
      fetchDocuments(filters);
      return;
    }

    // Debounce the actual search
    searchTimerRef.current = setTimeout(async () => {
      try {
        const response = await axios.post(`/api/${context}/documents/search`, { query, limit: 50 });
        const result = response.data;
        if (result.success) {
          setDocuments(result.data.map((r: Record<string, unknown>) => ({
            id: r.id,
            title: r.title || r.originalFilename || 'Ohne Titel',
            originalFilename: r.originalFilename || r.title || 'Ohne Titel',
            summary: r.summary || '',
            mimeType: r.mimeType || 'application/octet-stream',
            fileSize: r.fileSize || 0,
            folderPath: r.folderPath || '/',
            keywords: r.keywords || [],
            tags: r.tags || [],
            processingStatus: r.processingStatus || 'completed',
            viewCount: r.viewCount || 0,
            isFavorite: r.isFavorite || false,
            isArchived: r.isArchived || false,
            createdAt: r.createdAt || r.created_at || new Date().toISOString(),
            updatedAt: r.updatedAt || r.updated_at || new Date().toISOString(),
            similarity: r.similarity,
          })));
          setHasMore(false);
        }
      } catch (err) {
        logError('DocumentVault.search', err);
      }
    }, 300);
  }, [context, filters, fetchDocuments]);

  // Handle upload complete
  const handleUploadComplete = useCallback((_result: DocumentUploadResult) => {
    setShowUpload(false);
    fetchDocuments(filters);
    fetchStats();
  }, [fetchDocuments, fetchStats, filters]);

  // Handle document delete
  const handleDelete = useCallback(async (id: string) => {
    const confirmed = await confirmDialog({ title: 'Löschen', message: 'Dokument wirklich löschen?', confirmText: 'Löschen', variant: 'danger' });
    if (!confirmed) { return; }

    try {
      const response = await axios.delete(`/api/${context}/documents/${id}`);
      if (response.data.success) {
        setDocuments(prev => prev.filter(d => d.id !== id));
        fetchStats();
      }
    } catch (err) {
      logError('DocumentVault.delete', err);
      showToast('Dokument konnte nicht gelöscht werden', 'error');
    }
  }, [context, fetchStats]);

  // Handle toggle favorite
  const handleToggleFavorite = useCallback(async (doc: Document) => {
    try {
      const response = await axios.put(`/api/${context}/documents/${doc.id}`, { isFavorite: !doc.isFavorite });
      if (response.data.success) {
        setDocuments(prev =>
          prev.map(d => d.id === doc.id ? { ...d, isFavorite: !d.isFavorite } : d)
        );
      }
    } catch (err) {
      logError('DocumentVault.toggleFavorite', err);
      showToast('Favorit konnte nicht geändert werden', 'error');
    }
  }, [context]);

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
    const confirmed = await confirmDialog({ title: 'Löschen', message: `${selectedDocuments.size} Dokument(e) wirklich löschen?`, confirmText: 'Löschen', variant: 'danger' });
    if (!confirmed) { return; }

    try {
      const response = await axios.delete(`/api/${context}/documents/batch`, { data: { ids: Array.from(selectedDocuments) } });
      if (response.data.success) {
        setDocuments(prev => prev.filter(d => !selectedDocuments.has(d.id)));
        setSelectedDocuments(new Set());
        fetchStats();
      }
    } catch (err) {
      logError('DocumentVault.batchDelete', err);
      showToast('Dokumente konnten nicht gelöscht werden', 'error');
    }
  }, [context, selectedDocuments, fetchStats]);

  // Batch move
  const handleBatchMove = useCallback(async (targetFolder: string) => {
    if (selectedDocuments.size === 0) { return; }

    try {
      const response = await axios.post(`/api/${context}/documents/batch/move`, {
        ids: Array.from(selectedDocuments),
        folderPath: targetFolder,
      });
      if (response.data.success) {
        fetchDocuments(filters);
        setSelectedDocuments(new Set());
        fetchFolders();
      }
    } catch (err) {
      logError('DocumentVault.batchMove', err);
      showToast('Verschieben fehlgeschlagen', 'error');
    }
  }, [context, selectedDocuments, fetchDocuments, filters, fetchFolders]);

  // Load more (append to existing documents)
  const loadMore = useCallback(() => {
    if (!hasMore || loading) { return; }
    const newOffset = (filters.offset || 0) + (filters.limit || 50);
    const newFilters = { ...filters, offset: newOffset };
    setFilters(newFilters);
    fetchDocuments(newFilters, true);
  }, [hasMore, loading, filters, fetchDocuments]);

  return (
    <div className="flex flex-col h-full bg-bg text-text relative overflow-hidden">
      {/* Toolbar */}
      <div role="toolbar" aria-label="Dokumenten-Werkzeuge" className="flex items-center justify-between px-6 py-4 bg-glass-bg border-b border-glass-border shrink-0 max-md:flex-col max-md:gap-4 max-md:px-4 max-[480px]:px-3 max-[480px]:gap-3">
        <div className="flex items-center gap-4 max-md:w-full max-md:justify-between">
          <button
            type="button"
            className="hidden max-md:flex items-center justify-center w-10 h-10 bg-glass-bg border border-glass-border rounded-sm text-text text-xl cursor-pointer transition-all hover:bg-surface-hover hover:border-primary"
            onClick={() => setShowMobileFolders(true)}
            aria-label="Ordner anzeigen"
          >
            📁
          </button>
        </div>

        <div className="flex items-center gap-4 max-md:w-full max-md:flex-wrap">
          <div className="relative max-md:flex-1 max-md:min-w-[200px] max-[480px]:min-w-0 max-[480px]:w-full">
            <input
              type="text"
              placeholder="Dokumente durchsuchen..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-70 px-4 py-2.5 pr-10 bg-glass-bg border border-glass-border rounded-sm text-text text-sm transition-all placeholder:text-text-muted focus:outline-none focus:border-primary focus:bg-surface-hover max-md:w-full max-md:text-base max-md:min-h-11"
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-transparent border-none text-text-secondary cursor-pointer text-sm"
                onClick={() => handleSearch('')}
                aria-label="Suche löschen"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex bg-glass-bg rounded-sm overflow-hidden">
            <button
              type="button"
              className={cn(
                'px-3 py-2 bg-transparent border-none text-text-secondary text-lg cursor-pointer transition-all hover:bg-surface-hover max-[480px]:min-w-10 max-[480px]:min-h-10',
                viewMode === 'grid' && 'bg-primary/10 text-primary'
              )}
              onClick={() => setViewMode('grid')}
              aria-label="Grid-Ansicht"
            >
              ⊞
            </button>
            <button
              type="button"
              className={cn(
                'px-3 py-2 bg-transparent border-none text-text-secondary text-lg cursor-pointer transition-all hover:bg-surface-hover max-[480px]:min-w-10 max-[480px]:min-h-10',
                viewMode === 'list' && 'bg-primary/10 text-primary'
              )}
              onClick={() => setViewMode('list')}
              aria-label="Listen-Ansicht"
            >
              ☰
            </button>
          </div>

          <Button
            variant="default"
            className="hover:-translate-y-0.5 transition-transform bg-gradient-to-br from-[var(--accent,#0ea5e9)] to-[var(--info,#06b6d4)] text-white max-md:min-h-11"
            onClick={() => contentNavigate('/my-ai/voice-chat')}
          >
            Frag dein Wissen
          </Button>

          <Button
            variant="default"
            className="hover:-translate-y-0.5 transition-transform max-md:min-h-11"
            onClick={() => setShowUpload(true)}
          >
            + Hochladen
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="flex gap-8 px-6 py-3 bg-glass-bg border-b border-glass-border shrink-0 max-md:flex-wrap max-md:gap-4 max-md:px-4 max-[480px]:px-3 max-[480px]:gap-3">
          <div className="flex flex-col gap-0.5 max-md:min-w-20">
            <span className="text-xl font-bold text-text max-[480px]:text-base">{stats.total}</span>
            <span className="text-xs text-text-secondary">Dokumente</span>
          </div>
          <div className="flex flex-col gap-0.5 max-md:min-w-20">
            <span className="text-xl font-bold text-text max-[480px]:text-base">{stats.completed}</span>
            <span className="text-xs text-text-secondary">Verarbeitet</span>
          </div>
          <div className="flex flex-col gap-0.5 max-md:min-w-20">
            <span className="text-xl font-bold text-text max-[480px]:text-base">{stats.pending + stats.processing}</span>
            <span className="text-xs text-text-secondary">Wartend</span>
          </div>
          {stats.failed > 0 && (
            <div className="flex flex-col gap-0.5 max-md:min-w-20">
              <span className="text-xl font-bold text-destructive max-[480px]:text-base">{stats.failed}</span>
              <span className="text-xs text-text-secondary">Fehler</span>
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
      <div className="flex flex-1 overflow-hidden">
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
        <main className="flex-1 p-6 overflow-y-auto max-md:p-4 max-[480px]:p-3">
          {loading && documents.length === 0 ? (
            <SmartPageSkeleton />
          ) : error ? (
            <QueryErrorState
              error={new Error(error)}
              refetch={() => fetchDocuments(filters)}
            />
          ) : documents.length === 0 ? (
            <EmptyState
              icon={<FileText size={40} strokeWidth={1.5} />}
              title={searchQuery ? 'Keine Dokumente gefunden' : 'Keine Dokumente'}
              description={
                searchQuery
                  ? 'Versuche eine andere Suchanfrage.'
                  : 'Lade Dokumente hoch und die KI macht sie durchsuchbar.'
              }
              action={
                !searchQuery ? (
                  <Button variant="default" size="sm" onClick={() => setShowUpload(true)}>
                    Dokument hochladen
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className={cn(
                viewMode === 'grid'
                  ? 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 max-md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] max-[480px]:grid-cols-1'
                  : 'flex flex-col gap-2'
              )}>
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
                <div className="flex justify-center py-6">
                  <button
                    type="button"
                    className="px-6 py-2.5 bg-glass-bg border border-glass-border rounded-sm text-text cursor-pointer transition-all hover:bg-surface-hover hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowUpload(false)} role="presentation">
          <div className="w-[90%] max-w-[600px] max-h-[80vh] bg-surface border border-glass-border rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Dokumente hochladen">
            <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border">
              <h2 className="m-0 text-xl">Dokumente hochladen</h2>
              <button
                type="button"
                className="w-8 h-8 bg-transparent border-none text-text-secondary text-xl cursor-pointer rounded-sm transition-colors hover:bg-surface-hover"
                onClick={() => setShowUpload(false)}
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
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
