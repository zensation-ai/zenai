/**
 * PlannerPage - Phase 37
 *
 * Central planning hub with tabs: Kalender, Aufgaben (Kanban), Projekte (Gantt), Meetings.
 * Uses shared HubPage layout for consistent UI.
 *
 * Migrated to React Query for caching + deduplication (Phase 4.1d).
 */

import { useState, useMemo, lazy, Suspense, useCallback } from 'react';
import type { PlannerTab, Task, Project } from './types';
import {
  useTasksQuery,
  useProjectsQuery,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useReorderTasksMutation,
  useCreateProjectMutation,
} from '../../hooks/queries/useTasks';
import { useTabNavigation } from '../../hooks/useTabNavigation';
import { HubPage, type TabDef } from '../HubPage';
import { SkeletonLoader } from '../SkeletonLoader';
import { QueryErrorState } from '../QueryErrorState';
import type { AIContext } from '../ContextSwitcher';

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
const MapView = lazy(() =>
  import('./MapView').then(m => ({ default: m.MapView }))
);
const TaskForm = lazy(() =>
  import('./TaskForm').then(m => ({ default: m.TaskForm }))
);

interface PlannerPageProps {
  context: AIContext;
  initialTab?: PlannerTab;
  onBack: () => void;
}

const TABS: TabDef<PlannerTab>[] = [
  { id: 'calendar', label: 'Kalender', icon: '📅' },
  { id: 'tasks', label: 'Aufgaben', icon: '✅' },
  { id: 'projects', label: 'Projekte', icon: '📊' },
  { id: 'meetings', label: 'Meetings', icon: '🎙️' },
  { id: 'map', label: 'Karte', icon: '🗺️' },
];

export function PlannerPage({ context, initialTab = 'calendar', onBack }: PlannerPageProps) {
  const { activeTab, handleTabChange } = useTabNavigation<PlannerTab>({
    initialTab,
    validTabs: ['calendar', 'tasks', 'projects', 'meetings', 'map'],
    defaultTab: 'calendar',
    basePath: '/calendar',
    rootTab: 'calendar',
  });
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);

  // React Query hooks — replaces useTasksData + useProjectsData
  const taskFilters = projectFilter ? { project_id: projectFilter } : undefined;
  const tasksQuery = useTasksQuery(context, taskFilters);
  const projectsQuery = useProjectsQuery(context);

  const createTaskMutation = useCreateTaskMutation(context);
  const updateTaskMutation = useUpdateTaskMutation(context);
  const reorderTasksMutation = useReorderTasksMutation(context);
  const createProjectMutation = useCreateProjectMutation(context);

  // Derived data
  const tasks = (tasksQuery.data ?? []) as Task[];
  const projects = (projectsQuery.data ?? []) as Project[];
  const tasksLoading = tasksQuery.isLoading;
  const projectsLoading = projectsQuery.isLoading;

  const openTaskCount = useMemo(
    () => tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length,
    [tasks]
  );

  // Build tabs with dynamic badge
  const tabsWithBadge = useMemo(() =>
    TABS.map(tab => tab.id === 'tasks' && openTaskCount > 0
      ? { ...tab, badge: openTaskCount }
      : tab
    ), [openTaskCount]
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
      await updateTaskMutation.mutateAsync({ id: editingTask.id, ...data } as { id: string } & Record<string, unknown>);
    } else {
      await createTaskMutation.mutateAsync(data as Record<string, unknown>);
    }
    setShowTaskForm(false);
    setEditingTask(null);
  }, [editingTask, updateTaskMutation, createTaskMutation]);

  const handleTaskFormClose = useCallback(() => {
    setShowTaskForm(false);
    setEditingTask(null);
  }, []);

  const handleReorder = useCallback(async (status: string, taskIds: string[]) => {
    await reorderTasksMutation.mutateAsync({ status, taskIds });
  }, [reorderTasksMutation]);

  const handleCreateProject = useCallback(async (data: Partial<Project>) => {
    return await createProjectMutation.mutateAsync(data as Record<string, unknown>);
  }, [createProjectMutation]);

  return (
    <>
      <HubPage
        title="Planer"
        icon="📅"
        subtitle="Kalender, Aufgaben, Projekte & Meetings"
        tabs={tabsWithBadge}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onBack={onBack}
        context={context}
      >
        {(tasksQuery.isError || projectsQuery.isError) && (
          <QueryErrorState
            error={tasksQuery.error ?? projectsQuery.error}
            refetch={() => { tasksQuery.refetch(); projectsQuery.refetch(); }}
          />
        )}
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
              onReorder={handleReorder}
            />
          )}
          {activeTab === 'projects' && (
            <GanttChart
              tasks={tasks}
              projects={projects}
              loading={tasksLoading || projectsLoading}
              context={context}
              onEditTask={handleEditTask}
              onCreateProject={handleCreateProject}
            />
          )}
          {activeTab === 'meetings' && (
            <MeetingsTab context={context} />
          )}

          {activeTab === 'map' && (
            <MapView context={context} />
          )}
        </Suspense>
      </HubPage>

      {showTaskForm && (
        <Suspense fallback={<div className="modal-loading-overlay" role="status" aria-label="Formular wird geladen"><span className="loading-spinner" /></div>}>
          <TaskForm
            task={editingTask}
            projects={projects}
            onSubmit={handleTaskFormSubmit}
            onClose={handleTaskFormClose}
          />
        </Suspense>
      )}
    </>
  );
}
