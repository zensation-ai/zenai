import { useState, useRef, useEffect } from 'react';
import { Search, CheckSquare, Archive, Trash2, Plus } from 'lucide-react';
import { ViewToggle } from './ViewToggle';
import { VoiceInputButton } from '../shared/VoiceInputButton';
import type { ViewMode, IdeaSort } from './types';

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
  onCreateIdea?: (content: string) => void;
  isCreating?: boolean;
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
  onCreateIdea,
  isCreating,
}: IdeasToolbarProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [createText, setCreateText] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showCreate) createInputRef.current?.focus();
  }, [showCreate]);

  const handleSubmit = () => {
    const text = createText.trim();
    if (!text || !onCreateIdea) return;
    onCreateIdea(text);
    setCreateText('');
    setShowCreate(false);
  };

  return (
    <div className="flex flex-col gap-2 px-4">
      {showCreate && (
        <div className="flex items-center gap-2 bg-glass-bg border border-primary/40 rounded-[10px] px-3 py-2 transition-colors duration-150">
          <Plus size={16} className="text-primary shrink-0" />
          <input
            ref={createInputRef}
            className="flex-1 bg-transparent border-none outline-none text-text text-sm placeholder:text-text-secondary"
            type="text"
            placeholder="Neue Idee beschreiben..."
            value={createText}
            onChange={e => setCreateText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setShowCreate(false); }}
            aria-label="Neue Idee eingeben"
            disabled={isCreating}
          />
          <button
            className="px-3 py-1 rounded-md bg-primary text-white text-xs font-medium cursor-pointer border-none disabled:opacity-50"
            onClick={handleSubmit}
            disabled={!createText.trim() || isCreating}
          >
            {isCreating ? 'Speichern...' : 'Erstellen'}
          </button>
          <button
            className="px-2 py-1 rounded-md border-none bg-transparent text-text-secondary cursor-pointer text-xs hover:text-text"
            onClick={() => { setShowCreate(false); setCreateText(''); }}
          >
            Abbrechen
          </button>
        </div>
      )}
      <div className="flex items-center gap-3">
        {selectionMode ? (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm text-text mr-auto">{selectedCount} ausgewählt</span>
            <button className="flex items-center justify-center w-9 h-9 rounded-md border border-glass-border bg-transparent text-text-secondary cursor-pointer" onClick={onBatchArchive} aria-label="Archivieren">
              <Archive size={16} />
            </button>
            <button className="flex items-center justify-center w-9 h-9 rounded-md border border-glass-border bg-transparent text-text-secondary cursor-pointer hover:bg-red-500 hover:text-white hover:border-red-500" onClick={onBatchDelete} aria-label="Löschen">
              <Trash2 size={16} />
            </button>
            <button className="px-3 py-1.5 rounded-md border-none bg-transparent text-text-secondary cursor-pointer text-[0.8125rem] hover:text-text" onClick={onToggleSelection}>
              Abbrechen
            </button>
          </div>
        ) : (
          <>
            <button
              className="flex items-center justify-center w-9 h-9 rounded-md border border-primary/40 bg-primary/10 text-primary cursor-pointer transition-all duration-150 hover:bg-primary/20 shrink-0"
              onClick={() => setShowCreate(v => !v)}
              aria-label="Neue Idee erstellen"
              title="Neue Idee"
            >
              <Plus size={18} />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-glass-bg border border-glass-border rounded-[10px] px-3 py-2 transition-colors duration-150 focus-within:border-primary" role="search">
              <Search size={16} className="text-text-secondary shrink-0" />
              <input
                className="flex-1 bg-transparent border-none outline-none text-text text-sm placeholder:text-text-secondary"
                type="text"
                placeholder="Ideen suchen..."
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                aria-label="Ideen durchsuchen"
              />
              <VoiceInputButton onTranscript={onSearchChange} size="sm" />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="flex items-center justify-center w-9 h-9 rounded-md border border-glass-border bg-transparent text-text-secondary cursor-pointer transition-all duration-150 hover:bg-glass-bg hover:text-text"
                onClick={onToggleSelection}
                aria-label="Auswählen"
              >
                <CheckSquare size={16} />
              </button>
              <ViewToggle active={viewMode} onChange={onViewChange} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
