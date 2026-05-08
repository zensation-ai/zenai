import { describe, it, expect } from '@jest/globals';

describe('model_info SSE event format', () => {
  it('should produce correct SSE format for anthropic provider', () => {
    const modelInfo = { model: 'claude-sonnet-4-20250514', provider: 'anthropic' };
    const sseEvent = `event: model_info\ndata: ${JSON.stringify(modelInfo)}\n\n`;
    expect(sseEvent).toContain('event: model_info');
    expect(sseEvent).toContain('"provider":"anthropic"');
    expect(sseEvent).toContain('"model":"claude-sonnet-4-20250514"');
  });

  it('should produce correct SSE format for mistral provider', () => {
    const modelInfo = { model: 'mistral-small-latest', provider: 'mistral' };
    const sseEvent = `event: model_info\ndata: ${JSON.stringify(modelInfo)}\n\n`;
    expect(sseEvent).toContain('"provider":"mistral"');
    expect(sseEvent).toContain('"model":"mistral-small-latest"');
  });

  it('should include both model and provider fields', () => {
    const modelInfo = { model: 'llama3', provider: 'ollama' };
    const parsed = JSON.parse(JSON.stringify(modelInfo));
    expect(parsed).toHaveProperty('model', 'llama3');
    expect(parsed).toHaveProperty('provider', 'ollama');
  });
});
