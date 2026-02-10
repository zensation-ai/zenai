/**
 * Batch Action Bar
 *
 * Appears when documents are selected. Provides bulk move and delete actions.
 */

import { Folder } from '../../types/document';

export interface BatchActionBarProps {
  selectedCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onBatchDelete: () => void;
  onBatchMove: (targetFolder: string) => void;
  folders: Folder[];
}

export function BatchActionBar({
  selectedCount,
  onSelectAll,
  onClear,
  onBatchDelete,
  onBatchMove,
  folders,
}: BatchActionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="batch-action-bar">
      <div className="batch-info">
        <span className="batch-count">{selectedCount} ausgew\u00e4hlt</span>
        <button type="button" className="batch-select-all" onClick={onSelectAll}>
          Alle ausw\u00e4hlen
        </button>
        <button type="button" className="batch-clear" onClick={onClear}>
          Auswahl aufheben
        </button>
      </div>
      <div className="batch-actions">
        <div className="batch-move-dropdown">
          <select
            aria-label="Dokumente verschieben"
            onChange={(e) => {
              if (e.target.value) {
                onBatchMove(e.target.value);
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
          onClick={onBatchDelete}
        >
          🗑️ L\u00f6schen
        </button>
      </div>
    </div>
  );
}
