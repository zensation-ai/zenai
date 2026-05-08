/**
 * Tests for scripts/security/check-logger-leaks.ts
 * Sprint 1.4, Security Week 4.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAudit } from '../../../../../scripts/security/check-logger-leaks';

function withTempSrc(
  files: Record<string, string>,
  fn: (dir: string) => void
): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-audit-'));
  try {
    for (const [relPath, content] of Object.entries(files)) {
      const full = path.join(root, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf-8');
    }
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('check-logger-leaks', () => {
  it('returns no findings for clean logger usage', () => {
    withTempSrc(
      {
        'clean.ts': `
          logger.info('Login succeeded', { userId: '123', operation: 'auth.login' });
        `,
      },
      (dir) => {
        expect(runAudit(dir)).toHaveLength(0);
      }
    );
  });

  it('warns about logger context keyed on password', () => {
    withTempSrc(
      {
        'bad.ts': `
          logger.info('Attempt', { password: req.body.password, userId: 'u1' });
        `,
      },
      (dir) => {
        const findings = runAudit(dir);
        expect(findings.length).toBe(1);
        expect(findings[0].level).toBe('warning');
        expect(findings[0].rule).toMatch(/logger-key-password/);
      }
    );
  });

  it('warns about token / secret / authorization keys', () => {
    withTempSrc(
      {
        'bad.ts': `
          logger.warn('x', { token: t });
          logger.warn('y', { secret: s });
          logger.warn('z', { authorization: a });
        `,
      },
      (dir) => {
        const findings = runAudit(dir);
        expect(findings.filter((f) => f.level === 'warning').length).toBe(3);
      }
    );
  });

  it('flags console.log with password as hard error', () => {
    withTempSrc(
      {
        'bypass.ts': `
          console.log('debug', password);
        `,
      },
      (dir) => {
        const findings = runAudit(dir);
        const errors = findings.filter((f) => f.level === 'error');
        expect(errors.length).toBe(1);
        expect(errors[0].rule).toMatch(/console-/);
      }
    );
  });

  it('does not flag jest mocks', () => {
    withTempSrc(
      {
        'mock.ts': `
          console.log = jest.fn((msg) => { output.push(msg); });
        `,
      },
      (dir) => {
        expect(runAudit(dir)).toHaveLength(0);
      }
    );
  });

  it('skips .d.ts files and __tests__ directories', () => {
    withTempSrc(
      {
        'types.d.ts': `
          // declare const password: string;
          logger.info('in types', { password: 'x' });
        `,
        '__tests__/foo.ts': `
          logger.info('in tests', { password: 'x' });
        `,
      },
      (dir) => {
        expect(runAudit(dir)).toHaveLength(0);
      }
    );
  });
});
