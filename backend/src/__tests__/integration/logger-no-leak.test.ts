/**
 * Logger No-Leak Integration Test — Sprint 1.4, Security Week 4
 *
 * End-to-end sanity check: if the logger receives a payload containing any of
 * the well-known sentinel values (password, JWT, bearer token, email, IP,
 * ab_ API key), none of those sentinels appear in the console output.
 *
 * Captures stdout/stderr directly (the only sinks `logger.*` writes to) and
 * greps for sentinels. If this test fails, a real PII leak is shipping.
 */

const SENTINELS = {
  password: 'pa$$w0rd-canary-7391',
  bearer: 'Bearer canary-token-abcdef123456',
  jwt: 'eyJhbGciCANARY.eyJzdWIiCANARY.signatureCanaryAAAAAAAA',
  apiKey: 'ab_canaryABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh',
  apiKeyLegacy: 'ab_live_canary0123456789abcdef',
  email: 'canary.user@example.com',
  ipv4: '203.0.113.77',
  ipv6: '2001:db8:abcd:0012:0000:0000:0000:0099',
} as const;

describe('Logger — no PII leaks to console (integration)', () => {
  let logOutput: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    logOutput = [];
    process.env.LOG_LEVEL = 'debug';
    console.log = (...args: unknown[]) => logOutput.push(args.map(String).join(' '));
    console.warn = (...args: unknown[]) => logOutput.push(args.map(String).join(' '));
    console.error = (...args: unknown[]) => logOutput.push(args.map(String).join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    process.env.LOG_LEVEL = originalLevel;
  });

  function assertNoSentinelLeak() {
    const allOutput = logOutput.join('\n');
    for (const [label, value] of Object.entries(SENTINELS)) {
      expect({ label, leak: allOutput.includes(value) }).toEqual({
        label,
        leak: false,
      });
    }
  }

  it('does not leak known sentinels in info logs', () => {
    const { logger } = require('../../utils/logger');
    logger.info('User login', {
      email: SENTINELS.email,
      password: SENTINELS.password,
      authorization: SENTINELS.bearer,
      jwt: SENTINELS.jwt,
      api_key: SENTINELS.apiKey,
      apiKey: SENTINELS.apiKeyLegacy,
      ip: SENTINELS.ipv4,
      clientIp: SENTINELS.ipv6,
    });
    assertNoSentinelLeak();
  });

  it('does not leak sentinels embedded in messages', () => {
    const { logger } = require('../../utils/logger');
    logger.warn(
      `Failed login for ${SENTINELS.email} using ${SENTINELS.bearer} and JWT ${SENTINELS.jwt}`
    );
    assertNoSentinelLeak();
  });

  it('does not leak sentinels embedded in Error objects', () => {
    const { logger } = require('../../utils/logger');
    const err = new Error(
      `Auth failed: email=${SENTINELS.email} bearer=${SENTINELS.bearer}`
    );
    logger.error('Auth failure', err, { operation: 'login' });
    assertNoSentinelLeak();
  });

  it('does not leak sentinels in deeply nested context', () => {
    const { logger } = require('../../utils/logger');
    logger.info('Request inspected', {
      operation: 'http',
      req: {
        headers: { authorization: SENTINELS.bearer, cookie: 'session=secret' },
        body: {
          user: { email: SENTINELS.email, password: SENTINELS.password },
          meta: { ip_address: SENTINELS.ipv4, sessionId: 'xyz' },
        },
      },
    });
    assertNoSentinelLeak();
  });

  it('still emits a useful log line and shows scrubbed email (sanity, production JSON)', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    const { logger: freshLogger } = require('../../utils/logger');

    freshLogger.info('Login attempt', { email: SENTINELS.email, operation: 'login' });

    process.env.NODE_ENV = origEnv;

    const allOutput = logOutput.join('\n');
    expect(allOutput).toContain('Login attempt');
    expect(allOutput).toContain('[REDACTED:email]');
    expect(allOutput).not.toContain(SENTINELS.email);
  });
});
