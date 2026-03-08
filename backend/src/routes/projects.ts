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
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, NotFoundError } from '../middleware/errorHandler';
import { validateContextParam } from '../utils/validation';
import { validateBody } from '../utils/schemas';
import { CreateProjectSchema, UpdateProjectSchema } from '../utils/schemas';
import { requireUUID } from '../middleware/validate-params';
import { sendData, sendList, sendMessage, parsePagination } from '../utils/response';

export const projectsRouter = Router();

// ============================================================
// GET /api/:context/projects
// ============================================================

projectsRouter.get('/:context/projects', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { limit, offset } = parsePagination(req, { defaultLimit: 100, maxLimit: 500 });

  const filters = {
    status: req.query.status as string | undefined,
    limit,
    offset,
  };

  const projects = await getProjects(context, filters as Parameters<typeof getProjects>[1]);

  sendList(res, projects);
}));

// ============================================================
// GET /api/:context/projects/:id
// ============================================================

projectsRouter.get('/:context/projects/:id', apiKeyAuth, requireUUID('id'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);

  const project = await getProject(context, req.params.id);
  if (!project) {
    throw new NotFoundError('Project');
  }

  sendData(res, project);
}));

// ============================================================
// POST /api/:context/projects
// ============================================================

projectsRouter.post('/:context/projects', apiKeyAuth, requireScope('write'), validateBody(CreateProjectSchema), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { name, description, color, icon, status, sort_order, metadata } = req.body;

  const project = await createProject(context, {
    name, description, color, icon, status, sort_order, metadata,
  });

  sendData(res, project, 201);
}));

// ============================================================
// PUT /api/:context/projects/:id
// ============================================================

projectsRouter.put('/:context/projects/:id', apiKeyAuth, requireScope('write'), requireUUID('id'), validateBody(UpdateProjectSchema), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);

  const project = await updateProject(context, req.params.id, req.body);
  if (!project) {
    throw new NotFoundError('Project');
  }

  sendData(res, project);
}));

// ============================================================
// DELETE /api/:context/projects/:id
// ============================================================

projectsRouter.delete('/:context/projects/:id', apiKeyAuth, requireScope('write'), requireUUID('id'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);

  const deleted = await deleteProject(context, req.params.id);
  if (!deleted) {
    throw new NotFoundError('Project (already archived?)');
  }

  sendMessage(res, 'Project archived');
}));
