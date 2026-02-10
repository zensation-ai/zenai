import { Router } from 'express';
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

export const meetingsRouter = Router();

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
meetingsRouter.post('/search', apiKeyAuth, validateBody(MeetingSearchSchema), asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { query, limit } = req.body;

  const results = await searchMeetings(query, limit);

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
meetingsRouter.get('/action-items/all', apiKeyAuth, asyncHandler(async (req, res) => {
  const { completed, company_id } = req.query;

  const items = await getAllActionItems({
    completed: completed !== undefined ? completed === 'true' : undefined,
    company_id: company_id as string,
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
meetingsRouter.post('/', apiKeyAuth, requireScope('write'), validateBody(CreateMeetingSchema), asyncHandler(async (req, res) => {
  const { title, date, company_id, duration_minutes, participants, location, meeting_type } = req.body;

  const meeting = await createMeeting({
    title,
    date,
    company_id,
    duration_minutes,
    participants,
    location,
    meeting_type,
  });

  res.status(201).json({ success: true, meeting });
}));

/**
 * GET /api/meetings
 * List all meetings with filters
 */
meetingsRouter.get('/', apiKeyAuth, asyncHandler(async (req, res) => {
  const { company_id, status, from_date, to_date, limit, offset } = req.query;

  const result = await getMeetings({
    company_id: company_id as string,
    status: status as 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | undefined,
    from_date: from_date as string,
    to_date: to_date as string,
    limit: limit ? parseInt(limit as string) : undefined,
    offset: offset ? parseInt(offset as string) : undefined,
  });

  res.json({
    success: true,
    meetings: result.meetings,
    pagination: {
      total: result.total,
      limit: limit ? parseInt(limit as string) : 20,
      offset: offset ? parseInt(offset as string) : 0,
    },
  });
}));

/**
 * GET /api/meetings/:id
 * Get a single meeting
 */
meetingsRouter.get('/:id', apiKeyAuth, asyncHandler(async (req, res) => {
  // Validate UUID format
  const uuidResult = validateUUID(req.params.id, 'meeting id');
  if (!uuidResult.success) {
    throw new ValidationError('Invalid meeting ID format');
  }

  const meeting = await getMeeting(req.params.id);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  const notes = await getMeetingNotes(req.params.id);

  res.json({ success: true, meeting, notes });
}));

/**
 * PUT /api/meetings/:id/status
 * Update meeting status
 */
meetingsRouter.put('/:id/status', apiKeyAuth, requireScope('write'), asyncHandler(async (req, res) => {
  // Validate UUID format
  const uuidResult = validateUUID(req.params.id, 'meeting id');
  if (!uuidResult.success) {
    throw new ValidationError('Invalid meeting ID format');
  }

  const { status } = req.body;

  if (!['scheduled', 'in_progress', 'completed', 'cancelled'].includes(status)) {
    throw new ValidationError('Invalid status');
  }

  const meeting = await updateMeetingStatus(req.params.id, status);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  res.json({ success: true, meeting });
}));

/**
 * POST /api/meetings/:id/notes
 * Add notes to a meeting (text or audio)
 */
meetingsRouter.post('/:id/notes', apiKeyAuth, requireScope('write'), upload.single('audio'), asyncHandler(async (req, res) => {
  // Validate UUID format
  const uuidResult = validateUUID(req.params.id, 'meeting id');
  if (!uuidResult.success) {
    throw new ValidationError('Invalid meeting ID format');
  }

  const startTime = Date.now();

  const meeting = await getMeeting(req.params.id);
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
  const notes = await processMeetingNotes(req.params.id, transcript);
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
meetingsRouter.get('/:id/notes', apiKeyAuth, asyncHandler(async (req, res) => {
  // Validate UUID format
  const uuidResult = validateUUID(req.params.id, 'meeting id');
  if (!uuidResult.success) {
    throw new ValidationError('Invalid meeting ID format');
  }

  const notes = await getMeetingNotes(req.params.id);

  if (!notes) {
    throw new NotFoundError('Notes not found for this meeting');
  }

  res.json({ success: true, notes });
}));
