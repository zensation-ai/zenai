// backend/jest.integration.config.js
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/integration-db/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        target: 'es2022',
      },
      module: { type: 'commonjs' },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  globalSetup: '<rootDir>/src/__tests__/integration-db/setup.ts',
  globalTeardown: '<rootDir>/src/__tests__/integration-db/teardown.ts',
  testTimeout: 30000, // Increased for real DB
  verbose: true,
  maxWorkers: 1,
  forceExit: true,
};
