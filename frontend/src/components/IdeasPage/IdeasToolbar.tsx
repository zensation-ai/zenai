import { Search, CheckSquare, Archive, Trash2 } from 'lucide-react';
import { ViewToggle } from './ViewToggle';
import type { ViewMode, IdeaSort } from './types';
import './IdeasToolbar.css';

interface IdeasToolbarProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  search: string;
  onSearchChange: (query: string) => void;
  sort?: IdeaSort;
  onSortChange?: (sort: IdeaSort) => void;
  selectionMode: boolean;
  onToggleSelection: () => void;
  selectedCount: number;
  onBatchArchive: () => void;
  onBatchDelete: () => void;
}

export function IdeasToolbar({
  viewMode,
  onViewChange,
  search,
  onSearchChange,
  sort: _sort,
  onSortChange: _onSortChange,
  selectionMode,
  onToggleSelection,
  selectedCount,
  onBatchArchive,
  onBatchDelete,
}: IdeasToolbarProps) {
  return (
    <div className="ideas-toolbar">
      {selectionMode ? (
        <div className="ideas-toolbar__batch">
          <span className="ideas-toolbar__count">{selectedCount} ausgewaehlt</span>
          <button className="ideas-toolbar__batch-btn" onClick={onBatchArchive} aria-label="Archivieren">
            <Archive size={16} />
          </button>
          <button className="ideas-toolbar__batch-btn ideas-toolbar__batch-btn--danger" onClick={onBatchDelete} aria-label="Loeschen">
            <Trash2 size={16} />
          </button>
          <button className="ideas-toolbar__cancel" onClick={onToggleSelection}>
            Abbrechen
          </button>
        </div>
      ) : (
        <>
          <div className="ideas-toolbar__search" role="search">
            <Search size={16} className="ideas-toolbar__search-icon" />
            <input
              className="ideas-toolbar__input"
              type="text"
              placeholder="Ideen suchen..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
          <div className="ideas-toolbar__actions">
            <button
              className="ideas-toolbar__select-btn"
              onClick={onToggleSelection}
              aria-label="Auswaehlen"
            >
              <CheckSquare size={16} />
            </button>
            <ViewToggle active={viewMode} onChange={onViewChange} />
          </div>
        </>
      )}
    </div>
  );
}
