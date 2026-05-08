/**
 * Batch Action Bar
 *
 * Appears when documents are selected. Provides bulk move and delete actions.
 */

import { Folder } from '../../types/document';
import { Button } from '@/components/ui/button';

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
    <div className="flex items-center justify-between px-6 py-3 bg-primary text-white shrink-0 max-sm:flex-col max-sm:gap-3 max-sm:p-4">
      <div className="flex items-center gap-4 max-sm:w-full max-sm:justify-center">
        <span className="font-semibold">{selectedCount} ausgewählt</span>
        <button
          type="button"
          className="bg-white/20 border-none px-3 py-1.5 rounded-sm text-white text-sm cursor-pointer transition-colors hover:bg-white/30"
          onClick={onSelectAll}
        >
          Alle auswählen
        </button>
        <button
          type="button"
          className="bg-white/20 border-none px-3 py-1.5 rounded-sm text-white text-sm cursor-pointer transition-colors hover:bg-white/30"
          onClick={onClear}
        >
          Auswahl aufheben
        </button>
      </div>
      <div className="flex items-center gap-3 max-sm:w-full max-sm:justify-center">
        <div>
          <select
            aria-label="Dokumente verschieben"
            className="px-3 py-2 bg-white/20 border-none rounded-sm text-white text-sm cursor-pointer"
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
              <option key={folder.id} value={folder.path} className="bg-surface text-text">
                {folder.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={onBatchDelete}
        >
          🗑️ Löschen
        </Button>
      </div>
    </div>
  );
}
