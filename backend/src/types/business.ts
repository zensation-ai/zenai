/**
 * Business Manager Type Definitions
 *
 * Types for the AI Business Manager feature - external data connectors,
 * business metrics, insights, and reporting.
 */

// ============================================
// Data Source Types
// ============================================

export type BusinessSourceType = 'stripe' | 'gsc' | 'ga4' | 'uptime' | 'lighthouse' | 'email';
export type BusinessSourceStatus = 'active' | 'inactive' | 'error';

export interface BusinessDataSource {
  id: string;
  source_type: BusinessSourceType;
  display_name: string;
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
  status: BusinessSourceStatus;
  last_sync: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Stripe / Revenue Types
// ============================================

export interface StripeMetrics {
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  churnRate: number;
  mrrGrowth: number;
  totalCustomers: number;
  recentPayments: RecentPayment[];
}

export interface RecentPayment {
  id: string;
  amount: number;
  currency: string;
  customer_id: string;
  status: string;
  occurred_at: string;
}

export interface RevenueEvent {
  id: string;
  event_type: string;
  stripe_event_id: string | null;
  customer_id: string | null;
  amount: number | null;
  currency: string;
  event_data: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface RevenueTimeline {
  date: string;
  mrr: number;
  subscriptions: number;
}

// ============================================
// Traffic Types (GA4)
// ============================================

export interface TrafficMetrics {
  users: number;
  newUsers: number;
  sessions: number;
  pageviews: number;
  bounceRate: number;
  avgSessionDuration: number;
  conversions: number;
  usersGrowth: number;
  topPages: TopPage[];
  trafficSources: TrafficSource[];
}

export interface TopPage {
  page: string;
  views: number;
  bounceRate: number;
}

export interface TrafficSource {
  source: string;
  users: number;
  sessions: number;
}

export interface TrafficSnapshot {
  id: string;
  snapshot_date: string;
  users: number;
  new_users: number;
  sessions: number;
  pageviews: number;
  bounce_rate: number | null;
  avg_session_duration: number | null;
  conversions: number;
  top_pages: TopPage[];
  traffic_sources: TrafficSource[];
  created_at: string;
}

// ============================================
// SEO Types (Google Search Console)
// ============================================

export interface SEOMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  avgPosition: number;
  impressionsGrowth: number;
  clicksGrowth: number;
  topQueries: SEOQuery[];
  topPages: SEOPage[];
}

export interface SEOQuery {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

export interface SEOPage {
  page: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

export interface SEOSnapshot {
  id: string;
  snapshot_date: string;
  total_impressions: number;
  total_clicks: number;
  avg_ctr: number | null;
  avg_position: number | null;
  top_queries: SEOQuery[];
  top_pages: SEOPage[];
  created_at: string;
}

// ============================================
// Uptime Types
// ============================================

export interface UptimeStatus {
  percentage: number;
  avgResponseTime: number;
  incidents: UptimeIncident[];
  monitors: UptimeMonitor[];
}

export interface UptimeMonitor {
  id: string;
  name: string;
  status: 'up' | 'down' | 'paused';
  uptime: number;
  responseTime: number;
}

export interface UptimeIncident {
  id: string;
  monitorName: string;
  description: string;
  occurredAt: string;
  resolvedAt: string | null;
  duration: number | null;
}

export interface UptimeEvent {
  id: string;
  monitor_id: string;
  monitor_name: string;
  event_type: 'down' | 'up' | 'check' | 'paused';
  status_code: number | null;
  response_time: number | null;
  occurred_at: string;
  resolved_at: string | null;
  incident_duration: number | null;
  created_at: string;
}

// ============================================
// Performance Types (Lighthouse)
// ============================================

export interface PerformanceMetrics {
  score: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  lcp: number;
  fid: number;
  cls: number;
}

export interface PerformanceScore {
  id: string;
  url: string;
  audit_date: string;
  performance_score: number | null;
  accessibility_score: number | null;
  best_practices_score: number | null;
  seo_score: number | null;
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  metrics: Record<string, unknown>;
  created_at: string;
}

// ============================================
// Business Overview (Aggregated)
// ============================================

export interface BusinessOverview {
  revenue: {
    mrr: number;
    mrrGrowth: number;
    activeSubscriptions: number;
    churnRate: number;
  };
  traffic: {
    users: number;
    usersGrowth: number;
    sessions: number;
    bounceRate: number;
  };
  seo: {
    impressions: number;
    clicks: number;
    ctr: number;
    avgPosition: number;
  };
  health: {
    uptime: number;
    activeIncidents: number;
    avgResponseTime: number;
  };
  performance: {
    score: number;
    lcp: number;
    fid: number;
    cls: number;
  };
}

// ============================================
// Insights Types
// ============================================

export type InsightType = 'anomaly' | 'trend' | 'recommendation' | 'alert' | 'milestone';
export type InsightSeverity = 'info' | 'warning' | 'critical';
export type InsightStatus = 'active' | 'dismissed' | 'acted_on' | 'expired';

export interface BusinessInsight {
  id: string;
  insight_type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  data_source: string | null;
  related_metrics: Record<string, unknown>;
  action_items: ActionItem[];
  status: InsightStatus;
  generated_at: string;
  dismissed_at: string | null;
  created_at: string;
}

export interface ActionItem {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================
// Report Types
// ============================================

export type ReportType = 'weekly' | 'monthly' | 'quarterly' | 'custom';

export interface BusinessReport {
  id: string;
  report_type: ReportType;
  period_start: string;
  period_end: string;
  summary: string;
  metrics: Record<string, unknown>;
  insights: Record<string, unknown>[];
  recommendations: ActionItem[];
  generated_at: string;
}

// ============================================
// Metrics Snapshot (JSONB storage)
// ============================================

export interface BusinessMetricsSnapshot {
  id: string;
  snapshot_date: string;
  snapshot_type: 'hourly' | 'daily' | 'weekly' | 'monthly';
  metrics: {
    stripe?: Partial<StripeMetrics>;
    ga4?: Partial<TrafficMetrics>;
    gsc?: Partial<SEOMetrics>;
    uptime?: Partial<UptimeStatus>;
    lighthouse?: Partial<PerformanceMetrics>;
  };
  created_at: string;
}

// ============================================
// Connector Interface (for all data sources)
// ============================================

export interface BusinessConnector {
  readonly sourceType: BusinessSourceType;
  initialize(): Promise<void>;
  isAvailable(): boolean;
  testConnection(): Promise<{ success: boolean; message: string }>;
  collectMetrics(): Promise<Record<string, unknown>>;
}
