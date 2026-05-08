/**
 * TaskForm - Phase 37
 *
 * Modal form for creating/editing tasks.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Task, TaskStatus, TaskPriority, Project } from './types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const focusTrapRef = useFocusTrap<HTMLDivElement>({ isActive: true, initialFocusSelector: 'input[type="text"]' });

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
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Titel ist erforderlich';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
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
    <div
      data-testid="task-form-overlay"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4 animate-in fade-in duration-200 max-md:items-end max-md:p-0"
      ref={overlayRef}
      onClick={handleOverlayClick}
    >
      <div
        ref={focusTrapRef}
        className="bg-surface border border-glass-border rounded-xl shadow-lg w-full max-w-[560px] max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-250 max-md:max-h-[85vh] max-md:max-h-[85dvh] max-md:rounded-b-none"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-glass-border">
          <h3 className="m-0 text-lg font-semibold text-text">{isEditing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</h3>
          <button
            className="flex items-center justify-center w-8 h-8 border-none bg-bg-secondary rounded-md text-text-secondary text-sm cursor-pointer transition-colors hover:bg-surface-hover hover:text-text max-md:w-10 max-md:h-10"
            onClick={onClose}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 max-[480px]:p-4">
          {/* Title */}
          <div className="flex flex-col gap-1">
            <label htmlFor="task-title" className="text-[0.8rem] font-medium text-text-secondary uppercase tracking-wide">Titel *</label>
            <Input
              ref={titleRef}
              id="task-title"
              type="text"
              value={title}
              onChange={e => { setTitle(e.target.value); if (errors.title) setErrors(prev => ({ ...prev, title: '' })); }}
              placeholder="Was muss erledigt werden?"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'task-title-error' : undefined}
              required
            />
            {errors.title && (
              <span id="task-title-error" className="block mt-1 text-[0.78rem] text-red-500 font-medium" role="alert">
                {errors.title}
              </span>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label htmlFor="task-desc" className="text-[0.8rem] font-medium text-text-secondary uppercase tracking-wide">Beschreibung</label>
            <textarea
              id="task-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Details..."
              rows={3}
              className="px-3 py-2 border border-glass-border rounded-md bg-surface text-text text-[0.9rem] font-[inherit] resize-y min-h-[72px] transition-colors hover:border-glass-border focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/35 max-md:text-base max-md:min-h-[44px]"
            />
          </div>

          {/* Status + Priority row */}
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <div className="flex flex-col gap-1">
              <label htmlFor="task-status" className="text-[0.8rem] font-medium text-text-secondary uppercase tracking-wide">Status</label>
              <select
                id="task-status"
                value={status}
                onChange={e => setStatus(e.target.value as TaskStatus)}
                className="px-3 py-2 border border-glass-border rounded-md bg-surface text-text text-[0.9rem] font-[inherit] transition-colors hover:border-glass-border focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/35 max-md:text-base max-md:min-h-[44px]"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="task-priority" className="text-[0.8rem] font-medium text-text-secondary uppercase tracking-wide">Priorität</label>
              <select
                id="task-priority"
                value={priority}
                onChange={e => setPriority(e.target.value as TaskPriority)}
                className="px-3 py-2 border border-glass-border rounded-md bg-surface text-text text-[0.9rem] font-[inherit] transition-colors hover:border-glass-border focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/35 max-md:text-base max-md:min-h-[44px]"
              >
                {PRIORITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Project */}
          <div className="flex flex-col gap-1">
            <label htmlFor="task-project" className="text-[0.8rem] font-medium text-text-secondary uppercase tracking-wide">Projekt</label>
            <select
              id="task-project"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="px-3 py-2 border border-glass-border rounded-md bg-surface text-text text-[0.9rem] font-[inherit] transition-colors hover:border-glass-border focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/35 max-md:text-base max-md:min-h-[44px]"
            >
              <option value="">Kein Projekt</option>
              {projects.filter(p => p.status !== 'archived').map(p => (
                <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
              ))}
            </select>
          </div>

          {/* Dates row */}
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <div className="flex flex-col gap-1">
              <label htmlFor="task-start" className="text-[0.8rem] font-medium text-text-secondary uppercase tracking-wide">Startdatum</label>
              <Input
                id="task-start"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="task-due" className="text-[0.8rem] font-medium text-text-secondary uppercase tracking-wide">Fälligkeitsdatum</label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Assignee + Hours row */}
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            <div className="flex flex-col gap-1">
              <label htmlFor="task-assignee" className="text-[0.8rem] font-medium text-text-secondary uppercase tracking-wide">Zuständig</label>
              <Input
                id="task-assignee"
                type="text"
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                placeholder="Name"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="task-hours" className="text-[0.8rem] font-medium text-text-secondary uppercase tracking-wide">Geschätzte Stunden</label>
              <Input
                id="task-hours"
                type="number"
                min={0}
                step={0.5}
                value={estimatedHours}
                onChange={e => setEstimatedHours(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-glass-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || submitting}
            >
              {submitting ? 'Speichert...' : isEditing ? 'Speichern' : 'Erstellen'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
