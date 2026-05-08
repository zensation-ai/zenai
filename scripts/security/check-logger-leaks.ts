/**
 * check-logger-leaks.ts — Sprint 1.4, Security Week 4
 *
 * Static linter: scans backend source for logger call sites that pass
 * user-sensitive field names directly into the context payload without going
 * through the sanitizer pipeline. Catches the "I logged `password: req.body.password`"
 * class of mistake.
 *
 * Heuristic:
 *   - Find `logger.(debug|info|warn|error)(...)` call sites.
 *   - Check the second argument (context object literal) for risky keys.
 *   - Risky keys: `password`, `token`, `authorization`, `secret`, `cookie`,
 *     `client_secret`, `api_key`, `mfa_secret`, and their camelCase variants.
 *   - Log keys literally named the above are scrubbed at runtime (the logger
 *     does redact them), but still a code-review smell — you likely meant to
 *     log something else. We mark them as ⚠ warnings, not errors.
 *   - `console.log` / `console.error` with any of the risky substrings are
 *     reported as errors (they bypass the logger entirely).
 *
 * Exit code:
 *   0 — clean
 *   1 — one or more errors (console.* with sensitive content)
 *   Warnings do NOT fail the build.
 *
 * Usage:
 *   npx tsx scripts/security/check-logger-leaks.ts
 *   npx tsx scripts/security/check-logger-leaks.ts --json
 *   npx tsx scripts/security/check-logger-leaks.ts --strict  # warnings fail too
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const RISKY_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'mfa_secret',
  'mfaSecret',
  'totp_secret',
  'private_key',
  'privateKey',
  'client_secret',
  'clientSecret',
];

interface Finding {
  file: string;
  line: number;
  level: 'error' | 'warning';
  rule: string;
  snippet: string;
}

const LOGGER_CALL_RE =
  /logger\.(debug|info|warn|error)\s*\(\s*(?:[^,]+),\s*(\{[\s\S]*?\})/g;
const CONSOLE_CALL_RE = /console\.(log|error|warn|info|debug)\s*\(([^)]*)\)/g;

function scanFile(file: string): Finding[] {
  const src = fs.readFileSync(file, 'utf-8');
  const findings: Finding[] = [];

  // logger.*({...}) — check keys in the context object literal
  let m: RegExpExecArray | null;
  LOGGER_CALL_RE.lastIndex = 0;
  while ((m = LOGGER_CALL_RE.exec(src))) {
    const [full, _level, objLiteral] = m;
    const line = src.slice(0, m.index).split('\n').length;
    for (const key of RISKY_KEYS) {
      // Look for `key:` at object-key position (not inside a string).
      const keyRe = new RegExp(`(^|[{,\\s])${key}\\s*:`, 'm');
      if (keyRe.test(objLiteral)) {
        findings.push({
          file,
          line,
          level: 'warning',
          rule: `logger-key-${key}`,
          snippet: full.slice(0, 120).replace(/\s+/g, ' '),
        });
      }
    }
  }

  // console.*(...) — any risky substring is a hard error.
  CONSOLE_CALL_RE.lastIndex = 0;
  while ((m = CONSOLE_CALL_RE.exec(src))) {
    const [full, _method, args] = m;
    // Skip test files' setup redirects (jest.fn mocks).
    if (/jest\.fn|jest\.spyOn|mockImplementation/.test(args)) continue;

    for (const key of RISKY_KEYS) {
      if (
        args.toLowerCase().includes(`${key.toLowerCase()}`) &&
        !args.includes('REDACTED')
      ) {
        const line = src.slice(0, m.index).split('\n').length;
        findings.push({
          file,
          line,
          level: 'error',
          rule: `console-${key}`,
          snippet: full.slice(0, 120).replace(/\s+/g, ' '),
        });
        break; // one finding per call-site
      }
    }
  }

  return findings;
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      if (entry.name.endsWith('.d.ts')) continue;
      out.push(full);
    }
  }
}

export function runAudit(rootDir: string): Finding[] {
  const files: string[] = [];
  walk(rootDir, files);
  const findings: Finding[] = [];
  for (const file of files) {
    findings.push(...scanFile(file));
  }
  return findings;
}

function main(): void {
  const json = process.argv.includes('--json');
  const strict = process.argv.includes('--strict');
  const root = path.resolve(process.cwd(), 'backend/src');
  if (!fs.existsSync(root)) {
    console.error(`[check-logger-leaks] Source directory not found: ${root}`);
    process.exit(2);
  }
  const findings = runAudit(root);
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');

  if (json) {
    console.log(JSON.stringify({ errors, warnings }, null, 2));
  } else {
    if (errors.length === 0 && warnings.length === 0) {
      console.log('[check-logger-leaks] ✅ No logger leak patterns detected.');
    } else {
      if (errors.length > 0) {
        console.error(`[check-logger-leaks] ❌ ${errors.length} error(s):`);
        for (const f of errors) {
          const rel = path.relative(process.cwd(), f.file);
          console.error(`  ${rel}:${f.line}  [${f.rule}] ${f.snippet}`);
        }
      }
      if (warnings.length > 0) {
        console.warn(`[check-logger-leaks] ⚠ ${warnings.length} warning(s):`);
        for (const f of warnings.slice(0, 50)) {
          const rel = path.relative(process.cwd(), f.file);
          console.warn(`  ${rel}:${f.line}  [${f.rule}] ${f.snippet}`);
        }
        if (warnings.length > 50) {
          console.warn(`  ... (${warnings.length - 50} more suppressed)`);
        }
      }
    }
  }

  const fail = errors.length > 0 || (strict && warnings.length > 0);
  process.exit(fail ? 1 : 0);
}

if (require.main === module) {
  main();
}
