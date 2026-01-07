/**
 * Jest Test Setup
 *
 * This file runs before each test suite.
 * Configure global test utilities and mocks here.
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Increase timeout for async operations
jest.setTimeout(10000);

// Global beforeAll - runs once before all tests
beforeAll(() => {
  // Suppress console output during tests (optional)
  // jest.spyOn(console, 'log').mockImplementation(() => {});
  // jest.spyOn(console, 'error').mockImplementation(() => {});
});

// Global afterAll - runs once after all tests
afterAll(async () => {
  // Cleanup any open handles
});

// Export test utilities
export const mockRequest = (overrides = {}) => ({
  params: {},
  query: {},
  body: {},
  headers: {},
  ...overrides,
});

export const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

export const mockNext = jest.fn();
