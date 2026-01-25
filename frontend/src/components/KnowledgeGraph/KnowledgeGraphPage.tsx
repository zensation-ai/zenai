import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import { showToast } from '../Toast';
import { getRandomReward } from '../../utils/aiPersonality';
import './KnowledgeGraphPage.css';
import '../../neurodesign.css';

interface GraphNode {
  id: string;
  title: string;
  type: string;
  category: string;
  priority: string;
  topicId: string | null;
  topicName: string | null;
  topicColor: string | null;
  position?: { x: number; y: number };
}

interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  strength: number;
  reason: string | null;
}

interface Topic {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  ideaCount: number;
  ideaIds: string[];
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  topics: Topic[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    topicCount: number;
  };
}

interface KnowledgeGraphPageProps {
  onBack: () => void;
  onSelectIdea?: (ideaId: string) => void;
}

// Node colors based on idea type
const typeColors: Record<string, string> = {
  idea: '#60a5fa',
  task: '#34d399',
  insight: '#a78bfa',
  problem: '#f87171',
  question: '#fbbf24',
};

// Edge colors based on relation type
const edgeColors: Record<string, string> = {
  similar_to: '#60a5fa',
  builds_on: '#34d399',
  contradicts: '#f87171',
  supports: '#a78bfa',
  enables: '#fbbf24',
  part_of: '#f472b6',
  related_tech: '#06b6d4',
};

// Relation type labels in German
const relationLabels: Record<string, string> = {
  similar_to: 'Aehnlich',
  builds_on: 'Baut auf',
  contradicts: 'Widerspricht',
  supports: 'Unterstuetzt',
  enables: 'Ermoeglicht',
  part_of: 'Teil von',
  related_tech: 'Verwandte Tech',
};

export default function KnowledgeGraphPage({ onBack, onSelectIdea }: KnowledgeGraphPageProps) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [generating, setGenerating] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Load graph data
  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/knowledge-graph/full?context=personal');
      const data: GraphData = response.data;
      setGraphData(data);

      // Convert to React Flow format
      const flowNodes: Node[] = data.nodes.map((node) => ({
        id: node.id,
        position: {
          x: (node.position?.x || 0.5) * 800,
          y: (node.position?.y || 0.5) * 600,
        },
        data: {
          label: node.title,
          type: node.type,
          category: node.category,
          priority: node.priority,
          topicId: node.topicId,
          topicName: node.topicName,
          topicColor: node.topicColor,
        },
        style: {
          background: node.topicColor || typeColors[node.type] || '#60a5fa',
          color: '#fff',
          border: '2px solid rgba(255,255,255,0.2)',
          borderRadius: '8px',
          padding: '10px',
          fontSize: '12px',
          fontWeight: 500,
          maxWidth: '150px',
          textAlign: 'center' as const,
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
        },
      }));

      const flowEdges: Edge[] = data.edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        animated: edge.strength > 0.8,
        style: {
          stroke: edgeColors[edge.relationType] || '#666',
          strokeWidth: Math.max(1, edge.strength * 3),
          opacity: 0.6 + edge.strength * 0.4,
        },
        label: relationLabels[edge.relationType] || edge.relationType,
        labelStyle: { fontSize: 10, fill: '#888' },
        labelBgStyle: { fill: 'rgba(10,21,32,0.8)' },
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (error) {
      console.error('Failed to load graph:', error);
      showToast('Fehler beim Laden des Graphen', 'error');
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Filter nodes by topic
  const filteredNodes = useMemo(() => {
    if (!selectedTopic) return nodes;
    return nodes.filter((node) => node.data.topicId === selectedTopic);
  }, [nodes, selectedTopic]);

  const filteredEdges = useMemo(() => {
    if (!selectedTopic) return edges;
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [edges, filteredNodes, selectedTopic]);

  // Generate topics
  const handleGenerateTopics = async () => {
    setGenerating(true);
    try {
      await axios.post('/api/knowledge-graph/topics/generate', {
        context: 'personal',
      });
      showGenerationReward();
      loadGraph();
    } catch (error) {
      console.error('Failed to generate topics:', error);
      showToast('Fehler beim Generieren der Themen', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Discover relationships
  const handleDiscoverRelationships = async () => {
    setDiscovering(true);
    try {
      await axios.post('/api/knowledge-graph/discover', {
        context: 'personal',
      });
      showGenerationReward();
      loadGraph();
    } catch (error) {
      console.error('Failed to discover relationships:', error);
      showToast('Fehler beim Analysieren der Beziehungen', 'error');
    } finally {
      setDiscovering(false);
    }
  };

  // Handle node click
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const graphNode = graphData?.nodes.find((n) => n.id === node.id);
    if (graphNode) {
      setSelectedNode(graphNode);
    }
  }, [graphData]);

  // Show reward on successful generation
  const showGenerationReward = () => {
    const reward = getRandomReward('ideaCreated');
    showToast(`${reward.emoji} ${reward.message}`, 'success');
  };

  if (loading) {
    return (
      <div className="knowledge-graph-page neuro-page-enter">
        <div className="neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Knowledge Graph...</p>
          <p className="neuro-loading-submessage">Verbindungen werden analysiert</p>
        </div>
      </div>
    );
  }

  return (
    <div className="knowledge-graph-page neuro-page-enter">
      <header className="graph-header">
        <button className="back-button" onClick={onBack}>
          ← Zurueck
        </button>
        <h1>Knowledge Graph</h1>
        <div className="graph-stats">
          <span>{graphData?.stats.nodeCount || 0} Ideen</span>
          <span>{graphData?.stats.edgeCount || 0} Verbindungen</span>
          <span>{graphData?.stats.topicCount || 0} Themen</span>
        </div>
      </header>

      <div className="graph-container">
        {/* Topic Sidebar */}
        <aside className="topic-sidebar">
          <div className="sidebar-header">
            <h2>Themen</h2>
            <div className="sidebar-actions">
              <button
                className="action-button"
                onClick={handleGenerateTopics}
                disabled={generating}
                title="Themen neu generieren"
              >
                {generating ? '...' : '🔄'}
              </button>
              <button
                className="action-button"
                onClick={handleDiscoverRelationships}
                disabled={discovering}
                title="Beziehungen entdecken"
              >
                {discovering ? '...' : '🔍'}
              </button>
            </div>
          </div>

          <div className="topic-list">
            <button
              className={`topic-chip ${!selectedTopic ? 'active' : ''}`}
              onClick={() => setSelectedTopic(null)}
            >
              Alle ({graphData?.nodes.length || 0})
            </button>

            {graphData?.topics.map((topic) => (
              <button
                key={topic.id}
                className={`topic-chip ${selectedTopic === topic.id ? 'active' : ''}`}
                onClick={() => setSelectedTopic(topic.id === selectedTopic ? null : topic.id)}
                style={{
                  borderColor: selectedTopic === topic.id ? topic.color : 'transparent',
                }}
              >
                <span className="topic-icon">{topic.icon}</span>
                <span className="topic-name">{topic.name}</span>
                <span className="topic-count">{topic.ideaCount}</span>
              </button>
            ))}

            {(!graphData?.topics || graphData.topics.length === 0) && (
              <div className="neuro-empty-state graph-empty-state">
                <span className="neuro-empty-icon">🏷️</span>
                <h3 className="neuro-empty-title">Keine Themen vorhanden</h3>
                <p className="neuro-empty-description">Generiere Themen aus deinen Ideen.</p>
                <button className="generate-button neuro-button" onClick={handleGenerateTopics} disabled={generating}>
                  {generating ? 'Generiere...' : 'Themen generieren'}
                </button>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="graph-legend">
            <h3>Beziehungstypen</h3>
            <div className="legend-items">
              {Object.entries(relationLabels).map(([key, label]) => (
                <div key={key} className="legend-item">
                  <span
                    className="legend-color"
                    style={{ backgroundColor: edgeColors[key] }}
                  ></span>
                  <span className="legend-label">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Graph Canvas */}
        <main className="graph-main">
          <ReactFlow
            nodes={filteredNodes}
            edges={filteredEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            connectionMode={ConnectionMode.Loose}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
          >
            <Background color="#1a3040" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(node) => node.data.topicColor || typeColors[node.data.type] || '#60a5fa'}
              maskColor="rgba(10, 21, 32, 0.8)"
              style={{ backgroundColor: '#0f1f2e' }}
            />

            <Panel position="top-right" className="graph-panel">
              <button onClick={() => loadGraph()} title="Aktualisieren">
                🔄 Aktualisieren
              </button>
            </Panel>
          </ReactFlow>
        </main>

        {/* Node Detail Panel */}
        {selectedNode && (
          <aside className="node-detail-panel">
            <div className="panel-header">
              <h3>{selectedNode.title}</h3>
              <button className="close-button" onClick={() => setSelectedNode(null)}>
                ×
              </button>
            </div>
            <div className="panel-content">
              <div className="detail-row">
                <span className="detail-label">Typ:</span>
                <span className={`type-badge type-${selectedNode.type}`}>
                  {selectedNode.type}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Kategorie:</span>
                <span>{selectedNode.category}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Prioritaet:</span>
                <span className={`priority-${selectedNode.priority}`}>
                  {selectedNode.priority}
                </span>
              </div>
              {selectedNode.topicName && (
                <div className="detail-row">
                  <span className="detail-label">Thema:</span>
                  <span
                    className="topic-badge"
                    style={{ backgroundColor: selectedNode.topicColor || '#60a5fa' }}
                  >
                    {selectedNode.topicName}
                  </span>
                </div>
              )}
              <button
                className="view-idea-button"
                onClick={() => onSelectIdea?.(selectedNode.id)}
              >
                Details anzeigen
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
