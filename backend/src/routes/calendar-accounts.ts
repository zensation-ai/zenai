/**
 * Calendar Accounts & AI Routes - Phase 40
 *
 * Context-aware: /api/:context/calendar/accounts/*
 * AI features:   /api/:context/calendar/ai/*
 */

import { Router } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { isValidUUID, validateContextParam } from '../utils/validation';
import { logger } from '../utils/logger';

// Account management
import {
  createCalendarAccount,
  getCalendarAccounts,
  getCalendarAccount,
  updateCalendarAccount,
  deleteCalendarAccount,
  syncAccount,
} from '../services/caldav-sync';

// CalDAV connector
import { testConnection, discoverCalendars } from '../services/caldav-connector';
import { decrypt } from '../utils/encryption';

// AI features
import {
  generateDailyBriefing,
  suggestTimeSlots,
  detectConflicts,
  checkEventConflicts,
} from '../services/calendar-ai';

export const calendarAccountsRouter = Router();

// ============================================================
// Calendar Accounts CRUD
// ============================================================

/**
 * GET /api/:context/calendar/accounts
 * List all calendar accounts
 */
calendarAccountsRouter.get('/:context/calendar/accounts', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const accounts = await getCalendarAccounts(context);

  // Never expose encrypted passwords
  const safe = accounts.map(a => ({
    ...a,
    password_encrypted: undefined,
    has_password: !!a.password_encrypted,
  }));

  res.json({ success: true, data: safe, count: safe.length });
}));

/**
 * GET /api/:context/calendar/accounts/:id
 * Get single account
 */
calendarAccountsRouter.get('/:context/calendar/accounts/:id', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  if (!isValidUUID(req.params.id)) throw new ValidationError('Invalid account ID');

  const account = await getCalendarAccount(context, req.params.id);
  if (!account) throw new NotFoundError('Calendar account');

  res.json({
    success: true,
    data: { ...account, password_encrypted: undefined, has_password: true },
  });
}));

/**
 * POST /api/:context/calendar/accounts
 * Create a new calendar account (iCloud, etc.)
 */
calendarAccountsRouter.post('/:context/calendar/accounts', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { provider, username, password, display_name, caldav_url } = req.body;

  if (!provider || !username || !password) {
    throw new ValidationError('provider, username, and password are required');
  }

  const allowedProviders = ['icloud', 'google', 'caldav', 'ics'];
  if (!allowedProviders.includes(provider)) {
    throw new ValidationError(`provider must be one of: ${allowedProviders.join(', ')}`);
  }

  // Test connection first
  const serverUrl = caldav_url || (provider === 'icloud' ? 'https://caldav.icloud.com' : undefined);
  if (!serverUrl) {
    throw new ValidationError('caldav_url is required for non-iCloud providers');
  }

  const test = await testConnection({ serverUrl, username, password });
  if (!test.success) {
    return res.status(400).json({
      success: false,
      error: test.message,
    });
  }

  // Create account with discovered calendars
  const calendars = (test.calendars || []).map(c => ({
    url: c.url,
    displayName: c.displayName,
    enabled: true,
    color: c.color,
  }));

  const account = await createCalendarAccount(context, {
    provider,
    username,
    password,
    display_name: display_name || username,
    caldav_url: serverUrl,
    calendars,
  });

  logger.info('Calendar account created via API', {
    accountId: account.id, provider, context,
    calendarCount: calendars.length,
    operation: 'calendarAccountCreate',
  });

  // Trigger initial sync in background
  syncAccount(context, account.id).catch(err => {
    logger.warn('Initial sync failed', {
      accountId: account.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  res.status(201).json({
    success: true,
    data: { ...account, password_encrypted: undefined, has_password: true },
    message: `Verbunden! ${calendars.length} Kalender gefunden. Sync gestartet.`,
  });
}));

/**
 * PUT /api/:context/calendar/accounts/:id
 * Update account settings
 */
calendarAccountsRouter.put('/:context/calendar/accounts/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  if (!isValidUUID(req.params.id)) throw new ValidationError('Invalid account ID');

  const { display_name, caldav_url, calendars, is_enabled, sync_interval_minutes, password } = req.body;

  const updated = await updateCalendarAccount(context, req.params.id, {
    display_name, caldav_url, calendars, is_enabled, sync_interval_minutes, password,
  });

  if (!updated) throw new NotFoundError('Calendar account');

  res.json({
    success: true,
    data: { ...updated, password_encrypted: undefined, has_password: true },
  });
}));

/**
 * DELETE /api/:context/calendar/accounts/:id
 * Delete account and its synced events
 */
calendarAccountsRouter.delete('/:context/calendar/accounts/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  if (!isValidUUID(req.params.id)) throw new ValidationError('Invalid account ID');

  const deleted = await deleteCalendarAccount(context, req.params.id);
  if (!deleted) throw new NotFoundError('Calendar account');

  res.json({ success: true, message: 'Account und synchronisierte Termine gelöscht.' });
}));

/**
 * POST /api/:context/calendar/accounts/:id/test
 * Test CalDAV connection
 */
calendarAccountsRouter.post('/:context/calendar/accounts/:id/test', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  if (!isValidUUID(req.params.id)) throw new ValidationError('Invalid account ID');

  const account = await getCalendarAccount(context, req.params.id);
  if (!account) throw new NotFoundError('Calendar account');

  const result = await testConnection({
    serverUrl: account.caldav_url,
    username: account.username,
    password: decrypt(account.password_encrypted),
  });

  res.json({ success: result.success, message: result.message, calendars: result.calendars });
}));

/**
 * POST /api/:context/calendar/accounts/:id/sync
 * Trigger manual sync for an account
 */
calendarAccountsRouter.post('/:context/calendar/accounts/:id/sync', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  if (!isValidUUID(req.params.id)) throw new ValidationError('Invalid account ID');

  const result = await syncAccount(context, req.params.id);

  res.json({
    success: true,
    data: result,
    message: `Sync abgeschlossen: ${result.created} neu, ${result.updated} aktualisiert, ${result.deleted} gelöscht.`,
  });
}));

/**
 * POST /api/:context/calendar/accounts/:id/discover
 * Discover available calendars on the remote server
 */
calendarAccountsRouter.post('/:context/calendar/accounts/:id/discover', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  if (!isValidUUID(req.params.id)) throw new ValidationError('Invalid account ID');

  const account = await getCalendarAccount(context, req.params.id);
  if (!account) throw new NotFoundError('Calendar account');

  const calendars = await discoverCalendars({
    serverUrl: account.caldav_url,
    username: account.username,
    password: decrypt(account.password_encrypted),
  });

  res.json({ success: true, data: calendars, count: calendars.length });
}));

// ============================================================
// Calendar AI Features
// ============================================================

/**
 * GET /api/:context/calendar/ai/briefing
 * Get or generate daily briefing
 */
calendarAccountsRouter.get('/:context/calendar/ai/briefing', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const date = req.query.date as string | undefined;

  const briefing = await generateDailyBriefing(context, date);

  res.json({ success: true, data: briefing });
}));

/**
 * POST /api/:context/calendar/ai/suggest
 * Get smart time slot suggestions
 */
calendarAccountsRouter.post('/:context/calendar/ai/suggest', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { title, duration_minutes, preferred_time, earliest_date, latest_date, participants } = req.body;

  if (!title || typeof title !== 'string') {
    throw new ValidationError('title is required');
  }
  if (!duration_minutes || typeof duration_minutes !== 'number' || duration_minutes < 5) {
    throw new ValidationError('duration_minutes must be at least 5');
  }

  const suggestions = await suggestTimeSlots(context, {
    title,
    duration_minutes,
    preferred_time,
    earliest_date,
    latest_date,
    participants,
  });

  res.json({ success: true, data: suggestions, count: suggestions.length });
}));

/**
 * GET /api/:context/calendar/ai/conflicts
 * Detect scheduling conflicts
 */
calendarAccountsRouter.get('/:context/calendar/ai/conflicts', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const start = req.query.start as string | undefined;
  const end = req.query.end as string | undefined;

  const conflicts = await detectConflicts(
    context,
    start && end ? { start, end } : undefined
  );

  res.json({
    success: true,
    data: conflicts,
    count: conflicts.length,
    has_errors: conflicts.some(c => c.severity === 'error'),
  });
}));

/**
 * POST /api/:context/calendar/ai/check-conflicts
 * Check conflicts for a specific time slot (before creating/updating an event)
 */
calendarAccountsRouter.post('/:context/calendar/ai/check-conflicts', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { start_time, end_time, exclude_event_id } = req.body;

  if (!start_time || !end_time) {
    throw new ValidationError('start_time and end_time are required');
  }

  const conflicts = await checkEventConflicts(context, start_time, end_time, exclude_event_id);

  res.json({
    success: true,
    data: conflicts,
    has_conflicts: conflicts.length > 0,
  });
}));
