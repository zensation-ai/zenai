/**
 * InboxToolbar - Search + ViewToggle + Compose + Batch actions
 *
 * Follows the same pattern as IdeasToolbar from Phase 107.
 */
import { Search, Plus, Archive, Trash2, CheckSquare } from 'lucide-react';
import { ViewToggle } from './ViewToggle';
import type { InboxViewMode } from './types';
import './InboxToolbar.css';

interface InboxToolbarProps {
  viewMode: InboxViewMode;
  onViewChange: (mode: InboxViewMode) => void;
  search: string;
  onSearchChange: (query: string) => void;
  onCompose: () => void;
  selectionMode: boolean;
  onToggleSelection: () => void;
  selectedCount: number;
  onBatchArchive: () => void;
  onBatchDelete: () => void;
}

export function InboxToolbar({
  viewMode,
  onViewChange,
  search,
  onSearchChange,
  onCompose,
  selectionMode,
  onToggleSelection,
  selectedCount,
  onBatchArchive,
  onBatchDelete,
}: InboxToolbarProps) {
  return (
    <div className="inbox-toolbar">
      {selectionMode ? (
        <div className="inbox-toolbar__batch">
          <span className="inbox-toolbar__count">{selectedCount} ausgewaehlt</span>
          <button className="inbox-toolbar__batch-btn" onClick={onBatchArchive} aria-label="Archivieren">
            <Archive size={16} />
          </button>
          <button className="inbox-toolbar__batch-btn inbox-toolbar__batch-btn--danger" onClick={onBatchDelete} aria-label="Loeschen">
            <Trash2 size={16} />
          </button>
          <button className="inbox-toolbar__cancel" onClick={onToggleSelection}>
            Abbrechen
          </button>
        </div>
      ) : (
        <>
          <div className="inbox-toolbar__search" role="search">
            <Search size={16} className="inbox-toolbar__search-icon" />
            <input
              className="inbox-toolbar__input"
              type="text"
              placeholder="E-Mails suchen..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
          <div className="inbox-toolbar__actions">
            <button
              className="inbox-toolbar__select-btn"
              onClick={onToggleSelection}
              aria-label="Auswaehlen"
            >
              <CheckSquare size={16} />
            </button>
            <ViewToggle active={viewMode} onChange={onViewChange} />
            <button className="inbox-toolbar__compose" onClick={onCompose}>
              <Plus size={16} />
              <span>Verfassen</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
