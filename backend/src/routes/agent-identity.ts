/**
 * Phase 64: Agent Identity + Workflow API Routes
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuth } from '../middleware/auth';
import { getAgentIdentityService } from '../services/agents/agent-identity';
import { getWorkflowStore } from '../services/agents/workflow-store';
import { AgentGraph, GraphEdge, createResearchWriteReviewGraph, createCodeReviewGraph, createResearchCodeReviewGraph } from '../services/agents/agent-graph';
import { AIContext } from '../utils/database-context';
import { getUserId } from '../utils/user-context';

const router = Router();

// All agent identity routes require authentication
router.use(apiKeyAuth);

// ===== Agent Identities =====

// GET /api/agent-identities - List all agent identities
router.get('/agent-identities', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const service = getAgentIdentityService();
  const role = req.query.role as string | undefined;
  const enabled = req.query.enabled !== undefined ? req.query.enabled === 'true' : undefined;
  const identities = await service.listIdentities({ role, enabled });
  res.json({ success: true, data: identities });
}));

// GET /api/agent-identities/:id - Get single identity
router.get('/agent-identities/:id', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const service = getAgentIdentityService();
  const identity = await service.getIdentity(req.params.id);
  if (!identity) {
    return res.status(404).json({ success: false, error: 'Agent identity not found' });
  }
  res.json({ success: true, data: identity });
}));

// POST /api/agent-identities - Create identity
router.post('/agent-identities', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const service = getAgentIdentityService();
  const identity = await service.createIdentity(req.body);
  res.status(201).json({ success: true, data: identity });
}));

// PUT /api/agent-identities/:id - Update identity
router.put('/agent-identities/:id', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const service = getAgentIdentityService();
  const identity = await service.updateIdentity(req.params.id, req.body);
  if (!identity) {
    return res.status(404).json({ success: false, error: 'Agent identity not found' });
  }
  res.json({ success: true, data: identity });
}));

// DELETE /api/agent-identities/:id - Delete identity
router.delete('/agent-identities/:id', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const service = getAgentIdentityService();
  const deleted = await service.deleteIdentity(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Agent identity not found' });
  }
  res.json({ success: true });
}));

// POST /api/agent-identities/:id/validate - Validate action
router.post('/agent-identities/:id/validate', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const service = getAgentIdentityService();
  const result = await service.validateAction(req.params.id, req.body);
  res.json({ success: true, data: result });
}));

// ===== Workflows =====

// GET /api/agent-workflows - List workflows
router.get('/agent-workflows', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const store = getWorkflowStore();
  const workflows = await store.listWorkflows();
  res.json({ success: true, data: workflows });
}));

// GET /api/agent-workflows/templates - Get pre-built templates
router.get('/agent-workflows/templates', asyncHandler(async (_req: Request, res: Response) => {
  const templates = [
    { name: 'research-write-review', description: 'Research -> Write -> Review pipeline', graph: createResearchWriteReviewGraph().serialize() },
    { name: 'code-review', description: 'Code -> Review pipeline', graph: createCodeReviewGraph().serialize() },
    { name: 'research-code-review', description: 'Research -> Code -> Review pipeline', graph: createResearchCodeReviewGraph().serialize() },
  ];
  res.json({ success: true, data: templates });
}));

// GET /api/agent-workflows/:id - Get workflow
router.get('/agent-workflows/:id', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const store = getWorkflowStore();
  const workflow = await store.getWorkflow(req.params.id);
  if (!workflow) {
    return res.status(404).json({ success: false, error: 'Workflow not found' });
  }
  res.json({ success: true, data: workflow });
}));

// POST /api/agent-workflows - Save workflow
router.post('/agent-workflows', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const store = getWorkflowStore();
  const workflow = await store.saveWorkflow(req.body);
  res.status(201).json({ success: true, data: workflow });
}));

// DELETE /api/agent-workflows/:id - Delete workflow
router.delete('/agent-workflows/:id', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const store = getWorkflowStore();
  const deleted = await store.deleteWorkflow(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Workflow not found' });
  }
  res.json({ success: true });
}));

// POST /api/agent-workflows/:id/execute - Execute workflow
router.post('/agent-workflows/:id/execute', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const store = getWorkflowStore();
  const workflow = await store.getWorkflow(req.params.id);
  if (!workflow) {
    return res.status(404).json({ success: false, error: 'Workflow not found' });
  }

  const { input, context } = req.body;
  if (!input) {
    return res.status(400).json({ success: false, error: 'input is required' });
  }

  const aiContext = (context || 'personal') as AIContext;

  // Reconstruct graph from definition
  const graph = new AgentGraph(workflow.name);
  const def = workflow.graphDefinition as {
    nodes?: Array<{ id: string; type: string; config: Record<string, unknown> }>;
    edges?: GraphEdge[];
    startNodeId?: string;
  };

  if (def.nodes) {
    for (const node of def.nodes) {
      graph.addNode({
        id: node.id,
        type: node.type as 'agent' | 'tool' | 'condition' | 'human_review',
        config: node.config || {},
      });
    }
  }
  if (def.edges) {
    for (const edge of def.edges) {
      graph.addEdge(edge);
    }
  }
  if (def.startNodeId) {
    graph.setStart(def.startNodeId);
  }

  // Execute with default agent executor
  const result = await graph.execute(input, aiContext);

  // Record the run
  await store.recordRun({
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: result.success ? 'completed' : 'failed',
    state: result.state as unknown as Record<string, unknown>,
    nodeHistory: result.nodeHistory as unknown as Record<string, unknown>[],
    durationMs: result.totalDurationMs,
  });

  res.json({ success: true, data: result });
}));

// GET /api/agent-workflow-runs - List runs
router.get('/agent-workflow-runs', asyncHandler(async (req: Request, res: Response) => {
  getUserId(req); // auth check
  const store = getWorkflowStore();
  const runs = await store.listRuns({
    workflowId: req.query.workflowId as string | undefined,
    status: req.query.status as string | undefined,
    limit: parseInt(req.query.limit as string) || 20,
  });
  res.json({ success: true, data: runs });
}));

export const agentIdentityRouter = router;
