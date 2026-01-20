import { v4 as uuidv4 } from 'uuid';
import { query } from '../utils/database';
import { structureWithOllama, generateEmbedding } from '../utils/ollama';
import { formatForPgVector } from '../utils/embedding';
import { logger } from '../utils/logger';
import { parseJsonbWithDefault } from '../types';

export interface Meeting {
  id: string;
  company_id: string;
  title: string;
  date: string;
  duration_minutes?: number;
  participants: string[];
  location?: string;
  meeting_type: 'internal' | 'external' | 'one_on_one' | 'team' | 'client' | 'other';
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface MeetingNotes {
  id: string;
  meeting_id: string;
  raw_transcript: string;
  structured_summary: string;
  key_decisions: string[];
  action_items: ActionItem[];
  topics_discussed: string[];
  follow_ups: FollowUp[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  created_at: string;
}

export interface ActionItem {
  task: string;
  assignee?: string;
  due_date?: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
}

export interface FollowUp {
  topic: string;
  responsible?: string;
  deadline?: string;
}

const MEETING_NOTES_PROMPT = `Du bist ein Meeting-Protokoll-Assistent.
Analysiere das folgende Meeting-Transkript und erstelle eine strukturierte Zusammenfassung.

WICHTIG:
- Antworte NUR mit validem JSON
- Keine zusätzlichen Erklärungen
- Extrahiere alle wichtigen Punkte

OUTPUT FORMAT (JSON):
{
  "structured_summary": "2-3 Sätze Zusammenfassung des Meetings",
  "key_decisions": ["Entscheidung 1", "Entscheidung 2"],
  "action_items": [
    {"task": "Aufgabe", "assignee": "Person", "priority": "high|medium|low"}
  ],
  "topics_discussed": ["Thema 1", "Thema 2"],
  "follow_ups": [
    {"topic": "Nachfolge-Thema", "responsible": "Person"}
  ],
  "sentiment": "positive|neutral|negative|mixed"
}`;

/**
 * Create a new meeting
 */
export async function createMeeting(data: {
  title: string;
  date: string;
  company_id?: string;
  duration_minutes?: number;
  participants?: string[];
  location?: string;
  meeting_type?: Meeting['meeting_type'];
}): Promise<Meeting> {
  const id = uuidv4();

  const result = await query(
    `INSERT INTO meetings (id, company_id, title, date, duration_minutes, participants, location, meeting_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      id,
      data.company_id || 'personal',
      data.title,
      data.date,
      data.duration_minutes || null,
      JSON.stringify(data.participants || []),
      data.location || null,
      data.meeting_type || 'other',
    ]
  );

  return formatMeeting(result.rows[0]);
}

/**
 * Get all meetings with optional filters
 */
export async function getMeetings(filters?: {
  company_id?: string;
  status?: Meeting['status'];
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}): Promise<{ meetings: Meeting[]; total: number }> {
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (filters?.company_id) {
    whereClause += ` AND company_id = $${paramIndex++}`;
    params.push(filters.company_id);
  }
  if (filters?.status) {
    whereClause += ` AND status = $${paramIndex++}`;
    params.push(filters.status);
  }
  if (filters?.from_date) {
    whereClause += ` AND date >= $${paramIndex++}`;
    params.push(filters.from_date);
  }
  if (filters?.to_date) {
    whereClause += ` AND date <= $${paramIndex++}`;
    params.push(filters.to_date);
  }

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;

  const [meetingsResult, countResult] = await Promise.all([
    query(
      `SELECT * FROM meetings ${whereClause} ORDER BY date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) as total FROM meetings ${whereClause}`, params),
  ]);

  return {
    meetings: meetingsResult.rows.map(formatMeeting),
    total: parseInt(countResult.rows[0].total),
  };
}

/**
 * Get a single meeting by ID
 */
export async function getMeeting(id: string): Promise<Meeting | null> {
  const result = await query('SELECT * FROM meetings WHERE id = $1', [id]);
  return result.rows.length > 0 ? formatMeeting(result.rows[0]) : null;
}

/**
 * Update meeting status
 */
export async function updateMeetingStatus(id: string, status: Meeting['status']): Promise<Meeting | null> {
  const result = await query(
    'UPDATE meetings SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id, status]
  );
  return result.rows.length > 0 ? formatMeeting(result.rows[0]) : null;
}

/**
 * Process meeting transcript and create structured notes
 */
export async function processMeetingNotes(
  meetingId: string,
  transcript: string
): Promise<MeetingNotes> {
  const id = uuidv4();

  // Structure the transcript with LLM
  const prompt = `${MEETING_NOTES_PROMPT}

MEETING TRANSKRIPT:
${transcript}

STRUKTURIERTE NOTIZEN:`;

  let structured: any;
  try {
    structured = await structureWithOllama(prompt);
  } catch (error) {
    logger.error('Failed to structure meeting notes', error instanceof Error ? error : undefined);
    structured = {
      structured_summary: transcript.substring(0, 200),
      key_decisions: [],
      action_items: [],
      topics_discussed: [],
      follow_ups: [],
      sentiment: 'neutral',
    };
  }

  // Generate embedding for semantic search
  const embedding = await generateEmbedding(transcript);

  // Store in database
  await query(
    `INSERT INTO meeting_notes (
      id, meeting_id, raw_transcript, structured_summary,
      key_decisions, action_items, topics_discussed, follow_ups,
      sentiment, embedding
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      meetingId,
      transcript,
      structured.structured_summary || '',
      JSON.stringify(structured.key_decisions || []),
      JSON.stringify(structured.action_items || []),
      JSON.stringify(structured.topics_discussed || []),
      JSON.stringify(structured.follow_ups || []),
      structured.sentiment || 'neutral',
      embedding.length > 0 ? formatForPgVector(embedding) : null,
    ]
  );

  // Update meeting status to completed
  await updateMeetingStatus(meetingId, 'completed');

  return {
    id,
    meeting_id: meetingId,
    raw_transcript: transcript,
    structured_summary: structured.structured_summary || '',
    key_decisions: structured.key_decisions || [],
    action_items: (structured.action_items || []).map((item: any) => ({
      ...item,
      completed: false,
    })),
    topics_discussed: structured.topics_discussed || [],
    follow_ups: structured.follow_ups || [],
    sentiment: structured.sentiment || 'neutral',
    created_at: new Date().toISOString(),
  };
}

/**
 * Get notes for a meeting
 */
export async function getMeetingNotes(meetingId: string): Promise<MeetingNotes | null> {
  const result = await query(
    'SELECT * FROM meeting_notes WHERE meeting_id = $1',
    [meetingId]
  );

  if (result.rows.length === 0) {return null;}

  const row = result.rows[0];
  return {
    id: row.id,
    meeting_id: row.meeting_id,
    raw_transcript: row.raw_transcript,
    structured_summary: row.structured_summary,
    key_decisions: parseJsonbWithDefault<string[]>(row.key_decisions, []),
    action_items: parseJsonbWithDefault<ActionItem[]>(row.action_items, []),
    topics_discussed: parseJsonbWithDefault<string[]>(row.topics_discussed, []),
    follow_ups: parseJsonbWithDefault<FollowUp[]>(row.follow_ups, []),
    sentiment: row.sentiment,
    created_at: row.created_at,
  };
}

/**
 * Search meetings by semantic similarity
 */
export async function searchMeetings(
  searchQuery: string,
  limit: number = 10
): Promise<{ meeting: Meeting; notes: MeetingNotes; similarity: number }[]> {
  const embedding = await generateEmbedding(searchQuery);

  if (embedding.length === 0) {
    return [];
  }

  const result = await query(
    `SELECT
      mn.*,
      m.*,
      mn.embedding <-> $1 as distance
     FROM meeting_notes mn
     JOIN meetings m ON mn.meeting_id = m.id
     WHERE mn.embedding IS NOT NULL
     ORDER BY distance
     LIMIT $2`,
    [formatForPgVector(embedding), limit]
  );

  return result.rows.map((row) => ({
    meeting: formatMeeting(row),
    notes: {
      id: row.id,
      meeting_id: row.meeting_id,
      raw_transcript: row.raw_transcript,
      structured_summary: row.structured_summary,
      key_decisions: parseJsonbWithDefault<string[]>(row.key_decisions, []),
      action_items: parseJsonbWithDefault<ActionItem[]>(row.action_items, []),
      topics_discussed: parseJsonbWithDefault<string[]>(row.topics_discussed, []),
      follow_ups: parseJsonbWithDefault<FollowUp[]>(row.follow_ups, []),
      sentiment: row.sentiment,
      created_at: row.created_at,
    },
    similarity: 1 - row.distance,
  }));
}

/**
 * Get all action items across meetings
 */
export async function getAllActionItems(filters?: {
  completed?: boolean;
  company_id?: string;
}): Promise<{ meeting: Meeting; action_item: ActionItem; notes_id: string }[]> {
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (filters?.company_id) {
    whereClause += ` AND m.company_id = $${paramIndex++}`;
    params.push(filters.company_id);
  }

  const result = await query(
    `SELECT mn.id as notes_id, mn.action_items, m.*
     FROM meeting_notes mn
     JOIN meetings m ON mn.meeting_id = m.id
     ${whereClause}
     ORDER BY m.date DESC`,
    params
  );

  const items: { meeting: Meeting; action_item: ActionItem; notes_id: string }[] = [];

  for (const row of result.rows) {
    const actionItems = parseJsonbWithDefault<ActionItem[]>(row.action_items, []);
    for (const item of actionItems) {
      if (filters?.completed !== undefined && item.completed !== filters.completed) {
        continue;
      }
      items.push({
        meeting: formatMeeting(row),
        action_item: item,
        notes_id: row.notes_id,
      });
    }
  }

  return items;
}

// Helper functions
function formatMeeting(row: any): Meeting {
  return {
    id: row.id,
    company_id: row.company_id,
    title: row.title,
    date: row.date,
    duration_minutes: row.duration_minutes,
    participants: parseJsonbWithDefault<string[]>(row.participants, []),
    location: row.location,
    meeting_type: row.meeting_type,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// parseJsonbWithDefault imported from ../types - centralized implementation
