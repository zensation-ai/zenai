/**
 * Mock for @mistralai/mistralai SDK
 * ESM-only package that cannot be imported in Jest (CommonJS)
 */

export class Mistral {
  chat = {
    complete: jest.fn().mockResolvedValue({
      choices: [{ message: { content: '{"title":"test"}' } }],
    }),
  };
  embeddings = {
    create: jest.fn().mockResolvedValue({
      data: [{ embedding: new Array(1024).fill(0) }],
    }),
  };

  constructor(_opts?: { apiKey?: string }) {
    // noop
  }
}
