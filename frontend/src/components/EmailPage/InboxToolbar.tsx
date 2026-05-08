/**
 * InboxToolbar - Search + ViewToggle + Compose + Batch actions
 *
 * Follows the same pattern as IdeasToolbar from Phase 107.
 */
import { Search, Plus, Archive, Trash2, CheckSquare } from 'lucide-react';
import { ViewToggle } from './ViewToggle';
import { VoiceInputButton } from '../shared/VoiceInputButton';
import type { InboxViewMode } from './types';
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
          <span className="inbox-toolbar__count">{selectedCount} ausgewählt</span>
          <button className="inbox-toolbar__batch-btn" onClick={onBatchArchive} aria-label="Archivieren">
            <Archive size={16} />
          </button>
          <button className="inbox-toolbar__batch-btn inbox-toolbar__batch-btn--danger" onClick={onBatchDelete} aria-label="Löschen">
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
              aria-label="E-Mails suchen"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
            />
            <VoiceInputButton onTranscript={onSearchChange} size="sm" />
          </div>
          <div className="inbox-toolbar__actions">
            <button
              className="inbox-toolbar__select-btn"
              onClick={onToggleSelection}
              aria-label="Auswählen"
            >
              <CheckSquare size={16} />
            </button>
            <ViewToggle value={viewMode} onChange={onViewChange} />
            <button className="inbox-toolbar__compose" onClick={onCompose} aria-label="E-Mail verfassen">
              <Plus size={16} aria-hidden="true" />
              <span>Verfassen</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
