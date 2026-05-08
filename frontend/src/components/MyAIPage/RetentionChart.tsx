/**
 * RetentionChart - Pure SVG retention curve visualization
 *
 * Shows the FSRS retention decay curve (R = e^(-t/S)) over 30 days.
 * Marks the 90% target retention line and the next review day.
 */

interface RetentionChartProps {
  curvePoints: Array<{ day: number; retention: number }>;
  nextReviewDay?: number;
  targetRetention?: number;
}

const CHART_W = 400;
const CHART_H = 200;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 32;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

function toX(day: number): number {
  return PAD_L + (day / 30) * PLOT_W;
}

function toY(retention: number): number {
  return PAD_T + (1 - retention) * PLOT_H;
}

export function RetentionChart({
  curvePoints,
  nextReviewDay,
  targetRetention = 0.9,
}: RetentionChartProps) {
  if (!curvePoints || curvePoints.length < 2) return null;

  // Build smooth path using quadratic bezier curves
  const pathParts: string[] = [];
  pathParts.push(`M ${toX(curvePoints[0].day)} ${toY(curvePoints[0].retention)}`);
  for (let i = 1; i < curvePoints.length; i++) {
    const prev = curvePoints[i - 1];
    const curr = curvePoints[i];
    const cpX = (toX(prev.day) + toX(curr.day)) / 2;
    const cpY = toY(prev.retention);
    pathParts.push(`Q ${cpX} ${cpY} ${toX(curr.day)} ${toY(curr.retention)}`);
  }
  const curvePath = pathParts.join(' ');

  // Target retention line
  const targetY = toY(targetRetention);

  // Next review dot position
  let reviewDot: { cx: number; cy: number } | null = null;
  if (nextReviewDay != null && nextReviewDay >= 0 && nextReviewDay <= 30) {
    const point = curvePoints.find(p => p.day === Math.round(nextReviewDay));
    if (point) {
      reviewDot = { cx: toX(point.day), cy: toY(point.retention) };
    } else {
      // Interpolate
      const retention = Math.exp(-nextReviewDay / (curvePoints.length > 1 ? -1 / Math.log(curvePoints[1].retention || 0.99) : 1));
      reviewDot = { cx: toX(nextReviewDay), cy: toY(Math.max(0, Math.min(1, retention))) };
    }
  }

  // Y-axis tick values
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
  // X-axis tick values
  const xTicks = [0, 5, 10, 15, 20, 25, 30];

  return (
    <div className="retention-chart" role="img" aria-label="Behaltenskurve">
      <svg
        className="retention-chart-svg"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {yTicks.map(v => (
          <line
            key={`grid-y-${v}`}
            x1={PAD_L}
            y1={toY(v)}
            x2={CHART_W - PAD_R}
            y2={toY(v)}
            stroke="var(--border, rgba(0,0,0,0.06))"
            strokeWidth="0.5"
          />
        ))}

        {/* Target retention dashed line */}
        <line
          className="retention-target-line"
          x1={PAD_L}
          y1={targetY}
          x2={CHART_W - PAD_R}
          y2={targetY}
          stroke="var(--text-tertiary, #94a3b8)"
          strokeWidth="1"
          strokeDasharray="5 5"
        />
        <text
          x={CHART_W - PAD_R + 2}
          y={targetY + 3}
          fontSize="9"
          fill="var(--text-tertiary, #94a3b8)"
          textAnchor="start"
        >
          {Math.round(targetRetention * 100)}%
        </text>

        {/* Retention curve */}
        <path
          className="retention-curve-path"
          d={curvePath}
          fill="none"
          stroke="var(--color-primary, #144A56)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Review day dot */}
        {reviewDot && (
          <circle
            className="retention-review-dot"
            cx={reviewDot.cx}
            cy={reviewDot.cy}
            r="5"
            fill="var(--color-primary, #144A56)"
          />
        )}

        {/* Y-axis labels */}
        {yTicks.map(v => (
          <text
            key={`label-y-${v}`}
            x={PAD_L - 6}
            y={toY(v) + 4}
            fontSize="10"
            fill="var(--text-secondary, #64748b)"
            textAnchor="end"
          >
            {Math.round(v * 100)}%
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map(d => (
          <text
            key={`label-x-${d}`}
            x={toX(d)}
            y={CHART_H - 6}
            fontSize="10"
            fill="var(--text-secondary, #64748b)"
            textAnchor="middle"
          >
            {d}
          </text>
        ))}

        {/* Axis labels */}
        <text
          x={CHART_W / 2}
          y={CHART_H}
          fontSize="10"
          fill="var(--text-tertiary, #94a3b8)"
          textAnchor="middle"
        >
          Tage
        </text>
        <text
          x={10}
          y={CHART_H / 2}
          fontSize="10"
          fill="var(--text-tertiary, #94a3b8)"
          textAnchor="middle"
          transform={`rotate(-90, 10, ${CHART_H / 2})`}
        >
          Behalt %
        </text>
      </svg>
    </div>
  );
}
