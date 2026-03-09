/**
 * Phase 50: ProductivityCharts Component
 *
 * Recharts-based charts for task completion and focus time visualization.
 */

import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface TrendDataPoint {
  date: string;
  value: number;
}

interface ProductivityInsight {
  taskCompletionRate: number;
  avgTaskDuration: number;
  mostProductiveHour: number;
  focusTimeMinutes: number;
  contextSwitches: number;
}

interface ProductivityChartsProps {
  ideasTrend: TrendDataPoint[];
  tasksTrend: TrendDataPoint[];
  chatsTrend: TrendDataPoint[];
  productivity: ProductivityInsight | null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

// Merge trends into a single dataset for dual-axis chart
function mergeIdeasAndTasks(
  ideas: TrendDataPoint[],
  tasks: TrendDataPoint[]
): Array<{ date: string; ideas: number; tasks: number }> {
  const map = new Map<string, { ideas: number; tasks: number }>();

  for (const p of ideas) {
    const existing = map.get(p.date) || { ideas: 0, tasks: 0 };
    existing.ideas = p.value;
    map.set(p.date, existing);
  }
  for (const p of tasks) {
    const existing = map.get(p.date) || { ideas: 0, tasks: 0 };
    existing.tasks = p.value;
    map.set(p.date, existing);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));
}

const CHART_COLORS = {
  ideas: '#ff6b35',   // Orange (brand)
  tasks: '#22c55e',   // Green
  chats: '#3b82f6',   // Blue
  grid: 'rgba(255,255,255,0.06)',
  text: 'rgba(255,255,255,0.6)',
};

export const ProductivityCharts: React.FC<ProductivityChartsProps> = ({
  ideasTrend,
  tasksTrend,
  chatsTrend,
  productivity,
}) => {
  const mergedData = mergeIdeasAndTasks(ideasTrend, tasksTrend);
  const chatData = chatsTrend.map(p => ({
    date: p.date,
    minutes: p.value,
  }));

  return (
    <div className="av2-charts">
      {/* Productivity KPIs */}
      {productivity && (
        <div className="av2-productivity-kpis">
          <div className="av2-kpi-card">
            <span className="av2-kpi-value">{productivity.taskCompletionRate}%</span>
            <span className="av2-kpi-label">Abschlussrate</span>
          </div>
          <div className="av2-kpi-card">
            <span className="av2-kpi-value">{productivity.avgTaskDuration.toFixed(1)}h</span>
            <span className="av2-kpi-label">Durchschn. Dauer</span>
          </div>
          <div className="av2-kpi-card">
            <span className="av2-kpi-value">{productivity.mostProductiveHour}:00</span>
            <span className="av2-kpi-label">Produktivste Stunde</span>
          </div>
          <div className="av2-kpi-card">
            <span className="av2-kpi-value">{Math.round(productivity.focusTimeMinutes)}m</span>
            <span className="av2-kpi-label">Fokuszeit</span>
          </div>
          <div className="av2-kpi-card">
            <span className="av2-kpi-value">{productivity.contextSwitches.toFixed(1)}</span>
            <span className="av2-kpi-label">Kontextwechsel/Tag</span>
          </div>
        </div>
      )}

      {/* Ideas vs Tasks Line Chart */}
      {mergedData.length > 0 && (
        <div className="av2-chart-section">
          <h4 className="av2-chart-title">Gedanken vs. Aufgaben</h4>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={mergedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke={CHART_COLORS.text}
                tick={{ fontSize: 11 }}
              />
              <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15, 30, 40, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#f5f9fc',
                  fontSize: 12,
                }}
                labelFormatter={(label) => formatDate(String(label))}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: CHART_COLORS.text }} />
              <Line
                type="monotone"
                dataKey="ideas"
                name="Gedanken"
                stroke={CHART_COLORS.ideas}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS.ideas }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="tasks"
                name="Aufgaben"
                stroke={CHART_COLORS.tasks}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS.tasks }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chat Focus Time Bar Chart */}
      {chatData.length > 0 && (
        <div className="av2-chart-section">
          <h4 className="av2-chart-title">Chat-Sessions pro Tag</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chatData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke={CHART_COLORS.text}
                tick={{ fontSize: 11 }}
              />
              <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15, 30, 40, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#f5f9fc',
                  fontSize: 12,
                }}
                labelFormatter={(label) => formatDate(String(label))}
              />
              <Bar
                dataKey="minutes"
                name="Sessions"
                fill={CHART_COLORS.chats}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {mergedData.length === 0 && chatData.length === 0 && (
        <div className="av2-empty-charts">
          <p>Keine Daten im ausgewaehlten Zeitraum vorhanden.</p>
        </div>
      )}
    </div>
  );
};
