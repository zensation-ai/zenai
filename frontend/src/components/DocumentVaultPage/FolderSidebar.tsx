/**
 * Folder Sidebar & Mobile Folder Drawer
 *
 * Desktop: renders as a sidebar (<aside>).
 * Mobile: renders as a slide-in drawer overlay.
 */

import { Folder } from '../../types/document';
import { getFolderIcon } from './types';
import { useEscapeKey } from '../../hooks/useClickOutside';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
  const renderFolderList = (ariaLabel: string) => (
    <nav className="flex flex-col gap-1" aria-label={ariaLabel}>
      {folders.map(folder => (
        <button
          key={folder.id}
          type="button"
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 bg-transparent border-none rounded-sm text-text text-sm text-left cursor-pointer transition-all hover:bg-surface-hover',
            selectedFolder === folder.path && 'bg-primary/15 text-primary'
          )}
          onClick={() => onFolderChange(folder.path)}
        >
          <span className="text-lg">{getFolderIcon(folder.icon)}</span>
          <span className="flex-1">{folder.name}</span>
          <span className="px-2 py-0.5 bg-surface-hover rounded-sm text-xs text-text-secondary">{folder.documentCount}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="w-60 p-4 bg-glass-bg border-r border-glass-border overflow-y-auto shrink-0 max-md:hidden">
        <div className="flex items-center justify-between mb-3 px-2">
          <h2 className="m-0 text-xs font-semibold text-text-secondary uppercase tracking-wide">Ordner</h2>
          <button
            type="button"
            className="flex items-center justify-center w-6 h-6 bg-transparent border border-glass-border rounded-sm text-text-secondary text-base cursor-pointer transition-all hover:bg-surface-hover hover:border-primary hover:text-primary"
            onClick={() => setShowCreateFolder(true)}
            aria-label="Neuer Ordner"
          >
            +
          </button>
        </div>
        {renderFolderList('Ordner-Navigation')}
      </aside>

      {/* Mobile Folder Drawer */}
      <div
        className={cn(
          'fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] opacity-0 invisible transition-all duration-250 ease-in-out',
          showMobileFolders && 'opacity-100 visible'
        )}
        onClick={() => setShowMobileFolders(false)}
      >
        <div
          className={cn(
            'fixed top-0 left-0 bottom-0 w-70 max-w-[85vw] bg-surface border-r border-glass-border p-4 -translate-x-full transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] z-[101] overflow-y-auto',
            showMobileFolders && 'translate-x-0'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-glass-border">
            <h2 className="m-0 text-base font-semibold">Ordner</h2>
            <button
              type="button"
              className="w-8 h-8 bg-transparent border-none text-text-secondary text-xl cursor-pointer rounded-sm hover:bg-surface-hover"
              onClick={() => setShowMobileFolders(false)}
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
          {renderFolderList('Ordner-Navigation (Mobil)')}
        </div>
      </div>

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }} role="presentation">
          <div className="w-[90%] max-w-[400px] bg-surface border border-glass-border rounded-md p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Neuer Ordner">
            <h3 className="m-0 mb-4 text-lg font-semibold text-text">Neuer Ordner</h3>
            <input
              type="text"
              className="w-full px-4 py-3 bg-glass-bg border border-glass-border rounded-sm text-text text-base placeholder:text-text-muted focus:outline-none focus:border-primary"
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
            <p className="my-3 text-sm text-text-muted">Wird erstellt in: {selectedFolder}</p>
            <div className="flex gap-3 justify-end mt-5">
              <Button
                variant="outline"
                onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }}
              >
                Abbrechen
              </Button>
              <Button
                variant="default"
                onClick={onCreateFolder}
                disabled={!newFolderName.trim()}
              >
                Erstellen
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
