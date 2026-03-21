-- Phase 61: Observability & Queue Tables
-- Creates job_history and metric_snapshots in ALL 4 schemas
-- Idempotent: uses CREATE TABLE IF NOT EXISTS

-- ===========================================
-- Schema: personal
-- ===========================================

CREATE TABLE IF NOT EXISTS personal.job_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name VARCHAR(100) NOT NULL,
  job_name VARCHAR(200) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  data JSONB DEFAULT '{}',
  result JSONB DEFAULT NULL,
  error TEXT DEFAULT NULL,
  attempts INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_job_history_queue ON personal.job_history(queue_name);
CREATE INDEX IF NOT EXISTS idx_personal_job_history_status ON personal.job_history(status);
CREATE INDEX IF NOT EXISTS idx_personal_job_history_created ON personal.job_history(created_at DESC);

CREATE TABLE IF NOT EXISTS personal.metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(200) NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  labels JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_metric_snapshots_name ON personal.metric_snapshots(metric_name);
CREATE INDEX IF NOT EXISTS idx_personal_metric_snapshots_recorded ON personal.metric_snapshots(recorded_at DESC);

-- ===========================================
-- Schema: work
-- ===========================================

CREATE TABLE IF NOT EXISTS work.job_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name VARCHAR(100) NOT NULL,
  job_name VARCHAR(200) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  data JSONB DEFAULT '{}',
  result JSONB DEFAULT NULL,
  error TEXT DEFAULT NULL,
  attempts INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_job_history_queue ON work.job_history(queue_name);
CREATE INDEX IF NOT EXISTS idx_work_job_history_status ON work.job_history(status);
CREATE INDEX IF NOT EXISTS idx_work_job_history_created ON work.job_history(created_at DESC);

CREATE TABLE IF NOT EXISTS work.metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(200) NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  labels JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_metric_snapshots_name ON work.metric_snapshots(metric_name);
CREATE INDEX IF NOT EXISTS idx_work_metric_snapshots_recorded ON work.metric_snapshots(recorded_at DESC);

-- ===========================================
-- Schema: learning
-- ===========================================

CREATE TABLE IF NOT EXISTS learning.job_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name VARCHAR(100) NOT NULL,
  job_name VARCHAR(200) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  data JSONB DEFAULT '{}',
  result JSONB DEFAULT NULL,
  error TEXT DEFAULT NULL,
  attempts INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_job_history_queue ON learning.job_history(queue_name);
CREATE INDEX IF NOT EXISTS idx_learning_job_history_status ON learning.job_history(status);
CREATE INDEX IF NOT EXISTS idx_learning_job_history_created ON learning.job_history(created_at DESC);

CREATE TABLE IF NOT EXISTS learning.metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(200) NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  labels JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_metric_snapshots_name ON learning.metric_snapshots(metric_name);
CREATE INDEX IF NOT EXISTS idx_learning_metric_snapshots_recorded ON learning.metric_snapshots(recorded_at DESC);

-- ===========================================
-- Schema: creative
-- ===========================================

CREATE TABLE IF NOT EXISTS creative.job_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name VARCHAR(100) NOT NULL,
  job_name VARCHAR(200) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  data JSONB DEFAULT '{}',
  result JSONB DEFAULT NULL,
  error TEXT DEFAULT NULL,
  attempts INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_job_history_queue ON creative.job_history(queue_name);
CREATE INDEX IF NOT EXISTS idx_creative_job_history_status ON creative.job_history(status);
CREATE INDEX IF NOT EXISTS idx_creative_job_history_created ON creative.job_history(created_at DESC);

CREATE TABLE IF NOT EXISTS creative.metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(200) NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  labels JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_metric_snapshots_name ON creative.metric_snapshots(metric_name);
CREATE INDEX IF NOT EXISTS idx_creative_metric_snapshots_recorded ON creative.metric_snapshots(recorded_at DESC);
