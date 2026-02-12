/**
 * Projects Data Hook - Phase 37
 *
 * CRUD operations for projects.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { Project } from './types';

interface UseProjectsDataReturn {
  projects: Project[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  createProject: (input: Partial<Project>) => Promise<Project | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
}

export function useProjectsData(context: string): UseProjectsDataReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/${context}/projects`);
      if (res.data.success) {
        setProjects(res.data.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Projekte');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = useCallback(async (input: Partial<Project>): Promise<Project | null> => {
    try {
      const res = await axios.post(`/api/${context}/projects`, input);
      if (res.data.success) {
        const newProject = res.data.data as Project;
        setProjects(prev => [...prev, newProject]);
        return newProject;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen');
      return null;
    }
  }, [context]);

  const updateProject = useCallback(async (id: string, updates: Partial<Project>): Promise<Project | null> => {
    try {
      const res = await axios.put(`/api/${context}/projects/${id}`, updates);
      if (res.data.success) {
        const updated = res.data.data as Project;
        setProjects(prev => prev.map(p => p.id === id ? updated : p));
        return updated;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren');
      return null;
    }
  }, [context]);

  const deleteProject = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await axios.delete(`/api/${context}/projects/${id}`);
      if (res.data.success) {
        setProjects(prev => prev.filter(p => p.id !== id));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [context]);

  return { projects, loading, error, refetch: fetchProjects, createProject, updateProject, deleteProject };
}
