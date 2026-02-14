/**
 * KanbanBoard - Phase 37
 *
 * Drag-and-drop Kanban board with 4 columns.
 * Uses HTML5 Drag API with touch fallback.
 */

import { useState, useCallback, useRef } from 'react';
import type { Task, TaskStatus, Project } from './types';
import { KANBAN_COLUMNS, PRIORITY_COLORS, PRIORITY_LABELS } from './types';
import './KanbanBoard.css';

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

    setDraggedTaskId(null);
  }, [tasks, draggedTaskId, getColumnTasks, onReorder]);

  const getProjectInfo = useCallback((projectId?: string) => {
    if (!projectId) return null;
    return projects.find(p => p.id === projectId);
  }, [projects]);

  const isOverdue = useCallback((dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  }, []);

  if (loading) {
    return (
      <div className="kanban-loading">
        <div className="kanban-loading__columns">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="kanban-loading__column">
              <div className="kanban-loading__header" />
              <div className="kanban-loading__card" />
              <div className="kanban-loading__card" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="kanban-board">
      {/* Toolbar */}
      <div className="kanban-toolbar">
        <select
          className="kanban-filter"
          value={projectFilter || ''}
          onChange={e => onProjectFilterChange(e.target.value || undefined)}
          aria-label="Projekt filtern"
        >
          <option value="">Alle Projekte</option>
          {projects.filter(p => p.status !== 'archived').map(p => (
            <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
          ))}
        </select>

        <button className="kanban-add-btn" onClick={onCreateTask}>
          + Neue Aufgabe
        </button>
      </div>

      {/* Columns */}
      <div className="kanban-columns">
        {KANBAN_COLUMNS.map(col => {
          const columnTasks = getColumnTasks(col.status);
          const isDragOver = dragOverColumn === col.status;

          return (
            <div
              key={col.status}
              className={`kanban-column ${isDragOver ? 'kanban-column--drag-over' : ''}`}
              onDragEnter={() => handleDragEnter(col.status)}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, col.status)}
            >
              <div className="kanban-column__header" style={{ borderTopColor: col.color }}>
                <span className="kanban-column__title">{col.label}</span>
                <span className="kanban-column__count">{columnTasks.length}</span>
              </div>

              <div className="kanban-column__cards">
                {columnTasks.map(task => {
                  const project = getProjectInfo(task.project_id);
                  const overdue = isOverdue(task.due_date) && task.status !== 'done';

                  return (
                    <div
                      key={task.id}
                      className={`kanban-card ${draggedTaskId === task.id ? 'kanban-card--dragging' : ''}`}
                      draggable
                      onDragStart={e => handleDragStart(e, task.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onEditTask(task)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && onEditTask(task)}
                    >
                      {/* Priority indicator */}
                      <div
                        className="kanban-card__priority"
                        style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                        title={PRIORITY_LABELS[task.priority]}
                      />

                      <div className="kanban-card__body">
                        <h4 className="kanban-card__title">{task.title}</h4>

                        <div className="kanban-card__meta">
                          {task.due_date && (
                            <span className={`kanban-card__due ${overdue ? 'kanban-card__due--overdue' : ''}`}>
                              {new Date(task.due_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                            </span>
                          )}

                          {project && (
                            <span
                              className="kanban-card__project"
                              style={{ backgroundColor: project.color + '20', color: project.color }}
                            >
                              {project.icon} {project.name}
                            </span>
                          )}

                          {task.calendar_event_id && (
                            <span className="kanban-card__linked" title="Mit Termin verknuepft">
                              {'\uD83D\uDCC5'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {columnTasks.length === 0 && (
                  <div className="kanban-column__empty">
                    Keine Aufgaben
                  </div>
                )}
              </div>

              <button
                className="kanban-column__add"
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
