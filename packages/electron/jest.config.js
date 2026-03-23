/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^electron$': '<rootDir>/src/__tests__/__mocks__/electron.ts',
    '^electron-store$': '<rootDir>/src/__tests__/__mocks__/electron-store.ts',
    '^electron-updater$': '<rootDir>/src/__tests__/__mocks__/electron-updater.ts',
    '^@zenai/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  testMatch: ['**/src/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { strict: true } }],
  },
};
