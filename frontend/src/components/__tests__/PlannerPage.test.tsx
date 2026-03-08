/**
 * Unit Tests for PlannerPage Component - Phase 37
 *
 * Tests tab rendering and basic structure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock child components to avoid lazy loading complexity
vi.mock('../CalendarPage', () => ({
  CalendarPage: () => <div data-testid="calendar-page">CalendarPage</div>,
}));

vi.mock('../MeetingsPage', () => ({
  MeetingsPage: () => <div data-testid="meetings-page">MeetingsPage</div>,
}));

vi.mock('../PlannerPage/KanbanBoard', () => ({
  KanbanBoard: () => <div data-testid="kanban-board">KanbanBoard</div>,
}));

vi.mock('../PlannerPage/GanttChart', () => ({
  GanttChart: () => <div data-testid="gantt-chart">GanttChart</div>,
}));

vi.mock('../PlannerPage/MeetingsTab', () => ({
  MeetingsTab: () => <div data-testid="meetings-tab">MeetingsTab</div>,
}));

vi.mock('../PlannerPage/TaskForm', () => ({
  TaskForm: () => <div data-testid="task-form">TaskForm</div>,
}));

// Mock the data hooks
vi.mock('../PlannerPage/useTasksData', () => ({
  useTasksData: () => ({
    tasks: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    reorderTasks: vi.fn(),
  }),
}));

vi.mock('../PlannerPage/useProjectsData', () => ({
  useProjectsData: () => ({
    projects: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
  }),
}));

// Mock useTabNavigation to control active tab
let mockActiveTab = 'calendar';
vi.mock('../../hooks/useTabNavigation', () => ({
  useTabNavigation: () => ({
    activeTab: mockActiveTab,
    handleTabChange: vi.fn(),
  }),
}));

import { PlannerPage } from '../PlannerPage/PlannerPage';

const defaultProps = { onBack: vi.fn() };

describe('PlannerPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTab = 'calendar';
  });

  it('should render tab navigation with 4 tabs', () => {
    render(<PlannerPage context="work" {...defaultProps} />);
    expect(screen.getByText('Kalender')).toBeInTheDocument();
    expect(screen.getByText('Aufgaben')).toBeInTheDocument();
    expect(screen.getByText('Projekte')).toBeInTheDocument();
    expect(screen.getByText('Meetings')).toBeInTheDocument();
    expect(screen.getByText('Karte')).toBeInTheDocument();
  });

  it('should show 5 tab buttons', () => {
    render(<PlannerPage context="work" {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(5);
  });

  it('should mark the active tab as selected', () => {
    render(<PlannerPage context="work" {...defaultProps} />);
    const activeTab = screen.getByRole('tab', { selected: true });
    expect(activeTab).toHaveTextContent('Kalender');
  });

  it('should render calendar content when calendar tab is active', async () => {
    mockActiveTab = 'calendar';
    render(<PlannerPage context="work" {...defaultProps} />);
    const plannerPage = document.querySelector('.hub-page');
    expect(plannerPage).toBeTruthy();
  });

  it('should render KanbanBoard when tasks tab is active', async () => {
    mockActiveTab = 'tasks';
    render(<PlannerPage context="work" initialTab="tasks" {...defaultProps} />);
    const kanban = await screen.findByTestId('kanban-board');
    expect(kanban).toBeInTheDocument();
  });

  it('should render content area for projects tab', () => {
    mockActiveTab = 'projects';
    render(<PlannerPage context="work" {...defaultProps} />);
    const plannerPage = document.querySelector('.hub-page');
    expect(plannerPage).toBeTruthy();
  });

  it('should render content area for meetings tab', () => {
    mockActiveTab = 'meetings';
    render(<PlannerPage context="work" {...defaultProps} />);
    const plannerPage = document.querySelector('.hub-page');
    expect(plannerPage).toBeTruthy();
  });

  it('should accept different contexts', () => {
    const { rerender } = render(<PlannerPage context="personal" {...defaultProps} />);
    expect(screen.getByText('Kalender')).toBeInTheDocument();

    rerender(<PlannerPage context="learning" {...defaultProps} />);
    expect(screen.getByText('Kalender')).toBeInTheDocument();
  });
});
