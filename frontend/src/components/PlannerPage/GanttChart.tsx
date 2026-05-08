/**
 * GanttChart - Phase 37
 *
 * Custom SVG-based Gantt chart with project grouping,
 * dependency arrows, and drag-to-reschedule.
 */

import { useState, useMemo, useCallback, useRef, type CSSProperties } from 'react';
import type { Task, Project } from './types';
import { PRIORITY_COLORS } from './types';
import type { AIContext } from '../ContextSwitcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface GanttChartProps {
  tasks: Task[];
  projects: Project[];
  loading: boolean;
  context: AIContext;
  onEditTask: (task: Task) => void;
  onCreateProject: (input: Partial<Project>) => Promise<Project | null>;
}

type ZoomLevel = 'day' | 'week' | 'month';

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 50;
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
  tasks, projects, loading, context: _context, onEditTask, onCreateProject,
}: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  const dayWidth = DAY_WIDTH_MAP[zoom];

  const ganttTasks = useMemo(() => {
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
        const existing = projectMap.get(t.project_id) ?? [];
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
        const projectTasks = projectMap.get(p.id) ?? [];
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
        .sort((a, b) => ((a.start_date ?? a.created_at) ?? '').localeCompare((b.start_date ?? b.created_at) ?? ''))
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

  const todayX = daysBetween(rangeStart, startOfDay(new Date())) * dayWidth;

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;
    await onCreateProject({ name: newProjectName.trim() });
    setNewProjectName('');
    setShowProjectForm(false);
  }, [newProjectName, onCreateProject]);

  if (loading) {
    return <div data-testid="gantt-loading" className="flex items-center justify-center h-[200px] text-text-secondary text-[0.9rem]">Lade Gantt-Daten...</div>;
  }

  return (
    <div data-testid="gantt-chart" className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap max-md:flex-col max-md:items-stretch">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowProjectForm(!showProjectForm)}
          >
            + Neues Projekt
          </Button>

          {showProjectForm && (
            <div className="flex items-center gap-1.5 max-[480px]:flex-wrap">
              <Input
                type="text"
                placeholder="Projektname..."
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                autoFocus
                className="w-[180px] h-8 text-[0.813rem] max-md:w-[140px] max-[480px]:w-full max-[480px]:min-w-0"
              />
              <Button size="sm" onClick={handleCreateProject}>Erstellen</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowProjectForm(false)}>Abbrechen</Button>
            </div>
          )}
        </div>

        <div>
          <div className="flex border border-glass-border rounded-md overflow-hidden" role="group" aria-label="Zoom">
            {(['day', 'week', 'month'] as ZoomLevel[]).map(z => (
              <button
                type="button"
                key={z}
                className={cn(
                  'px-3 py-1 border-none bg-surface text-text-secondary text-xs cursor-pointer transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 max-[480px]:px-2 max-[480px]:py-1 max-[480px]:text-[12px]',
                  z !== 'month' && 'border-r border-glass-border',
                  zoom === z && 'bg-primary/10 text-primary font-medium hover:bg-primary/15 hover:text-primary'
                )}
                onClick={() => setZoom(z)}
              >
                {z === 'day' ? 'Tag' : z === 'week' ? 'Woche' : 'Monat'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div data-testid="gantt-container" className="flex flex-1 overflow-hidden border border-glass-border rounded-md bg-surface">
        {/* Left panel - labels */}
        <div className="w-[260px] shrink-0 border-r border-glass-border overflow-y-auto max-md:!w-[160px] max-[480px]:!w-[120px]">
          <div
            className="h-[50px] flex items-center px-3 font-medium text-[0.813rem] text-text border-b border-glass-border bg-bg-secondary"
          >
            Aufgaben
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              className={cn(
                'h-9 flex items-center px-3 border-b border-glass-border/50 text-[0.813rem] text-text',
                row.type === 'project' && 'bg-bg-secondary font-medium'
              )}
            >
              {row.type === 'project' ? (
                <div data-testid="gantt-project-name" className="flex items-center gap-1.5 w-full overflow-hidden">
                  {row.project ? (
                    <>
                      <button
                        className="border-none bg-transparent cursor-pointer text-[0.625rem] p-0.5 text-text-secondary transition-colors hover:text-text"
                        onClick={() => toggleProject(row.project!.id)}
                        aria-label={collapsedProjects.has(row.project.id) ? 'Aufklappen' : 'Zuklappen'}
                      >
                        {collapsedProjects.has(row.project.id) ? '\u25B6' : '\u25BC'}
                      </button>
                      <span
                        className="w-2 h-2 rounded-full shrink-0 bg-[var(--pc)]"
                        style={{ '--pc': row.project.color } as CSSProperties}
                      />
                      <span className="whitespace-nowrap overflow-hidden text-ellipsis">{row.project.icon} {row.project.name}</span>
                    </>
                  ) : (
                    <span className="whitespace-nowrap overflow-hidden text-ellipsis">Ohne Projekt</span>
                  )}
                </div>
              ) : (
                <div
                  data-testid="gantt-task"
                  className="flex items-center gap-1.5 pl-5 cursor-pointer w-full overflow-hidden transition-colors hover:text-primary"
                  onClick={() => row.task && onEditTask(row.task)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && row.task && onEditTask(row.task)}
                >
                  <span
                    className={cn('w-1.5 h-1.5 rounded-full shrink-0', row.task && 'bg-[var(--pc)]')}
                    style={row.task ? { '--pc': PRIORITY_COLORS[row.task.priority] } as CSSProperties : undefined}
                  />
                  <span data-testid="gantt-task-title" className="whitespace-nowrap overflow-hidden text-ellipsis">{row.task?.title}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right panel - SVG chart */}
        <div className="flex-1 overflow-auto">
          <svg
            ref={svgRef}
            width={totalWidth}
            height={totalHeight}
            data-testid="gantt-svg"
            className="block"
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
                      className="fill-text-secondary select-none"
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
              const barX = getBarX(task.start_date ?? task.created_at);
              const barW = getBarWidth(task.start_date ?? task.created_at, task.due_date);
              const barY = HEADER_HEIGHT + i * ROW_HEIGHT + 6;
              const barH = ROW_HEIGHT - 12;
              const color = row.project?.color ?? PRIORITY_COLORS[task.priority];
              const isDone = task.status === 'done';

              return (
                <g
                  key={task.id}
                  className="cursor-pointer [&:hover_rect]:brightness-110 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1"
                  onClick={() => onEditTask(task)}
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
                      className="pointer-events-none select-none"
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
      <div className="flex flex-wrap gap-3 py-2 mt-2 text-xs text-text-secondary">
        {projects.filter(p => p.status !== 'archived').map(p => (
          <span key={p.id} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[var(--pc)]" style={{ '--pc': p.color } as CSSProperties} />
            {p.icon} {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
