/**
 * PlannerPage - Phase 37
 *
 * Central planning hub with tabs: Kalender, Aufgaben (Kanban), Projekte (Gantt), Meetings.
 * Replaces the standalone CalendarPage.
 */

import { useState, useMemo, lazy, Suspense, useCallback } from 'react';
import type { PlannerTab, Task } from './types';
import { useTasksData } from './useTasksData';
import { useProjectsData } from './useProjectsData';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { SkeletonLoader } from '../SkeletonLoader';
import './PlannerPage.css';

const CalendarPage = lazy(() =>
  import('../CalendarPage/CalendarPage').then(m => ({ default: m.CalendarPage }))
);
const KanbanBoard = lazy(() =>
  import('./KanbanBoard').then(m => ({ default: m.KanbanBoard }))
);
const GanttChart = lazy(() =>
  import('./GanttChart').then(m => ({ default: m.GanttChart }))
);
const MeetingsTab = lazy(() =>
  import('./MeetingsTab').then(m => ({ default: m.MeetingsTab }))
);

// Lazy-loaded modal
const TaskForm = lazy(() =>
  import('./TaskForm').then(m => ({ default: m.TaskForm }))
);

interface PlannerPageProps {
  context: 'personal' | 'work' | 'learning' | 'creative';
  initialTab?: PlannerTab;
}

const TABS: { id: PlannerTab; label: string; icon: string }[] = [
  { id: 'calendar', label: 'Kalender', icon: '\uD83D\uDCC5' },
  { id: 'tasks', label: 'Aufgaben', icon: '\u2705' },
  { id: 'projects', label: 'Projekte', icon: '\uD83D\uDCCA' },
  { id: 'meetings', label: 'Meetings', icon: '\uD83C\uDF99\uFE0F' },
];

export function PlannerPage({ context, initialTab = 'calendar' }: PlannerPageProps) {
  const { activeTab, handleTabChange } = useTabNavigation<PlannerTab>({
    initialTab,
    validTabs: ['calendar', 'tasks', 'projects', 'meetings'],
    defaultTab: 'calendar',
    basePath: '/calendar',
    rootTab: 'calendar',
  });
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);

  const {
    tasks, loading: tasksLoading,
    createTask, updateTask, reorderTasks,
  } = useTasksData(context, projectFilter ? { project_id: projectFilter } : undefined);

  const {
    projects, loading: projectsLoading,
    createProject,
  } = useProjectsData(context);

  // Memoize open task count (avoid double-filtering in render)
  const openTaskCount = useMemo(
    () => tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length,
    [tasks]
  );

  const handleCreateTask = useCallback(() => {
    setEditingTask(null);
    setShowTaskForm(true);
  }, []);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setShowTaskForm(true);
  }, []);

  const handleTaskFormSubmit = useCallback(async (data: Partial<Task>) => {
    if (editingTask) {
      await updateTask(editingTask.id, data);
    } else {
      await createTask(data);
    }
    setShowTaskForm(false);
    setEditingTask(null);
  }, [editingTask, updateTask, createTask]);

  const handleTaskFormClose = useCallback(() => {
    setShowTaskForm(false);
    setEditingTask(null);
  }, []);

  return (
    <div className="planner-page">
      {/* Tab Navigation */}
      <div className="planner-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`planner-tab ${activeTab === tab.id ? 'planner-tab--active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            <span className="planner-tab__icon" aria-hidden="true">{tab.icon}</span>
            <span className="planner-tab__label">{tab.label}</span>
            {tab.id === 'tasks' && openTaskCount > 0 && (
              <span className="planner-tab__badge">
                {openTaskCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="planner-content" role="tabpanel">
        <Suspense fallback={<SkeletonLoader type="card" count={1} />}>
          {activeTab === 'calendar' && (
            <CalendarPage context={context} embedded={true} />
          )}

          {activeTab === 'tasks' && (
            <KanbanBoard
              tasks={tasks}
              projects={projects}
              loading={tasksLoading}
              projectFilter={projectFilter}
              onProjectFilterChange={setProjectFilter}
              onCreateTask={handleCreateTask}
              onEditTask={handleEditTask}
              onReorder={reorderTasks}
            />
          )}

          {activeTab === 'projects' && (
            <GanttChart
              tasks={tasks}
              projects={projects}
              loading={tasksLoading || projectsLoading}
              context={context}
              onEditTask={handleEditTask}
              onCreateProject={createProject}
            />
          )}

          {activeTab === 'meetings' && (
            <MeetingsTab context={context} />
          )}
        </Suspense>
      </div>

      {/* Task Form Modal */}
      {showTaskForm && (
        <Suspense fallback={null}>
          <TaskForm
            task={editingTask}
            projects={projects}
            onSubmit={handleTaskFormSubmit}
            onClose={handleTaskFormClose}
          />
        </Suspense>
      )}
    </div>
  );
}
