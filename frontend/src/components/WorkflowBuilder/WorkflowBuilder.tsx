/**
 * WorkflowBuilder — Visual drag-and-drop workflow editor using React Flow.
 *
 * Composes: WorkflowToolbar (top) + NodePalette (left sidebar)
 *         + WorkflowCanvas (center) + NodeConfigPanel (right sidebar).
 */

import 'reactflow/dist/style.css';
import { useState, useCallback } from 'react';
import { useNodesState, useEdgesState, type Node, type Edge } from 'reactflow';
import { NodePalette } from './NodePalette';
import { WorkflowCanvas } from './WorkflowCanvas';
import { WorkflowToolbar } from './WorkflowToolbar';
import { NodeConfigPanel } from './NodeConfigPanel';

const INITIAL_NODES: Node[] = [
  {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 250, y: 60 },
    data: { label: 'Schedule Trigger', triggerType: 'schedule' },
  },
  {
    id: 'action-1',
    type: 'action',
    position: { x: 250, y: 200 },
    data: { label: 'Send Notification', description: 'Notify team on Slack' },
  },
];

const INITIAL_EDGES: Edge[] = [
  {
    id: 'e-trigger-action',
    source: 'trigger-1',
    target: 'action-1',
    animated: true,
    style: { stroke: '#6366f1', strokeWidth: 1.5 },
  },
];

export function WorkflowBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowName, setWorkflowName] = useState('Mein Workflow');

  const handleNodeUpdate = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data } : n)),
      );
    },
    [setNodes],
  );

  const handleTemplateLoad = useCallback(
    (templateNodes: Node[], templateEdges: Edge[]) => {
      setNodes(templateNodes);
      setEdges(templateEdges);
      setSelectedNode(null);
    },
    [setNodes, setEdges],
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden rounded-lg border border-white/10 bg-[#0d1117]">
      {/* Top toolbar */}
      <WorkflowToolbar
        workflowName={workflowName}
        nodes={nodes}
        edges={edges}
        onNameChange={setWorkflowName}
        onTemplateLoad={handleTemplateLoad}
      />

      {/* Body: palette + canvas + config */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left palette */}
        <NodePalette />

        {/* Center canvas */}
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onSetEdges={setEdges}
          onSetNodes={setNodes}
          onNodeSelect={setSelectedNode}
        />

        {/* Right config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onUpdate={handleNodeUpdate}
          />
        )}
      </div>
    </div>
  );
}
