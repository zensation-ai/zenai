/**
 * Code Safety Validator Module
 *
 * Validates code for security risks before execution.
 * Uses pattern matching and AST-like analysis to detect:
 * - Forbidden imports/requires
 * - Dangerous function calls
 * - File system access outside /tmp
 * - Network access attempts
 * - Process spawning
 * - Code injection risks
 * - Path traversal attacks
 *
 * Security Note: The regex patterns in this file are intentionally used for security
 * validation. They process bounded code snippets (max 50KB). The detect-unsafe-regex
 * warnings are false positives - these patterns are simple and don't have ReDoS risks.
 *
 * @module services/code-execution/safety-validator
 */

/* eslint-disable security/detect-unsafe-regex */

import {
  SupportedLanguage,
  SafetyCheckResult,
  SafetyViolation,
  SafetyWarning,
  ViolationType,
  WarningType,
  MAX_CODE_LENGTH,
} from './types';

// ===========================================
// Pattern Definitions
// ===========================================

/**
 * Pattern definition with metadata
 */
interface SecurityPattern {
  pattern: RegExp;
  type: ViolationType;
  message: string;
  severity: 'critical' | 'high' | 'medium';
}

/**
 * Warning pattern definition
 */
interface WarningPattern {
  pattern: RegExp;
  type: WarningType;
  message: string;
  suggestion?: string;
}

// ===========================================
// Python Security Patterns
// ===========================================

const PYTHON_FORBIDDEN_PATTERNS: SecurityPattern[] = [
  // OS and System Access
  {
    pattern: /\bimport\s+os\b/,
    type: 'forbidden_import',
    message: 'Import of "os" module is forbidden (system access)',
    severity: 'critical',
  },
  {
    pattern: /\bfrom\s+os\s+import\b/,
    type: 'forbidden_import',
    message: 'Import from "os" module is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bimport\s+sys\b/,
    type: 'forbidden_import',
    message: 'Import of "sys" module is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bfrom\s+sys\s+import\b/,
    type: 'forbidden_import',
    message: 'Import from "sys" module is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bimport\s+subprocess\b/,
    type: 'process_spawn',
    message: 'subprocess module is forbidden (process spawning)',
    severity: 'critical',
  },
  {
    pattern: /\bimport\s+shutil\b/,
    type: 'file_system_access',
    message: 'shutil module is forbidden (file operations)',
    severity: 'critical',
  },
  {
    pattern: /\bimport\s+glob\b/,
    type: 'file_system_access',
    message: 'glob module is forbidden (file discovery)',
    severity: 'high',
  },
  {
    pattern: /\bimport\s+pathlib\b/,
    type: 'file_system_access',
    message: 'pathlib module is forbidden',
    severity: 'high',
  },

  // Network Access
  {
    pattern: /\bimport\s+socket\b/,
    type: 'network_access',
    message: 'socket module is forbidden (network access)',
    severity: 'critical',
  },
  {
    pattern: /\bimport\s+requests\b/,
    type: 'network_access',
    message: 'requests module is forbidden (HTTP access)',
    severity: 'critical',
  },
  {
    pattern: /\bimport\s+urllib\b/,
    type: 'network_access',
    message: 'urllib module is forbidden (network access)',
    severity: 'critical',
  },
  {
    pattern: /\bfrom\s+urllib\b/,
    type: 'network_access',
    message: 'urllib imports are forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bimport\s+http\b/,
    type: 'network_access',
    message: 'http module is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bimport\s+ftplib\b/,
    type: 'network_access',
    message: 'ftplib module is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bimport\s+smtplib\b/,
    type: 'network_access',
    message: 'smtplib module is forbidden',
    severity: 'critical',
  },

  // Code Injection
  {
    pattern: /\bexec\s*\(/,
    type: 'code_injection',
    message: 'exec() function is forbidden (code injection risk)',
    severity: 'critical',
  },
  {
    pattern: /\beval\s*\(/,
    type: 'code_injection',
    message: 'eval() function is forbidden (code injection risk)',
    severity: 'critical',
  },
  {
    pattern: /\b__import__\s*\(/,
    type: 'code_injection',
    message: '__import__() is forbidden (dynamic import)',
    severity: 'critical',
  },
  {
    pattern: /\bcompile\s*\(/,
    type: 'code_injection',
    message: 'compile() function is forbidden',
    severity: 'high',
  },
  {
    pattern: /\bgetattr\s*\([^,]+,\s*['"]/,
    type: 'code_injection',
    message: 'getattr() with string literal may be dangerous',
    severity: 'medium',
  },

  // File System Access (outside /tmp)
  {
    pattern: /open\s*\(\s*['"][^'"]*\/(?!tmp)[^'"]*['"]/,
    type: 'file_system_access',
    message: 'File access outside /tmp is forbidden',
    severity: 'critical',
  },
  {
    pattern: /open\s*\(\s*f?['"]\/(?!tmp)/,
    type: 'file_system_access',
    message: 'Absolute path access outside /tmp is forbidden',
    severity: 'critical',
  },

  // Path Traversal
  {
    pattern: /\.\.\//,
    type: 'path_traversal',
    message: 'Path traversal patterns (../) are forbidden',
    severity: 'critical',
  },
  {
    pattern: /\.\.\\/,
    type: 'path_traversal',
    message: 'Path traversal patterns (..\\) are forbidden',
    severity: 'critical',
  },
  {
    pattern: /~\//,
    type: 'path_traversal',
    message: 'Home directory access (~/) is forbidden',
    severity: 'critical',
  },

  // Environment Access
  {
    pattern: /os\.environ/,
    type: 'environment_access',
    message: 'Environment variable access is forbidden',
    severity: 'critical',
  },
  {
    pattern: /os\.getenv/,
    type: 'environment_access',
    message: 'Environment variable access is forbidden',
    severity: 'critical',
  },

  // Privilege Escalation
  {
    pattern: /\bimport\s+ctypes\b/,
    type: 'privilege_escalation',
    message: 'ctypes module is forbidden (native code execution)',
    severity: 'critical',
  },
  {
    pattern: /\bimport\s+multiprocessing\b/,
    type: 'process_spawn',
    message: 'multiprocessing is forbidden',
    severity: 'high',
  },
  {
    pattern: /\bimport\s+threading\b/,
    type: 'process_spawn',
    message: 'threading module is restricted',
    severity: 'medium',
  },
  {
    pattern: /\bimport\s+pickle\b/,
    type: 'code_injection',
    message: 'pickle module is forbidden (deserialization attacks)',
    severity: 'critical',
  },
];

const PYTHON_WARNING_PATTERNS: WarningPattern[] = [
  {
    pattern: /while\s+True\s*:/,
    type: 'infinite_loop_risk',
    message: 'Infinite loop detected (while True)',
    suggestion: 'Add a break condition or iteration limit',
  },
  {
    pattern: /while\s+1\s*:/,
    type: 'infinite_loop_risk',
    message: 'Infinite loop detected (while 1)',
    suggestion: 'Add a break condition or iteration limit',
  },
  {
    pattern: /for\s+\w+\s+in\s+range\s*\(\s*\d{7,}/,
    type: 'resource_intensive',
    message: 'Very large iteration count detected',
    suggestion: 'Consider reducing the iteration count',
  },
  {
    pattern: /time\.sleep\s*\(\s*\d{2,}/,
    type: 'slow_operation',
    message: 'Long sleep duration detected',
    suggestion: 'Keep sleep durations short',
  },
  {
    pattern: /print\s*\(\s*['"].*['"]\s*\*\s*\d{5,}/,
    type: 'large_output_risk',
    message: 'Large output generation detected',
    suggestion: 'Reduce output size',
  },
];

// ===========================================
// Node.js Security Patterns
// ===========================================

const NODEJS_FORBIDDEN_PATTERNS: SecurityPattern[] = [
  // Process Spawning
  {
    pattern: /require\s*\(\s*['"]child_process['"]\s*\)/,
    type: 'process_spawn',
    message: 'child_process module is forbidden',
    severity: 'critical',
  },
  {
    pattern: /require\s*\(\s*['"]cluster['"]\s*\)/,
    type: 'process_spawn',
    message: 'cluster module is forbidden',
    severity: 'critical',
  },
  {
    pattern: /require\s*\(\s*['"]worker_threads['"]\s*\)/,
    type: 'process_spawn',
    message: 'worker_threads module is forbidden',
    severity: 'high',
  },

  // Network Access
  {
    pattern: /require\s*\(\s*['"]net['"]\s*\)/,
    type: 'network_access',
    message: 'net module is forbidden (network access)',
    severity: 'critical',
  },
  {
    pattern: /require\s*\(\s*['"]dgram['"]\s*\)/,
    type: 'network_access',
    message: 'dgram module is forbidden (UDP)',
    severity: 'critical',
  },
  {
    pattern: /require\s*\(\s*['"]http['"]\s*\)/,
    type: 'network_access',
    message: 'http module is forbidden',
    severity: 'critical',
  },
  {
    pattern: /require\s*\(\s*['"]https['"]\s*\)/,
    type: 'network_access',
    message: 'https module is forbidden',
    severity: 'critical',
  },
  {
    pattern: /require\s*\(\s*['"]dns['"]\s*\)/,
    type: 'network_access',
    message: 'dns module is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bfetch\s*\(/,
    type: 'network_access',
    message: 'fetch() is forbidden (network access)',
    severity: 'critical',
  },

  // Code Injection
  {
    pattern: /\beval\s*\(/,
    type: 'code_injection',
    message: 'eval() function is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bFunction\s*\(/,
    type: 'code_injection',
    message: 'Function constructor is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bvm\s*\.\s*runIn/,
    type: 'code_injection',
    message: 'VM module execution is forbidden',
    severity: 'critical',
  },
  {
    pattern: /require\s*\(\s*['"]vm['"]\s*\)/,
    type: 'code_injection',
    message: 'vm module is forbidden',
    severity: 'critical',
  },

  // Environment Access
  {
    pattern: /process\.env/,
    type: 'environment_access',
    message: 'Environment variable access is forbidden',
    severity: 'critical',
  },
  {
    pattern: /process\.exit/,
    type: 'privilege_escalation',
    message: 'process.exit() is forbidden',
    severity: 'high',
  },
  {
    pattern: /process\.kill/,
    type: 'privilege_escalation',
    message: 'process.kill() is forbidden',
    severity: 'critical',
  },

  // File System (absolute paths outside /tmp)
  {
    pattern: /fs\.[a-zA-Z]+\s*\(\s*['"]\/(?!tmp)/,
    type: 'file_system_access',
    message: 'File access outside /tmp is forbidden',
    severity: 'critical',
  },
  {
    pattern: /readFileSync\s*\(\s*['"]\/(?!tmp)/,
    type: 'file_system_access',
    message: 'Reading files outside /tmp is forbidden',
    severity: 'critical',
  },
  {
    pattern: /writeFileSync\s*\(\s*['"]\/(?!tmp)/,
    type: 'file_system_access',
    message: 'Writing files outside /tmp is forbidden',
    severity: 'critical',
  },

  // Path Traversal
  {
    pattern: /\.\.\//,
    type: 'path_traversal',
    message: 'Path traversal patterns (../) are forbidden',
    severity: 'critical',
  },
  {
    pattern: /\.\.\\/,
    type: 'path_traversal',
    message: 'Path traversal patterns (..\\) are forbidden',
    severity: 'critical',
  },

  // Native Bindings
  {
    pattern: /require\s*\(\s*['"]ffi['"]\s*\)/,
    type: 'privilege_escalation',
    message: 'FFI module is forbidden',
    severity: 'critical',
  },
  {
    pattern: /require\s*\(\s*['"].*\.node['"]\s*\)/,
    type: 'privilege_escalation',
    message: 'Native addon loading is forbidden',
    severity: 'critical',
  },
];

const NODEJS_WARNING_PATTERNS: WarningPattern[] = [
  {
    pattern: /while\s*\(\s*true\s*\)/,
    type: 'infinite_loop_risk',
    message: 'Infinite loop detected (while(true))',
    suggestion: 'Add a break condition',
  },
  {
    pattern: /setInterval\s*\(/,
    type: 'infinite_loop_risk',
    message: 'setInterval may run indefinitely',
    suggestion: 'Use setTimeout or add cleanup',
  },
  {
    pattern: /\.repeat\s*\(\s*\d{6,}/,
    type: 'large_output_risk',
    message: 'Large string repetition detected',
    suggestion: 'Reduce repetition count',
  },
  {
    pattern: /Array\s*\(\s*\d{7,}/,
    type: 'resource_intensive',
    message: 'Very large array allocation',
    suggestion: 'Consider using smaller data structures',
  },
];

// ===========================================
// Bash Security Patterns
// ===========================================

const BASH_FORBIDDEN_PATTERNS: SecurityPattern[] = [
  // Network Commands
  {
    pattern: /\bcurl\s+/,
    type: 'network_access',
    message: 'curl command is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bwget\s+/,
    type: 'network_access',
    message: 'wget command is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bnc\s+|netcat\s+/,
    type: 'network_access',
    message: 'netcat is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bssh\s+/,
    type: 'network_access',
    message: 'ssh is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bscp\s+/,
    type: 'network_access',
    message: 'scp is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\brsync\s+/,
    type: 'network_access',
    message: 'rsync is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bftp\s+/,
    type: 'network_access',
    message: 'ftp is forbidden',
    severity: 'critical',
  },

  // Dangerous File Operations
  {
    pattern: /\brm\s+(-[rf]+\s+)?\/(?!tmp)/,
    type: 'file_system_access',
    message: 'Deleting files outside /tmp is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\brm\s+-rf\s+\//,
    type: 'file_system_access',
    message: 'Recursive deletion of root is forbidden',
    severity: 'critical',
  },
  {
    pattern: />\s*\/(?!tmp)/,
    type: 'file_system_access',
    message: 'Writing to paths outside /tmp is forbidden',
    severity: 'critical',
  },
  {
    pattern: />>\s*\/(?!tmp)/,
    type: 'file_system_access',
    message: 'Appending to paths outside /tmp is forbidden',
    severity: 'critical',
  },

  // Privilege Escalation
  {
    pattern: /\bsudo\s+/,
    type: 'privilege_escalation',
    message: 'sudo is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bsu\s+-/,
    type: 'privilege_escalation',
    message: 'su is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bchmod\s+/,
    type: 'privilege_escalation',
    message: 'chmod is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bchown\s+/,
    type: 'privilege_escalation',
    message: 'chown is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bmount\s+/,
    type: 'privilege_escalation',
    message: 'mount is forbidden',
    severity: 'critical',
  },

  // Sensitive Paths
  {
    pattern: /\/etc\//,
    type: 'file_system_access',
    message: 'Access to /etc is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\/var\//,
    type: 'file_system_access',
    message: 'Access to /var is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\/home\//,
    type: 'file_system_access',
    message: 'Access to /home is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\/root\//,
    type: 'file_system_access',
    message: 'Access to /root is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\/usr\//,
    type: 'file_system_access',
    message: 'Access to /usr is forbidden',
    severity: 'high',
  },

  // Code Injection
  {
    pattern: /\$\(/,
    type: 'code_injection',
    message: 'Command substitution $() is forbidden',
    severity: 'critical',
  },
  {
    pattern: /`[^`]+`/,
    type: 'code_injection',
    message: 'Backtick command substitution is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\beval\s+/,
    type: 'code_injection',
    message: 'eval is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\bsource\s+/,
    type: 'code_injection',
    message: 'source command is forbidden',
    severity: 'critical',
  },
  {
    pattern: /\.\s+\//,
    type: 'code_injection',
    message: 'Dot-sourcing is forbidden',
    severity: 'critical',
  },

  // Path Traversal
  {
    pattern: /\.\.\//,
    type: 'path_traversal',
    message: 'Path traversal patterns (../) are forbidden',
    severity: 'critical',
  },
  {
    pattern: /~\//,
    type: 'path_traversal',
    message: 'Home directory access (~/) is forbidden',
    severity: 'critical',
  },

  // Environment Variables
  {
    pattern: /\$\{?[A-Z_]+\}?/,
    type: 'environment_access',
    message: 'Environment variable access is restricted',
    severity: 'high',
  },
];

const BASH_WARNING_PATTERNS: WarningPattern[] = [
  {
    pattern: /while\s+true/,
    type: 'infinite_loop_risk',
    message: 'Infinite loop detected',
    suggestion: 'Add a break condition or iteration limit',
  },
  {
    pattern: /while\s+:/,
    type: 'infinite_loop_risk',
    message: 'Infinite loop detected (while :)',
    suggestion: 'Add a break condition',
  },
  {
    pattern: /sleep\s+\d{2,}/,
    type: 'slow_operation',
    message: 'Long sleep duration detected',
    suggestion: 'Keep sleep durations short (< 10s)',
  },
  {
    pattern: /yes\s+/,
    type: 'infinite_loop_risk',
    message: 'yes command may run indefinitely',
    suggestion: 'Pipe to head or add limit',
  },
];

// ===========================================
// Pattern Registry
// ===========================================

const FORBIDDEN_PATTERNS: Record<SupportedLanguage, SecurityPattern[]> = {
  python: PYTHON_FORBIDDEN_PATTERNS,
  nodejs: NODEJS_FORBIDDEN_PATTERNS,
  bash: BASH_FORBIDDEN_PATTERNS,
};

const WARNING_PATTERNS: Record<SupportedLanguage, WarningPattern[]> = {
  python: PYTHON_WARNING_PATTERNS,
  nodejs: NODEJS_WARNING_PATTERNS,
  bash: BASH_WARNING_PATTERNS,
};

// ===========================================
// Validator Implementation
// ===========================================

/**
 * Validate code for security risks
 *
 * @param code - The source code to validate
 * @param language - The programming language
 * @returns Safety check result with violations and warnings
 */
export function validateCode(
  code: string,
  language: SupportedLanguage
): SafetyCheckResult {
  const violations: SafetyViolation[] = [];
  const warnings: SafetyWarning[] = [];

  // Check code length
  if (code.length > MAX_CODE_LENGTH) {
    violations.push({
      type: 'code_injection',
      message: `Code exceeds maximum length (${code.length} > ${MAX_CODE_LENGTH})`,
    });
    return {
      safe: false,
      violations,
      warnings,
      score: 0,
    };
  }

  // Check for empty code
  if (!code.trim()) {
    return {
      safe: true,
      violations: [],
      warnings: [],
      score: 100,
    };
  }

  const lines = code.split('\n');

  // Check forbidden patterns
  const forbidden = FORBIDDEN_PATTERNS[language];
  for (const { pattern, type, message, severity: _severity } of forbidden) {
    if (pattern.test(code)) {
      // Find the line number
      let lineNum: number | undefined;
      let snippet: string | undefined;
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          lineNum = i + 1;
          snippet = lines[i].trim().slice(0, 80);
          break;
        }
      }

      violations.push({
        type,
        message,
        line: lineNum,
        snippet,
      });
    }
  }

  // Check warning patterns
  const warningPatterns = WARNING_PATTERNS[language];
  for (const { pattern, type, message, suggestion } of warningPatterns) {
    if (pattern.test(code)) {
      warnings.push({
        type,
        message,
        suggestion,
      });
    }
  }

  // Additional checks
  const lineCount = lines.length;
  if (lineCount > 500) {
    warnings.push({
      type: 'high_complexity',
      message: `Code has ${lineCount} lines - may be complex`,
      suggestion: 'Consider simplifying if possible',
    });
  }

  // Calculate safety score
  let score = 100;

  // Deduct for violations (critical = 50, high = 30, medium = 15)
  for (const violation of violations) {
    const severityMap: Record<string, number> = {
      critical: 50,
      high: 30,
      medium: 15,
    };
    // Find severity from original pattern
    const patternInfo = forbidden.find(p => p.type === violation.type);
    const penalty = patternInfo ? severityMap[patternInfo.severity] || 25 : 25;
    score -= penalty;
  }

  // Deduct for warnings (5 points each)
  score -= warnings.length * 5;

  // Ensure score is between 0 and 100
  score = Math.max(0, Math.min(100, score));

  return {
    safe: violations.length === 0,
    violations,
    warnings,
    score,
  };
}

/**
 * Quick check if code is likely safe (fast path)
 *
 * @param code - The source code to check
 * @param language - The programming language
 * @returns true if code passes quick safety check
 */
export function quickSafetyCheck(code: string, language: SupportedLanguage): boolean {
  if (code.length > MAX_CODE_LENGTH) {return false;}
  if (!code.trim()) {return true;}

  // Check only critical patterns for speed
  const forbidden = FORBIDDEN_PATTERNS[language];
  const criticalPatterns = forbidden.filter(p => p.severity === 'critical');

  for (const { pattern } of criticalPatterns) {
    if (pattern.test(code)) {
      return false;
    }
  }

  return true;
}

/**
 * Get a human-readable safety report
 *
 * @param result - The safety check result
 * @returns Formatted string report
 */
export function formatSafetyReport(result: SafetyCheckResult): string {
  const parts: string[] = [];

  if (result.safe) {
    parts.push(`✓ Code passed safety validation (Score: ${result.score}/100)`);
  } else {
    parts.push(`✗ Code FAILED safety validation (Score: ${result.score}/100)`);
  }

  if (result.violations.length > 0) {
    parts.push('\n🚫 Violations:');
    for (const v of result.violations) {
      const line = v.line ? ` (line ${v.line})` : '';
      const snippet = v.snippet ? `\n   Code: ${v.snippet}` : '';
      parts.push(`  - [${v.type}] ${v.message}${line}${snippet}`);
    }
  }

  if (result.warnings.length > 0) {
    parts.push('\n⚠️ Warnings:');
    for (const w of result.warnings) {
      const suggestion = w.suggestion ? ` → ${w.suggestion}` : '';
      parts.push(`  - [${w.type}] ${w.message}${suggestion}`);
    }
  }

  return parts.join('\n');
}

// ===========================================
// Exports for Testing
// ===========================================

export {
  PYTHON_FORBIDDEN_PATTERNS,
  NODEJS_FORBIDDEN_PATTERNS,
  BASH_FORBIDDEN_PATTERNS,
  FORBIDDEN_PATTERNS,
  WARNING_PATTERNS,
};
