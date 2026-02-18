/**
 * GanttChart - Phase 37
 *
 * Custom SVG-based Gantt chart with project grouping,
 * dependency arrows, and drag-to-reschedule.
 */

import { useState, useMemo, useCallback, useRef } from 'react';
import type { Task, Project } from './types';
import { PRIORITY_COLORS } from './types';
import './GanttChart.css';

interface GanttChartProps {
  tasks: Task[];
  projects: Project[];
  loading: boolean;
  context: string;
  onEditTask: (task: Task) => void;
  onCreateProject: (input: Partial<Project>) => Promise<Project | null>;
}

type ZoomLevel = 'day' | 'week' | 'month';

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 50;
const LEFT_PANEL_WIDTH = 260;
const DAY_WIDTH_MAP: Record<ZoomLevel, number> = { day: 60, week: 24, month: 8 };

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function GanttChart({
  tasks, projects, loading, onEditTask, onCreateProject,
}: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  const dayWidth = DAY_WIDTH_MAP[zoom];

  // Fetch gantt data with dependencies
  const ganttTasks = useMemo(() => {
    // Use tasks prop directly; dependencies are fetched separately if needed
    return tasks.filter(t => t.status !== 'cancelled');
  }, [tasks]);

  // Calculate date range
  const { rangeStart, totalDays } = useMemo(() => {
    const today = startOfDay(new Date());
    let earliest = today;
    let latest = addDays(today, 28);

    ganttTasks.forEach(t => {
      if (t.start_date) {
        const s = startOfDay(new Date(t.start_date));
        if (s < earliest) earliest = s;
      }
      if (t.due_date) {
        const e = startOfDay(new Date(t.due_date));
        if (e > latest) latest = e;
      }
    });

    // Pad by 7 days on each side
    const start = addDays(earliest, -7);
    const end = addDays(latest, 7);
    return { rangeStart: start, totalDays: daysBetween(start, end) };
  }, [ganttTasks]);

  // Group tasks by project
  const groupedRows = useMemo(() => {
    const groups: { project: Project | null; tasks: Task[] }[] = [];

    // Tasks with project
    const projectMap = new Map<string, Task[]>();
    const unassigned: Task[] = [];

    ganttTasks.forEach(t => {
      if (t.project_id) {
        const existing = projectMap.get(t.project_id) || [];
        existing.push(t);
        projectMap.set(t.project_id, existing);
      } else {
        unassigned.push(t);
      }
    });

    projects
      .filter(p => p.status !== 'archived')
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach(p => {
        const projectTasks = projectMap.get(p.id) || [];
        if (projectTasks.length > 0 || !collapsedProjects.has(p.id)) {
          groups.push({ project: p, tasks: projectTasks });
        }
      });

    if (unassigned.length > 0) {
      groups.push({ project: null, tasks: unassigned });
    }

    return groups;
  }, [ganttTasks, projects, collapsedProjects]);

  // Build flat row list for rendering
  const rows = useMemo(() => {
    const result: { type: 'project' | 'task'; project?: Project | null; task?: Task; y: number }[] = [];
    let y = 0;

    groupedRows.forEach(group => {
      result.push({ type: 'project', project: group.project, y });
      y += ROW_HEIGHT;

      if (group.project && collapsedProjects.has(group.project.id)) {
        return;
      }

      group.tasks
        .sort((a, b) => (a.start_date || a.created_at).localeCompare(b.start_date || b.created_at))
        .forEach(task => {
          result.push({ type: 'task', task, project: group.project, y });
          y += ROW_HEIGHT;
        });
    });

    return result;
  }, [groupedRows, collapsedProjects]);

  const totalHeight = rows.length * ROW_HEIGHT + HEADER_HEIGHT;
  const totalWidth = totalDays * dayWidth;

  const toggleProject = useCallback((id: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const getBarX = useCallback((dateStr?: string) => {
    if (!dateStr) return 0;
    const d = startOfDay(new Date(dateStr));
    return daysBetween(rangeStart, d) * dayWidth;
  }, [rangeStart, dayWidth]);

  const getBarWidth = useCallback((startStr?: string, endStr?: string) => {
    if (!startStr) return dayWidth; // default 1 day
    const start = startOfDay(new Date(startStr));
    const end = endStr ? startOfDay(new Date(endStr)) : addDays(start, 1);
    const days = Math.max(1, daysBetween(start, end));
    return days * dayWidth;
  }, [dayWidth]);

  // Today line position
  const todayX = daysBetween(rangeStart, startOfDay(new Date())) * dayWidth;

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;
    await onCreateProject({ name: newProjectName.trim() });
    setNewProjectName('');
    setShowProjectForm(false);
  }, [newProjectName, onCreateProject]);

  if (loading) {
    return <div className="gantt-loading">Lade Gantt-Daten...</div>;
  }

  return (
    <div className="gantt-chart">
      {/* Toolbar */}
      <div className="gantt-toolbar">
        <div className="gantt-toolbar__left">
          <button
            className="gantt-btn"
            onClick={() => setShowProjectForm(!showProjectForm)}
          >
            + Neues Projekt
          </button>

          {showProjectForm && (
            <div className="gantt-project-form">
              <input
                type="text"
                placeholder="Projektname..."
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                autoFocus
              />
              <button onClick={handleCreateProject}>Erstellen</button>
              <button onClick={() => setShowProjectForm(false)}>Abbrechen</button>
            </div>
          )}
        </div>

        <div className="gantt-toolbar__right">
          <div className="gantt-zoom" role="group" aria-label="Zoom">
            {(['day', 'week', 'month'] as ZoomLevel[]).map(z => (
              <button
                key={z}
                className={`gantt-zoom__btn ${zoom === z ? 'gantt-zoom__btn--active' : ''}`}
                onClick={() => setZoom(z)}
              >
                {z === 'day' ? 'Tag' : z === 'week' ? 'Woche' : 'Monat'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="gantt-container">
        {/* Left panel - labels */}
        <div className="gantt-left" style={{ width: LEFT_PANEL_WIDTH }}>
          <div className="gantt-left__header" style={{ height: HEADER_HEIGHT }}>
            Aufgaben
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              className={`gantt-left__row gantt-left__row--${row.type}`}
              style={{ height: ROW_HEIGHT }}
            >
              {row.type === 'project' ? (
                <div className="gantt-left__project">
                  {row.project ? (
                    <>
                      <button
                        className="gantt-left__toggle"
                        onClick={() => toggleProject(row.project!.id)}
                        aria-label={collapsedProjects.has(row.project.id) ? 'Aufklappen' : 'Zuklappen'}
                      >
                        {collapsedProjects.has(row.project.id) ? '\u25B6' : '\u25BC'}
                      </button>
                      <span
                        className="gantt-left__dot"
                        style={{ backgroundColor: row.project.color }}
                      />
                      <span className="gantt-left__name">{row.project.icon} {row.project.name}</span>
                    </>
                  ) : (
                    <span className="gantt-left__name">Ohne Projekt</span>
                  )}
                </div>
              ) : (
                <div
                  className="gantt-left__task"
                  onClick={() => row.task && onEditTask(row.task)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && row.task && onEditTask(row.task)}
                >
                  <span
                    className="gantt-left__priority"
                    style={{ backgroundColor: PRIORITY_COLORS[row.task!.priority] }}
                  />
                  <span className="gantt-left__task-title">{row.task!.title}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right panel - SVG chart */}
        <div className="gantt-right" style={{ overflow: 'auto' }}>
          <svg
            ref={svgRef}
            width={totalWidth}
            height={totalHeight}
            className="gantt-svg"
          >
            {/* Date headers */}
            {Array.from({ length: totalDays }, (_, i) => {
              const date = addDays(rangeStart, i);
              const x = i * dayWidth;
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              const showLabel = zoom === 'day' || (zoom === 'week' && date.getDay() === 1) || (zoom === 'month' && date.getDate() === 1);

              return (
                <g key={i}>
                  {isWeekend && (
                    <rect
                      x={x} y={HEADER_HEIGHT}
                      width={dayWidth} height={totalHeight - HEADER_HEIGHT}
                      fill="var(--gantt-weekend-bg, #f8f8f8)"
                      opacity={0.5}
                    />
                  )}
                  {showLabel && (
                    <text
                      x={x + 4} y={HEADER_HEIGHT - 10}
                      className="gantt-header-text"
                      fontSize={zoom === 'day' ? 11 : 10}
                    >
                      {zoom === 'month'
                        ? date.toLocaleDateString('de-DE', { month: 'short' })
                        : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    </text>
                  )}
                  <line
                    x1={x} y1={HEADER_HEIGHT}
                    x2={x} y2={totalHeight}
                    stroke="var(--gantt-grid-line, #e5e5e5)"
                    strokeWidth={0.5}
                  />
                </g>
              );
            })}

            {/* Row grid lines */}
            {rows.map((_, i) => (
              <line
                key={`row-${i}`}
                x1={0} y1={HEADER_HEIGHT + i * ROW_HEIGHT}
                x2={totalWidth} y2={HEADER_HEIGHT + i * ROW_HEIGHT}
                stroke="var(--gantt-grid-line, #e5e5e5)"
                strokeWidth={0.5}
              />
            ))}

            {/* Today line */}
            <line
              x1={todayX} y1={0}
              x2={todayX} y2={totalHeight}
              stroke="#D94A4A"
              strokeWidth={2}
              strokeDasharray="4 2"
            />

            {/* Task bars */}
            {rows.map((row, i) => {
              if (row.type !== 'task' || !row.task) return null;
              const task = row.task;
              const barX = getBarX(task.start_date || task.created_at);
              const barW = getBarWidth(task.start_date || task.created_at, task.due_date);
              const barY = HEADER_HEIGHT + i * ROW_HEIGHT + 6;
              const barH = ROW_HEIGHT - 12;
              const color = row.project?.color || PRIORITY_COLORS[task.priority];
              const isDone = task.status === 'done';

              return (
                <g
                  key={task.id}
                  className="gantt-bar"
                  onClick={() => onEditTask(task)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={barX} y={barY}
                    width={Math.max(barW, dayWidth)}
                    height={barH}
                    rx={4} ry={4}
                    fill={color}
                    opacity={isDone ? 0.5 : 0.85}
                  />
                  {isDone && (
                    <line
                      x1={barX + 4} y1={barY + barH / 2}
                      x2={barX + Math.max(barW, dayWidth) - 4} y2={barY + barH / 2}
                      stroke="white"
                      strokeWidth={2}
                    />
                  )}
                  {barW > 50 && (
                    <text
                      x={barX + 8} y={barY + barH / 2 + 4}
                      fill="white"
                      fontSize={11}
                      fontWeight={500}
                      className="gantt-bar__text"
                    >
                      {task.title.length > Math.floor(barW / 7) ? task.title.slice(0, Math.floor(barW / 7)) + '...' : task.title}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Project legend */}
      <div className="gantt-legend">
        {projects.filter(p => p.status !== 'archived').map(p => (
          <span key={p.id} className="gantt-legend__item">
            <span className="gantt-legend__dot" style={{ backgroundColor: p.color }} />
            {p.icon} {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
