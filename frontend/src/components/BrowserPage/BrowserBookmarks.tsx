/**
 * BrowserBookmarks - Bookmark management with folders
 */

import { useState, useCallback } from 'react';
import type { Bookmark, BookmarkFolder } from './types';

interface BrowserBookmarksProps {
  bookmarks: Bookmark[];
  total: number;
  folders: BookmarkFolder[];
  loading: boolean;
  onSearch: (query: string) => void;
  onFilterFolder: (folder: string) => void;
  onDelete: (id: string) => void;
  onOpen: (url: string) => void;
  onAdd: (data: { url: string; title?: string; folder?: string; tags?: string[] }) => Promise<Bookmark | null>;
}

export function BrowserBookmarks({
  bookmarks, total, folders, loading,
  onSearch, onFilterFolder, onDelete, onOpen, onAdd,
}: BrowserBookmarksProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newFolder, setNewFolder] = useState('Unsortiert');

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  }, [searchQuery, onSearch]);

  const handleFolderClick = useCallback((folder: string) => {
    if (activeFolder === folder) {
      setActiveFolder(null);
      onFilterFolder('');
    } else {
      setActiveFolder(folder);
      onFilterFolder(folder);
    }
  }, [activeFolder, onFilterFolder]);

  const handleAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;

    await onAdd({
      url: newUrl.trim(),
      title: newTitle.trim() || undefined,
      folder: newFolder,
    });

    setNewUrl('');
    setNewTitle('');
    setNewFolder('Unsortiert');
    setShowAddForm(false);
  }, [newUrl, newTitle, newFolder, onAdd]);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  };

  return (
    <div className="browser-bookmarks">
      {/* Toolbar */}
      <div className="browser-bookmarks-toolbar">
        <form className="browser-bookmarks-search" onSubmit={handleSearch}>
          <div className="browser-search-wrapper">
            <span className="browser-search-icon">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </span>
            <input
              type="text"
              placeholder="Lesezeichen durchsuchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="browser-bookmarks-search-input"
            />
          </div>
          <button type="submit" className="browser-bookmarks-search-btn">Suchen</button>
        </form>
        <button
          type="button"
          className="browser-bookmarks-add-btn"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Abbrechen' : '+ Lesezeichen'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <form className="browser-bookmarks-form" onSubmit={handleAdd}>
          <input
            type="url"
            placeholder="URL *"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            required
            className="browser-bookmarks-form-input"
          />
          <input
            type="text"
            placeholder="Titel (optional)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="browser-bookmarks-form-input"
          />
          <select
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            className="browser-bookmarks-form-select"
          >
            <option value="Unsortiert">Unsortiert</option>
            {folders.filter(f => f.folder !== 'Unsortiert').map(f => (
              <option key={f.folder} value={f.folder}>{f.folder}</option>
            ))}
          </select>
          <button type="submit" className="browser-bookmarks-form-submit">
            Speichern
          </button>
        </form>
      )}

      <div className="browser-bookmarks-layout">
        {/* Folder sidebar */}
        {folders.length > 0 && (
          <div className="browser-bookmarks-folders">
            <h3 className="browser-bookmarks-folders-title">Ordner</h3>
            <button
              type="button"
              className={`browser-bookmarks-folder ${!activeFolder ? 'active' : ''}`}
              onClick={() => { setActiveFolder(null); onFilterFolder(''); }}
            >
              <span>Alle</span>
              <span className="browser-bookmarks-folder-count">{total}</span>
            </button>
            {folders.map(folder => (
              <button
                key={folder.folder}
                type="button"
                className={`browser-bookmarks-folder ${activeFolder === folder.folder ? 'active' : ''}`}
                onClick={() => handleFolderClick(folder.folder)}
              >
                <span>{folder.folder}</span>
                <span className="browser-bookmarks-folder-count">{folder.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Bookmarks list */}
        <div className="browser-bookmarks-list">
          {loading && (
            <div className="browser-bookmarks-loading">Wird geladen...</div>
          )}

          {!loading && bookmarks.length === 0 && (
            <div className="browser-bookmarks-empty">
              <span className="browser-bookmarks-empty-icon">⭐</span>
              <p>Keine Lesezeichen vorhanden</p>
              <p className="browser-bookmarks-empty-hint">
                Speichere Webseiten als Lesezeichen, um sie schnell wiederzufinden
              </p>
            </div>
          )}

          {bookmarks.map(bookmark => (
            <div key={bookmark.id} className="browser-bookmarks-item">
              <div
                className="browser-bookmarks-item-main"
                onClick={() => onOpen(bookmark.url)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onOpen(bookmark.url)}
              >
                <div className="browser-bookmarks-item-title">
                  {bookmark.favicon_url && (
                    <img src={bookmark.favicon_url} alt="" className="browser-bookmarks-item-favicon" />
                  )}
                  {bookmark.title || bookmark.url}
                </div>
                <div className="browser-bookmarks-item-url">{bookmark.url}</div>
                {bookmark.description && (
                  <div className="browser-bookmarks-item-desc">{bookmark.description}</div>
                )}
                {bookmark.ai_summary && (
                  <div className="browser-bookmarks-item-summary">{bookmark.ai_summary}</div>
                )}
                <div className="browser-bookmarks-item-meta">
                  <span className="browser-bookmarks-item-folder">{bookmark.folder}</span>
                  <span className="browser-bookmarks-item-date">{formatDate(bookmark.created_at)}</span>
                  {bookmark.tags.length > 0 && (
                    <span className="browser-bookmarks-item-tags">
                      {bookmark.tags.map(tag => (
                        <span key={tag} className="browser-bookmarks-tag">{tag}</span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="browser-bookmarks-item-delete"
                onClick={() => onDelete(bookmark.id)}
                aria-label="Lesezeichen loeschen"
                title="Loeschen"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
