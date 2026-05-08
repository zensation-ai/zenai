/**
 * WorkflowCanvas — React Flow instance with custom node types.
 * Handles drag-and-drop from NodePalette, node connections, and viewport.
 */

import { useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
  type OnNodesChange,
  type OnEdgesChange,
} from 'reactflow';
import { TriggerNode } from './nodes/TriggerNode';
import { ActionNode } from './nodes/ActionNode';
import { ConditionNode } from './nodes/ConditionNode';
import { AgentNode } from './nodes/AgentNode';

// Register custom node types — must be defined outside component to prevent re-renders
const NODE_TYPES = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  agent: AgentNode,
};

let nodeIdCounter = 200;

interface WorkflowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onSetEdges: (updater: (eds: Edge[]) => Edge[]) => void;
  onSetNodes: (updater: (nds: Node[]) => Node[]) => void;
  onNodeSelect: (node: Node | null) => void;
}

export function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onSetEdges,
  onSetNodes,
  onNodeSelect,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const onConnect = useCallback(
    (connection: Connection) => {
      onSetEdges((eds) =>
        addEdge(
          { ...connection, animated: true, style: { stroke: '#6366f1', strokeWidth: 1.5 } },
          eds,
        ),
      );
    },
    [onSetEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const raw = event.dataTransfer.getData('application/reactflow');
      if (!raw) return;

      let parsed: { type: string; data: Record<string, unknown> };
      try {
        parsed = JSON.parse(raw) as { type: string; data: Record<string, unknown> };
      } catch {
        return;
      }

      const { type, data } = parsed;
      if (!type) return;

      if (!reactFlowInstance.current || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.current.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      nodeIdCounter += 1;
      const newNode: Node = {
        id: `${type}-${nodeIdCounter}`,
        type,
        position,
        data,
      };

      onSetNodes((nds) => nds.concat(newNode));
    },
    [onSetNodes],
  );

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={(instance) => {
          reactFlowInstance.current = instance;
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={(_event, node) => onNodeSelect(node)}
        onPaneClick={() => onNodeSelect(null)}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode="Delete"
        className="bg-[#0d1117]"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#30363d"
        />
        <Controls
          className="[&>button]:bg-[#161b22] [&>button]:border-white/10 [&>button]:text-white/70 [&>button:hover]:bg-[#21262d]"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}
