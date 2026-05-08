export type AIContext = 'operations' | 'finance' | 'people' | 'strategy' | 'demo';

const VALID_CONTEXTS: AIContext[] = ['operations', 'finance', 'people', 'strategy', 'demo'];

export function validateContext(value: string): AIContext {
  if (!VALID_CONTEXTS.includes(value as AIContext)) {
    throw new Error(`Invalid context: ${value}. Must be one of: ${VALID_CONTEXTS.join(', ')}`);
  }
  return value as AIContext;
}

export function getContextFromRequest(req: { params: { context?: string } }): AIContext {
  const context = req.params.context;
  if (!context) {
    throw new Error('Context parameter missing from request');
  }
  return validateContext(context);
}
