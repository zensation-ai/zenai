/**
 * Structured Extraction Service - Unit Tests
 */

import { extractStructuredKnowledge } from '../../../services/structured-extraction';

// Mock Claude client
const mockCreate = jest.fn();
jest.mock('../../../services/claude/client', () => ({
  getClaudeClient: () => ({ messages: { create: mockCreate } }),
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  executeWithProtection: (fn: () => unknown) => fn(),
}));

// Mock enhanced-rag for auto-linking
const mockQuickRetrieve = jest.fn();
jest.mock('../../../services/enhanced-rag', () => ({
  enhancedRAG: {
    quickRetrieve: (...args: unknown[]) => mockQuickRetrieve(...args),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Structured Extraction Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReset();
    mockQuickRetrieve.mockReset();
  });

  it('should extract structured knowledge from transcript', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          coreIdeas: [
            { title: 'Marketing Automation', summary: 'Explore email automation tools', category: 'business', confidence: 0.9 },
            { title: 'Team Meeting', summary: 'Weekly sync needed for Q2 planning', category: 'business', confidence: 0.7 },
          ],
          actionItems: [
            { description: 'Research Mailchimp alternatives', deadline: '2026-02-15', priority: 'medium' },
            { description: 'Schedule team meeting', priority: 'high', assignee: 'Alex' },
          ],
          mentions: [
            { name: 'Mailchimp', type: 'tool', context: 'Email marketing platform' },
            { name: 'Alex', type: 'person', context: 'Team lead for marketing' },
          ],
          mood: { primary: 'decisive', confidence: 0.8 },
        }),
      }],
    });

    // Mock auto-linking
    mockQuickRetrieve.mockResolvedValue([
      { id: 'existing-1', title: 'Email Marketing Strategy', score: 0.75 },
    ]);

    const result = await extractStructuredKnowledge(
      'Wir müssen unsere Marketing-Automatisierung verbessern. Alex soll sich Mailchimp-Alternativen anschauen. Deadline ist der 15. Februar. Außerdem brauchen wir ein Team-Meeting für Q2-Planung.',
      'personal'
    );

    expect(result.coreIdeas).toHaveLength(2);
    expect(result.coreIdeas[0].title).toBe('Marketing Automation');
    expect(result.coreIdeas[0].category).toBe('business');

    expect(result.actionItems).toHaveLength(2);
    expect(result.actionItems[0].deadline).toBe('2026-02-15');
    expect(result.actionItems[1].assignee).toBe('Alex');

    expect(result.mentions).toHaveLength(2);
    expect(result.mentions[0].name).toBe('Mailchimp');

    expect(result.mood.primary).toBe('decisive');

    expect(result.suggestedLinks.length).toBeGreaterThanOrEqual(1);
    expect(result.suggestedLinks[0].existingIdeaTitle).toBe('Email Marketing Strategy');
  });

  it('should handle empty extraction gracefully', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{}' }],
    });

    const result = await extractStructuredKnowledge('Kurze Notiz.', 'personal', { enableAutoLinking: false });

    expect(result.coreIdeas).toHaveLength(0);
    expect(result.actionItems).toHaveLength(0);
    expect(result.mentions).toHaveLength(0);
    expect(result.mood.primary).toBe('exploratory');
    expect(result.suggestedLinks).toHaveLength(0);
  });

  it('should handle Claude API failure gracefully', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API timeout'));

    const result = await extractStructuredKnowledge('Some transcript.', 'personal', { enableAutoLinking: false });

    expect(result.coreIdeas).toHaveLength(0);
    expect(result.actionItems).toHaveLength(0);
    expect(result.mood.confidence).toBeLessThan(0.5);
  });

  it('should limit core ideas to max 3', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          coreIdeas: [
            { title: 'A', summary: 'One', category: 'business', confidence: 0.9 },
            { title: 'B', summary: 'Two', category: 'technical', confidence: 0.8 },
            { title: 'C', summary: 'Three', category: 'personal', confidence: 0.7 },
            { title: 'D', summary: 'Four', category: 'learning', confidence: 0.6 },
            { title: 'E', summary: 'Five', category: 'business', confidence: 0.5 },
          ],
          actionItems: [],
          mentions: [],
          mood: { primary: 'creative', confidence: 0.8 },
        }),
      }],
    });

    const result = await extractStructuredKnowledge('Long transcript.', 'personal', { enableAutoLinking: false });

    expect(result.coreIdeas).toHaveLength(3);
  });

  it('should validate and sanitize categories', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          coreIdeas: [
            { title: 'Test', summary: 'Summary', category: 'invalid_category', confidence: 0.9 },
          ],
          actionItems: [],
          mentions: [],
          mood: { primary: 'unknown_mood', confidence: 0.8 },
        }),
      }],
    });

    const result = await extractStructuredKnowledge('Test.', 'personal', { enableAutoLinking: false });

    // Invalid category defaults to 'personal'
    expect(result.coreIdeas[0].category).toBe('personal');
    // Invalid mood defaults to 'exploratory'
    expect(result.mood.primary).toBe('exploratory');
  });

  it('should skip auto-linking when disabled', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          coreIdeas: [{ title: 'Test', summary: 'Idea', category: 'business', confidence: 0.9 }],
          actionItems: [],
          mentions: [],
          mood: { primary: 'analytical', confidence: 0.7 },
        }),
      }],
    });

    const result = await extractStructuredKnowledge('Test transcript.', 'personal', { enableAutoLinking: false });

    expect(mockQuickRetrieve).not.toHaveBeenCalled();
    expect(result.suggestedLinks).toHaveLength(0);
  });

  it('should handle auto-linking failure gracefully', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          coreIdeas: [{ title: 'Test', summary: 'Idea', category: 'business', confidence: 0.9 }],
          actionItems: [],
          mentions: [],
          mood: { primary: 'creative', confidence: 0.7 },
        }),
      }],
    });

    mockQuickRetrieve.mockRejectedValue(new Error('RAG unavailable'));

    const result = await extractStructuredKnowledge('Test transcript.', 'personal');

    // Should still return extraction results even if linking fails
    expect(result.coreIdeas).toHaveLength(1);
    expect(result.suggestedLinks).toHaveLength(0);
  });
});
