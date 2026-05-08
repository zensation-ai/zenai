/**
 * NoteNode — ReactFlow custom node for freeform text on the canvas board.
 *
 * Inline-editable text area. Renders markdown on blur.
 * Resizable via CSS resize.
 */

import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

export interface NoteNodeData {
  text: string;
  onTextChange?: (nodeId: string, text: string) => void;
}

function NoteNodeComponent({ id, data, selected }: NodeProps<NoteNodeData>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.text);

  const handleBlur = useCallback(() => {
    setEditing(false);
    if (draft !== data.text) {
      data.onTextChange?.(id, draft);
    }
  }, [id, draft, data]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDraft(data.text);
      setEditing(false);
    }
    // Prevent ReactFlow keyboard shortcuts while editing
    e.stopPropagation();
  }, [data.text]);

  return (
    <div
      className={`rounded-lg border border-yellow-500/30 bg-yellow-500/10 backdrop-blur-sm shadow-lg min-w-[140px] min-h-[60px] transition-shadow ${
        selected ? 'ring-2 ring-white/30 shadow-xl' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-white/40 !border-0" />

      {editing ? (
        <textarea
          className="w-full h-full min-h-[60px] p-2 text-xs text-white/90 bg-transparent border-0 outline-none resize"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      ) : (
        <div
          className="p-2 text-xs text-white/80 leading-relaxed cursor-text min-h-[60px] whitespace-pre-wrap"
          onDoubleClick={() => {
            setDraft(data.text);
            setEditing(true);
          }}
          title="Doppelklick zum Bearbeiten"
        >
          {data.text || 'Doppelklick zum Bearbeiten...'}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-white/40 !border-0" />
    </div>
  );
}

export const NoteNode = memo(NoteNodeComponent);
