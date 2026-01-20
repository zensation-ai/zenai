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
import { Request, Response, NextFunction } from 'express';

interface MockRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  [key: string]: unknown;
}

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
  setHeader: jest.Mock;
  locals: Record<string, unknown>;
}

export const mockRequest = (overrides: Partial<MockRequest> = {}): MockRequest => ({
  params: {},
  query: {},
  body: {},
  headers: {},
  ...overrides,
});

export const mockResponse = (): MockResponse => {
  const res: MockResponse = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
    setHeader: jest.fn(),
    locals: {},
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
};

export const mockNext: jest.MockedFunction<NextFunction> = jest.fn();
