/**
 * Phase 116: Voice Briefing Tests
 *
 * Tests the generateMorningBriefing method on VoicePipeline.
 */

import { VoicePipeline } from '../../../../services/voice/voice-pipeline';

// ============================================================
// Mocks
// ============================================================

const mockQueryContext = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: () => true,
}));

jest.mock('../../../../utils/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../../services/voice/stt-service', () => ({
  sttService: {
    transcribe: jest.fn(),
    getAvailableProviders: jest.fn().mockReturnValue(['whisper']),
  },
}));

jest.mock('../../../../services/voice/tts-service', () => ({
  multiTTSService: {
    synthesize: jest.fn(),
    synthesizeBatch: jest.fn(),
    getVoices: jest.fn().mockResolvedValue([]),
    getAvailableProviders: jest.fn().mockReturnValue(['edge-tts']),
    getCacheStats: jest.fn().mockReturnValue({ hits: 0, misses: 0 }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { multiTTSService } = require('../../../../services/voice/tts-service');
const mockSynthesize = multiTTSService.synthesize as jest.Mock;

jest.mock('../../../../services/voice/turn-taking', () => ({
  createTurnTakingEngine: jest.fn().mockReturnValue({
    processChunk: jest.fn(),
  }),
}));

jest.mock('../../../../services/voice/audio-processor', () => ({
  audioProcessor: {
    concatenateAudio: jest.fn(),
    calculateDuration: jest.fn(),
    splitIntoSentences: jest.fn().mockReturnValue([]),
  },
}));

jest.mock('../../../../services/general-chat/chat-messages', () => ({
  sendMessage: jest.fn(),
  GENERAL_CHAT_SYSTEM_PROMPT: 'test prompt',
}));

jest.mock('../../../../services/general-chat/chat-sessions', () => ({
  addMessage: jest.fn(),
  updateSessionTitle: jest.fn(),
  createSession: jest.fn().mockResolvedValue({ id: 'test-session' }),
}));

jest.mock('../../../../services/claude/client', () => ({
  getClaudeClient: jest.fn(),
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
}));

jest.mock('../../../../services/claude', () => ({
  isClaudeAvailable: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../../services/memory', () => ({
  memoryCoordinator: {
    addInteraction: jest.fn(),
  },
}));

// ============================================================
// Tests
// ============================================================

describe('VoicePipeline.generateMorningBriefing', () => {
  let pipeline: VoicePipeline;
  const userId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    jest.clearAllMocks();
    pipeline = new VoicePipeline();
  });

  it('should generate briefing with tasks, emails, and events', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })   // tasks
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })   // emails
      .mockResolvedValueOnce({                               // events
        rows: [
          { title: 'Standup', start_time: '2026-03-20T09:00:00Z' },
          { title: 'Lunch', start_time: '2026-03-20T12:00:00Z' },
        ],
      });

    const result = await pipeline.generateMorningBriefing('personal', userId);

    expect(result.text).toContain('Guten Morgen');
    expect(result.text).toContain('3 offene Aufgaben');
    expect(result.text).toContain('2 ungelesene E-Mails');
    expect(result.text).toContain('2 Termine');
    expect(result.audioBuffer).toBeUndefined();
  });

  it('should handle empty state gracefully', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })   // tasks
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })   // emails
      .mockResolvedValueOnce({ rows: [] });                  // events

    const result = await pipeline.generateMorningBriefing('work', userId);

    expect(result.text).toContain('Guten Morgen');
    expect(result.text).toContain('Dein Tag sieht ruhig aus');
    expect(result.text).not.toContain('offene Aufgaben');
  });

  it('should use singular forms correctly', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })   // 1 task
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })   // 1 email
      .mockResolvedValueOnce({
        rows: [{ title: 'Meeting', start_time: '2026-03-20T14:00:00Z' }],
      });

    const result = await pipeline.generateMorningBriefing('personal', userId);

    expect(result.text).toContain('1 offene Aufgabe');
    expect(result.text).not.toContain('Aufgaben');
    expect(result.text).toContain('1 ungelesene E-Mail wartet');
    expect(result.text).toContain('ein Termin an');
    expect(result.text).toContain('Meeting');
  });

  it('should handle database errors gracefully', async () => {
    mockQueryContext
      .mockRejectedValueOnce(new Error('tasks table missing'))
      .mockRejectedValueOnce(new Error('emails table missing'))
      .mockRejectedValueOnce(new Error('events table missing'));

    const result = await pipeline.generateMorningBriefing('creative', userId);

    // Should still produce a valid briefing with empty state
    expect(result.text).toContain('Guten Morgen');
    expect(result.text).toContain('Dein Tag sieht ruhig aus');
  });

  it('should generate audio when requested', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const mockAudio = Buffer.from('fake-audio');
    mockSynthesize.mockResolvedValueOnce(mockAudio);

    const result = await pipeline.generateMorningBriefing('personal', userId, true);

    expect(result.text).toContain('Guten Morgen');
    expect(result.audioBuffer).toBe(mockAudio);
    expect(mockSynthesize).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ voice: 'de-DE-ConradNeural' })
    );
  });

  it('should handle TTS failure gracefully', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    mockSynthesize.mockRejectedValueOnce(new Error('TTS unavailable'));

    const result = await pipeline.generateMorningBriefing('personal', userId, true);

    expect(result.text).toContain('Guten Morgen');
    expect(result.audioBuffer).toBeUndefined();
  });

  it('should limit events shown to 3 with count of extras', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({
        rows: [
          { title: 'Standup', start_time: '2026-03-20T09:00:00Z' },
          { title: 'Review', start_time: '2026-03-20T10:00:00Z' },
          { title: 'Lunch', start_time: '2026-03-20T12:00:00Z' },
          { title: 'Sprint', start_time: '2026-03-20T14:00:00Z' },
          { title: 'Retro', start_time: '2026-03-20T16:00:00Z' },
        ],
      });

    const result = await pipeline.generateMorningBriefing('work', userId);

    expect(result.text).toContain('5 Termine');
    expect(result.text).toContain('Standup');
    expect(result.text).toContain('Review');
    expect(result.text).toContain('Lunch');
    expect(result.text).toContain('2 weitere');
    // Sprint and Retro should NOT appear in detail
    expect(result.text).not.toContain('Sprint');
  });

  it('should only show tasks text when emails/events are zero', async () => {
    mockQueryContext
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await pipeline.generateMorningBriefing('personal', userId);

    expect(result.text).toContain('5 offene Aufgaben');
    expect(result.text).not.toContain('E-Mail');
    expect(result.text).not.toContain('Termin');
    expect(result.text).not.toContain('ruhig aus');
  });
});
