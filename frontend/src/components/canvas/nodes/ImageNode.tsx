/**
 * ImageNode — ReactFlow custom node for displaying images on the canvas board.
 *
 * Shows an image with optional caption. Click to enlarge (opens in new tab).
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';

export interface ImageNodeData {
  src: string;
  alt?: string;
  caption?: string;
}

function ImageNodeComponent({ data, selected }: NodeProps<ImageNodeData>) {
  return (
    <div
      className={`rounded-lg border border-white/20 bg-white/5 backdrop-blur-sm shadow-lg overflow-hidden min-w-[120px] max-w-[300px] transition-shadow ${
        selected ? 'ring-2 ring-white/30 shadow-xl' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-white/40 !border-0" />

      <a
        href={data.src}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        title="Klicken zum Vergrößern"
      >
        <img
          src={data.src}
          alt={data.alt || 'Board-Bild'}
          className="w-full h-auto object-cover max-h-[200px]"
          draggable={false}
        />
      </a>

      {data.caption && (
        <div className="px-2 py-1.5 text-[11px] text-white/60 text-center truncate">
          {data.caption}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-white/40 !border-0" />
    </div>
  );
}

export const ImageNode = memo(ImageNodeComponent);
