/**
 * Tests for email-workflow-handler (Phase 3C)
 */

jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../../services/email-ai', () => ({
  processEmailWithAI: jest.fn(),
}));

jest.mock('../../../../services/smart-suggestions', () => ({
  createSuggestion: jest.fn(),
}));

import { queryContext } from '../../../../utils/database-context';
import { processEmailWithAI } from '../../../../services/email-ai';
import { createSuggestion } from '../../../../services/smart-suggestions';
import {
  processUnanalyzedEmails,
  createEmailSuggestions,
  handleNewEmails,
} from '../../../../services/email/email-workflow-handler';

const mockQueryContext = queryContext as jest.Mock;
const mockProcessEmailWithAI = processEmailWithAI as jest.Mock;
const mockCreateSuggestion = createSuggestion as jest.Mock;

const CONTEXT = 'personal' as const;

describe('email-workflow-handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSuggestion.mockResolvedValue({ id: 'sugg-1' });
    mockProcessEmailWithAI.mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------
  describe('processUnanalyzedEmails', () => {
    it('should process emails that have not been AI-analyzed', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'email-1' },
          { id: 'email-2' },
        ],
      });

      await processUnanalyzedEmails(CONTEXT);

      expect(mockQueryContext).toHaveBeenCalledWith(
        CONTEXT,
        expect.stringContaining('ai_processed_at IS NULL'),
        []
      );
      expect(mockProcessEmailWithAI).toHaveBeenCalledTimes(2);
      expect(mockProcessEmailWithAI).toHaveBeenCalledWith(CONTEXT, 'email-1');
      expect(mockProcessEmailWithAI).toHaveBeenCalledWith(CONTEXT, 'email-2');
    });

    it('should handle when there are no unanalyzed emails', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await processUnanalyzedEmails(CONTEXT);

      expect(mockProcessEmailWithAI).not.toHaveBeenCalled();
    });

    it('should continue processing remaining emails when one fails', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'email-1' }, { id: 'email-2' }, { id: 'email-3' }],
      });
      mockProcessEmailWithAI
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('AI processing failed'))
        .mockResolvedValueOnce(undefined);

      await expect(processUnanalyzedEmails(CONTEXT)).resolves.not.toThrow();
      expect(mockProcessEmailWithAI).toHaveBeenCalledTimes(3);
    });
  });

  // ---------------------------------------------------------------
  describe('createEmailSuggestions', () => {
    it('should create email_reply suggestion for urgent priority email', async () => {
      // First call: recently analyzed emails
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{
            id: 'email-1',
            subject: 'Important Issue',
            from_address: 'boss@example.com',
            ai_priority: 'urgent',
            ai_action_items: null,
            ai_category: 'work',
          }],
        })
        // Second call: dedup check
        .mockResolvedValueOnce({ rows: [] });

      await createEmailSuggestions(CONTEXT);

      expect(mockCreateSuggestion).toHaveBeenCalledWith(
        CONTEXT,
        expect.objectContaining({
          type: 'email_reply',
          title: 'Auf "Important Issue" von boss@example.com antworten',
        })
      );
    });

    it('should create email_task suggestion when email has action items', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{
            id: 'email-2',
            subject: 'Project Update',
            from_address: 'team@example.com',
            ai_priority: 'normal',
            ai_action_items: JSON.stringify([{ text: 'Review PR' }, { text: 'Deploy fix' }]),
            ai_category: 'work',
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await createEmailSuggestions(CONTEXT);

      expect(mockCreateSuggestion).toHaveBeenCalledWith(
        CONTEXT,
        expect.objectContaining({
          type: 'email_task',
          title: '2 Aufgaben aus "Project Update" erstellen',
        })
      );
    });

    it('should create email_calendar suggestion for meeting emails', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{
            id: 'email-3',
            subject: 'Team Standup',
            from_address: 'organizer@example.com',
            ai_priority: 'normal',
            ai_action_items: null,
            ai_category: 'meeting',
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await createEmailSuggestions(CONTEXT);

      expect(mockCreateSuggestion).toHaveBeenCalledWith(
        CONTEXT,
        expect.objectContaining({
          type: 'email_calendar',
          title: 'Meeting "Team Standup" zum Kalender hinzufügen',
        })
      );
    });

    it('should skip creating suggestion when dedup finds existing active suggestion', async () => {
      mockQueryContext
        .mockResolvedValueOnce({
          rows: [{
            id: 'email-4',
            subject: 'Duplicate Email',
            from_address: 'sender@example.com',
            ai_priority: 'urgent',
            ai_action_items: null,
            ai_category: 'work',
          }],
        })
        // Dedup check returns existing active suggestion
        .mockResolvedValueOnce({ rows: [{ id: 'existing-sugg' }] });

      await createEmailSuggestions(CONTEXT);

      expect(mockCreateSuggestion).not.toHaveBeenCalled();
    });

    it('should handle when there are no recently analyzed emails', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });

      await createEmailSuggestions(CONTEXT);

      expect(mockCreateSuggestion).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  describe('handleNewEmails', () => {
    it('should call both processUnanalyzedEmails and createEmailSuggestions', async () => {
      // processUnanalyzedEmails query
      mockQueryContext
        .mockResolvedValueOnce({ rows: [] })
        // createEmailSuggestions query
        .mockResolvedValueOnce({ rows: [] });

      await handleNewEmails(CONTEXT);

      // Both inner functions make at least one queryContext call
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });
  });
});
