/**
 * Tasks Data Hook - Phase 37
 *
 * CRUD operations for tasks with Kanban reorder support.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { Task, TaskStatus } from './types';

interface TaskFilters {
  project_id?: string;
  status?: TaskStatus;
  priority?: string;
}

interface UseTasksDataReturn {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  createTask: (input: Partial<Task>) => Promise<Task | null>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task | null>;
  deleteTask: (id: string) => Promise<boolean>;
  reorderTasks: (status: TaskStatus, taskIds: string[]) => Promise<void>;
}

export function useTasksData(
  context: string,
  filters?: TaskFilters
): UseTasksDataReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filters?.project_id) params.project_id = filters.project_id;
      if (filters?.status) params.status = filters.status;
      if (filters?.priority) params.priority = filters.priority;

      const res = await axios.get(`/api/${context}/tasks`, { params });
      if (res.data?.success) {
        setTasks(res.data.data ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Aufgaben');
    } finally {
      setLoading(false);
    }
  }, [context, filters?.project_id, filters?.status, filters?.priority]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const createTask = useCallback(async (input: Partial<Task>): Promise<Task | null> => {
    try {
      const res = await axios.post(`/api/${context}/tasks`, input);
      if (res.data?.success) {
        const newTask = res.data.data as Task;
        setTasks(prev => [...prev, newTask]);
        return newTask;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen');
      return null;
    }
  }, [context]);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>): Promise<Task | null> => {
    try {
      const res = await axios.put(`/api/${context}/tasks/${id}`, updates);
      if (res.data?.success) {
        const updated = res.data.data as Task;
        setTasks(prev => prev.map(t => t.id === id ? updated : t));
        return updated;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren');
      return null;
    }
  }, [context]);

  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await axios.delete(`/api/${context}/tasks/${id}`);
      if (res.data?.success) {
        setTasks(prev => prev.filter(t => t.id !== id));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [context]);

  const reorderTasks = useCallback(async (status: TaskStatus, taskIds: string[]): Promise<void> => {
    setTasks(prev => prev.map(task => {
      const orderIndex = taskIds.indexOf(task.id);
      if (orderIndex !== -1) {
        return { ...task, sort_order: orderIndex, status };
      }
      return task;
    }));

    try {
      await axios.post(`/api/${context}/tasks/reorder`, { status, taskIds });
    } catch {
      // Revert on failure
      fetchTasks();
    }
  }, [context, fetchTasks]);

  return { tasks, loading, error, refetch: fetchTasks, createTask, updateTask, deleteTask, reorderTasks };
}
