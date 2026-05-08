/**
 * Tests for logger auto-context injection from AsyncLocalStorage.
 */

// Capture console output
let consoleOutput: string[] = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

const originalLogLevel = process.env.LOG_LEVEL;

beforeEach(() => {
  consoleOutput = [];
  // Allow info-level output (setup.ts sets LOG_LEVEL=error to reduce noise)
  process.env.LOG_LEVEL = 'debug';
  console.log = (...args: any[]) => consoleOutput.push(args.join(' '));
  console.error = (...args: any[]) => consoleOutput.push(args.join(' '));
  console.warn = (...args: any[]) => consoleOutput.push(args.join(' '));
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
  process.env.LOG_LEVEL = originalLogLevel;
});

describe('Logger auto-context injection', () => {
  it('should include requestId from AsyncLocalStorage in log output', (done) => {
    // Force production mode for JSON output
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Re-import to get fresh module with production mode
    jest.resetModules();
    const { logger: freshLogger } = require('../../../utils/logger');
    const { requestContext: freshCtx } = require('../../../utils/request-context');

    freshCtx.run({ requestId: 'req-abc-123', userId: 'user-456' }, () => {
      freshLogger.info('test message');

      const lastOutput = consoleOutput[consoleOutput.length - 1];
      const parsed = JSON.parse(lastOutput);
      expect(parsed.context?.requestId).toBe('req-abc-123');
      expect(parsed.context?.userId).toBe('user-456');

      process.env.NODE_ENV = origEnv;
      done();
    });
  });

  it('should work without active request context (background jobs)', () => {
    jest.resetModules();
    const { logger: freshLogger } = require('../../../utils/logger');

    freshLogger.info('background task log');

    // Should not throw, should just work without context
    expect(consoleOutput.length).toBeGreaterThan(0);
  });

  it('should allow explicit context to override auto-injected values', (done) => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const { logger: freshLogger } = require('../../../utils/logger');
    const { requestContext: freshCtx } = require('../../../utils/request-context');

    freshCtx.run({ requestId: 'auto-req-id' }, () => {
      freshLogger.info('test', { requestId: 'explicit-req-id', operation: 'manual' });

      const lastOutput = consoleOutput[consoleOutput.length - 1];
      const parsed = JSON.parse(lastOutput);
      // Explicit should win
      expect(parsed.context.requestId).toBe('explicit-req-id');
      expect(parsed.context.operation).toBe('manual');

      process.env.NODE_ENV = origEnv;
      done();
    });
  });
});
