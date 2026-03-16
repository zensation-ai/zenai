/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/integration-db/**/*.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', {
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true
        },
        target: 'es2022'
      },
      module: {
        type: 'commonjs'
      }
    }]
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/integration-db/setup.ts'],
  testTimeout: 15000,
  verbose: true,
  maxWorkers: 1, // Sequential to avoid DB conflicts
  forceExit: true,
};
