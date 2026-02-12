/**
 * Planner Types - Phase 37
 */

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish';
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type PlannerTab = 'calendar' | 'tasks' | 'projects' | 'meetings';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  project_id?: string;
  source_idea_id?: string;
  calendar_event_id?: string;
  due_date?: string;
  start_date?: string;
  completed_at?: string;
  assignee?: string;
  estimated_hours?: number;
  actual_hours?: number;
  sort_order: number;
  context: string;
  labels: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Computed (from Gantt endpoint)
  dependencies?: TaskDependency[];
  project_name?: string;
  project_color?: string;
}

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_id: string;
  dependency_type: DependencyType;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  status: ProjectStatus;
  context: string;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  task_count?: number;
}

export interface KanbanColumn {
  status: TaskStatus;
  label: string;
  color: string;
  tasks: Task[];
}

export const KANBAN_COLUMNS: Omit<KanbanColumn, 'tasks'>[] = [
  { status: 'backlog', label: 'Backlog', color: '#8B8B8B' },
  { status: 'todo', label: 'Zu erledigen', color: '#4A90D9' },
  { status: 'in_progress', label: 'In Arbeit', color: '#E8A838' },
  { status: 'done', label: 'Erledigt', color: '#4CAF50' },
];

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: '#8B8B8B',
  medium: '#4A90D9',
  high: '#E8A838',
  urgent: '#D94A4A',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  urgent: 'Dringend',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Aktiv',
  on_hold: 'Pausiert',
  completed: 'Abgeschlossen',
  archived: 'Archiviert',
};
