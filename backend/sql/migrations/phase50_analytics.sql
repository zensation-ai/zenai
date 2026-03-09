-- Phase 50: AI Usage Analytics
-- Tracks AI API usage for cost monitoring and analytics
-- Stored in PUBLIC schema (not per-context) since it's cross-context data

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model VARCHAR(50) NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  thinking_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  feature VARCHAR(30) NOT NULL,
  context VARCHAR(20),
  response_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created ON public.ai_usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_feature ON public.ai_usage_log(feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_model ON public.ai_usage_log(model);
