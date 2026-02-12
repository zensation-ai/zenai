/**
 * Unit Tests for GanttChart Component - Phase 37
 *
 * Tests SVG rendering, project grouping, zoom levels,
 * and task bar display.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GanttChart } from '../PlannerPage/GanttChart';
import type { Task, Project } from '../PlannerPage/types';

const today = new Date();
const nextWeek = new Date(today);
nextWeek.setDate(nextWeek.getDate() + 7);

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: `task-${Math.random().toString(36).slice(2)}`,
  title: 'Test Task',
  status: 'todo',
  priority: 'medium',
  sort_order: 0,
  context: 'work',
  labels: [],
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  start_date: today.toISOString(),
  due_date: nextWeek.toISOString(),
  ...overrides,
});

const sampleProject: Project = {
  id: 'p1',
  name: 'Project Alpha',
  status: 'active',
  context: 'work',
  sort_order: 0,
  metadata: {},
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  color: '#4A90D9',
  icon: '📋',
};

const defaultProps = {
  tasks: [] as Task[],
  projects: [sampleProject],
  loading: false,
  context: 'work',
  onEditTask: vi.fn(),
  onCreateProject: vi.fn().mockResolvedValue(null),
  onUpdateProject: vi.fn().mockResolvedValue(null),
  onDeleteProject: vi.fn().mockResolvedValue(true),
  onRefetch: vi.fn(),
};

describe('GanttChart Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =====================
  // Basic Rendering
  // =====================

  it('should render the Gantt chart', () => {
    render(<GanttChart {...defaultProps} />);
    expect(document.querySelector('.gantt-chart')).toBeTruthy();
  });

  it('should render zoom controls', () => {
    render(<GanttChart {...defaultProps} />);
    expect(screen.getByText('Tag')).toBeInTheDocument();
    expect(screen.getByText('Woche')).toBeInTheDocument();
    expect(screen.getByText('Monat')).toBeInTheDocument();
  });

  it('should render SVG element', () => {
    render(<GanttChart {...defaultProps} />);
    const svg = document.querySelector('.gantt-svg');
    expect(svg).toBeTruthy();
  });

  it('should render gantt-container within chart', () => {
    render(<GanttChart {...defaultProps} />);
    expect(document.querySelector('.gantt-container')).toBeTruthy();
  });

  // =====================
  // Task Bars
  // =====================

  it('should render tasks in left panel', () => {
    const tasks = [
      createTask({ title: 'Task With Dates', project_id: 'p1', project_name: 'Project Alpha' }),
    ];
    render(<GanttChart {...defaultProps} tasks={tasks} />);
    const taskTitle = document.querySelector('.gantt-left__task-title');
    expect(taskTitle).toBeTruthy();
    expect(taskTitle?.textContent).toBe('Task With Dates');
  });

  it('should render tasks without dates', () => {
    const tasks = [
      createTask({ title: 'No Dates', start_date: undefined, due_date: undefined }),
    ];
    render(<GanttChart {...defaultProps} tasks={tasks} />);
    expect(screen.getByText('No Dates')).toBeInTheDocument();
  });

  it('should group tasks by project', () => {
    const tasks = [
      createTask({ title: 'Alpha Task', project_id: 'p1', project_name: 'Project Alpha' }),
      createTask({ title: 'Unassigned Task' }),
    ];
    render(<GanttChart {...defaultProps} tasks={tasks} />);
    // Project name appears in .gantt-left__name with icon prefix
    const projectNames = document.querySelectorAll('.gantt-left__name');
    const texts = Array.from(projectNames).map(el => el.textContent);
    expect(texts.some(t => t?.includes('Project Alpha'))).toBe(true);
    expect(texts.some(t => t?.includes('Ohne Projekt'))).toBe(true);
  });

  // =====================
  // Zoom Levels
  // =====================

  it('should default to week zoom', () => {
    render(<GanttChart {...defaultProps} />);
    const activeBtn = document.querySelector('.gantt-zoom__btn--active');
    expect(activeBtn?.textContent).toBe('Woche');
  });

  it('should switch zoom level when clicking zoom buttons', () => {
    render(<GanttChart {...defaultProps} />);

    fireEvent.click(screen.getByText('Tag'));
    let activeBtn = document.querySelector('.gantt-zoom__btn--active');
    expect(activeBtn?.textContent).toBe('Tag');

    fireEvent.click(screen.getByText('Monat'));
    activeBtn = document.querySelector('.gantt-zoom__btn--active');
    expect(activeBtn?.textContent).toBe('Monat');
  });

  // =====================
  // Project Grouping
  // =====================

  it('should show "Ohne Projekt" group for unassigned tasks', () => {
    const tasks = [createTask({ title: 'Orphan' })];
    render(<GanttChart {...defaultProps} tasks={tasks} />);
    expect(screen.getByText('Ohne Projekt')).toBeInTheDocument();
  });

  it('should toggle project collapse', () => {
    const tasks = [
      createTask({ title: 'Alpha Task', project_id: 'p1', project_name: 'Project Alpha' }),
    ];
    render(<GanttChart {...defaultProps} tasks={tasks} />);

    // Find the toggle button
    const toggleBtn = screen.getByLabelText('Zuklappen');
    expect(toggleBtn).toBeTruthy();
    fireEvent.click(toggleBtn);

    // After collapse, the label should change to Aufklappen
    expect(screen.getByLabelText('Aufklappen')).toBeInTheDocument();
  });

  // =====================
  // Today Line
  // =====================

  it('should render today line in SVG', () => {
    render(<GanttChart {...defaultProps} />);
    // Today line is an SVG line with stroke=#D94A4A
    const svg = document.querySelector('.gantt-svg');
    const lines = svg?.querySelectorAll('line');
    const todayLine = Array.from(lines || []).find(l =>
      l.getAttribute('stroke') === '#D94A4A'
    );
    expect(todayLine).toBeTruthy();
  });

  // =====================
  // Task Click
  // =====================

  it('should call onEditTask when clicking a task in left panel', () => {
    const task = createTask({ title: 'Clickable Task', project_id: 'p1' });
    render(<GanttChart {...defaultProps} tasks={[task]} />);

    const taskEl = document.querySelector('.gantt-left__task');
    expect(taskEl).toBeTruthy();
    fireEvent.click(taskEl!);
    expect(defaultProps.onEditTask).toHaveBeenCalledWith(task);
  });

  // =====================
  // Loading State
  // =====================

  it('should show loading indicator when loading', () => {
    render(<GanttChart {...defaultProps} loading={true} />);
    expect(document.querySelector('.gantt-loading')).toBeTruthy();
  });

  // =====================
  // Empty State
  // =====================

  it('should handle no tasks gracefully', () => {
    render(<GanttChart {...defaultProps} tasks={[]} />);
    expect(document.querySelector('.gantt-chart')).toBeTruthy();
  });

  // =====================
  // Project Creation
  // =====================

  it('should show new project form when clicking add button', () => {
    render(<GanttChart {...defaultProps} />);
    fireEvent.click(screen.getByText('+ Neues Projekt'));
    expect(screen.getByPlaceholderText('Projektname...')).toBeInTheDocument();
  });

  it('should call onCreateProject when submitting project form', () => {
    defaultProps.onCreateProject.mockResolvedValue(sampleProject);
    render(<GanttChart {...defaultProps} />);

    fireEvent.click(screen.getByText('+ Neues Projekt'));
    const input = screen.getByPlaceholderText('Projektname...');
    fireEvent.change(input, { target: { value: 'New Project' } });

    fireEvent.click(screen.getByText('Erstellen'));

    expect(defaultProps.onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Project' })
    );
  });

  it('should hide project form when clicking cancel', () => {
    render(<GanttChart {...defaultProps} />);
    fireEvent.click(screen.getByText('+ Neues Projekt'));
    expect(screen.getByPlaceholderText('Projektname...')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Abbrechen'));
    expect(screen.queryByPlaceholderText('Projektname...')).toBeNull();
  });
});
