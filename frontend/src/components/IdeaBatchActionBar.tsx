/**
 * IdeaBatchActionBar
 *
 * Floating action bar for batch operations on selected ideas.
 * Adapted from DocumentVaultPage/BatchActionBar pattern.
 */

import './IdeaBatchActionBar.css';

interface IdeaBatchActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onBatchArchive: () => void;
  onBatchDelete: () => void;
  onBatchFavorite: () => void;
  disabled?: boolean;
}

export function IdeaBatchActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClear,
  onBatchArchive,
  onBatchDelete,
  onBatchFavorite,
  disabled = false,
}: IdeaBatchActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="idea-batch-bar" role="toolbar" aria-label="Batch-Aktionen">
      <div className="idea-batch-info">
        <span className="idea-batch-count">
          {selectedCount} von {totalCount} ausgewählt
        </span>
        <button type="button" className="idea-batch-btn-text" onClick={onSelectAll}>
          Alle auswählen
        </button>
        <button type="button" className="idea-batch-btn-text" onClick={onClear}>
          Auswahl aufheben
        </button>
      </div>
      <div className="idea-batch-actions">
        <button
          type="button"
          className="idea-batch-action favorite"
          onClick={onBatchFavorite}
          disabled={disabled}
          title="Ausgewählte als Favoriten markieren"
          aria-label="Ausgewählte als Favoriten markieren"
        >
          ⭐ Favorit
        </button>
        <button
          type="button"
          className="idea-batch-action archive"
          onClick={onBatchArchive}
          disabled={disabled}
          title="Ausgewählte archivieren"
          aria-label="Ausgewählte archivieren"
        >
          📥 Archivieren
        </button>
        <button
          type="button"
          className="idea-batch-action delete"
          onClick={onBatchDelete}
          disabled={disabled}
          title="Ausgewählte löschen"
          aria-label="Ausgewählte löschen"
        >
          🗑️ Löschen
        </button>
      </div>
    </div>
  );
}
