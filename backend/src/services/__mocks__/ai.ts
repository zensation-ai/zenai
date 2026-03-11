/**
 * Manual mock for services/ai.ts
 *
 * Prevents Jest from loading the heavy Claude import chain
 * (ai.ts -> claude/ -> extended-thinking -> thinking-budget -> ai.ts)
 * which causes OOM in test workers.
 */

export const generateEmbedding = jest.fn().mockResolvedValue([]);
export const structureIdea = jest.fn().mockResolvedValue({});
export const generateClaudeResponse = jest.fn().mockResolvedValue('');
export const isClaudeAvailable = jest.fn().mockReturnValue(true);
export const structureWithClaude = jest.fn().mockResolvedValue({});
export const structureWithClaudePersonalized = jest.fn().mockResolvedValue({});
