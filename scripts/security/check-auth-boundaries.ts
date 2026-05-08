/**
 * check-auth-boundaries.ts — Sprint 1.4, Security Week 4
 *
 * Static-analysis linter that scans route files under `backend/src/routes/` and
 * flags any route that wires a handler without going through an auth middleware
 * first. Complements the runtime `auth-security.test.ts` integration tests by
 * catching regressions at commit time, before runtime.
 *
 * Heuristic (conservative):
 *   For every `router.<verb>('/path', ...)` / `app.<verb>('/path', ...)` call,
 *   inspect the middleware chain. If none of the entries match the configured
 *   AUTH_MIDDLEWARE allowlist AND the route is not on the PUBLIC_ALLOWLIST,
 *   it is reported as an unprotected boundary.
 *
 * Exit code:
 *   0 — no violations found
 *   1 — one or more violations (CI fails)
 *
 * Usage:
 *   npx tsx scripts/security/check-auth-boundaries.ts
 *   npx tsx scripts/security/check-auth-boundaries.ts --json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Names that count as an auth guard. Order-independent — we only need one
 * of these to appear in the middleware chain before the final handler.
 */
const AUTH_MIDDLEWARE = new Set([
  'jwtAuth',
  'apiKeyAuth',
  'requireAuth',
  'requireJwt',       // strict-JWT variant exported from jwt-auth.ts
  'requireJwtAuth',
  'optionalJwtAuth', // legitimately protects downstream `req.jwtUser`-gated logic
  'requireRole',
  'requireAdmin',
  'requireWorkspaceRole',
  'requirePlan',
  'webhookAuth',
  'adminKeyAuth',
]);

/**
 * Pre-existing unprotected routes that predate this audit.
 *
 * **Sprint 1.5 Item 4 (2026-04-19):** all 70 entries have been closed by adding
 * `router.use(apiKeyAuth)` (or equivalent per-route guard) to each affected
 * file. CI now runs in `--strict` mode, which makes the script exit 1 on ANY
 * unprotected route — legacy OR new. This set is intentionally left empty as
 * a tombstone: do NOT re-populate it to silence regressions. Fix the route.
 */
const LEGACY_UNPROTECTED_ROUTES: ReadonlySet<string> = new Set([]);

/**
 * Routes explicitly intended to be public. These are typically health checks,
 * OAuth callbacks, webhook endpoints with their own signature verification,
 * or well-known discovery documents.
 *
 * Entry format: `"<file-basename>:<METHOD> <path>"` — we match on substring.
 * Keep this list small; prefer wiring auth over expanding it.
 */
const PUBLIC_ALLOWLIST = [
  // Health + identity
  'health.ts',
  'core-routes.ts:GET /', // root redirect / static
  'agent-identity.ts:GET /.well-known',
  'a2a.ts:GET /.well-known',
  // Auth bootstrap (self-authenticating by definition)
  'auth.ts:POST /register',
  'auth.ts:POST /login',
  'auth.ts:POST /refresh',
  'auth.ts:GET /oauth',
  // Inbound webhooks (signature verification is the guard)
  'email-webhooks.ts',
  'billing.ts:POST /stripe/webhook',
  'billing.ts:POST /webhook',
  'integration-framework.ts:POST /:connectorId', // inbound webhook router, per-connector sig verify
  // OpenAPI / docs
  'api-docs',
  'openapi',
  // CSRF token issuer
  'csrf-token',
  // Project context health subroute (service availability probe, not data access)
  'project-context.ts:GET /health',
  // Social OAuth callbacks — invoked by external OAuth providers (Twitter /
  // LinkedIn) which cannot send an API key. Guarded by PKCE `state` token
  // verification inside the handler (`consumeOAuthState`).
  'social-oauth.ts:GET /twitter/callback',
  'social-oauth.ts:GET /linkedin/callback',
] as const;

interface Violation {
  file: string;
  line: number;
  method: string;
  path: string;
  chain: string[];
  legacy: boolean;
}

/**
 * Matches the START of a route call: `router.get('/path',`. The rest of the
 * argument list is captured by walking the source with balanced-paren logic,
 * because inline arrow-function handlers contain `(` and `)` and blow through
 * a naive regex.
 */
const ROUTE_CALL_START_RE =
  /(?:router|app)\.(get|post|put|patch|delete|options|use)\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g;

function isAllowlisted(file: string, method: string, routePath: string): boolean {
  const base = path.basename(file);
  const label = `${base}:${method.toUpperCase()} ${routePath}`;
  return PUBLIC_ALLOWLIST.some((allow) => label.includes(allow) || base === allow);
}

function extractChain(raw: string): string[] {
  // Strip whitespace + split on commas that are not inside parentheses.
  const depth: { p: number; b: number; s: number } = { p: 0, b: 0, s: 0 };
  const tokens: string[] = [];
  let buf = '';
  for (const ch of raw) {
    if (ch === '(') depth.p++;
    else if (ch === ')') depth.p--;
    else if (ch === '[') depth.b++;
    else if (ch === ']') depth.b--;
    else if (ch === '{') depth.s++;
    else if (ch === '}') depth.s--;
    if (ch === ',' && depth.p === 0 && depth.b === 0 && depth.s === 0) {
      tokens.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) tokens.push(buf.trim());
  return tokens;
}

function hasAuth(chain: string[], authAliases: Set<string>): boolean {
  for (const token of chain) {
    // Grab the leading identifier (before `(` or whitespace).
    const match = token.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/);
    if (match && AUTH_MIDDLEWARE.has(match[1])) {return true;}
    // Common inline pattern: requireWorkspaceRole('admin') — factory call.
    const callMatch = token.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (callMatch && AUTH_MIDDLEWARE.has(callMatch[1])) {return true;}
    // Spread of a local const that is an auth-bearing middleware array, e.g.
    //   const adminAuth = [jwtAuth, requireRole('admin')];
    //   router.get('/x', ...adminAuth, handler)
    const spreadMatch = token.match(/^\s*\.\.\.\s*([A-Za-z_][A-Za-z0-9_]*)/);
    if (spreadMatch && authAliases.has(spreadMatch[1])) {return true;}
  }
  return false;
}

/**
 * Scan the source for `const X = [..., auth-mw, ...]` declarations and return
 * the names of any const whose array literal contains at least one auth
 * middleware. Used to resolve spread expressions like `...adminAuth` back to
 * a concrete auth guard.
 */
function collectAuthAliases(src: string): Set<string> {
  const aliases = new Set<string>();
  const re = /\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=]+)?=\s*\[([^\]]*)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const [, name, body] = match;
    const tokens = body.split(',').map((t) => t.trim());
    for (const token of tokens) {
      const identMatch = token.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
      if (identMatch && AUTH_MIDDLEWARE.has(identMatch[1])) {
        aliases.add(name);
        break;
      }
      const callMatch = token.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (callMatch && AUTH_MIDDLEWARE.has(callMatch[1])) {
        aliases.add(name);
        break;
      }
    }
  }
  return aliases;
}

/**
 * Given a source string and the index just past the opening `(` of a route
 * call, scan forward with balanced-paren logic and return the exact substring
 * of the remaining arguments (everything up to but not including the matching
 * outer `)`). Aware of strings, template literals, and /* *\/ comments so the
 * depth counter stays honest.
 */
function readBalancedArgs(src: string, startIndex: number): { body: string; endIndex: number } | null {
  let depth = 1; // we start already one `(` deep
  let i = startIndex;
  let inString: '"' | "'" | '`' | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch as '"' | "'" | '`';
      i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return { body: src.slice(startIndex, i), endIndex: i };
      }
    }
    i++;
  }
  return null;
}

/**
 * Detect whether a file installs a blanket auth guard via
 * `router.use(apiKeyAuth)` (or any other entry in AUTH_MIDDLEWARE) before any
 * routes are declared. If so, all leaf routes in the file are considered
 * protected and we skip per-route analysis.
 *
 * Conservative: we only recognize the blanket when the `router.use(X)` call
 * uses a *single* argument that is in AUTH_MIDDLEWARE. `router.use(path, X)`
 * and array-of-middleware forms require per-route review.
 */
function hasFileLevelAuth(src: string): boolean {
  const useRe = /(?:router|app)\.use\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = useRe.exec(src))) {
    const [, name] = match;
    if (AUTH_MIDDLEWARE.has(name)) {
      return true;
    }
  }
  return false;
}

function auditFile(file: string): Violation[] {
  const src = fs.readFileSync(file, 'utf-8');
  if (hasFileLevelAuth(src)) {
    return []; // blanket `router.use(authMiddleware)` protects every route below
  }
  const authAliases = collectAuthAliases(src);
  const violations: Violation[] = [];
  let match: RegExpExecArray | null;
  ROUTE_CALL_START_RE.lastIndex = 0;
  while ((match = ROUTE_CALL_START_RE.exec(src))) {
    const [whole, method, routePath] = match;
    if (method === 'use') continue; // router.use() is mounting, not a leaf route
    if (isAllowlisted(file, method, routePath)) continue;

    const argStart = match.index + whole.length;
    const balanced = readBalancedArgs(src, argStart);
    if (!balanced) continue;
    const chainRaw = balanced.body;

    const chain = extractChain(chainRaw);
    if (chain.length < 1) continue;
    // The final element is the handler; everything before is the middleware chain.
    const middlewareChain = chain.slice(0, -1);

    if (!hasAuth(middlewareChain, authAliases)) {
      const line = src.slice(0, match.index).split('\n').length;
      const key = `${path.basename(file)}:${method.toUpperCase()} ${routePath}`;
      const legacy = LEGACY_UNPROTECTED_ROUTES.has(key);
      violations.push({ file, line, method, path: routePath, chain, legacy });
    }
  }
  return violations;
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
}

export function runAudit(rootDir: string): Violation[] {
  const files: string[] = [];
  walk(rootDir, files);
  const violations: Violation[] = [];
  for (const file of files) {
    violations.push(...auditFile(file));
  }
  return violations;
}

function main(): void {
  const json = process.argv.includes('--json');
  const strict = process.argv.includes('--strict');
  const root = path.resolve(process.cwd(), 'backend/src/routes');
  if (!fs.existsSync(root)) {
    console.error(`[check-auth-boundaries] Routes directory not found: ${root}`);
    process.exit(2);
  }
  const all = runAudit(root);
  const newViolations = all.filter((v) => !v.legacy);
  const legacyViolations = all.filter((v) => v.legacy);

  if (json) {
    console.log(
      JSON.stringify(
        {
          newViolations,
          legacyViolations,
          newCount: newViolations.length,
          legacyCount: legacyViolations.length,
        },
        null,
        2
      )
    );
  } else {
    if (newViolations.length === 0 && legacyViolations.length === 0) {
      console.log('[check-auth-boundaries] ✅ No unprotected routes detected.');
    }
    if (legacyViolations.length > 0) {
      console.log(
        `[check-auth-boundaries] ⚠️  ${legacyViolations.length} pre-existing unprotected route(s) ` +
          `(tracked in docs/SPRINT-BACKLOG.md):`
      );
      for (const v of legacyViolations) {
        const rel = path.relative(process.cwd(), v.file);
        console.log(`  ${rel}:${v.line}  ${v.method.toUpperCase()} ${v.path}`);
      }
    }
    if (newViolations.length > 0) {
      console.error(
        `\n[check-auth-boundaries] ❌ Found ${newViolations.length} NEW unprotected route(s):`
      );
      for (const v of newViolations) {
        const rel = path.relative(process.cwd(), v.file);
        console.error(`  ${rel}:${v.line}  ${v.method.toUpperCase()} ${v.path}`);
      }
      console.error(
        '\nHint: add an auth middleware (jwtAuth, apiKeyAuth, requireRole, ...) ' +
          'before the route handler, or add the route to PUBLIC_ALLOWLIST in this script ' +
          'if it is deliberately public.'
      );
    }
  }

  // In --strict mode, any unprotected route (legacy or new) fails CI.
  // In default mode, only NEW unprotected routes fail — legacy routes are
  // tracked in backlog and don't regress the build.
  const failCount = strict ? all.length : newViolations.length;
  process.exit(failCount > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}
