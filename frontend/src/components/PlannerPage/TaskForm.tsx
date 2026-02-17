/**
 * TaskForm - Phase 37
 *
 * Modal form for creating/editing tasks.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Task, TaskStatus, TaskPriority, Project } from './types';
import './TaskForm.css';

interface TaskFormProps {
  task: Task | null; // null = create new
  projects: Project[];
  onSubmit: (data: Partial<Task>) => Promise<void>;
  onClose: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Zu erledigen' },
  { value: 'in_progress', label: 'In Arbeit' },
  { value: 'done', label: 'Erledigt' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'urgent', label: 'Dringend' },
];

export function TaskForm({ task, projects, onSubmit, onClose }: TaskFormProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'medium');
  const [projectId, setProjectId] = useState(task?.project_id || '');
  const [dueDate, setDueDate] = useState(task?.due_date ? task.due_date.slice(0, 10) : '');
  const [startDate, setStartDate] = useState(task?.start_date ? task.start_date.slice(0, 10) : '');
  const [assignee, setAssignee] = useState(task?.assignee || '');
  const [estimatedHours, setEstimatedHours] = useState(task?.estimated_hours?.toString() || '');
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);

    const data: Partial<Task> = {
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      project_id: projectId || undefined,
      // Use noon UTC to prevent timezone-induced date shifts (e.g. 2026-02-17 in CET → 2026-02-16T23:00Z)
      due_date: dueDate ? `${dueDate}T12:00:00Z` : undefined,
      start_date: startDate ? `${startDate}T12:00:00Z` : undefined,
      assignee: assignee.trim() || undefined,
      estimated_hours: estimatedHours ? parseFloat(estimatedHours) : undefined,
    };

    try {
      await onSubmit(data);
    } finally {
      setSubmitting(false);
    }
  }, [title, description, status, priority, projectId, dueDate, startDate, assignee, estimatedHours, onSubmit]);

  const isEditing = !!task;

  return (
    <div className="task-form-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="task-form" role="dialog" aria-label={isEditing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}>
        <div className="task-form__header">
          <h3>{isEditing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</h3>
          <button className="task-form__close" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="task-form__body">
          {/* Title */}
          <div className="task-form__field">
            <label htmlFor="task-title">Titel *</label>
            <input
              ref={titleRef}
              id="task-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Was muss erledigt werden?"
              required
            />
          </div>

          {/* Description */}
          <div className="task-form__field">
            <label htmlFor="task-desc">Beschreibung</label>
            <textarea
              id="task-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Details..."
              rows={3}
            />
          </div>

          {/* Status + Priority row */}
          <div className="task-form__row">
            <div className="task-form__field">
              <label htmlFor="task-status">Status</label>
              <select
                id="task-status"
                value={status}
                onChange={e => setStatus(e.target.value as TaskStatus)}
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="task-form__field">
              <label htmlFor="task-priority">Priorität</label>
              <select
                id="task-priority"
                value={priority}
                onChange={e => setPriority(e.target.value as TaskPriority)}
              >
                {PRIORITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Project */}
          <div className="task-form__field">
            <label htmlFor="task-project">Projekt</label>
            <select
              id="task-project"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
            >
              <option value="">Kein Projekt</option>
              {projects.filter(p => p.status !== 'archived').map(p => (
                <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
              ))}
            </select>
          </div>

          {/* Dates row */}
          <div className="task-form__row">
            <div className="task-form__field">
              <label htmlFor="task-start">Startdatum</label>
              <input
                id="task-start"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>

            <div className="task-form__field">
              <label htmlFor="task-due">Fälligkeitsdatum</label>
              <input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Assignee + Hours row */}
          <div className="task-form__row">
            <div className="task-form__field">
              <label htmlFor="task-assignee">Zuständig</label>
              <input
                id="task-assignee"
                type="text"
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                placeholder="Name"
              />
            </div>

            <div className="task-form__field">
              <label htmlFor="task-hours">Geschätzte Stunden</label>
              <input
                id="task-hours"
                type="number"
                min="0"
                step="0.5"
                value={estimatedHours}
                onChange={e => setEstimatedHours(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="task-form__actions">
            <button type="button" className="task-form__cancel" onClick={onClose}>
              Abbrechen
            </button>
            <button
              type="submit"
              className="task-form__submit"
              disabled={!title.trim() || submitting}
            >
              {submitting ? 'Speichert...' : isEditing ? 'Speichern' : 'Erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
