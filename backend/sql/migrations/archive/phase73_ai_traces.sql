-- Phase 73: AI Observability - Langfuse-style Trace & Span Storage
-- Tables in PUBLIC schema (traces are global, not per-context)

-- AI Traces: top-level trace for each AI operation
CREATE TABLE IF NOT EXISTS ai_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  user_id UUID,
  name TEXT NOT NULL,
  input JSONB,
  output JSONB,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Spans: individual steps within a trace (generation, RAG, tool, agent)
CREATE TABLE IF NOT EXISTS ai_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL REFERENCES ai_traces(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES ai_spans(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('rag', 'tool', 'agent', 'generation', 'custom')),
  input JSONB,
  output JSONB,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_traces_start_time ON ai_traces(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_ai_traces_user_id ON ai_traces(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_traces_session_id ON ai_traces(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_traces_name ON ai_traces(name);

CREATE INDEX IF NOT EXISTS idx_ai_spans_trace_id ON ai_spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_ai_spans_parent_id ON ai_spans(parent_id);
CREATE INDEX IF NOT EXISTS idx_ai_spans_type ON ai_spans(type);
CREATE INDEX IF NOT EXISTS idx_ai_spans_start_time ON ai_spans(start_time DESC);
