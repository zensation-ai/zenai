/**
 * Task & Project types shared across frontend and backend
 */

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish';
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  project_id?: string;
  due_date?: string;
  assignee?: string;
  estimated_hours?: number;
  tags?: string[];
  created_at: string;
  updated_at?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  status: ProjectStatus;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: DependencyType;
}
