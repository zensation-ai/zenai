/**
 * Tests for scripts/security/check-auth-boundaries.ts
 * Sprint 1.4, Security Week 4.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAudit } from '../../../../../scripts/security/check-auth-boundaries';

function withTempRoutes(
  files: Record<string, string>,
  fn: (dir: string) => void
): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-audit-'));
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

describe('check-auth-boundaries', () => {
  it('reports a route without any auth middleware', () => {
    withTempRoutes(
      {
        'demo.ts': `
          const router = express.Router();
          router.get('/secret', async (req, res) => { res.json({}); });
          export default router;
        `,
      },
      (dir) => {
        const violations = runAudit(dir);
        expect(violations.length).toBeGreaterThanOrEqual(1);
        expect(violations[0].path).toBe('/secret');
        expect(violations[0].method).toBe('get');
      }
    );
  });

  it('accepts a route with jwtAuth in the chain', () => {
    withTempRoutes(
      {
        'demo.ts': `
          router.get('/secret', jwtAuth, async (req, res) => { res.json({}); });
        `,
      },
      (dir) => {
        expect(runAudit(dir)).toHaveLength(0);
      }
    );
  });

  it('accepts a route with apiKeyAuth', () => {
    withTempRoutes(
      {
        'demo.ts': `
          router.post('/secret', apiKeyAuth, handler);
        `,
      },
      (dir) => {
        expect(runAudit(dir)).toHaveLength(0);
      }
    );
  });

  it('accepts a route guarded by requireWorkspaceRole factory', () => {
    withTempRoutes(
      {
        'demo.ts': `
          router.put('/admin-only', jwtAuth, requireWorkspaceRole('admin', 'owner'), handler);
        `,
      },
      (dir) => {
        expect(runAudit(dir)).toHaveLength(0);
      }
    );
  });

  it('accepts multiple routes mixing protected and allowlisted paths', () => {
    withTempRoutes(
      {
        'health.ts': `
          router.get('/health', (req, res) => res.json({ ok: true }));
        `,
        'secret.ts': `
          router.post('/secret', jwtAuth, handler);
        `,
      },
      (dir) => {
        expect(runAudit(dir)).toHaveLength(0);
      }
    );
  });

  it('flags a mix: one protected, one unprotected', () => {
    withTempRoutes(
      {
        'mixed.ts': `
          router.get('/safe', jwtAuth, safeHandler);
          router.get('/unsafe', unsafeHandler);
        `,
      },
      (dir) => {
        const v = runAudit(dir);
        expect(v).toHaveLength(1);
        expect(v[0].path).toBe('/unsafe');
      }
    );
  });

  it('ignores router.use() calls', () => {
    withTempRoutes(
      {
        'mw.ts': `
          router.use('/api', someMiddleware);
          router.get('/real', jwtAuth, handler);
        `,
      },
      (dir) => {
        expect(runAudit(dir)).toHaveLength(0);
      }
    );
  });

  it('resolves spread of an auth-bearing alias array', () => {
    withTempRoutes(
      {
        'admin.ts': `
          const adminAuth = [jwtAuth, requireRole('admin')];
          router.get('/audit-log', ...adminAuth, handler);
        `,
      },
      (dir) => {
        expect(runAudit(dir)).toHaveLength(0);
      }
    );
  });

  it('respects file-level blanket router.use(apiKeyAuth)', () => {
    withTempRoutes(
      {
        'blanket.ts': `
          router.use(apiKeyAuth);
          router.get('/list', handler);
          router.post('/create', handler);
        `,
      },
      (dir) => {
        expect(runAudit(dir)).toHaveLength(0);
      }
    );
  });
});
