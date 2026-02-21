-- Fix: Add UNIQUE constraints to prevent duplicate business metrics snapshots and audits
-- Required for ON CONFLICT clauses in data-aggregator.ts and lighthouse-connector.ts

-- Prevent duplicate snapshots per day+type
CREATE UNIQUE INDEX IF NOT EXISTS idx_bms_date_type_unique
  ON business_metrics_snapshots (snapshot_date, snapshot_type);

-- Prevent duplicate lighthouse audits per URL+day
CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_scores_url_date_unique
  ON performance_scores (url, audit_date);
