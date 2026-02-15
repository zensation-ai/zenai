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
  linkMeetingToEvent,
  getEventMeetingId,
} from '../services/calendar';
import { createMeeting, getMeeting, getMeetingNotes, processMeetingNotes } from '../services/meetings';
import { AIContext } from '../utils/database-context';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { isValidUUID, validateContextParam } from '../utils/validation';
import { logger } from '../utils/logger';
import type { EventType, EventStatus } from '../services/calendar';

export const calendarRouter = Router();

// ============================================================
// POST /api/:context/calendar/events/search
// Semantic search (must be before /:id route)
// ============================================================

calendarRouter.post('/:context/calendar/events/search', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
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
  const context = validateContextParam(req.params.context);
  const hours = Math.min(parseInt(req.query.hours as string, 10) || 24, 168); // Max 7 days

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
  const context = validateContextParam(req.params.context);

  const filters = {
    start: req.query.start as string | undefined,
    end: req.query.end as string | undefined,
    event_type: req.query.type as EventType | undefined,
    status: req.query.status as EventStatus | undefined,
    limit: Math.min(parseInt(req.query.limit as string, 10) || 100, 500),
    offset: parseInt(req.query.offset as string, 10) || 0,
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
  const context = validateContextParam(req.params.context);
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
  const context = validateContextParam(req.params.context);
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
  const context = validateContextParam(req.params.context);
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
  const context = validateContextParam(req.params.context);
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

// ============================================================
// Meeting Protocol Integration (Phase 37)
// ============================================================

/**
 * POST /api/:context/calendar/events/:id/start-meeting
 * Create a meeting from a calendar event and link them
 */
calendarRouter.post('/:context/calendar/events/:id/start-meeting', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid event ID', { id: 'must be a valid UUID' });
  }

  // Get the calendar event
  const event = await getCalendarEvent(context, id);
  if (!event) {
    throw new NotFoundError('Calendar event not found');
  }

  // Check if already linked
  if (event.meeting_id) {
    const existing = await getMeeting(event.meeting_id);
    if (existing) {
      return res.json({ success: true, data: existing, message: 'Meeting already linked' });
    }
  }

  // Create meeting from event data
  const meeting = await createMeeting({
    title: event.title,
    date: event.start_time,
    duration_minutes: event.end_time
      ? Math.round((new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 60000)
      : undefined,
    participants: event.participants,
    location: event.location,
    meeting_type: 'other',
  });

  // Link meeting to event
  await linkMeetingToEvent(context, id, meeting.id);

  logger.info('Meeting created from calendar event', {
    eventId: id, meetingId: meeting.id, context, operation: 'startMeetingFromEvent'
  });

  res.status(201).json({
    success: true,
    data: meeting,
  });
}));

/**
 * GET /api/:context/calendar/events/:id/meeting
 * Get meeting + notes for a calendar event
 */
calendarRouter.get('/:context/calendar/events/:id/meeting', apiKeyAuth, asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid event ID', { id: 'must be a valid UUID' });
  }

  const meetingId = await getEventMeetingId(context, id);
  if (!meetingId) {
    return res.json({ success: true, data: null, message: 'No meeting linked to this event' });
  }

  const [meeting, notes] = await Promise.all([
    getMeeting(meetingId),
    getMeetingNotes(meetingId),
  ]);

  res.json({
    success: true,
    data: {
      meeting,
      notes,
    },
  });
}));

/**
 * POST /api/:context/calendar/events/:id/meeting/notes
 * Add transcript/notes to the meeting linked to a calendar event
 */
calendarRouter.post('/:context/calendar/events/:id/meeting/notes', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  const context = validateContextParam(req.params.context);
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid event ID', { id: 'must be a valid UUID' });
  }

  const meetingId = await getEventMeetingId(context, id);
  if (!meetingId) {
    throw new NotFoundError('No meeting linked to this event. Start a meeting first.');
  }

  const { transcript } = req.body;
  if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
    throw new ValidationError('Transcript is required', { transcript: 'must be a non-empty string' });
  }

  const notes = await processMeetingNotes(meetingId, transcript.trim());

  logger.info('Meeting notes processed from calendar event', {
    eventId: id, meetingId, context, operation: 'processMeetingNotesFromEvent'
  });

  res.status(201).json({
    success: true,
    data: notes,
  });
}));
