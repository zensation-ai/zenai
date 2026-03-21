-- Phase 89: Self-Evolving Agent Pipelines
-- Tables in public schema (agents are not context-specific)

CREATE TABLE IF NOT EXISTS agent_execution_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id VARCHAR(255) NOT NULL,
  strategy VARCHAR(100) NOT NULL,
  agents_used TEXT[] DEFAULT '{}',
  completion_score REAL DEFAULT 0,
  user_rating SMALLINT CHECK (user_rating BETWEEN 1 AND 5),
  token_count INTEGER DEFAULT 0,
  execution_time_ms INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  task_type VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_tuning_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_role VARCHAR(50) NOT NULL UNIQUE,
  model VARCHAR(100) NOT NULL,
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  retry_on_fail BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_specialization_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_role VARCHAR(50) NOT NULL UNIQUE,
  specializations JSONB DEFAULT '{}',
  learned_from_executions INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_strategy ON agent_execution_feedback (strategy, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_execution ON agent_execution_feedback (execution_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_task_type ON agent_execution_feedback (task_type, created_at DESC);
