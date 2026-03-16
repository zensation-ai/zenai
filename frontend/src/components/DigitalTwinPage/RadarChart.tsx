/**
 * RadarChart - SVG-based pentagon radar chart
 *
 * Renders 5 axes (Analytical, Creative, Organized, Social, Technical)
 * with animated fill polygon, labels, and hover scores.
 */

import React, { useState, useMemo } from 'react';

export interface RadarScores {
  analytical: number;
  creative: number;
  organized: number;
  social: number;
  technical: number;
}

interface RadarChartProps {
  scores: RadarScores;
  size?: number;
}

const AXES: { key: keyof RadarScores; label: string }[] = [
  { key: 'analytical', label: 'Analytisch' },
  { key: 'creative', label: 'Kreativ' },
  { key: 'organized', label: 'Organisiert' },
  { key: 'social', label: 'Sozial' },
  { key: 'technical', label: 'Technisch' },
];

const LEVELS = [20, 40, 60, 80, 100];

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleIndex: number,
  total: number,
): { x: number; y: number } {
  const angle = (Math.PI * 2 * angleIndex) / total - Math.PI / 2;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export const RadarChart: React.FC<RadarChartProps> = ({ scores, size = 280 }) => {
  const [hoveredAxis, setHoveredAxis] = useState<keyof RadarScores | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.38;
  const labelRadius = size * 0.47;
  const count = AXES.length;

  const gridPolygons = useMemo(() => {
    return LEVELS.map((level) => {
      const r = (level / 100) * maxRadius;
      const points = AXES.map((_, i) => {
        const p = polarToCartesian(cx, cy, r, i, count);
        return `${p.x},${p.y}`;
      }).join(' ');
      return { level, points };
    });
  }, [cx, cy, maxRadius, count]);

  const dataPoints = useMemo(() => {
    return AXES.map((axis, i) => {
      const value = scores[axis.key];
      const r = (value / 100) * maxRadius;
      return polarToCartesian(cx, cy, r, i, count);
    });
  }, [scores, cx, cy, maxRadius, count]);

  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  const axisLines = useMemo(() => {
    return AXES.map((_, i) => {
      const outer = polarToCartesian(cx, cy, maxRadius, i, count);
      return { x1: cx, y1: cy, x2: outer.x, y2: outer.y };
    });
  }, [cx, cy, maxRadius, count]);

  const labels = useMemo(() => {
    return AXES.map((axis, i) => {
      const pos = polarToCartesian(cx, cy, labelRadius, i, count);
      return { ...axis, x: pos.x, y: pos.y };
    });
  }, [cx, cy, labelRadius, count]);

  return (
    <div className="radar-chart-container">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="radar-chart-svg"
      >
        {/* Grid polygons */}
        {gridPolygons.map(({ level, points }) => (
          <polygon
            key={level}
            points={points}
            fill="none"
            stroke="var(--border-secondary, #e2e8f0)"
            strokeWidth="1"
            opacity={0.5}
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <line
            key={i}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="var(--border-secondary, #e2e8f0)"
            strokeWidth="1"
            opacity={0.4}
          />
        ))}

        {/* Data polygon */}
        <polygon
          points={dataPolygon}
          fill="var(--brand-primary, #6366f1)"
          fillOpacity={0.2}
          stroke="var(--brand-primary, #6366f1)"
          strokeWidth="2"
          className="radar-data-polygon"
        />

        {/* Data points */}
        {dataPoints.map((point, i) => (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={hoveredAxis === AXES[i].key ? 6 : 4}
            fill="var(--brand-primary, #6366f1)"
            stroke="white"
            strokeWidth="2"
            className="radar-data-point"
            onMouseEnter={() => setHoveredAxis(AXES[i].key)}
            onMouseLeave={() => setHoveredAxis(null)}
          />
        ))}

        {/* Labels */}
        {labels.map((label) => (
          <text
            key={label.key}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="radar-label"
            fontSize="12"
            fill="var(--text-secondary, #64748b)"
            fontWeight={hoveredAxis === label.key ? 600 : 400}
          >
            {label.label}
          </text>
        ))}

        {/* Hover score tooltip */}
        {hoveredAxis && (
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="middle"
            className="radar-score-label"
            fontSize="20"
            fontWeight="700"
            fill="var(--text-primary, #1e293b)"
          >
            {scores[hoveredAxis]}
          </text>
        )}
      </svg>
    </div>
  );
};
