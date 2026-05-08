/**
 * KanbanBoard - Phase 37
 *
 * Drag-and-drop Kanban board with 4 columns.
 * Uses HTML5 Drag API with touch fallback.
 */

import { useState, useCallback, useRef, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EmptyState } from '@/components/ui/empty-state';
import type { Task, TaskStatus, Project } from './types';
import { KANBAN_COLUMNS, PRIORITY_COLORS, PRIORITY_LABELS } from './types';
import { staggerContainer, staggerItem } from '../../utils/animations';
import { useAnnounce } from '../../hooks/useAnnounce';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const KANBAN_VIRTUALIZATION_THRESHOLD = 30;
const KANBAN_ROW_HEIGHT = 96;

interface KanbanBoardProps {
  tasks: Task[];
  projects: Project[];
  loading: boolean;
  projectFilter?: string;
  onProjectFilterChange: (projectId: string | undefined) => void;
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onReorder: (status: TaskStatus, taskIds: string[]) => Promise<void>;
}

export function KanbanBoard({
  tasks, projects, loading, projectFilter,
  onProjectFilterChange, onCreateTask, onEditTask,
  onReorder,
}: KanbanBoardProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const dragCounter = useRef(0);
  const announce = useAnnounce();

  const getColumnTasks = useCallback((status: TaskStatus) => {
    return tasks
      .filter(t => t.status === status)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [tasks]);

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
    dragCounter.current = 0;
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleDragEnter = useCallback((status: TaskStatus) => {
    dragCounter.current++;
    setDragOverColumn(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setDragOverColumn(null);
      dragCounter.current = 0;
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    dragCounter.current = 0;

    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Reorder handles both status change and ordering in a single call
    const columnTasks = getColumnTasks(targetStatus)
      .filter(t => t.id !== taskId);
    const taskIds = [...columnTasks.map(t => t.id), taskId];
    await onReorder(targetStatus, taskIds);

    const col = KANBAN_COLUMNS.find(c => c.status === targetStatus);
    announce(`Aufgabe nach ${col?.label || targetStatus} verschoben`);
    setDraggedTaskId(null);
  }, [tasks, draggedTaskId, getColumnTasks, onReorder, announce]);

  const getProjectInfo = useCallback((projectId?: string) => {
    if (!projectId) return null;
    return projects.find(p => p.id === projectId);
  }, [projects]);

  const isOverdue = useCallback((dueDate?: string) => {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const today = new Date();
    // Compare dates only (ignore time) - "due today" is not overdue
    return due.getFullYear() < today.getFullYear()
      || (due.getFullYear() === today.getFullYear() && due.getMonth() < today.getMonth())
      || (due.getFullYear() === today.getFullYear() && due.getMonth() === today.getMonth() && due.getDate() < today.getDate());
  }, []);

  interface KanbanColumnBodyProps {
    columnTasks: Task[];
    isDragging: boolean;
    draggedTaskId: string | null;
    onDragStart: (e: React.DragEvent, taskId: string) => void;
    onDragEnd: (e: React.DragEvent) => void;
    onEditTask: (task: Task) => void;
    getProjectInfo: (id?: string) => Project | null | undefined;
    isOverdue: (dueDate?: string) => boolean;
  }

  function KanbanColumnBody({
    columnTasks, isDragging, draggedTaskId,
    onDragStart, onDragEnd, onEditTask,
    getProjectInfo, isOverdue,
  }: KanbanColumnBodyProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const shouldVirtualize = columnTasks.length >= KANBAN_VIRTUALIZATION_THRESHOLD;

    const virtualizer = useVirtualizer({
      count: columnTasks.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => KANBAN_ROW_HEIGHT,
      overscan: isDragging ? columnTasks.length : 5,
      enabled: shouldVirtualize,
    });

    const renderTask = (task: Task) => {
      const project = getProjectInfo(task.project_id);
      const overdue = isOverdue(task.due_date) && task.status !== 'done';
      return (
        <div
          data-testid="kanban-card"
          className={cn(
            'flex bg-glass-bg border border-glass-border rounded-md shadow-sm cursor-grab overflow-hidden transition-shadow hover:shadow-md hover:border-glass-border focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 active:cursor-grabbing',
            draggedTaskId === task.id && 'opacity-50'
          )}
          draggable
          onDragStart={e => onDragStart(e, task.id)}
          onDragEnd={onDragEnd}
          onClick={() => onEditTask(task)}
          role="button"
          tabIndex={0}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onEditTask(task))}
        >
          <div
            className="w-1 shrink-0 bg-[var(--c)]"
            style={{ '--c': PRIORITY_COLORS[task.priority] } as CSSProperties}
            title={PRIORITY_LABELS[task.priority]}
            aria-label={`Priorität: ${PRIORITY_LABELS[task.priority]}`}
            role="img"
          />
          <div className="flex-1 px-2.5 py-2 min-w-0">
            <h4 className="m-0 text-[0.813rem] font-medium text-text leading-tight line-clamp-2">
              {task.title}
            </h4>
            <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
              {task.due_date && (
                <span data-testid={overdue ? 'kanban-due-overdue' : 'kanban-due'} className={cn(
                  'text-[0.688rem] text-text-secondary',
                  overdue && 'text-red-500 font-medium'
                )}>
                  {new Date(task.due_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                </span>
              )}
              {project && (
                <span
                  data-testid="kanban-card-project"
                  className="text-[0.625rem] px-1.5 py-px rounded-sm whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis bg-[var(--bg)] text-[var(--c)]"
                  style={{ '--bg': project.color + '20', '--c': project.color } as CSSProperties}
                >
                  {project.icon} {project.name}
                </span>
              )}
              {task.calendar_event_id && (
                <span className="text-xs" title="Mit Termin verknuepft">{'📅'}</span>
              )}
            </div>
          </div>
        </div>
      );
    };

    if (shouldVirtualize) {
      return (
        <div ref={scrollRef} className="flex-1 p-2 overflow-y-auto">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const task = columnTasks[virtualRow.index];
              return (
                <div
                  key={task.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute w-full pb-2"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {renderTask(task)}
                </div>
              );
            })}
          </div>
          {columnTasks.length === 0 && (
            <div data-testid="kanban-column-empty" className="py-6 px-3 text-center text-text-secondary text-[0.813rem]">
              Keine Aufgaben
            </div>
          )}
        </div>
      );
    }

    return (
      <motion.div
        className="flex-1 p-2 overflow-y-auto flex flex-col gap-2"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {columnTasks.map(task => (
          <motion.div key={task.id} variants={staggerItem}>
            {renderTask(task)}
          </motion.div>
        ))}
        {columnTasks.length === 0 && (
          <div data-testid="kanban-column-empty" className="py-6 px-3 text-center text-text-secondary text-[0.813rem]">
            Keine Aufgaben
          </div>
        )}
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div data-testid="kanban-loading">
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2 max-[480px]:grid-cols-1">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-md bg-bg-secondary p-3">
              <div className="h-5 rounded-sm bg-surface mb-3 animate-pulse" />
              <div className="h-[3.75rem] rounded-md bg-glass-bg mb-2 animate-pulse" />
              <div className="h-[3.75rem] rounded-md bg-glass-bg mb-2 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
        <select
          className="px-3 py-1.5 border border-glass-border rounded-md bg-surface text-text text-[0.813rem] min-w-[160px]"
          value={projectFilter || ''}
          onChange={e => onProjectFilterChange(e.target.value || undefined)}
          aria-label="Projekt filtern"
        >
          <option value="">Alle Projekte</option>
          {projects.filter(p => p.status !== 'archived').map(p => (
            <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
          ))}
        </select>

        <Button size="sm" onClick={onCreateTask}>
          + Neue Aufgabe
        </Button>
      </div>

      {/* Empty state when no tasks at all */}
      {tasks.length === 0 && (
        <EmptyState
          icon="✅"
          title="Keine Aufgaben vorhanden"
          description="Erstelle Aufgaben oder konvertiere Ideen in konkrete Schritte."
          action={
            <Button size="sm" onClick={onCreateTask}>
              Neue Aufgabe
            </Button>
          }
        />
      )}

      {/* Columns */}
      <div className="grid grid-cols-4 gap-3 flex-1 min-h-0 overflow-x-auto max-md:grid-cols-2 max-[480px]:grid-cols-1">
        {KANBAN_COLUMNS.map(col => {
          const columnTasks = getColumnTasks(col.status);
          const isDragOver = dragOverColumn === col.status;

          return (
            <div
              key={col.status}
              data-testid="kanban-column"
              className={cn(
                'flex flex-col bg-bg-secondary rounded-md min-h-[200px] transition-colors',
                isDragOver && 'bg-primary/[0.08] outline-2 outline-dashed outline-primary -outline-offset-2'
              )}
              onDragEnter={() => handleDragEnter(col.status)}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, col.status)}
            >
              <div
                className="flex items-center justify-between px-3 py-2.5 border-t-[3px] rounded-t-md font-medium text-[0.813rem] text-text [border-top-color:var(--c)]"
                style={{ '--c': col.color } as CSSProperties}
              >
                <span>{col.label}</span>
                <span data-testid="kanban-column-count" className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-surface text-[0.688rem] text-text-secondary">
                  {columnTasks.length}
                </span>
              </div>

              <KanbanColumnBody
                columnTasks={columnTasks}
                isDragging={draggedTaskId !== null}
                draggedTaskId={draggedTaskId}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onEditTask={onEditTask}
                getProjectInfo={getProjectInfo}
                isOverdue={isOverdue}
              />

              <button
                type="button"
                className="block w-full p-2 border-none bg-transparent cursor-pointer text-text-secondary text-lg transition-colors hover:text-primary"
                onClick={onCreateTask}
                title={`Aufgabe in "${col.label}" erstellen`}
              >
                +
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
