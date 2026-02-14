/**
 * TaskForm Tests - Phase 37
 *
 * Tests form rendering, validation, submission, and keyboard interaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskForm } from '../TaskForm';
import type { Task, Project } from '../types';

const mockProjects: Project[] = [
  {
    id: 'proj-1',
    name: 'Frontend',
    color: '#4A90D9',
    icon: '🖥️',
    status: 'active',
    context: 'work',
    sort_order: 0,
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'proj-2',
    name: 'Archived Project',
    color: '#8B8B8B',
    icon: '📦',
    status: 'archived',
    context: 'work',
    sort_order: 1,
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Existing Task',
    description: 'A description',
    status: 'todo',
    priority: 'high',
    project_id: 'proj-1',
    due_date: '2026-03-01T00:00:00Z',
    start_date: '2026-02-15T00:00:00Z',
    assignee: 'Alex',
    estimated_hours: 4,
    sort_order: 0,
    context: 'work',
    labels: [],
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('TaskForm', () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create mode', () => {
    it('should render create form with default values', () => {
      render(<TaskForm task={null} projects={mockProjects} onSubmit={onSubmit} onClose={onClose} />);

      expect(screen.getByText('Neue Aufgabe')).toBeInTheDocument();
      expect(screen.getByLabelText('Titel *')).toHaveValue('');
      expect(screen.getByText('Erstellen')).toBeInTheDocument();
    });

    it('should require title for submission', async () => {
      render(<TaskForm task={null} projects={mockProjects} onSubmit={onSubmit} onClose={onClose} />);

      const submitBtn = screen.getByText('Erstellen');
      expect(submitBtn).toBeDisabled();
    });

    it('should enable submit when title is entered', async () => {
      const user = userEvent.setup();
      render(<TaskForm task={null} projects={mockProjects} onSubmit={onSubmit} onClose={onClose} />);

      await user.type(screen.getByLabelText('Titel *'), 'New Task');

      expect(screen.getByText('Erstellen')).not.toBeDisabled();
    });

    it('should submit with correct data', async () => {
      const user = userEvent.setup();
      render(<TaskForm task={null} projects={mockProjects} onSubmit={onSubmit} onClose={onClose} />);

      await user.type(screen.getByLabelText('Titel *'), 'New Task');
      await user.selectOptions(screen.getByLabelText('Priorität'), 'urgent');
      await user.selectOptions(screen.getByLabelText('Projekt'), 'proj-1');

      fireEvent.click(screen.getByText('Erstellen'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'New Task',
            priority: 'urgent',
            project_id: 'proj-1',
          })
        );
      });
    });

    it('should default status to "todo" for new tasks', async () => {
      const user = userEvent.setup();
      render(<TaskForm task={null} projects={mockProjects} onSubmit={onSubmit} onClose={onClose} />);

      await user.type(screen.getByLabelText('Titel *'), 'Task');
      fireEvent.click(screen.getByText('Erstellen'));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'todo' })
        );
      });
    });
  });

  describe('Edit mode', () => {
    it('should populate form with existing task data', () => {
      const task = makeTask();
      render(<TaskForm task={task} projects={mockProjects} onSubmit={onSubmit} onClose={onClose} />);

      expect(screen.getByText('Aufgabe bearbeiten')).toBeInTheDocument();
      expect(screen.getByLabelText('Titel *')).toHaveValue('Existing Task');
      expect(screen.getByLabelText('Beschreibung')).toHaveValue('A description');
      expect(screen.getByText('Speichern')).toBeInTheDocument();
    });

    it('should show correct status in edit mode', () => {
      const task = makeTask({ status: 'in_progress' });
      render(<TaskForm task={task} projects={mockProjects} onSubmit={onSubmit} onClose={onClose} />);

      expect(screen.getByLabelText('Status')).toHaveValue('in_progress');
    });
  });

  describe('Project selector', () => {
    it('should only show active (non-archived) projects', () => {
      render(<TaskForm task={null} projects={mockProjects} onSubmit={onSubmit} onClose={onClose} />);

      const projectSelect = screen.getByLabelText('Projekt');
      const options = projectSelect.querySelectorAll('option');

      // "Kein Projekt" + only active projects (not archived)
      expect(options).toHaveLength(2); // "Kein Projekt" + "Frontend"
      expect(screen.queryByText(/Archived Project/)).toBeFalsy();
    });
  });

  describe('Keyboard interaction', () => {
    it('should close on Escape key', () => {
      render(<TaskForm task={null} projects={mockProjects} onSubmit={onSubmit} onClose={onClose} />);

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledOnce();
    });

    it('should close on overlay click', () => {
      const { container } = render(
        <TaskForm task={null} projects={mockProjects} onSubmit={onSubmit} onClose={onClose} />
      );

      const overlay = container.querySelector('.task-form-overlay')!;
      fireEvent.click(overlay);

      expect(onClose).toHaveBeenCalledOnce();
    });

    it('should NOT close when clicking inside form', () => {
      render(<TaskForm task={null} projects={mockProjects} onSubmit={onSubmit} onClose={onClose} />);

      fireEvent.click(screen.getByText('Neue Aufgabe'));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Submit state', () => {
    it('should show loading state during submission', async () => {
      // Slow submission
      const slowSubmit = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 100)));

      const user = userEvent.setup();
      render(<TaskForm task={null} projects={mockProjects} onSubmit={slowSubmit} onClose={onClose} />);

      await user.type(screen.getByLabelText('Titel *'), 'Task');
      fireEvent.click(screen.getByText('Erstellen'));

      expect(screen.getByText('Speichert...')).toBeInTheDocument();
    });
  });
});
