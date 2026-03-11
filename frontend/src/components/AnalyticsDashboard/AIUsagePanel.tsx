/**
 * Phase 50: AI Usage Panel
 *
 * Visualizes AI API usage: token consumption, cost trends,
 * model breakdown, and feature distribution.
 */

import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ===========================================
// Types
// ===========================================

interface DailyUsageData {
  date: string;
  tokens: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  requestCount: number;
}

interface ModelBreakdown {
  tokens: number;
  cost: number;
  count: number;
}

interface FeatureBreakdown {
  tokens: number;
  cost: number;
  count: number;
}

interface AIUsagePanelProps {
  dailyUsage: DailyUsageData[];
  byModel: Record<string, ModelBreakdown>;
  byFeature: Record<string, FeatureBreakdown>;
  totalTokens: number;
  totalCost: number;
  budgetUsd?: number;
}

// ===========================================
// Constants
// ===========================================

const COLORS = {
  input: '#3b82f6',     // Blue
  output: '#22c55e',    // Green
  thinking: '#a855f7',  // Purple
  cost: '#ff6b35',      // Orange (brand)
  budget: '#ef4444',    // Red
  grid: 'rgba(255,255,255,0.06)',
  text: 'rgba(255,255,255,0.6)',
};

const PIE_COLORS = ['#ff6b35', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4'];

const FEATURE_LABELS: Record<string, string> = {
  chat: 'Chat',
  rag: 'RAG',
  vision: 'Vision',
  code_execution: 'Code',
  agent: 'Agent',
  other: 'Sonstige',
};

// ===========================================
// Helpers
// ===========================================

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

// ===========================================
// Component
// ===========================================

export const AIUsagePanel: React.FC<AIUsagePanelProps> = ({
  dailyUsage,
  byModel,
  byFeature,
  totalTokens,
  totalCost,
  budgetUsd,
}) => {
  // Prepare model pie data
  const modelPieData = useMemo(() => {
    return Object.entries(byModel).map(([name, data]) => ({
      name: name.replace('claude-', '').replace(/-\d+$/, ''),
      value: data.cost,
      tokens: data.tokens,
      count: data.count,
    }));
  }, [byModel]);

  // Prepare feature pie data
  const featurePieData = useMemo(() => {
    return Object.entries(byFeature).map(([name, data]) => ({
      name: FEATURE_LABELS[name] || name,
      value: data.tokens,
      cost: data.cost,
      count: data.count,
    }));
  }, [byFeature]);

  // Cost data with optional budget line
  const costData = useMemo(() => {
    return dailyUsage.map((d) => ({
      date: d.date,
      cost: d.cost,
      budget: budgetUsd ? budgetUsd / (dailyUsage.length || 1) : undefined,
    }));
  }, [dailyUsage, budgetUsd]);

  return (
    <div className="ai-usage-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
        <SummaryCard label="Tokens gesamt" value={formatTokens(totalTokens)} />
        <SummaryCard label="Kosten gesamt" value={formatCost(totalCost)} />
        <SummaryCard
          label="Anfragen"
          value={String(dailyUsage.reduce((sum, d) => sum + d.requestCount, 0))}
        />
        {budgetUsd !== undefined && (
          <SummaryCard
            label="Budget"
            value={`${formatCost(totalCost)} / ${formatCost(budgetUsd)}`}
            alert={totalCost > budgetUsd}
          />
        )}
      </div>

      {/* Token Usage Stacked Bar Chart */}
      <div style={sectionStyle}>
        <h4 style={headingStyle}>Token-Verbrauch pro Tag</h4>
        {dailyUsage.length === 0 ? (
          <EmptyState text="Keine Nutzungsdaten vorhanden" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dailyUsage}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: COLORS.text, fontSize: 11 }} />
              <YAxis tickFormatter={formatTokens} tick={{ fill: COLORS.text, fontSize: 11 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: unknown, name: unknown) => [formatTokens(Number(value)), String(name)]}
              />
              <Legend />
              <Bar dataKey="inputTokens" name="Input" stackId="tokens" fill={COLORS.input} />
              <Bar dataKey="outputTokens" name="Output" stackId="tokens" fill={COLORS.output} />
              <Bar dataKey="thinkingTokens" name="Thinking" stackId="tokens" fill={COLORS.thinking} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Cost Line Chart */}
      <div style={sectionStyle}>
        <h4 style={headingStyle}>Kosten pro Tag</h4>
        {costData.length === 0 ? (
          <EmptyState text="Keine Kostendaten vorhanden" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: COLORS.text, fontSize: 11 }} />
              <YAxis tickFormatter={(v: unknown) => `$${Number(v).toFixed(2)}`} tick={{ fill: COLORS.text, fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [formatCost(Number(v))]} />
              <Line type="monotone" dataKey="cost" stroke={COLORS.cost} strokeWidth={2} dot={{ r: 3 }} name="Kosten" />
              {budgetUsd && (
                <Line
                  type="monotone"
                  dataKey="budget"
                  stroke={COLORS.budget}
                  strokeDasharray="5 5"
                  strokeWidth={1}
                  dot={false}
                  name="Budget"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Breakdown Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Model Breakdown */}
        <div style={sectionStyle}>
          <h4 style={headingStyle}>Nach Modell</h4>
          {modelPieData.length === 0 ? (
            <EmptyState text="Keine Modelldaten" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={modelPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  dataKey="value"
                  label={(props) =>
                    `${String(props.name ?? '')} ${((props.percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {modelPieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [formatCost(Number(v)), 'Kosten']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Feature Breakdown */}
        <div style={sectionStyle}>
          <h4 style={headingStyle}>Nach Feature</h4>
          {featurePieData.length === 0 ? (
            <EmptyState text="Keine Featuredaten" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={featurePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  dataKey="value"
                  label={(props) =>
                    `${String(props.name ?? '')} ${((props.percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {featurePieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [formatTokens(Number(v)), 'Tokens']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

// ===========================================
// Sub-Components
// ===========================================

const SummaryCard: React.FC<{ label: string; value: string; alert?: boolean }> = ({
  label,
  value,
  alert,
}) => (
  <div
    style={{
      background: alert ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
      borderRadius: '0.75rem',
      padding: '1rem',
      border: alert ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.06)',
    }}
  >
    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem' }}>
      {label}
    </div>
    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: alert ? '#ef4444' : 'rgba(255,255,255,0.9)' }}>
      {value}
    </div>
  </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '120px',
      color: 'rgba(255,255,255,0.4)',
      fontSize: '0.875rem',
    }}
  >
    {text}
  </div>
);

// ===========================================
// Styles
// ===========================================

const sectionStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  borderRadius: '0.75rem',
  padding: '1rem',
  border: '1px solid rgba(255,255,255,0.06)',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 0.75rem 0',
  fontSize: '0.875rem',
  fontWeight: 500,
  color: 'rgba(255,255,255,0.7)',
};

const tooltipStyle: React.CSSProperties = {
  background: 'rgba(20,20,30,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '0.5rem',
  color: 'rgba(255,255,255,0.9)',
  fontSize: '0.8rem',
};

export default AIUsagePanel;
