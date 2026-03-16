/**
 * Contacts & CRM Routes - Phase 3
 *
 * REST API for contacts, organizations, and interactions.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { AIContext } from '../utils/database-context';
import { isValidUUID } from '../utils/validation';
import { getUserId } from '../utils/user-context';
import { systemUserGuard } from '../middleware/system-user-guard';
import * as contactsService from '../services/contacts';

const router = Router();

// All routes require auth + block SYSTEM_USER_ID (personal CRM data)
router.use(apiKeyAuth);
router.use(systemUserGuard);

// ============================================================
// Helpers
// ============================================================

function validateContextParam(req: Request, res: Response): AIContext | null {
  const context = req.params.context as string;
  if (!['personal', 'work', 'learning', 'creative'].includes(context)) {
    res.status(400).json({ success: false, error: 'Invalid context' });
    return null;
  }
  return context as AIContext;
}

// ============================================================
// Contacts
// ============================================================

// GET /api/:context/contacts
router.get('/:context/contacts', requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  const search = req.query.search as string | undefined;
  const tag = req.query.tag as string | undefined;
  const relationshipType = req.query.relationship_type as string | undefined;

  // Input length validation to prevent oversized query params
  if ((search && search.length > 500) || (tag && tag.length > 200) || (relationshipType && relationshipType.length > 100)) {
    res.status(400).json({ success: false, error: 'Query parameter exceeds maximum length' });
    return;
  }

  const filters: contactsService.ContactFilters = {
    search,
    relationship_type: relationshipType,
    organization_id: req.query.organization_id as string | undefined,
    tag,
    is_favorite: req.query.is_favorite === 'true' ? true : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
  };

  const result = await contactsService.getContacts(context, filters, userId);
  res.json({ success: true, data: result.contacts, total: result.total });
}));

// GET /api/:context/contacts/stats
router.get('/:context/contacts/stats', requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  const stats = await contactsService.getContactStats(context, userId);
  res.json({ success: true, data: stats });
}));

// GET /api/:context/contacts/follow-ups
router.get('/:context/contacts/follow-ups', requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
  const suggestions = await contactsService.getFollowUpSuggestions(context, days, limit, userId);
  res.json({ success: true, data: suggestions });
}));

// GET /api/:context/contacts/:id
router.get('/:context/contacts/:id', requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid contact ID' });
  }

  const contact = await contactsService.getContact(context, req.params.id, userId);
  if (!contact) {
    return res.status(404).json({ success: false, error: 'Contact not found' });
  }
  res.json({ success: true, data: contact });
}));

// POST /api/:context/contacts
router.post('/:context/contacts', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  const { display_name } = req.body;
  if (!display_name || typeof display_name !== 'string') {
    return res.status(400).json({ success: false, error: 'display_name is required' });
  }

  const contact = await contactsService.createContact(context, req.body, userId);
  res.status(201).json({ success: true, data: contact });
}));

// PUT /api/:context/contacts/:id
router.put('/:context/contacts/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid contact ID' });
  }

  const contact = await contactsService.updateContact(context, req.params.id, req.body, userId);
  if (!contact) {
    return res.status(404).json({ success: false, error: 'Contact not found' });
  }
  res.json({ success: true, data: contact });
}));

// DELETE /api/:context/contacts/:id
router.delete('/:context/contacts/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid contact ID' });
  }

  const deleted = await contactsService.deleteContact(context, req.params.id, userId);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Contact not found' });
  }
  res.json({ success: true });
}));

// ============================================================
// Contact Interactions (Timeline)
// ============================================================

// GET /api/:context/contacts/:id/timeline
router.get('/:context/contacts/:id/timeline', requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid contact ID' });
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
  const result = await contactsService.getInteractions(context, req.params.id, limit, offset, userId);
  res.json({ success: true, data: result.interactions, total: result.total });
}));

// POST /api/:context/contacts/:id/interactions
router.post('/:context/contacts/:id/interactions', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid contact ID' });
  }

  const { interaction_type } = req.body;
  if (!interaction_type) {
    return res.status(400).json({ success: false, error: 'interaction_type is required' });
  }

  const interaction = await contactsService.addInteraction(context, {
    ...req.body,
    contact_id: req.params.id,
  }, userId);
  res.status(201).json({ success: true, data: interaction });
}));

// ============================================================
// Organizations
// ============================================================

// GET /api/:context/organizations
router.get('/:context/organizations', requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  const filters: contactsService.OrganizationFilters = {
    search: req.query.search as string | undefined,
    industry: req.query.industry as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
  };

  const result = await contactsService.getOrganizations(context, filters, userId);
  res.json({ success: true, data: result.organizations, total: result.total });
}));

// GET /api/:context/organizations/:id
router.get('/:context/organizations/:id', requireScope('read'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid organization ID' });
  }

  const org = await contactsService.getOrganization(context, req.params.id, userId);
  if (!org) {
    return res.status(404).json({ success: false, error: 'Organization not found' });
  }
  res.json({ success: true, data: org });
}));

// POST /api/:context/organizations
router.post('/:context/organizations', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ success: false, error: 'name is required' });
  }

  const org = await contactsService.createOrganization(context, req.body, userId);
  res.status(201).json({ success: true, data: org });
}));

// PUT /api/:context/organizations/:id
router.put('/:context/organizations/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid organization ID' });
  }

  const org = await contactsService.updateOrganization(context, req.params.id, req.body, userId);
  if (!org) {
    return res.status(404).json({ success: false, error: 'Organization not found' });
  }
  res.json({ success: true, data: org });
}));

// DELETE /api/:context/organizations/:id
router.delete('/:context/organizations/:id', requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const context = validateContextParam(req, res);
  if (!context) { return; }
  const userId = getUserId(req);

  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ success: false, error: 'Invalid organization ID' });
  }

  const deleted = await contactsService.deleteOrganization(context, req.params.id, userId);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Organization not found' });
  }
  res.json({ success: true });
}));

export { router as contactsRouter };
