/**
 * Meeting Transcription Service (Task 9)
 *
 * Manages in-progress meeting sessions, accumulates transcript entries,
 * and generates AI-powered summaries when a session ends.
 *
 * Sessions live in-memory (Map) so no additional schema is required.
 * DB persist is best-effort: a failure does not prevent the session from working.
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../utils/database-context';
import { generateClaudeResponse } from './claude/core';
import { episodicMemory } from './memory/episodic-memory';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface TranscriptEntry {
  speaker: string;
  text: string;
  timestamp: Date;
}

export interface MeetingSummary {
  summary: string;
  actionItems: string[];
  decisions: string[];
  keyPoints: string[];
}

export type SessionStatus = 'recording' | 'completed';

export interface MeetingSession {
  id: string;
  context: AIContext;
  calendarEventId?: string;
  transcript: TranscriptEntry[];
  startedAt: Date;
  endedAt?: Date;
  status: SessionStatus;
  summary?: MeetingSummary;
}

// ===========================================
// Service
// ===========================================

export class MeetingTranscriptionService {
  private sessions: Map<string, MeetingSession> = new Map();

  /**
   * Create a new meeting session. Attempts to persist to DB but proceeds in-memory
   * even if the DB call fails (table may not exist in all environments).
   */
  async startSession(context: AIContext, calendarEventId?: string): Promise<MeetingSession> {
    const session: MeetingSession = {
      id: uuidv4(),
      context,
      calendarEventId,
      transcript: [],
      startedAt: new Date(),
      status: 'recording',
    };

    this.sessions.set(session.id, session);

    // Best-effort DB persist
    try {
      await queryContext(
        context,
        `INSERT INTO meeting_sessions (id, context, calendar_event_id, started_at, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [session.id, context, calendarEventId ?? null, session.startedAt, session.status]
      );
    } catch (err) {
      logger.warn('meeting-transcription: DB persist skipped', { error: (err as Error).message });
    }

    logger.info('Meeting session started', { sessionId: session.id, context });
    return session;
  }

  /**
   * Append a transcript entry to an existing session.
   * Throws if the session is not found.
   */
  addTranscriptEntry(sessionId: string, entry: TranscriptEntry): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Meeting session not found: ${sessionId}`);
    }
    session.transcript.push(entry);
  }

  /**
   * End a session: generate AI summary, store in episodic memory, mark completed.
   * Returns the final session state together with the summary.
   */
  async endSession(sessionId: string): Promise<{ session: MeetingSession; summary: MeetingSummary }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Meeting session not found: ${sessionId}`);
    }

    const summary = await this.generateSummary(session.transcript);

    session.status = 'completed';
    session.endedAt = new Date();
    session.summary = summary;

    // Store in episodic memory (best-effort)
    try {
      const trigger = `meeting session ${sessionId}`;
      const response = JSON.stringify(summary);
      await episodicMemory.store(trigger, response, sessionId, session.context);
    } catch (err) {
      logger.warn('meeting-transcription: episodic store failed', { error: (err as Error).message });
    }

    logger.info('Meeting session ended', { sessionId, context: session.context });
    return { session, summary };
  }

  /**
   * Generate a structured AI summary from a transcript.
   * Returns a fallback object if Claude is unavailable.
   */
  async generateSummary(transcript: TranscriptEntry[]): Promise<MeetingSummary> {
    const fallback: MeetingSummary = {
      summary: 'Summary unavailable.',
      actionItems: [],
      decisions: [],
      keyPoints: [],
    };

    if (transcript.length === 0) {
      return { ...fallback, summary: 'No transcript recorded.' };
    }

    const transcriptText = transcript
      .map(e => `[${e.speaker}]: ${e.text}`)
      .join('\n');

    const systemPrompt =
      'You are an expert meeting summarizer. ' +
      'Return ONLY valid JSON with keys: summary (string), actionItems (string[]), decisions (string[]), keyPoints (string[]).';

    const userPrompt =
      `Summarize this meeting transcript:\n\n${transcriptText}\n\n` +
      'Return ONLY a JSON object — no markdown, no preamble.';

    try {
      const raw = await generateClaudeResponse(systemPrompt, userPrompt, { maxTokens: 1024 });

      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      const parsed = JSON.parse(cleaned) as MeetingSummary;
      return {
        summary: parsed.summary ?? fallback.summary,
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      };
    } catch (err) {
      logger.warn('meeting-transcription: summary generation failed', { error: (err as Error).message });
      return fallback;
    }
  }

  /**
   * Retrieve a session by ID. Returns null if not found.
   */
  getSession(sessionId: string): MeetingSession | null {
    return this.sessions.get(sessionId) ?? null;
  }
}

// Singleton export
export const meetingTranscription = new MeetingTranscriptionService();
