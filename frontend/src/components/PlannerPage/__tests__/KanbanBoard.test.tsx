/**
 * KanbanBoard Tests - Phase 37
 *
 * Tests rendering, drag-and-drop, filtering, and task interaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KanbanBoard } from '../KanbanBoard';
import type { Task, Project } from '../types';

const mockProject: Project = {
  id: 'proj-1',
  name: 'Test Project',
  description: 'A test project',
  color: '#4A90D9',
  icon: '📋',
  status: 'active',
  context: 'work',
  sort_order: 0,
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  task_count: 3,
  done_count: 1,
};

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    status: 'todo',
    priority: 'medium',
    sort_order: 0,
    context: 'work',
    labels: [],
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('KanbanBoard', () => {
  const defaultProps = {
    tasks: [] as Task[],
    projects: [mockProject],
    loading: false,
    projectFilter: undefined as string | undefined,
    onProjectFilterChange: vi.fn(),
    onCreateTask: vi.fn(),
    onEditTask: vi.fn(),
    onReorder: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render 4 kanban columns', () => {
    render(<KanbanBoard {...defaultProps} />);

    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('Zu erledigen')).toBeInTheDocument();
    expect(screen.getByText('In Arbeit')).toBeInTheDocument();
    expect(screen.getByText('Erledigt')).toBeInTheDocument();
  });

  it('should show loading state', () => {
    const { container } = render(<KanbanBoard {...defaultProps} loading={true} />);
    expect(container.querySelector('.kanban-loading')).toBeTruthy();
  });

  it('should render tasks in correct columns', () => {
    const tasks = [
      makeTask({ id: 't1', title: 'Backlog Task', status: 'backlog' }),
      makeTask({ id: 't2', title: 'Todo Task', status: 'todo' }),
      makeTask({ id: 't3', title: 'In Progress Task', status: 'in_progress' }),
      makeTask({ id: 't4', title: 'Done Task', status: 'done' }),
    ];

    render(<KanbanBoard {...defaultProps} tasks={tasks} />);

    expect(screen.getByText('Backlog Task')).toBeInTheDocument();
    expect(screen.getByText('Todo Task')).toBeInTheDocument();
    expect(screen.getByText('In Progress Task')).toBeInTheDocument();
    expect(screen.getByText('Done Task')).toBeInTheDocument();
  });

  it('should show column counts', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'todo', sort_order: 0 }),
      makeTask({ id: 't2', status: 'todo', sort_order: 1 }),
      makeTask({ id: 't3', status: 'done', sort_order: 0 }),
    ];

    const { container } = render(<KanbanBoard {...defaultProps} tasks={tasks} />);

    const counts = container.querySelectorAll('.kanban-column__count');
    const countValues = Array.from(counts).map(el => el.textContent);

    // 2 in "Zu erledigen", 1 in "Erledigt", rest 0
    expect(countValues).toContain('2');
    expect(countValues).toContain('1');
  });

  it('should show empty state in columns without tasks', () => {
    render(<KanbanBoard {...defaultProps} tasks={[]} />);

    const emptyMessages = screen.getAllByText('Keine Aufgaben');
    expect(emptyMessages).toHaveLength(4);
  });

  it('should call onCreateTask when add button is clicked', () => {
    render(<KanbanBoard {...defaultProps} />);

    const addButton = screen.getByText('+ Neue Aufgabe');
    fireEvent.click(addButton);

    expect(defaultProps.onCreateTask).toHaveBeenCalledOnce();
  });

  it('should call onEditTask when task card is clicked', () => {
    const task = makeTask({ id: 't1', title: 'Click me' });
    render(<KanbanBoard {...defaultProps} tasks={[task]} />);

    fireEvent.click(screen.getByText('Click me'));

    expect(defaultProps.onEditTask).toHaveBeenCalledWith(task);
  });

  it('should show overdue indicator for past due dates', () => {
    const task = makeTask({
      id: 't1',
      title: 'Overdue Task',
      status: 'todo',
      due_date: '2020-01-01T00:00:00Z',
    });

    const { container } = render(<KanbanBoard {...defaultProps} tasks={[task]} />);

    const overdueEl = container.querySelector('.kanban-card__due--overdue');
    expect(overdueEl).toBeTruthy();
  });

  it('should NOT show overdue for done tasks', () => {
    const task = makeTask({
      id: 't1',
      title: 'Done Overdue',
      status: 'done',
      due_date: '2020-01-01T00:00:00Z',
    });

    const { container } = render(<KanbanBoard {...defaultProps} tasks={[task]} />);

    const overdueEl = container.querySelector('.kanban-card__due--overdue');
    expect(overdueEl).toBeFalsy();
  });

  it('should show project badge on task', () => {
    const task = makeTask({
      id: 't1',
      title: 'Project Task',
      project_id: 'proj-1',
    });

    const { container } = render(<KanbanBoard {...defaultProps} tasks={[task]} />);

    const badge = container.querySelector('.kanban-card__project');
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain('Test Project');
  });

  it('should filter by project', () => {
    render(<KanbanBoard {...defaultProps} />);

    const select = screen.getByLabelText('Projekt filtern');
    fireEvent.change(select, { target: { value: 'proj-1' } });

    expect(defaultProps.onProjectFilterChange).toHaveBeenCalledWith('proj-1');
  });

  it('should clear filter when "Alle Projekte" is selected', () => {
    render(<KanbanBoard {...defaultProps} projectFilter="proj-1" />);

    const select = screen.getByLabelText('Projekt filtern');
    fireEvent.change(select, { target: { value: '' } });

    expect(defaultProps.onProjectFilterChange).toHaveBeenCalledWith(undefined);
  });

  it('should handle drag and drop to reorder', async () => {
    const tasks = [
      makeTask({ id: 't1', title: 'Task A', status: 'todo', sort_order: 0 }),
      makeTask({ id: 't2', title: 'Task B', status: 'todo', sort_order: 1 }),
    ];

    const { container } = render(<KanbanBoard {...defaultProps} tasks={tasks} />);

    const cards = container.querySelectorAll('.kanban-card');
    const todoColumn = container.querySelectorAll('.kanban-column')[1]; // "Zu erledigen" is 2nd column

    // Simulate drag start on first card
    fireEvent.dragStart(cards[0], {
      dataTransfer: { effectAllowed: 'move', setData: vi.fn() },
    });

    // Simulate drop on same column
    fireEvent.drop(todoColumn, {
      dataTransfer: { getData: () => 't1' },
    });

    expect(defaultProps.onReorder).toHaveBeenCalled();
  });

  it('should support keyboard navigation on cards', () => {
    const task = makeTask({ id: 't1', title: 'KB Task' });
    render(<KanbanBoard {...defaultProps} tasks={[task]} />);

    const card = screen.getByText('KB Task').closest('.kanban-card')!;
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(defaultProps.onEditTask).toHaveBeenCalledWith(task);
  });
});
