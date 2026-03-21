-- Phase 64: Agent Identity + LangGraph-Style State Machine
-- Idempotent migration for public schema (agent identities shared across contexts)

DO $$ BEGIN

-- Agent Identities (public schema - shared across contexts)
CREATE TABLE IF NOT EXISTS public.agent_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  persona JSONB DEFAULT '{}',
  model VARCHAR(100) NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  permissions JSONB NOT NULL DEFAULT '[]',
  max_token_budget INTEGER DEFAULT 10000,
  max_execution_time_ms INTEGER DEFAULT 120000,
  trust_level VARCHAR(20) DEFAULT 'medium' CHECK (trust_level IN ('low', 'medium', 'high')),
  governance_policy_id UUID,
  memory_scope VARCHAR(100),
  created_by UUID,
  enabled BOOLEAN DEFAULT true,
  execution_count INTEGER DEFAULT 0,
  success_rate FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Workflow Graphs (stored workflows)
CREATE TABLE IF NOT EXISTS public.agent_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  graph_definition JSONB NOT NULL,
  created_by UUID,
  usage_count INTEGER DEFAULT 0,
  avg_duration_ms FLOAT DEFAULT 0,
  success_rate FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow Execution History
CREATE TABLE IF NOT EXISTS public.agent_workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.agent_workflows(id) ON DELETE SET NULL,
  workflow_name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'paused', 'cancelled')),
  state JSONB DEFAULT '{}',
  node_history JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error TEXT
);

-- Agent Action Logs (rate limiting + audit)
CREATE TABLE IF NOT EXISTS public.agent_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agent_identities(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  resource VARCHAR(255),
  result VARCHAR(20) NOT NULL CHECK (result IN ('allowed', 'denied', 'pending')),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_identities_role ON public.agent_identities(role);
CREATE INDEX IF NOT EXISTS idx_agent_identities_enabled ON public.agent_identities(enabled);
CREATE INDEX IF NOT EXISTS idx_agent_workflows_name ON public.agent_workflows(name);
CREATE INDEX IF NOT EXISTS idx_agent_workflow_runs_status ON public.agent_workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_workflow_runs_workflow ON public.agent_workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_agent_action_logs_agent ON public.agent_action_logs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_action_logs_type ON public.agent_action_logs(action_type, created_at DESC);

END $$;
