/**
 * Unit Tests for KanbanBoard Component - Phase 37
 *
 * Tests column rendering, task cards, drag-and-drop,
 * and project filtering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KanbanBoard } from '../PlannerPage/KanbanBoard';
import type { Task, Project, TaskStatus } from '../PlannerPage/types';

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: `task-${Math.random().toString(36).slice(2)}`,
  title: 'Test Task',
  status: 'todo' as TaskStatus,
  priority: 'medium',
  sort_order: 0,
  context: 'work',
  labels: [],
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const sampleProjects: Project[] = [
  {
    id: 'p1', name: 'Project Alpha', status: 'active', context: 'work',
    sort_order: 0, metadata: {}, created_at: '2026-01-01', updated_at: '2026-01-01',
    color: '#FF0000', icon: '📋',
  },
];

const defaultProps = {
  tasks: [] as Task[],
  projects: sampleProjects,
  loading: false,
  onProjectFilterChange: vi.fn(),
  onCreateTask: vi.fn(),
  onEditTask: vi.fn(),
  onStatusChange: vi.fn(),
  onReorder: vi.fn(),
};

describe('KanbanBoard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =====================
  // Column Rendering
  // =====================

  it('should render 4 Kanban columns', () => {
    render(<KanbanBoard {...defaultProps} />);
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('Zu erledigen')).toBeInTheDocument();
    expect(screen.getByText('In Arbeit')).toBeInTheDocument();
    expect(screen.getByText('Erledigt')).toBeInTheDocument();
  });

  it('should show column task counts', () => {
    const tasks = [
      createTask({ status: 'backlog' }),
      createTask({ status: 'todo' }),
      createTask({ status: 'todo' }),
      createTask({ status: 'in_progress' }),
    ];
    render(<KanbanBoard {...defaultProps} tasks={tasks} />);
    const countElements = document.querySelectorAll('.kanban-column__count');
    expect(countElements.length).toBe(4);
  });

  // =====================
  // Task Cards
  // =====================

  it('should render task cards in correct columns', () => {
    const tasks = [
      createTask({ title: 'Backlog Task', status: 'backlog' }),
      createTask({ title: 'Todo Task', status: 'todo' }),
      createTask({ title: 'Done Task', status: 'done' }),
    ];
    render(<KanbanBoard {...defaultProps} tasks={tasks} />);
    expect(screen.getByText('Backlog Task')).toBeInTheDocument();
    expect(screen.getByText('Todo Task')).toBeInTheDocument();
    expect(screen.getByText('Done Task')).toBeInTheDocument();
  });

  it('should show priority indicators on cards', () => {
    const tasks = [
      createTask({ title: 'Urgent', priority: 'urgent' }),
      createTask({ title: 'Low', priority: 'low' }),
    ];
    render(<KanbanBoard {...defaultProps} tasks={tasks} />);
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('should show project tag on cards with project_id', () => {
    const tasks = [
      createTask({ project_id: 'p1' }),
    ];
    render(<KanbanBoard {...defaultProps} tasks={tasks} />);
    const projectTag = document.querySelector('.kanban-card__project');
    expect(projectTag).toBeTruthy();
    expect(projectTag?.textContent).toContain('Project Alpha');
  });

  it('should mark overdue due dates', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tasks = [
      createTask({
        title: 'Overdue Task',
        status: 'todo',
        due_date: yesterday.toISOString(),
      }),
    ];
    render(<KanbanBoard {...defaultProps} tasks={tasks} />);
    const overdueSpan = document.querySelector('.kanban-card__due--overdue');
    expect(overdueSpan).toBeTruthy();
  });

  // =====================
  // Click Handlers
  // =====================

  it('should call onEditTask when clicking a card', () => {
    const task = createTask({ title: 'Clickable' });
    render(<KanbanBoard {...defaultProps} tasks={[task]} />);
    fireEvent.click(screen.getByText('Clickable'));
    expect(defaultProps.onEditTask).toHaveBeenCalledWith(task);
  });

  it('should call onCreateTask when clicking add button', () => {
    render(<KanbanBoard {...defaultProps} />);
    fireEvent.click(screen.getByText('+ Neue Aufgabe'));
    expect(defaultProps.onCreateTask).toHaveBeenCalled();
  });

  // =====================
  // Project Filter
  // =====================

  it('should render project filter dropdown', () => {
    render(<KanbanBoard {...defaultProps} />);
    expect(screen.getByLabelText('Projekt filtern')).toBeInTheDocument();
  });

  it('should have "Alle Projekte" as default option', () => {
    render(<KanbanBoard {...defaultProps} />);
    expect(screen.getByText('Alle Projekte')).toBeInTheDocument();
  });

  // =====================
  // Loading State
  // =====================

  it('should show loading skeleton when loading', () => {
    render(<KanbanBoard {...defaultProps} loading={true} />);
    const loadingDiv = document.querySelector('.kanban-loading');
    expect(loadingDiv).toBeTruthy();
  });

  // =====================
  // Drag and Drop
  // =====================

  it('should set draggable attribute on task cards', () => {
    const task = createTask({ title: 'Draggable' });
    render(<KanbanBoard {...defaultProps} tasks={[task]} />);
    const card = screen.getByText('Draggable').closest('.kanban-card');
    expect(card).toHaveAttribute('draggable', 'true');
  });

  it('should handle drag start event', () => {
    const task = createTask({ title: 'Drag Me' });
    render(<KanbanBoard {...defaultProps} tasks={[task]} />);
    const card = screen.getByText('Drag Me').closest('.kanban-card')!;
    fireEvent.dragStart(card, {
      dataTransfer: { setData: vi.fn(), effectAllowed: '' },
    });
  });

  // =====================
  // Empty State
  // =====================

  it('should show empty columns when no tasks', () => {
    render(<KanbanBoard {...defaultProps} tasks={[]} />);
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('Zu erledigen')).toBeInTheDocument();
  });

  it('should show empty state in columns', () => {
    render(<KanbanBoard {...defaultProps} tasks={[]} />);
    const emptyDivs = document.querySelectorAll('.kanban-column__empty');
    expect(emptyDivs.length).toBe(4);
  });
});
