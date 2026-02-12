/**
 * Project Routes - Phase 37
 *
 * Context-aware project API: /api/:context/projects/*
 */

import { Router } from 'express';
import {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
} from '../services/projects';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { isValidUUID } from '../utils/validation';

export const projectsRouter = Router();

function getContextFromParams(context: string): AIContext {
  if (!isValidContext(context)) {
    throw new ValidationError(
      'Invalid context. Use "personal", "work", "learning", or "creative".',
      { context: 'must be "personal", "work", "learning", or "creative"' }
    );
  }
  return context as AIContext;
}

// ============================================================
// GET /api/:context/projects
// ============================================================

projectsRouter.get('/:context/projects', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);

  const filters = {
    status: req.query.status as string | undefined,
    limit: Math.min(parseInt(req.query.limit as string) || 100, 500),
    offset: parseInt(req.query.offset as string) || 0,
  };

  const projects = await getProjects(context, filters as Parameters<typeof getProjects>[1]);

  res.json({
    success: true,
    data: projects,
    count: projects.length,
  });
}));

// ============================================================
// GET /api/:context/projects/:id
// ============================================================

projectsRouter.get('/:context/projects/:id', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid project ID', { id: 'must be a valid UUID' });
  }

  const project = await getProject(context, id);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  res.json({
    success: true,
    data: project,
  });
}));

// ============================================================
// POST /api/:context/projects
// ============================================================

projectsRouter.post('/:context/projects', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { name, description, color, icon, status, sort_order, metadata } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('Name is required', { name: 'must be a non-empty string' });
  }

  const project = await createProject(context, {
    name: name.trim(),
    description,
    color,
    icon,
    status,
    sort_order,
    metadata,
  });

  res.status(201).json({
    success: true,
    data: project,
  });
}));

// ============================================================
// PUT /api/:context/projects/:id
// ============================================================

projectsRouter.put('/:context/projects/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid project ID', { id: 'must be a valid UUID' });
  }

  const project = await updateProject(context, id, req.body);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  res.json({
    success: true,
    data: project,
  });
}));

// ============================================================
// DELETE /api/:context/projects/:id
// ============================================================

projectsRouter.delete('/:context/projects/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid project ID', { id: 'must be a valid UUID' });
  }

  const deleted = await deleteProject(context, id);
  if (!deleted) {
    throw new NotFoundError('Project not found or already archived');
  }

  res.json({
    success: true,
    message: 'Project archived',
  });
}));
