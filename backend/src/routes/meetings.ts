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
meetingsRouter.post('/search', async (req, res) => {
  const startTime = Date.now();

  try {
    const { query, limit } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const results = await searchMeetings(query, limit || 10);

    res.json({
      results,
      count: results.length,
      processingTime: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('Search meetings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/meetings/action-items/all
 * Get all action items across meetings
 * NOTE: Must be defined BEFORE /:id route
 */
meetingsRouter.get('/action-items/all', async (req, res) => {
  try {
    const { completed, company_id } = req.query;

    const items = await getAllActionItems({
      completed: completed !== undefined ? completed === 'true' : undefined,
      company_id: company_id as string,
    });

    res.json({
      action_items: items,
      count: items.length,
    });
  } catch (error: any) {
    console.error('Get action items error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/meetings
 * Create a new meeting
 */
meetingsRouter.post('/', async (req, res) => {
  try {
    const { title, date, company_id, duration_minutes, participants, location, meeting_type } = req.body;

    if (!title || !date) {
      return res.status(400).json({ error: 'Title and date are required' });
    }

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
  } catch (error: any) {
    console.error('Create meeting error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/meetings
 * List all meetings with filters
 */
meetingsRouter.get('/', async (req, res) => {
  try {
    const { company_id, status, from_date, to_date, limit, offset } = req.query;

    const result = await getMeetings({
      company_id: company_id as string,
      status: status as any,
      from_date: from_date as string,
      to_date: to_date as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({
      meetings: result.meetings,
      pagination: {
        total: result.total,
        limit: limit ? parseInt(limit as string) : 20,
        offset: offset ? parseInt(offset as string) : 0,
      },
    });
  } catch (error: any) {
    console.error('Get meetings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/meetings/:id
 * Get a single meeting
 */
meetingsRouter.get('/:id', async (req, res) => {
  try {
    const meeting = await getMeeting(req.params.id);

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const notes = await getMeetingNotes(req.params.id);

    res.json({ meeting, notes });
  } catch (error: any) {
    console.error('Get meeting error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/meetings/:id/status
 * Update meeting status
 */
meetingsRouter.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!['scheduled', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const meeting = await updateMeetingStatus(req.params.id, status);

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({ success: true, meeting });
  } catch (error: any) {
    console.error('Update meeting status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/meetings/:id/notes
 * Add notes to a meeting (text or audio)
 */
meetingsRouter.post('/:id/notes', upload.single('audio'), async (req, res) => {
  const startTime = Date.now();

  try {
    const meeting = await getMeeting(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    let transcript: string;
    let transcriptionTime = 0;

    // Check if audio was uploaded
    if (req.file) {
      console.log(`Transcribing meeting audio: ${req.file.originalname} (${req.file.size} bytes)`);

      const transcribeStart = Date.now();
      const result = await transcribeAudio(req.file.buffer, req.file.originalname);
      transcriptionTime = Date.now() - transcribeStart;
      transcript = result.text;

      console.log(`Transcribed in ${transcriptionTime}ms`);
    } else {
      transcript = req.body.transcript || req.body.text;
    }

    if (!transcript) {
      return res.status(400).json({
        error: 'No audio or transcript provided',
        hint: 'Upload an audio file or send {"transcript": "..."}',
      });
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
  } catch (error: any) {
    console.error('Process meeting notes error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/meetings/:id/notes
 * Get notes for a meeting
 */
meetingsRouter.get('/:id/notes', async (req, res) => {
  try {
    const notes = await getMeetingNotes(req.params.id);

    if (!notes) {
      return res.status(404).json({ error: 'Notes not found for this meeting' });
    }

    res.json({ notes });
  } catch (error: any) {
    console.error('Get meeting notes error:', error);
    res.status(500).json({ error: error.message });
  }
});
