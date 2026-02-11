/**
 * Business Manager Frontend Type Definitions
 *
 * Types for the AI Business Manager dashboard components.
 */

// ============================================
// Overview
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
// Revenue
// ============================================

export interface RevenueMetrics {
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

export interface RevenueTimelinePoint {
  date: string;
  mrr: number;
  subscriptions: number;
}

export interface RevenueEvent {
  id: string;
  event_type: string;
  amount: number | null;
  currency: string;
  occurred_at: string;
}

// ============================================
// Traffic
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

// ============================================
// SEO
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

// ============================================
// Health & Performance
// ============================================

export interface HealthMetrics {
  uptime: number;
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

export interface PerformanceMetrics {
  score: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  lcp: number;
  fid: number;
  cls: number;
}

// ============================================
// Insights
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
}

export interface ActionItem {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================
// Reports
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
// Connectors
// ============================================

export type BusinessSourceType = 'stripe' | 'gsc' | 'ga4' | 'uptime' | 'lighthouse' | 'email';
export type BusinessSourceStatus = 'active' | 'inactive' | 'error';

export interface BusinessConnector {
  id: string;
  source_type: BusinessSourceType;
  display_name: string;
  status: BusinessSourceStatus;
  last_sync: string | null;
  last_error: string | null;
  created_at: string;
}

// ============================================
// Dashboard Tab Type
// ============================================

export type BusinessTab = 'overview' | 'revenue' | 'traffic' | 'seo' | 'health' | 'reports' | 'insights' | 'connectors';
