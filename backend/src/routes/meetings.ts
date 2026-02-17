import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  createMeeting,
  getMeetings,
  getMeeting,
  updateMeetingStatus,
  processMeetingNotes,
  getMeetingNotes,
  searchMeetings,
  getAllActionItems,
} from '../services/meetings';
import { transcribeAudio } from '../services/whisper';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { validateUUID } from '../utils/validation';
import { validateBody } from '../utils/schemas';
import { CreateMeetingSchema, MeetingSearchSchema } from '../utils/schemas';
import { isValidContext, AIContext } from '../utils/database-context';

export const meetingsRouter = Router();

/**
 * Helper: extract AI context from request (query param, body, or header), default 'work'.
 * The /api/meetings/* routes are deprecated — prefer /api/:context/calendar/events/:id/meeting.
 */
function getMeetingContext(req: Request): AIContext {
  const ctx =
    (req.query.context as string) ||
    (req.body?.context as string) ||
    (req.headers['x-ai-context'] as string) ||
    'work';
  return isValidContext(ctx) ? ctx : 'work';
}

/**
 * Middleware: add Deprecation header to signal clients should migrate to Calendar-Meeting API.
 */
function deprecationNotice(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/:context/calendar/events/:id/meeting>; rel="successor-version"');
  next();
}

// Configure multer for audio uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for longer meetings
});

/**
 * POST /api/meetings/search
 * Search meetings by semantic similarity
 * NOTE: Must be defined BEFORE /:id route
 */
meetingsRouter.post('/search', apiKeyAuth, deprecationNotice, validateBody(MeetingSearchSchema), asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { query, limit } = req.body;
  const ctx = getMeetingContext(req);

  const results = await searchMeetings(query, limit, ctx);

  res.json({
    success: true,
    results,
    count: results.length,
    processingTime: Date.now() - startTime,
  });
}));

/**
 * GET /api/meetings/action-items/all
 * Get all action items across meetings
 * NOTE: Must be defined BEFORE /:id route
 */
meetingsRouter.get('/action-items/all', apiKeyAuth, deprecationNotice, asyncHandler(async (req, res) => {
  const { completed, company_id } = req.query;
  const ctx = getMeetingContext(req);

  const items = await getAllActionItems({
    completed: completed !== undefined ? completed === 'true' : undefined,
    company_id: company_id as string,
    context: ctx,
  });

  res.json({
    success: true,
    action_items: items,
    count: items.length,
  });
}));

/**
 * POST /api/meetings
 * Create a new meeting
 */
meetingsRouter.post('/', apiKeyAuth, requireScope('write'), deprecationNotice, validateBody(CreateMeetingSchema), asyncHandler(async (req, res) => {
  const { title, date, company_id, duration_minutes, participants, location, meeting_type } = req.body;
  const ctx = getMeetingContext(req);

  const meeting = await createMeeting({
    title,
    date,
    company_id,
    duration_minutes,
    participants,
    location,
    meeting_type,
    context: ctx,
  });

  res.status(201).json({ success: true, meeting });
}));

/**
 * GET /api/meetings
 * List all meetings with filters
 */
meetingsRouter.get('/', apiKeyAuth, deprecationNotice, asyncHandler(async (req, res) => {
  const { company_id, status, from_date, to_date, limit, offset } = req.query;
  const ctx = getMeetingContext(req);

  const result = await getMeetings({
    company_id: company_id as string,
    status: status as 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | undefined,
    from_date: from_date as string,
    to_date: to_date as string,
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
    context: ctx,
  });

  res.json({
    success: true,
    meetings: result.meetings,
    pagination: {
      total: result.total,
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
    },
  });
}));

/**
 * GET /api/meetings/:id
 * Get a single meeting
 */
meetingsRouter.get('/:id', apiKeyAuth, deprecationNotice, asyncHandler(async (req, res) => {
  // Validate UUID format
  const uuidResult = validateUUID(req.params.id, 'meeting id');
  if (!uuidResult.success) {
    throw new ValidationError('Invalid meeting ID format');
  }
  const ctx = getMeetingContext(req);

  const meeting = await getMeeting(req.params.id, ctx);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  const notes = await getMeetingNotes(req.params.id, ctx);

  res.json({ success: true, meeting, notes });
}));

/**
 * PUT /api/meetings/:id/status
 * Update meeting status
 */
meetingsRouter.put('/:id/status', apiKeyAuth, requireScope('write'), deprecationNotice, asyncHandler(async (req, res) => {
  // Validate UUID format
  const uuidResult = validateUUID(req.params.id, 'meeting id');
  if (!uuidResult.success) {
    throw new ValidationError('Invalid meeting ID format');
  }
  const ctx = getMeetingContext(req);

  const { status } = req.body;

  if (!['scheduled', 'in_progress', 'completed', 'cancelled'].includes(status)) {
    throw new ValidationError('Invalid status');
  }

  const meeting = await updateMeetingStatus(req.params.id, status, ctx);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  res.json({ success: true, meeting });
}));

/**
 * POST /api/meetings/:id/notes
 * Add notes to a meeting (text or audio)
 */
meetingsRouter.post('/:id/notes', apiKeyAuth, requireScope('write'), deprecationNotice, upload.single('audio'), asyncHandler(async (req, res) => {
  // Validate UUID format
  const uuidResult = validateUUID(req.params.id, 'meeting id');
  if (!uuidResult.success) {
    throw new ValidationError('Invalid meeting ID format');
  }
  const ctx = getMeetingContext(req);

  const startTime = Date.now();

  const meeting = await getMeeting(req.params.id, ctx);
  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  let transcript: string;
  let transcriptionTime = 0;

  // Check if audio was uploaded
  if (req.file) {
    logger.info('Transcribing meeting audio', { filename: req.file.originalname, size: req.file.size });

    const transcribeStart = Date.now();
    const result = await transcribeAudio(req.file.buffer, req.file.originalname);
    transcriptionTime = Date.now() - transcribeStart;
    transcript = result.text;

    logger.info('Meeting audio transcribed', { transcriptionTime });
  } else {
    transcript = req.body.transcript || req.body.text;
  }

  if (!transcript) {
    throw new ValidationError('No audio or transcript provided. Upload an audio file or send {"transcript": "..."}');
  }

  // Process and structure the notes
  const structureStart = Date.now();
  const notes = await processMeetingNotes(req.params.id, transcript, ctx);
  const structureTime = Date.now() - structureStart;

  res.json({
    success: true,
    notes,
    performance: {
      totalMs: Date.now() - startTime,
      transcriptionMs: transcriptionTime,
      structureMs: structureTime,
    },
  });
}));

/**
 * GET /api/meetings/:id/notes
 * Get notes for a meeting
 */
meetingsRouter.get('/:id/notes', apiKeyAuth, deprecationNotice, asyncHandler(async (req, res) => {
  // Validate UUID format
  const uuidResult = validateUUID(req.params.id, 'meeting id');
  if (!uuidResult.success) {
    throw new ValidationError('Invalid meeting ID format');
  }
  const ctx = getMeetingContext(req);

  const notes = await getMeetingNotes(req.params.id, ctx);

  if (!notes) {
    throw new NotFoundError('Notes not found for this meeting');
  }

  res.json({ success: true, notes });
}));
