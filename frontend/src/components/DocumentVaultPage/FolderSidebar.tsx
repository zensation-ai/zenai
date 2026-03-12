/**
 * Folder Sidebar & Mobile Folder Drawer
 *
 * Desktop: renders as a sidebar (<aside>).
 * Mobile: renders as a slide-in drawer overlay.
 */

import { Folder } from '../../types/document';
import { getFolderIcon } from './types';
import { useEscapeKey } from '../../hooks/useClickOutside';

export interface FolderSidebarProps {
  folders: Folder[];
  selectedFolder: string;
  onFolderChange: (path: string) => void;
  showCreateFolder: boolean;
  setShowCreateFolder: (show: boolean) => void;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  onCreateFolder: () => void;
  showMobileFolders: boolean;
  setShowMobileFolders: (show: boolean) => void;
}

export function FolderSidebar({
  folders,
  selectedFolder,
  onFolderChange,
  showCreateFolder,
  setShowCreateFolder,
  newFolderName,
  setNewFolderName,
  onCreateFolder,
  showMobileFolders,
  setShowMobileFolders,
}: FolderSidebarProps) {
  useEscapeKey(() => { setShowCreateFolder(false); setNewFolderName(''); }, showCreateFolder);
  const folderList = (
    <nav className="folder-list">
      {folders.map(folder => (
        <button
          key={folder.id}
          type="button"
          className={`folder-item ${selectedFolder === folder.path ? 'active' : ''}`}
          onClick={() => onFolderChange(folder.path)}
        >
          <span className="folder-icon">{getFolderIcon(folder.icon)}</span>
          <span className="folder-name">{folder.name}</span>
          <span className="folder-count">{folder.documentCount}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop Sidebar */}
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
        {folderList}
      </aside>

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
              aria-label="Schlie\u00dfen"
            >
              ✕
            </button>
          </div>
          {folderList}
        </div>
      </div>

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="create-folder-overlay" onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }} role="presentation">
          <div className="create-folder-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Neuer Ordner">
            <h3>Neuer Ordner</h3>
            <input
              type="text"
              className="folder-name-input"
              placeholder="Ordnername"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onCreateFolder();
                }
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
                onClick={onCreateFolder}
                disabled={!newFolderName.trim()}
              >
                Erstellen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
