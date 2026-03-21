-- Phase 60: A2A Protocol Foundation
-- Agent-to-Agent Communication Tables
-- Idempotent migration for all 4 schemas

-- ==========================================
-- Personal Schema
-- ==========================================

CREATE TABLE IF NOT EXISTS personal.a2a_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_task_id VARCHAR(255),
  skill_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'working', 'completed', 'failed', 'canceled')),
  message JSONB NOT NULL,
  artifacts JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  caller_agent_url TEXT,
  caller_agent_name VARCHAR(255),
  auth_method VARCHAR(20) DEFAULT 'bearer',
  execution_id UUID,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS personal.a2a_external_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  agent_card JSONB,
  skills JSONB DEFAULT '[]',
  auth_type VARCHAR(20) DEFAULT 'bearer',
  auth_token TEXT,
  is_active BOOLEAN DEFAULT true,
  last_health_check TIMESTAMPTZ,
  health_status VARCHAR(20) DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_a2a_tasks_status ON personal.a2a_tasks(status);
CREATE INDEX IF NOT EXISTS idx_personal_a2a_tasks_skill ON personal.a2a_tasks(skill_id);
CREATE INDEX IF NOT EXISTS idx_personal_a2a_tasks_created ON personal.a2a_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_a2a_external_agents_active ON personal.a2a_external_agents(is_active) WHERE is_active = true;

-- ==========================================
-- Work Schema
-- ==========================================

CREATE TABLE IF NOT EXISTS work.a2a_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_task_id VARCHAR(255),
  skill_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'working', 'completed', 'failed', 'canceled')),
  message JSONB NOT NULL,
  artifacts JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  caller_agent_url TEXT,
  caller_agent_name VARCHAR(255),
  auth_method VARCHAR(20) DEFAULT 'bearer',
  execution_id UUID,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS work.a2a_external_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  agent_card JSONB,
  skills JSONB DEFAULT '[]',
  auth_type VARCHAR(20) DEFAULT 'bearer',
  auth_token TEXT,
  is_active BOOLEAN DEFAULT true,
  last_health_check TIMESTAMPTZ,
  health_status VARCHAR(20) DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_a2a_tasks_status ON work.a2a_tasks(status);
CREATE INDEX IF NOT EXISTS idx_work_a2a_tasks_skill ON work.a2a_tasks(skill_id);
CREATE INDEX IF NOT EXISTS idx_work_a2a_tasks_created ON work.a2a_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_a2a_external_agents_active ON work.a2a_external_agents(is_active) WHERE is_active = true;

-- ==========================================
-- Learning Schema
-- ==========================================

CREATE TABLE IF NOT EXISTS learning.a2a_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_task_id VARCHAR(255),
  skill_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'working', 'completed', 'failed', 'canceled')),
  message JSONB NOT NULL,
  artifacts JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  caller_agent_url TEXT,
  caller_agent_name VARCHAR(255),
  auth_method VARCHAR(20) DEFAULT 'bearer',
  execution_id UUID,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS learning.a2a_external_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  agent_card JSONB,
  skills JSONB DEFAULT '[]',
  auth_type VARCHAR(20) DEFAULT 'bearer',
  auth_token TEXT,
  is_active BOOLEAN DEFAULT true,
  last_health_check TIMESTAMPTZ,
  health_status VARCHAR(20) DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_a2a_tasks_status ON learning.a2a_tasks(status);
CREATE INDEX IF NOT EXISTS idx_learning_a2a_tasks_skill ON learning.a2a_tasks(skill_id);
CREATE INDEX IF NOT EXISTS idx_learning_a2a_tasks_created ON learning.a2a_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_a2a_external_agents_active ON learning.a2a_external_agents(is_active) WHERE is_active = true;

-- ==========================================
-- Creative Schema
-- ==========================================

CREATE TABLE IF NOT EXISTS creative.a2a_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_task_id VARCHAR(255),
  skill_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'working', 'completed', 'failed', 'canceled')),
  message JSONB NOT NULL,
  artifacts JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  caller_agent_url TEXT,
  caller_agent_name VARCHAR(255),
  auth_method VARCHAR(20) DEFAULT 'bearer',
  execution_id UUID,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS creative.a2a_external_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  agent_card JSONB,
  skills JSONB DEFAULT '[]',
  auth_type VARCHAR(20) DEFAULT 'bearer',
  auth_token TEXT,
  is_active BOOLEAN DEFAULT true,
  last_health_check TIMESTAMPTZ,
  health_status VARCHAR(20) DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_a2a_tasks_status ON creative.a2a_tasks(status);
CREATE INDEX IF NOT EXISTS idx_creative_a2a_tasks_skill ON creative.a2a_tasks(skill_id);
CREATE INDEX IF NOT EXISTS idx_creative_a2a_tasks_created ON creative.a2a_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creative_a2a_external_agents_active ON creative.a2a_external_agents(is_active) WHERE is_active = true;
