/**
 * Calendar Routes - Phase 35
 *
 * Context-aware calendar API: /api/:context/calendar/*
 * Supports CRUD operations, semantic search, and upcoming events.
 */

import { Router } from 'express';
import {
  createCalendarEvent,
  getCalendarEvents,
  getCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getUpcomingEvents,
  searchCalendarEvents,
} from '../services/calendar';
import { AIContext, isValidContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { isValidUUID } from '../utils/validation';
import { logger } from '../utils/logger';
import type { EventType, EventStatus } from '../services/calendar';

export const calendarRouter = Router();

// ============================================================
// Helper: validate context from params
// ============================================================

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
// POST /api/:context/calendar/events/search
// Semantic search (must be before /:id route)
// ============================================================

calendarRouter.post('/:context/calendar/events/search', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { query, limit } = req.body;

  if (!query || typeof query !== 'string') {
    throw new ValidationError('Query string is required', { query: 'must be a non-empty string' });
  }

  const results = await searchCalendarEvents(context, query, Math.min(limit || 10, 50));

  res.json({
    success: true,
    data: results,
    count: results.length,
  });
}));

// ============================================================
// GET /api/:context/calendar/upcoming
// Get upcoming events for dashboard widget
// ============================================================

calendarRouter.get('/:context/calendar/upcoming', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const hours = Math.min(parseInt(req.query.hours as string) || 24, 168); // Max 7 days

  const events = await getUpcomingEvents(context, hours);

  res.json({
    success: true,
    data: events,
    count: events.length,
  });
}));

// ============================================================
// GET /api/:context/calendar/events
// List events with filters (date range, type, status)
// ============================================================

calendarRouter.get('/:context/calendar/events', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);

  const filters = {
    start: req.query.start as string | undefined,
    end: req.query.end as string | undefined,
    event_type: req.query.type as EventType | undefined,
    status: req.query.status as EventStatus | undefined,
    limit: Math.min(parseInt(req.query.limit as string) || 100, 500),
    offset: parseInt(req.query.offset as string) || 0,
  };

  // Validate date formats if provided
  if (filters.start && isNaN(Date.parse(filters.start))) {
    throw new ValidationError('Invalid start date', { start: 'must be a valid ISO date string' });
  }
  if (filters.end && isNaN(Date.parse(filters.end))) {
    throw new ValidationError('Invalid end date', { end: 'must be a valid ISO date string' });
  }

  const events = await getCalendarEvents(context, filters);

  res.json({
    success: true,
    data: events,
    count: events.length,
  });
}));

// ============================================================
// GET /api/:context/calendar/events/:id
// Get single event
// ============================================================

calendarRouter.get('/:context/calendar/events/:id', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid event ID', { id: 'must be a valid UUID' });
  }

  const event = await getCalendarEvent(context, id);
  if (!event) {
    throw new NotFoundError('Calendar event not found');
  }

  res.json({
    success: true,
    data: event,
  });
}));

// ============================================================
// POST /api/:context/calendar/events
// Create event
// ============================================================

calendarRouter.post('/:context/calendar/events', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const {
    title, description, event_type, start_time, end_time,
    all_day, location, participants, rrule,
    source_idea_id, source_voice_memo_id,
    travel_duration_minutes, travel_origin, travel_destination,
    status, color, reminder_minutes, notes, metadata,
    ai_generated, ai_confidence,
  } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw new ValidationError('Title is required', { title: 'must be a non-empty string' });
  }
  if (!start_time || isNaN(Date.parse(start_time))) {
    throw new ValidationError('Valid start_time is required', { start_time: 'must be a valid ISO date string' });
  }

  const event = await createCalendarEvent(context, {
    title: title.trim(),
    description,
    event_type,
    start_time,
    end_time,
    all_day,
    location,
    participants,
    rrule,
    source_idea_id,
    source_voice_memo_id,
    travel_duration_minutes,
    travel_origin,
    travel_destination,
    status,
    color,
    reminder_minutes,
    notes,
    metadata,
    ai_generated,
    ai_confidence,
  });

  logger.info('Calendar event created via API', {
    id: event.id, title: event.title, context,
    operation: 'calendarCreateEvent'
  });

  res.status(201).json({
    success: true,
    data: event,
  });
}));

// ============================================================
// PUT /api/:context/calendar/events/:id
// Update event
// ============================================================

calendarRouter.put('/:context/calendar/events/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid event ID', { id: 'must be a valid UUID' });
  }

  const event = await updateCalendarEvent(context, id, req.body);
  if (!event) {
    throw new NotFoundError('Calendar event not found');
  }

  res.json({
    success: true,
    data: event,
  });
}));

// ============================================================
// DELETE /api/:context/calendar/events/:id
// Cancel event (soft delete)
// ============================================================

calendarRouter.delete('/:context/calendar/events/:id', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = getContextFromParams(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid event ID', { id: 'must be a valid UUID' });
  }

  const deleted = await deleteCalendarEvent(context, id);
  if (!deleted) {
    throw new NotFoundError('Calendar event not found or already cancelled');
  }

  res.json({
    success: true,
    message: 'Event cancelled',
  });
}));
