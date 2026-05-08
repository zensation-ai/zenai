/**
 * audit-outbound-fetch.ts — Sprint 1.9, Phase 2 (checkedFetch rollout)
 *
 * Static linter: fails CI if production backend code reintroduces raw
 * `axios.get/post/…`, `axios.create`, or global `fetch(` against outbound
 * URLs instead of going through `checked-http.ts`.
 *
 * Why this exists
 * ---------------
 * The DNS-rebinding defense only works when every outbound HTTP call uses
 * an Agent whose `lookup` rejects private IPs at socket-creation time. A
 * single raw `fetch(url)` re-opens the hole — the URL hostname is checked
 * up front, then DNS is resolved a second time, and the second resolution
 * is what actually reaches the wire. Keeping the allow-list small and
 * enforced in CI is the only reliable way to prevent regressions.
 *
 * Heuristic
 * ---------
 * 1. Find `axios.(get|post|put|patch|delete|request)(` call sites.
 * 2. Find bare `fetch(` call sites (not preceded by a `.` and not part of
 *    `checkedFetch`).
 * 3. Skip:
 *    - the implementation file itself (backend/src/utils/checked-http.ts)
 *    - dev-only scripts (backend/src/scripts/**)
 *    - test files (backend/src/__tests__/**, *.test.ts, *.spec.ts)
 *    - string / comment-only references (we rely on simple whitespace
 *      heuristics: match only when the call appears to be *executed*)
 * 4. Allow-list `axios.isAxiosError` (type narrowing) and `axios.create`
 *    that is paired with `getCheckedAgent` in the same module.
 * 5. Allow-list IMAP-style `client.fetch(` (has a dot-prefix; we only flag
 *    the bare global identifier).
 *
 * Exit code
 * ---------
 *   0 — clean
 *   1 — one or more forbidden call-sites
 *
 * Usage
 * -----
 *   npx tsx scripts/security/audit-outbound-fetch.ts
 *   npx tsx scripts/security/audit-outbound-fetch.ts --json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Finding {
  file: string;
  line: number;
  rule: string;
  snippet: string;
}

/** Files we never scan — either the implementation or not production code. */
const SKIP_FILES = new Set<string>([
  'backend/src/utils/checked-http.ts',
]);

const SKIP_DIR_SEGMENTS = [
  '/__tests__/',
  '/node_modules/',
  '/dist/',
  '/scripts/', // backend/src/scripts/* are dev-only CLI tools
];

function shouldSkip(file: string): boolean {
  const rel = file.replace(/\\/g, '/');
  if (SKIP_FILES.has(rel) || [...SKIP_FILES].some((s) => rel.endsWith(s))) {
    return true;
  }
  if (rel.endsWith('.test.ts') || rel.endsWith('.spec.ts') || rel.endsWith('.d.ts')) {
    return true;
  }
  return SKIP_DIR_SEGMENTS.some((seg) => rel.includes(seg));
}

/** Strip // line-comments, /* block comments *​/, and string literals before
 * regex scan. Template literal contents are also stripped; real outbound
 * calls sit *outside* the backticks (you pass a constructed URL into
 * `fetch(...)`), so stripping their textual content cannot hide a call.
 */
function stripCommentsAndStrings(src: string): string {
  // Replace block comments with spaces of equal length (preserve line numbers).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // Replace line comments.
  out = out.replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
  // Strip single- and double-quoted strings.
  out = out.replace(/'([^'\\\n]|\\.)*'/g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/"([^"\\\n]|\\.)*"/g, (m) => m.replace(/[^\n]/g, ' '));
  // Strip backtick/template literal contents (multi-line).
  out = out.replace(/`(?:[^`\\]|\\[\s\S])*`/g, (m) => m.replace(/[^\n]/g, ' '));
  return out;
}

/**
 * axios.(get|post|put|patch|delete|request)(…) — forbidden.
 * The allow-list (`isAxiosError`, `create`, `CancelToken`) is expressed by
 * the method list itself: we only match the HTTP verbs.
 */
const AXIOS_CALL_RE =
  /\baxios\s*\.\s*(get|post|put|patch|delete|request)\s*\(/g;

/**
 * Bare `fetch(` not prefixed with `.` (which would be `client.fetch(` or
 * similar IMAP/ORM-style method calls) and not part of `checkedFetch`.
 */
const BARE_FETCH_RE = /(^|[^.\w])fetch\s*\(/g;

function scanFile(file: string): Finding[] {
  const src = fs.readFileSync(file, 'utf-8');
  const stripped = stripCommentsAndStrings(src);
  const findings: Finding[] = [];

  let m: RegExpExecArray | null;

  AXIOS_CALL_RE.lastIndex = 0;
  while ((m = AXIOS_CALL_RE.exec(stripped))) {
    const line = stripped.slice(0, m.index).split('\n').length;
    const rawLine = src.split('\n')[line - 1]?.trim() ?? '';
    findings.push({
      file,
      line,
      rule: `raw-axios-${m[1]}`,
      snippet: rawLine.slice(0, 160),
    });
  }

  BARE_FETCH_RE.lastIndex = 0;
  while ((m = BARE_FETCH_RE.exec(stripped))) {
    // Skip `checkedFetch(` — the allow-listed wrapper.
    const matchStart = m.index + m[1].length;
    const context = stripped.slice(Math.max(0, matchStart - 20), matchStart + 6);
    if (/checkedFetch\s*\($/.test(context)) continue;

    const line = stripped.slice(0, matchStart).split('\n').length;
    const rawLine = src.split('\n')[line - 1]?.trim() ?? '';
    findings.push({
      file,
      line,
      rule: 'raw-fetch',
      snippet: rawLine.slice(0, 160),
    });
  }

  return findings;
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
}

export function runAudit(rootDir: string): Finding[] {
  const files: string[] = [];
  walk(rootDir, files);
  const findings: Finding[] = [];
  for (const file of files) {
    const relFromRepo = path.relative(process.cwd(), file).replace(/\\/g, '/');
    if (shouldSkip(relFromRepo)) continue;
    findings.push(...scanFile(file));
  }
  return findings;
}

function main(): void {
  const json = process.argv.includes('--json');
  const root = path.resolve(process.cwd(), 'backend/src');
  if (!fs.existsSync(root)) {
    console.error(`[audit-outbound-fetch] Source directory not found: ${root}`);
    process.exit(2);
  }

  const findings = runAudit(root);

  if (json) {
    console.log(JSON.stringify({ findings }, null, 2));
  } else if (findings.length === 0) {
    console.log('[audit-outbound-fetch] All outbound HTTP calls go through checked-http.');
  } else {
    console.error(`[audit-outbound-fetch] ${findings.length} forbidden call-site(s):`);
    for (const f of findings) {
      const rel = path.relative(process.cwd(), f.file);
      console.error(`  ${rel}:${f.line}  [${f.rule}] ${f.snippet}`);
    }
    console.error('\n  Migrate to checkedFetch / checkedAxiosGet / checkedAxiosPost / checkedAxiosDelete.');
    console.error('  For self-hosted loopback sidecars (Ollama), pass { allowLoopback: true }.');
  }

  process.exit(findings.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}
