/**
 * CanvasBoardPanel — ReactFlow whiteboard mode for Canvas documents.
 *
 * Provides a visual node-based board with IdeaNode, NoteNode, ImageNode types.
 * Edges, minimap, controls, dot-grid background, auto-save via onBoardChange.
 */

import { useCallback, useMemo, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnConnect,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { IdeaNode } from './nodes/IdeaNode';
import { NoteNode, type NoteNodeData } from './nodes/NoteNode';
import { ImageNode } from './nodes/ImageNode';

// ============================================
// Types
// ============================================

export interface BoardData {
  nodes: Node[];
  edges: Edge[];
}

interface CanvasBoardPanelProps {
  boardData: BoardData;
  onBoardChange: (data: BoardData) => void;
}

// ============================================
// Node Types Registry
// ============================================

const nodeTypes: NodeTypes = {
  idea: IdeaNode,
  note: NoteNode,
  image: ImageNode,
};

// ============================================
// Component
// ============================================

export function CanvasBoardPanel({ boardData, onBoardChange }: CanvasBoardPanelProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(boardData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(boardData.edges);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced save
  const scheduleSave = useCallback(
    (updatedNodes: Node[], updatedEdges: Edge[]) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        onBoardChange({ nodes: updatedNodes, edges: updatedEdges });
      }, 800);
    },
    [onBoardChange]
  );

  // Wrap node changes to trigger save
  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      // Use a microtask to read updated state after React processes the change
      queueMicrotask(() => {
        setNodes((currentNodes) => {
          scheduleSave(currentNodes, edges);
          return currentNodes;
        });
      });
    },
    [onNodesChange, setNodes, edges, scheduleSave]
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      queueMicrotask(() => {
        setEdges((currentEdges) => {
          scheduleSave(nodes, currentEdges);
          return currentEdges;
        });
      });
    },
    [onEdgesChange, setEdges, nodes, scheduleSave]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const next = addEdge(
          { ...connection, animated: true, style: { stroke: 'rgba(255,255,255,0.3)' } },
          eds
        );
        scheduleSave(nodes, next);
        return next;
      });
    },
    [setEdges, nodes, scheduleSave]
  );

  // Handle note text changes
  const handleNoteTextChange = useCallback(
    (nodeId: string, text: string) => {
      setNodes((nds) => {
        const next = nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, text } } : n
        );
        scheduleSave(next, edges);
        return next;
      });
    },
    [setNodes, edges, scheduleSave]
  );

  // Inject onTextChange callback into note nodes
  const processedNodes = useMemo(
    () =>
      nodes.map((n) =>
        n.type === 'note'
          ? { ...n, data: { ...n.data, onTextChange: handleNoteTextChange } }
          : n
      ),
    [nodes, handleNoteTextChange]
  );

  // Add node via double-click on empty space
  const handlePaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const bounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect();
      if (!bounds) return;

      const position = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };

      const newNode: Node<NoteNodeData> = {
        id: crypto.randomUUID(),
        type: 'note',
        position,
        data: { text: '' },
      };

      setNodes((nds) => {
        const next = [...nds, newNode];
        scheduleSave(next, edges);
        return next;
      });
    },
    [setNodes, edges, scheduleSave]
  );

  // Delete key handler
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
        const selectedEdgeIds = edges.filter((e) => e.selected).map((e) => e.id);

        if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return;

        setNodes((nds) => {
          const next = nds.filter((n) => !selectedNodeIds.includes(n.id));
          setEdges((eds) => {
            const nextEdges = eds.filter(
              (e) =>
                !selectedEdgeIds.includes(e.id) &&
                !selectedNodeIds.includes(e.source) &&
                !selectedNodeIds.includes(e.target)
            );
            scheduleSave(next, nextEdges);
            return nextEdges;
          });
          return next;
        });
      }
    },
    [nodes, edges, setNodes, setEdges, scheduleSave]
  );

  return (
    <div className="w-full h-full" onKeyDown={handleKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={processedNodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onDoubleClick={handlePaneDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={null}
        className="canvas-board-flow"
        minZoom={0.1}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.08)" />
        <Controls
          className="!bg-white/10 !border-white/10 !rounded-lg [&>button]:!bg-white/10 [&>button]:!border-white/10 [&>button]:!text-white/60 [&>button:hover]:!bg-white/20"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-black/40 !border-white/10 !rounded-lg"
          nodeColor="rgba(255,255,255,0.2)"
          maskColor="rgba(0,0,0,0.5)"
        />
      </ReactFlow>
    </div>
  );
}
