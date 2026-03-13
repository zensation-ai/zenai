import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
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
  audio_storage_path?: string;
  audio_duration_seconds?: number;
  audio_size_bytes?: number;
  audio_mime_type?: string;
  created_at: string;
}

export interface AudioMeta {
  storagePath: string;
  durationSeconds?: number;
  sizeBytes: number;
  mimeType: string;
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

export interface MeetingSearchResult {
  meeting: Meeting;
  notes: MeetingNotes;
  similarity: number;
  snippet?: string;
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
  context?: AIContext;
}): Promise<Meeting> {
  const id = uuidv4();
  const ctx = data.context || 'work';

  // SECURITY: Explicit column selection instead of RETURNING *
  const result = await queryContext(ctx,
    `INSERT INTO meetings (id, company_id, title, date, duration_minutes, participants, location, meeting_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, company_id, title, date, duration_minutes, participants, location, meeting_type, status, created_at, updated_at`,
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
  has_audio?: boolean;
  limit?: number;
  offset?: number;
  context?: AIContext;
}): Promise<{ meetings: Meeting[]; total: number }> {
  let whereClause = 'WHERE 1=1';
  const params: (string | number | boolean)[] = [];
  let paramIndex = 1;

  if (filters?.company_id) {
    whereClause += ` AND m.company_id = $${paramIndex++}`;
    params.push(filters.company_id);
  }
  if (filters?.status) {
    whereClause += ` AND m.status = $${paramIndex++}`;
    params.push(filters.status);
  }
  if (filters?.from_date) {
    whereClause += ` AND m.date >= $${paramIndex++}`;
    params.push(filters.from_date);
  }
  if (filters?.to_date) {
    whereClause += ` AND m.date <= $${paramIndex++}`;
    params.push(filters.to_date);
  }
  if (filters?.has_audio) {
    whereClause += ` AND mn.audio_storage_path IS NOT NULL`;
  }

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;
  const ctx = filters?.context || 'work';

  const needsAudioJoin = filters?.has_audio;
  const fromClause = needsAudioJoin
    ? `FROM meetings m LEFT JOIN meeting_notes mn ON mn.meeting_id = m.id`
    : `FROM meetings m`;

  // SECURITY: Explicit column selection
  const [meetingsResult, countResult] = await Promise.all([
    queryContext(ctx,
      `SELECT DISTINCT m.id, m.company_id, m.title, m.date, m.duration_minutes, m.participants,
              m.location, m.meeting_type, m.status, m.created_at, m.updated_at
       ${fromClause} ${whereClause} ORDER BY m.date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    ),
    queryContext(ctx,
      `SELECT COUNT(DISTINCT m.id) as total ${fromClause} ${whereClause}`,
      params
    ),
  ]);

  return {
    meetings: meetingsResult.rows.map(formatMeeting),
    total: parseInt(countResult.rows[0].total, 10),
  };
}

/**
 * Get a single meeting by ID
 */
export async function getMeeting(id: string, context: AIContext = 'work'): Promise<Meeting | null> {
  // SECURITY: Explicit column selection instead of SELECT *
  const result = await queryContext(context,
    `SELECT id, company_id, title, date, duration_minutes, participants, location, meeting_type, status, created_at, updated_at
     FROM meetings WHERE id = $1`,
    [id]
  );
  return result.rows.length > 0 ? formatMeeting(result.rows[0]) : null;
}

/**
 * Update meeting status
 */
export async function updateMeetingStatus(id: string, status: Meeting['status'], context: AIContext = 'work'): Promise<Meeting | null> {
  // SECURITY: Explicit column selection instead of RETURNING *
  const result = await queryContext(context,
    `UPDATE meetings SET status = $2, updated_at = NOW() WHERE id = $1
     RETURNING id, company_id, title, date, duration_minutes, participants, location, meeting_type, status, created_at, updated_at`,
    [id, status]
  );
  return result.rows.length > 0 ? formatMeeting(result.rows[0]) : null;
}

/**
 * Process meeting transcript and create structured notes
 */
export async function processMeetingNotes(
  meetingId: string,
  transcript: string,
  context: AIContext = 'work',
  audioMeta?: AudioMeta
): Promise<MeetingNotes> {
  const id = uuidv4();

  // Structure the transcript with LLM
  const prompt = `${MEETING_NOTES_PROMPT}

MEETING TRANSKRIPT:
${transcript}

STRUKTURIERTE NOTIZEN:`;

  interface StructuredMeetingNotes {
    structured_summary?: string;
    key_decisions?: string[];
    action_items?: Array<{ task: string; assignee?: string; priority?: 'low' | 'medium' | 'high' }>;
    topics_discussed?: string[];
    follow_ups?: Array<{ topic: string; responsible?: string }>;
    sentiment?: 'mixed' | 'positive' | 'neutral' | 'negative';
  }
  let structured: StructuredMeetingNotes;
  try {
    structured = await structureWithOllama(prompt) as StructuredMeetingNotes;
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

  const summary = structured.structured_summary || '';

  // Store in database with audio metadata and search vector
  await queryContext(context,
    `INSERT INTO meeting_notes (
      id, meeting_id, raw_transcript, structured_summary,
      key_decisions, action_items, topics_discussed, follow_ups,
      sentiment, embedding,
      audio_storage_path, audio_duration_seconds, audio_size_bytes, audio_mime_type,
      search_vector
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
      to_tsvector('german', coalesce($3, '') || ' ' || coalesce($4, ''))
    )`,
    [
      id,
      meetingId,
      transcript,
      summary,
      JSON.stringify(structured.key_decisions || []),
      JSON.stringify(structured.action_items || []),
      JSON.stringify(structured.topics_discussed || []),
      JSON.stringify(structured.follow_ups || []),
      structured.sentiment || 'neutral',
      embedding.length > 0 ? formatForPgVector(embedding) : null,
      audioMeta?.storagePath || null,
      audioMeta?.durationSeconds || null,
      audioMeta?.sizeBytes || null,
      audioMeta?.mimeType || null,
    ]
  );

  // Update meeting status to completed
  await updateMeetingStatus(meetingId, 'completed', context);

  return {
    id,
    meeting_id: meetingId,
    raw_transcript: transcript,
    structured_summary: summary,
    key_decisions: structured.key_decisions || [],
    action_items: (structured.action_items || []).map((item) => ({
      task: item.task,
      assignee: item.assignee,
      priority: item.priority || 'medium',
      completed: false,
    })),
    topics_discussed: structured.topics_discussed || [],
    follow_ups: structured.follow_ups || [],
    sentiment: structured.sentiment || 'neutral',
    audio_storage_path: audioMeta?.storagePath,
    audio_duration_seconds: audioMeta?.durationSeconds,
    audio_size_bytes: audioMeta?.sizeBytes,
    audio_mime_type: audioMeta?.mimeType,
    created_at: new Date().toISOString(),
  };
}

/**
 * Get notes for a meeting (including audio metadata)
 */
export async function getMeetingNotes(meetingId: string, context: AIContext = 'work'): Promise<MeetingNotes | null> {
  const result = await queryContext(context,
    `SELECT id, meeting_id, raw_transcript, structured_summary, key_decisions, action_items,
            topics_discussed, follow_ups, sentiment,
            audio_storage_path, audio_duration_seconds, audio_size_bytes, audio_mime_type,
            created_at
     FROM meeting_notes WHERE meeting_id = $1`,
    [meetingId]
  );

  if (result.rows.length === 0) { return null; }
  return formatNotes(result.rows[0]);
}

/**
 * Search meetings by semantic similarity
 */
export async function searchMeetings(
  searchQuery: string,
  limit: number = 10,
  context: AIContext = 'work'
): Promise<MeetingSearchResult[]> {
  const embedding = await generateEmbedding(searchQuery);

  if (embedding.length === 0) {
    return [];
  }

  const result = await queryContext(context,
    `SELECT
      mn.id, mn.meeting_id, mn.raw_transcript, mn.structured_summary, mn.key_decisions,
      mn.action_items, mn.topics_discussed, mn.follow_ups, mn.sentiment,
      mn.audio_storage_path, mn.audio_duration_seconds, mn.audio_size_bytes, mn.audio_mime_type,
      mn.created_at,
      m.id as m_id, m.company_id, m.title, m.date, m.duration_minutes, m.participants,
      m.location, m.meeting_type, m.status, m.created_at as m_created_at, m.updated_at,
      mn.embedding <-> $1 as distance
     FROM meeting_notes mn
     JOIN meetings m ON mn.meeting_id = m.id
     WHERE mn.embedding IS NOT NULL
     ORDER BY distance
     LIMIT $2`,
    [formatForPgVector(embedding), limit]
  );

  return result.rows.map((row) => ({
    meeting: formatMeetingFromJoin(row),
    notes: formatNotes(row),
    similarity: 1 - row.distance,
  }));
}

/**
 * Full-text search on meeting transcripts and summaries
 */
export async function searchMeetingsFullText(
  searchQuery: string,
  limit: number = 10,
  context: AIContext = 'work'
): Promise<MeetingSearchResult[]> {
  const result = await queryContext(context,
    `SELECT
      mn.id, mn.meeting_id, mn.raw_transcript, mn.structured_summary, mn.key_decisions,
      mn.action_items, mn.topics_discussed, mn.follow_ups, mn.sentiment,
      mn.audio_storage_path, mn.audio_duration_seconds, mn.audio_size_bytes, mn.audio_mime_type,
      mn.created_at,
      m.id as m_id, m.company_id, m.title, m.date, m.duration_minutes, m.participants,
      m.location, m.meeting_type, m.status, m.created_at as m_created_at, m.updated_at,
      ts_rank(mn.search_vector, plainto_tsquery('german', $1)) as rank
     FROM meeting_notes mn
     JOIN meetings m ON mn.meeting_id = m.id
     WHERE mn.search_vector @@ plainto_tsquery('german', $1)
        OR m.title ILIKE '%' || $1 || '%'
     ORDER BY rank DESC
     LIMIT $2`,
    [searchQuery, limit]
  );

  return result.rows.map((row) => ({
    meeting: formatMeetingFromJoin(row),
    notes: formatNotes(row),
    similarity: row.rank || 0,
    snippet: extractSnippet(row.raw_transcript, searchQuery),
  }));
}

/**
 * Hybrid search combining semantic + full-text with Reciprocal Rank Fusion
 */
export async function searchMeetingsHybrid(
  searchQuery: string,
  limit: number = 10,
  context: AIContext = 'work'
): Promise<MeetingSearchResult[]> {
  const K = 60; // RRF constant

  // Run both searches in parallel
  const [semanticResults, fulltextResults] = await Promise.all([
    searchMeetings(searchQuery, limit * 2, context),
    searchMeetingsFullText(searchQuery, limit * 2, context),
  ]);

  // Build RRF scores
  const scoreMap = new Map<string, { result: MeetingSearchResult; score: number }>();

  semanticResults.forEach((r, idx) => {
    const key = r.notes.id;
    const existing = scoreMap.get(key);
    const semanticScore = 1 / (K + idx + 1);
    if (existing) {
      existing.score += semanticScore;
    } else {
      scoreMap.set(key, { result: r, score: semanticScore });
    }
  });

  fulltextResults.forEach((r, idx) => {
    const key = r.notes.id;
    const existing = scoreMap.get(key);
    const ftScore = 1 / (K + idx + 1);
    if (existing) {
      existing.score += ftScore;
      if (r.snippet) {existing.result.snippet = r.snippet;}
    } else {
      scoreMap.set(key, { result: r, score: ftScore });
    }
  });

  // Sort by combined score and return top results
  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ result, score }) => ({ ...result, similarity: score }));
}

/**
 * Get all action items across meetings
 */
export async function getAllActionItems(filters?: {
  completed?: boolean;
  company_id?: string;
  context?: AIContext;
}): Promise<{ meeting: Meeting; action_item: ActionItem; notes_id: string }[]> {
  let whereClause = 'WHERE 1=1';
  const params: string[] = [];
  let paramIndex = 1;
  const ctx = filters?.context || 'work';

  if (filters?.company_id) {
    whereClause += ` AND m.company_id = $${paramIndex++}`;
    params.push(filters.company_id);
  }

  // SECURITY: Explicit column selection instead of SELECT *
  const result = await queryContext(ctx,
    `SELECT mn.id as notes_id, mn.action_items,
            m.id, m.company_id, m.title, m.date, m.duration_minutes, m.participants,
            m.location, m.meeting_type, m.status, m.created_at, m.updated_at
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

// ==========================================
// Helper functions
// ==========================================

interface MeetingRow {
  id: string;
  company_id: string;
  title: string;
  date: string;
  duration_minutes?: number;
  participants: unknown;
  location?: string;
  meeting_type: Meeting['meeting_type'];
  status: Meeting['status'];
  created_at: string;
  updated_at: string;
}

function formatMeeting(row: MeetingRow): Meeting {
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

interface NotesRow {
  id: string;
  meeting_id: string;
  raw_transcript: string;
  structured_summary: string;
  key_decisions: unknown;
  action_items: unknown;
  topics_discussed: unknown;
  follow_ups: unknown;
  sentiment: MeetingNotes['sentiment'];
  audio_storage_path?: string;
  audio_duration_seconds?: number;
  audio_size_bytes?: number;
  audio_mime_type?: string;
  created_at: string;
}

function formatNotes(row: NotesRow): MeetingNotes {
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
    audio_storage_path: row.audio_storage_path,
    audio_duration_seconds: row.audio_duration_seconds,
    audio_size_bytes: row.audio_size_bytes ?? undefined,
    audio_mime_type: row.audio_mime_type,
    created_at: row.created_at,
  };
}

function formatMeetingFromJoin(row: Record<string, unknown>): Meeting {
  return formatMeeting({
    id: row.m_id as string,
    company_id: row.company_id as string,
    title: row.title as string,
    date: row.date as string,
    duration_minutes: row.duration_minutes as number | undefined,
    participants: row.participants,
    location: row.location as string | undefined,
    meeting_type: row.meeting_type as Meeting['meeting_type'],
    status: row.status as Meeting['status'],
    created_at: row.m_created_at as string,
    updated_at: row.updated_at as string,
  });
}

function extractSnippet(transcript: string | null, query: string): string | undefined {
  if (!transcript) {return undefined;}
  const lowerTranscript = transcript.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerTranscript.indexOf(lowerQuery);
  if (idx === -1) {return transcript.substring(0, 150) + '...';}
  const start = Math.max(0, idx - 60);
  const end = Math.min(transcript.length, idx + query.length + 60);
  let snippet = '';
  if (start > 0) {snippet += '...';}
  snippet += transcript.substring(start, end);
  if (end < transcript.length) {snippet += '...';}
  return snippet;
}

// parseJsonbWithDefault imported from ../types - centralized implementation
