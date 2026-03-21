/**
 * Unit Tests for Email AI Service
 *
 * Tests AI-powered email analysis: summarization, categorization,
 * priority detection, sentiment analysis, reply suggestions,
 * thread summarization, smart compose, and text improvement.
 *
 * @module tests/unit/services/email-ai
 */

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockClaudeCreate = jest.fn();
const mockExecuteWithProtection = jest.fn();
jest.mock('../../../services/claude/client', () => ({
  getClaudeClient: () => ({
    messages: { create: mockClaudeCreate },
  }),
  executeWithProtection: (fn: () => unknown) => mockExecuteWithProtection(fn),
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
}));

jest.mock('../../../services/memory/episodic-memory', () => ({
  episodicMemory: {
    store: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../../services/push-notifications', () => ({
  sendNotification: jest.fn().mockResolvedValue(undefined),
}));

import {
  processEmailWithAI,
  generateReplySuggestions,
  summarizeThread,
  smartCompose,
  improveEmailText,
} from '../../../services/email-ai';
import { episodicMemory } from '../../../services/memory/episodic-memory';
import { sendNotification } from '../../../services/push-notifications';

// ===========================================
// Test Helpers
// ===========================================

function makeClaudeResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
  };
}

function makeEmailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'email-001',
    subject: 'Projektupdate Q1',
    body_text: 'Hallo, hier ist das Update zum Projekt. Die Deadline ist naechste Woche.',
    body_html: null,
    from_address: 'sender@example.com',
    from_name: 'Max Mustermann',
    to_addresses: JSON.stringify([{ email: 'me@zensation.ai' }]),
    ...overrides,
  };
}

describe('Email AI Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    // Default: executeWithProtection calls the function directly
    mockExecuteWithProtection.mockImplementation(async (fn: () => unknown) => fn());
  });

  // ===========================================
  // processEmailWithAI
  // ===========================================

  describe('processEmailWithAI', () => {
    it('should analyze email and update DB with results', async () => {
      // Fetch email
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      const analysis = {
        summary: 'Projektupdate fuer Q1 mit Deadline naechste Woche.',
        category: 'business',
        priority: 'medium',
        sentiment: 'neutral',
        action_items: [{ text: 'Deadline pruefen' }],
      };

      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(analysis)));

      // UPDATE email
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'email-001');

      // Should update email with AI analysis
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
      const updateCall = mockQueryContext.mock.calls[1];
      expect(updateCall[1]).toContain('ai_summary');
      expect(updateCall[2][1]).toBe('Projektupdate fuer Q1 mit Deadline naechste Woche.');
      expect(updateCall[2][2]).toBe('business');
      expect(updateCall[2][3]).toBe('medium');
      expect(updateCall[2][4]).toBe('neutral');
    });

    it('should return early when email not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'nonexistent');

      expect(mockClaudeCreate).not.toHaveBeenCalled();
    });

    it('should return early when email body is too short', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({ body_text: 'Hi', body_html: null })],
      } as any);

      await processEmailWithAI('personal', 'email-001');

      expect(mockClaudeCreate).not.toHaveBeenCalled();
    });

    it('should strip HTML when body_text is null', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({
          body_text: null,
          body_html: '<p>Dies ist ein laengerer HTML-Inhalt fuer die Analyse.</p>',
        })],
      } as any);

      const analysis = {
        summary: 'HTML content summary',
        category: 'personal',
        priority: 'low',
        sentiment: 'positive',
        action_items: [],
      };
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(analysis)));
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'email-001');

      expect(mockExecuteWithProtection).toHaveBeenCalled();
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      const wrappedResponse = '```json\n{"summary":"Test","category":"business","priority":"low","sentiment":"neutral","action_items":[]}\n```';
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(wrappedResponse));
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'email-001');

      const updateParams = mockQueryContext.mock.calls[1][2];
      expect(updateParams[1]).toBe('Test'); // summary parsed correctly
    });

    it('should sanitize invalid category/priority/sentiment values', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      const analysis = {
        summary: 'Summary',
        category: 'invalid_category',
        priority: 'super_urgent',
        sentiment: 'very_happy',
        action_items: [],
      };
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(analysis)));
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'email-001');

      const updateParams = mockQueryContext.mock.calls[1][2];
      expect(updateParams[2]).toBeNull(); // invalid category -> null
      expect(updateParams[3]).toBeNull(); // invalid priority -> null
      expect(updateParams[4]).toBeNull(); // invalid sentiment -> null
    });

    it('should truncate long email content to 3000 chars', async () => {
      const longBody = 'A'.repeat(5000);
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow({ body_text: longBody })] } as any);

      const analysis = {
        summary: 'Long email',
        category: 'business',
        priority: 'low',
        sentiment: 'neutral',
        action_items: [],
      };
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(analysis)));
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'email-001');

      // The AI prompt should contain truncated text
      expect(mockExecuteWithProtection).toHaveBeenCalled();
    });

    it('should store email in episodic memory after analysis', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      const analysis = {
        summary: 'Email summary',
        category: 'business',
        priority: 'low',
        sentiment: 'neutral',
        action_items: [],
      };
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(analysis)));
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'email-001');

      expect(episodicMemory.store).toHaveBeenCalledWith(
        expect.stringContaining('Max Mustermann'),
        'Email summary',
        'email-email-001',
        'personal'
      );
    });

    it('should send notification for high priority emails', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      const analysis = {
        summary: 'Urgent email',
        category: 'business',
        priority: 'high',
        sentiment: 'neutral',
        action_items: [],
      };
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(analysis)));
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'email-001');

      expect(sendNotification).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({
          type: 'custom',
          title: expect.stringContaining('Wichtig'),
        })
      );
    });

    it('should send notification for urgent priority emails', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      const analysis = {
        summary: 'Urgent!',
        category: 'business',
        priority: 'urgent',
        sentiment: 'negative',
        action_items: [],
      };
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(analysis)));
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'email-001');

      expect(sendNotification).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({
          title: expect.stringContaining('Dringend'),
        })
      );
    });

    it('should handle parse error gracefully and mark email as processed', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse('Not valid JSON at all'));
      // UPDATE with ai_parse_error
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'email-001');

      const updateSql = mockQueryContext.mock.calls[1][1] as string;
      expect(updateSql).toContain('ai_parse_error');
    });

    it('should handle Claude API failure gracefully', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);
      mockExecuteWithProtection.mockRejectedValueOnce(new Error('API rate limit'));

      // Should not throw
      await processEmailWithAI('personal', 'email-001');
    });

    it('should truncate summary to 500 chars', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      const analysis = {
        summary: 'X'.repeat(600),
        category: 'business',
        priority: 'low',
        sentiment: 'neutral',
        action_items: [],
      };
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(analysis)));
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'email-001');

      const updateParams = mockQueryContext.mock.calls[1][2];
      expect(updateParams[1].length).toBe(500);
    });

    it('should limit action items to 10', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      const analysis = {
        summary: 'Summary',
        category: 'business',
        priority: 'low',
        sentiment: 'neutral',
        action_items: Array.from({ length: 15 }, (_, i) => ({ text: `Item ${i}` })),
      };
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(analysis)));
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await processEmailWithAI('personal', 'email-001');

      const updateParams = mockQueryContext.mock.calls[1][2];
      const actionItems = JSON.parse(updateParams[5]);
      expect(actionItems).toHaveLength(10);
    });
  });

  // ===========================================
  // generateReplySuggestions
  // ===========================================

  describe('generateReplySuggestions', () => {
    it('should return 3 reply suggestions', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      const suggestions = [
        { tone: 'formell', subject: 'Re: Projektupdate Q1', body: 'Formal reply' },
        { tone: 'freundlich', subject: 'Re: Projektupdate Q1', body: 'Friendly reply' },
        { tone: 'kurz', subject: 'Re: Projektupdate Q1', body: 'Short reply' },
      ];
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(suggestions)));
      // Cache in DB
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await generateReplySuggestions('personal', 'email-001');

      expect(result).toHaveLength(3);
      expect(result[0].tone).toBe('formell');
      expect(result[1].tone).toBe('freundlich');
      expect(result[2].tone).toBe('kurz');
    });

    it('should return empty array when email not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await generateReplySuggestions('personal', 'nonexistent');

      expect(result).toEqual([]);
      expect(mockClaudeCreate).not.toHaveBeenCalled();
    });

    it('should return empty array on JSON parse failure', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse('Not JSON'));

      const result = await generateReplySuggestions('personal', 'email-001');

      expect(result).toEqual([]);
    });

    it('should return empty array when AI returns no text block', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);
      mockClaudeCreate.mockResolvedValueOnce({ content: [] });

      const result = await generateReplySuggestions('personal', 'email-001');

      expect(result).toEqual([]);
    });
  });

  // ===========================================
  // summarizeThread
  // ===========================================

  describe('summarizeThread', () => {
    it('should summarize email thread', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeEmailRow({ direction: 'inbound', body_text: 'First message in thread' }),
          makeEmailRow({ direction: 'outbound', body_text: 'Reply to first', from_name: 'Me' }),
        ],
      } as any);

      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(
        'Der Thread behandelt ein Projektupdate. Sender fragt nach dem Status.'
      ));

      const summary = await summarizeThread('personal', 'thread-001');

      expect(summary).toContain('Projektupdate');
      expect(mockExecuteWithProtection).toHaveBeenCalled();
    });

    it('should return default message when thread not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const summary = await summarizeThread('personal', 'nonexistent');

      expect(summary).toBe('Kein Thread gefunden.');
    });

    it('should return fallback when AI returns no text block', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow()],
      } as any);
      mockClaudeCreate.mockResolvedValueOnce({ content: [] });

      const summary = await summarizeThread('personal', 'thread-001');

      expect(summary).toBe('Zusammenfassung nicht verfuegbar.');
    });
  });

  // ===========================================
  // smartCompose
  // ===========================================

  describe('smartCompose', () => {
    it('should compose new email from prompt', async () => {
      const composed = {
        subject: 'Meeting morgen',
        body: 'Hallo Herr Mueller,\n\nich moechte ein Meeting vorschlagen.\n\nMit freundlichen Gruessen',
      };
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(composed)));

      const result = await smartCompose({ prompt: 'Schreibe eine E-Mail fuer ein Meeting' });

      expect(result.subject).toBe('Meeting morgen');
      expect(result.body_text).toContain('Meeting vorschlagen');
      expect(result.body_html).toContain('<p>');
    });

    it('should handle reply context', async () => {
      const composed = { subject: '', body: 'Danke fuer die Info.' };
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(composed)));

      const result = await smartCompose({
        prompt: 'Antworte kurz',
        tone: 'kurz',
        replyTo: {
          from: 'sender@example.com',
          subject: 'Info',
          body: 'Here is the info you requested.',
        },
      });

      expect(result.body_text).toBe('Danke fuer die Info.');
    });

    it('should throw on invalid JSON response', async () => {
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse('not json'));

      await expect(smartCompose({ prompt: 'test' })).rejects.toThrow('JSON');
    });

    it('should throw on empty AI response', async () => {
      mockClaudeCreate.mockResolvedValueOnce({ content: [] });

      await expect(smartCompose({ prompt: 'test' })).rejects.toThrow('verarbeitet');
    });

    it('should convert line breaks to HTML paragraphs', async () => {
      const composed = { subject: 'Test', body: 'Line 1\n\nLine 2\nLine 3' };
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(JSON.stringify(composed)));

      const result = await smartCompose({ prompt: 'test' });

      expect(result.body_html).toContain('<br>'); // empty line
      expect(result.body_html).toContain('<p>Line 1</p>');
      expect(result.body_html).toContain('<p>Line 3</p>');
    });
  });

  // ===========================================
  // improveEmailText
  // ===========================================

  describe('improveEmailText', () => {
    it('should return improved text', async () => {
      mockClaudeCreate.mockResolvedValueOnce(makeClaudeResponse(
        'Sehr geehrter Herr Mueller, vielen Dank fuer Ihre Nachricht.'
      ));

      const improved = await improveEmailText(
        'Hallo Mueller, danke fuer die mail.',
        'Mach es formeller'
      );

      expect(improved).toContain('Sehr geehrter');
    });

    it('should throw when AI returns no text block', async () => {
      mockClaudeCreate.mockResolvedValueOnce({ content: [] });

      await expect(
        improveEmailText('text', 'instruction')
      ).rejects.toThrow('fehlgeschlagen');
    });
  });
});
