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
  searchMeetingsHybrid,
  searchMeetingsFullText,
  getAllActionItems,
} from '../services/meetings';
import { transcribeAudio } from '../services/whisper';
import { uploadMeetingAudio, getSignedAudioUrl } from '../services/audio-storage';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { validateUUID } from '../utils/validation';
import { validateBody } from '../utils/schemas';
import { CreateMeetingSchema, MeetingSearchSchema } from '../utils/schemas';
import { isValidContext, AIContext } from '../utils/database-context';
import { getUserId } from '../utils/user-context';

export const meetingsRouter = Router();
export const contextMeetingsRouter = Router({ mergeParams: true });

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
  const _userId = getUserId(req);

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
  const _userId = getUserId(req);

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
  const _userId = getUserId(req);

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
  const _userId = getUserId(req);

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
  const _userId = getUserId(req);

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
  const _userId = getUserId(req);

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
  const _userId = getUserId(req);

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
  const _userId = getUserId(req);

  const notes = await getMeetingNotes(req.params.id, ctx);

  if (!notes) {
    throw new NotFoundError('Meeting notes');
  }

  res.json({ success: true, notes });
}));

// =============================================================================
// Context-aware routes: /api/:context/meetings/*
// =============================================================================

// Audio upload multer config (same as above, shared)
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'audio/wav', 'audio/mpeg', 'audio/webm', 'audio/ogg',
      'audio/m4a', 'audio/mp4', 'audio/x-m4a', 'audio/flac',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid audio format: ${file.mimetype}`));
    }
  },
});

/**
 * Helper: extract validated context from :context param
 */
function getRouteContext(req: Request): AIContext {
  const ctx = req.params.context;
  if (!isValidContext(ctx)) {
    throw new ValidationError(`Invalid context: ${ctx}. Must be personal, work, learning, or creative.`);
  }
  return ctx;
}

/**
 * POST /api/:context/meetings/search
 * Hybrid search across meeting transcripts and summaries
 */
contextMeetingsRouter.post('/search', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = getRouteContext(req);
  const _userId = getUserId(req);
  const startTime = Date.now();
  const { query, mode, limit } = req.body;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new ValidationError('Search query is required');
  }

  const searchLimit = Math.min(limit || 20, 50);
  const searchMode = mode || 'hybrid';

  let results;
  switch (searchMode) {
    case 'semantic':
      results = await searchMeetings(query, searchLimit, ctx);
      break;
    case 'fulltext':
      results = await searchMeetingsFullText(query, searchLimit, ctx);
      break;
    case 'hybrid':
    default:
      results = await searchMeetingsHybrid(query, searchLimit, ctx);
      break;
  }

  res.json({
    success: true,
    results,
    count: results.length,
    mode: searchMode,
    processingTime: Date.now() - startTime,
  });
}));

/**
 * GET /api/:context/meetings
 * List meetings with filters (context-aware)
 */
contextMeetingsRouter.get('/', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = getRouteContext(req);
  const _userId = getUserId(req);
  const { company_id, status, from_date, to_date, has_audio, limit, offset } = req.query;

  const result = await getMeetings({
    company_id: company_id as string,
    status: status as 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | undefined,
    from_date: from_date as string,
    to_date: to_date as string,
    has_audio: has_audio === 'true',
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined,
    context: ctx,
  });

  res.json({
    success: true,
    data: result.meetings,
    pagination: {
      total: result.total,
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
    },
  });
}));

/**
 * POST /api/:context/meetings
 * Create a new meeting (context-aware)
 */
contextMeetingsRouter.post('/', apiKeyAuth, requireScope('write'), validateBody(CreateMeetingSchema), asyncHandler(async (req, res) => {
  const ctx = getRouteContext(req);
  const _userId = getUserId(req);
  const { title, date, company_id, duration_minutes, participants, location, meeting_type } = req.body;

  const meeting = await createMeeting({
    title, date, company_id, duration_minutes, participants, location, meeting_type,
    context: ctx,
  });

  res.status(201).json({ success: true, data: meeting });
}));

/**
 * GET /api/:context/meetings/:id
 * Get a single meeting with notes and audio info
 */
contextMeetingsRouter.get('/:id', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = getRouteContext(req);
  const _userId = getUserId(req);
  const uuidResult = validateUUID(req.params.id, 'meeting id');
  if (!uuidResult.success) {
    throw new ValidationError('Invalid meeting ID format');
  }

  const meeting = await getMeeting(req.params.id, ctx);
  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  const notes = await getMeetingNotes(req.params.id, ctx);

  res.json({ success: true, data: { meeting, notes } });
}));

/**
 * POST /api/:context/meetings/:id/notes
 * Add notes to a meeting with optional audio upload
 * Accepts multipart/form-data with optional 'audio' file
 */
contextMeetingsRouter.post('/:id/notes', apiKeyAuth, requireScope('write'), audioUpload.single('audio'), asyncHandler(async (req, res) => {
  const ctx = getRouteContext(req);
  const _userId = getUserId(req);
  const uuidResult = validateUUID(req.params.id, 'meeting id');
  if (!uuidResult.success) {
    throw new ValidationError('Invalid meeting ID format');
  }

  const startTime = Date.now();

  const meeting = await getMeeting(req.params.id, ctx);
  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  let transcript: string;
  let transcriptionTime = 0;
  let audioMeta;

  // Handle audio upload
  if (req.file) {
    logger.info('Processing meeting audio', { filename: req.file.originalname, size: req.file.size });

    // Transcribe audio
    const transcribeStart = Date.now();
    const result = await transcribeAudio(req.file.buffer, req.file.originalname);
    transcriptionTime = Date.now() - transcribeStart;
    transcript = result.text;

    // Store audio in Supabase Storage
    const uploadResult = await uploadMeetingAudio(
      req.file.buffer,
      req.params.id,
      req.file.mimetype,
      ctx
    );

    if (uploadResult) {
      audioMeta = {
        storagePath: uploadResult.storagePath,
        durationSeconds: result.duration ? Math.round(result.duration) : undefined,
        sizeBytes: uploadResult.sizeBytes,
        mimeType: uploadResult.mimeType,
      };
    }

    logger.info('Meeting audio processed', { transcriptionTime, audioStored: !!uploadResult });
  } else {
    transcript = req.body.transcript || req.body.text;
  }

  if (!transcript) {
    throw new ValidationError('No audio or transcript provided. Upload an audio file or send {"transcript": "..."}');
  }

  // Process and structure the notes
  const structureStart = Date.now();
  const notes = await processMeetingNotes(req.params.id, transcript, ctx, audioMeta);
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
 * GET /api/:context/meetings/:id/audio-url
 * Get a signed URL for audio playback (1 hour expiry)
 */
contextMeetingsRouter.get('/:id/audio-url', apiKeyAuth, asyncHandler(async (req, res) => {
  const ctx = getRouteContext(req);
  const _userId = getUserId(req);
  const uuidResult = validateUUID(req.params.id, 'meeting id');
  if (!uuidResult.success) {
    throw new ValidationError('Invalid meeting ID format');
  }

  const notes = await getMeetingNotes(req.params.id, ctx);
  if (!notes) {
    throw new NotFoundError('Meeting notes');
  }

  if (!notes.audio_storage_path) {
    res.json({ success: true, data: { audioUrl: null, hasAudio: false } });
    return;
  }

  const audioUrl = await getSignedAudioUrl(notes.audio_storage_path);

  res.json({
    success: true,
    data: {
      audioUrl,
      hasAudio: true,
      durationSeconds: notes.audio_duration_seconds,
      sizeBytes: notes.audio_size_bytes,
      mimeType: notes.audio_mime_type,
    },
  });
}));
