-- ===========================================
-- Phase 34: AI Business Manager
-- Business Intelligence Dashboard Tables
-- ===========================================
-- These tables live in the PUBLIC schema (not context-specific)
-- because business data is global across all contexts.

-- -----------------------------------------------
-- 1. Data Source Connections
-- Stores connector configurations (OAuth tokens, API keys)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS business_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('stripe', 'gsc', 'ga4', 'uptime', 'lighthouse', 'email')),
  display_name VARCHAR(100) NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}',
  config JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_sync TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_sources_type ON business_data_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_business_sources_status ON business_data_sources(status);

-- -----------------------------------------------
-- 2. Business Metrics Snapshots
-- Aggregated metrics stored periodically (hourly/daily/weekly)
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS business_metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  snapshot_type VARCHAR(20) NOT NULL CHECK (snapshot_type IN ('hourly', 'daily', 'weekly', 'monthly')),
  metrics JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bms_date ON business_metrics_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_bms_type ON business_metrics_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_bms_date_type ON business_metrics_snapshots(snapshot_date DESC, snapshot_type);

-- -----------------------------------------------
-- 3. Revenue Events (Stripe Webhooks)
-- Real-time payment and subscription events
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  stripe_event_id VARCHAR(100) UNIQUE,
  customer_id VARCHAR(100),
  amount BIGINT,
  currency VARCHAR(3) DEFAULT 'EUR',
  event_data JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_events_date ON revenue_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_events_type ON revenue_events(event_type);
CREATE INDEX IF NOT EXISTS idx_revenue_events_stripe ON revenue_events(stripe_event_id);

-- -----------------------------------------------
-- 4. Traffic Snapshots (Google Analytics 4)
-- Daily website traffic metrics
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS traffic_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  users INT DEFAULT 0,
  new_users INT DEFAULT 0,
  sessions INT DEFAULT 0,
  pageviews INT DEFAULT 0,
  bounce_rate DECIMAL(5, 2),
  avg_session_duration INT,
  conversions INT DEFAULT 0,
  top_pages JSONB DEFAULT '[]',
  traffic_sources JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_traffic_snapshots_date ON traffic_snapshots(snapshot_date DESC);

-- -----------------------------------------------
-- 5. SEO Snapshots (Google Search Console)
-- Daily search performance metrics
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS seo_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  total_impressions BIGINT DEFAULT 0,
  total_clicks BIGINT DEFAULT 0,
  avg_ctr DECIMAL(5, 2),
  avg_position DECIMAL(5, 2),
  top_queries JSONB DEFAULT '[]',
  top_pages JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seo_snapshots_date ON seo_snapshots(snapshot_date DESC);

-- -----------------------------------------------
-- 6. Uptime Events
-- Monitoring checks and incident tracking
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS uptime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id VARCHAR(100) NOT NULL,
  monitor_name VARCHAR(200) NOT NULL,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('down', 'up', 'check', 'paused')),
  status_code INT,
  response_time INT,
  occurred_at TIMESTAMP NOT NULL,
  resolved_at TIMESTAMP,
  incident_duration INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uptime_events_date ON uptime_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_uptime_events_monitor ON uptime_events(monitor_id);

-- -----------------------------------------------
-- 7. Performance Scores (Lighthouse / PageSpeed)
-- Web performance audit results
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS performance_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url VARCHAR(500) NOT NULL,
  audit_date DATE NOT NULL,
  performance_score INT CHECK (performance_score BETWEEN 0 AND 100),
  accessibility_score INT CHECK (accessibility_score BETWEEN 0 AND 100),
  best_practices_score INT CHECK (best_practices_score BETWEEN 0 AND 100),
  seo_score INT CHECK (seo_score BETWEEN 0 AND 100),
  lcp INT,
  fid INT,
  cls DECIMAL(4, 3),
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perf_scores_date ON performance_scores(audit_date DESC);
CREATE INDEX IF NOT EXISTS idx_perf_scores_url ON performance_scores(url);

-- -----------------------------------------------
-- 8. AI-Generated Business Insights
-- Anomalies, trends, recommendations, alerts
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS business_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type VARCHAR(50) NOT NULL CHECK (insight_type IN ('anomaly', 'trend', 'recommendation', 'alert', 'milestone')),
  severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  data_source VARCHAR(50),
  related_metrics JSONB DEFAULT '{}',
  action_items JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'acted_on', 'expired')),
  generated_at TIMESTAMP DEFAULT NOW(),
  dismissed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_date ON business_insights(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_type ON business_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_status ON business_insights(status);
CREATE INDEX IF NOT EXISTS idx_insights_severity ON business_insights(severity);

-- -----------------------------------------------
-- 9. Generated Business Reports
-- Weekly/monthly AI-generated executive summaries
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS business_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('weekly', 'monthly', 'quarterly', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}',
  insights JSONB NOT NULL DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  generated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_period ON business_reports(period_end DESC);
CREATE INDEX IF NOT EXISTS idx_reports_type ON business_reports(report_type);

-- -----------------------------------------------
-- Updated_at trigger
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION update_business_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS business_sources_updated_at ON business_data_sources;
CREATE TRIGGER business_sources_updated_at
  BEFORE UPDATE ON business_data_sources
  FOR EACH ROW EXECUTE FUNCTION update_business_updated_at();
