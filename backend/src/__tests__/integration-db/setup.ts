/**
 * Phase 80: Integration Test Setup
 *
 * Configures the test environment for integration tests that use
 * supertest against the Express app with mocked database layer.
 *
 * These tests verify full request/response cycles including:
 * - Middleware execution (auth, validation, error handling)
 * - Route handler logic
 * - Response format compliance
 * - Multi-user isolation
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';

jest.setTimeout(15000);

// Suppress console noise
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
});

afterAll(async () => {
  jest.clearAllTimers();
  jest.restoreAllMocks();
  // Allow pending microtasks to complete
  await new Promise(resolve => setImmediate(resolve));
});
