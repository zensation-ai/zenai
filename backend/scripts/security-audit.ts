/**
 * Phase 80: Security Audit Script
 *
 * Scans all route and service files for:
 * 1. queryContext calls missing user_id in WHERE clause
 * 2. SQL injection risks (string concatenation in SQL)
 *
 * Usage: cd backend && npx ts-node scripts/security-audit.ts
 * Output: backend/security-audit-report.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// Types
// ============================================================

interface QueryFinding {
  file: string;
  line: number;
  sql: string;
  issue: 'missing_user_id' | 'string_concatenation' | 'template_literal_interpolation';
  severity: 'critical' | 'warning' | 'info';
  context: string; // surrounding code
}

interface AuditReport {
  timestamp: string;
  scannedFiles: number;
  totalQueryContextCalls: number;
  findings: QueryFinding[];
  summary: {
    critical: number;
    warning: number;
    info: number;
    missingUserId: number;
    sqlInjectionRisks: number;
  };
  // Files with 100% compliant queries
  compliantFiles: string[];
}

// ============================================================
// Configuration
// ============================================================

const BACKEND_SRC = path.join(__dirname, '..', 'src');
const ROUTES_DIR = path.join(BACKEND_SRC, 'routes');
const SERVICES_DIR = path.join(BACKEND_SRC, 'services');
const OUTPUT_FILE = path.join(__dirname, '..', 'security-audit-report.json');

// Queries that legitimately don't need user_id filtering:
// - Schema introspection (information_schema, pg_tables)
// - System-wide lookups (api_keys, users table in public schema)
// - Aggregate/admin queries
// - DDL statements (CREATE, ALTER, DROP)
// - Health checks
const USER_ID_EXEMPTION_PATTERNS = [
  /information_schema/i,
  /pg_tables/i,
  /pg_trgm/i,
  /pg_extension/i,
  /set\s+search_path/i,
  /set_config/i,
  /CREATE\s+(TABLE|INDEX|EXTENSION)/i,
  /ALTER\s+TABLE/i,
  /DROP\s+(TABLE|INDEX)/i,
  /api_keys/i,
  /^SELECT\s+1\b/i,    // health check queries
  /SELECT\s+NOW\(\)/i,
  /SHOW\s+/i,
  /^INSERT\s+INTO\s+public\./i,  // public schema tables (users, sessions)
  /users\b/i,            // user management queries
  /user_sessions/i,
  /oauth_states/i,
  /resend_webhook_log/i,
  /audit_log/i,          // audit is system-wide
  /security_audit_log/i,
  /rate_limit/i,
  /job_history/i,
  /metric_snapshots/i,
  /extensions\b/i,       // extension registry
  /installed_extensions/i,
  /agent_identities/i,   // agent config is system-wide
  /agent_workflows/i,
  /agent_workflow_runs/i,
  /ai_traces/i,
  /ai_spans/i,
];

// SELECT queries that are genuinely read-only system lookups
const READONLY_SYSTEM_PATTERNS = [
  /^SELECT\s+\*\s+FROM\s+pg_/i,
  /^SELECT\s+COUNT\(\*\)\s+FROM\s+\w+\s*$/i, // bare count without WHERE
];

// ============================================================
// Helpers
// ============================================================

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function isExemptFromUserId(sql: string): boolean {
  return USER_ID_EXEMPTION_PATTERNS.some(p => p.test(sql));
}

function isReadOnlySystemQuery(sql: string): boolean {
  return READONLY_SYSTEM_PATTERNS.some(p => p.test(sql));
}

/**
 * Extract SQL string from a queryContext call.
 * Handles multi-line template literals and string concatenation.
 */
function extractQueryContextCalls(content: string, filePath: string): Array<{
  line: number;
  sql: string;
  fullMatch: string;
  hasUserIdParam: boolean;
  hasStringConcat: boolean;
  hasTemplateLiteralInterpolation: boolean;
}> {
  const results: Array<{
    line: number;
    sql: string;
    fullMatch: string;
    hasUserIdParam: boolean;
    hasStringConcat: boolean;
    hasTemplateLiteralInterpolation: boolean;
  }> = [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find lines containing queryContext(
    if (!line.includes('queryContext(') && !line.includes('queryContext (')) continue;

    // Gather context: grab up to 15 lines after the queryContext call
    const contextLines = lines.slice(i, Math.min(i + 15, lines.length)).join('\n');

    // Try to extract the SQL argument (second argument to queryContext)
    // Pattern: queryContext(context, `...`, [...])
    // or: queryContext(context, '...', [...])
    // or: queryContext(context, "...", [...])

    // Find balanced parentheses to get the full call
    let depth = 0;
    let startIdx = -1;
    let fullCall = '';

    for (let j = i; j < Math.min(i + 20, lines.length); j++) {
      for (let k = 0; k < lines[j].length; k++) {
        const ch = lines[j][k];
        if (ch === '(' && startIdx === -1 && lines[j].substring(Math.max(0, k - 20), k).includes('queryContext')) {
          startIdx = k;
          depth = 1;
        } else if (startIdx !== -1) {
          if (ch === '(') depth++;
          if (ch === ')') depth--;
          if (depth === 0) {
            fullCall = lines.slice(i, j + 1).join('\n');
            break;
          }
        }
      }
      if (fullCall) break;
    }

    if (!fullCall) {
      fullCall = contextLines;
    }

    // Extract SQL string - look for the second argument
    const sqlMatch = fullCall.match(/queryContext\s*\([^,]+,\s*(`[^`]*`|'[^']*'|"[^"]*")/s);
    const sql = sqlMatch ? sqlMatch[1].replace(/^[`'"]/,'').replace(/[`'"]$/,'') : fullCall;

    // Check for user_id in the SQL or params
    const hasUserIdInSQL = /user_id/i.test(fullCall);

    // Check for string concatenation in SQL: '+' used to build SQL
    const hasStringConcat = /queryContext\s*\([^,]+,\s*[^`]*\+/.test(fullCall) ||
      /\+\s*['"].*(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM|SET)/i.test(fullCall);

    // Check for template literal interpolation: ${...} in backtick strings
    const templateLiteralMatch = fullCall.match(/queryContext\s*\([^,]+,\s*`([^`]*)`/s);
    const hasTemplateLiteralInterpolation = templateLiteralMatch
      ? /\$\{(?!.*\bschema\b)/.test(templateLiteralMatch[1]) // ${schema} is acceptable
      : false;

    results.push({
      line: i + 1,
      sql: sql.substring(0, 200),
      fullMatch: fullCall.substring(0, 300),
      hasUserIdParam: hasUserIdInSQL,
      hasStringConcat,
      hasTemplateLiteralInterpolation,
    });
  }

  return results;
}

// ============================================================
// Main Audit
// ============================================================

function runAudit(): AuditReport {
  const routeFiles = getAllTsFiles(ROUTES_DIR);
  const serviceFiles = getAllTsFiles(SERVICES_DIR);
  const allFiles = [...routeFiles, ...serviceFiles];

  const findings: QueryFinding[] = [];
  const compliantFiles: string[] = [];
  let totalCalls = 0;

  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(path.join(__dirname, '..'), filePath);

    // Skip if file doesn't use queryContext
    if (!content.includes('queryContext')) continue;

    const calls = extractQueryContextCalls(content, filePath);
    totalCalls += calls.length;

    let fileHasFindings = false;

    for (const call of calls) {
      // 1. Check for missing user_id
      if (!call.hasUserIdParam && !isExemptFromUserId(call.sql) && !isReadOnlySystemQuery(call.sql)) {
        // Determine if this is a write query (more severe) or read query
        const isWrite = /INSERT|UPDATE|DELETE/i.test(call.sql);
        findings.push({
          file: relativePath,
          line: call.line,
          sql: call.sql,
          issue: 'missing_user_id',
          severity: isWrite ? 'critical' : 'warning',
          context: call.fullMatch.substring(0, 200),
        });
        fileHasFindings = true;
      }

      // 2. Check for SQL injection: string concatenation
      if (call.hasStringConcat) {
        findings.push({
          file: relativePath,
          line: call.line,
          sql: call.sql,
          issue: 'string_concatenation',
          severity: 'critical',
          context: call.fullMatch.substring(0, 200),
        });
        fileHasFindings = true;
      }

      // 3. Check for template literal interpolation (potential SQL injection)
      if (call.hasTemplateLiteralInterpolation) {
        findings.push({
          file: relativePath,
          line: call.line,
          sql: call.sql,
          issue: 'template_literal_interpolation',
          severity: 'warning',
          context: call.fullMatch.substring(0, 200),
        });
        fileHasFindings = true;
      }
    }

    if (!fileHasFindings && calls.length > 0) {
      compliantFiles.push(relativePath);
    }
  }

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    scannedFiles: allFiles.length,
    totalQueryContextCalls: totalCalls,
    findings,
    summary: {
      critical: findings.filter(f => f.severity === 'critical').length,
      warning: findings.filter(f => f.severity === 'warning').length,
      info: findings.filter(f => f.severity === 'info').length,
      missingUserId: findings.filter(f => f.issue === 'missing_user_id').length,
      sqlInjectionRisks: findings.filter(f =>
        f.issue === 'string_concatenation' || f.issue === 'template_literal_interpolation'
      ).length,
    },
    compliantFiles,
  };

  return report;
}

// ============================================================
// Execute
// ============================================================

const report = runAudit();

// Write JSON report
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));

// Console summary
console.log('\n=== ZenAI Security Audit Report ===\n');
console.log(`Scanned: ${report.scannedFiles} files`);
console.log(`Total queryContext calls: ${report.totalQueryContextCalls}`);
console.log(`Compliant files: ${report.compliantFiles.length}`);
console.log('');
console.log(`Findings:`);
console.log(`  Critical: ${report.summary.critical}`);
console.log(`  Warning:  ${report.summary.warning}`);
console.log(`  Info:     ${report.summary.info}`);
console.log('');
console.log(`  Missing user_id:    ${report.summary.missingUserId}`);
console.log(`  SQL injection risks: ${report.summary.sqlInjectionRisks}`);
console.log('');

if (report.findings.length > 0) {
  console.log('--- Critical/Warning Findings ---\n');
  for (const f of report.findings.filter(f => f.severity !== 'info')) {
    console.log(`  [${f.severity.toUpperCase()}] ${f.file}:${f.line}`);
    console.log(`    Issue: ${f.issue}`);
    console.log(`    SQL: ${f.sql.substring(0, 100)}`);
    console.log('');
  }
}

console.log(`\nFull report written to: ${OUTPUT_FILE}`);
process.exit(report.summary.critical > 0 ? 1 : 0);
